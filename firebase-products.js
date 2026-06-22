import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

let firebaseItems = [];
let selectedCategory = "All";
let searchTerm = new URLSearchParams(window.location.search).get("search") || "";

function categories(items) {
  return ["All", ...new Set(items.map(item => item.category).filter(Boolean))];
}

function badgeLabel(type) {
  if (type === "best") return "Best Batch";
  if (type === "budget") return "Budget";
  if (type === "new") return "New";
  if (type === "popular") return "Popular";
  return "";
}

function formatPrice(item) {
  const currency = item.currency || "CNY";
  const symbol = currency === "CNY" ? "¥" : "$";
  const value = Number(item.price || 0);
  return `${symbol}${value.toFixed(2)}`;
}

function escapeAttr(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function productImage(item) {
  if (!item.imageUrl) {
    return `<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9l4-4 4 4 4-4 4 4"/><path d="M3 15l4-4 4 4 4-4 4 4"/></svg>`;
  }
  return `<img class="product-image" src="${escapeAttr(item.imageUrl)}" alt="${escapeAttr(item.name || "Product image")}" loading="lazy">`;
}

function productHref(item) {
  if (!item.id) return "#";
  return `items/${encodeURIComponent(item.id)}/`;
}

function itemCard(item) {
  const href = productHref(item);

  return `
    <article class="product-card">
      <div class="product-top">
        <span class="item-badge ${item.badge || ""}">${badgeLabel(item.badge)}</span>
        ${productImage(item)}
      </div>
      <div class="product-body">
        <div class="product-name">${item.name || "Unnamed item"}</div>
        <div class="product-meta">
          <span class="product-price">${formatPrice(item)}</span>
          <span class="product-category">${item.category || "Unsorted"}</span>
        </div>
        <div class="product-actions">
          <a href="${escapeAttr(href)}" class="product-btn primary">View Item</a>
          <button class="product-btn" type="button" onclick="copyProductLink('${href.replace(/'/g, "\\'")}')">Copy Link</button>
        </div>
      </div>
    </article>
  `;
}

function filteredItems() {
  return firebaseItems.filter(item => {
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
    const value = `${item.name || ""} ${item.category || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
    const matchesSearch = value.includes(searchTerm.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  });
}

function renderCategoryChips() {
  const wrap = document.getElementById("category-chips");
  const itemCategories = categories(firebaseItems);
  wrap.innerHTML = itemCategories.map(category => `
    <button class="category-chip ${selectedCategory === category ? "active" : ""}" onclick="setCategory('${category.replace(/'/g, "\\'")}')">${category}</button>
  `).join("");
}

function renderItems() {
  const items = filteredItems();
  const grid = document.getElementById("product-grid");
  const empty = document.getElementById("empty-state");
  const count = document.getElementById("results-count");
  const copy = document.getElementById("results-copy");
  const filterPill = document.getElementById("active-filter-pill");

  count.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
  filterPill.textContent = `Category: ${selectedCategory}`;

  if (searchTerm.trim()) {
    copy.textContent = `Showing results for “${searchTerm.trim()}” in ${selectedCategory === "All" ? "all categories" : selectedCategory}.`;
  } else if (selectedCategory !== "All") {
    copy.textContent = `Showing all items in ${selectedCategory}.`;
  } else {
    copy.textContent = "Showing every item in the spreadsheet.";
  }

  if (!items.length) {
    grid.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  grid.innerHTML = items.map(itemCard).join("");
}

async function copyProductLink(url) {
  if (!url || url === "#") return;
  await navigator.clipboard.writeText(new URL(url, window.location.href).href);
}

function setCategory(category) {
  selectedCategory = category;
  renderCategoryChips();
  renderItems();
}

function clearCategory() {
  selectedCategory = "All";
  renderCategoryChips();
  renderItems();
}

async function loadProducts() {
  try {
    const snapshot = await getDocs(collection(db, "products"));
    firebaseItems = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => item.isActive !== false)
      .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  } catch (error) {
    console.error("Could not load Firebase products:", error);
    firebaseItems = [];
  }

  renderCategoryChips();
  renderItems();

  const loading = document.getElementById("spreadsheet-loading");
  const grid = document.getElementById("product-grid");
  if (loading) loading.style.display = "none";
  if (grid) grid.style.display = "grid";
}

window.setCategory = setCategory;
window.clearCategory = clearCategory;
window.copyProductLink = copyProductLink;

const spreadsheetSearchInput = document.getElementById("search-input");
spreadsheetSearchInput.value = searchTerm;
spreadsheetSearchInput.addEventListener("input", event => {
  searchTerm = event.target.value;
  renderItems();
});

loadProducts();
