import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { enableAppCheck } from "../firebase-app-check.js?v=2026-06-30-app-check-1";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, startAfter, where } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyDTTzoJlvr0mYxwx82cQ9JJn8rXrMEy7JA", authDomain: "reps-central.firebaseapp.com", projectId: "reps-central", storageBucket: "reps-central.firebasestorage.app", messagingSenderId: "812299387060", appId: "1:812299387060:web:1c93d1e7bf30b05653d7e1", measurementId: "G-8T7F9F1FZ9" };
const defaultCategories = ["Shoes", "Hoodies", "Tees", "Shorts", "Sweats", "Jeans", "Jackets", "Puffer", "Sweaters", "Sets", "Jerseys", "Accessories", "Uncategorised"];
const brandOptions = ["", "Mertra", "Ralph Lauren", "Nike"];
const badgeOptions = ["", "best", "budget", "new", "popular"];
const ADMIN_UID = "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";
const PAGE_SIZE = 80;
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
let saveTimers = new Map();
let hasLoaded = false;
let productInteractions = new Map();
let interactionsLoaded = false;
let interactionsLoading = false;
let lastProductDoc = null;
let hasMoreProducts = true;
let loadingMoreProducts = false;
let visibleProducts = [];
let renderedCount = 0;
let renderFrame = 0;
let searchTimer = 0;
let selectedCategoryFilter = "";

function slugify(value) { return String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function escapeHtml(value) { return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function categoryOptions(selected) { return [`<option value="">Blank</option>`, ...categories.map(category => `<option value="${escapeHtml(category)}" ${category === selected ? "selected" : ""}>${escapeHtml(category)}</option>`)].join(""); }
function badgeSelect(selected) { return badgeOptions.map(badge => `<option value="${badge}" ${badge === (selected || "") ? "selected" : ""}>${badge || "Blank"}</option>`).join(""); }
function brandSelect(selected) { return brandOptions.map(brand => `<option value="${escapeHtml(brand)}" ${brand === (selected || "") ? "selected" : ""}>${brand || "Blank"}</option>`).join(""); }
function setStatus(text) { globalStatus.textContent = text; }
function productStatus(id, text, className) { const node = document.querySelector(`[data-save-state="${CSS.escape(id)}"]`); if (!node) return; node.textContent = text; node.className = `save-state ${className || ""}`; }
function normalizeProduct(raw) { return { name: raw.name || "", price: Number(raw.price || 0), category: raw.category || "", brand: raw.brand || "", badge: raw.badge || "", imageUrl: raw.imageUrl || "", productUrl: raw.productUrl || "", agentUrl: raw.agentUrl || "", description: raw.description || "", tags: Array.isArray(raw.tags) ? raw.tags : String(raw.tags || "").split(",").map(tag => tag.trim()).filter(Boolean), isActive: raw.isActive !== false, isOurPick: raw.isOurPick === true, sortOrder: Number(raw.sortOrder || 0) }; }
function productFromCard(card) { return normalizeProduct({ name: card.querySelector('[data-field="name"]').value, price: card.querySelector('[data-field="price"]').value, category: card.querySelector('[data-field="category"]').value, brand: card.querySelector('[data-field="brand"]').value, badge: card.querySelector('[data-field="badge"]').value, imageUrl: card.querySelector('[data-field="imageUrl"]').value, productUrl: card.querySelector('[data-field="productUrl"]').value, agentUrl: card.querySelector('[data-field="agentUrl"]').value, description: card.querySelector('[data-field="description"]').value, tags: card.querySelector('[data-field="tags"]').value, isActive: card.querySelector('[data-field="isActive"]').checked, isOurPick: card.querySelector('[data-field="isOurPick"]').checked, sortOrder: card.querySelector('[data-field="sortOrder"]').value }); }

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
  const thumb = item.imageUrl
    ? `<img class="thumb" src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" decoding="async">`
    : `<div class="thumb-empty">No image</div>`;
  const interactionText = interactionsLoaded ? interactionCount(item.id).toLocaleString() : "—";
  return `<details class="product-card" data-product-id="${escapeHtml(item.id)}">
    <summary class="product-head">
      ${thumb}
      <div class="product-main-copy"><div class="product-title">${escapeHtml(item.name || "Unnamed item")}</div><div class="product-meta">#${Number(item.sortOrder || 0).toLocaleString()}</div></div>
      <div class="quick-category-wrap"><select class="quick-category" data-quick-category aria-label="Quick category for ${escapeHtml(item.name || "item")}">${categoryOptions(item.category)}</select></div>
      <div class="interaction-count">${interactionText}<span>Interactions</span></div>
      <span class="expand-icon" aria-hidden="true">⌄</span>
    </summary>
    <div class="expanded-status"><div class="save-state saved" data-save-state="${escapeHtml(item.id)}">Saved</div></div>
    <div class="product-fields">
      <div class="field span-3"><label>Name</label><input data-field="name" value="${escapeHtml(item.name)}"></div>
      <div class="field span-2"><label>Price</label><input data-field="price" type="number" step="0.01" min="0" value="${Number(item.price || 0)}"></div>
      <div class="field span-2"><label>Category</label><select data-field="category">${categoryOptions(item.category)}</select></div>
      <div class="field span-3"><label>Brand</label><select data-field="brand">${brandSelect(item.brand)}</select></div>
      <div class="field span-2"><label>Badge</label><select data-field="badge">${badgeSelect(item.badge)}</select></div>
      <div class="field span-6"><label>Image URL</label><input data-field="imageUrl" value="${escapeHtml(item.imageUrl)}"></div>
      <div class="field span-6"><label>Agent URL</label><input data-field="agentUrl" value="${escapeHtml(item.agentUrl)}"></div>
      <div class="field span-6"><label>Product URL</label><input data-field="productUrl" value="${escapeHtml(item.productUrl)}"></div>
      <div class="field span-2"><label>Sort Order</label><input data-field="sortOrder" type="number" step="1" value="${Number(item.sortOrder || 0)}"></div>
      <label class="toggle-line span-4"><input data-field="isActive" type="checkbox" ${item.isActive !== false ? "checked" : ""}> Active on site</label>
      <label class="toggle-line span-4"><input data-field="isOurPick" type="checkbox" ${item.isOurPick === true ? "checked" : ""}> Show in Our Picks</label>
      <div class="field span-4"><label>Tags, comma separated</label><input data-field="tags" value="${escapeHtml((item.tags || []).join(", "))}"></div>
      <div class="field span-12"><label>Description</label><textarea data-field="description">${escapeHtml(item.description)}</textarea></div>
      <div class="span-12"><button class="btn danger" type="button" data-delete>Delete item</button></div>
    </div>
  </details>`;
}

function filteredProducts() {
  const search = searchInput.value.trim().toLowerCase();
  return sortedProducts(products.filter(item => `${item.name} ${item.category} ${item.brand} ${item.id}`.toLowerCase().includes(search)));
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
  if (!visibleProducts.length) return;
  const listTop = productsList.getBoundingClientRect().top + window.scrollY;
  const viewportBottom = window.scrollY + window.innerHeight;
  const firstCard = productsList.querySelector('.product-card');
  const rowHeight = firstCard && !firstCard.open ? Math.max(ESTIMATED_ROW_HEIGHT, firstCard.getBoundingClientRect().height + 7) : ESTIMATED_ROW_HEIGHT;
  const depth = Math.max(window.innerHeight, viewportBottom - listTop);
  const rowsNeeded = Math.max(1, Math.ceil(depth / rowHeight) + BUFFER_ROWS);
  appendThrough(rowsNeeded);

  if (renderedCount >= visibleProducts.length && hasMoreProducts && !searchInput.value.trim() && sortInput.value === "default") {
    const distanceFromBottom = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
    if (distanceFromBottom < 900) loadNextProductPage();
  }
}

function requestViewportBuffer() {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(ensureViewportBuffer);
}

function renderProducts() {
  visibleProducts = filteredProducts();
  renderedCount = 0;
  productsList.innerHTML = "";
  if (!visibleProducts.length) {
    productsList.innerHTML = `<div class="empty">No products found${hasMoreProducts ? " in the items loaded so far" : ""}.</div>`;
    return;
  }
  appendThrough(1);
  requestViewportBuffer();
}

function queueSave(card) {
  const id = card.dataset.productId;
  productStatus(id, "Saving...", "saving");
  clearTimeout(saveTimers.get(id));
  saveTimers.set(id, setTimeout(async () => {
    try {
      const data = productFromCard(card);
      await updateDoc(doc(db, "liveproducts", id), { ...data, updatedAt: serverTimestamp() });
      const index = products.findIndex(item => item.id === id);
      if (index >= 0) products[index] = { id, ...data };
      const quick = card.querySelector('[data-quick-category]');
      if (quick) quick.value = data.category;
      productStatus(id, "Saved", "saved");
      if (selectedCategoryFilter && data.category !== selectedCategoryFilter) renderProducts();
    } catch {
      productStatus(id, "Error", "error");
      setStatus("Save failed - check Firestore rules");
    }
  }, 550));
}

async function quickSaveCategory(card, select) {
  const id = card.dataset.productId;
  const category = select.value;
  select.disabled = true;
  productStatus(id, "Saving...", "saving");
  try {
    await updateDoc(doc(db, "liveproducts", id), { category, updatedAt: serverTimestamp() });
    const product = products.find(item => item.id === id);
    if (product) product.category = category;
    const expandedSelect = card.querySelector('[data-field="category"]');
    if (expandedSelect) expandedSelect.value = category;
    productStatus(id, "Saved", "saved");
    setStatus(`Category saved: ${category || "Blank"}`);
    if (selectedCategoryFilter && category !== selectedCategoryFilter) renderProducts();
  } catch {
    productStatus(id, "Error", "error");
    setStatus("Category save failed");
  } finally {
    select.disabled = false;
  }
}

async function loadCategories() {
  try {
    const snapshot = await getDocs(collection(db, "categories"));
    categories = [...defaultCategories, ...snapshot.docs.map(categoryDoc => categoryDoc.data().name || categoryDoc.id)];
  } catch {
    categories = [...defaultCategories];
  }
  renderCategories();
}

function resetProductPaging() {
  products = [];
  lastProductDoc = null;
  hasMoreProducts = true;
  visibleProducts = [];
  renderedCount = 0;
  productsList.innerHTML = "";
}

async function loadNextProductPage() {
  if (loadingMoreProducts || !hasMoreProducts) return;
  loadingMoreProducts = true;
  const filterText = selectedCategoryFilter ? ` in ${selectedCategoryFilter}` : "";
  setStatus(products.length ? `Loading more${filterText}… ${products.length} loaded` : `Loading products${filterText}`);
  try {
    const base = collection(db, "liveproducts");
    let pageQuery;
    if (selectedCategoryFilter) {
      pageQuery = lastProductDoc
        ? query(base, where("category", "==", selectedCategoryFilter), startAfter(lastProductDoc), limit(PAGE_SIZE))
        : query(base, where("category", "==", selectedCategoryFilter), limit(PAGE_SIZE));
    } else {
      pageQuery = lastProductDoc
        ? query(base, orderBy("sortOrder"), startAfter(lastProductDoc), limit(PAGE_SIZE))
        : query(base, orderBy("sortOrder"), limit(PAGE_SIZE));
    }
    const snapshot = await getDocs(pageQuery);
    if (!snapshot.empty) lastProductDoc = snapshot.docs[snapshot.docs.length - 1];
    const newProducts = snapshot.docs.map(productDoc => ({ id: productDoc.id, ...normalizeProduct(productDoc.data()) }));
    const existingIds = new Set(products.map(item => item.id));
    products.push(...newProducts.filter(item => !existingIds.has(item.id)));
    hasMoreProducts = snapshot.docs.length === PAGE_SIZE;
    renderProducts();
    setStatus(`${products.length.toLocaleString()} ${selectedCategoryFilter || "products"} loaded${hasMoreProducts ? " — scroll for more" : ""}`);
  } catch (error) {
    setStatus("Product load failed - check Firestore/indexes");
    console.error(error);
  } finally {
    loadingMoreProducts = false;
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
    setStatus(`${products.length.toLocaleString()} products loaded`);
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
    await loadCategories();
    await loadNextProductPage();
  }
}

function lock() {
  adminView.style.display = "none";
  loginView.style.display = "grid";
  loginButton.disabled = false;
  loginButton.textContent = "Sign In";
  productsList.innerHTML = "";
  products = [];
  lastProductDoc = null;
  hasMoreProducts = true;
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

productsList.addEventListener("pointerdown", event => {
  if (event.target.closest('[data-quick-category]')) event.stopPropagation();
});
productsList.addEventListener("click", event => {
  if (event.target.closest('[data-quick-category]')) {
    event.preventDefault();
    event.stopPropagation();
  }
});
productsList.addEventListener("input", event => {
  if (event.target.matches('[data-quick-category]')) return;
  const card = event.target.closest("[data-product-id]");
  if (card) queueSave(card);
});
productsList.addEventListener("change", event => {
  const card = event.target.closest("[data-product-id]");
  if (!card) return;
  if (event.target.matches('[data-quick-category]')) {
    quickSaveCategory(card, event.target);
    return;
  }
  queueSave(card);
});
productsList.addEventListener("click", async event => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  const card = button.closest("[data-product-id]");
  const id = card.dataset.productId;
  if (!window.confirm(`Delete ${id}?`)) return;
  try {
    await deleteDoc(doc(db, "liveproducts", id));
    products = products.filter(item => item.id !== id);
    renderProducts();
    setStatus("Item deleted");
  } catch {
    setStatus("Delete failed - check Firestore rules");
  }
});

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderProducts, 80);
});
categoryFilterInput?.addEventListener("change", async () => {
  selectedCategoryFilter = categoryFilterInput.value;
  resetProductPaging();
  window.scrollTo({ top: 0, behavior: "instant" });
  await loadNextProductPage();
});
sortInput.addEventListener("change", async () => {
  if ((sortInput.value === "most-interacted" || sortInput.value === "least-interacted") && !interactionsLoaded) await loadInteractions();
  else renderProducts();
});
window.addEventListener("scroll", requestViewportBuffer, { passive: true });
window.addEventListener("resize", requestViewportBuffer, { passive: true });
onAuthStateChanged(auth, user => { if (user) unlock(user); else lock(); });