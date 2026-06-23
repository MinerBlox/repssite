import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
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
const db = getFirestore(app);
const root = document.getElementById("app");
const QC_DEBUG_PREFIX = "[RC QC]";
window.__rcQcDebug = { logs: [] };

function qcLog(label, data) {
  const entry = { label, data, time: new Date().toISOString() };
  window.__rcQcDebug.logs.push(entry);
  window.__rcQcDebug.last = entry;
  if (data === undefined) console.log(QC_DEBUG_PREFIX, label);
  else console.log(QC_DEBUG_PREFIX, label, data);
}

function qcWarn(label, data) {
  const entry = { label, data, time: new Date().toISOString(), level: "warn" };
  window.__rcQcDebug.logs.push(entry);
  window.__rcQcDebug.last = entry;
  console.warn(QC_DEBUG_PREFIX, label, data);
}

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
    .replace(/"/g, "&quot;");
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
  const directSnap = await getDoc(doc(db, "products", slug));
  if (directSnap.exists()) {
    qcLog("Found product by document id", { id: directSnap.id });
    return { id: directSnap.id, ...directSnap.data() };
  }

  qcLog("Product id miss, scanning products by slugified name");
  const allSnap = await getDocs(collection(db, "products"));
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
  window.__rcQcDebug.productUrl = link;
  return link;
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

  if (host.includes("weidian.com") || host.includes("youshop10.com")) {
    itemId = url.searchParams.get("itemID") || url.searchParams.get("itemId") || url.searchParams.get("id");
    platform = "WD";
  } else if (host.includes("1688.com") || host.includes("alibaba.com")) {
    const match = href.match(/offer\/(\d+)\.html/i);
    itemId = match?.[1] || url.searchParams.get("offerId") || url.searchParams.get("id");
    platform = "AL";
  } else if (host.includes("taobao.com") || host.includes("tmall.com")) {
    itemId = url.searchParams.get("id");
    platform = "TB";
  }

  const cleanItemId = itemId ? String(itemId).replace(/\D/g, "") : "";
  const goodsId = cleanItemId ? `${platform}${cleanItemId}` : "";
  const details = cleanItemId ? { host, platform, itemId: cleanItemId, goodsId } : null;
  qcLog("Parsed marketplace details", details || { host, platform, itemId, goodsId: null });
  window.__rcQcDebug.marketplace = details;
  window.__rcQcDebug.goodsId = goodsId;
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
  window.__rcQcDebug.apiUrl = proxyUrl;
  window.__rcQcDebug.proxyUrl = proxyUrl;
  window.__rcQcDebug.directUrl = directUrl;
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
  window.__rcQcDebug.payload = payload;

  const raw = JSON.stringify(payload || {}).replace(/\\\//g, "/");
  const rawMatches = raw.match(/https?:\/\/[^"'\s<>\\]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>\\]*)?/gi) || [];
  const recursiveMatches = collectImageUrls(payload);
  const photos = [...new Set([...recursiveMatches, ...rawMatches])]
    .map(url => url.replace(/,+$/, ""))
    .filter(url => /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url));

  qcLog("Extracted QC photo URLs", { count: photos.length, photos });
  window.__rcQcDebug.photos = photos;
  return photos;
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
  window.__rcQcDebug.response = responseInfo;

  const text = await response.text();
  window.__rcQcDebug.rawText = text.slice(0, 5000);
  if (!response.ok) throw new Error(`${label} returned ${response.status}: ${text.slice(0, 200)}`);

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

async function fetchQcPayload(urls) {
  const payloads = [];

  try {
    const proxyPayload = await fetchJsonWithDebug(urls.proxyUrl, "QC proxy API");
    window.__rcQcDebug.proxyPayload = proxyPayload;
    payloads.push(proxyPayload.data || proxyPayload);
  } catch (proxyError) {
    qcWarn("QC proxy failed, trying direct provider fallbacks", { message: proxyError.message });
    window.__rcQcDebug.proxyError = proxyError.message;

    try {
      const directPayload = await fetchJsonWithDebug(urls.directUrl, "direct ACBuy API");
      window.__rcQcDebug.directPayload = directPayload;
      payloads.push(directPayload);
    } catch (acbuyError) {
      qcWarn("Direct ACBuy fallback failed", { message: acbuyError.message });
    }
  }

  try {
    const oopbuyPayload = await fetchJsonWithDebug(urls.oopbuyDirectUrl, "direct OopBuy API");
    window.__rcQcDebug.oopbuyPayload = oopbuyPayload;
    payloads.push(oopbuyPayload);
  } catch (oopbuyError) {
    qcWarn("Direct OopBuy fallback failed", { message: oopbuyError.message });
    window.__rcQcDebug.oopbuyError = oopbuyError.message;
  }

  if (!payloads.length) throw new Error("No QC provider returned data");
  return payloads;
}

function renderNotFound(message = "This product could not be found in Firebase.") {
  root.innerHTML = `
    <section class="not-found">
      <h1>Item not found</h1>
      <p class="status-copy">${escapeHtml(message)}</p>
      <div class="actions" style="justify-content:center;"><a class="action-btn primary" href="${sitePath("spreadsheet.html")}">Back to spreadsheet</a></div>
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
    const payload = await fetchQcPayload(urls);
    const photos = extractQcPhotos(payload);

    if (!photos.length) {
      renderQcState("The QC providers replied, but there were no image links for this item.");
      return;
    }

    if (qcCopy) qcCopy.textContent = `${photos.length} QC picture${photos.length === 1 ? "" : "s"} loaded.`;
    qcGrid.innerHTML = photos.map((photo, index) => `
      <a class="qc-link" href="${escapeHtml(photo)}" target="_blank" rel="noopener noreferrer">
        <img class="qc-image" src="${escapeHtml(photo)}" alt="QC picture ${index + 1}" loading="lazy">
      </a>
    `).join("");
    qcLog("QC pictures rendered", { count: photos.length });
  } catch (error) {
    qcWarn("Could not load QC pictures", { message: error.message, name: error.name, stack: error.stack });
    renderQcState("Could not load QC pictures yet. Open the console and search [RC QC].");
  }
}

function renderProduct(item) {
  qcLog("Rendering product", { id: item.id, name: item.name, productUrl: item.productUrl });
  document.title = `${item.name || "Item"} - repscentral`;
  const image = item.imageUrl
    ? `<img class="item-image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name || "Item image")}">`
    : `<div class="image-empty">No image yet</div>`;
  const description = item.description || "No description has been added yet.";
  const agentButton = item.agentUrl ? `<a class="action-btn primary" href="${escapeHtml(item.agentUrl)}" target="_blank" rel="noopener noreferrer">Open Agent Link</a>` : "";
  const productLink = originalProductLink(item);
  const productButton = productLink ? `<a class="action-btn" href="${escapeHtml(productLink)}" target="_blank" rel="noopener noreferrer">Original Link</a>` : "";

  root.innerHTML = `
    <a class="back-link" href="${sitePath("spreadsheet.html")}">Back to spreadsheet</a>
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
          <div class="description">${escapeHtml(description)}</div>
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

  loadQcPictures(item);
}

try {
  qcLog("Item page script loaded", { path: window.location.pathname, search: window.location.search, basePath: basePath(), version: "qc-2026-06-23-oopbuy" });
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
