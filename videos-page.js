import "/site-analytics.js?v=2026-07-07-videos-firestore";
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { assetUrl, fetchVideoMetadata, gridMessage, linkedItems, renderVideoGrid, sortVideos, tiktokUrl } from "/video-grid.js";

import { createNativePlayer, createSlideshow, createTikTokPlayer } from "/native-video-player.js?v=controls";
import { forgetTikTokMedia, lookupTikTokMedia, mediaCacheKey, readTikTokMedia } from "/tiktok-playback-cache.js";

const get = id => document.getElementById(id);
const grid = get("video-grid");
const dialog = get("video-details");
const player = get("details-player");
const poster = get("details-poster");
const play = get("details-play");
const loader = get("details-loader");
const message = get("details-player-message");
const cover = get("details-cover");
const avatar = get("details-avatar");
const list = get("details-items");
const defaultAvatar = "/systemimages/repscentrallogo.png";
const maxProducts = 50;
let videosById = new Map();
let detail = null;
let activePlayer = null;
let ratesPromise;
let rates = {};

function postId(url) {
  if (!url) return "";
  return new URL(url).pathname.match(/\/(?:video|photo)\/(\d+)\/?$/)?.[1] || "";
}

function postHandle(url) {
  if (!url) return "";
  return new URL(url).pathname.match(/^\/@([^/]+)/)?.[1] || "";
}

function setImage(image, url) {
  if (!url) {
    image.hidden = true;
    image.removeAttribute("src");
    return;
  }
  if (image.getAttribute("src") !== url) image.src = url;
  image.hidden = false;
}

function setPlayerMessage(text = "") {
  message.textContent = text;
  message.hidden = !text;
}

function stopPlayback() {
  detail?.resolution?.abort();
  if (detail) detail.resolution = null;
  loader.hidden = true;
  activePlayer?.destroy?.();
  activePlayer?.element.querySelector("video")?.pause();
  activePlayer?.element.remove();
  activePlayer = null;
  poster.hidden = false;
}

function setPlayerAvailability() {
  play.hidden = !(detail?.mediaUrl || detail?.url);
  const label = detail?.ended ? "Replay video" : "Play video";
  play.setAttribute("aria-label", label);
  play.textContent = detail?.ended ? "↻ Replay" : "▶";
  setPlayerMessage(play.hidden ? "This video has no playback source." : "");
}

function showProfile(video, session) {
  const metadata = session.metadata;
  const name = metadata?.authorName || "Reps Central";
  const handle = metadata?.authorHandle || postHandle(session.url);
  get("details-author").textContent = name;
  get("details-handle").textContent = handle ? "@" + handle : "";
  get("details-handle").hidden = !handle;
  setImage(avatar, assetUrl(metadata?.authorAvatar) || defaultAvatar);

  const caption = get("details-caption");
  caption.textContent = video.caption || metadata?.caption || "";
  caption.hidden = !caption.textContent;
  const watch = get("details-watch");
  watch.hidden = !session.url;
  if (session.url) watch.href = session.url;
  else watch.removeAttribute("href");
}

function openMedia(video, url, initialCover) {
  stopPlayback();
  const session = {
    id: video.id, url, postId: postId(url), mediaUrl: assetUrl(video.mediaUrl), savedThumbnail: video.thumbnailUrl,
    productKey: "", products: new Map(), slideshow: Boolean(url && new URL(url).pathname.includes("/photo/"))
  };
  detail = session;
  setImage(cover, initialCover || assetUrl(video.thumbnailUrl));
  setPlayerAvailability();
  if (!url) return session;

  void fetchVideoMetadata(url).then(metadata => {
    if (detail !== session || !dialog.open) return;
    session.metadata = metadata;
    const resolvedId = String(metadata?.postId || "");
    session.postId ||= (/^\d+$/.test(resolvedId) ? resolvedId : postId(tiktokUrl(metadata?.url)));
    if (cover.hidden || !cover.getAttribute("src")) setImage(cover, assetUrl(metadata?.thumbnailUrl));
    if (metadata?.url) session.slideshow ||= Boolean(tiktokUrl(metadata.url) && new URL(metadata.url).pathname.includes("/photo/"));
    const current = videosById.get(session.id);
    if (current) showProfile(current, session);
  });
  return session;
}

function preferredCurrency() {
  try {
    return localStorage.getItem("rc-currency") || "CNY";
  } catch {
    return "CNY";
  }
}

function priceLabel(value) {
  if (value == null || value === "") return "Price unavailable";
  const amount = Number(String(value).trim().replace(/^[¥￥]\s*/, ""));
  if (!Number.isFinite(amount)) return String(value);
  const currency = preferredCurrency();
  const rate = Number(rates[currency]);
  if (currency !== "CNY" && rate > 0) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" })
        .format(amount * rate) + " · ¥" + amount.toFixed(2);
    } catch {}
  }
  return "¥" + amount.toFixed(2);
}

function loadRates() {
  if (preferredCurrency() === "CNY") return;
  if (ratesPromise) return ratesPromise;
  try {
    rates = JSON.parse(localStorage.getItem("rc-cny-rates") || "null")?.rates || {};
  } catch {}
  ratesPromise = fetch("https://api.frankfurter.dev/v1/latest?base=CNY")
    .then(response => response.ok ? response.json() : null)
    .then(data => { if (data?.rates) rates = data.rates; })
    .catch(() => {});
  return ratesPromise;
}

async function loadProducts(ids) {
  const requests = [];
  for (let start = 0; start < ids.length; start += maxProducts) {
    const endpoint = new URL("/api/catalog", location.origin);
    for (const id of ids.slice(start, start + maxProducts)) endpoint.searchParams.append("ids", id);
    requests.push(fetch(endpoint)
      .then(response => response.ok ? response.json() : null)
      .then(data => Array.isArray(data?.products) ? data.products : [])
      .catch(() => []));
  }
  const products = (await Promise.all(requests)).flat();
  return new Map(products.map(product => [String(product.id), product]));
}

function productHref(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value, location.origin + "/");
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function drawItems(items, session) {
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const current = session.products.get(item.id);
    const product = { ...item, ...current };
    const row = document.createElement("li");
    row.className = "details-item";
    const picture = document.createElement("span");
    picture.className = "details-item-image";
    const thumbnail = assetUrl(product.imageUrl || item.imageUrl);
    if (thumbnail) {
      const image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      image.addEventListener("error", () => image.remove(), { once: true });
      image.src = thumbnail;
      picture.append(image);
    }

    const copy = document.createElement("div");
    const name = document.createElement("p");
    name.className = "details-item-name";
    name.textContent = product.name || "Item " + item.id;
    const price = document.createElement("p");
    price.className = "details-item-price";
    price.textContent = priceLabel(product.price ?? product.priceCny ?? item.price);
    copy.append(name, price);

    const outbound = productHref(current ? current.agentUrl : item.agentUrl);
    const target = outbound || "/items/" + encodeURIComponent(item.id) + "/";
    const link = document.createElement("a");
    link.className = "details-item-link";
    link.textContent = "LINK";
    link.setAttribute("aria-label", "Open link for " + name.textContent);
    if (session.loadingProducts && !outbound) {
      link.setAttribute("aria-disabled", "true");
    } else {
      link.href = target;
    }
    if (outbound) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.dataset.outboundItem = item.id;
    }
    row.append(picture, copy, link);
    fragment.append(row);
  }
  list.replaceChildren(fragment);
  get("details-empty").hidden = items.length > 0;
}

function renderItems(video, session) {
  const items = linkedItems(video).filter(item => item.id !== "." && item.id !== "..");
  const ids = items.map(item => item.id).filter(id => id.length <= 256);
  const key = JSON.stringify(ids);
  if (session.productKey !== key) {
    session.productKey = key;
    session.loadingProducts = ids.length > 0;
    if (ids.length) {
      void loadProducts(ids).then(products => {
        if (detail !== session || session.productKey !== key || !dialog.open) return;
        session.products = products;
        session.loadingProducts = false;
        const current = videosById.get(session.id);
        if (current) renderItems(current, session);
      });
      const currency = loadRates();
      if (currency) void currency.then(() => {
        if (detail === session && session.productKey === key && dialog.open) {
          const current = videosById.get(session.id);
          if (current) drawItems(linkedItems(current).filter(item => item.id !== "." && item.id !== ".."), session);
        }
      });
    }
  }
  drawItems(items, session);
}

function renderDetails(video, initialCover = "") {
  const url = tiktokUrl(video.tiktokUrl);
  const title = video.title || "Untitled video";
  const session = detail?.id === video.id && detail.url === url && detail.mediaUrl === assetUrl(video.mediaUrl)
    ? detail : openMedia(video, url, initialCover);
  if (session.savedThumbnail !== video.thumbnailUrl) {
    session.savedThumbnail = video.thumbnailUrl;
    setImage(cover, assetUrl(video.thumbnailUrl) || assetUrl(session.metadata?.thumbnailUrl));
  }
  get("details-title").textContent = title;
  const iframe = player.querySelector("iframe");
  if (iframe) iframe.title = title + " on TikTok";
  showProfile(video, session);
  renderItems(video, session);
}

async function resolvePlayback(session, key) {
  const resolution = new AbortController();
  session.resolution = resolution;
  poster.hidden = true;
  loader.hidden = false;
  const timeout = setTimeout(() => resolution.abort(), 8000);
  try {
    return await lookupTikTokMedia(key, resolution.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    if (session.resolution === resolution) {
      session.resolution = null;
      loader.hidden = true;
    }
  }
}

async function startPlayback(allowCached = true) {
  const session = detail;
  if (!session || activePlayer || session.resolution || !dialog.open || !(session.mediaUrl || session.url)) return;
  const key = !session.mediaUrl && session.url ? mediaCacheKey(session.url) : "";
  const cached = key && allowCached ? readTikTokMedia(key) : null;
  const media = cached || (key ? await resolvePlayback(session, key) : null);
  if (detail !== session || !dialog.open) return;
  const title = get("details-title").textContent;
  const finish = () => {
    if (detail !== session || !dialog.open) return;
    session.ended = true;
    stopPlayback();
    setPlayerAvailability();
    play.focus();
  };
  const fail = () => {
    if (detail !== session || !dialog.open) return;
    stopPlayback();
    setPlayerAvailability();
    setPlayerMessage(session.url ? "Playback is unavailable here. Use Watch on TikTok." : "This video file could not load.");
    play.focus();
  };

  function handleMediaError() {
    if (detail !== session || !dialog.open) return;
    if (media && key) forgetTikTokMedia(key, media);
    if (cached) {
      stopPlayback();
      void startPlayback(false);
    } else if (session.slideshow && session.postId) {
      stopPlayback();
      mount(createTikTokPlayer(session.postId, title, { onEnded: finish, onError: fail, slideshow: true }));
    } else {
      fail();
    }
  }

  function mount(current) {
    activePlayer = current;
    session.ended = false;
    poster.hidden = true;
    player.append(current.element);
    current.start();
  }

  const videoUrl = session.mediaUrl || media?.videoUrl;
  if (media?.images.length) {
    session.slideshow = true;
    mount(createSlideshow(media.images, title, handleMediaError));
  } else if (videoUrl) {
    mount(createNativePlayer(videoUrl, title, handleMediaError, finish));
  } else if (session.slideshow && session.postId) {
    mount(createTikTokPlayer(session.postId, title, { onEnded: finish, onError: fail, slideshow: true }));
  } else {
    fail();
  }
}

play.addEventListener("click", () => void startPlayback());

avatar.addEventListener("error", () => {
  if (avatar.getAttribute("src") !== defaultAvatar) setImage(avatar, defaultAvatar);
});
cover.addEventListener("error", () => {
  setImage(cover, assetUrl(detail?.metadata?.thumbnailUrl) !== cover.getAttribute("src")
    ? assetUrl(detail?.metadata?.thumbnailUrl) : "");
});
list.addEventListener("click", event => {
  const outbound = event.target.closest("[data-outbound-item]");
  if (outbound) window.rcTrackProductInteraction?.(outbound.dataset.outboundItem, "outboundClicks");
});

grid.addEventListener("click", event => {
  const tile = event.target.closest("[data-video-id]");
  const video = videosById.get(tile?.dataset.videoId);
  if (!video) return;
  renderDetails(video, tile.querySelector("img")?.currentSrc);
  dialog.showModal();
  startPlayback();
});

dialog.addEventListener("close", () => {
  const closedId = detail?.id;
  stopPlayback();
  detail = null;
  const previous = [...grid.querySelectorAll("[data-video-id]")].find(button => button.dataset.videoId === closedId);
  previous?.focus();
});

const db = getFirestore(getApp());
onSnapshot(collection(db, "videos"), snapshot => {
  const videos = sortVideos(snapshot.docs.map(entry => ({ ...entry.data(), id: entry.id }))
    .filter(video => video.isActive !== false));
  videosById = new Map(videos.map(video => [video.id, video]));
  renderVideoGrid(grid, videos, "No videos have been added yet.", { showTitle: false });
  if (dialog.open) {
    const current = videosById.get(detail?.id);
    if (current) renderDetails(current);
    else dialog.close();
  }
}, () => gridMessage(grid, "Couldn’t load videos. Try refreshing the page."));
