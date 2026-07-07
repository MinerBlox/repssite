import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { enableAppCheck } from "./firebase-app-check.js?v=2026-07-01-preview-skip";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  Timestamp
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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
enableAppCheck(app);

const db = getFirestore(app);

const HEARTBEAT_MS = 20000;
const PRESENCE_WINDOW_MS = 65000;

function ensureDefaultVisitorPreferences() {
  try {
    if (!localStorage.getItem("rc-currency")) {
      localStorage.setItem("rc-currency", "GBP");

      let attempts = 0;

      const applyCurrencyToOpenPicker = () => {
        const option = document.querySelector('[data-currency="GBP"]');

        if (option) {
          option.click();
          return;
        }

        const overlay = document.getElementById("currency-overlay");
        const pill = document.getElementById("currency-pill");

        if (overlay) overlay.classList.remove("open");
        if (pill) pill.textContent = "Currency: GBP";

        attempts += 1;

        if (attempts < 20) {
          window.setTimeout(applyCurrencyToOpenPicker, 50);
        }
      };

      applyCurrencyToOpenPicker();
    }
  } catch {
  }
}

function basePath() {
  return window.location.pathname.startsWith("/repssite/") ? "/repssite/" : "/";
}

function pageDetails() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/" || path.endsWith("/index.html")) {
    return { id: "home", name: "Homepage" };
  }

  if (path.endsWith("/spreadsheet.html")) {
    return { id: "spreadsheet", name: "Spreadsheet" };
  }

  if (path.endsWith("/quality-checks.html")) {
    return { id: "quality-checks", name: "QC Viewer" };
  }

  if (path.endsWith("/link-converter.html")) {
    return { id: "link-converter", name: "Link Converter" };
  }

  if (path.endsWith("/ai.html") || path.endsWith("/ai")) {
    return { id: "ai", name: "AI Assistant" };
  }

  if (path.endsWith("/agents.html")) {
    return { id: "agents", name: "Agents" };
  }

  if (path.includes("/items/")) {
    return { id: "item-pages", name: "Item Pages" };
  }

  if (path.endsWith("/404.html")) {
    return { id: "not-found", name: "404 Page" };
  }

  return {
    id: path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "other",
    name: document.title || "Other"
  };
}

function visitorId() {
  const key = "rc-analytics-visitor";
  let id = localStorage.getItem(key);

  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now() + "-" + Math.random().toString(36).slice(2);

    localStorage.setItem(key, id);
  }

  return id;
}

function dailyVisitId() {
  return new Date().toISOString().slice(0, 10);
}

function hourlyVisitId() {
  return new Date().toISOString().slice(0, 13);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function itemHref(item) {
  return `${basePath()}items/${encodeURIComponent(item.id)}/`;
}

function formatPrice(item) {
  const price = Number(item.price || 0);
  const currency = item.currency || "CNY";
  const symbol = currency === "CNY" ? "¥" : "$";

  return `${symbol}${price.toFixed(2)}`;
}

const RATE_CACHE_KEY = "rc-cny-rates";
const FALLBACK_CNY_RATES = { CNY:1, GBP:0.103, USD:0.139, EUR:0.119, AUD:0.212, CAD:0.190, JPY:21.8, HKD:1.09, SGD:0.178, CHF:0.111, NZD:0.232, KRW:191.5 };

function selectedCurrency() {
  return localStorage.getItem("rc-currency") || "";
}

function cnyRates() {
  try {
    return { ...FALLBACK_CNY_RATES, ...(JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || "null")?.rates || {}) };
  } catch {
    return { ...FALLBACK_CNY_RATES };
  }
}

function formatLocalMoney(yuan, currency) {
  const rate = currency === "CNY" ? 1 : Number(cnyRates()[currency] || FALLBACK_CNY_RATES[currency] || 1);

  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(Number(yuan) * rate);
  } catch {
    return `${currency} ${(Number(yuan) * rate).toFixed(2)}`;
  }
}

function installSitewideCurrencyPrices() {
  const currency = selectedCurrency();
  if (!currency) return;

  const selector = ".product-price, .podium-price, .ticker-item span:nth-child(3), .nav-search-result-price, .price, .description";
  const apply = () => {
    document.querySelectorAll(selector).forEach(node => {
      if (node.dataset.rcCurrencyDone === currency) return;
      if (node.closest(".product-price-stack, .item-price-stack")) return;

      const text = node.textContent.trim();
      const match = text.match(/^¥\s*([0-9]+(?:\.[0-9]+)?)/);
      if (!match) return;

      const yuan = Number(match[1]);
      if (!Number.isFinite(yuan)) return;

      node.dataset.rcCurrencyDone = currency;
      node.innerHTML = `<span class="rc-local-price">${escapeHtml(formatLocalMoney(yuan, currency))}</span>`;
    });
  };

  const style = document.createElement("style");
  style.textContent = `.rc-local-price{display:block;color:#4da6ff}.rc-yuan-price{display:block;color:var(--muted,#888);font-family:Arial,Helvetica,sans-serif;font-size:.72em;font-weight:700;line-height:1.15}`;
  document.head.appendChild(style);

  apply();
  new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
}

const page = pageDetails();
const presenceRef = doc(db, "analyticsPresence", visitorId());

const interactionFields = [
  "viewClicks",
  "copyClicks",
  "detailViews",
  "outboundClicks"
];

async function trackProductInteraction(productId, interactionType) {
  if (!productId || !interactionFields.includes(interactionType)) return;

  const counters = Object.fromEntries(
    interactionFields.map(field => [
      field,
      increment(field === interactionType ? 1 : 0)
    ])
  );

  await setDoc(doc(db, "analyticsProducts", String(productId)), {
    ...counters,
    totalInteractions: increment(1),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

window.rcTrackProductInteraction = (productId, interactionType) => {
  trackProductInteraction(productId, interactionType).catch(() => {});
};

async function recordVisit() {
  const dayId = dailyVisitId();
  const hourId = hourlyVisitId();

  await Promise.all([
    setDoc(doc(db, "analyticsTotals", "summary"), {
      totalVisits: increment(1),
      updatedAt: serverTimestamp()
    }, { merge: true }),

    setDoc(doc(db, "analyticsPages", page.id), {
      name: page.name,
      path: window.location.pathname,
      totalVisits: increment(1),
      updatedAt: serverTimestamp()
    }, { merge: true }),

    setDoc(doc(db, "analyticsDaily", dayId), {
      date: dayId,
      totalVisits: increment(1),
      updatedAt: serverTimestamp()
    }, { merge: true }),

    setDoc(doc(db, "analyticsHourly", hourId), {
      hour: hourId,
      totalVisits: increment(1),
      updatedAt: serverTimestamp()
    }, { merge: true })
  ]);
}

async function updateAllTimeHigh(currentLive) {
  try {
    const totalsRef = doc(db, "analyticsTotals", "summary");
    const presenceSnapshot = await getDocs(collection(db, "analyticsPresence"));

    const live = Math.max(
      currentLive,
      presenceSnapshot.docs
        .map(item => item.data())
        .filter(item => {
          const lastSeen = item.lastSeen?.toMillis?.() || 0;
          return lastSeen >= Date.now() - PRESENCE_WINDOW_MS;
        }).length
    );

    const totalsSnapshot = await getDocs(collection(db, "analyticsTotals"));
    const summary = totalsSnapshot.docs.find(item => item.id === "summary")?.data() || {};
    const currentHigh = Number(summary.allTimeHighLive || 0);

    if (live > currentHigh) {
      await updateDoc(totalsRef, {
        allTimeHighLive: live,
        allTimeHighLiveAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  } catch {
  }
}

async function heartbeat() {
  const presence = {
    pageId: page.id,
    pageName: page.name,
    path: window.location.pathname,
    lastSeen: serverTimestamp()
  };

  try {
    await setDoc(presenceRef, {
      ...presence,
      expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000)
    }, { merge: true });
  } catch (error) {
    if (error?.code !== "permission-denied") throw error;

    await setDoc(presenceRef, presence, { merge: true });
  }

  updateAllTimeHigh(1).catch(() => {});
}

function installGlobalSearchStyles() {
  if (document.getElementById("rc-global-search-style")) return;

  const style = document.createElement("style");
  style.id = "rc-global-search-style";

  style.textContent = `
    .rc-global-search-shell {
      position: relative;
      width: min(270px, 24vw);
      min-height: 36px;
      padding: 6px 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--border, #29292f);
      border-radius: 9px;
      background: var(--surface2, #18181c);
      color: var(--muted, #92929c);
    }

    .rc-global-search-shell input {
      width: 100%;
      min-width: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--text, #f1f1f3);
      font: inherit;
      font-size: 13px;
    }

    .rc-global-search-shell input::placeholder {
      color: var(--muted, #92929c);
    }

    .rc-global-search-shell kbd {
      flex: 0 0 auto;
      padding: 0 4px;
      border: 1px solid var(--border, #29292f);
      border-radius: 5px;
      background: var(--surface, #111114);
      color: var(--muted, #92929c);
      font-size: 11px;
    }

    .nav-search-results {
      position: absolute;
      top: calc(100% + 9px);
      right: 0;
      z-index: 200;
      width: min(380px, calc(100vw - 28px));
      overflow: hidden;
      border: 1px solid var(--border, #29292f);
      border-radius: 10px;
      background: var(--surface, #111114);
      box-shadow: 0 18px 42px rgba(0,0,0,0.34);
    }

    .nav-search-results[hidden] {
      display: none;
    }

    .nav-search-empty {
      padding: 14px;
      color: var(--muted, #92929c);
      font-size: 13px;
    }

    .nav-search-result {
      min-height: 58px;
      padding: 8px 10px;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      border-bottom: 1px solid var(--border, #29292f);
      color: var(--text, #f1f1f3);
    }

    .nav-search-result:last-child {
      border-bottom: 0;
    }

    .nav-search-result:hover,
    .nav-search-result.active {
      background: var(--surface2, #18181c);
    }

    .nav-search-result img,
    .nav-search-thumb-empty {
      width: 42px;
      height: 42px;
      border-radius: 7px;
      object-fit: contain;
      background: var(--surface2, #18181c);
    }

    .nav-search-thumb-empty {
      display: grid;
      place-items: center;
      color: var(--muted, #92929c);
    }

    .nav-search-result-name {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      font-weight: 800;
    }

    .nav-search-result-category {
      display: block;
      margin-top: 2px;
      color: var(--muted, #92929c);
      font-size: 11px;
    }

    .nav-search-result-price {
      color: #4da6ff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }

    @media (max-width: 820px) {
      .rc-global-search-shell {
        display: none !important;
      }
    }
  `;

  document.head.appendChild(style);
}

let globalSearchItems = [];
let globalSearchLoaded = false;
let globalSearchMatches = [];
let globalSearchActiveIndex = -1;

async function loadGlobalSearchItems() {
  if (globalSearchLoaded) return globalSearchItems;

  globalSearchLoaded = true;

  try {
    const snapshot = await getDocs(collection(db, "products"));

    globalSearchItems = snapshot.docs
      .map(productDoc => ({ id: productDoc.id, ...productDoc.data() }))
      .filter(item => item.isActive !== false)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  } catch {
    globalSearchItems = [];
  }

  return globalSearchItems;
}

function closeGlobalSearch(form) {
  const results = form?.querySelector(".nav-search-results");
  const input = form?.querySelector("input");

  if (!results || !input) return;

  results.hidden = true;
  input.setAttribute("aria-expanded", "false");
  globalSearchActiveIndex = -1;
}

function updateGlobalSearchActive(form) {
  form.querySelectorAll(".nav-search-result").forEach((result, index) => {
    const active = index === globalSearchActiveIndex;

    result.classList.toggle("active", active);
    result.setAttribute("aria-selected", String(active));
  });
}

async function renderGlobalSearch(form, query) {
  const input = form.querySelector("input");
  const results = form.querySelector(".nav-search-results");

  if (!input || !results) return;

  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    closeGlobalSearch(form);
    results.innerHTML = "";
    return;
  }

  const items = await loadGlobalSearchItems();

  globalSearchMatches = items.filter(item => {
    const tags = Array.isArray(item.tags) ? item.tags.join(" ") : "";
    const searchable = `${item.name || ""} ${item.category || ""} ${tags}`.toLowerCase();

    return searchable.includes(normalized);
  }).slice(0, 7);

  globalSearchActiveIndex = -1;

  if (!globalSearchMatches.length) {
    results.innerHTML = `<div class="nav-search-empty">No matching spreadsheet items.</div>`;
  } else {
    results.innerHTML = globalSearchMatches.map((item, index) => {
      const image = item.imageUrl
        ? `<img src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy">`
        : `<span class="nav-search-thumb-empty">-</span>`;

      return `
        <a class="nav-search-result" role="option" aria-selected="false" data-search-index="${index}" href="${escapeHtml(itemHref(item))}" data-view-product="${escapeHtml(item.id)}">
          ${image}
          <span>
            <span class="nav-search-result-name">${escapeHtml(item.name || "Unnamed item")}</span>
            <span class="nav-search-result-category">${escapeHtml(item.category || "Uncategorised")}</span>
          </span>
          <span class="nav-search-result-price">${formatPrice(item)}</span>
        </a>
      `;
    }).join("");
  }

  results.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function setupSingleGlobalSearch(node) {
  if (!node || node.dataset.rcGlobalSearchReady === "true") return;

  let form = node;

  if (node.tagName !== "FORM") {
    form = document.createElement("form");
    form.className = node.className;
    form.setAttribute("role", "search");
    node.replaceWith(form);
  }

  form.dataset.rcGlobalSearchReady = "true";
  form.classList.add("rc-global-search-shell");

  form.innerHTML = `
    <input type="search" placeholder="Search..." autocomplete="off" aria-label="Search spreadsheet items" aria-expanded="false">
    <kbd>⌘K</kbd>
    <div class="nav-search-results" hidden role="listbox"></div>
  `;

  const input = form.querySelector("input");

  input.addEventListener("input", () => renderGlobalSearch(form, input.value));

  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();

      if (globalSearchActiveIndex >= 0 && globalSearchMatches[globalSearchActiveIndex]) {
        window.location.href = itemHref(globalSearchMatches[globalSearchActiveIndex]);
        return;
      }

      const query = input.value.trim();

      if (query) {
        window.location.href = `${basePath()}spreadsheet.html?search=${encodeURIComponent(query)}`;
      }

      return;
    }

    const results = form.querySelector(".nav-search-results");

    if (event.key === "Escape") {
      closeGlobalSearch(form);
      return;
    }

    if (!globalSearchMatches.length || results.hidden) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      globalSearchActiveIndex = (globalSearchActiveIndex + 1) % globalSearchMatches.length;
      updateGlobalSearchActive(form);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      globalSearchActiveIndex = (globalSearchActiveIndex - 1 + globalSearchMatches.length) % globalSearchMatches.length;
      updateGlobalSearchActive(form);
    }
  });
}

function installGlobalSearch() {
  // Homepage already has its own search from home-products.js.
  // Do not replace it here or both scripts fight over the same nav element.
  if (page.id === "home") return;

  installGlobalSearchStyles();

  document.querySelectorAll(".nav-search").forEach(setupSingleGlobalSearch);

  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      const input = document.querySelector(".rc-global-search-shell input, #product-search-input");

      if (input) {
        event.preventDefault();
        input.focus();
      }
    }
  });

  document.addEventListener("click", event => {
    document.querySelectorAll(".rc-global-search-shell").forEach(form => {
      if (!form.contains(event.target)) closeGlobalSearch(form);
    });
  });
}

function forceLeaderboardDescriptions() {
  if (page.id !== "home") return;

  const apply = () => {
    const cards = [
      ...document.querySelectorAll(".podium-card"),
      ...document.querySelectorAll(".leaderboard-card")
    ];

    cards.forEach((card, index) => {
      const rank = Number(card.dataset?.rank || 0) || index + 1;
      const description = card.querySelector(".podium-desc, .product-description");

      if (!description) return;

      const wanted = `#${rank} most popular this week`;

      if (description.textContent.trim() !== wanted) {
        description.textContent = wanted;
      }
    });
  };

  // Safe: no MutationObserver watching body. Just run a few times while products render.
  apply();
  window.setTimeout(apply, 250);
  window.setTimeout(apply, 1000);
  window.setTimeout(apply, 2500);
}

recordVisit().catch(() => {});
heartbeat().catch(() => {});
installGlobalSearch();
forceLeaderboardDescriptions();
installSitewideCurrencyPrices();

const heartbeatTimer = window.setInterval(() => {
  if (document.visibilityState === "visible") {
    heartbeat().catch(() => {});
  }
}, HEARTBEAT_MS);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    heartbeat().catch(() => {});
  }
});

window.addEventListener("pagehide", () => {
  clearInterval(heartbeatTimer);
});
