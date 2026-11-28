import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, onSnapshot, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { enableAppCheck } from "/firebase-app-check.js?v=2026-07-01-preview-skip";
import { assetUrl, escapeHtml, gridMessage, linkedItems, renderVideoGrid, sortVideos, tiktokUrl } from "/video-grid.js";

import { lookupSharedTikTokMedia, mediaCacheKey } from "/tiktok-playback-cache.js?v=prewarm";

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
const fields = Object.fromEntries(["title", "sortOrder", "tiktokUrl", "caption", "thumbnailUrl", "mediaUrl"]
  .map(name => [name, form.elements.namedItem(name)]));
const grid = get("saved-videos");
const pendingGrid = get("pending-videos");
const results = get("catalog-results");
const pageSize = 24;

let savedVideos = new Map();
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
    sortOrder: video.sortOrder ?? 0,
    tiktokUrl: video.tiktokUrl || "",
    caption: video.caption || "",
    thumbnailUrl: video.thumbnailUrl || "",
    captionAuto: video.captionAuto === true,
    thumbnailAuto: video.thumbnailAuto === true,
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
  fields.title.focus();
}

function lookupMetadata(url, retry = false) {
  if (metadataRequest?.url === url && !retry) return metadataRequest.promise;
  cancelMetadata();
  const controller = new AbortController();
  const endpoint = new URL("/api/tiktok-meta", location.origin);
  endpoint.searchParams.set("url", url);
  const promise = fetch(endpoint, { signal: controller.signal }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "TikTok metadata is unavailable.");
    return data;
  });
  metadataRequest = { url, controller, promise };
  return promise;
}

async function fillMetadata({ retry = false } = {}) {
  const currentDraft = draft;
  const url = tiktokUrl(fields.tiktokUrl.value);
  if (!currentDraft || !url) return "Paste a valid TikTok link.";
  if (fields.caption.value.trim() && fields.thumbnailUrl.value.trim()) {
    setStatus("metadata-status", retry ? "Clear a field to fill it again from TikTok." : "");
    return "";
  }

  setStatus("metadata-status", "Fetching caption and thumbnail…");
  try {
    const metadata = await lookupMetadata(url, retry);
    if (draft !== currentDraft || tiktokUrl(fields.tiktokUrl.value) !== url) return "";
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

function renderSelected() {
  const count = draft.items.size;
  get("selected-count").textContent = count === 1 ? "1 item selected" : count + " items selected";
  get("selected-items").innerHTML = [...draft.items.values()].map(item => {
    const name = item.name || availableCatalogue()?.byId.get(item.id)?.name || item.id;
    return '<button class="btn" type="button" data-unadd="' + escapeHtml(item.id) +
      '" aria-label="Unadd ' + escapeHtml(name) + '">' + escapeHtml(name) + ' ×</button>';
  }).join("");
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
  if (!current) return "ADD";
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

function resubscribe() {
  unsubscribe?.();
  gridMessage(grid, "Loading videos…");
  unsubscribe = onSnapshot(videosRef, snapshot => {
    const videos = sortVideos(snapshot.docs.map(entry => ({ ...entry.data(), id: entry.id })));
    savedVideos = new Map(videos.map(video => [video.id, video]));
    renderVideoGrid(grid, videos.filter(video => video.isActive !== false), "No published videos yet.");
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
  const url = tiktokUrl(rawUrl);
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
      caption: fields.caption.value.trim(), thumbnailUrl: thumbnail,
      captionAuto: savingDraft.captionAuto, thumbnailAuto: savingDraft.thumbnailAuto,
      sortOrder: Number(fields.sortOrder.value) || 0, itemIds: items.map(item => item.id), items,
      updatedAt: serverTimestamp()
    };
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
            isActive: true, createdAt: serverTimestamp()
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
      const entry = await addDoc(videosRef, { ...changes, tiktokId: tiktokId({ tiktokUrl: url }), isActive: true, createdAt: serverTimestamp() });
      publishedId = entry.id;
      addDraft = newDraft();
    }
    if (!pending && publishedId && url && !mediaUrl && !new URL(url).pathname.includes("/photo/")) {
      void lookupSharedTikTokMedia(publishedId, mediaCacheKey(url), AbortSignal.timeout?.(12000)).catch(() => {});
    }
    if (draft === savingDraft) {
      const status = pending ? "Draft saved." : savingDraft.id && !savingDraft.awaiting ? "Video saved." : "Video is live.";
      const fileNote = pending && savingDraft.mediaFile ? " Select the original file again when you publish." : "";
      showEditor(null, status + (metadataWarning ? " " + metadataWarning : "") + fileNote);
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
    if (draft === deletingDraft) showEditor(null, deletingDraft.awaiting ? "Draft dismissed." : "Video deleted.");
  } catch (error) {
    setStatus("editor-status", error.message || "Couldn’t delete the video.", true);
  } finally {
    lockControls(false);
  }
});
get("video-library").addEventListener("click", event => {
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
  if (pickerAction(id) === "UNADD") draft.items.delete(id);
  else draft.items.set(id, productSnapshot(item, pickerSource));
  syncPickButton(button, item);
  renderSelected();
});
get("selected-items").addEventListener("click", event => {
  const button = event.target.closest("[data-unadd]");
  if (!button || saving) return;
  const id = button.dataset.unadd;
  draft.items.delete(id);
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
    queuedVideos.clear();
    editDrafts.clear();
    addDraft = newDraft();
    showEditor();
  }
});
