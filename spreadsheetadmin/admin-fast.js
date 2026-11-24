import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { enableAppCheck } from "../firebase-app-check.js?v=2026-06-30-app-check-1";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, getDocFromServer, setDoc, runTransaction, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyDTTzoJlvr0mYxwx82cQ9JJn8rXrMEy7JA", authDomain: "reps-central.firebaseapp.com", projectId: "reps-central", storageBucket: "reps-central.firebasestorage.app", messagingSenderId: "812299387060", appId: "1:812299387060:web:1c93d1e7bf30b05653d7e1", measurementId: "G-8T7F9F1FZ9" };
const defaultCategories = ["Shoes", "Hoodies", "Tees", "Shorts", "Sweats", "Jeans", "Jackets", "Puffer", "Sweaters", "Sets", "Jerseys", "Accessories", "Uncategorised"];
const brandOptions = ["", "Mertra", "Ralph Lauren", "Nike"];
const badgeOptions = ["", "best", "budget", "new", "popular"];
const ADMIN_UID = "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";
const spreadsheet = "liveproducts";
const videoAlbum = "videoproducts";
const albumNames = { [spreadsheet]: "Live Spreadsheet", [videoAlbum]: "Video Items" };
const BUFFER_ROWS = 1;
const ESTIMATED_ROW_HEIGHT = 72;

const app = initializeApp(firebaseConfig);
enableAppCheck(app);
const auth = getAuth(app);
const db = getFirestore(app);

const loginView = document.getElementById("login-view");
const adminView = document.getElementById("admin-view");
const loginForm = document.getElementById("login-form");
const loginButton = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const productsList = document.getElementById("products-list");
const globalStatus = document.getElementById("global-status");
const categoryList = document.getElementById("category-list");
const categoryForm = document.getElementById("category-form");
const categoryInput = document.getElementById("category-input");
const searchInput = document.getElementById("search-input");
const sortInput = document.getElementById("sort-input");
const copyScriptBtn = document.getElementById("copy-script-btn");

const categoryFilterWrap = document.createElement("div");
categoryFilterWrap.className = "field sort";
categoryFilterWrap.innerHTML = `<label for="category-filter-input">Category</label><select id="category-filter-input"><option value="">All categories</option></select>`;
searchInput.closest(".list-controls")?.insertBefore(categoryFilterWrap, sortInput.closest(".field"));
const categoryFilterInput = document.getElementById("category-filter-input");

let products = [];
let categories = [...defaultCategories];
const drafts = new Map();
let album = spreadsheet;
let catalogueRequest = 0;
let catalogueLoading = false;
let writePending = false;
const catalogueStatus = document.getElementById("catalogue-status");
const catalogueRetry = document.getElementById("catalogue-retry");
const addForm = document.getElementById("add-item-form");
const addStatus = document.getElementById("add-status");
const newFields = document.getElementById("new-item-fields");
const addImage = document.getElementById("new-item-image");
const pendingCacheChanges = new Map();
let hasLoaded = false;
let productInteractions = new Map();
let interactionsLoaded = false;
let interactionsLoading = false;
let visibleProducts = [];
let renderedCount = 0;
let renderFrame = 0;
let searchTimer = 0;
let selectedCategoryFilter = "";

function slugify(value) { return String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function escapeHtml(value) { return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;"); }
function categoryOptions(selected) { return [`<option value="">Blank</option>`, ...[...new Set([...categories, selected].filter(Boolean))].map(category => `<option value="${escapeHtml(category)}" ${category === selected ? "selected" : ""}>${escapeHtml(category)}</option>`)].join(""); }
function badgeSelect(selected) { return [...new Set([...badgeOptions, selected || ""])].map(badge => `<option value="${badge}" ${badge === (selected || "") ? "selected" : ""}>${badge || "Blank"}</option>`).join(""); }
function brandSelect(selected) { return [...new Set([...brandOptions, selected || ""])].map(brand => `<option value="${escapeHtml(brand)}" ${brand === (selected || "") ? "selected" : ""}>${brand || "Blank"}</option>`).join(""); }
function setStatus(text) { globalStatus.textContent = text; }
function productStatus(id, text, className) { const node = document.querySelector(`[data-save-state="${CSS.escape(id)}"]`); if (!node) return; node.textContent = text; node.className = `save-state ${className || ""}`; }
function normalizeProduct(raw) { return { name: raw.name || "", price: Number(raw.price ?? raw.priceCny ?? 0), category: raw.category || "", brand: raw.brand || "", badge: raw.badge || "", imageUrl: raw.imageUrl || raw.image || "", productUrl: raw.productUrl || "", agentUrl: raw.agentUrl || "", description: raw.description || "", tags: Array.isArray(raw.tags) ? raw.tags : String(raw.tags || "").split(",").map(tag => tag.trim()).filter(Boolean), isActive: raw.isActive !== false, isOurPick: raw.isOurPick === true, homeSummer: raw.homeSummer === true, homeAutumn: raw.homeAutumn === true, homeWinter: raw.homeWinter === true, sortOrder: Number(raw.sortOrder || 0) }; }
function productFromCard(card) { return normalizeProduct({ name: card.querySelector('[data-field="name"]').value, price: card.querySelector('[data-field="price"]').value, category: card.querySelector('[data-field="category"]').value, brand: card.querySelector('[data-field="brand"]').value, badge: card.querySelector('[data-field="badge"]').value, imageUrl: card.querySelector('[data-field="imageUrl"]').value, productUrl: card.querySelector('[data-field="productUrl"]').value, agentUrl: card.querySelector('[data-field="agentUrl"]').value, description: card.querySelector('[data-field="description"]').value, tags: card.querySelector('[data-field="tags"]').value, isActive: card.querySelector('[data-field="isActive"]').checked, isOurPick: card.querySelector('[data-field="isOurPick"]').checked, homeSummer: card.querySelector('[data-field="homeSummer"]').checked, homeAutumn: card.querySelector('[data-field="homeAutumn"]').checked, homeWinter: card.querySelector('[data-field="homeWinter"]').checked, sortOrder: card.querySelector('[data-field="sortOrder"]').value }); }

function renderCategories() {
  categories = [...new Set(categories.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  categoryList.innerHTML = categories.map(category => `<span class="chip">${escapeHtml(category)}</span>`).join("");
  document.querySelectorAll('[data-field="category"], [data-quick-category]').forEach(select => {
    const value = select.value;
    select.innerHTML = categoryOptions(value);
    select.value = value;
  });
  if (categoryFilterInput) {
    const value = selectedCategoryFilter;
    categoryFilterInput.innerHTML = `<option value="">All categories</option>${categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
    categoryFilterInput.value = value;
  }
}

function interactionCount(id) { return Number(productInteractions.get(id) || 0); }

function sortedProducts(items) {
  const sorted = [...items];
  const mode = sortInput.value;
  if (mode === "alphabetical") sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (mode === "most-interacted") sorted.sort((a, b) => interactionCount(b.id) - interactionCount(a.id) || a.name.localeCompare(b.name));
  else if (mode === "least-interacted") sorted.sort((a, b) => interactionCount(a.id) - interactionCount(b.id) || a.name.localeCompare(b.name));
  else if (mode === "cheapest") sorted.sort((a, b) => Number(a.price) - Number(b.price) || a.name.localeCompare(b.name));
  else if (mode === "most-expensive") sorted.sort((a, b) => Number(b.price) - Number(a.price) || a.name.localeCompare(b.name));
  else sorted.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  return sorted;
}

function cardMarkup(item) {
  const draft = drafts.get(album + "/" + item.id);
  const values = draft?.values || item;
  const thumb = item.imageUrl
    ? `<img class="thumb" src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" decoding="async">`
    : `<div class="thumb-empty">No image</div>`;
  const interactionText = interactionsLoaded ? interactionCount(item.id).toLocaleString() : "—";
  return `<details class="product-card" data-product-id="${escapeHtml(item.id)}" ${draft?.dirty ? "open" : ""}>
    <summary class="product-head">
      ${thumb}
      <div class="product-main-copy"><div class="product-title">${escapeHtml(item.name || "Unnamed item")}</div><div class="product-meta">#${Number(item.sortOrder || 0).toLocaleString()}</div></div>
      <div class="quick-category-wrap"><select class="quick-category" data-quick-category aria-label="Quick category for ${escapeHtml(item.name || "item")}">${categoryOptions(values.category)}</select></div>
      <div class="interaction-count">${interactionText}<span>Interactions</span></div>
      <span class="expand-icon" aria-hidden="true">⌄</span>
    </summary>
    <div class="expanded-status"><div class="save-state ${draft?.dirty ? "" : "saved"}" data-save-state="${escapeHtml(item.id)}">${draft?.dirty ? "Unsaved" : "Saved"}</div></div>
    <div class="product-fields">
      ${productFields(values)}
      <div class="span-12 edit-actions">
        <label class="field" data-update-scope hidden><span>Update</span><select aria-label="Update catalogue" data-scope>
          <option value="selected">${albumNames[album]} only</option><option value="both">Both catalogues</option>
        </select></label>
        <button class="btn primary" type="button" data-save>Save changes</button>
        <button class="btn danger" type="button" data-delete>Delete from ${albumNames[album]}</button>
      </div>
    </div>
  </details>`;
}

function productFields(item) {
  return `
      <div class="field span-3"><label>Name</label><input aria-label="Name" data-field="name" value="${escapeHtml(item.name)}"></div>
      <div class="field span-2"><label>Price (CNY)</label><input aria-label="Price (CNY)" data-field="price" type="number" step="0.01" min="0" value="${item.price ?? ""}"></div>
      <div class="field span-2"><label>Category</label><select aria-label="Category" data-field="category">${categoryOptions(item.category)}</select></div>
      <div class="field span-3"><label>Brand</label><select aria-label="Brand" data-field="brand">${brandSelect(item.brand)}</select></div>
      <div class="field span-2"><label>Badge</label><select aria-label="Badge" data-field="badge">${badgeSelect(item.badge)}</select></div>
      <div class="field span-6"><label>Image URL</label><input aria-label="Image URL" data-field="imageUrl" value="${escapeHtml(item.imageUrl)}"></div>
      <div class="field span-6"><label>Agent URL</label><input aria-label="Agent URL" data-field="agentUrl" value="${escapeHtml(item.agentUrl)}"></div>
      <div class="field span-6"><label>Product URL</label><input aria-label="Product URL" data-field="productUrl" value="${escapeHtml(item.productUrl)}"></div>
      <div class="field span-2"><label>Sort Order</label><input aria-label="Sort Order" data-field="sortOrder" type="number" step="1" value="${Number(item.sortOrder || 0)}"></div>
      <label class="toggle-line span-4"><input data-field="isActive" type="checkbox" ${item.isActive !== false ? "checked" : ""}> Active on site</label>
      <label class="toggle-line span-4"><input data-field="isOurPick" type="checkbox" ${item.isOurPick === true ? "checked" : ""}> Our Picks</label>
      <label class="toggle-line span-4"><input data-field="homeSummer" type="checkbox" ${item.homeSummer === true ? "checked" : ""}> Season Finds — Summer</label>
      <label class="toggle-line span-4"><input data-field="homeAutumn" type="checkbox" ${item.homeAutumn === true ? "checked" : ""}> Season Finds — Autumn</label>
      <label class="toggle-line span-4"><input data-field="homeWinter" type="checkbox" ${item.homeWinter === true ? "checked" : ""}> Season Finds — Winter</label>
      <div class="field span-4"><label>Tags, comma separated</label><input aria-label="Tags, comma separated" data-field="tags" value="${escapeHtml((item.tags || []).join(", "))}"></div>
      <div class="field span-12"><label>Description</label><textarea aria-label="Description" data-field="description">${escapeHtml(item.description)}</textarea></div>
  `;
}

function filteredProducts() {
  const tokens = searchInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return sortedProducts(products.filter(item => {
    if (selectedCategoryFilter && item.category !== selectedCategoryFilter) return false;
    const searchable = [item.name, item.brand, item.category, item.id, ...item.tags].join(" ").toLowerCase();
    return tokens.every(token => searchable.includes(token));
  }));
}

function appendThrough(targetCount) {
  if (renderedCount >= visibleProducts.length) return;
  const nextCount = Math.min(visibleProducts.length, Math.max(targetCount, renderedCount));
  if (nextCount <= renderedCount) return;
  productsList.insertAdjacentHTML("beforeend", visibleProducts.slice(renderedCount, nextCount).map(cardMarkup).join(""));
  renderedCount = nextCount;
}

function ensureViewportBuffer() {
  renderFrame = 0;
  if (!visibleProducts.length || document.getElementById("view-panel").hidden) return;
  const listTop = productsList.getBoundingClientRect().top + window.scrollY;
  const viewportBottom = window.scrollY + window.innerHeight;
  const firstCard = productsList.querySelector('.product-card');
  const rowHeight = firstCard && !firstCard.open ? Math.max(ESTIMATED_ROW_HEIGHT, firstCard.getBoundingClientRect().height + 7) : ESTIMATED_ROW_HEIGHT;
  const depth = Math.max(window.innerHeight, viewportBottom - listTop);
  const rowsNeeded = Math.max(1, Math.ceil(depth / rowHeight) + BUFFER_ROWS);
  appendThrough(rowsNeeded);

}

function requestViewportBuffer() {
  if (renderFrame || document.getElementById("view-panel").hidden) return;
  renderFrame = requestAnimationFrame(ensureViewportBuffer);
}

function renderProducts() {
  visibleProducts = filteredProducts();
  renderedCount = 0;
  productsList.innerHTML = "";
  catalogueStatus.textContent = catalogueLoading ? "Loading " + albumNames[album] + "…" :
    visibleProducts.length.toLocaleString() + " of " + products.length.toLocaleString() + " items";
  if (!visibleProducts.length) {
    if (!catalogueLoading) productsList.innerHTML = '<div class="empty">No matching items.</div>';
    return;
  }
  appendThrough(1);
  requestViewportBuffer();
}

function productRef(source, id) {
  return doc(db, source, id);
}

function otherAlbum(source) {
  return source === spreadsheet ? videoAlbum : spreadsheet;
}

function productDraft(card) {
  const id = card.dataset.productId;
  const key = album + "/" + id;
  let draft = drafts.get(key);
  if (!draft) {
    const baseline = products.find(item => item.id === id);
    draft = { baseline, values: baseline, scope: "selected" };
    drafts.set(key, draft);
  }
  return draft;
}

async function showEditScope(card) {
  const source = album;
  const scope = card.querySelector("[data-update-scope]");
  const draft = productDraft(card);
  try {
    draft.inBoth ??= (await getDocFromServer(productRef(otherAlbum(source), card.dataset.productId))).exists();
  } catch {
    return;
  }
  if (!card.isConnected || source !== album || !draft.inBoth) return;
  scope.hidden = false;
  scope.querySelector("select").value = draft.scope;
}

async function syncSpreadsheet(id, product, updatedAt = Date.now()) {
  const token = await auth.currentUser.getIdToken();
  const request = (url, body) => fetch(url, {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const [cache, index] = await Promise.allSettled([
    request("/api/catalog", { id, product, updatedAt }),
    request("/api/catalog-index", product ? { action: "upsert", item: { ...product, id } } : { action: "remove", id })
  ]);
  if ([cache, index].some(result => result.status !== "fulfilled" || !result.value.ok)) {
    throw new Error("Firestore saved. Catalogue cache sync failed.");
  }
}

async function syncSpreadsheetSafely(change) {
  try {
    await syncSpreadsheet(change.id, change.product, change.updatedAt);
    pendingCacheChanges.delete(change.id);
    document.getElementById("retry-cache").hidden = !pendingCacheChanges.size;
    return "";
  } catch {
    pendingCacheChanges.set(change.id, change);
    document.getElementById("retry-cache").hidden = false;
    return " Firestore saved. Retry catalogue sync to update the public cache.";
  }
}

function setWritePending(value) {
  writePending = value;
  document.querySelectorAll("[data-save], [data-delete], [data-album], #view-tab, #add-tab, #retry-cache, #add-item-form button, #add-item-fields")
    .forEach(control => { control.disabled = value; });
}

function changedFields(before, after) {
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key])));
}

async function saveProduct(card) {
  const id = card.dataset.productId;
  const source = album;
  const existing = products.find(item => item.id === id);
  const patch = changedFields(productDraft(card).baseline, productFromCard(card));
  if (!Object.keys(patch).length) return productStatus(id, "No changes", "");
  if (patch.name !== undefined && !patch.name.trim()) return productStatus(id, "Enter a name", "error");
  if (patch.price !== undefined && (!Number.isFinite(patch.price) || patch.price < 0)) return productStatus(id, "Invalid price", "error");
  const both = !card.querySelector("[data-update-scope]").hidden && card.querySelector("[data-scope]").value === "both";

  setWritePending(true);
  productStatus(id, "Saving…", "saving");
  try {
    await runTransaction(db, async transaction => {
      const primary = productRef(source, id);
      const secondary = productRef(otherAlbum(source), id);
      const reads = await Promise.all([transaction.get(primary), ...(both ? [transaction.get(secondary)] : [])]);
      if (reads.some(snapshot => !snapshot.exists())) throw new Error("An entry no longer exists. Reload the catalogue.");
      const update = { ...patch, updatedAt: serverTimestamp() };
      transaction.update(primary, update);
      if (both) transaction.update(secondary, update);
    });
    Object.assign(existing, patch);
    drafts.delete(source + "/" + id);
    card.querySelector("[data-scope]").value = "selected";
    const summary = card.querySelector(".product-title");
    if (summary) summary.textContent = existing.name;
    const quick = card.querySelector("[data-quick-category]");
    if (quick) quick.value = existing.category;
    productStatus(id, "Saved", "saved");
    const message = source === spreadsheet || both ? await refreshSpreadsheetItem(id) : "";
    catalogueStatus.textContent = (both ? "Saved to both catalogues." : "Saved to " + albumNames[source] + ".") + message;
  } catch (error) {
    productStatus(id, "Save failed", "error");
    catalogueStatus.textContent = error.message;
  } finally {
    setWritePending(false);
  }
}

async function refreshSpreadsheetItem(id) {
  let snapshot;
  try {
    snapshot = await getDocFromServer(productRef(spreadsheet, id));
  } catch {
    pendingCacheChanges.set(id, { id, reread: true });
    document.getElementById("retry-cache").hidden = false;
    return " Firestore saved. Retry catalogue sync to update the public cache.";
  }
  const raw = snapshot.exists() ? snapshot.data() : null;
  return syncSpreadsheetSafely({ id, product: raw && normalizeProduct(raw), updatedAt: raw?.updatedAt?.toMillis?.() || Date.now() });
}

async function loadCategories() {
  try {
    const snapshot = await getDocs(collection(db, "categories"));
    categories = [...categories, ...snapshot.docs.map(categoryDoc => categoryDoc.data().name || categoryDoc.id)];
  } catch {
    categories.push(...defaultCategories);
  }
  renderCategories();
}

async function loadCatalogue() {
  const request = ++catalogueRequest;
  const source = album;
  catalogueLoading = true;
  products = [];
  catalogueRetry.hidden = true;
  renderProducts();
  try {
    let records;
    if (source === spreadsheet) {
      const response = await fetch("/api/catalog?ts=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("Couldn’t load the spreadsheet cache.");
      records = (await response.json()).products;
      if (!Array.isArray(records)) throw new Error("Couldn’t read the spreadsheet cache.");
    } else {
      const snapshot = await getDocs(collection(db, videoAlbum));
      records = snapshot.docs.map(entry => ({ ...entry.data(), id: entry.id }));
    }
    if (request !== catalogueRequest) return;
    products = records.filter(item => typeof item?.id === "string").map(item => ({ ...normalizeProduct(item), id: item.id }));
    categories.push(...new Set(products.map(item => item.category).filter(Boolean)));
    renderCategories();
    catalogueLoading = false;
    renderProducts();
  } catch {
    if (request !== catalogueRequest) return;
    catalogueLoading = false;
    catalogueStatus.textContent = source === spreadsheet ? "Couldn’t load the spreadsheet cache." :
      "Couldn’t load Video Items. Check Firestore rules for videoproducts.";
    catalogueRetry.hidden = false;
  }
}

async function loadInteractions() {
  if (interactionsLoaded || interactionsLoading) return;
  interactionsLoading = true;
  setStatus("Loading interaction totals…");
  try {
    const snapshot = await getDocs(collection(db, "analyticsProducts"));
    productInteractions = new Map(snapshot.docs.map(statsDoc => [statsDoc.id, Number(statsDoc.data().totalInteractions || 0)]));
    interactionsLoaded = true;
    renderProducts();
    setStatus("Interaction totals loaded");
  } catch {
    setStatus("Interaction totals could not be loaded");
  } finally {
    interactionsLoading = false;
  }
}

async function unlock(user) {
  if (user.uid !== ADMIN_UID) {
    loginError.textContent = "This account is not authorised for admin access.";
    await signOut(auth);
    return;
  }
  loginView.style.display = "none";
  adminView.style.display = "block";
  setStatus(`Signed in as ${user.email}`);
  if (!hasLoaded) {
    hasLoaded = true;
    await Promise.all([loadCategories(), loadCatalogue()]);
  }
}

function lock() {
  adminView.style.display = "none";
  loginView.style.display = "grid";
  loginButton.disabled = false;
  loginButton.textContent = "Sign In";
  productsList.innerHTML = "";
  products = [];
  catalogueRequest++;
  catalogueLoading = false;
  drafts.clear();
  selectedCategoryFilter = "";
  if (categoryFilterInput) categoryFilterInput.value = "";
  hasLoaded = false;
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginError.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";
  try {
    await signInWithEmailAndPassword(auth, document.getElementById("email-input").value.trim(), document.getElementById("password-input").value);
  } catch {
    loginError.textContent = "Login failed. Check the email and password.";
    loginButton.disabled = false;
    loginButton.textContent = "Sign In";
  }
});

document.getElementById("lock-btn").addEventListener("click", () => signOut(auth));
categoryForm.addEventListener("submit", async event => {
  event.preventDefault();
  const name = categoryInput.value.trim();
  if (!name) return;
  categories.push(name);
  renderCategories();
  categoryInput.value = "";
  try {
    await setDoc(doc(db, "categories", slugify(name)), { name, updatedAt: serverTimestamp() });
    setStatus("Category saved");
  } catch {
    setStatus("Category added locally - Firestore write failed");
  }
});

copyScriptBtn.addEventListener("click", async () => {
  try {
    const response = await fetch("./colab-upload-script.txt", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load script");
    const script = await response.text();
    await navigator.clipboard.writeText(script);
    copyScriptBtn.textContent = "COPIED";
    setStatus("Colab script copied");
    setTimeout(() => { copyScriptBtn.textContent = "COPY SCRIPT"; }, 1400);
  } catch {
    setStatus("Copy failed - open colab-upload-script.txt manually");
  }
});

productsList.addEventListener("toggle", event => {
  if (event.target.matches(".product-card[open]")) void showEditScope(event.target);
}, true);

productsList.addEventListener("click", event => {
  if (event.target.closest("[data-quick-category]")) event.stopPropagation();
  const card = event.target.closest("[data-product-id]");
  if (!card || writePending) return;
  if (event.target.closest("[data-save]")) void saveProduct(card);
  if (event.target.closest("[data-delete]")) void removeProduct(card);
});

productsList.addEventListener("input", event => {
  if (!event.target.matches("[data-field]")) return;
  const card = event.target.closest("[data-product-id]");
  const draft = productDraft(card);
  draft.values = productFromCard(card);
  draft.dirty = true;
  productStatus(card.dataset.productId, "Unsaved", "");
});

productsList.addEventListener("change", event => {
  const card = event.target.closest("[data-product-id]");
  if (!card) return;
  if (event.target.matches("[data-scope]")) productDraft(card).scope = event.target.value;
  if (!event.target.matches("[data-quick-category]")) return;
  event.stopPropagation();
  card.querySelector('[data-field="category"]').value = event.target.value;
  const draft = productDraft(card);
  draft.values = productFromCard(card);
  draft.dirty = true;
  productStatus(card.dataset.productId, "Unsaved", "");
  card.open = true;
});

async function removeProduct(card) {
  const source = album;
  const id = card.dataset.productId;
  if (!window.confirm(`Delete this item from ${albumNames[source]}?`)) return;
  setWritePending(true);
  try {
    const batch = writeBatch(db);
    batch.delete(productRef(source, id));
    await batch.commit();
    drafts.delete(source + "/" + id);
    products = products.filter(item => item.id !== id);
    const message = source === spreadsheet ? await refreshSpreadsheetItem(id) : "";
    renderProducts();
    catalogueStatus.textContent = "Item deleted." + message;
  } catch (error) {
    catalogueStatus.textContent = error.message || "Delete failed.";
  } finally {
    setWritePending(false);
  }
}

async function uploadItemImage(file) {
  const token = await auth.currentUser.getIdToken();
  const response = await fetch("/api/catalog-item-image", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": file.type },
    body: file
  });
  const data = await response.json();
  if (!response.ok || !data.url) throw new Error(data.error || "Image upload failed.");
  return data.url;
}

function resetAddFields() {
  newFields.innerHTML = productFields(normalizeProduct({})).replace('value="0"', 'value=""');
  for (const field of ["name", "price", "category", "agentUrl"]) {
    newFields.querySelector(`[data-field="${field}"]`).required = true;
  }
  addImage.value = "";
}

addForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (writePending) return;
  const input = document.getElementById("add-destination").value;
  if (input !== "both" && !Object.hasOwn(albumNames, input)) return;
  const data = productFromCard(newFields);
  data.name = data.name.trim();
  data.agentUrl = data.agentUrl.trim();
  data.imageUrl = data.imageUrl.trim();
  const file = addImage.files[0];
  if (file && (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(file.type) || file.size > 10 * 1024 * 1024)) {
    addStatus.textContent = "Choose a supported image up to 10 MB.";
    return;
  }
  function validLink(value) {
    try { const parsed = new URL(value); return ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password; } catch { return false; }
  }
  if (!data.name || !data.category || !Number.isFinite(data.price) || data.price < 0 || !validLink(data.agentUrl) ||
      (!file && !validLink(data.imageUrl)) || (data.productUrl && !validLink(data.productUrl))) {
    addStatus.textContent = "Enter a name, category, price, valid agent link, and an image URL or image file.";
    return;
  }
  setWritePending(true);
  addStatus.textContent = "Adding item…";
  try {
    if (file) data.imageUrl = await uploadItemImage(file);
    const id = doc(collection(db, spreadsheet)).id;
    const batch = writeBatch(db);
    for (const source of input === "both" ? [spreadsheet, videoAlbum] : [input]) {
      batch.set(productRef(source, id), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    await batch.commit();
    const message = input === videoAlbum ? "" : await refreshSpreadsheetItem(id);
    resetAddFields();
    addStatus.textContent = "Item added to " + (input === "both" ? "both catalogues." : albumNames[input] + ".") + message;
  } catch (error) {
    addStatus.textContent = error.message || "Couldn't add this item.";
  } finally {
    setWritePending(false);
  }
});

const viewTab = document.getElementById("view-tab");
const addTab = document.getElementById("add-tab");
function showTab(add) {
  viewTab.setAttribute("aria-pressed", String(!add));
  addTab.setAttribute("aria-pressed", String(add));
  document.getElementById("view-panel").hidden = add;
  document.getElementById("add-panel").hidden = !add;
  if (!add) void loadCatalogue();
}
viewTab.addEventListener("click", () => { if (viewTab.getAttribute("aria-pressed") !== "true") showTab(false); });
addTab.addEventListener("click", () => showTab(true));
resetAddFields();
for (const button of document.querySelectorAll("[data-album]")) {
  button.addEventListener("click", () => {
    if (album === button.dataset.album) return;
    album = button.dataset.album;
    for (const option of document.querySelectorAll("[data-album]")) option.setAttribute("aria-pressed", String(option === button));
    selectedCategoryFilter = categoryFilterInput.value = "";
    void loadCatalogue();
  });
}
catalogueRetry.addEventListener("click", () => void loadCatalogue());
document.getElementById("retry-cache").addEventListener("click", async () => {
  if (!pendingCacheChanges.size || writePending) return;
  setWritePending(true);
  try {
    for (const change of [...pendingCacheChanges.values()]) {
      if (change.reread) await refreshSpreadsheetItem(change.id);
      else await syncSpreadsheetSafely(change);
    }
    document.getElementById("cache-status").textContent = pendingCacheChanges.size ? "Some catalogue changes still need syncing." : "Catalogue cache updated.";
  } finally {
    setWritePending(false);
  }
});

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderProducts, 80);
});
categoryFilterInput.addEventListener("change", () => {
  selectedCategoryFilter = categoryFilterInput.value;
  renderProducts();
});
sortInput.addEventListener("change", async () => {
  if ((sortInput.value === "most-interacted" || sortInput.value === "least-interacted") && !interactionsLoaded) await loadInteractions();
  else renderProducts();
});
window.addEventListener("scroll", requestViewportBuffer, { passive: true });
window.addEventListener("resize", requestViewportBuffer, { passive: true });
onAuthStateChanged(auth, user => { if (user) unlock(user); else lock(); });