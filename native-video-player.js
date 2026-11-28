const icons = {
  play: '<path fill="currentColor" d="M8 5v14l11-7z"/>',
  pause: '<path d="M9 7v10m6-10v10" stroke-width="2.4"/>',
  volume: '<path d="M3 9v6h4l5 4V5L7 9H3zm13 0a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10"/>',
  muted: '<path d="M3 9v6h4l5 4V5L7 9H3zm13 1 5 5m0-5-5 5"/>',
  previous: '<path d="m15 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>'
};

function setIcon(button, icon) {
  if (button.dataset.icon === icon) return;
  button.dataset.icon = icon;
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[icon] + '</svg>';
}

function control(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function iconControl(label, icon, action) {
  const button = control(label, action);
  button.className = "player-icon";
  button.setAttribute("aria-label", label);
  setIcon(button, icon);
  return button;
}

function formatTime(seconds) {
  const total = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}

function playerSurface(label) {
  const element = document.createElement("div");
  element.className = "native-player";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", label);
  return element;
}

const volumePreferenceKey = "rc-player-volume";
let volumePreference = 75;
try {
  const saved = localStorage.getItem(volumePreferenceKey);
  if (saved !== null && /^\d+$/.test(saved) && Number(saved) <= 100) volumePreference = Number(saved);
} catch {}

function createVolumeControl(media, label, id) {
  media.volume = volumePreference / 100;
  media.muted = volumePreference === 0;
  const volumeControl = document.createElement("div");
  volumeControl.className = "player-volume";
  const sound = iconControl("Volume", "volume", () => {
    volumeControl.classList.toggle("is-open");
    updateVolumeVisibility();
  });
  sound.setAttribute("aria-controls", id);

  const volumePanel = document.createElement("div");
  volumePanel.className = "player-volume-slider";
  const volume = document.createElement("input");
  volume.id = id;
  volume.type = "range";
  volume.min = "0";
  volume.max = "100";
  volume.value = String(volumePreference);
  volume.style.setProperty("--volume", volume.value + "%");
  volume.setAttribute("aria-label", label);
  volumePanel.append(volume);
  volumeControl.append(volumePanel, sound);
  function updateVolumeVisibility() {
    const open = volumeControl.classList.contains("is-open") || volumeControl.matches(":hover");
    sound.setAttribute("aria-expanded", String(open));
    volume.tabIndex = open ? 0 : -1;
  }
  volumeControl.addEventListener("pointerenter", updateVolumeVisibility);
  volumeControl.addEventListener("pointerleave", updateVolumeVisibility);
  volumeControl.addEventListener("focusout", event => {
    if (volumeControl.contains(event.relatedTarget)) return;
    volumeControl.classList.remove("is-open");
    updateVolumeVisibility();
  });
  volumeControl.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!volumeControl.classList.contains("is-open")) return;
    event.stopPropagation();
    volumeControl.classList.remove("is-open");
    sound.focus();
    updateVolumeVisibility();
  });
  volume.addEventListener("input", () => {
    const percent = Number(volume.value);
    volume.style.setProperty("--volume", volume.value + "%");
    media.volume = percent / 100;
    media.muted = percent === 0;
    if (percent !== volumePreference) {
      volumePreference = percent;
      try { localStorage.setItem(volumePreferenceKey, String(percent)); } catch {}
    }
  });
  function syncVolumeIcon() {
    setIcon(sound, media.muted || Number(volume.value) === 0 ? "muted" : "volume");
  }
  media.addEventListener("volumechange", syncVolumeIcon);
  syncVolumeIcon();
  updateVolumeVisibility();
  return volumeControl;
}

export function createNativePlayer(url, title, onError, onEnded) {
  const element = playerSurface(title + " video player");
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;
  let failed = false;
  function showMediaError() {
    if (failed || !element.isConnected) return;
    failed = true;
    video.pause();
    onError();
  }
  video.addEventListener("error", showMediaError);
  video.addEventListener("playing", () => {
    if (!video.videoWidth || !video.videoHeight) showMediaError();
  }, { once: true });
  video.addEventListener("ended", onEnded, { once: true });

  function start() {
    video.play().catch(error => {
      if (error.name !== "NotAllowedError" || video.muted || !element.isConnected) return;
      video.muted = true;
      video.play().catch(() => {});
    });
  }

  function togglePlayback() {
    if (!video.paused) {
      video.pause();
      return;
    }
    if (video.muted && video.volume > 0) video.muted = false;
    start();
  }

  const playback = iconControl("Play", "play", togglePlayback);
  playback.classList.add("player-toggle");
  const volumeControl = createVolumeControl(video, "Video volume", "video-volume-slider");

  const timeline = document.createElement("input");
  timeline.className = "player-progress";
  timeline.type = "range";
  timeline.min = "0";
  timeline.max = "0";
  timeline.step = "any";
  timeline.value = "0";
  timeline.disabled = true;
  timeline.setAttribute("aria-label", "Seek video");
  function showPosition() {
    timeline.value = String(video.currentTime);
    const percent = video.duration > 0 ? Math.min(100, video.currentTime / video.duration * 100) : 0;
    timeline.style.setProperty("--progress", percent + "%");
    timeline.setAttribute("aria-valuetext", formatTime(video.currentTime) + " / " + formatTime(video.duration));
  }
  function showDuration() {
    timeline.disabled = !(Number.isFinite(video.duration) && video.duration > 0);
    timeline.max = timeline.disabled ? "0" : String(video.duration);
    showPosition();
  }
  function showPlayback() {
    const paused = video.paused || video.ended;
    setIcon(playback, paused ? "play" : "pause");
    playback.setAttribute("aria-label", paused ? "Play" : "Pause");
  }
  for (const event of ["loadedmetadata", "durationchange"]) video.addEventListener(event, showDuration);
  for (const event of ["play", "pause", "ended"]) video.addEventListener(event, showPlayback);
  video.addEventListener("timeupdate", showPosition);
  video.addEventListener("click", togglePlayback);
  timeline.addEventListener("input", () => { video.currentTime = Number(timeline.value); });
  timeline.addEventListener("keydown", event => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 5 : -5;
    video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + offset));
  });
  element.append(video, timeline, playback, volumeControl);
  return { element, start() { playback.focus(); start(); } };
}

const primedImages = new Map();

export function preloadSlideshow(images, start = 0) {
  for (const url of images.slice(start, start + 2)) {
    if (primedImages.has(url)) continue;
    const image = new Image();
    image.referrerPolicy = "no-referrer";
    image.src = url;
    primedImages.set(url, image);
    if (primedImages.size > 60) primedImages.delete(primedImages.keys().next().value);
  }
}

export function createSlideshow(images, title, onError, audioUrl = "") {
  const element = playerSurface(title + " slideshow");
  const photo = document.createElement("img");
  photo.className = "player-photo";
  photo.draggable = false;
  photo.referrerPolicy = "no-referrer";
  const status = document.createElement("span");
  status.className = "player-photo-count";
  status.setAttribute("aria-live", "polite");
  let index = 0;
  let touchStart = null;

  const previous = iconControl("Previous photo", "previous", () => show(index - 1));
  const next = iconControl("Next photo", "next", () => show(index + 1));
  previous.classList.add("player-previous");
  next.classList.add("player-next");
  previous.hidden = next.hidden = images.length < 2;

  function show(position) {
    index = (position + images.length) % images.length;
    photo.alt = "Slide " + (index + 1) + " of " + images.length;
    photo.src = images[index];
    status.textContent = (index + 1) + " / " + images.length;
    preloadSlideshow(images, index + 1);
  }

  photo.addEventListener("error", onError, { once: true });
  element.addEventListener("keydown", event => {
    if (event.target !== element || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    show(index + (event.key === "ArrowLeft" ? -1 : 1));
  });
  photo.addEventListener("touchstart", event => {
    const { clientX, clientY } = event.changedTouches[0];
    touchStart = { x: clientX, y: clientY };
  }, { passive: true });
  photo.addEventListener("touchend", event => {
    if (!touchStart) return;
    const { clientX, clientY } = event.changedTouches[0];
    const distance = clientX - touchStart.x;
    if (Math.abs(distance) > 35 && Math.abs(distance) > Math.abs(clientY - touchStart.y)) {
      show(index + (distance < 0 ? 1 : -1));
    }
    touchStart = null;
  }, { passive: true });
  element.append(photo, previous, status, next);
  element.tabIndex = 0;
  const audio = audioUrl ? new Audio(audioUrl) : null;
  function playAudio() {
    if (audio) void audio.play().catch(() => {});
  }
  if (audio) {
    audio.preload = "auto";
    const sound = iconControl("Play slideshow audio", "play", () => {
      if (audio.paused) playAudio();
      else audio.pause();
    });
    sound.classList.add("player-slideshow-sound");
    function syncSound() {
      setIcon(sound, audio.paused ? "play" : "pause");
      sound.setAttribute("aria-label", audio.paused ? "Play slideshow audio" : "Pause slideshow audio");
    }
    for (const event of ["play", "pause", "ended"]) audio.addEventListener(event, syncSound);
    const volume = createVolumeControl(audio, "Slideshow volume", "slideshow-volume-slider");
    audio.addEventListener("error", () => { sound.hidden = volume.hidden = true; }, { once: true });
    element.append(sound, volume);
  }
  return {
    element,
    start() { show(0); element.focus(); playAudio(); },
    destroy() {
      if (!audio) return;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  };
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
