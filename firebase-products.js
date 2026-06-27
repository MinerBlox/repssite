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
const requestedBrand = new URLSearchParams(window.location.search).get("brand");
let selectedBrand = requestedBrand || sessionStorage.getItem("rc-pending-brand") || "";
sessionStorage.removeItem("rc-pending-brand");
const CURRENCY_KEY = "rc-currency";
const RATE_CACHE_KEY = "rc-cny-rates";
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
        <div class="product-name">${escapeHtml(item.name || "Unnamed item")}</div>
        <div class="product-meta">
          ${priceMarkup(item)}
          <span class="product-category">${escapeHtml(item.category || "Unsorted")}</span>
        </div>
        <div class="product-actions">
          <a href="${escapeAttr(href)}" class="product-btn primary" data-view-product="${escapeAttr(item.id)}">View Item</a>
          <button class="product-btn" type="button" data-copy-url="${escapeAttr(href)}" data-copy-product="${escapeAttr(item.id)}">Copy Link</button>
        </div>
      </div>
    </article>
  `;
}

function filteredItems() {
  return firebaseItems.filter(item => {
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
    const matchesBrand = !selectedBrand || String(item.brand || "").toLowerCase() === selectedBrand.toLowerCase();
    const value = `${item.name || ""} ${item.brand || ""} ${item.category || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
    const matchesSearch = value.includes(searchTerm.trim().toLowerCase());
    return matchesCategory && matchesBrand && matchesSearch;
  });
}

function renderCategoryChips() {
  const wrap = document.getElementById("category-chips");
  const itemCategories = categories(firebaseItems);
  wrap.innerHTML = itemCategories.map(category => `
    <button class="category-chip ${selectedCategory === category ? "active" : ""}" type="button" data-category="${escapeAttr(category)}">${escapeHtml(category)}</button>
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
  filterPill.textContent = selectedBrand ? `Brand: ${selectedBrand}` : `Category: ${selectedCategory}`;

  if (searchTerm.trim()) {
    copy.textContent = `Showing results for “${searchTerm.trim()}”${selectedBrand ? ` from ${selectedBrand}` : ""}.`;
  } else if (selectedBrand) {
    copy.textContent = `Showing all ${selectedBrand} items.`;
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
  } catch (error) {
    console.warn("Using cached currency rates:", error);
  }
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

async function initializeCurrency() {
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
  await loadCurrencyData();
  if (document.getElementById("currency-overlay")?.classList.contains("open")) renderCurrencyList();
}

const currencyReady = initializeCurrency();

async function copyProductLink(url, productId) {
  if (!url || url === "#") return;
  await navigator.clipboard.writeText(new URL(url, window.location.href).href);
  window.rcTrackProductInteraction?.(productId, "copyClicks");
}

function setCategory(category) {
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

async function loadProducts() {
  await currencyReady;
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

document.getElementById("category-chips")?.addEventListener("click", event => {
  const chip = event.target.closest("[data-category]");
  if (chip) setCategory(chip.dataset.category);
});

document.getElementById("product-grid")?.addEventListener("click", event => {
  const copyButton = event.target.closest("[data-copy-url]");
  if (copyButton) {
    copyProductLink(copyButton.dataset.copyUrl, copyButton.dataset.copyProduct);
    return;
  }
  const viewLink = event.target.closest("[data-view-product]");
  if (viewLink) window.rcTrackProductInteraction?.(viewLink.dataset.viewProduct, "viewClicks");
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