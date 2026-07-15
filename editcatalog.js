import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { enableAppCheck } from "./firebase-app-check.js?v=2026-06-30-app-check-1";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDTTzoJlvr0mYxwx82cQ9JJn8rXrMEy7JA",
  authDomain: "reps-central.firebaseapp.com",
  projectId: "reps-central",
  storageBucket: "reps-central.firebasestorage.app",
  messagingSenderId: "812299387060",
  appId: "1:812299387060:web:1c93d1e7bf30b05653d7e1",
  measurementId: "G-8T7F9F1FZ9"
};

const app = initializeApp(firebaseConfig, "edit-catalog-admin");
enableAppCheck(app);
const db = getFirestore(app);

const frame = document.getElementById("catalog-frame");
const statusBox = document.getElementById("admin-status");
const productMap = new Map();
const CURRENCY_KEY = "rc-currency";
const RATE_CACHE_KEY = "rc-cny-rates";
const GITHUB_TOKEN_KEY = "rc-editcatalog-github-token";
const REPO_OWNER = "MinerBlox";
const REPO_NAME = "repssite";
const REPO_BRANCH = "dev";
let iframeDocument = null;
let statusTimer = null;
let cnyRates = {
  CNY: 1,
  GBP: 0.103,
  USD: 0.139,
  EUR: 0.119,
  AUD: 0.212,
  CAD: 0.190,
  JPY: 21.8,
  HKD: 1.09,
  SGD: 0.178,
  CHF: 0.111,
  NZD: 0.232,
  KRW: 191.5
};

function showStatus(message, isError = false, timeout = 2600) {
  clearTimeout(statusTimer);
  statusBox.textContent = message;
  statusBox.classList.toggle("error", isError);
  statusBox.classList.add("show");
  if (timeout) {
    statusTimer = setTimeout(() => statusBox.classList.remove("show"), timeout);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol"
    }).format(value);
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

async function loadCurrencyRates() {
  try {
    const cached = JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || "null");
    if (cached?.rates) cnyRates = { ...cnyRates, ...cached.rates };
  } catch {}

  try {
    const response = await fetch("https://api.frankfurter.dev/v1/latest?base=CNY");
    if (response.ok) {
      const data = await response.json();
      cnyRates = { ...cnyRates, CNY: 1, ...data.rates };
    }
  } catch {}
}

function refreshCardPrice(card, yuan) {
  const currency = localStorage.getItem(CURRENCY_KEY) || "CNY";
  const rate = currency === "CNY" ? 1 : Number(cnyRates[currency] || 1);
  const main = card.querySelector(".product-price");
  const yuanEl = card.querySelector(".yuan-price");
  if (main) main.textContent = formatMoney(Number(yuan) * rate, currency);
  if (yuanEl) yuanEl.textContent = `~ ¥${Number(yuan).toFixed(2)}`;
}

function injectAdminStyles() {
  if (!iframeDocument || iframeDocument.getElementById("rc-editcatalog-styles")) return;
  const style = iframeDocument.createElement("style");
  style.id = "rc-editcatalog-styles";
  style.textContent = `
    .product-card.rc-catalog-marked {
      border-color: rgba(239,68,68,.78) !important;
      background: rgba(127,29,29,.32) !important;
      box-shadow: inset 0 0 0 1px rgba(239,68,68,.16);
    }
    .product-card.rc-catalog-marked .product-top { background: rgba(127,29,29,.18) !important; }
    .product-card.rc-catalog-marked .product-image { background: rgba(127,29,29,.12) !important; }
    .product-image.rc-editable-image,
    .product-name.rc-editable-name,
    .yuan-price.rc-editable-price { cursor: pointer !important; }
    .product-image.rc-editable-image:hover { opacity: .78; }
    .product-name.rc-editable-name:hover,
    .yuan-price.rc-editable-price:hover { text-decoration: underline; text-decoration-style: dotted; }
    .rc-mark-above {
      width: 100%;
      min-height: 36px;
      margin-top: 10px;
      border: 1px solid rgba(239,68,68,.48) !important;
      border-radius: 9px;
      background: rgba(239,68,68,.08) !important;
      color: #f87171 !important;
      font-size: 11px !important;
      font-weight: 900 !important;
      letter-spacing: .055em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .rc-mark-above:hover { background: rgba(239,68,68,.16) !important; }
    .product-card.rc-catalog-marked .rc-mark-above {
      background: #dc2626 !important;
      border-color: #dc2626 !important;
      color: #fff !important;
    }
  `;
  iframeDocument.head.appendChild(style);
}

function getProductIdFromCard(card) {
  return card.querySelector("[data-agent-product]")?.dataset.agentProduct || "";
}

function setCardMarkedState(card, marked) {
  card.classList.toggle("rc-catalog-marked", Boolean(marked));
  const button = card.querySelector(".rc-mark-above");
  if (button) button.textContent = marked ? "UNMARK ABOVE" : "MARK ABOVE";
}

async function saveName(productId, card) {
  const product = productMap.get(productId);
  if (!product) return;
  const nextName = window.prompt("Enter the new item name:", product.name || "");
  if (nextName === null) return;
  const cleanName = nextName.trim();
  if (!cleanName) return showStatus("Name cannot be blank.", true);

  try {
    await updateDoc(doc(db, "liveproducts", productId), {
      name: cleanName,
      updatedAt: serverTimestamp()
    });
    product.name = cleanName;
    productMap.set(productId, product);
    const nameEl = card.querySelector(".product-name");
    if (nameEl) nameEl.textContent = cleanName;
    const image = card.querySelector(".product-image");
    if (image) image.alt = cleanName;
    showStatus(`Saved name: ${cleanName}`);
  } catch (error) {
    console.error(error);
    showStatus(`Could not save name: ${error.message}`, true, 5000);
  }
}

async function savePrice(productId, card) {
  const product = productMap.get(productId);
  if (!product) return;
  const nextPrice = window.prompt("Enter the new price in Chinese yuan (CNY):", Number(product.price || 0).toString());
  if (nextPrice === null) return;
  const normalized = String(nextPrice).replace(/[¥,\s]/g, "");
  const yuan = Number(normalized);
  if (!Number.isFinite(yuan) || yuan < 0) return showStatus("Enter a valid yuan price.", true);

  try {
    await updateDoc(doc(db, "liveproducts", productId), {
      price: yuan,
      currency: "CNY",
      updatedAt: serverTimestamp()
    });
    product.price = yuan;
    product.currency = "CNY";
    productMap.set(productId, product);
    refreshCardPrice(card, yuan);
    showStatus(`Saved price: ¥${yuan.toFixed(2)}`);
  } catch (error) {
    console.error(error);
    showStatus(`Could not save price: ${error.message}`, true, 5000);
  }
}

async function toggleMarked(productId, card) {
  const product = productMap.get(productId);
  if (!product) return;
  const nextMarked = !Boolean(product.catalogMarked);
  try {
    await updateDoc(doc(db, "liveproducts", productId), {
      catalogMarked: nextMarked,
      updatedAt: serverTimestamp()
    });
    product.catalogMarked = nextMarked;
    productMap.set(productId, product);
    setCardMarkedState(card, nextMarked);
    showStatus(nextMarked ? "Item marked." : "Item unmarked.");
  } catch (error) {
    console.error(error);
    showStatus(`Could not update mark: ${error.message}`, true, 5000);
  }
}

function requestImageFile() {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const file = input.files?.[0] || null;
      input.remove();
      resolve(file);
    }, { once: true });
    input.click();
  });
}

async function normalizeImageForPath(file, githubPath) {
  const ext = githubPath.split(".").pop()?.toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg"
    ? "image/jpeg"
    : ext === "webp"
      ? "image/webp"
      : ext === "png"
        ? "image/png"
        : null;

  if (!mime || !window.createImageBitmap) return file;

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  return await new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not process image.")), mime, 0.95);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function githubPathFromRawUrl(imageUrl) {
  const prefix = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/`;
  if (!String(imageUrl || "").startsWith(prefix)) {
    throw new Error("This product image is not in the expected dev GitHub branch.");
  }
  return decodeURIComponent(String(imageUrl).slice(prefix.length));
}

async function getGithubToken() {
  let token = sessionStorage.getItem(GITHUB_TOKEN_KEY) || "";
  if (!token) {
    token = window.prompt("Paste your GitHub token with write access to MinerBlox/repssite. It is kept only for this browser tab/session.")?.trim() || "";
    if (!token) throw new Error("No GitHub token supplied.");
    sessionStorage.setItem(GITHUB_TOKEN_KEY, token);
  }
  return token;
}

async function githubApi(path, options = {}) {
  const token = await getGithubToken();
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) sessionStorage.removeItem(GITHUB_TOKEN_KEY);
    let message = response.statusText;
    try { message = (await response.json()).message || message; } catch {}
    throw new Error(`GitHub ${response.status}: ${message}`);
  }
  return response.status === 204 ? null : response.json();
}

async function replaceImage(productId, card) {
  const product = productMap.get(productId);
  if (!product?.imageUrl) return showStatus("This item has no GitHub image URL.", true);

  const file = await requestImageFile();
  if (!file) return;

  try {
    showStatus("Replacing image in GitHub…", false, 0);
    const githubPath = githubPathFromRawUrl(product.imageUrl);
    const encodedPath = githubPath.split("/").map(encodeURIComponent).join("/");
    const apiPath = `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodedPath}`;
    const existing = await githubApi(`${apiPath}?ref=${encodeURIComponent(REPO_BRANCH)}`);
    const normalizedBlob = await normalizeImageForPath(file, githubPath);
    const content = await blobToBase64(normalizedBlob);

    await githubApi(apiPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Replace live product image ${product.sortOrder || productId}`,
        content,
        sha: existing.sha,
        branch: REPO_BRANCH
      })
    });

    try {
      await updateDoc(doc(db, "liveproducts", productId), { updatedAt: serverTimestamp() });
    } catch {}

    const image = card.querySelector(".product-image");
    if (image) image.src = `${product.imageUrl}${product.imageUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
    showStatus("Image replaced permanently in GitHub.", false, 4200);
  } catch (error) {
    console.error(error);
    showStatus(`Could not replace image: ${error.message}`, true, 7000);
  }
}

function decorateCard(card) {
  if (card.dataset.rcEditableReady === "1") {
    const productId = getProductIdFromCard(card);
    const product = productMap.get(productId);
    if (product) setCardMarkedState(card, product.catalogMarked);
    return;
  }

  const productId = getProductIdFromCard(card);
  const product = productMap.get(productId);
  if (!productId || !product) return;

  card.dataset.rcEditableReady = "1";

  const image = card.querySelector(".product-image");
  if (image) {
    image.classList.add("rc-editable-image");
    image.title = "Click to replace this image";
    image.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      replaceImage(productId, card);
    });
  }

  const name = card.querySelector(".product-name");
  if (name) {
    name.classList.add("rc-editable-name");
    name.title = "Click to edit this name";
    name.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      saveName(productId, card);
    });
  }

  const yuanPrice = card.querySelector(".yuan-price");
  if (yuanPrice) {
    yuanPrice.classList.add("rc-editable-price");
    yuanPrice.title = "Click to edit the yuan price";
    yuanPrice.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      savePrice(productId, card);
    });
  }

  const body = card.querySelector(".product-body");
  if (body && !body.querySelector(".rc-mark-above")) {
    const markButton = iframeDocument.createElement("button");
    markButton.type = "button";
    markButton.className = "rc-mark-above";
    markButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      toggleMarked(productId, card);
    });
    body.appendChild(markButton);
  }

  setCardMarkedState(card, product.catalogMarked);
}

function decorateAllCards() {
  if (!iframeDocument) return;
  iframeDocument.querySelectorAll(".product-card").forEach(decorateCard);
}

async function loadProductsForEditing() {
  const snapshot = await getDocs(collection(db, "liveproducts"));
  snapshot.forEach(snapshotDoc => {
    productMap.set(snapshotDoc.id, { id: snapshotDoc.id, ...snapshotDoc.data() });
  });
}

async function initializeEditor() {
  iframeDocument = frame.contentDocument;
  if (!iframeDocument) throw new Error("Could not access spreadsheet page.");

  injectAdminStyles();
  await Promise.all([loadProductsForEditing(), loadCurrencyRates()]);

  const grid = iframeDocument.getElementById("product-grid");
  if (!grid) throw new Error("Spreadsheet product grid was not found.");

  decorateAllCards();
  const observer = new MutationObserver(() => decorateAllCards());
  observer.observe(grid, { childList: true, subtree: true });

  showStatus("Edit mode ready — click images, names, or yuan prices. Marks save automatically.", false, 5200);
}

frame.addEventListener("load", () => {
  initializeEditor().catch(error => {
    console.error(error);
    showStatus(`Editor failed to load: ${error.message}`, true, 8000);
  });
});
