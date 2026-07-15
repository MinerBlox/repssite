import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { enableAppCheck } from "./firebase-app-check.js?v=2026-06-30-app-check-1";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
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

const ADMIN_UID = "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";
const REPO_OWNER = "MinerBlox";
const REPO_NAME = "repssite";
const REPO_BRANCH = "dev";
const GITHUB_TOKEN_KEY = "rc-editcatalog-github-token";
const CURRENCY_KEY = "rc-currency";
const RATE_CACHE_KEY = "rc-cny-rates";

const app = initializeApp(firebaseConfig, "edit-catalog-admin");
enableAppCheck(app);
const auth = getAuth(app);
const db = getFirestore(app);

const loginView = document.getElementById("login-view");
const loginForm = document.getElementById("login-form");
const loginButton = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const catalogRoot = document.getElementById("catalog-root");
const statusBox = document.getElementById("admin-status");

const productMap = new Map();
let statusTimer = null;
let editorLoaded = false;
let observer = null;
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

function showStatus(message, isError = false, timeout = 2800) {
  clearTimeout(statusTimer);
  statusBox.textContent = message;
  statusBox.classList.toggle("error", isError);
  statusBox.classList.add("show");
  if (timeout) statusTimer = setTimeout(() => statusBox.classList.remove("show"), timeout);
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

function installEditorStyles() {
  if (document.getElementById("rc-editcatalog-styles")) return;
  const style = document.createElement("style");
  style.id = "rc-editcatalog-styles";
  style.textContent = `
    .product-card.rc-catalog-marked {
      border-color: rgba(239,68,68,.82) !important;
      background: rgba(127,29,29,.32) !important;
      box-shadow: inset 0 0 0 1px rgba(239,68,68,.18) !important;
    }
    .product-card.rc-catalog-marked .product-top { background: rgba(127,29,29,.18) !important; }
    .product-card.rc-catalog-marked .product-image { background: rgba(127,29,29,.12) !important; }
    .product-image.rc-editable-image,
    .product-name.rc-editable-name,
    .yuan-price.rc-editable-price { cursor: pointer !important; }
    .product-image.rc-editable-image:hover { opacity: .72; }
    .product-name.rc-editable-name:hover,
    .yuan-price.rc-editable-price:hover { text-decoration: underline dotted; }
    .rc-mark-above {
      width: 100%; min-height: 36px; margin-top: 10px;
      border: 1px solid rgba(239,68,68,.48) !important;
      border-radius: 9px; background: rgba(239,68,68,.08) !important;
      color: #f87171 !important; font-size: 11px !important;
      font-weight: 900 !important; letter-spacing: .055em;
      text-transform: uppercase; cursor: pointer;
    }
    .rc-mark-above:hover { background: rgba(239,68,68,.17) !important; }
    .product-card.rc-catalog-marked .rc-mark-above {
      background: #dc2626 !important; border-color: #dc2626 !important; color: #fff !important;
    }
    .rc-editor-bar {
      position: sticky; top: 60px; z-index: 49; display:flex; align-items:center;
      justify-content:space-between; gap:12px; padding:10px 28px;
      border-bottom:1px solid var(--border); background:rgba(17,17,20,.96);
      backdrop-filter:blur(14px); color:var(--text); font-size:12px;
    }
    .rc-editor-bar strong { color:#4da6ff; }
    .rc-editor-signout { border:1px solid var(--border) !important; border-radius:8px;
      padding:7px 11px !important; background:var(--surface2) !important; color:var(--text) !important;
      font:700 11px 'DM Sans',sans-serif !important; }
    @media (max-width:720px) { .rc-editor-bar { top:60px; padding-inline:16px; } }
  `;
  document.head.appendChild(style);
}

function installThemeHelpers() {
  let theme = localStorage.getItem("rc-theme") || "dark";
  window.applyTheme = function applyTheme() {
    document.body.className = theme;
    const label = document.getElementById("theme-label");
    const icon = document.getElementById("theme-icon");
    if (label) label.textContent = theme === "dark" ? "Light" : "Dark";
    if (icon) {
      icon.innerHTML = theme === "dark"
        ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
        : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    }
  };
  window.toggleTheme = function toggleTheme() {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem("rc-theme", theme);
    window.applyTheme();
  };
  window.applyTheme();
}

async function buildSpreadsheetPage() {
  const response = await fetch(`spreadsheet.html?editorSource=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load spreadsheet.html (${response.status}).`);

  const html = await response.text();
  const parsed = new DOMParser().parseFromString(html, "text/html");

  parsed.head.querySelectorAll("style").forEach(sourceStyle => {
    const style = document.createElement("style");
    style.textContent = sourceStyle.textContent;
    document.head.appendChild(style);
  });

  const nodes = [...parsed.body.children].filter(node => node.tagName !== "SCRIPT");
  catalogRoot.replaceChildren(...nodes.map(node => document.importNode(node, true)));

  const root = catalogRoot.querySelector("#root");
  if (!root) throw new Error("Spreadsheet layout could not be loaded.");

  const nav = root.querySelector("nav");
  if (nav) {
    const editorBar = document.createElement("div");
    editorBar.className = "rc-editor-bar";
    editorBar.innerHTML = `<span><strong>CATALOG EDIT MODE</strong> — click an image, item name or yuan price to edit it. Marks save permanently.</span><button class="rc-editor-signout" type="button">Sign Out</button>`;
    nav.insertAdjacentElement("afterend", editorBar);
    editorBar.querySelector(".rc-editor-signout").addEventListener("click", () => signOut(auth));
  }

  installThemeHelpers();
  installEditorStyles();
  catalogRoot.style.display = "block";

  await import(`./firebase-products.js?v=2026-07-15-editor-${Date.now()}`);
}

async function waitForProductGrid(timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const grid = document.getElementById("product-grid");
    if (grid && grid.querySelector(".product-card")) return grid;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("Products did not finish loading.");
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
    await updateDoc(doc(db, "liveproducts", productId), { name: cleanName, updatedAt: serverTimestamp() });
    product.name = cleanName;
    const nameEl = card.querySelector(".product-name");
    if (nameEl) nameEl.textContent = cleanName;
    const image = card.querySelector(".product-image");
    if (image) image.alt = cleanName;
    showStatus(`Saved name: ${cleanName}`);
  } catch (error) {
    showStatus(`Could not save name: ${error.message}`, true, 6000);
  }
}

async function savePrice(productId, card) {
  const product = productMap.get(productId);
  if (!product) return;
  const nextPrice = window.prompt("Enter the new price in Chinese yuan (CNY):", Number(product.price || 0).toString());
  if (nextPrice === null) return;
  const yuan = Number(String(nextPrice).replace(/[¥,\s]/g, ""));
  if (!Number.isFinite(yuan) || yuan < 0) return showStatus("Enter a valid yuan price.", true);

  try {
    await updateDoc(doc(db, "liveproducts", productId), { price: yuan, currency: "CNY", updatedAt: serverTimestamp() });
    product.price = yuan;
    product.currency = "CNY";
    refreshCardPrice(card, yuan);
    showStatus(`Saved price: ¥${yuan.toFixed(2)}`);
  } catch (error) {
    showStatus(`Could not save price: ${error.message}`, true, 6000);
  }
}

async function toggleMarked(productId, card) {
  const product = productMap.get(productId);
  if (!product) return;
  const nextMarked = !Boolean(product.catalogMarked);

  try {
    await updateDoc(doc(db, "liveproducts", productId), { catalogMarked: nextMarked, updatedAt: serverTimestamp() });
    product.catalogMarked = nextMarked;
    setCardMarkedState(card, nextMarked);
    showStatus(nextMarked ? "Item marked." : "Item unmarked.");
  } catch (error) {
    showStatus(`Could not update mark: ${error.message}`, true, 6000);
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
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : null;
  if (!mime || !window.createImageBitmap) return file;

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not process image.")), mime, 0.95));
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
  if (!String(imageUrl || "").startsWith(prefix)) throw new Error("This product image is not in the expected dev GitHub branch.");
  return decodeURIComponent(String(imageUrl).slice(prefix.length));
}

async function getGithubToken() {
  let token = sessionStorage.getItem(GITHUB_TOKEN_KEY) || "";
  if (!token) {
    token = window.prompt("Paste your GitHub token with write access to MinerBlox/repssite. It stays only in this browser tab/session.")?.trim() || "";
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
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
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
    showStatus("Replacing image permanently in GitHub…", false, 0);
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

    await updateDoc(doc(db, "liveproducts", productId), { updatedAt: serverTimestamp() });

    const image = card.querySelector(".product-image");
    if (image) image.src = `${product.imageUrl}${product.imageUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
    showStatus("Image replaced permanently in GitHub.", false, 4500);
  } catch (error) {
    showStatus(`Could not replace image: ${error.message}`, true, 8000);
  }
}

function decorateCard(card) {
  const productId = getProductIdFromCard(card);
  const product = productMap.get(productId);
  if (!productId || !product) return;

  if (card.dataset.rcEditableReady === "1") {
    setCardMarkedState(card, product.catalogMarked);
    return;
  }
  card.dataset.rcEditableReady = "1";

  const image = card.querySelector(".product-image");
  if (image) {
    image.classList.add("rc-editable-image");
    image.title = "Click to permanently replace this GitHub image";
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
    const markButton = document.createElement("button");
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
  document.querySelectorAll(".product-card").forEach(decorateCard);
}

async function loadProductsForEditing() {
  productMap.clear();
  const snapshot = await getDocs(collection(db, "liveproducts"));
  snapshot.forEach(snapshotDoc => productMap.set(snapshotDoc.id, { id: snapshotDoc.id, ...snapshotDoc.data() }));
}

async function startEditor() {
  if (editorLoaded) return;
  editorLoaded = true;
  loginView.style.display = "none";

  try {
    await Promise.all([buildSpreadsheetPage(), loadProductsForEditing(), loadCurrencyRates()]);
    const grid = await waitForProductGrid();
    decorateAllCards();

    observer?.disconnect();
    observer = new MutationObserver(() => decorateAllCards());
    observer.observe(grid, { childList: true, subtree: false });

    showStatus("Edit mode ready — all changes save permanently.", false, 5200);
  } catch (error) {
    editorLoaded = false;
    showStatus(`Editor failed to load: ${error.message}`, true, 9000);
  }
}

function lockEditor() {
  observer?.disconnect();
  observer = null;
  editorLoaded = false;
  productMap.clear();
  catalogRoot.innerHTML = "";
  catalogRoot.style.display = "none";
  loginView.style.display = "grid";
  loginButton.disabled = false;
  loginButton.textContent = "Sign In";
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginError.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";

  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("email-input").value.trim(),
      document.getElementById("password-input").value
    );
  } catch (error) {
    loginError.textContent = error.code === "auth/invalid-credential" ? "Incorrect email or password." : error.message;
    loginButton.disabled = false;
    loginButton.textContent = "Sign In";
  }
});

onAuthStateChanged(auth, user => {
  if (!user) {
    lockEditor();
    return;
  }

  if (user.uid !== ADMIN_UID) {
    loginError.textContent = "This account is not authorised for admin access.";
    signOut(auth);
    return;
  }

  startEditor();
});