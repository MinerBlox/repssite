import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, onSnapshot, runTransaction, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { enableAppCheck } from "/firebase-app-check.js?v=2026-07-01-preview-skip";
import { assetUrl, escapeHtml, gridMessage, linkedItems, renderVideoGrid, sortVideos, tiktokUrl, nextVideoSortOrder, moveVideoOrder, videoSortOrder } from "/video-grid.js?v=slides-audio";

import { lookupSharedTikTokMedia, mediaCacheKey } from "/tiktok-playback-cache.js?v=slides-audio";
import { normalizeTikTokMedia, tikwmOrigin } from "/lib/tiktok-media.js?v=slides";

const firebaseConfig = { apiKey: "AIzaSyDTTzoJlvr0mYxwx82cQ9JJn8rXrMEy7JA", authDomain: "reps-central.firebaseapp.com", projectId: "reps-central", storageBucket: "reps-central.firebasestorage.app", messagingSenderId: "812299387060", appId: "1:812299387060:web:1c93d1e7bf30b05653d7e1", measurementId: "G-8T7F9F1FZ9" };
const ADMIN_UID = "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";

const app = initializeApp(firebaseConfig);
enableAppCheck(app);
const auth = getAuth(app);
const db = getFirestore(app);
const videosRef = collection(db, "videos");
const draftsRef = collection(db, "videoDrafts");
const get = id => document.getElementById(id);
const form = get("video-editor");
const fields = Object.fromEntries(["title", "tiktokUrl", "caption", "thumbnailUrl", "mediaUrl"]
  .map(name => [name, form.elements.namedItem(name)]));
const grid = get("saved-videos");
const pendingGrid = get("pending-videos");
const results = get("catalog-results");
const pageSize = 24;

let savedVideos = new Map();
let reordering = false;
let orderDraft = null;
let orderStart = "";
let queuedVideos = new Map();
let unsubscribeDrafts = null;
let pollTimer;
let syncing = false;
let publishedReady = false;
let draftsReady = false;
let autoSyncDisabled = false;
let editDrafts = new Map();
let addDraft = newDraft();
let draft = null;
let saving = false;
let unsubscribe = null;
let metadataTimer;
let metadataRequest;
let pickerSource = "all";
let visibleLimit = pageSize;
const catalogues = new Map();
const catalogueRequests = new Map();
const catalogueErrors = new Map();
const availableCatalogue = () => catalogues.get(pickerSource);

function newDraft(video = {}) {
  return {
    id: video.id || "",
    awaiting: video.awaiting === true,
    suggestedTitle: video.suggestedTitle || "",
    tiktokId: video.tiktokId || "",
    mediaUrl: video.mediaUrl || "",
    mediaFile: null,
    version: video.updatedAt || null,
    title: video.title || "",
    tiktokUrl: video.tiktokUrl || "",
    caption: video.caption || "",
    thumbnailUrl: video.thumbnailUrl || "",
    captionAuto: video.captionAuto === true,
    thumbnailAuto: video.thumbnailAuto === true,
    authorAvatar: video.authorAvatar || "", authorHandle: video.authorHandle || "", authorName: video.authorName || "",
    slides: Array.isArray(video.slides) ? video.slides.slice(0, 35).map(slide => ({
      itemIds: Array.isArray(slide?.itemIds) ? [...new Set(slide.itemIds)] : [], noItems: slide?.noItems === true
    })) : [],
    photoMedia: null,
    activeSlide: 0,
    items: new Map(linkedItems(video).map(item => [item.id, item]))
  };
}

function setStatus(id, message = "", error = false) {
  const region = get(id);
  region.textContent = message;
  region.classList.toggle("error", error);
}

function cancelMetadata() {
  clearTimeout(metadataTimer);
  metadataRequest?.controller.abort();
  metadataRequest = null;
}

function renderPreview() {
  const preview = get("thumbnail-preview");
  const url = assetUrl(fields.thumbnailUrl.value);
  preview.hidden = !url;
  if (url && preview.getAttribute("src") !== url) preview.src = url;
  if (!url) preview.removeAttribute("src");
}

function showEditor(nextDraft = null, message = "") {
  cancelMetadata();
  draft = nextDraft;
  form.hidden = !draft;
  get("video-library").hidden = Boolean(draft);
  get("add-tab").setAttribute("aria-pressed", String(Boolean(draft && !draft.id)));
  get("view-tab").setAttribute("aria-pressed", String(!draft || Boolean(draft.id)));
  setStatus("view-status", message);
  if (!draft) return;
  for (const [name, field] of Object.entries(fields)) field.value = draft[name];
  get("editor-heading").textContent = draft.awaiting ? "Confirm video" : draft.id ? "Edit video" : "Add video";
  get("draft-label").hidden = !draft.awaiting;
  fields.title.placeholder = draft.suggestedTitle || "";
  get("video-file").value = "";
  showMediaFile();
  get("delete-video").hidden = !draft.id;
  get("delete-video").textContent = draft.awaiting ? "Dismiss draft" : "Delete video";
  get("save-draft").hidden = Boolean(draft.id && !draft.awaiting);
  get("save-video").textContent = draft.id && !draft.awaiting ? "SAVE" : "GO LIVE";
  get("item-search").value = "";
  visibleLimit = pageSize;
  setPicker(false);
  setStatus("editor-status");
  setStatus("metadata-status");
  renderPreview();
  renderSelected();
  renderCloneSources();
  if (draft.slides.length || isPhotoLink(draft.tiktokUrl)) void fillMetadata();
  fields.title.focus();
}

function isPhotoLink(value) {
  const url = tiktokUrl(value);
  return Boolean(url && new URL(url).pathname.includes("/photo/"));
}

async function lookupPhotoMetadata(url, signal) {
  const response = await fetch(tikwmOrigin + "/api/", {
    method: "POST",
    body: new URLSearchParams({ url }),
    credentials: "omit",
    signal
  });
  if (!response.ok) return null;
  const result = await response.json();
  if (result.code !== 0) return null;
  const media = normalizeTikTokMedia(url, result.data);
  if (!media?.images?.length) return null;
  const handle = String(result.data.author?.unique_id || "");
  const id = String(result.data.id || result.data.video_id || "");
  return {
    ok: true,
    url: /^[a-z\d_.]+$/i.test(handle) && /^\d+$/.test(id) ? "https://www.tiktok.com/@" + handle + "/photo/" + id : url,
    caption: typeof result.data.title === "string" ? result.data.title : "",
    thumbnailUrl: media.images[0],
    slideshow: media,
    authorAvatar: media.authorAvatar, authorHandle: media.authorHandle, authorName: media.authorName
  };
}

function lookupMetadata(url, retry = false) {
  if (metadataRequest?.url === url && !retry) return metadataRequest.promise;
  cancelMetadata();
  const controller = new AbortController();
  const { signal } = controller;
  const readPhoto = () => lookupPhotoMetadata(url, signal).catch(() => null);
  const endpoint = new URL("/api/tiktok-meta", location.origin);
  endpoint.searchParams.set("url", url);
  const promise = (async () => {
    const directPhoto = new URL(url).pathname.includes("/photo/");
    const photo = directPhoto ? await readPhoto() : null;
    if (photo?.caption && photo.thumbnailUrl) return photo;
    const meta = await fetch(endpoint, { signal }).then(async response => {
      const data = await response.json().catch(() => ({}));
      return response.ok && data.ok ? data : null;
    }).catch(() => null);
    if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
    if (meta?.caption && meta.thumbnailUrl && !photo) return meta;
    const shortLink = !new URL(url).pathname.match(/\/(?:video|photo)\/\d+\/?$/);
    const combinedPhoto = photo || (shortLink ? await readPhoto() : null);
    if (combinedPhoto) return {
      ...combinedPhoto,
      caption: combinedPhoto.caption || meta?.caption || "",
      thumbnailUrl: combinedPhoto.thumbnailUrl || meta?.thumbnailUrl || ""
    };
    if (meta) return meta;
    throw new Error("TikTok metadata is unavailable.");
  })();
  metadataRequest = { url, controller, promise };
  return promise;
}

async function fillMetadata({ retry = false } = {}) {
  const currentDraft = draft;
  const url = tiktokUrl(fields.tiktokUrl.value);
  if (!currentDraft || !url) return "Paste a valid TikTok link.";
  if (fields.caption.value.trim() && fields.thumbnailUrl.value.trim() && (!isPhotoLink(url) || currentDraft.photoMedia) && !retry) {
    setStatus("metadata-status", retry ? "Clear a field to fill it again from TikTok." : "");
    return "";
  }

  setStatus("metadata-status", "Fetching caption and thumbnail…");
  try {
    const metadata = await lookupMetadata(url, retry);
    if (draft !== currentDraft || tiktokUrl(fields.tiktokUrl.value) !== url) return "";
    const canonical = tiktokUrl(metadata.url);
    for (const field of ["authorAvatar", "authorHandle", "authorName"]) {
      if (metadata[field]) currentDraft[field] = metadata[field];
    }
    if (metadata.slideshow) {
      currentDraft.photoMedia = metadata.slideshow;
      for (let index = currentDraft.slides.length; index < metadata.slideshow.images.length; index++) {
        currentDraft.slides.push({ itemIds: [], noItems: false });
      }
      renderSelected();
    }
    if (canonical && new URL(canonical).pathname.includes("/photo/") && canonical !== url) {
      fields.tiktokUrl.value = currentDraft.tiktokUrl = canonical;
    }
    if (!fields.caption.value.trim() && metadata.caption) {
      fields.caption.value = draft.caption = metadata.caption;
      draft.captionAuto = true;
    }
    if (!fields.thumbnailUrl.value.trim() && assetUrl(metadata.thumbnailUrl)) {
      fields.thumbnailUrl.value = draft.thumbnailUrl = metadata.thumbnailUrl;
      draft.thumbnailAuto = true;
      renderPreview();
    }
    const missing = fields.caption.value.trim() && fields.thumbnailUrl.value.trim()
      ? "" : "TikTok did not provide all metadata. You can fill the remaining fields manually.";
    setStatus("metadata-status", missing || "TikTok metadata loaded.");
    return missing;
  } catch (error) {
    if (error.name === "AbortError" || draft !== currentDraft || tiktokUrl(fields.tiktokUrl.value) !== url) return "";
    const message = "TikTok metadata couldn’t be loaded. You can enter the caption and thumbnail manually.";
    setStatus("metadata-status", message, true);
    return message;
  }
}

function onUrlInput() {
  cancelMetadata();
  setStatus("metadata-status");
  if (draft.captionAuto) fields.caption.value = draft.caption = "";
  if (draft.thumbnailAuto) fields.thumbnailUrl.value = draft.thumbnailUrl = "";
  draft.captionAuto = draft.thumbnailAuto = false;
  draft.photoMedia = null;
  draft.authorAvatar = draft.authorHandle = draft.authorName = "";
  if (isPhotoLink(fields.tiktokUrl.value) && !draft.slides.length) draft.slides.push({ itemIds: [], noItems: false });
  renderSelected();
  renderPreview();
  if (tiktokUrl(fields.tiktokUrl.value)) metadataTimer = setTimeout(() => void fillMetadata(), 450);
}

function productSnapshot(item, source) {
  return {
    id: String(item.id),
    ...(source === "video" ? { collection: "videoproducts" } : {}),
    name: String(item.name || item.title || "Unnamed item"),
    category: String(item.category || ""),
    imageUrl: String(item.imageUrl || item.image || ""),
    agentUrl: assetUrl(item.agentUrl || item.agentLink || item.productUrl),
    price: item.price ?? item.priceCny ?? ""
  };
}

function currentSlide() {
  return draft.slides[draft.activeSlide];
}

function renderSelected() {
  const isPhoto = isPhotoLink(draft.tiktokUrl) || Boolean(draft.photoMedia);
  const slide = isPhoto ? currentSlide() : null;
  get("slide-controls").hidden = !isPhoto;
  if (isPhoto) {
    if (!draft.slides.length) draft.slides.push({ itemIds: [], noItems: false });
    get("slide-count").value = draft.slides.length;
    get("slide-choice").innerHTML = draft.slides.map((_, index) => '<option value="' + index + '">Slide ' + (index + 1) + '</option>').join("");
    get("slide-choice").value = draft.activeSlide;
    get("slide-empty").checked = currentSlide().noItems;
    get("slide-empty").disabled = currentSlide().itemIds.length > 0;
  }
  const group = isPhoto ? currentSlide() : slide;
  const ids = group ? group.itemIds : [...draft.items.keys()];
  get("selected-count").textContent = ids.length + (ids.length === 1 ? " item selected" : " items selected");
  get("item-order-hint").hidden = ids.length < 2;
  get("selected-items").innerHTML = ids.map(id => {
    const item = draft.items.get(id);
    const name = item?.name || availableCatalogue()?.byId.get(id)?.name || id;
    const image = assetUrl(item?.imageUrl);
    return `<div class="selected-item-card" role="listitem" tabindex="0" data-selected-id="${escapeHtml(id)}" aria-label="${escapeHtml(name)}">
      <span aria-hidden="true">⠿</span>
      ${image ? '<img alt="" loading="lazy" src="' + escapeHtml(image) + '">' : ""}
      <span>${escapeHtml(name)}</span><button class="btn remove-item" type="button" data-unadd="${escapeHtml(id)}" aria-label="Unadd ${escapeHtml(name)}">×</button>
    </div>`;
  }).join("");
}

function renderCloneSources() {
  const select = get("clone-source");
  const previous = select.value;
  const videos = publishedVideos().filter(video => video.id !== draft?.id && linkedItems(video).length);
  select.innerHTML = '<option value="">Choose a video</option>' + videos.map(video =>
    '<option value="' + escapeHtml(video.id) + '">' + escapeHtml(video.title || "Untitled video") + '</option>').join("");
  if (videos.some(video => video.id === previous)) select.value = previous;
  get("clone-items").disabled = !select.value;
}

get("clone-source").addEventListener("change", event => {
  get("clone-items").disabled = !event.target.value;
});
get("clone-items").addEventListener("click", () => {
  if (!draft || saving) return;
  const source = savedVideos.get(get("clone-source").value);
  if (!source || source.id === draft.id) return;
  const originals = new Map(linkedItems(source).map(item => [item.id, item]));
  const slides = Array.isArray(source.slides) ? source.slides : [];
  const sourceOrder = [...new Set([
    ...slides.flatMap(slide => Array.isArray(slide?.itemIds) && !slide.noItems ? slide.itemIds : []),
    ...originals.keys()
  ])];
  const slide = isPhotoLink(draft.tiktokUrl) || draft.photoMedia ? currentSlide() : null;
  let added = 0;
  for (const id of sourceOrder) {
    const item = originals.get(id);
    if (!item || (slide ? slide.itemIds.includes(id) : draft.items.has(id))) continue;
    if (!draft.items.has(id)) draft.items.set(id, { ...item });
    if (slide) {
      slide.itemIds.push(id);
      slide.noItems = false;
    }
    added++;
  }
  renderSelected();
  renderCatalogue();
  setStatus("editor-status", added ? added + (added === 1 ? " item copied." : " items copied.") : "Those items are already selected.");
});


get("slide-choice").addEventListener("change", event => {
  draft.activeSlide = Number(event.target.value);
  renderSelected();
  renderCatalogue();
});
get("slide-count").addEventListener("change", event => {
  const count = Number(event.target.value);
  if (!Number.isInteger(count) || count < 1 || count > 35 || draft.slides.slice(count).some(slide => slide.itemIds.length)) {
    event.target.value = draft.slides.length;
    setStatus("editor-status", "Remove any items from the slides you want to delete first.", true);
    return;
  }
  draft.slides.length = Math.min(draft.slides.length, count);
  while (draft.slides.length < count) draft.slides.push({ itemIds: [], noItems: false });
  draft.activeSlide = Math.min(draft.activeSlide, count - 1);
  renderSelected();
  renderCatalogue();
});
get("slide-empty").addEventListener("change", event => {
  const slide = currentSlide();
  if (slide && !slide.itemIds.length) slide.noItems = event.target.checked;
});

function removeSelectedItem(id) {
  const slide = isPhotoLink(draft.tiktokUrl) || draft.photoMedia ? currentSlide() : null;
  if (slide) slide.itemIds = slide.itemIds.filter(value => value !== id);
  if (!slide || !draft.slides.some(group => group.itemIds.includes(id))) draft.items.delete(id);
}

async function loadCatalogue(source = pickerSource) {
  if (catalogues.has(source) || catalogueRequests.has(source)) return;
  catalogueErrors.delete(source);
  const pending = (async () => {
    const album = source === "video" ? "video" : "spreadsheet";
    const response = await fetch("/api/catalog?album=" + album + "&ts=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("Catalogue returned " + response.status);
    const records = (await response.json()).products;
    if (!Array.isArray(records)) throw new Error("Invalid catalogue");
    const products = records.filter(item => item?.id && item.isActive !== false &&
      String(item.category || "").trim().toLowerCase() !== "uncategorised");
    products.sort((left, right) => (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0));
    catalogues.set(source, {
      products: products.map(item => ({ item, search: [item.name, item.brand, item.category, item.id, ...(Array.isArray(item.tags) ? item.tags : [])].join(" ").toLowerCase() })),
      byId: new Map(products.map(item => [String(item.id), item]))
    });
  })();
  catalogueRequests.set(source, pending);
  renderCatalogue();
  try {
    await pending;
    if (draft) renderSelected();
  } catch {
    catalogueErrors.set(source, source === "video" ? "Couldn’t load the Video Items cache. Try again." :
      "Couldn’t load the spreadsheet catalogue. Try again.");
  } finally {
    catalogueRequests.delete(source);
    renderCatalogue();
  }
}

function setPicker(open) {
  get("picker").hidden = !open;
  get("toggle-items").setAttribute("aria-expanded", String(open));
  get("toggle-items").textContent = open ? "Hide item picker" : "Add items";
  if (open) chooseSource("all");
}

function chooseSource(source) {
  pickerSource = source;
  visibleLimit = pageSize;
  renderCatalogue();
  void loadCatalogue(source);
}

function renderCatalogue() {
  get("all-items").setAttribute("aria-pressed", String(pickerSource === "all"));
  get("video-items").setAttribute("aria-pressed", String(pickerSource === "video"));
  get("catalog-search").hidden = false;
  get("more-items").hidden = true;
  get("retry-catalog").hidden = true;
  results.replaceChildren();
  if (!draft || get("picker").hidden) return;
  const catalogue = availableCatalogue();
  const catalogueError = catalogueErrors.get(pickerSource);
  if (!catalogue) {
    setStatus("catalog-status", catalogueError || "Loading items…", Boolean(catalogueError));
    get("retry-catalog").hidden = !catalogueError;
    return;
  }

  const tokens = get("item-search").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = catalogue.products.filter(entry => tokens.every(token => entry.search.includes(token)));
  setStatus("catalog-status", matches.length ? "Showing " + Math.min(visibleLimit, matches.length) + " of " + matches.length.toLocaleString() + " items" : "No matching items.");
  results.innerHTML = matches.slice(0, visibleLimit).map(({ item }) => {
    const name = item.name || "Unnamed item";
    const thumbnail = assetUrl(item.imageUrl || item.image);
    const add = pickerAction(item.id);
    const price = item.price == null || item.price === "" ? "" : String(item.price);
    const priceLabel = price && !price.startsWith("¥") ? "¥" + price : price;
    return '<article class="product-card"><div class="product-top">' +
      (thumbnail ? '<img src="' + escapeHtml(thumbnail) + '" alt="" loading="lazy" onerror="this.remove()">' : 'Image unavailable') +
      '</div><div class="product-body"><div class="product-name">' + escapeHtml(name) +
      '</div><div class="product-meta"><strong>' + escapeHtml(priceLabel) + '</strong> ' + escapeHtml(item.category || "") +
      '</div><button class="btn primary" type="button" data-pick="' + escapeHtml(item.id) +
      '" aria-label="' + add + ' ' + escapeHtml(name) + '">' + add + '</button></div></article>';
  }).join("");
  get("more-items").hidden = matches.length <= visibleLimit;
}

function pickerAction(id) {
  const current = draft.items.get(String(id));
  const slide = isPhotoLink(draft.tiktokUrl) || draft.photoMedia ? currentSlide() : null;
  if (!current || (slide && !slide.itemIds.includes(String(id)))) return "ADD";
  return (current.collection === "videoproducts") === (pickerSource === "video") ? "UNADD" : "USE THIS VERSION";
}

function syncPickButton(button, item) {
  const label = pickerAction(item.id);
  button.textContent = label;
  button.setAttribute("aria-label", label + " " + (item.name || "Unnamed item"));
}

function lockControls(lock) {
  saving = lock;
  for (const control of [...form.elements, get("add-tab"), get("view-tab"), get("sign-out")]) control.disabled = lock;
  get("save-video").textContent = lock ? "WORKING…" : draft?.id && !draft.awaiting ? "SAVE" : "GO LIVE";
}

function sameVersion(left, right) {
  return left?.seconds === right?.seconds && left?.nanoseconds === right?.nanoseconds;
}

function tiktokId(video) {
  const url = tiktokUrl(video.tiktokUrl);
  return String(video.tiktokId || "") || (url ? new URL(url).pathname.match(/\/(?:video|photo)\/(\d+)\/?$/)?.[1] || "" : "");
}

function startPolling() {
  if (!publishedReady || !draftsReady || pollTimer) return;
  void syncTikTok();
  pollTimer = setInterval(() => {
    if (!document.hidden && !autoSyncDisabled) void syncTikTok();
  }, 5 * 60 * 1000);
}

async function syncTikTok(manual = false) {
  const admin = auth.currentUser;
  if (syncing || !admin || !publishedReady || !draftsReady || (autoSyncDisabled && !manual)) return;
  syncing = true;
  const button = get("sync-tiktok");
  button.disabled = true;
  setStatus("sync-status", "Checking TikTok…");
  try {
    const response = await fetch("/api/tiktok-inbox", {
      headers: { Authorization: "Bearer " + await admin.getIdToken() }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "TikTok sync could not run.");
    if (auth.currentUser !== admin) return;
    if (!data.configured) {
      autoSyncDisabled = true;
      setStatus("sync-status", "Connect TikTok in Cloudflare to import new public posts automatically.");
      return;
    }
    autoSyncDisabled = false;

    const known = new Set([...savedVideos.values(), ...queuedVideos.values()].map(tiktokId).filter(Boolean));
    let imported = 0;
    for (const entry of data.videos || []) {
      if (auth.currentUser !== admin) break;
      const url = tiktokUrl(entry.tiktokUrl);
      if (!url || !/^\d+$/.test(entry.id) || known.has(entry.id)) continue;
      const id = "tiktok-" + entry.id;
      const queued = doc(draftsRef, id);
      const live = doc(videosRef, id);
      const inserted = await runTransaction(db, async transaction => {
        const [draftDoc, liveDoc] = await Promise.all([transaction.get(queued), transaction.get(live)]);
        if (draftDoc.exists() || liveDoc.exists()) return false;
        transaction.set(queued, {
          status: "awaiting", tiktokId: entry.id, tiktokUrl: url,
          title: "", suggestedTitle: entry.suggestedTitle || "",
          caption: entry.caption || "", thumbnailUrl: entry.thumbnailUrl || "",
          captionAuto: Boolean(entry.caption), thumbnailAuto: Boolean(entry.thumbnailUrl),
          postedAt: entry.postedAt || 0, itemIds: [], items: [],
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        return true;
      });
      if (inserted) imported += 1;
      known.add(entry.id);
    }
    if (auth.currentUser === admin) setStatus("sync-status", imported ? imported + " new post(s) awaiting confirmation." : "No new public posts found.");
  } catch (error) {
    if (auth.currentUser === admin) setStatus("sync-status", error.message || "TikTok sync failed.", true);
  } finally {
    syncing = false;
    button.disabled = false;
  }
}

async function invalidateVideoFeed() {
  try {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch("/api/videos-feed", { method: "POST", headers: { Authorization: "Bearer " + token } });
    if (response.ok) return "";
  } catch {}
  return " The public video cache couldn’t be refreshed.";
}

function publishedVideos() {
  return sortVideos([...savedVideos.values()].filter(video => video.isActive !== false));
}

const orderMode = get("reorder-mode");
const startOrder = get("start-reorder");
const saveOrder = get("save-order");
const selectedItems = get("selected-items");

function bindCardReorder(container, selector, enabled, onMove) {
  let drag = null;
  const cardAt = target => {
    const card = target?.closest(selector);
    return card?.parentElement === container ? card : null;
  };
  function move(card, delta) {
    if (!delta) return;
    const id = card.dataset.videoId || card.dataset.selectedId;
    onMove(id, delta);
    const moved = [...container.querySelectorAll(selector)].find(item => (item.dataset.videoId || item.dataset.selectedId) === id);
    moved?.focus({ preventScroll: true });
  }

  container.addEventListener("pointerdown", event => {
    if (drag || !enabled() || event.button !== 0 || event.target.closest(".remove-item")) return;
    const card = cardAt(event.target);
    if (!card) return;
    container.setPointerCapture(event.pointerId);
    card.classList.add("dragging");
    drag = { card, target: card, pointerId: event.pointerId };
    event.preventDefault();
  });
  container.addEventListener("pointermove", event => {
    if (drag?.pointerId !== event.pointerId) return;
    const row = cardAt(document.elementFromPoint(event.clientX, event.clientY));
    if (!row || row === drag.target) return;
    drag.target.classList.remove("drop-target");
    drag.target = row;
    row.classList.add("drop-target");
  });
  function finish(event) {
    if (drag?.pointerId !== event.pointerId) return;
    const { card, target } = drag;
    drag = null;
    card.classList.remove("dragging");
    target.classList.remove("drop-target");
    if (event.type !== "pointerup" || !enabled()) return;
    const cards = [...container.querySelectorAll(selector)];
    move(card, cards.indexOf(target) - cards.indexOf(card));
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) container.addEventListener(type, finish);
  container.addEventListener("keydown", event => {
    if (!enabled()) return;
    const card = cardAt(event.target);
    if (!card || event.target !== card) return;
    const delta = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key];
    if (!delta) return;
    event.preventDefault();
    move(card, delta);
  });
}

function orderVersion(videos) {
  return JSON.stringify(videos.map(video => [video.id, videoSortOrder(video)]));
}

function renderOrderMode() {
  orderMode.hidden = !orderDraft;
  startOrder.checked = Boolean(orderDraft);
  grid.classList.toggle("is-reordering", Boolean(orderDraft));
  const original = publishedVideos();
  saveOrder.disabled = !orderDraft || reordering || orderDraft.every((video, index) => video.id === original[index]?.id);
}

function drawPublishedVideos() {
  const videos = publishedVideos();
  renderVideoGrid(grid, orderDraft || videos, "No published videos yet.");
  get("reorder-videos").hidden = videos.length < 2;
  renderOrderMode();
  if (draft) renderCloneSources();
}

startOrder.addEventListener("change", () => {
  if (reordering) return;
  orderDraft = startOrder.checked ? publishedVideos().map(video => ({ ...video })) : null;
  orderStart = orderDraft ? orderVersion(orderDraft) : "";
  drawPublishedVideos();
});
get("cancel-order").addEventListener("click", () => {
  if (reordering) return;
  orderDraft = null;
  drawPublishedVideos();
  startOrder.focus();
});

function stageVideoMove(id, delta) {
  if (!orderDraft || !delta || reordering) return;
  const changes = new Map(moveVideoOrder(orderDraft, id, delta).map(change => [change.id, change.sortOrder]));
  if (!changes.size) return;
  orderDraft = sortVideos(orderDraft.map(video => changes.has(video.id) ? { ...video, sortOrder: changes.get(video.id) } : video));
  const tiles = new Map([...grid.children].map(tile => [tile.dataset.videoId, tile]));
  if (orderDraft.some(video => !tiles.has(video.id))) {
    drawPublishedVideos();
    return;
  }
  for (const video of orderDraft) grid.append(tiles.get(video.id));
  renderOrderMode();
}

bindCardReorder(grid, "[data-video-id]", () => Boolean(orderDraft) && !reordering, stageVideoMove);
bindCardReorder(selectedItems, "[data-selected-id]", () => Boolean(draft) && !saving, (id, delta) => {
  const slide = isPhotoLink(draft.tiktokUrl) || draft.photoMedia ? currentSlide() : null;
  const ids = slide ? [...slide.itemIds] : [...draft.items.keys()];
  const index = ids.indexOf(id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= ids.length) return;
  ids.splice(next, 0, ids.splice(index, 1)[0]);
  if (slide) slide.itemIds = ids;
  else draft.items = new Map(ids.map(key => [key, draft.items.get(key)]));
  renderSelected();
});

saveOrder.addEventListener("click", async () => {
  if (!orderDraft || reordering) return;
  const existing = publishedVideos();
  if (orderVersion(existing) !== orderStart) {
    setStatus("view-status", "The video list changed. Turn on Rearrange mode again and retry.", true);
    orderDraft = null;
    drawPublishedVideos();
    return;
  }
  const before = new Map(existing.map(video => [video.id, videoSortOrder(video)]));
  const changes = orderDraft.filter(video => before.get(video.id) !== videoSortOrder(video));
  if (!changes.length || changes.length > 500) return;
  reordering = true;
  saveOrder.disabled = true;
  try {
    const batch = writeBatch(db);
    for (const video of changes) batch.update(doc(videosRef, video.id), { sortOrder: videoSortOrder(video) });
    await batch.commit();
    orderDraft = null;
    setStatus("view-status", "Video order saved." + await invalidateVideoFeed());
  } catch {
    setStatus("view-status", "Couldn’t save the video order.", true);
  } finally {
    reordering = false;
    drawPublishedVideos();
  }
});

function resubscribe() {
  unsubscribe?.();
  gridMessage(grid, "Loading videos…");
  unsubscribe = onSnapshot(videosRef, snapshot => {
    const videos = sortVideos(snapshot.docs.map(entry => ({ ...entry.data(), id: entry.id })));
    savedVideos = new Map(videos.map(video => [video.id, video]));
    drawPublishedVideos();
    publishedReady = true;
    startPolling();
  }, () => gridMessage(grid, "Couldn’t load videos. Refresh or check your Firestore permissions."));

  unsubscribeDrafts?.();
  unsubscribeDrafts = onSnapshot(draftsRef, snapshot => {
    const entries = snapshot.docs.map(entry => ({ ...entry.data(), id: entry.id, awaiting: true }));
    queuedVideos = new Map(entries.map(video => [video.id, video]));
    const pending = entries.filter(video => video.status !== "dismissed")
      .sort((left, right) => (right.postedAt || right.createdAt?.seconds || 0) - (left.postedAt || left.createdAt?.seconds || 0))
      .map(video => ({ ...video, title: video.title || video.suggestedTitle || video.caption || "New TikTok post" }));
    renderVideoGrid(pendingGrid, pending, "No videos awaiting confirmation.");
    draftsReady = true;
    startPolling();
  }, () => {
    draftsReady = false;
    gridMessage(pendingGrid, "The private videoDrafts collection needs admin read and write access.");
  });
}

form.addEventListener("input", event => {
  const name = event.target.name;
  if (!draft || !Object.hasOwn(fields, name)) return;
  const value = event.target.value;
  const previousUrl = name === "tiktokUrl" ? tiktokUrl(draft.tiktokUrl) : "";
  draft[name] = value;
  if (name === "tiktokUrl" && previousUrl !== tiktokUrl(value)) onUrlInput();
  if (name === "caption") draft.captionAuto = false;
  if (name === "thumbnailUrl") {
    draft.thumbnailAuto = false;
    renderPreview();
  }
});

function showMediaFile() {
  get("video-file-status").textContent = draft.mediaFile
    ? draft.mediaFile.name + " will upload when you publish or save a published video."
    : "MP4 or WebM up to 90 MB. The file uploads when you publish or save a published video.";
}

function mediaSource(value) {
  const source = value.trim();
  if (!source || (!source.startsWith("/") && !source.startsWith("https://"))) return "";
  return assetUrl(source);
}

async function uploadMedia(file) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in before uploading a file.");
  const type = /\.webm$/i.test(file.name) ? "video/webm" : /\.mp4$/i.test(file.name) ? "video/mp4" : file.type;
  if (!["video/mp4", "video/webm"].includes(type)) throw new Error("Choose an MP4 or WebM file.");
  if (file.size > 90 * 1024 * 1024) throw new Error("Choose a video file of 90 MB or smaller.");
  setStatus("editor-status", "Uploading your original video…");
  const response = await fetch("/api/video-media", {
    method: "PUT", body: file,
    headers: { "Content-Type": type, Authorization: "Bearer " + await user.getIdToken() }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !mediaSource(data.url || "")) throw new Error(data.error || "The original video couldn’t be uploaded.");
  return data.url;
}

get("video-file").addEventListener("change", event => {
  if (!draft) return;
  draft.mediaFile = event.target.files?.[0] || null;
  showMediaFile();
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (saving || !draft) return;
  const title = fields.title.value.trim();
  const rawUrl = fields.tiktokUrl.value.trim();
  let url = tiktokUrl(rawUrl);
  const rawMedia = fields.mediaUrl.value.trim();
  const source = mediaSource(rawMedia);
  const pending = event.submitter?.id === "save-draft" && !(draft.id && !draft.awaiting);
  if (rawUrl && !url) {
    setStatus("editor-status", "Enter a valid public TikTok post link.", true);
    return;
  }
  if (rawMedia && !source) {
    setStatus("editor-status", "Enter an HTTPS video URL.", true);
    return;
  }
  if (!pending && (!draft.id || draft.awaiting) && !publishedReady) {
    setStatus("editor-status", "Wait for the published video list to load, then try again.", true);
    return;
  }
  if (!pending && (!title || !(url || source || draft.mediaFile))) {
    setStatus("editor-status", "Enter a name and add a TikTok link or original video.", true);
    return;
  }
  if (pending && draft.mediaFile && !url && !source) {
    setStatus("editor-status", "To save this draft, add a TikTok link or a hosted video URL. The selected file uploads when you go live.", true);
    return;
  }

  const savingDraft = draft;
  lockControls(true);
  setStatus("editor-status");
  try {
    const metadataWarning = url ? await fillMetadata() : "";
    if (draft !== savingDraft) return;
    url = tiktokUrl(fields.tiktokUrl.value);
    const thumbnail = fields.thumbnailUrl.value.trim();
    if (thumbnail && !assetUrl(thumbnail)) throw new Error("Enter a valid thumbnail URL.");
    const items = [...savingDraft.items.values()];
    let mediaUrl = source;
    if (!pending && savingDraft.mediaFile) {
      mediaUrl = await uploadMedia(savingDraft.mediaFile);
      if (draft !== savingDraft) return;
      savingDraft.mediaFile = null;
      savingDraft.mediaUrl = mediaUrl;
      fields.mediaUrl.value = mediaUrl;
      get("video-file").value = "";
      showMediaFile();
    }
    const changes = {
      title, tiktokUrl: url, mediaUrl,
      authorAvatar: savingDraft.authorAvatar, authorHandle: savingDraft.authorHandle, authorName: savingDraft.authorName,
      slides: isPhotoLink(url) ? savingDraft.slides : [],
      caption: fields.caption.value.trim(), thumbnailUrl: thumbnail,
      captionAuto: savingDraft.captionAuto, thumbnailAuto: savingDraft.thumbnailAuto,
      itemIds: items.map(item => item.id), items,
      updatedAt: serverTimestamp()
    };
    const newPosition = !pending && (!savingDraft.id || savingDraft.awaiting) ? nextVideoSortOrder(savedVideos.values()) : null;
    let publishedId = savingDraft.id;
    const fromDraft = savingDraft.awaiting ? doc(draftsRef, savingDraft.id) : null;
    if (pending && !fromDraft) {
      await addDoc(draftsRef, { ...changes, status: "awaiting", createdAt: serverTimestamp() });
      addDraft = newDraft();
    } else if (fromDraft) {
      const target = doc(videosRef, savingDraft.id);
      await runTransaction(db, async transaction => {
        const queued = await transaction.get(fromDraft);
        const existing = pending ? null : await transaction.get(target);
        if (!queued.exists() || !sameVersion(savingDraft.version, queued.data().updatedAt)) {
          throw new Error("This draft changed elsewhere. Reopen it before saving.");
        }
        if (pending) {
          transaction.update(fromDraft, changes);
        } else {
          if (existing.exists()) throw new Error("This video is already published.");
          transaction.set(target, {
            ...changes, tiktokId: tiktokId({ ...savingDraft, tiktokUrl: url }),
            sortOrder: newPosition, isActive: true, createdAt: serverTimestamp()
          });
          transaction.delete(fromDraft);
        }
      });
      editDrafts.delete(savingDraft.id);
    } else if (savingDraft.id) {
      const ref = doc(videosRef, savingDraft.id);
      await runTransaction(db, async transaction => {
        const existing = await transaction.get(ref);
        if (!existing.exists() || !sameVersion(savingDraft.version, existing.data().updatedAt)) {
          throw new Error("This video changed elsewhere. Reopen it before saving.");
        }
        transaction.update(ref, { ...changes, tiktokId: tiktokId({ tiktokUrl: url }) });
      });
      editDrafts.delete(savingDraft.id);
    } else {
      const entry = await addDoc(videosRef, { ...changes, sortOrder: newPosition, tiktokId: tiktokId({ tiktokUrl: url }), isActive: true, createdAt: serverTimestamp() });
      publishedId = entry.id;
      addDraft = newDraft();
    }
    const cacheWarning = pending ? "" : await invalidateVideoFeed();
    if (!pending && publishedId && url && savingDraft.photoMedia) {
      const body = JSON.stringify({ id: publishedId, url: mediaCacheKey(url), slideshow: savingDraft.photoMedia, renew: true });
      void auth.currentUser.getIdToken().then(token => fetch("/api/tiktok-playback", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body,
        keepalive: body.length < 60000
      })).catch(() => {});
    }
    if (!pending && publishedId && url && !mediaUrl && !new URL(url).pathname.includes("/photo/")) {
      void lookupSharedTikTokMedia(publishedId, mediaCacheKey(url), AbortSignal.timeout?.(12000)).catch(() => {});
    }
    if (draft === savingDraft) {
      const status = pending ? "Draft saved." : savingDraft.id && !savingDraft.awaiting ? "Video saved." : "Video is live.";
      const fileNote = pending && savingDraft.mediaFile ? " Select the original file again when you publish." : "";
      showEditor(null, status + (metadataWarning ? " " + metadataWarning : "") + fileNote + cacheWarning);
      get("view-tab").focus();
    }
  } catch (error) {
    setStatus("editor-status", error.message || "Couldn’t save the video.", true);
  } finally {
    lockControls(false);
  }
});

get("add-tab").addEventListener("click", () => { if (draft !== addDraft) showEditor(addDraft); });
get("view-tab").addEventListener("click", () => { if (draft) showEditor(); });
get("discard-video").addEventListener("click", () => {
  if (draft.id) editDrafts.delete(draft.id);
  else addDraft = newDraft();
  showEditor();
  get("view-tab").focus();
});
get("delete-video").addEventListener("click", async () => {
  if (!draft?.id || saving || !confirm(draft.awaiting ? "Dismiss this draft?" : "Delete this video from the public Videos page?")) return;
  const deletingDraft = draft;
  lockControls(true);
  try {
    if (deletingDraft.awaiting) {
      const ref = doc(draftsRef, deletingDraft.id);
      await runTransaction(db, async transaction => {
        const entry = await transaction.get(ref);
        if (!entry.exists() || !sameVersion(deletingDraft.version, entry.data().updatedAt)) {
          throw new Error("The draft changed elsewhere. Reopen it before dismissing.");
        }
        if (deletingDraft.tiktokId) transaction.set(ref, {
          tiktokId: deletingDraft.tiktokId, status: "dismissed", updatedAt: serverTimestamp()
        });
        else transaction.delete(ref);
      });
    } else {
      const ref = doc(videosRef, deletingDraft.id);
      const sourceId = tiktokId(deletingDraft);
      await runTransaction(db, async transaction => {
        const entry = await transaction.get(ref);
        if (!entry.exists() || !sameVersion(deletingDraft.version, entry.data().updatedAt)) {
          throw new Error("This video changed elsewhere. Reopen it before deleting.");
        }
        if (/^\d+$/.test(sourceId)) {
          transaction.set(doc(draftsRef, "tiktok-" + sourceId), {
            tiktokId: sourceId, status: "dismissed", updatedAt: serverTimestamp()
          }, { merge: true });
        }
        transaction.delete(ref);
      });
    }
    editDrafts.delete(deletingDraft.id);
    const cacheWarning = deletingDraft.awaiting ? "" : await invalidateVideoFeed();
    if (draft === deletingDraft) showEditor(null, (deletingDraft.awaiting ? "Draft dismissed." : "Video deleted.") + cacheWarning);
  } catch (error) {
    setStatus("editor-status", error.message || "Couldn’t delete the video.", true);
  } finally {
    lockControls(false);
  }
});
get("video-library").addEventListener("click", event => {
  if (orderDraft && event.target.closest("#saved-videos")) return;
  const id = event.target.closest("[data-video-id]")?.dataset.videoId;
  const video = queuedVideos.get(id) || savedVideos.get(id);
  if (!video) return;
  if (!editDrafts.has(id)) editDrafts.set(id, newDraft(video));
  showEditor(editDrafts.get(id));
});
get("sync-tiktok").addEventListener("click", () => void syncTikTok(true));
get("fetch-metadata").addEventListener("click", () => {
  if (!tiktokUrl(fields.tiktokUrl.value)) {
    setStatus("metadata-status", "Paste a valid TikTok link.", true);
    return;
  }
  void fillMetadata({ retry: true });
});
get("thumbnail-preview").addEventListener("error", event => { event.currentTarget.hidden = true; });
get("toggle-items").addEventListener("click", () => setPicker(get("picker").hidden));
get("all-items").addEventListener("click", () => chooseSource("all"));
get("video-items").addEventListener("click", () => chooseSource("video"));
get("retry-catalog").addEventListener("click", () => void loadCatalogue());
get("item-search").addEventListener("input", () => { visibleLimit = pageSize; renderCatalogue(); });
get("more-items").addEventListener("click", () => { visibleLimit += pageSize; renderCatalogue(); });
results.addEventListener("click", event => {
  const button = event.target.closest("[data-pick]");
  const item = availableCatalogue()?.byId.get(button?.dataset.pick);
  if (!item || saving) return;
  const id = String(item.id);
  if (pickerAction(id) === "UNADD") removeSelectedItem(id);
  else {
    draft.items.set(id, productSnapshot(item, pickerSource));
    const slide = isPhotoLink(draft.tiktokUrl) || draft.photoMedia ? currentSlide() : null;
    if (slide) {
      slide.noItems = false;
      if (!slide.itemIds.includes(id)) slide.itemIds.push(id);
    }
  }
  syncPickButton(button, item);
  renderSelected();
});
get("selected-items").addEventListener("click", event => {
  const button = event.target.closest("[data-unadd]");
  if (!button || saving) return;
  const id = button.dataset.unadd;
  removeSelectedItem(id);
  renderSelected();
  const cardButton = [...results.querySelectorAll("[data-pick]")].find(result => result.dataset.pick === id);
  if (cardButton) syncPickButton(cardButton, availableCatalogue().byId.get(id));
  get("toggle-items").focus();
});
get("sign-out").addEventListener("click", () => {
  signOut(auth).catch(() => setStatus(draft ? "editor-status" : "view-status", "Couldn’t sign out.", true));
});

onAuthStateChanged(auth, user => {
  const allowed = user?.uid === ADMIN_UID;
  get("lock").hidden = allowed;
  get("manager").hidden = !allowed;
  get("sign-out").hidden = !allowed;
  if (allowed) {
    catalogues.clear();
    catalogueErrors.clear();
    showEditor();
    resubscribe();
  } else {
    setStatus("auth-status", "An admin session is required.");
    unsubscribe?.();
    unsubscribe = null;
    unsubscribeDrafts?.();
    unsubscribeDrafts = null;
    clearInterval(pollTimer);
    pollTimer = null;
    publishedReady = draftsReady = autoSyncDisabled = false;
    savedVideos.clear();
    orderDraft = null;
    queuedVideos.clear();
    editDrafts.clear();
    addDraft = newDraft();
    showEditor();
  }
});
