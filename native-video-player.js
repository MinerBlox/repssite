function control(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function formatTime(seconds) {
  const total = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}

export function createNativePlayer(url, title, onError) {
  const element = document.createElement("div");
  element.className = "native-player";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", title + " video player");

  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;
  video.addEventListener("error", onError, { once: true });

  function start() {
    video.play().catch(() => {});
  }
  function togglePlayback() {
    if (video.paused || video.ended) start();
    else video.pause();
  }

  const playback = control("Play", togglePlayback);
  const sound = control("Mute", () => { video.muted = !video.muted; });
  const fullscreen = control("Fullscreen", () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (element.requestFullscreen) void element.requestFullscreen().catch(() => {});
    else video.webkitEnterFullscreen?.();
  });
  const time = document.createElement("span");
  time.className = "native-time";
  const timeline = document.createElement("input");
  timeline.type = "range";
  timeline.min = "0";
  timeline.max = "0";
  timeline.step = "0.1";
  timeline.value = "0";
  timeline.disabled = true;
  timeline.setAttribute("aria-label", "Seek video");

  function showPosition() {
    time.textContent = formatTime(video.currentTime) + " / " + formatTime(video.duration);
    timeline.value = String(video.currentTime);
    timeline.setAttribute("aria-valuetext", time.textContent);
  }
  function showDuration() {
    timeline.disabled = !(Number.isFinite(video.duration) && video.duration > 0);
    timeline.max = timeline.disabled ? "0" : String(video.duration);
    showPosition();
  }
  function showPlayback() {
    playback.textContent = video.paused || video.ended ? "Play" : "Pause";
  }
  for (const event of ["loadedmetadata", "durationchange"]) video.addEventListener(event, showDuration);
  for (const event of ["play", "pause", "ended"]) video.addEventListener(event, showPlayback);
  video.addEventListener("timeupdate", showPosition);
  video.addEventListener("click", togglePlayback);
  video.addEventListener("volumechange", () => { sound.textContent = video.muted ? "Unmute" : "Mute"; });
  timeline.addEventListener("input", () => { video.currentTime = Number(timeline.value); });

  const bar = document.createElement("div");
  bar.className = "native-control-bar";
  bar.append(playback, time, sound, fullscreen);
  const controls = document.createElement("div");
  controls.className = "native-controls";
  controls.append(timeline, bar);
  element.append(video, controls);
  showPosition();
  playback.addEventListener("keydown", event => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    if (timeline.disabled) return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 5 : -5;
    video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + offset));
  });
  return { element, start() { playback.focus(); start(); } };
}
