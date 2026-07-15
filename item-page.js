import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { enableAppCheck } from "./firebase-app-check.js?v=2026-06-30-app-check-1";
import { getFirestore, collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDTTzoJlvr0mYxwx82cQ9JJn8rXrMEy7JA",
  authDomain: "reps-central.firebaseapp.com",
  projectId: "reps-central",
  storageBucket: "reps-central.firebasestorage.app",
  messagingSenderId: "812299387060",
  appId: "1:812299387060:web:1c93d1e7bf30b05653d7e1",
  measurementId: "G-8T7F9F1FZ9"
};

const app = initializeApp(firebaseConfig);
enableAppCheck(app);
const db = getFirestore(app);
const root = document.getElementById("app");
window.__rcQcData = { sources: [], entries: [] };
function qcLog() {}
function qcWarn() {}

function basePath() {
  return window.location.pathname.startsWith("/repssite/") ? "/repssite/" : "/";
}

function sitePath(path) {
  return `${basePath()}${String(path || "").replace(/^\/+/, "")}`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDescriptionHtml(value) {
  return escapeHtml(value || "No description has been added yet.")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "<br>");
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function priceText(item) {
  const value = Number(item.price || 0);
  const symbol = (item.currency || "CNY") === "CNY" ? "¥" : "$";
  return `${symbol}${value.toFixed(2)}`;
}

function routeSlug() {
  const queryId = new URLSearchParams(window.location.search).get("id");
  if (queryId) return queryId;
  const parts = window.location.pathname.split("/").filter(Boolean);
  const itemIndex = parts.lastIndexOf("items");
  return itemIndex >= 0 ? decodeURIComponent(parts[itemIndex + 1] || "") : "";
}

async function findProduct(slug) {
  qcLog("Finding product", { slug, path: window.location.pathname });
  if (!slug) return null;
  const directSnap = await getDoc(doc(db, "liveproducts", slug));
  if (directSnap.exists()) {
    qcLog("Found product by document id", { id: directSnap.id });
    return { id: directSnap.id, ...directSnap.data() };
  }

  qcLog("Product id miss, scanning products by slugified name");
  const allSnap = await getDocs(collection(db, "liveproducts"));
  const match = allSnap.docs
    .map(productDoc => ({ id: productDoc.id, ...productDoc.data() }))
    .find(item => item.id === slug || slugify(item.name) === slug) || null;
  qcLog("Slug scan result", match ? { id: match.id, name: match.name } : null);
  return match;
}

function originalProductLink(item) {
  const link = item.productUrl || item.originalUrl || item.itemUrl || "";
  qcLog("Original marketplace link from Firebase", {
    productUrl: item.productUrl || "",
    originalUrl: item.originalUrl || "",
    itemUrl: item.itemUrl || "",
    chosen: link
  });
  return link;
}

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function parseMarketplaceLink(rawUrl) {
  qcLog("Parsing product URL", rawUrl);
  if (!rawUrl) {
    qcWarn("No productUrl/originalUrl/itemUrl found on product", { rawUrl });
    return null;
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    qcWarn("Product URL is not a valid URL", { rawUrl, error: error.message });
    return null;
  }

  const host = url.hostname.toLowerCase();
  const href = url.href;
  let itemId = null;
  let platform = "unsupported";

  if (hostMatches(host, "weidian.com") || hostMatches(host, "youshop10.com")) {
    itemId = url.searchParams.get("itemID") || url.searchParams.get("itemId") || url.searchParams.get("id");
    platform = "WD";
  } else if (hostMatches(host, "1688.com") || hostMatches(host, "alibaba.com")) {
    const match = href.match(/offer\/(\d+)\.html/i);
    itemId = match?.[1] || url.searchParams.get("offerId") || url.searchParams.get("id");
    platform = "AL";
  } else if (hostMatches(host, "taobao.com") || hostMatches(host, "tmall.com")) {
    itemId = url.searchParams.get("id");
    platform = "TB";
  }

  const cleanItemId = itemId ? String(itemId).replace(/\D/g, "") : "";
  if (cleanItemId.length > 30) return null;
  const goodsId = cleanItemId ? `${platform}${cleanItemId}` : "";
  const details = cleanItemId ? { host, platform, itemId: cleanItemId, goodsId } : null;
  qcLog("Parsed marketplace details", details || { host, platform, itemId, goodsId: null });
  return details;
}

function qcApiUrls(item) {
  const details = parseMarketplaceLink(originalProductLink(item));
  if (!details) return null;

  const proxyUrl = `/api/qc?platform=${encodeURIComponent(details.platform)}&goodsId=${encodeURIComponent(details.itemId)}`;
  const directUrl = `https://www.acbuy.com/prefix-api/store-product/product/api/item/Photos?goodsId=${encodeURIComponent(details.goodsId)}`;
  const oopbuyChannel = details.platform === "TB" ? "TAOBAO" : details.platform === "AL" ? "1688" : "weidian";
  const oopbuyDirectUrl = `https://webapi.oopbuy.com/orderProduct/getSpuPurchaseInfo?spuNo=${encodeURIComponent(details.itemId)}&channel=${encodeURIComponent(oopbuyChannel)}`;
  const urls = { ...details, proxyUrl, directUrl, oopbuyDirectUrl, oopbuyChannel };
  qcLog("Built QC API URLs", urls);
  return urls;
}

function collectImageUrls(value, urls = []) {
  if (typeof value === "string") {
    const normalized = value.replace(/\\\//g, "/");
    const matches = normalized.match(/https?:\/\/[^"'\s<>\\]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>\\]*)?/gi) || [];
    urls.push(...matches);
    return urls;
  }

  if (Array.isArray(value)) {
    value.forEach(entry => collectImageUrls(entry, urls));
    return urls;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach(entry => collectImageUrls(entry, urls));
  }

  return urls;
}

function extractQcPhotos(payload) {
  const topLevelKeys = payload && typeof payload === "object" ? Object.keys(payload).slice(0, 20) : [];
  const dataCount = Array.isArray(payload?.data) ? payload.data.length : null;
  qcLog("Extracting QC photos from payload", { type: typeof payload, topLevelKeys, dataCount });

  const raw = JSON.stringify(payload || {}).replace(/\\\//g, "/");
  const rawMatches = raw.match(/https?:\/\/[^"'\s<>\\]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>\\]*)?/gi) || [];
  const recursiveMatches = collectImageUrls(payload);
  return [...new Set([...recursiveMatches, ...rawMatches])]
    .map(url => url.replace(/,+$/, ""))
    .filter(url => /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url));
}

function extractQcEntries(sources) {
  const seen = new Set();
  const entries = [];
  sources.forEach(source => {
    extractQcPhotos(source.payload).forEach(url => {
      if (seen.has(url)) return;
      seen.add(url);
      entries.push({ url, provider: source.provider });
    });
  });
  qcLog("Extracted attributed QC photos", { count: entries.length, providers: [...new Set(entries.map(entry => entry.provider))] });
  window.__rcQcData.entries = entries;
  return entries;
}

async function fetchJsonWithDebug(url, label) {
  qcLog(`Fetching ${label}`, url);
  const response = await fetch(url, { headers: { "Accept": "application/json,text/plain,*/*" } });
  const responseInfo = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    type: response.type,
    url: response.url,
    contentType: response.headers.get("content-type") || ""
  };
  qcLog(`${label} response`, responseInfo);

  const text = await response.text();
  if (!response.ok) throw new Error(`${label} returned ${response.status}: ${text.slice(0, 200)}`);

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

async function fetchQcPayload(urls) {
  const proxyPayload = await fetchJsonWithDebug(urls.proxyUrl, "QC proxy API");
  const proxyData = proxyPayload.data || proxyPayload;
  const sources = [];

  if (proxyData.acbuy) sources.push({ provider: "ACBuy", payload: proxyData.acbuy });
  if (proxyData.oopbuy) sources.push({ provider: "OopBuy", payload: proxyData.oopbuy });
  if (!proxyData.acbuy && !proxyData.oopbuy) {
    sources.push({ provider: "ACBuy", payload: proxyData });
  }

  if (!sources.length) throw new Error("No QC provider returned data");
  window.__rcQcData.sources = sources;
  return sources;
}

function renderNotFound(message = "This product could not be found in Firebase.") {
  root.innerHTML = `
    <section class="not-found">
      <h1>Item not found</h1>
      <p class="status-copy">${escapeHtml(message)}</p>
      <div class="actions" style="justify-content:center;"><a class="action-btn primary" href="${sitePath("spreadsheet.html")}">← Back to spreadsheet</a></div>
    </section>
  `;
}

function renderQcState(message) {
  qcLog("QC render state", message);
  const qcGrid = document.getElementById("qc-grid");
  const qcCopy = document.getElementById("qc-copy");
  if (qcCopy) qcCopy.textContent = message;
  if (qcGrid) {
    qcGrid.innerHTML = `
      <div class="qc-placeholder">${escapeHtml(message)}</div>
    `;
  }
}


let activeQcEntries = [];
let activeQcIndex = 0;
let qcReturnFocus = null;

function ensureQcLightbox() {
  let lightbox = document.getElementById("qc-lightbox");
  if (lightbox) return lightbox;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="qc-lightbox" id="qc-lightbox" role="dialog" aria-modal="true" aria-label="QC image viewer" hidden>
      <div class="qc-lightbox-top">
        <p>QC provided by <strong id="qc-lightbox-provider">ACBuy</strong></p>
        <button class="qc-lightbox-icon" id="qc-lightbox-close" type="button" aria-label="Close QC image viewer">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <button class="qc-lightbox-arrow prev" id="qc-lightbox-prev" type="button" aria-label="Previous QC image">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <img class="qc-lightbox-image" id="qc-lightbox-image" alt="">
      <button class="qc-lightbox-arrow next" id="qc-lightbox-next" type="button" aria-label="Next QC image">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <div class="qc-lightbox-counter" id="qc-lightbox-counter">QC: 1/1</div>
    </div>
  `);
  lightbox = document.getElementById("qc-lightbox");
  document.getElementById("qc-lightbox-close").addEventListener("click", closeQcLightbox);
  document.getElementById("qc-lightbox-prev").addEventListener("click", () => moveQcLightbox(-1));
  document.getElementById("qc-lightbox-next").addEventListener("click", () => moveQcLightbox(1));
  lightbox.addEventListener("click", event => { if (event.target === lightbox) closeQcLightbox(); });
  return lightbox;
}

function updateQcLightbox() {
  const entry = activeQcEntries[activeQcIndex];
  if (!entry) return;
  document.getElementById("qc-lightbox-image").src = entry.url;
  document.getElementById("qc-lightbox-image").alt = `QC picture ${activeQcIndex + 1} provided by ${entry.provider}`;
  document.getElementById("qc-lightbox-provider").textContent = entry.provider;
  document.getElementById("qc-lightbox-counter").textContent = `QC: ${activeQcIndex + 1}/${activeQcEntries.length}`;
}

function openQcLightbox(index, trigger) {
  if (!activeQcEntries.length) return;
  activeQcIndex = index;
  qcReturnFocus = trigger || null;
  const lightbox = ensureQcLightbox();
  updateQcLightbox();
  lightbox.hidden = false;
  document.body.style.overflow = "hidden";
  document.getElementById("qc-lightbox-close").focus();
}

function closeQcLightbox() {
  const lightbox = document.getElementById("qc-lightbox");
  if (!lightbox || lightbox.hidden) return;
  lightbox.hidden = true;
  document.body.style.overflow = "";
  if (qcReturnFocus) qcReturnFocus.focus();
}

function moveQcLightbox(direction) {
  if (!activeQcEntries.length) return;
  activeQcIndex = (activeQcIndex + direction + activeQcEntries.length) % activeQcEntries.length;
  updateQcLightbox();
}

function bindQcLightbox(grid, entries) {
  activeQcEntries = entries;
  ensureQcLightbox();
  grid.onclick = event => {
    const trigger = event.target.closest("[data-qc-index]");
    if (!trigger) return;
    openQcLightbox(Number(trigger.dataset.qcIndex), trigger);
  };
}

document.addEventListener("keydown", event => {
  const lightbox = document.getElementById("qc-lightbox");
  if (!lightbox || lightbox.hidden) return;
  if (event.key === "ArrowLeft") moveQcLightbox(-1);
  if (event.key === "ArrowRight") moveQcLightbox(1);
  if (event.key === "Escape") closeQcLightbox();
});

async function loadQcPictures(item) {
  qcLog("Starting QC picture load", { id: item.id, name: item.name });
  const qcGrid = document.getElementById("qc-grid");
  const qcCopy = document.getElementById("qc-copy");
  const urls = qcApiUrls(item);

  if (!urls) {
    renderQcState("Add the original Weidian, 1688 or Taobao link in Product URL to load QC pictures.");
    return;
  }

  if (qcCopy) qcCopy.textContent = "Loading QC pictures...";

  try {
    const sources = await fetchQcPayload(urls);
    const entries = extractQcEntries(sources);

    if (!entries.length) {
      renderQcState("The QC providers replied, but there were no image links for this item.");
      return;
    }

    if (qcCopy) qcCopy.textContent = `${entries.length} QC picture${entries.length === 1 ? "" : "s"} loaded.`;
    qcGrid.innerHTML = entries.map((entry, index) => `
      <button class="qc-link" type="button" data-qc-index="${index}" aria-label="Open QC picture ${index + 1}, provided by ${escapeHtml(entry.provider)}">
        <img class="qc-image" src="${escapeHtml(entry.url)}" alt="QC picture ${index + 1}" loading="lazy">
      </button>
    `).join("");
    bindQcLightbox(qcGrid, entries);
    qcLog("QC pictures rendered", { count: entries.length });
  } catch (error) {
    qcWarn("Could not load QC pictures", { message: error.message, name: error.name, stack: error.stack });
    renderQcState("Could not load QC pictures yet. Open the console and search [RC QC].");
  }
}

function trackItemInteraction(productId, interactionType, retries = 10) {
  if (typeof window.rcTrackProductInteraction === "function") {
    window.rcTrackProductInteraction(productId, interactionType);
  } else if (retries > 0) {
    setTimeout(() => trackItemInteraction(productId, interactionType, retries - 1), 200);
  }
}

function renderProduct(item) {
  qcLog("Rendering product", { id: item.id, name: item.name, productUrl: item.productUrl });
  document.title = `RepsCentral - ${item.name || "Item"}`;
  const image = item.imageUrl
    ? `<img class="item-image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name || "Item image")}">`
    : `<div class="image-empty">No image yet</div>`;
  const description = item.description || "No description has been added yet.";
  const agentUrl = safeHttpUrl(item.agentUrl);
  const agentButton = agentUrl ? `<a class="action-btn primary" data-product-action="outboundClicks" href="${escapeHtml(agentUrl)}" target="_blank" rel="noopener noreferrer">Open Agent Link</a>` : "";
  const productLink = originalProductLink(item);
  const safeProductUrl = safeHttpUrl(productLink);
  const productButton = safeProductUrl ? `<a class="action-btn" data-product-action="outboundClicks" href="${escapeHtml(safeProductUrl)}" target="_blank" rel="noopener noreferrer">Original Link</a>` : "";

  root.innerHTML = `
    <a class="back-link" href="${sitePath("spreadsheet.html")}">← Back to spreadsheet</a>
    <section class="item-layout">
      <div class="image-panel">${image}</div>
      <aside class="details-panel">
        <div class="eyebrow">Item Details</div>
        <h1>${escapeHtml(item.name || "Unnamed item")}</h1>
        <div class="price">${priceText(item)}</div>
        <div class="detail-block">
          <div class="detail-label">Name</div>
          <div class="description">${escapeHtml(item.name || "Unnamed item")}</div>
        </div>
        <div class="detail-block">
          <div class="detail-label">Price</div>
          <div class="description">${priceText(item)}</div>
        </div>
        <div class="detail-block">
          <div class="detail-label">Description</div>
          <div class="description">${formatDescriptionHtml(description)}</div>
        </div>
        <div class="actions">${agentButton}${productButton}</div>
      </aside>
    </section>
    <section class="qc-section">
      <h2>QC Pictures</h2>
      <p id="qc-copy">QC pictures will load from the original marketplace link.</p>
      <div class="qc-grid" id="qc-grid">
        <div class="qc-placeholder">QC image</div>
        <div class="qc-placeholder">QC image</div>
        <div class="qc-placeholder">QC image</div>
      </div>
    </section>
  `;

  trackItemInteraction(item.id, "detailViews");
  root.querySelectorAll("[data-product-action]").forEach(link => {
    link.addEventListener("click", () => trackItemInteraction(item.id, link.dataset.productAction));
  });
  loadQcPictures(item);
}

try {
  qcLog("Item page script loaded", { path: window.location.pathname, search: window.location.search, basePath: basePath(), version: "qc-2026-06-23-lightbox" });
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (!parts.includes("items")) {
    renderNotFound("This page could not be found.");
  } else {
    const item = await findProduct(routeSlug());
    if (!item || item.isActive === false) renderNotFound();
    else renderProduct(item);
  }
} catch (error) {
  qcWarn("Could not load item", { message: error.message, name: error.name, stack: error.stack });
  renderNotFound();
}
