const ROW_LIMIT = 5;
const curated = { popular: [], picks: [], summer: [], autumn: [], winter: [] };
let activeSeason = "summer";
let catalogPromise = null;

async function loadCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    try {
      const response = await fetch("/api/catalog", { cache: "default" });
      if (!response.ok) throw new Error(`catalog ${response.status}`);
      const data = await response.json();
      return (Array.isArray(data.products) ? data.products : [])
        .filter(item => item && item.isActive !== false)
        .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    } catch (error) {
      console.error("Cached catalog unavailable. Firestore fallback is disabled on dev.", error);
      throw error;
    }
  })().catch(error => {
    catalogPromise = null;
    throw error;
  });
  return catalogPromise;
}

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

const popularMedals = [
  { rank: 1, label: "1st", border: "#FFD700", glow: "rgba(255,215,0,0.18)", bg: "#FFD700", text: "#000", emoji: "🥇" },
  { rank: 2, label: "2nd", border: "#C0C0C0", glow: "rgba(192,192,192,0.14)", bg: "#C0C0C0", text: "#000", emoji: "🥈" },
  { rank: 3, label: "3rd", border: "#CD7F32", glow: "rgba(205,127,50,0.16)", bg: "#CD7F32", text: "#fff", emoji: "🥉" }
];

function popularCard(item, medal, index) {
  const image = item.imageUrl
    ? `<img class="podium-img-real" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name || "Product image")}" loading="eager" decoding="async">`
    : "";
  return `
    <div class="podium-card rank-${medal.rank}" data-home-curated-popular="true" style="border:2px solid ${medal.border};box-shadow:0 0 28px ${medal.glow},0 4px 20px rgba(0,0,0,0.2);animation-delay:${index * 0.1}s">
      <div class="podium-rank" style="background:${medal.bg};color:${medal.text}">${medal.emoji} ${medal.label}</div>
      <div class="podium-img">${image}<div class="podium-watermark"><span style="color:${medal.border}">#${medal.rank}</span></div></div>
      <div class="podium-body">
        <div class="podium-name">${escapeHtml(item.name || "Unnamed item")}</div>
        <p class="podium-desc">#${medal.rank} most popular this week</p>
        <div class="podium-footer"><span class="podium-price" style="color:${medal.border}">${formatPrice(item)}</span><span class="podium-cat">${escapeHtml(item.category || "Unsorted")}</span></div>
        <a href="${escapeHtml(itemHref(item))}" class="podium-btn" style="background:${medal.bg};color:${medal.text}" data-view-product="${escapeHtml(item.id)}">View Find →</a>
      </div>
    </div>`;
}

function renderPopular(items) {
  const target = document.getElementById("podium-grid");
  if (!target || !items.length) return;
  target.innerHTML = items.slice(0, 3).map((item, index) => popularCard(item, popularMedals[index], index)).join("");
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
  document.querySelectorAll(".section-title").forEach(title => {
    if (title.textContent.trim().toLowerCase() !== "view brands") return;
    const section = title.closest(".section");
    if (section) section.style.display = "none";
  });
}

function applyCuratedRows() {
  hideViewBrands();
  if (curated.popular.length) renderPopular(curated.popular);
  if (curated.picks.length) renderRow(document.getElementById("our-picks-grid"), curated.picks);
  const seasonItems = curated[activeSeason] || [];
  if (seasonItems.length) renderRow(document.getElementById("season-grid"), seasonItems);
}

async function loadFlag(field) {
  try {
    const items = await loadCatalog();
    return items.filter(item => item[field] === true).slice(0, ROW_LIMIT);
  } catch {
    return [];
  }
}

async function loadPopular() {
  try {
    const items = await loadCatalog();
    return items
      .filter(item => Number(item.homePopularRank) >= 1 && Number(item.homePopularRank) <= 3)
      .sort((a, b) => Number(a.homePopularRank) - Number(b.homePopularRank))
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function loadCurated() {
  const [popular, picks, summer, autumn, winter] = await Promise.all([
    loadPopular(),
    loadFlag("isOurPick"),
    loadFlag("homeSummer"),
    loadFlag("homeAutumn"),
    loadFlag("homeWinter")
  ]);
  curated.popular = popular;
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
