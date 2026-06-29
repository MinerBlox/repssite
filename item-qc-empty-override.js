const EMPTY_QC_MESSAGE = "We're still working on QC pictures for this item...";
const BAD_QC_TEXT = [
  "Add the original Weidian, 1688 or Taobao link in Product URL to load QC pictures.",
  "The QC providers replied, but there were no image links for this item.",
  "Could not load QC pictures yet. Open the console and search [RC QC]."
];

const COLLECTION_IMAGE_KEYS = [
  "qcShowUrl",
  "qcShowUrls",
  "qcPhotos",
  "qcPhotoUrls",
  "checkPhotos",
  "checkPhotoUrls",
  "photos",
  "photoUrls",
  "pictures",
  "pictureUrls",
  "images",
  "imageUrls",
  "imgs"
];

let qcCollections = [];
let activeCollection = [];
let activeCollectionIndex = 0;
let collectionReturnFocus = null;
let renderedSignature = "";
let pagerScheduled = false;
let lastGridSignature = "";
let lastColumnCount = 0;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeImageUrl(value) {
  return String(value || "").replace(/\\\//g, "/").replace(/,+$/, "").trim();
}

function isImageUrl(value) {
  return /https?:\/\/[^"'\s<>\\]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>\\]*)?$/i.test(normalizeImageUrl(value));
}

function collectImageUrls(value, urls = []) {
  if (typeof value === "string") {
    const normalized = normalizeImageUrl(value);
    const matches = normalized.match(/https?:\/\/[^"'\s<>\\]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>\\]*)?/gi) || [];
    urls.push(...matches.map(normalizeImageUrl));
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach(entry => collectImageUrls(entry, urls));
    return urls;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach(entry => collectImageUrls(entry, urls));
  }
  return urls;
}

function uniqueImages(value) {
  return [...new Set(collectImageUrls(value))].filter(isImageUrl);
}

function ensureStyles() {
  if (document.getElementById("rc-qc-collection-styles")) return;
  const style = document.createElement("style");
  style.id = "rc-qc-collection-styles";
  style.textContent = `
    @keyframes rcQcQuestionPop{0%{opacity:0;transform:translateY(18px) scale(.72) rotate(-8deg)}16%{opacity:.75}70%{opacity:.28}100%{opacity:0;transform:translateY(-58px) scale(1.22) rotate(10deg)}}
    .qc-placeholder.qc-empty-working{position:relative;min-height:210px;grid-column:1/-1;display:grid;place-items:center;overflow:hidden;border-radius:18px;background:radial-gradient(circle at top,rgba(77,166,255,.11),transparent 48%),var(--surface2);text-align:center;padding:28px}.qc-placeholder.qc-empty-working strong{position:relative;z-index:2;max-width:430px;color:var(--text);font-family:'Syne',sans-serif;font-size:clamp(18px,3vw,28px);line-height:1.15}.qc-question-effect{position:absolute;inset:0;pointer-events:none;opacity:.95}.qc-question-effect span{position:absolute;bottom:18px;color:#4da6ff;font-family:'Syne',sans-serif;font-weight:800;animation:rcQcQuestionPop 2.75s ease-in-out infinite;text-shadow:0 0 22px rgba(77,166,255,.26)}.qc-question-effect span:nth-child(1){left:10%;font-size:30px;animation-delay:0s}.qc-question-effect span:nth-child(2){left:24%;font-size:18px;animation-delay:.45s}.qc-question-effect span:nth-child(3){left:43%;font-size:38px;animation-delay:.85s}.qc-question-effect span:nth-child(4){left:61%;font-size:22px;animation-delay:.18s}.qc-question-effect span:nth-child(5){left:77%;font-size:34px;animation-delay:.68s}.qc-question-effect span:nth-child(6){left:90%;font-size:20px;animation-delay:1.05s}
    .qc-collection-card{position:relative}.qc-collection-provider{position:absolute;left:10px;top:10px;z-index:2;min-height:26px;padding:0 9px;display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(0,0,0,.46);color:rgba(255,255,255,.88);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;backdrop-filter:blur(10px);pointer-events:none}.qc-collection-badge{position:absolute;right:10px;bottom:10px;z-index:2;min-height:30px;padding:0 10px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(0,0,0,.64);color:#fff;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:900;backdrop-filter:blur(10px);box-shadow:0 10px 24px rgba(0,0,0,.28);pointer-events:none}.qc-load-more-wrap{grid-column:1/-1;display:flex;justify-content:center;padding-top:8px}.qc-load-more-btn{min-height:44px;padding:0 20px;border:1px solid var(--border);border-radius:999px;background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:800;cursor:pointer;transition:transform .18s,border-color .18s,background .18s}.qc-load-more-btn:hover{transform:translateY(-2px);border-color:rgba(77,166,255,.65);background:rgba(77,166,255,.12)}
    .qc-collection-lightbox[hidden]{display:none}.qc-collection-lightbox{position:fixed;inset:0;z-index:1100;display:grid;place-items:center;padding:72px 84px 68px;background:rgba(0,0,0,.94);color:#fff}.qc-collection-top{position:absolute;top:0;left:0;right:0;min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 18px;border-bottom:1px solid rgba(255,255,255,.14)}.qc-collection-top p{font-size:14px;color:rgba(255,255,255,.74)}.qc-collection-top strong{color:#fff}.qc-collection-icon,.qc-collection-arrow{display:grid;place-items:center;width:48px;height:48px;padding:0;border:1px solid rgba(255,255,255,.2);border-radius:50%;background:rgba(255,255,255,.08);color:#fff;cursor:pointer}.qc-collection-icon:hover,.qc-collection-arrow:hover{background:rgba(255,255,255,.16)}.qc-collection-image{max-width:100%;max-height:calc(100dvh - 150px);object-fit:contain}.qc-collection-arrow{position:absolute;top:50%;transform:translateY(-50%)}.qc-collection-arrow.prev{left:18px}.qc-collection-arrow.next{right:18px}.qc-collection-counter{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}@media(max-width:640px){.qc-collection-lightbox{padding:72px 14px 76px}.qc-collection-arrow{top:auto;bottom:14px;transform:none}.qc-collection-arrow.prev{left:14px}.qc-collection-arrow.next{right:14px}.qc-collection-counter{bottom:30px}}@media(prefers-reduced-motion:reduce){.qc-question-effect span{animation:none;opacity:.22}.qc-load-more-btn{transition:none}.qc-load-more-btn:hover{transform:none}}
  `;
  document.head.appendChild(style);
}

function renderEmptyState() {
  const grid = document.getElementById("qc-grid");
  const copy = document.getElementById("qc-copy");
  if (!grid || grid.querySelector(".qc-empty-working")) return;
  ensureStyles();
  if (copy) { copy.textContent = ""; copy.hidden = true; }
  grid.innerHTML = `<div class="qc-placeholder qc-empty-working"><div class="qc-question-effect" aria-hidden="true"><span>?</span><span>?</span><span>?</span><span>?</span><span>?</span><span>?</span></div><strong>${EMPTY_QC_MESSAGE}</strong></div>`;
}

function shouldReplaceBadText() {
  const grid = document.getElementById("qc-grid");
  const copy = document.getElementById("qc-copy");
  const text = `${copy?.textContent || ""} ${grid?.textContent || ""}`.replace(/\s+/g, " ").trim();
  return BAD_QC_TEXT.some(phrase => text.includes(phrase));
}

function sourcePayloadsFromDebug() {
  const debug = window.__rcQcDebug || {};
  const sources = [];
  const proxyData = debug.proxyPayload?.data || debug.proxyPayload;
  if (proxyData?.acbuy) sources.push({ provider: "ACBuy", payload: proxyData.acbuy });
  if (proxyData?.oopbuy) sources.push({ provider: "OopBuy", payload: proxyData.oopbuy });
  if (debug.directPayload) sources.push({ provider: "ACBuy", payload: debug.directPayload });
  if (debug.oopbuyPayload) sources.push({ provider: "OopBuy", payload: debug.oopbuyPayload });
  return sources;
}

function collectionLabelFromObject(obj, key, index) {
  return obj?.sku || obj?.orderNo || obj?.orderId || obj?.id || obj?.spuNo || obj?.goodsId || `${key}-${index + 1}`;
}

function findExplicitCollections(value, provider, out = [], path = "root") {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findExplicitCollections(entry, provider, out, `${path}.${index}`));
    return out;
  }

  COLLECTION_IMAGE_KEYS.forEach(key => {
    if (!Array.isArray(value[key])) return;
    const images = uniqueImages(value[key]);
    if (!images.length) return;
    out.push({ provider, images, label: collectionLabelFromObject(value, key, out.length), path: `${path}.${key}` });
  });

  Object.entries(value).forEach(([key, entry]) => {
    if (COLLECTION_IMAGE_KEYS.includes(key)) return;
    if (entry && typeof entry === "object") findExplicitCollections(entry, provider, out, `${path}.${key}`);
  });
  return out;
}

function buildFallbackCollections() {
  const entries = window.__rcQcDebug?.entries || [];
  const byProvider = new Map();
  entries.forEach(entry => {
    const provider = entry.provider || "QC";
    if (!byProvider.has(provider)) byProvider.set(provider, []);
    if (entry.url) byProvider.get(provider).push(entry.url);
  });
  return [...byProvider.entries()].map(([provider, urls], index) => ({ provider, images: [...new Set(urls)].filter(isImageUrl), label: `collection-${index + 1}` })).filter(group => group.images.length);
}

function buildCollections() {
  const seenGroups = new Set();
  const seenUrls = new Set();
  const groups = [];

  sourcePayloadsFromDebug().forEach(source => {
    findExplicitCollections(source.payload, source.provider).forEach(group => {
      const images = group.images.filter(url => {
        if (seenUrls.has(url)) return false;
        seenUrls.add(url);
        return true;
      });
      if (!images.length) return;
      const signature = `${source.provider}:${images.join("|")}`;
      if (seenGroups.has(signature)) return;
      seenGroups.add(signature);
      groups.push({ ...group, images });
    });
  });

  if (groups.length) return groups;
  return buildFallbackCollections();
}

function renderCollections() {
  const grid = document.getElementById("qc-grid");
  const copy = document.getElementById("qc-copy");
  if (!grid || grid.querySelector(".qc-empty-working")) return false;
  if (!grid.querySelector(".qc-link[data-qc-index]") && !grid.querySelector(".qc-collection-card")) return false;

  const groups = buildCollections();
  if (!groups.length) return false;
  const signature = groups.map(group => `${group.provider}:${group.label}:${group.images.join("|")}`).join("~~~");
  if (signature === renderedSignature && grid.querySelector(".qc-collection-card")) return true;

  ensureStyles();
  renderedSignature = signature;
  qcCollections = groups;
  lastGridSignature = "";
  lastColumnCount = 0;
  grid.dataset.visibleQcCount = "";

  const totalImages = groups.reduce((sum, group) => sum + group.images.length, 0);
  if (copy) {
    copy.hidden = false;
    copy.textContent = `${groups.length} QC collection${groups.length === 1 ? "" : "s"} loaded (${totalImages} picture${totalImages === 1 ? "" : "s"}).`;
  }

  grid.innerHTML = groups.map((group, index) => {
    const more = Math.max(0, group.images.length - 1);
    return `<button class="qc-link qc-collection-card" type="button" data-qc-collection-index="${index}" aria-label="Open QC collection ${index + 1}, ${group.images.length} pictures"><img class="qc-image" src="${escapeHtml(group.images[0])}" alt="QC collection ${index + 1}" loading="lazy"><span class="qc-collection-provider">${escapeHtml(group.provider)}</span>${more ? `<span class="qc-collection-badge">+${more} more</span>` : ""}</button>`;
  }).join("");

  grid.onclick = event => {
    const trigger = event.target.closest("[data-qc-collection-index]");
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    openCollection(Number(trigger.dataset.qcCollectionIndex), trigger);
  };
  return true;
}

function ensureLightbox() {
  let box = document.getElementById("qc-collection-lightbox");
  if (box) return box;
  document.body.insertAdjacentHTML("beforeend", `<div class="qc-collection-lightbox" id="qc-collection-lightbox" role="dialog" aria-modal="true" aria-label="QC collection viewer" hidden><div class="qc-collection-top"><p><strong id="qc-collection-provider">QC Collection</strong></p><button class="qc-collection-icon" id="qc-collection-close" type="button" aria-label="Close QC collection viewer"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><button class="qc-collection-arrow prev" id="qc-collection-prev" type="button" aria-label="Previous QC picture"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button><img class="qc-collection-image" id="qc-collection-image" alt=""><button class="qc-collection-arrow next" id="qc-collection-next" type="button" aria-label="Next QC picture"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button><div class="qc-collection-counter" id="qc-collection-counter">QC: 1/1</div></div>`);
  box = document.getElementById("qc-collection-lightbox");
  document.getElementById("qc-collection-close").addEventListener("click", closeCollection);
  document.getElementById("qc-collection-prev").addEventListener("click", () => moveCollection(-1));
  document.getElementById("qc-collection-next").addEventListener("click", () => moveCollection(1));
  box.addEventListener("click", event => { if (event.target === box) closeCollection(); });
  return box;
}

function updateLightbox() {
  const entry = activeCollection[activeCollectionIndex];
  if (!entry) return;
  const img = document.getElementById("qc-collection-image");
  img.src = entry.url;
  img.alt = `QC picture ${activeCollectionIndex + 1}`;
  document.getElementById("qc-collection-provider").textContent = entry.provider;
  document.getElementById("qc-collection-counter").textContent = `QC: ${activeCollectionIndex + 1}/${activeCollection.length}`;
}

function openCollection(index, trigger) {
  const group = qcCollections[index];
  if (!group?.images?.length) return;
  activeCollection = group.images.map(url => ({ url, provider: group.provider }));
  activeCollectionIndex = 0;
  collectionReturnFocus = trigger || null;
  const oldBox = document.getElementById("qc-lightbox");
  if (oldBox) oldBox.hidden = true;
  const box = ensureLightbox();
  updateLightbox();
  box.hidden = false;
  document.body.style.overflow = "hidden";
  document.getElementById("qc-collection-close").focus();
}

function closeCollection() {
  const box = document.getElementById("qc-collection-lightbox");
  if (!box || box.hidden) return;
  box.hidden = true;
  document.body.style.overflow = "";
  if (collectionReturnFocus) collectionReturnFocus.focus();
}

function moveCollection(direction) {
  if (!activeCollection.length) return;
  activeCollectionIndex = (activeCollectionIndex + direction + activeCollection.length) % activeCollection.length;
  updateLightbox();
}

document.addEventListener("keydown", event => {
  const box = document.getElementById("qc-collection-lightbox");
  if (!box || box.hidden) return;
  if (event.key === "ArrowLeft") moveCollection(-1);
  if (event.key === "ArrowRight") moveCollection(1);
  if (event.key === "Escape") closeCollection();
});

function columnCount(grid) {
  const template = getComputedStyle(grid).gridTemplateColumns || "";
  return Math.max(1, template.split(" ").filter(Boolean).length || 1);
}

function paginateCollections() {
  const grid = document.getElementById("qc-grid");
  if (!grid || grid.querySelector(".qc-empty-working")) return;
  const cards = Array.from(grid.querySelectorAll(".qc-collection-card"));
  if (!cards.length) return;
  const cols = columnCount(grid);
  const signature = cards.map(card => card.dataset.qcCollectionIndex).join("|");
  if (signature !== lastGridSignature || cols !== lastColumnCount) {
    lastGridSignature = signature;
    lastColumnCount = cols;
    grid.dataset.visibleQcCount = String(cols);
  }
  const visible = Math.max(cols, Math.min(Number(grid.dataset.visibleQcCount || cols), cards.length));
  cards.forEach((card, index) => { card.style.display = index < visible ? "" : "none"; });
  let wrap = grid.querySelector(".qc-load-more-wrap");
  if (visible >= cards.length) { if (wrap) wrap.remove(); return; }
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "qc-load-more-wrap";
    wrap.innerHTML = `<button class="qc-load-more-btn" type="button">Load more</button>`;
    grid.appendChild(wrap);
    wrap.querySelector("button").addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      grid.dataset.visibleQcCount = String(Number(grid.dataset.visibleQcCount || cols) + columnCount(grid));
      scheduleCheck();
    });
  }
}

function runCheck() {
  pagerScheduled = false;
  if (shouldReplaceBadText()) renderEmptyState();
  renderCollections();
  paginateCollections();
}

function scheduleCheck() {
  if (pagerScheduled) return;
  pagerScheduled = true;
  requestAnimationFrame(runCheck);
}

const observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    if (mutation.target?.closest?.(".qc-load-more-wrap")) continue;
    if (mutation.target?.closest?.("#qc-collection-lightbox")) continue;
    scheduleCheck();
    break;
  }
});
observer.observe(document.body, { childList: true, subtree: true, characterData: true });
window.addEventListener("resize", scheduleCheck, { passive: true });
scheduleCheck();
setTimeout(scheduleCheck, 500);
setTimeout(scheduleCheck, 1500);
setTimeout(scheduleCheck, 3000);
setTimeout(scheduleCheck, 5000);
