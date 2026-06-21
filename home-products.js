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

const medals = [
  { rank: 1, label: "1st", borderColor: "#FFD700", glowColor: "rgba(255,215,0,0.18)", badgeColor: "#FFD700", badgeText: "#000", textColor: "#FFD700", emoji: "🥇" },
  { rank: 2, label: "2nd", borderColor: "#C0C0C0", glowColor: "rgba(192,192,192,0.14)", badgeColor: "#C0C0C0", badgeText: "#000", textColor: "#C0C0C0", emoji: "🥈" },
  { rank: 3, label: "3rd", borderColor: "#CD7F32", glowColor: "rgba(205,127,50,0.16)", badgeColor: "#CD7F32", badgeText: "#fff", textColor: "#CD7F32", emoji: "🥉" }
];

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPrice(item) {
  const symbol = (item.currency || "CNY") === "CNY" ? "¥" : "$";
  const value = Number(item.price || 0);
  return `${symbol}${value.toFixed(2)}`;
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

function productImage(item) {
  if (item.imageUrl) {
    return `<div class="product-img"><img class="product-img-real" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name || "Product image")}" loading="lazy"></div>`;
  }
  return `<div class="product-img"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9l4-4 4 4 4-4 4 4"/><path d="M3 15l4-4 4 4 4-4 4 4"/></svg></div>`;
}

function productCard(item) {
  return `
    <div class="product-card">
      <div style="position:relative">
        ${productImage(item)}
        <span class="badge ${badgeClass(item.badge)}">${badgeLabel(item.badge)}</span>
      </div>
      <div class="product-body">
        <div class="product-name">${escapeHtml(item.name || "Unnamed item")}</div>
        <div class="product-meta">
          <span class="product-price">${formatPrice(item)}</span>
          <span class="product-cat">${escapeHtml(item.category || "Unsorted")}</span>
        </div>
        <a href="${escapeHtml(itemHref(item))}" class="product-btn">View Item →</a>
      </div>
    </div>
  `;
}

function moreProductCard(remaining, backgroundItem) {
  const background = backgroundItem?.imageUrl
    ? `<img class="product-more-bg" src="${escapeHtml(backgroundItem.imageUrl)}" alt="" loading="lazy">`
    : "";
  return `
    <a href="spreadsheet.html" class="product-card product-more-card" aria-label="View ${remaining} more products">
      ${background}
      <span class="product-more-overlay"></span>
      <span class="product-more-content">+ ${remaining} more</span>
    </a>
  `;
}

function podiumImage(item) {
  if (item.imageUrl) {
    return `<img class="podium-img-real" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name || "Product image")}" loading="lazy">`;
  }
  return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9l4-4 4 4 4-4 4 4"/><path d="M3 15l4-4 4 4 4-4 4 4"/></svg>`;
}

function podiumCard(item, medal, delay) {
  return `
    <div class="podium-card rank-${medal.rank}" style="border:2px solid ${medal.borderColor};box-shadow:0 0 28px ${medal.glowColor},0 4px 20px rgba(0,0,0,0.2);animation-delay:${delay}s">
      <div class="podium-rank" style="background:${medal.badgeColor};color:${medal.badgeText}">${medal.emoji} ${medal.label}</div>
      <div class="podium-img">
        ${podiumImage(item)}
        <div class="podium-watermark"><span style="color:${medal.borderColor}">#${medal.rank}</span></div>
      </div>
      <div class="podium-body">
        <div class="podium-name">${escapeHtml(item.name || "Unnamed item")}</div>
        <p class="podium-desc">${escapeHtml(item.description || "Popular spreadsheet find from Firebase.")}</p>
        <div class="podium-footer">
          <span class="podium-price" style="color:${medal.textColor}">${formatPrice(item)}</span>
          <span class="podium-cat">${escapeHtml(item.category || "Unsorted")}</span>
        </div>
        <a href="${escapeHtml(itemHref(item))}" class="podium-btn" style="background:${medal.badgeColor};color:${medal.badgeText}">View Find →</a>
      </div>
    </div>
  `;
}

function renderTicker(items) {
  const inner = document.getElementById("ticker-inner");
  if (!inner || !items.length) return;
  const tickerItems = [...items.slice(0, 10), ...items.slice(0, 10), ...items.slice(0, 10)];
  inner.innerHTML = tickerItems.map(item => `
    <span class="ticker-item">
      <span style="font-size:13px;margin-right:6px">🔥</span>
      <span style="font-size:12px;font-weight:500;color:var(--text)">${escapeHtml(item.name || "Item")}</span>
      <span style="font-size:12px;font-weight:700;color:#4da6ff;margin-left:5px">${formatPrice(item)}</span>
      <span class="ticker-dot"></span>
    </span>
  `).join("");
}

function categoryMatches(item, categories) {
  const category = String(item.category || "").toLowerCase();
  return categories.some(value => category.includes(value));
}

function seasonalItems(items, season) {
  const groups = {
    summer: ["short", "t-shirt", "tee", "hat", "cap", "sock", "accessor"],
    autumn: ["hood", "pant", "jacket", "sweat", "jean"],
    winter: ["jacket", "puffer", "coat", "scarf", "beanie", "hood"]
  };
  const picked = items.filter(item => categoryMatches(item, groups[season] || []));
  return picked.length ? picked : items;
}

let currentHomeItems = [];

function visibleProductCount(target) {
  if (window.matchMedia("(max-width: 720px)").matches) return 1;
  const gap = 16;
  const minimumCardWidth = 200;
  const capacity = Math.max(1, Math.floor((target.clientWidth + gap) / (minimumCardWidth + gap)));
  return Math.max(1, capacity - 1);
}

function renderProductRow(target, items) {
  if (!target) return;
  const count = Math.min(items.length, visibleProductCount(target));
  const remaining = Math.max(0, items.length - count);
  const backgroundItem = items[count] || items[items.length - 1];
  target.innerHTML = items.slice(0, count).map(productCard).join("") + moreProductCard(remaining, backgroundItem);
}

function renderSeasonProducts(items, seasonName) {
  window.activeSeason = seasonName;
  document.querySelectorAll(".season-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.season === seasonName));
  renderProductRow(document.getElementById("season-grid"), seasonalItems(items, seasonName));
}

function renderProductRows(items) {
  renderProductRow(document.getElementById("our-picks-grid"), items);
  renderSeasonProducts(items, window.activeSeason || "summer");
}

function renderHomeProducts(items) {
  const podium = document.getElementById("podium-grid");
  if (!items.length) return;
  currentHomeItems = items;

  const best = items.filter(item => item.badge === "best");
  const podiumItems = (best.length >= 3 ? best : items).slice(0, 3);
  if (podium && podiumItems.length) {
    podium.innerHTML = podiumItems.map((item, index) => podiumCard(item, medals[index], index * 0.1)).join("");
  }

  renderProductRows(items);
  renderTicker(items);

  window.setSeason = seasonName => renderSeasonProducts(currentHomeItems, seasonName);
  window.renderSeason = seasonName => renderSeasonProducts(currentHomeItems, seasonName);
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentHomeItems.length) renderProductRows(currentHomeItems);
  }, 120);
});

async function loadHomeProducts() {
  try {
    const snapshot = await getDocs(collection(db, "products"));
    const items = snapshot.docs
      .map(productDoc => ({ id: productDoc.id, ...productDoc.data() }))
      .filter(item => item.isActive !== false)
      .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    renderHomeProducts(items);
  } catch (error) {
    console.error("Could not load Firebase homepage products:", error);
  }
}

loadHomeProducts();
