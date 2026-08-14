import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDTTzoJlvr0mYxwx82cQ9JJn8rXrMEy7JA",
  authDomain: "reps-central.firebaseapp.com",
  projectId: "reps-central",
  storageBucket: "reps-central.firebasestorage.app",
  messagingSenderId: "812299387060",
  appId: "1:812299387060:web:1c93d1e7bf30b05653d7e1",
  measurementId: "G-8T7F9F1FZ9"
};

const app = getApps().find(candidate => candidate.name === "[DEFAULT]") || initializeApp(firebaseConfig, "homepage-curation");
const db = getFirestore(app);
const ROW_LIMIT = 5;
const curated = { picks: [], summer: [], autumn: [], winter: [] };
let activeSeason = "summer";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPrice(item) {
  const symbol = (item.currency || "CNY") === "CNY" ? "¥" : "$";
  return `${symbol}${Number(item.price || 0).toFixed(2)}`;
}

function itemHref(item) {
  return item.id ? `items/${encodeURIComponent(item.id)}/` : "spreadsheet.html";
}

function badgeLabel(type) {
  if (type === "best") return "Best Batch";
  if (type === "budget") return "Budget Batch";
  if (type === "new") return "New Find";
  if (type === "popular") return "Popular";
  return "Random Batch";
}

function badgeClass(type) {
  if (type === "best") return "badge-best";
  if (type === "budget") return "badge-budget";
  return "badge-random";
}

function productCard(item) {
  const image = item.imageUrl
    ? `<div class="product-img"><img class="product-img-real" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name || "Product image")}" loading="eager" decoding="async"></div>`
    : `<div class="product-img"></div>`;
  return `
    <div class="product-card" data-home-curated="true">
      <div style="position:relative">
        ${image}
        <span class="badge ${badgeClass(item.badge)}">${badgeLabel(item.badge)}</span>
      </div>
      <div class="product-body">
        <div class="product-name">${escapeHtml(item.name || "Unnamed item")}</div>
        <div class="product-meta">
          <span class="product-price">${formatPrice(item)}</span>
          <span class="product-cat">${escapeHtml(item.category || "Unsorted")}</span>
        </div>
        <a href="${escapeHtml(itemHref(item))}" class="product-btn" data-view-product="${escapeHtml(item.id)}">View Item →</a>
      </div>
    </div>`;
}

function visibleProductCount(target) {
  if (window.matchMedia("(max-width: 720px)").matches) return 1;
  const gap = 16;
  const minimumCardWidth = 200;
  const capacity = Math.max(1, Math.floor((target.clientWidth + gap) / (minimumCardWidth + gap)));
  return Math.max(1, capacity - 1);
}

function moreCard(backgroundItem) {
  const image = backgroundItem?.imageUrl
    ? `<img class="product-more-bg" src="${escapeHtml(backgroundItem.imageUrl)}" alt="" loading="eager" decoding="async">`
    : "";
  return `<a href="spreadsheet.html" class="product-card product-more-card" aria-label="View more products">${image}<span class="product-more-overlay"></span><span class="product-more-content">View more</span></a>`;
}

function renderRow(target, items) {
  if (!target || !items.length) return;
  const count = Math.min(items.length, visibleProductCount(target));
  target.innerHTML = items.slice(0, count).map(productCard).join("") + moreCard(items[count] || items[items.length - 1]);
}

function hideViewBrands() {
  document.querySelectorAll("a,button").forEach(node => {
    if (node.textContent.trim().toLowerCase() !== "view brands") return;
    const section = node.closest("section");
    if (section) section.style.display = "none";
    else node.style.display = "none";
  });
}

function applyCuratedRows() {
  hideViewBrands();
  if (curated.picks.length) renderRow(document.getElementById("our-picks-grid"), curated.picks);
  const seasonItems = curated[activeSeason] || [];
  if (seasonItems.length) renderRow(document.getElementById("season-grid"), seasonItems);
}

async function loadFlag(field) {
  try {
    const snapshot = await getDocs(query(collection(db, "liveproducts"), where(field, "==", true), limit(ROW_LIMIT)));
    return snapshot.docs
      .map(productDoc => ({ id: productDoc.id, ...productDoc.data() }))
      .filter(item => item.isActive !== false)
      .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
      .slice(0, ROW_LIMIT);
  } catch {
    return [];
  }
}

async function loadCurated() {
  const [picks, summer, autumn, winter] = await Promise.all([
    loadFlag("isOurPick"),
    loadFlag("homeSummer"),
    loadFlag("homeAutumn"),
    loadFlag("homeWinter")
  ]);
  curated.picks = picks;
  curated.summer = summer;
  curated.autumn = autumn;
  curated.winter = winter;
  applyCuratedRows();
}

document.addEventListener("click", event => {
  const tab = event.target.closest(".season-tab");
  if (!tab) return;
  activeSeason = tab.dataset.season || activeSeason;
  setTimeout(applyCuratedRows, 0);
}, true);

window.addEventListener("resize", () => setTimeout(applyCuratedRows, 0), { passive: true });

function start() {
  hideViewBrands();
  loadCurated();
  setTimeout(applyCuratedRows, 700);
  setTimeout(applyCuratedRows, 1800);
  setTimeout(applyCuratedRows, 4000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
