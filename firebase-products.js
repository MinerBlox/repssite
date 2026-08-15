import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { enableAppCheck } from "./firebase-app-check.js?v=2026-06-30-app-check-1";
import {
  getFirestore,
  collection,
  getDocs,
  getCountFromServer,
  query,
  where,
  orderBy,
  limit,
  startAfter
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
const PAGE_SIZE = 100;
const CATEGORY_SAMPLE_SIZE = 10;
const CURRENCY_KEY = "rc-currency";
const RATE_CACHE_KEY = "rc-cny-rates";

const FALLBACK_FILTER_CATEGORIES = [
  "Shoes", "Hoodies", "Tees", "Shorts", "Sweats", "Jeans", "Jackets", "Puffer",
  "Sweaters", "Sets", "Jerseys", "Accessories", "Room Decor", "Electronics", "Womens"
];

const FALLBACK_CURRENCIES = {
  CNY: "Chinese Yuan", GBP: "British Pound", USD: "United States Dollar", EUR: "Euro",
  AUD: "Australian Dollar", CAD: "Canadian Dollar", JPY: "Japanese Yen", KRW: "South Korean Won",
  HKD: "Hong Kong Dollar", SGD: "Singapore Dollar", NZD: "New Zealand Dollar", CHF: "Swiss Franc"
};

const FALLBACK_RATES = {
  CNY: 1, GBP: 0.103, USD: 0.139, EUR: 0.119, AUD: 0.212, CAD: 0.190,
  JPY: 21.8, HKD: 1.09, SGD: 0.178, CHF: 0.111, NZD: 0.232, KRW: 191.5
};

let firebaseItems = [];
let visibleItems = [];
let renderedCount = 0;
let selectedCategory = "All";
let searchTerm = new URLSearchParams(location.search).get("search") || "";
const requestedBrand = new URLSearchParams(location.search).get("brand");
let selectedBrand = requestedBrand || sessionStorage.getItem("rc-pending-brand") || "";
sessionStorage.removeItem("rc-pending-brand");

let selectedCurrency = localStorage.getItem(CURRENCY_KEY) || "";
let currencyNames = { ...FALLBACK_CURRENCIES };
let cnyRates = { ...FALLBACK_RATES };
let filterCategories = [...FALLBACK_FILTER_CATEGORIES];
let categoryCounts = new Map();
let allTotalCount = null;
let lastAllDoc = null;
let allFinished = false;
let loadingPage = false;
let fullSearchLoaded = false;
let searchLoading = false;
let categoryLoading = false;
let priorityCategoryLoading = false;
let categoryRequestToken = 0;
let searchTimer = 0;
let renderFrame = 0;

const categoryCache = new Map();
const categoryPreviewCache = new Map();

const style = document.createElement("style");
style.textContent = `
  @media (min-width: 721px) {
    .category-row { overflow: visible !important; }
    .category-chips { flex-wrap: wrap !important; overflow-x: visible !important; }
  }
`;
document.head.appendChild(style);

const esc = value => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#39;");

const hidden = value => String(value || "").trim().toLowerCase() === HIDDEN_CATEGORY;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""), location.href);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
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
  const rate = currency === "CNY" ? 1 : Number(cnyRates[currency] || 1);
  return `<span class="product-price-stack"><span class="product-price">${formatMoney(yuan * rate, currency)}</span><span class="yuan-price">~ ¥${yuan.toFixed(2)}</span></span>`;
}

function imageMarkup(item) {
  const url = safeUrl(item.imageUrl);
  if (!url) {
    return `<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
  }
  return `<img class="product-image" src="${esc(url)}" alt="${esc(item.name || "Product image")}" loading="eager" decoding="async">`;
}

function badgeLabel(type) {
  if (type === "best") return "Best Batch";
  if (type === "budget") return "Budget";
  if (type === "new") return "New";
  if (type === "popular") return "Popular";
  return "";
}

function card(item) {
  const href = item.id ? `items/${encodeURIComponent(item.id)}/` : "#";
  const agent = safeUrl(item.agentUrl);
  return `<article class="product-card" data-product-id="${esc(item.id)}">
    <div class="product-top"><span class="item-badge ${esc(item.badge || "")}">${badgeLabel(item.badge)}</span>${imageMarkup(item)}</div>
    <div class="product-body">
      <div class="product-name">${esc(item.name || "Unnamed item")}</div>
      <div class="product-meta">${priceMarkup(item)}<span class="product-category">${esc(item.category || "Unsorted")}</span></div>
      <div class="product-actions">
        <a href="${esc(agent || href)}" class="product-btn primary" data-agent-product="${esc(item.id)}"${agent ? ' target="_blank" rel="noopener noreferrer"' : ""}>Link</a>
        <a href="${esc(href)}" class="product-btn" data-view-product="${esc(item.id)}">View Details →</a>
      </div>
    </div>
  </article>`;
}

function normalize(docs) {
  return docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => item.isActive !== false && !hidden(item.category));
}

function merge(items) {
  const map = new Map(firebaseItems.map(item => [item.id, item]));
  items.forEach(item => map.set(item.id, item));
  firebaseItems = [...map.values()];
}

function filtered() {
  const term = searchTerm.trim().toLowerCase();
  return firebaseItems.filter(item => {
    if (hidden(item.category)) return false;
    if (selectedCategory !== "All" && item.category !== selectedCategory) return false;
    if (selectedBrand && String(item.brand || "").toLowerCase() !== selectedBrand.toLowerCase()) return false;
    const searchable = `${item.name || ""} ${item.brand || ""} ${item.category || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
    return searchable.includes(term);
  });
}

function totalForCurrent() {
  if (searchTerm.trim() || selectedBrand) return filtered().length;
  if (selectedCategory !== "All") {
    if (categoryCounts.has(selectedCategory)) return Number(categoryCounts.get(selectedCategory) || 0);
    return Math.max((categoryPreviewCache.get(selectedCategory) || []).length, visibleItems.length);
  }
  if (allTotalCount != null) return Number(allTotalCount || 0);
  return Math.max(firebaseItems.length, visibleItems.length);
}

function updateMeta() {
  const count = document.getElementById("results-count");
  const copy = document.getElementById("results-copy");
  const pill = document.getElementById("active-filter-pill");
  const total = totalForCurrent();
  if (count) count.textContent = `${total} item${total === 1 ? "" : "s"}`;
  if (pill) pill.textContent = selectedBrand ? `Brand: ${selectedBrand}` : `Category: ${selectedCategory}`;
  if (copy) {
    if (searchTerm.trim()) copy.textContent = `Showing results for “${searchTerm.trim()}”.`;
    else if (selectedCategory !== "All") copy.textContent = `Browse ${selectedCategory}.`;
    else copy.textContent = "Browse all items.";
  }
}

function setEmptyState(mode) {
  const empty = document.getElementById("empty-state");
  if (!empty) return;
  const title = empty.querySelector("h3");
  const text = empty.querySelector("p");

  if (mode === "hidden") {
    empty.style.display = "none";
    return;
  }

  if (mode === "loading") {
    if (title) title.textContent = "Loading items";
    if (text) text.textContent = "Getting this category ready…";
    empty.style.display = "block";
    return;
  }

  if (title) title.textContent = "No items found";
  if (text) text.textContent = "Try changing the search term or selecting a different category.";
  empty.style.display = "block";
}

function refreshEmptyState() {
  if (visibleItems.length) {
    setEmptyState("hidden");
    return;
  }
  if (searchTerm.trim()) {
    setEmptyState(searchLoading ? "loading" : "empty");
    return;
  }
  if (selectedCategory !== "All") {
    setEmptyState(categoryLoading ? "loading" : "loading");
    return;
  }
  setEmptyState("empty");
}

function renderChips() {
  const wrap = document.getElementById("category-chips");
  if (!wrap) return;

  let categories = filterCategories.filter(category => category && !hidden(category));
  categories = categories.filter(category => !categoryCounts.has(category) || Number(categoryCounts.get(category)) > 0);

  wrap.innerHTML = ["All", ...new Set(categories)]
    .map(category => `<button class="category-chip ${selectedCategory === category ? "active" : ""}" type="button" data-category="${esc(category)}">${esc(category)}</button>`)
    .join("");
}

function columns() {
  const grid = document.getElementById("product-grid");
  if (!grid) return 1;
  const width = grid.clientWidth;
  return width < 520 ? 1 : width < 720 ? 2 : Math.max(1, Math.floor((width + 16) / 236));
}

function rowHeight() {
  const grid = document.getElementById("product-grid");
  const first = grid?.querySelector(".product-card");
  if (!first) return 360;
  const computed = getComputedStyle(grid);
  const gap = parseFloat(computed.rowGap || computed.gap) || 16;
  return Math.max(160, first.getBoundingClientRect().height + gap);
}

function targetCount() {
  const grid = document.getElementById("product-grid");
  if (!grid) return 0;
  const top = grid.getBoundingClientRect().top + scrollY;
  const depth = Math.max(innerHeight, scrollY + innerHeight - top);
  return (Math.ceil(depth / rowHeight()) + 2) * columns();
}

function appendUntilTarget() {
  const grid = document.getElementById("product-grid");
  if (!grid) return;
  const target = Math.min(visibleItems.length, targetCount());
  if (target > renderedCount) {
    grid.insertAdjacentHTML("beforeend", visibleItems.slice(renderedCount, target).map(card).join(""));
    renderedCount = target;
  }
  updateMeta();
  refreshEmptyState();
}

function resetRendered() {
  const grid = document.getElementById("product-grid");
  if (!grid) return;
  visibleItems = filtered();
  renderedCount = 0;
  grid.innerHTML = "";
  appendUntilTarget();
}

async function loadCategories() {
  try {
    const snapshot = await getDocs(collection(db, "categories"));
    const stored = snapshot.docs
      .map(doc => doc.data().name || doc.id)
      .filter(category => category && !hidden(category));
    filterCategories = [...new Set([...FALLBACK_FILTER_CATEGORIES, ...stored])];
  } catch {}

  renderChips();
  void loadAllTotalCount();
  void preloadCategoryData();
}

async function loadAllTotalCount() {
  try {
    const snapshot = await getCountFromServer(collection(db, "liveproducts"));
    allTotalCount = snapshot.data().count || 0;
    updateMeta();
  } catch {}
}

async function preloadCategoryData() {
  // Intentionally sequential. This keeps Firestore/network capacity free so a category
  // the visitor actively clicks can jump ahead immediately.
  for (const category of filterCategories) {
    if (hidden(category)) continue;
    if (categoryPreviewCache.has(category) && categoryCounts.has(category)) continue;

    while (priorityCategoryLoading) await wait(80);

    try {
      const [sampleSnapshot, countSnapshot] = await Promise.all([
        getDocs(query(collection(db, "liveproducts"), where("category", "==", category), limit(CATEGORY_SAMPLE_SIZE))),
        getCountFromServer(query(collection(db, "liveproducts"), where("category", "==", category)))
      ]);
      categoryPreviewCache.set(category, normalize(sampleSnapshot.docs));
      categoryCounts.set(category, countSnapshot.data().count || 0);
      renderChips();
      updateMeta();
    } catch {
      // A failed background preload must never hide a category.
    }
  }
}

async function loadInitial() {
  loadingPage = true;
  try {
    const snapshot = await getDocs(query(collection(db, "liveproducts"), orderBy("sortOrder", "asc"), limit(PAGE_SIZE)));
    lastAllDoc = snapshot.docs.at(-1) || null;
    allFinished = snapshot.docs.length < PAGE_SIZE;
    firebaseItems = normalize(snapshot.docs);
  } catch {
    const snapshot = await getDocs(query(collection(db, "liveproducts"), limit(PAGE_SIZE)));
    lastAllDoc = snapshot.docs.at(-1) || null;
    allFinished = snapshot.docs.length < PAGE_SIZE;
    firebaseItems = normalize(snapshot.docs);
  } finally {
    loadingPage = false;
  }

  resetRendered();
  document.getElementById("spreadsheet-loading")?.style.setProperty("display", "none");
  document.getElementById("product-grid")?.style.setProperty("display", "grid");
}

async function loadNextPage() {
  if (loadingPage || allFinished || selectedCategory !== "All" || searchTerm.trim() || selectedBrand) return;
  loadingPage = true;
  try {
    const pageQuery = lastAllDoc
      ? query(collection(db, "liveproducts"), orderBy("sortOrder", "asc"), startAfter(lastAllDoc), limit(PAGE_SIZE))
      : query(collection(db, "liveproducts"), orderBy("sortOrder", "asc"), limit(PAGE_SIZE));

    const snapshot = await getDocs(pageQuery);
    if (snapshot.docs.length) lastAllDoc = snapshot.docs.at(-1);
    if (snapshot.docs.length < PAGE_SIZE) allFinished = true;
    merge(normalize(snapshot.docs));
    visibleItems = filtered();
    appendUntilTarget();
  } catch {
  } finally {
    loadingPage = false;
  }
}

async function getCategorySampleNow(category) {
  const snapshot = await getDocs(query(
    collection(db, "liveproducts"),
    where("category", "==", category),
    limit(CATEGORY_SAMPLE_SIZE)
  ));
  const items = normalize(snapshot.docs);
  categoryPreviewCache.set(category, items);
  return items;
}

async function getFullCategory(category) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const snapshot = await getDocs(query(collection(db, "liveproducts"), where("category", "==", category)));
      return normalize(snapshot.docs).sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    } catch (error) {
      lastError = error;
      if (attempt === 0) await wait(350);
    }
  }
  throw lastError;
}

async function loadCategory(category) {
  categoryRequestToken += 1;
  const requestToken = categoryRequestToken;

  selectedCategory = category;
  selectedBrand = "";
  searchTerm = "";
  searchLoading = false;
  const input = document.getElementById("search-input");
  if (input) input.value = "";
  renderChips();

  if (category === "All") {
    categoryLoading = false;
    priorityCategoryLoading = false;
    await loadInitial();
    return;
  }

  categoryLoading = true;
  priorityCategoryLoading = true;

  const cachedFull = categoryCache.get(category);
  if (cachedFull?.length) {
    firebaseItems = cachedFull;
    categoryLoading = false;
    priorityCategoryLoading = false;
    resetRendered();
    return;
  }

  const cachedPreview = categoryPreviewCache.get(category) || [];
  firebaseItems = cachedPreview;
  resetRendered();

  try {
    // First 10 are explicitly requested before the full category. This is the highest
    // priority request after a click, so visible cards can appear as quickly as possible.
    if (!cachedPreview.length) {
      const preview = await getCategorySampleNow(category);
      if (requestToken !== categoryRequestToken) return;
      if (preview.length) {
        firebaseItems = preview;
        resetRendered();
      }
    }

    const fullItems = await getFullCategory(category);
    if (requestToken !== categoryRequestToken) return;
    categoryCache.set(category, fullItems);
    categoryCounts.set(category, fullItems.length);
    firebaseItems = fullItems;
    categoryLoading = false;
    resetRendered();
    renderChips();
  } catch {
    // If the category request temporarily fails, don't falsely tell the visitor there are no items.
    if (requestToken === categoryRequestToken) {
      categoryLoading = true;
      refreshEmptyState();
    }
  } finally {
    if (requestToken === categoryRequestToken) priorityCategoryLoading = false;
  }
}

async function ensureFullForSearch() {
  if (fullSearchLoaded) return;
  const snapshot = await getDocs(collection(db, "liveproducts"));
  firebaseItems = normalize(snapshot.docs);
  fullSearchLoaded = true;
}

async function maybeLoadMore() {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(async () => {
    renderFrame = 0;
    appendUntilTarget();
    if (selectedCategory === "All" && !searchTerm.trim() && !selectedBrand && renderedCount >= visibleItems.length - 2 && !allFinished) {
      await loadNextPage();
      appendUntilTarget();
    }
  });
}

function renderCurrencyList(search = "") {
  const list = document.getElementById("currency-list");
  if (!list) return;
  const term = search.trim().toLowerCase();
  list.innerHTML = Object.entries(currencyNames)
    .filter(([code, name]) => !term || code.toLowerCase().includes(term) || name.toLowerCase().includes(term))
    .map(([code, name]) => `<button class="currency-option ${code === selectedCurrency ? "selected" : ""}" type="button" data-currency="${code}"><span class="currency-code">${code}</span><span class="currency-name">${name}</span></button>`)
    .join("");
}

function openCurrencyPicker(required = false) {
  const overlay = document.getElementById("currency-overlay");
  const close = document.getElementById("currency-close");
  if (!overlay) return;
  overlay.classList.add("open");
  if (close) close.hidden = required || !selectedCurrency;
  renderCurrencyList();
}

function closeCurrencyPicker() {
  if (selectedCurrency) document.getElementById("currency-overlay")?.classList.remove("open");
}

function chooseCurrency(code) {
  selectedCurrency = code;
  localStorage.setItem(CURRENCY_KEY, code);
  document.getElementById("currency-overlay")?.classList.remove("open");
  const pill = document.getElementById("currency-pill");
  if (pill) pill.textContent = `Currency: ${code}`;
  resetRendered();
}

async function loadCurrencyData() {
  try {
    const cached = JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || "null");
    if (cached?.rates) cnyRates = { ...cnyRates, ...cached.rates };
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
      localStorage.setItem(RATE_CACHE_KEY, JSON.stringify({ rates: cnyRates, savedAt: Date.now() }));
      resetRendered();
    }
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
  if (!selectedCurrency) openCurrencyPicker(true);
  void loadCurrencyData();
}

const searchInput = document.getElementById("search-input");
if (searchInput) {
  searchInput.value = searchTerm;
  searchInput.addEventListener("input", event => {
    searchTerm = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      categoryRequestToken += 1;
      categoryLoading = false;
      priorityCategoryLoading = false;

      if (searchTerm.trim()) {
        searchLoading = true;
        firebaseItems = [];
        resetRendered();
        try {
          await ensureFullForSearch();
        } finally {
          searchLoading = false;
        }
      } else {
        searchLoading = false;
        selectedCategory = "All";
        await loadInitial();
        renderChips();
        return;
      }

      resetRendered();
    }, 220);
  });
}

document.getElementById("category-chips")?.addEventListener("click", event => {
  const chip = event.target.closest("[data-category]");
  if (chip) void loadCategory(chip.dataset.category);
});

document.getElementById("product-grid")?.addEventListener("click", event => {
  const agent = event.target.closest("[data-agent-product]");
  if (agent) {
    window.rcTrackProductInteraction?.(agent.dataset.agentProduct, "outboundClicks");
    return;
  }
  const view = event.target.closest("[data-view-product]");
  if (view) window.rcTrackProductInteraction?.(view.dataset.viewProduct, "viewClicks");
});

window.addEventListener("scroll", maybeLoadMore, { passive: true });
window.addEventListener("resize", maybeLoadMore);
window.setCategory = loadCategory;
window.clearCategory = () => loadCategory("All");
window.openCurrencyPicker = openCurrencyPicker;
window.copyProductLink = async (url, id) => {
  if (url && url !== "#") {
    await navigator.clipboard.writeText(new URL(url, location.href).href);
    window.rcTrackProductInteraction?.(id, "copyClicks");
  }
};

initializeCurrency();
renderChips();
void loadCategories();
await loadInitial();
if (searchTerm.trim() || selectedBrand) {
  searchLoading = true;
  try {
    await ensureFullForSearch();
  } finally {
    searchLoading = false;
  }
  resetRendered();
}
