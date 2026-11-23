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

export function createNativePlayer(url, title, onError, onEnded) {
  const element = document.createElement("div");
  element.className = "native-player";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", title + " video player");

  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;
  video.addEventListener("error", onError, { once: true });
  if (onEnded) video.addEventListener("ended", onEnded, { once: true });

  function start() {
    video.play().catch(error => {
      if (error.name !== "NotAllowedError" || video.muted || !element.isConnected) return;
      video.muted = true;
      video.play().catch(() => {});
    });
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

export function createTikTokPlayer(id, title, { onEnded, onError, slideshow = false }) {
  const origin = "https://www.tiktok.com";
  const element = document.createElement("div");
  element.className = "native-player";
  const iframe = document.createElement("iframe");
  iframe.title = title + " on TikTok";
  iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  const source = new URL("/player/v1/" + id, origin);
  source.search = new URLSearchParams({
    controls: slideshow ? "1" : "0",
    autoplay: slideshow ? "0" : "1",
    loop: "0",
    rel: "0"
  });

  const send = (type, value) => iframe.contentWindow?.postMessage({ type, value, "x-tiktok-player": true }, origin);
  let playing = false;
  let muted = false;
  let ready = false;
  const playback = control("Play", () => send(playing ? "pause" : "play"));
  const sound = control("Mute", () => send(muted ? "unMute" : "mute"));
  const fullscreen = control("Fullscreen", () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (element.requestFullscreen) void element.requestFullscreen().catch(() => {});
  });
  playback.disabled = sound.disabled = true;
  fullscreen.hidden = !document.fullscreenEnabled;
  const time = document.createElement("span");
  time.className = "native-time";
  const timeline = document.createElement("input");
  timeline.type = "range";
  timeline.min = "0";
  timeline.max = "0";
  timeline.step = "0.1";
  timeline.disabled = true;
  timeline.setAttribute("aria-label", "Seek video");
  timeline.addEventListener("input", () => send("seekTo", Number(timeline.value)));
  const bar = document.createElement("div");
  bar.className = "native-control-bar";
  bar.append(playback, time, sound, fullscreen);
  const controls = document.createElement("div");
  controls.className = "native-controls";
  controls.append(timeline, bar);

  function handleMessage(event) {
    const data = event.data;
    if (event.origin !== origin || event.source !== iframe.contentWindow || data?.["x-tiktok-player"] !== true) return;
    if (data.type === "onPlayerReady") {
      ready = true;
      playback.disabled = sound.disabled = false;
    } else if (data.type === "onStateChange" && !slideshow) {
      if (data.value === 0) onEnded();
      if (data.value === 1 || data.value === 2) {
        playing = data.value === 1;
        playback.textContent = playing ? "Pause" : "Play";
      }
    } else if (data.type === "onCurrentTime") {
      const { currentTime, duration } = data.value || {};
      if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return;
      timeline.disabled = false;
      timeline.max = String(duration);
      if (!timeline.matches(":active")) timeline.value = String(currentTime);
      time.textContent = formatTime(currentTime) + " / " + formatTime(duration);
      timeline.setAttribute("aria-valuetext", time.textContent);
    } else if (data.type === "onMute") {
      muted = Boolean(data.value);
      sound.textContent = muted ? "Unmute" : "Mute";
    } else if (data.type === "onPlayerError") {
      if (Number(data.value?.errorCode ?? data.value) === 3002) {
        playback.disabled = false;
        playback.textContent = "Play";
      } else {
        onError();
      }
    }
  }

  element.append(iframe);
  if (!slideshow) element.append(controls);
  return {
    element,
    start() {
      window.addEventListener("message", handleMessage);
      iframe.src = source.href;
    },
    destroy() {
      window.removeEventListener("message", handleMessage);
      if (ready) send("pause");
    }
  };
}
