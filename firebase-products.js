import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { enableAppCheck } from "./firebase-app-check.js?v=2026-06-30-app-check-1";
import { getFirestore, collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

let firebaseItems = [];
let selectedCategory = "All";
let searchTerm = new URLSearchParams(window.location.search).get("search") || "";
const requestedBrand = new URLSearchParams(window.location.search).get("brand");
let selectedBrand = requestedBrand || sessionStorage.getItem("rc-pending-brand") || "";
sessionStorage.removeItem("rc-pending-brand");
const CURRENCY_KEY = "rc-currency";
const RATE_CACHE_KEY = "rc-cny-rates";
const HIDDEN_CATEGORY = "uncategorised";
const FALLBACK_FILTER_CATEGORIES = [
  "Shoes", "Hoodies", "Tees", "Shorts", "Sweats", "Jeans", "Jackets", "Puffer",
  "Sweaters", "Sets", "Jerseys", "Accessories", "Room Decor", "Electronics", "Womens"
];
const FALLBACK_CURRENCIES = {
  CNY: "Chinese Yuan", GBP: "British Pound", USD: "United States Dollar", EUR: "Euro",
  AUD: "Australian Dollar", CAD: "Canadian Dollar", JPY: "Japanese Yen", KRW: "South Korean Won",
  HKD: "Hong Kong Dollar", SGD: "Singapore Dollar", NZD: "New Zealand Dollar", CHF: "Swiss Franc",
  SEK: "Swedish Krona", NOK: "Norwegian Krone", DKK: "Danish Krone", PLN: "Polish Zloty",
  CZK: "Czech Koruna", HUF: "Hungarian Forint", RON: "Romanian Leu", BGN: "Bulgarian Lev",
  TRY: "Turkish Lira", INR: "Indian Rupee", IDR: "Indonesian Rupiah", MYR: "Malaysian Ringgit",
  PHP: "Philippine Peso", THB: "Thai Baht", VND: "Vietnamese Dong", ZAR: "South African Rand",
  BRL: "Brazilian Real", MXN: "Mexican Peso", ILS: "Israeli Shekel", ISK: "Icelandic Krona"
};
const FALLBACK_RATES = { CNY:1, GBP:0.103, USD:0.139, EUR:0.119, AUD:0.212, CAD:0.190, JPY:21.8, HKD:1.09, SGD:0.178, CHF:0.111, NZD:0.232, KRW:191.5 };
let selectedCurrency = localStorage.getItem(CURRENCY_KEY) || "";
let currencyNames = { ...FALLBACK_CURRENCIES };
let cnyRates = { ...FALLBACK_RATES };
let currencyPickerRequired = false;
let fullCatalogueLoaded = false;
let filterCategories = [];
let filtersLoaded = false;
let productPopularity = new Map();
let popularityLoaded = false;

const INITIAL_FETCH_COUNT = 60;
const POPULARITY_FETCH_COUNT = 250;
let visibleItems = [];
let renderedItemCount = 0;
let renderBufferFrame = 0;
let resizeTimer = 0;
const GRID_GAP = 16;
const GRID_MIN_CARD_WIDTH = 220;

const filterWrapStyle = document.createElement("style");
filterWrapStyle.textContent = `
  @media (min-width: 721px) {
    .category-row { overflow: visible !important; }
    .category-chips { flex-wrap: wrap !important; overflow-x: visible !important; }
  }
`;
document.head.appendChild(filterWrapStyle);

function isHiddenCategory(value) {
  return String(value || "").trim().toLowerCase() === HIDDEN_CATEGORY;
}

function categories(items) {
  const itemCategories = items.map(item => item.category).filter(category => category && !isHiddenCategory(category));
  return ["All", ...new Set(itemCategories)];
}

function badgeLabel(type) {
  if (type === "best") return "Best Batch";
  if (type === "budget") return "Budget";
  if (type === "new") return "New";
  if (type === "popular") return "Popular";
  return "";
}

function formatMoney(value, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(value);
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

function priceMarkup(item) {
  const yuan = Number(item.price || 0);
  const currency = selectedCurrency || "CNY";
  const rate = currency === "CNY" ? 1 : Number(cnyRates[currency] || FALLBACK_RATES[currency] || 1);
  return `<span class="product-price-stack"><span class="product-price">${formatMoney(yuan * rate, currency)}</span><span class="yuan-price">~ ¥${yuan.toFixed(2)}</span></span>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const escapeAttr = escapeHtml;

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function safeImageUrl(value) {
  return safeUrl(value);
}

function productImage(item) {
  const imageUrl = safeImageUrl(item.imageUrl);
  if (!imageUrl) {
    return `<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9l4-4 4 4 4-4 4 4"/><path d="M3 15l4-4 4 4 4-4 4 4"/></svg>`;
  }
  return `<img class="product-image" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(item.name || "Product image")}" loading="lazy" decoding="async">`;
}

function productHref(item) {
  if (!item.id) return "#";
  return `items/${encodeURIComponent(item.id)}/`;
}

function itemCard(item) {
  const href = productHref(item);
  const agentUrl = safeUrl(item.agentUrl);
  const agentHref = agentUrl || href;
  const agentTarget = agentUrl ? ` target="_blank" rel="noopener noreferrer"` : "";

  return `
    <article class="product-card">
      <div class="product-top">
        <span class="item-badge ${escapeAttr(item.badge || "")}">${badgeLabel(item.badge)}</span>
        ${productImage(item)}
      </div>
      <div class="product-body">
        <div class="product-name">${escapeHtml(item.name || "Unnamed item")}</div>
        <div class="product-meta">
          ${priceMarkup(item)}
          <span class="product-category">${escapeHtml(item.category || "Unsorted")}</span>
        </div>
        <div class="product-actions">
          <a href="${escapeAttr(agentHref)}" class="product-btn primary" data-agent-product="${escapeAttr(item.id)}"${agentTarget}>Link</a>
          <a href="${escapeAttr(href)}" class="product-btn" data-view-product="${escapeAttr(item.id)}">View Details →</a>
        </div>
      </div>
    </article>
  `;
}

function popularityScore(item) {
  return Number(productPopularity.get(String(item.id)) || 0);
}

function filteredItems() {
  const items = firebaseItems.filter(item => {
    if (isHiddenCategory(item.category)) return false;
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
    const matchesBrand = !selectedBrand || String(item.brand || "").toLowerCase() === selectedBrand.toLowerCase();
    const value = `${item.name || ""} ${item.brand || ""} ${item.category || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
    const matchesSearch = value.includes(searchTerm.trim().toLowerCase());
    return matchesCategory && matchesBrand && matchesSearch;
  });

  if (selectedCategory === "All") {
    items.sort((a, b) => {
      const popularityDifference = popularityScore(b) - popularityScore(a);
      if (popularityDifference) return popularityDifference;
      return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
    });
  }

  return items;
}

function renderCategoryChips() {
  const wrap = document.getElementById("category-chips");
  if (!wrap) return;

  // We can only know that a category is genuinely empty after the full catalogue
  // has loaded. Until then, show a clear loading state instead of misleading filters.
  if (!fullCatalogueLoaded) {
    wrap.innerHTML = `<span class="category-chip" style="cursor:default;opacity:.72">Loading Filters...</span>`;
    return;
  }

  const actualCategories = categories(firebaseItems).filter(category => category !== "All");
  const itemCategories = ["All", ...actualCategories];

  // If a previously selected category has become empty, return to All.
  if (selectedCategory !== "All" && !actualCategories.includes(selectedCategory)) {
    selectedCategory = "All";
  }

  wrap.innerHTML = itemCategories.map(category => `
    <button class="category-chip ${selectedCategory === category ? "active" : ""}" type="button" data-category="${escapeAttr(category)}">${escapeHtml(category)}</button>
  `).join("");
}

async function loadFilterCategories() {
  try {
    const snapshot = await getDocs(collection(db, "categories"));
    const stored = snapshot.docs
      .map(categoryDoc => categoryDoc.data().name || categoryDoc.id)
      .filter(category => category && !isHiddenCategory(category));
    filterCategories = [...new Set([...FALLBACK_FILTER_CATEGORIES, ...stored])];
  } catch {
    filterCategories = [...FALLBACK_FILTER_CATEGORIES];
  } finally {
    filtersLoaded = true;
    renderCategoryChips();
  }
}

async function loadPopularity() {
  try {
    const snapshot = await getDocs(query(
      collection(db, "analyticsProducts"),
      orderBy("totalInteractions", "desc"),
      limit(POPULARITY_FETCH_COUNT)
    ));
    productPopularity = new Map(snapshot.docs.map(statsDoc => [
      String(statsDoc.id),
      Number(statsDoc.data().totalInteractions || 0)
    ]));
    popularityLoaded = true;
    if (selectedCategory === "All" && firebaseItems.length) renderItems();
  } catch {
    popularityLoaded = true;
  }
}

function gridColumnCount(grid) {
  if (!grid) return 1;
  if (window.matchMedia("(max-width: 520px)").matches) return 1;
  if (window.matchMedia("(max-width: 720px)").matches) return 2;
  return Math.max(1, Math.floor((grid.clientWidth + GRID_GAP) / (GRID_MIN_CARD_WIDTH + GRID_GAP)));
}

function appendItemsThrough(targetCount) {
  const grid = document.getElementById("product-grid");
  if (!grid || renderedItemCount >= visibleItems.length) return;
  const nextCount = Math.min(visibleItems.length, Math.max(renderedItemCount, targetCount));
  if (nextCount <= renderedItemCount) return;
  grid.insertAdjacentHTML("beforeend", visibleItems.slice(renderedItemCount, nextCount).map(itemCard).join(""));
  renderedItemCount = nextCount;
}

function ensureViewportBuffer() {
  renderBufferFrame = 0;
  const grid = document.getElementById("product-grid");
  if (!grid || !visibleItems.length || renderedItemCount >= visibleItems.length) return;

  const columns = gridColumnCount(grid);
  const firstCard = grid.querySelector(".product-card");
  if (!firstCard) {
    appendItemsThrough(columns);
    requestRenderBufferCheck();
    return;
  }

  const cardHeight = firstCard.getBoundingClientRect().height;
  if (!cardHeight) return;
  const styles = getComputedStyle(grid);
  const rowGap = parseFloat(styles.rowGap || styles.gap) || GRID_GAP;
  const rowStep = cardHeight + rowGap;
  const gridTop = grid.getBoundingClientRect().top + window.scrollY;
  const viewportBottom = window.scrollY + window.innerHeight;
  const visibleDepth = Math.max(0, viewportBottom - gridTop);
  const rowsNeeded = Math.max(1, Math.ceil(visibleDepth / rowStep) + 1);
  const targetCount = Math.min(visibleItems.length, rowsNeeded * columns);
  appendItemsThrough(targetCount);
}

function requestRenderBufferCheck() {
  if (renderBufferFrame) return;
  renderBufferFrame = requestAnimationFrame(ensureViewportBuffer);
}

function renderItems() {
  const items = filteredItems();
  const grid = document.getElementById("product-grid");
  const empty = document.getElementById("empty-state");
  const count = document.getElementById("results-count");
  const copy = document.getElementById("results-copy");
  const filterPill = document.getElementById("active-filter-pill");

  count.textContent = fullCatalogueLoaded
    ? `${items.length} item${items.length === 1 ? "" : "s"}`
    : `${items.length}+ items`;
  filterPill.textContent = selectedBrand ? `Brand: ${selectedBrand}` : `Category: ${selectedCategory}`;

  if (searchTerm.trim()) {
    copy.textContent = `Showing results for “${searchTerm.trim()}”${selectedBrand ? ` from ${selectedBrand}` : ""}.`;
  } else if (selectedBrand) {
    copy.textContent = `Showing all ${selectedBrand} items.`;
  } else if (selectedCategory !== "All") {
    copy.textContent = `Showing all items in ${selectedCategory}.`;
  } else {
    copy.textContent = fullCatalogueLoaded
      ? "Showing popular items first, followed by the rest of the spreadsheet."
      : "Loading the full spreadsheet in the background…";
  }

  visibleItems = items;
  renderedItemCount = 0;
  grid.innerHTML = "";

  if (!items.length) {
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  appendItemsThrough(gridColumnCount(grid));
  requestRenderBufferCheck();
}

function renderCurrencyList(query = "") {
  const list = document.getElementById("currency-list");
  if (!list) return;
  const normalized = query.trim().toLowerCase();
  const entries = Object.entries(currencyNames)
    .filter(([code, name]) => !normalized || code.toLowerCase().includes(normalized) || name.toLowerCase().includes(normalized))
    .sort(([codeA, nameA], [codeB, nameB]) => {
      const popular = ["GBP", "USD", "EUR", "CNY", "AUD", "CAD"];
      const a = popular.indexOf(codeA), b = popular.indexOf(codeB);
      if (a !== -1 || b !== -1) return (a === -1 ? 99 : a) - (b === -1 ? 99 : b);
      return nameA.localeCompare(nameB);
    });
  list.innerHTML = entries.length ? entries.map(([code, name]) => `
    <button class="currency-option ${code === selectedCurrency ? "selected" : ""}" type="button" data-currency="${code}">
      <span class="currency-code">${code}</span><span class="currency-name">${name}</span>
    </button>`).join("") : '<div class="currency-empty">No currencies found.</div>';
}

function openCurrencyPicker(required = false) {
  currencyPickerRequired = required || !selectedCurrency;
  const overlay = document.getElementById("currency-overlay");
  const close = document.getElementById("currency-close");
  if (!overlay) return;
  overlay.classList.add("open");
  if (close) close.hidden = currencyPickerRequired;
  renderCurrencyList();
  const search = document.getElementById("currency-search");
  if (search) { search.value = ""; requestAnimationFrame(() => search.focus()); }
}

function closeCurrencyPicker() {
  if (currencyPickerRequired || !selectedCurrency) return;
  document.getElementById("currency-overlay")?.classList.remove("open");
}

async function loadCurrencyData() {
  try {
    const cached = JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || "null");
    if (cached?.rates && Date.now() - cached.savedAt < 43200000) cnyRates = { ...cnyRates, ...cached.rates };
  } catch {}

  try {
    const [currenciesResponse, ratesResponse] = await Promise.all([
      fetch("https://api.frankfurter.dev/v1/currencies"),
      fetch("https://api.frankfurter.dev/v1/latest?base=CNY")
    ]);
    if (currenciesResponse.ok) currencyNames = { ...currencyNames, ...await currenciesResponse.json() };
    if (ratesResponse.ok) {
      const data = await ratesResponse.json();
      cnyRates = { ...cnyRates, CNY: 1, ...data.rates };
      localStorage.setItem(RATE_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rates: cnyRates }));
    }
    if (selectedCurrency) renderItems();
  } catch (error) {}
}

async function chooseCurrency(code) {
  selectedCurrency = code;
  localStorage.setItem(CURRENCY_KEY, code);
  currencyPickerRequired = false;
  document.getElementById("currency-overlay")?.classList.remove("open");
  const pill = document.getElementById("currency-pill");
  if (pill) pill.textContent = `Currency: ${code}`;
  renderItems();
}

function initializeCurrency() {
  const pill = document.getElementById("currency-pill");
  if (pill) pill.textContent = `Currency: ${selectedCurrency || "Select"}`;
  document.getElementById("currency-search")?.addEventListener("input", event => renderCurrencyList(event.target.value));
  document.getElementById("currency-list")?.addEventListener("click", event => {
    const option = event.target.closest("[data-currency]");
    if (option) chooseCurrency(option.dataset.currency);
  });
  document.getElementById("currency-close")?.addEventListener("click", closeCurrencyPicker);
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeCurrencyPicker(); });
  if (!selectedCurrency) openCurrencyPicker(true);
  loadCurrencyData();
}

initializeCurrency();

async function copyProductLink(url, productId) {
  if (!url || url === "#") return;
  await navigator.clipboard.writeText(new URL(url, window.location.href).href);
  window.rcTrackProductInteraction?.(productId, "copyClicks");
}

function setCategory(category) {
  if (isHiddenCategory(category)) return;
  selectedCategory = category;
  renderCategoryChips();
  renderItems();
}

function clearCategory() {
  selectedCategory = "All";
  selectedBrand = "";
  const url = new URL(window.location.href);
  url.searchParams.delete("brand");
  window.history.replaceState({}, "", url);
  renderCategoryChips();
  renderItems();
}

function normaliseSnapshot(snapshot) {
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => item.isActive !== false && !isHiddenCategory(item.category))
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
}

function showGrid() {
  const loading = document.getElementById("spreadsheet-loading");
  const grid = document.getElementById("product-grid");
  if (loading) loading.style.display = "none";
  if (grid) {
    grid.style.display = "grid";
    requestRenderBufferCheck();
  }
}

async function loadFullCatalogueInBackground() {
  try {
    const snapshot = await getDocs(collection(db, "liveproducts"));
    firebaseItems = normaliseSnapshot(snapshot);
    fullCatalogueLoaded = true;
    renderCategoryChips();
    renderItems();
  } catch (error) {
  }
}

async function loadProducts() {
  renderCategoryChips();
  loadFilterCategories();
  loadPopularity();

  try {
    const firstPageQuery = query(
      collection(db, "liveproducts"),
      orderBy("sortOrder", "asc"),
      limit(INITIAL_FETCH_COUNT)
    );
    const firstSnapshot = await getDocs(firstPageQuery);
    firebaseItems = normaliseSnapshot(firstSnapshot);
  } catch (error) {
    try {
      const snapshot = await getDocs(collection(db, "liveproducts"));
      firebaseItems = normaliseSnapshot(snapshot);
      fullCatalogueLoaded = true;
    } catch {
      firebaseItems = [];
    }
  }

  renderCategoryChips();
  renderItems();
  showGrid();

  if (!fullCatalogueLoaded) {
    setTimeout(loadFullCatalogueInBackground, 0);
  }
}

document.getElementById("category-chips")?.addEventListener("click", event => {
  const chip = event.target.closest("[data-category]");
  if (chip) setCategory(chip.dataset.category);
});

document.getElementById("product-grid")?.addEventListener("click", event => {
  const agentLink = event.target.closest("[data-agent-product]");
  if (agentLink) {
    window.rcTrackProductInteraction?.(agentLink.dataset.agentProduct, "outboundClicks");
    return;
  }
  const viewLink = event.target.closest("[data-view-product]");
  if (viewLink) window.rcTrackProductInteraction?.(viewLink.dataset.viewProduct, "viewClicks");
});

window.addEventListener("scroll", requestRenderBufferCheck, { passive: true });
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderItems(), 120);
});

window.setCategory = setCategory;
window.clearCategory = clearCategory;
window.copyProductLink = copyProductLink;
window.openCurrencyPicker = openCurrencyPicker;

const spreadsheetSearchInput = document.getElementById("search-input");
spreadsheetSearchInput.value = searchTerm;
spreadsheetSearchInput.addEventListener("input", event => {
  searchTerm = event.target.value;
  renderItems();
});

loadProducts();
