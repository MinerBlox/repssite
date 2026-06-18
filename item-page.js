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
  if (!slug) return null;
  const directSnap = await getDoc(doc(db, "products", slug));
  if (directSnap.exists()) return { id: directSnap.id, ...directSnap.data() };

  const allSnap = await getDocs(collection(db, "products"));
  return allSnap.docs
    .map(productDoc => ({ id: productDoc.id, ...productDoc.data() }))
    .find(item => item.id === slug || slugify(item.name) === slug) || null;
}

function originalProductLink(item) {
  return item.productUrl || item.originalUrl || item.itemUrl || "";
}

function acbuyGoodsId(rawUrl) {
  if (!rawUrl) return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const href = url.href;

  if (host.includes("weidian.com") || host.includes("youshop10.com")) {
    const id = url.searchParams.get("itemID") || url.searchParams.get("itemId") || url.searchParams.get("id");
    return id ? `WD${id}` : null;
  }

  if (host.includes("1688.com") || host.includes("alibaba.com")) {
    const match = href.match(/offer\/(\d+)\.html/i);
    const id = match?.[1] || url.searchParams.get("offerId") || url.searchParams.get("id");
    return id ? `AL${id}` : null;
  }

  if (host.includes("taobao.com") || host.includes("tmall.com")) {
    const id = url.searchParams.get("id");
    return id ? `TB${id}` : null;
  }

  return null;
}

function acbuyPhotosUrl(item) {
  const goodsId = acbuyGoodsId(originalProductLink(item));
  return goodsId ? `https://www.acbuy.com/prefix-api/store-product/product/api/item/Photos?goodsId=${goodsId}` : "";
}

function extractQcPhotos(payload) {
  const raw = JSON.stringify(payload || {});
  const matches = raw.match(/https?:\\?\/\\?\/oss\.acbuy\.com\\?\/temp\\?\/[^"'\\\s]+?\.(?:jpg|jpeg|png|webp)/gi) || [];
  return [...new Set(matches.map(url => url.replace(/\\\//g, "/")))];
}

function renderNotFound(message = "This product could not be found in Firebase.") {
  root.innerHTML = `
    <section class="not-found">
      <h1>Item not found</h1>
      <p class="status-copy">${escapeHtml(message)}</p>
      <div class="actions" style="justify-content:center;"><a class="action-btn primary" href="/spreadsheet.html">Back to spreadsheet</a></div>
    </section>
  `;
}

function renderQcState(message) {
  const qcGrid = document.getElementById("qc-grid");
  const qcCopy = document.getElementById("qc-copy");
  if (qcCopy) qcCopy.textContent = message;
  if (qcGrid) qcGrid.innerHTML = `<div class="qc-placeholder">QC image</div><div class="qc-placeholder">QC image</div><div class="qc-placeholder">QC image</div>`;
}

async function loadQcPictures(item) {
  const qcGrid = document.getElementById("qc-grid");
  const qcCopy = document.getElementById("qc-copy");
  const apiUrl = acbuyPhotosUrl(item);

  if (!apiUrl) {
    renderQcState("Add the original Weidian, 1688 or Taobao link in productUrl to load QC pictures.");
    return;
  }

  if (qcCopy) qcCopy.textContent = "Loading QC pictures from ACBuy...";

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`ACBuy returned ${response.status}`);
    const payload = await response.json();
    const photos = extractQcPhotos(payload);

    if (!photos.length) {
      renderQcState("No QC pictures were found for this product yet.");
      return;
    }

    if (qcCopy) qcCopy.textContent = `${photos.length} QC picture${photos.length === 1 ? "" : "s"} loaded from ACBuy.`;
    qcGrid.innerHTML = photos.map((photo, index) => `
      <a class="qc-link" href="${escapeHtml(photo)}" target="_blank" rel="noopener noreferrer">
        <img class="qc-image" src="${escapeHtml(photo)}" alt="QC picture ${index + 1}" loading="lazy">
      </a>
    `).join("");
  } catch (error) {
    console.error("Could not load QC pictures:", error);
    renderQcState("Could not load QC pictures from ACBuy right now.");
  }
}

function renderProduct(item) {
  document.title = `${item.name || "Item"} - repscentral`;
  const image = item.imageUrl
    ? `<img class="item-image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name || "Item image")}">`
    : `<div class="image-empty">No image yet</div>`;
  const description = item.description || "No description has been added yet.";
  const agentButton = item.agentUrl ? `<a class="action-btn primary" href="${escapeHtml(item.agentUrl)}" target="_blank" rel="noopener noreferrer">Open Agent Link</a>` : "";
  const productButton = originalProductLink(item) ? `<a class="action-btn" href="${escapeHtml(originalProductLink(item))}" target="_blank" rel="noopener noreferrer">Original Link</a>` : "";

  root.innerHTML = `
    <a class="back-link" href="/spreadsheet.html">Back to spreadsheet</a>
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
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (!parts.includes("items")) {
    renderNotFound("This page could not be found.");
  } else {
    const item = await findProduct(routeSlug());
    if (!item || item.isActive === false) renderNotFound();
    else renderProduct(item);
  }
} catch (error) {
  console.error("Could not load item:", error);
  renderNotFound();
}
