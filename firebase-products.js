import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { enableAppCheck } from "./firebase-app-check.js?v=2026-06-30-app-check-1";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  documentId
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

const app = initializeApp(firebaseConfig);
enableAppCheck(app);
const db = getFirestore(app);

const HIDDEN_CATEGORY = "uncategorised";
const CURRENCY_KEY = "rc-currency";
const RATE_CACHE_KEY = "rc-cny-rates";
const POPULARITY_FETCH_COUNT = 250;
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
const FALLBACK_RATES = {
  CNY: 1, GBP: 0.103, USD: 0.139, EUR: 0.119, AUD: 0.212, CAD: 0.190,
  JPY: 21.8, HKD: 1.09, SGD: 0.178, CHF: 0.111, NZD: 0.232, KRW: 191.5
};

let firebaseItems = [];
let selectedCategory = "All";
let searchTerm = new URLSearchParams(window.location.search).get("search") || "";
const requestedBrand = new URLSearchParams(window.location.search).get("brand");
let selectedBrand = requestedBrand || sessionStorage.getItem("rc-pending-brand") || "";
sessionStorage.removeItem("rc-pending-brand");

let selectedCurrency = localStorage.getItem(CURRENCY_KEY) || "";
let currencyNames = { ...FALLBACK_CURRENCIES };
let cnyRates = { ...FALLBACK_RATES };
let currencyPickerRequired = false;
let filterCategories = [...FALLBACK_FILTER_CATEGORIES];
let productPopularity = new Map();
let searchLoadPromise = null;
let searchTimer = 0;
let resizeTimer = 0;
let streamGeneration = 0;
let streamCursor = null;
let streamFinished = false;
let streamLoading = false;
let streamCategory = "All";
let streamPumpQueued = false;

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

function badgeLabel(type) {
  if (type === "best") return "Best Batch";
  if (type === "budget") return "Budget";
  if (type === "new") return "New";
  if (type === "popular") return "Popular";
  return "";
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

function priceMarkup(item) {
  const yuan = Number(item.price || 0);
  const currency = selectedCurrency || "CNY";
  const rate = currency === "CNY" ? 1 : Number(cnyRates[currency] || FALLBACK_RATES[currency] || 1);
  return `<span class="product-price-stack"><span class="product-price">${formatMoney(yuan * rate, currency)}</span><span class="yuan-price">~ ¥${yuan.toFixed(2)}</span></span>`;
}

function productImage(item) {
  const imageUrl = safeUrl(item.imageUrl);
  if (!imageUrl) {
    return `<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9l4-4 4 4 4-4 4 4"/><path d="M3 15l4-4 4 4 4-4 4 4"/></svg>`;
  }
  return `<img class="product-image" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(item.name || "Product image")}" loading="eager" decoding="async">`;
}

function productHref(item) {
  return item.id ? `items/${encodeURIComponent(item.id)}/` : "#";
}

function itemCard(item) {
  const href = productHref(item);
  const agentUrl = safeUrl(item.agentUrl);
  const agentHref = agentUrl || href;
  const agentTarget = agentUrl ? ` target="_blank" rel="noopener noreferrer"` : "";
  return `
    <article class="product-card" data-product-id="${escapeAttr(item.id)}">
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
    </article>`;
}

function normalizeDocs(docs) {
  return docs
    .map(productDoc => ({ id: productDoc.id, ...productDoc.data() }))
    .filter(item => item.isActive !== false && !isHiddenCategory(item.category));
}

function mergeItem(item) {
  const index = firebaseItems.findIndex(existing => existing.id === item.id);
  if (index === -1) firebaseItems.push(item);
  else firebaseItems[index] = item;
}

function popularityScore(item) {
  return Number(productPopularity.get(String(item.id)) || 0);
}

function filteredItems() {
  let items = firebaseItems.filter(item => {
    if (isHiddenCategory(item.category)) return false;
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
    const matchesBrand = !selectedBrand || String(item.brand || "").toLowerCase() === selectedBrand.toLowerCase();
    const value = `${item.name || ""} ${item.brand || ""} ${item.category || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
    return matchesCategory && matchesBrand && value.includes(searchTerm.trim().toLowerCase());
  });

  if (selectedCategory === "All" && (searchTerm.trim() || selectedBrand)) {
    items = items.sort((a, b) => {
      const popularityDifference = popularityScore(b) - popularityScore(a);
      if (popularityDifference) return popularityDifference;
      return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
    });
  }
  return items;
}

function updateResultsCopy() {
  const items = filteredItems();
  const count = document.getElementById("results-count");
  const copy = document.getElementById("results-copy");
  const filterPill = document.getElementById("active-filter-pill");
  if (count) count.textContent = streamFinished || searchTerm.trim() || selectedBrand
    ? `${items.length} item${items.length === 1 ? "" : "s"}`
    : `${items.length}+ items`;
  if (filterPill) filterPill.textContent = selectedBrand ? `Brand: ${selectedBrand}` : `Category: ${selectedCategory}`;
  if (!copy) return;
  if (searchTerm.trim()) copy.textContent = `Showing results for “${searchTerm.trim()}”${selectedBrand ? ` from ${selectedBrand}` : ""}.`;
  else if (selectedBrand) copy.textContent = `Showing all ${selectedBrand} items.`;
  else if (selectedCategory !== "All") copy.textContent = streamFinished
    ? `Showing all items in ${selectedCategory}.`
    : `Loading ${selectedCategory} as you browse…`;
  else copy.textContent = streamFinished
    ? "Showing all loaded spreadsheet items."
    : "Items load one-by-one and pause two rows ahead of you.";
}

function renderItems() {
  const items = filteredItems();
  const grid = document.getElementById("product-grid");
  const empty = document.getElementById("empty-state");
  if (!grid || !empty) return;
  grid.innerHTML = items.map(itemCard).join("");
  empty.style.display = items.length || !streamFinished ? "none" : "block";
  updateResultsCopy();
}

function appendStreamItem(item) {
  mergeItem(item);
  const grid = document.getElementById("product-grid");
  if (!grid) return;
  const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
  if (!matchesCategory || isHiddenCategory(item.category)) return;
  if (grid.querySelector(`[data-product-id="${CSS.escape(String(item.id))}"]`)) return;
  grid.insertAdjacentHTML("beforeend", itemCard(item));
  document.getElementById("empty-state").style.display = "none";
  updateResultsCopy();
}

function renderCategoryChips() {
  const wrap = document.getElementById("category-chips");
  if (!wrap) return;
  const categories = ["All", ...filterCategories.filter(category => category && !isHiddenCategory(category))];
  const unique = [...new Set(categories)];
  wrap.innerHTML = unique.map(category => `
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
  }
  renderCategoryChips();
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
  } catch {}
}

function showGrid() {
  const loading = document.getElementById("spreadsheet-loading");
  const grid = document.getElementById("product-grid");
  if (loading) loading.style.display = "none";
  if (grid) grid.style.display = "grid";
}

function estimatedRowHeight() {
  const grid = document.getElementById("product-grid");
  const card = grid?.querySelector(".product-card");
  if (!card) return 360;
  const style = getComputedStyle(grid);
  const gap = parseFloat(style.rowGap || style.gap) || 16;
  return card.getBoundingClientRect().height + gap;
}

function needsMoreBufferedItems() {
  const grid = document.getElementById("product-grid");
  if (!grid || streamFinished) return false;
  const cards = grid.querySelectorAll(".product-card");
  if (!cards.length) return true;
  const lastCard = cards[cards.length - 1];
  const bufferBottom = window.innerHeight + (estimatedRowHeight() * 2);
  return lastCard.getBoundingClientRect().bottom <= bufferBottom;
}

function buildStreamQuery() {
  const base = collection(db, "liveproducts");
  if (streamCategory === "All") {
    return streamCursor
      ? query(base, orderBy("sortOrder", "asc"), startAfter(streamCursor), limit(1))
      : query(base, orderBy("sortOrder", "asc"), limit(1));
  }
  return streamCursor
    ? query(base, where("category", "==", streamCategory), orderBy(documentId()), startAfter(streamCursor), limit(1))
    : query(base, where("category", "==", streamCategory), orderBy(documentId()), limit(1));
}

async function fetchOneStreamItem(generation) {
  if (streamLoading || streamFinished || generation !== streamGeneration) return;
  streamLoading = true;
  try {
    const snapshot = await getDocs(buildStreamQuery());
    if (generation !== streamGeneration) return;
    if (!snapshot.docs.length) {
      streamFinished = true;
      updateResultsCopy();
      const empty = document.getElementById("empty-state");
      if (empty && !filteredItems().length) empty.style.display = "block";
      return;
    }
    streamCursor = snapshot.docs[0];
    const item = normalizeDocs(snapshot.docs)[0];
    if (item) appendStreamItem(item);
  } catch (error) {
    console.warn("Could not load next spreadsheet item", error);
    streamFinished = true;
  } finally {
    streamLoading = false;
  }
}

async function pumpStream() {
  streamPumpQueued = false;
  if (searchTerm.trim() || selectedBrand || streamFinished) return;
  const generation = streamGeneration;
  let safety = 0;
  while (generation === streamGeneration && needsMoreBufferedItems() && !streamFinished && safety < 80) {
    safety += 1;
    await fetchOneStreamItem(generation);
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
}

function queueStreamPump() {
  if (streamPumpQueued) return;
  streamPumpQueued = true;
  requestAnimationFrame(pumpStream);
}

function resetStream(category = "All") {
  streamGeneration += 1;
  streamCursor = null;
  streamFinished = false;
  streamLoading = false;
  streamCategory = category;
  firebaseItems = [];
  const grid = document.getElementById("product-grid");
  if (grid) grid.innerHTML = "";
  const empty = document.getElementById("empty-state");
  if (empty) empty.style.display = "none";
  updateResultsCopy();
  queueStreamPump();
}

async function ensureFullCatalogueLoaded() {
  if (searchLoadPromise) return searchLoadPromise;
  searchLoadPromise = (async () => {
    const loading = document.getElementById("spreadsheet-loading");
    if (loading) {
      loading.textContent = "Searching full catalogue…";
      loading.style.display = "grid";
    }
    try {
      const snapshot = await getDocs(collection(db, "liveproducts"));
      firebaseItems = normalizeDocs(snapshot.docs);
      streamFinished = true;
      renderItems();
      showGrid();
    } finally {
      searchLoadPromise = null;
      if (loading) loading.textContent = "Loading spreadsheet...";
    }
  })();
  return searchLoadPromise;
}

async function setCategory(category) {
  if (isHiddenCategory(category)) return;
  selectedCategory = category;
  selectedBrand = "";
  searchTerm = "";
  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.value = "";
  renderCategoryChips();
  resetStream(category);
}

function clearCategory() {
  selectedCategory = "All";
  selectedBrand = "";
  searchTerm = "";
  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.value = "";
  const url = new URL(window.location.href);
  url.searchParams.delete("brand");
  url.searchParams.delete("search");
  window.history.replaceState({}, "", url);
  renderCategoryChips();
  resetStream("All");
}

function renderCurrencyList(search = "") {
  const list = document.getElementById("currency-list");
  if (!list) return;
  const normalized = search.trim().toLowerCase();
  const popular = ["GBP", "USD", "EUR", "CNY", "AUD", "CAD"];
  const entries = Object.entries(currencyNames)
    .filter(([code, name]) => !normalized || code.toLowerCase().includes(normalized) || name.toLowerCase().includes(normalized))
    .sort(([aCode, aName], [bCode, bName]) => {
      const a = popular.indexOf(aCode);
      const b = popular.indexOf(bCode);
      if (a !== -1 || b !== -1) return (a === -1 ? 99 : a) - (b === -1 ? 99 : b);
      return aName.localeCompare(bName);
    });
  list.innerHTML = entries.map(([code, name]) => `
    <button class="currency-option ${code === selectedCurrency ? "selected" : ""}" type="button" data-currency="${code}">
      <span class="currency-code">${code}</span><span class="currency-name">${name}</span>
    </button>`).join("");
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
  if (search) {
    search.value = "";
    requestAnimationFrame(() => search.focus());
  }
}

function closeCurrencyPicker() {
  if (currencyPickerRequired || !selectedCurrency) return;
  document.getElementById("currency-overlay")?.classList.remove("open");
}

async function chooseCurrency(code) {
  selectedCurrency = code;
  localStorage.setItem(CURRENCY_KEY, code);
  currencyPickerRequired = false;
  document.getElementById("currency-overlay")?.classList.remove("open");
  const pill = document.getElementById("currency-pill");
  if (pill) pill.textContent = `Currency: ${code}`;
  renderItems();
  queueStreamPump();
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
    renderItems();
    queueStreamPump();
  } catch {}
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
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeCurrencyPicker();
  });
  if (!selectedCurrency) openCurrencyPicker(true);
  loadCurrencyData();
}

async function copyProductLink(url, productId) {
  if (!url || url === "#") return;
  await navigator.clipboard.writeText(new URL(url, window.location.href).href);
  window.rcTrackProductInteraction?.(productId, "copyClicks");
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

window.addEventListener("scroll", queueStreamPump, { passive: true });
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(queueStreamPump, 100);
});

const spreadsheetSearchInput = document.getElementById("search-input");
spreadsheetSearchInput.value = searchTerm;
spreadsheetSearchInput.addEventListener("input", event => {
  searchTerm = event.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    if (searchTerm.trim()) {
      await ensureFullCatalogueLoaded();
      renderItems();
    } else {
      resetStream(selectedCategory);
    }
  }, 220);
});

window.setCategory = setCategory;
window.clearCategory = clearCategory;
window.copyProductLink = copyProductLink;
window.openCurrencyPicker = openCurrencyPicker;

initializeCurrency();
renderCategoryChips();
loadFilterCategories();
loadPopularity();
showGrid();

if (searchTerm.trim() || selectedBrand) {
  await ensureFullCatalogueLoaded();
  renderItems();
} else {
  resetStream(selectedCategory);
}
