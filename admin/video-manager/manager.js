import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { enableAppCheck } from "/firebase-app-check.js?v=2026-07-01-preview-skip";
import { assetUrl, escapeHtml, gridMessage, linkedItems, renderVideoGrid, sortVideos, tiktokUrl } from "/video-grid.js";

const firebaseConfig = { apiKey: "AIzaSyDTTzoJlvr0mYxwx82cQ9JJn8rXrMEy7JA", authDomain: "reps-central.firebaseapp.com", projectId: "reps-central", storageBucket: "reps-central.firebasestorage.app", messagingSenderId: "812299387060", appId: "1:812299387060:web:1c93d1e7bf30b05653d7e1", measurementId: "G-8T7F9F1FZ9" };
const ADMIN_UID = "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";

const app = initializeApp(firebaseConfig);
enableAppCheck(app);
const auth = getAuth(app);
const db = getFirestore(app);
const videosRef = collection(db, "videos");
const get = id => document.getElementById(id);
const form = get("video-editor");
const fields = Object.fromEntries(["title", "sortOrder", "tiktokUrl", "caption", "thumbnailUrl"]
  .map(name => [name, form.elements.namedItem(name)]));
const grid = get("saved-videos");
const results = get("catalog-results");
const pageSize = 24;

let savedVideos = new Map();
let editDrafts = new Map();
let addDraft = newDraft();
let draft = null;
let saving = false;
let unsubscribe = null;
let metadataTimer;
let metadataRequest;
let pickerSource = "all";
let visibleLimit = pageSize;
let catalogue;
let cataloguePromise;
let catalogueError;

function newDraft(video = {}) {
  return {
    id: video.id || "",
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
  get("editor-heading").textContent = draft.id ? "Edit video" : "Add video";
  get("delete-video").hidden = !draft.id;
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

function productSnapshot(item) {
  return {
    id: String(item.id),
    name: String(item.name || item.title || "Unnamed item"),
    category: String(item.category || ""),
    imageUrl: String(item.imageUrl || item.image || ""),
    agentUrl: assetUrl(item.agentUrl || item.agentLink),
    price: item.price ?? item.priceCny ?? ""
  };
}

function renderSelected() {
  const count = draft.items.size;
  get("selected-count").textContent = count === 1 ? "1 item selected" : count + " items selected";
  get("selected-items").innerHTML = [...draft.items.values()].map(item => {
    const name = item.name || catalogue?.byId.get(item.id)?.name || item.id;
    return '<button class="btn" type="button" data-unadd="' + escapeHtml(item.id) +
      '" aria-label="Unadd ' + escapeHtml(name) + '">' + escapeHtml(name) + ' ×</button>';
  }).join("");
}

async function loadCatalogue() {
  if (catalogue || cataloguePromise) return;
  catalogueError = "";
  cataloguePromise = (async () => {
    const response = await fetch("/api/catalog", { cache: "no-store" });
    if (!response.ok) throw new Error("Catalogue returned " + response.status);
    const data = await response.json();
    if (!Array.isArray(data.products)) throw new Error("Invalid catalogue");
    const products = data.products.filter(item => item?.id && item.isActive !== false &&
      String(item.category || "").trim().toLowerCase() !== "uncategorised");
    products.sort((left, right) => (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0));
    catalogue = {
      products: products.map(item => ({ item, search: [item.name, item.brand, item.category, item.id, ...(Array.isArray(item.tags) ? item.tags : [])].join(" ").toLowerCase() })),
      byId: new Map(products.map(item => [String(item.id), item]))
    };
  })();
  renderCatalogue();
  try {
    await cataloguePromise;
    if (draft) renderSelected();
  } catch {
    catalogueError = "Couldn’t load the spreadsheet catalogue. Try again.";
  } finally {
    cataloguePromise = null;
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
  renderCatalogue();
  if (source === "all") void loadCatalogue();
}

function renderCatalogue() {
  get("all-items").setAttribute("aria-pressed", String(pickerSource === "all"));
  get("video-items").setAttribute("aria-pressed", String(pickerSource === "video"));
  get("catalog-search").hidden = pickerSource !== "all";
  get("more-items").hidden = true;
  get("retry-catalog").hidden = true;
  results.replaceChildren();
  if (!draft || get("picker").hidden) return;
  if (pickerSource === "video") {
    setStatus("catalog-status", "Video Items will appear here when its Firestore collection is ready.");
    return;
  }
  if (!catalogue) {
    setStatus("catalog-status", catalogueError || "Loading spreadsheet items…", Boolean(catalogueError));
    get("retry-catalog").hidden = !catalogueError;
    return;
  }

  const tokens = get("item-search").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = catalogue.products.filter(entry => tokens.every(token => entry.search.includes(token)));
  setStatus("catalog-status", matches.length ? "Showing " + Math.min(visibleLimit, matches.length) + " of " + matches.length.toLocaleString() + " items" : "No matching items.");
  results.innerHTML = matches.slice(0, visibleLimit).map(({ item }) => {
    const name = item.name || "Unnamed item";
    const thumbnail = assetUrl(item.imageUrl || item.image);
    const add = draft.items.has(String(item.id)) ? "UNADD" : "ADD";
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

function syncPickButton(button, item) {
  const label = draft.items.has(String(item.id)) ? "UNADD" : "ADD";
  button.textContent = label;
  button.setAttribute("aria-label", label + " " + (item.name || "Unnamed item"));
}

function lockControls(lock) {
  saving = lock;
  for (const control of [...form.elements, get("add-tab"), get("view-tab"), get("sign-out")]) control.disabled = lock;
  get("save-video").textContent = lock ? "SAVING…" : "SAVE";
}

function sameVersion(left, right) {
  return left?.seconds === right?.seconds && left?.nanoseconds === right?.nanoseconds;
}

function resubscribe() {
  unsubscribe?.();
  gridMessage(grid, "Loading videos…");
  unsubscribe = onSnapshot(videosRef, snapshot => {
    const videos = sortVideos(snapshot.docs.map(entry => ({ ...entry.data(), id: entry.id })));
    savedVideos = new Map(videos.map(video => [video.id, video]));
    renderVideoGrid(grid, videos, "No videos yet. Choose ADD VIDEO to get started.");
  }, () => gridMessage(grid, "Couldn’t load videos. Refresh or check your Firestore permissions."));
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

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (saving || !draft) return;
  const title = fields.title.value.trim();
  const url = tiktokUrl(fields.tiktokUrl.value);
  if (!title || !url) {
    setStatus("editor-status", "Enter a name and a valid TikTok link.", true);
    return;
  }

  const savingDraft = draft;
  lockControls(true);
  setStatus("editor-status");
  try {
    const metadataWarning = await fillMetadata();
    if (draft !== savingDraft) return;
    const thumbnail = fields.thumbnailUrl.value.trim();
    if (thumbnail && !assetUrl(thumbnail)) throw new Error("Enter a valid thumbnail URL.");
    const items = [...draft.items.values()];
    const changes = {
      title,
      tiktokUrl: url,
      caption: fields.caption.value.trim(),
      thumbnailUrl: thumbnail,
      captionAuto: draft.captionAuto,
      thumbnailAuto: draft.thumbnailAuto,
      sortOrder: Number(fields.sortOrder.value) || 0,
      itemIds: items.map(item => item.id),
      items,
      updatedAt: serverTimestamp()
    };
    if (savingDraft.id) {
      const ref = doc(videosRef, savingDraft.id);
      await runTransaction(db, async transaction => {
        const existing = await transaction.get(ref);
        if (!existing.exists()) throw new Error("This video was deleted. Discard the draft to return to the list.");
        if (!sameVersion(savingDraft.version, existing.data().updatedAt)) {
          throw new Error("This video changed elsewhere. Discard this draft and reopen the updated video.");
        }
        transaction.update(ref, changes);
      });
      editDrafts.delete(savingDraft.id);
    } else {
      await addDoc(videosRef, { ...changes, isActive: true, createdAt: serverTimestamp() });
      addDraft = newDraft();
    }
    if (draft === savingDraft) {
      showEditor(null, metadataWarning ? "Video saved. " + metadataWarning : "Video saved.");
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
  if (!draft?.id || saving || !confirm("Delete this video from the public Videos page?")) return;
  const deletingDraft = draft;
  lockControls(true);
  try {
    await deleteDoc(doc(videosRef, deletingDraft.id));
    editDrafts.delete(deletingDraft.id);
    if (draft === deletingDraft) showEditor(null, "Video deleted.");
  } catch (error) {
    setStatus("editor-status", error.message || "Couldn’t delete the video.", true);
  } finally {
    lockControls(false);
  }
});
grid.addEventListener("click", event => {
  const id = event.target.closest("[data-video-id]")?.dataset.videoId;
  if (!id || !savedVideos.has(id)) return;
  if (!editDrafts.has(id)) editDrafts.set(id, newDraft(savedVideos.get(id)));
  showEditor(editDrafts.get(id));
});
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
  const item = catalogue?.byId.get(button?.dataset.pick);
  if (!item || saving) return;
  const id = String(item.id);
  if (draft.items.has(id)) draft.items.delete(id);
  else draft.items.set(id, productSnapshot(item));
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
  if (cardButton) syncPickButton(cardButton, catalogue.byId.get(id));
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
    showEditor();
    resubscribe();
  } else {
    setStatus("auth-status", "An admin session is required.");
    unsubscribe?.();
    unsubscribe = null;
    savedVideos.clear();
    editDrafts.clear();
    addDraft = newDraft();
    showEditor();
  }
});
