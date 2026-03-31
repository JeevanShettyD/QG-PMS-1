var startTime;
var elapsedTime = 0;
var timerInterval;
var display = document.getElementById("display");
var lapTimes = [];
var startBtn = document.getElementById('startBtn');
var pauseBtn = document.getElementById('pauseBtn');
var stopBtn = document.getElementById('stopBtn');

function start(e) {
  startTime = Date.now() - elapsedTime;
  timerInterval = setInterval(updateDisplay, 100);
  startBtn.disabled = true;
  pauseBtn.disabled = false;
  stopBtn.disabled = false;
  startBtn.classList.add('d-none');
  stopBtn.classList.remove('d-none');
}

function pause(e) {
  clearInterval(timerInterval);
  elapsedTime = Date.now() - startTime;
  lapTimes.push(elapsedTime)
  // updateLapTimes();
  e.disabled = true;
  startBtn.disabled = false;
}

function reset(e) {
  stop();
  elapsedTime = 0;
  display.textContent = "00:00:00";
  lapTimes = [];
  // updateLapTimes();
  e.disabled = true;
}

function stop(e) {
  var lapTime = elapsedTime;
  clearInterval(timerInterval);
  elapsedTime = 0;
  display.textContent = "00:00:00:00";
  lapTimes.push(lapTime);
  // updateLapTimes();
  stopBtn.disabled = true;
  startBtn.disabled = false;
  stopBtn.classList.add('d-none');
  startBtn.classList.remove('d-none');
}

function updateLapTimes() {
  var lapTimesContainer = document.getElementById("lapTimes");
  lapTimesContainer.innerHTML = "";
  for (var i = 0; i < lapTimes.length; i++) {
    var lapTime = lapTimes[i];
    var lapTimeString = formatTime(lapTime);
    var lapElement = document.createElement("div");
    lapElement.textContent = "Lap " + (i + 1) + ": " + lapTimeString;
    lapTimesContainer.appendChild(lapElement);
  }
}

function updateDisplay() {
  elapsedTime = Date.now() - startTime;
  display.style.opacity = 0;
  display.textContent = formatTime(elapsedTime);
  display.style.opacity = 1;
}

function formatTime(time) {
  var date = new Date(time);
  var minutes = date.getUTCMinutes();
  var seconds = date.getUTCSeconds();
  var milliseconds = Math.floor(date.getUTCMilliseconds() / 10);
  var hours = date.getUTCHours();
  hours = hours < 10 ? "0" + hours : hours;
  minutes = minutes < 10 ? "0" + minutes : minutes;
  seconds = seconds < 10 ? "0" + seconds : seconds;
  milliseconds = milliseconds < 10 ? "0" + milliseconds : milliseconds;

  return hours + ":" + minutes + ":" + seconds + ":" + milliseconds;
}
