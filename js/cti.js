/*
cti.js

This Javascript library is used to deals with long-polling requests from "https://events.voip.ovh.net" URL. It also contains angularJS 
controller for the CTI dashboard and basic javascript timer functions to count live call duration.

License :
MIT 

*/

var timer;

function timerFunc() {
    timer = setInterval(timerEvent, 1000);
}

function timerEvent() {
    var fieldsToUpdate = $("[name=fieldToUpdate]");

    //    var ts2 = Date().getTime();
    //    console.log(ts2);

    for (var i = 0; i < fieldsToUpdate.length; i++) {
        $(fieldsToUpdate[i]).html(parseInt($(fieldsToUpdate[i]).html()) + 1);
    }


    var scope = angular.element('[ng-controller=mainController]').scope()

    if (scope.reinitAuto) {
        var now = new Date();
        if ((now.getTime() - now.setHours(0, 0, 0, 0)) < 10) {
            var jsonNumbers = JSON.stringify({});
            localStorage.setItem(scope.token + "-numbers", jsonNumbers)
            scope.notify = "Les options de cache ont été réinitialisées.";
            scope.login();
        }
    }
}

function gup(name) {

    name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
    var regexS = "[\\?&]" + name + "=([^&#]*)";
    var regex = new RegExp(regexS);
    var results = regex.exec(window.location.href);
    if (results == null) {
        return "";
    }
    else {
        return results[1];
    }
}


var ctiApp = angular.module('ctiApp', []);

ctiApp.controller('mainController', function ($scope, $location) {
    $scope.status = "idle";
    $scope.session = "";
    $scope.token = "";
    $scope.logged = false;
    $scope.page = false;
    $scope.pagename = "Vue d'ensemble";
    $scope.cgiPath = "";
    $scope.hideSL = 0;
    $scope.reinitAuto = false;
    $scope.cgiSet = 0;
    $scope.calls = [];
    $scope.lastEvents = [];
    $scope.lastHuntingEvents = [];
    $scope.notify = "";
    $scope.number = "";
    $scope.numbersize = 0;
    $scope.numbers = {};
    $scope.liveEvent = "";
    $scope.memberCount = 0;
    $scope.cgiWindowWidth = "640";
    $scope.cgiWindowHeight = "480";
    $scope.cgiMode = "";

    $scope.poll = function () {
        if ($scope.token == "")
            return;
        var pollUrl = "https://events.voip.ovh.net/?token=" + $scope.token;
        if ($scope.session != "") {
            pollUrl += "&session=" + $scope.session;
        }
        $scope.status = "Waiting on " + pollUrl;
        $.ajax({
            type: 'GET',
            dataType: "json",
            processData: false,
            crossDomain: true,
            jsonp: false,
            url: pollUrl,
            error: function (r, textStatus, jqXHR) {
                $scope.poll()
            },
            success: function (r, textStatus, jqXHR) {
                $scope.session = r.Session

                for (i in r.Events) {
                    const ev = r.Events[i];
                    // Sotre in last events
                    const event = ev.Event
                    const data = ev.Data
                    const details = ev.Details
                    const ressource = ev.Ressource;

                    console.log(ev);

                    if (event != "registered") {
                        $scope.lastEvents.unshift(ev)
                    }

                    const startDate = new Date(data.Ts * 1000);
                    startDate.setTime(startDate.getTime() + startDate.getTimezoneOffset() * -20 * 1000);
                    data.DateStart = startDate

                    if (ressource && !data.Called) {
                        data.Called = ressource;
                    }

                    if (ressource && !data.Calling) {
                        data.Calling = ressource;
                    }

                    if ($scope.cgiSet && event == "start_ringing" || $scope.cgiSet && event == "member-queue-start") {
                        var url = $scope.cgiPath;
                        url = url.replace("*CALLING*", data.Calling);
                        url = url.replace("*CALLED*", data.Called);
                        url = url.replace("*DIALED*", data.Dialed);
                        url = url.replace("*EVENT*", data.EventType);

                        if ($scope.cgiMode == 'modal') {
                            $scope.url = url;
                            $('#myModal').modal({
                                remote: url,
                            });

                            $('#myModal').modal('show');
                        }
                        else if ($scope.cgiMode == 'popup') {
                            window.open(url, 'myUrl');
                        }
                        else if ($scope.cgiMode == 'silent') {
                            var request = new XMLHttpRequest();
                            request.open("GET", url, true);
                            request.send(null);
                        }
                    }


                    
                    if (event == "start_ringing") { // Line
                        data.Status = "Ringing";
                        data.StatusTranslated = "Etablissement de l'appel";
                        $scope.liveEvent = data.StatusTranslated;
                        $scope.calls.push(data);
                    } else if (event == "bridge-agent-failed") { // queue
                        $scope.memberCount = data.Count;
                        data.StatusTranslated = "Appel mis en queue (" + $scope.memberCount + ")";
                    } else if (event == "member-queue-start") { // queue
                        $scope.memberCount = data.Count;
                        data.Status = "Queued";
                        data.StatusTranslated = "Appel mis en queue (" + $scope.memberCount + ")";
                        $scope.liveEvent = data.StatusTranslated;
                        $scope.calls.push(data);
                    } else if (event == "end_ringing") { // line
                        existingCall = $.grep($scope.calls, function (existing, i) {
                            if (existing && data && existing.CallId == data.CallId) {
                                $scope.calls.splice(i, 1);
                                data.Status = "Free";
                                data.StatusTranslated = "Poste libre";
                            }
                        });
                    } else if (event == "member-queue-end") { // queue
                        $scope.memberCount = data.Count;
                        data.StatusTranslated = "Appel mis en queue (" + $scope.memberCount + ")";
                        $scope.liveEvent = data.StatusTranslated;
                        existingCall = $.grep($scope.calls, function (existing, i) {
                            if (existing && data && existing.CallId == data.CallId) {
                                $scope.calls.splice(i, 1);
                            }
                        });
                    } else if (event == "start_calling") { // line
                        existingCall = $.grep($scope.calls, function (existing) {
                            return existing.CallId == data.CallId
                        });

                        if (existingCall[0]) {
                            existingCall[0].Status = "Answered";
                            data.StatusTranslated = "Appel en cours";
                            $scope.liveEvent = data.StatusTranslated;
                        }
                        else {
                            data.Status = "Answered";
                            data.StatusTranslated = "Appel en cours";
                            $scope.liveEvent = data.StatusTranslated;
                            $scope.calls.push(data);
                        }
                    } else if (event == "end_calling") { // line
                        existingCall = $.grep($scope.calls, function (existing, i) {
                            if (existing && data && existing.CallId == data.CallId) {
                                data.Status = "Free";
                                data.StatusTranslated = "Poste libre";
                                $scope.calls.splice(i, 1);
                            }
                        });
                    }







                    if (!$scope.numbers[ressource] ||
                        ($scope.numbers[ressource]["status"] == "" ||
                            $scope.numbers[ressource]["status"] == "Wait" &&
                            !data.Status)) {
                        data.Status = "Free";
                        data.StatusTranslated = "Poste libre";
                    }

                    if (details.Type == "cloudHunting" || details.Type == "easyHunting") {
                        if (data.Count == 0) {
                            data.Status = "Free";
                            data.StatusTranslated = "File libre";
                        } else {
                            data.Status = "Queued";
                            data.StatusTranslated = "Appels en attente";
                        }
                    }


                    if (data.Status) {
                        $scope.number = ressource;
                        if (!$scope.numbers[ressource]) {
                            $scope.numbers[ressource] = {};
                        }
                        $scope.numbers[ressource]["ressource"] = ressource;
                        $scope.numbers[ressource]["status"] = data.Status;
                        $scope.numbers[ressource]["statust"] = data.StatusTranslated;
                        $scope.numbers[ressource]["description"] = details.Description;
                        $scope.numbers[ressource]["simultaneous"] = details.SimultaneousLine;
                        $scope.numbers[ressource]["type"] = details.Type;

                        if (details.Type == "cloudHunting" || details.Type == "easyHunting") {
                            if (!$scope.numbers[ressource]["members"]) {
                                $scope.numbers[ressource]["members"] = {}
                            }

                            if (!$scope.numbers[ressource]["queues"]) {
                                $scope.numbers[ressource]["queues"] = {}
                            }

                            if (!$scope.numbers[ressource]["countanswered"]) {
                                $scope.numbers[ressource]["countanswered"] = 0
                            }

                            if (!$scope.numbers[ressource]["countlost"]) {
                                $scope.numbers[ressource]["countlost"] = 0
                            }

                            //C'est une file d'appels
                            if (event == "bridge-agent-start") {
                                $scope.numbers[ressource]["countanswered"]++
                                var memberInfo = {}

                                var re = /^agent_(\w+)_\d+$/;
                                var agent = data.QueueAgent.replace(re, '$1');

                                memberInfo["Calling"] = data.Calling
                                memberInfo["QueueAgent"] = agent
                                memberInfo["JoinedTime"] = data.QueueMemberJoinedTime
                                memberInfo["Timer"] = 0
                                memberInfo["QueueTimer"] = 0

                                if ($scope.numbers[ressource]["queues"][data.QueueMemberUUID]) {
                                    console.log("#" + data.QueueMemberUUID)
                                    memberInfo["QueueTimer"] = $("#q" + data.QueueMemberUUID).html();
                                    memberInfo["Datetime"] = $scope.numbers[ressource]["queues"][data.QueueMemberUUID]["Datetime"]
                                    delete $scope.numbers[ressource]["queues"][data.QueueMemberUUID]
                                }

                                $scope.numbers[ressource]["members"][data.QueueMemberUUID] = memberInfo
                            }

                            if (event == "bridge-agent-fail" && (data.QueueHangupCause == "ORIGINATOR_CANCEL" || data.QueueHangupCause == "NO_AGENT_TIMEOUT")) {
                                $scope.numbers[ressource]["countlost"]++

                                if ($scope.numbers[ressource]["queues"][data.QueueMemberUUID]) {
                                    var historyHunting = {};
                                    historyHunting["datetime"] = $scope.numbers[ressource]["queues"][data.QueueMemberUUID]["Datetime"];
                                    historyHunting["hunting"] = ressource;
                                    historyHunting["huntingDesc"] = $scope.numbers[ressource]["description"]
                                    historyHunting["calling"] = $scope.numbers[ressource]["queues"][data.QueueMemberUUID]["Calling"];
                                    historyHunting["member"] = 0;
                                    historyHunting["queueTime"] = $("#q" + data.QueueMemberUUID).html();
                                    historyHunting["callTime"] = 0;

                                    $scope.lastHuntingEvents.push(historyHunting);

                                    delete $scope.numbers[ressource]["queues"][data.QueueMemberUUID]
                                }
                            }

                            if (event == "agent-offering") {
                                var re = /^agent_(\w+)_\d+$/;
                                var agent = data.QueueAgent.replace(re, '$1');
                                $scope.numbers[ressource]["queues"][data.QueueMemberUUID]["QueueAgent"] = agent
                            }

                            if (event == "members-count") {
                                $scope.numbers[ressource]["countqueue"] = data.Count
                            }

                            if (event == "bridge-agent-end") {
                                if (!$scope.numbers[ressource]["averagewaiting"]) {
                                    $scope.numbers[ressource]["averagewaiting"] = 0
                                }

                                $scope.numbers[ressource]["averagewaiting"] = Math.round((($scope.numbers[ressource]["countanswered"] * $scope.numbers[ressource]["averagewaiting"]) + parseInt(data.QueueAgentAnsweredTime) - parseInt(data.QueueMemberJoinedTime)) / ($scope.numbers[ressource]["countanswered"] + 1), 3)

                                if ($scope.numbers[ressource]["members"][data.QueueMemberUUID]) {

                                    var historyHunting = {};
                                    historyHunting["datetime"] = $scope.numbers[ressource]["members"][data.QueueMemberUUID]["Datetime"];
                                    historyHunting["hunting"] = ressource
                                    historyHunting["huntingDesc"] = $scope.numbers[ressource]["description"]
                                    historyHunting["calling"] = $scope.numbers[ressource]["members"][data.QueueMemberUUID]["Calling"]
                                    historyHunting["member"] = $scope.numbers[ressource]["members"][data.QueueMemberUUID]["QueueAgent"]
                                    historyHunting["memberDesc"] = ""
                                    if ($scope.numbers[historyHunting["member"]] && $scope.numbers[historyHunting["member"]]["description"]) {
                                        historyHunting["memberDesc"] = $scope.numbers[historyHunting["member"]]["description"]
                                    }

                                    historyHunting["queueTime"] = $scope.numbers[ressource]["members"][data.QueueMemberUUID]["QueueTimer"]
                                    historyHunting["callTime"] = $("#m" + data.QueueMemberUUID).html();

                                    $scope.lastHuntingEvents.push(historyHunting);

                                    delete $scope.numbers[ressource]["members"][data.QueueMemberUUID]
                                }
                                //CC-Bridge-Terminated-Time - CC-Agent-Answered-Time
                                //CC-Agent-Answered-Time - CC-Member-Joined-Time
                            }

                            if (event == "member-queue-start") {

                                var queueInfo = {}

                                //var re = /^agent_(\w+)_\d+$/;
                                //var agent = eventData.Calling.replace(re, '$1'); 

                                queueInfo["Datetime"] = data.DateStart
                                queueInfo["QueueAgent"] = "..."
                                queueInfo["Calling"] = data.Calling
                                queueInfo["JoinedTime"] = data.QueueMemberJoinedTime
                                queueInfo["Timer"] = 0

                                $scope.numbers[ressource]["queues"][data.QueueMemberUUID] = queueInfo
                            }


                            if (event == "member-queue-end") {

                            }

                            $scope.numbers[ressource]["counttotal"] = parseInt($scope.numbers[ressource]["countanswered"]) + parseInt($scope.numbers[ressource]["countlost"])
                            $scope.numbers[ressource]["percentanswered"] = Math.round($scope.numbers[ressource]["countanswered"] * 100 / $scope.numbers[ressource]["counttotal"], 3)
                        } else {
                            var numberRunningCalls = $.grep($scope.calls, function (existing) {
                                return existing.Billing == data.Billing
                            })

                            $scope.numbers[ressource]["cursimultaneous"] = numberRunningCalls.length
                        }

                        var jsonNumbers = JSON.stringify($scope.numbers);
                        localStorage.setItem($scope.token + "-numbers", jsonNumbers)
                        $scope.numbersize = Object.keys($scope.numbers).length;
                    }

                    console.log($scope.numbers)
                    $scope.$apply()
                }

                $scope.poll()
            }
        });

    };


    $scope.login = function () {
        $scope.notify = "";
        $scope.logged = true;
        setCookie('cookieToken', $scope.token, 15 * 60);

        if ($scope.keepConnectionActive) {
            localStorage.setItem("cookieToken", $scope.token);
        }

        $scope.hideSL = localStorage.getItem($scope.token + "-hideSL")
        $scope.reinitAuto = localStorage.getItem($scope.token + "-reinitAuto")
        $scope.cgiSet = localStorage.getItem($scope.token + "-cgiSet")
        $scope.cgiPath = localStorage.getItem($scope.token + "-cgiPath")
        if (localStorage.getItem($scope.token + "-numbers")) {
            $scope.numbers = JSON.parse(localStorage.getItem($scope.token + "-numbers"))
        }
        else {
            $scope.numbers = {};
        }

        console.log($scope.numbers)
        for (i in $scope.numbers) {
            $scope.numbers[i]["countqueue"] = "0";
            $scope.numbers[i]["status"] = "Wait";
            $scope.numbers[i]["statust"] = "...";
            $scope.numbers[i]["cursimultaneous"] = "undef";
            $scope.numbers[i]["members"] = {}
            $scope.numbers[i]["queues"] = {}
            $scope.numbersize = i;
        }

        $scope.cgiMode = localStorage.getItem($scope.token + "-cgiMode");
        $scope.poll();
    };


    if (gup("token")) {
        $scope.token = gup("token");
        $scope.login();
    }
    else if ($scope.token = localStorage.getItem('cookieToken')) {
        $scope.logged = true;
        $scope.login();
    }
    else {
        if ($scope.token = getCookie('cookieToken')) {
            $scope.logged = true;
            $scope.login();
        }
    }

    $scope.logout = function () {
        $scope.logged = false;
        setCookie('cookieToken', '', 0);
        $scope.token = '';
        $scope.page = false;
        $scope.pagename = "Vue d'ensemble";
        $scope.notify = "Vous avez été déconnecté."
        localStorage.setItem("cookieToken", "");
    };

    $scope.changeToken = function () {
        $scope.login();
        $scope.notify = "Les paramètres du token ont été modifiés.";
    }

    $scope.changeCgi = function (page) {
        localStorage.setItem($scope.token + "-cgiMode", $scope.cgiMode);
        localStorage.setItem($scope.token + "-cgiSet", $scope.cgiSet);
        localStorage.setItem($scope.token + "-cgiPath", $scope.cgiPath);
        $scope.notify = "Les paramètres du cgi ont été modifiés.";
    }

    $scope.changeOptions = function (page) {
        localStorage.setItem($scope.token + "-hideSL", $scope.hideSL);
        localStorage.setItem($scope.token + "-reinitAuto", $scope.reinitAuto);
        $scope.notify = "Les options d'affichage ont été modifiées.";
    }

    $scope.reinit = function (page) {
        var jsonNumbers = JSON.stringify({});
        localStorage.setItem($scope.token + "-numbers", jsonNumbers)
        $scope.notify = "Les options de cache ont été réinitialisées.";
        $scope.login();
    }



    //Page scope
    $scope.changePage = function (page) {
        $scope.page = page;
        if ($scope.page == 'cgi') {
            $scope.pagename = "Configuration du CGI";
        }
        if ($scope.page == 'display') {
            $scope.pagename = "Configuration de l'affichage";
        }
        if ($scope.page == 'hunting') {
            $scope.pagename = "Vue des files d'appel";
        }
        if ($scope.page == 'token') {
            $scope.pagename = "Configuration du token";
        }
        if ($scope.page == 'help') {
            $scope.pagename = "Aide";
        }

        if ($scope.page == '') {
            $scope.pagename = "Vue d'ensemble";
        }
    }

    //    $scope.poll()
});




function setCookie(cname, cvalue, exsecs) {
    var d = new Date();
    d.setTime(d.getTime() + (exsecs * 1000));
    var expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + "; " + expires;
}

function getCookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1);
        if (c.indexOf(name) != -1) return c.substring(name.length, c.length);
    }
    return "";
}

