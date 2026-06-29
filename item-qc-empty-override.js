const EMPTY_QC_MESSAGE = "We're still working on QC pictures for this item...";
const BAD_QC_TEXT = [
  "Add the original Weidian, 1688 or Taobao link in Product URL to load QC pictures.",
  "The QC providers replied, but there were no image links for this item.",
  "Could not load QC pictures yet. Open the console and search [RC QC]."
];

let lastQcSignature = "";
let pagerScheduled = false;
let lastKnownColumnCount = 0;
let qcCollections = [];
let activeCollection = [];
let activeCollectionIndex = 0;
let collectionReturnFocus = null;
let renderedCollectionSignature = "";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureEmptyQcStyles() {
  if (document.getElementById("rc-empty-qc-override-style")) return;
  const style = document.createElement("style");
  style.id = "rc-empty-qc-override-style";
  style.textContent = `
    @keyframes rcQcQuestionPop {
      0% { opacity: 0; transform: translateY(18px) scale(.72) rotate(-8deg); }
      16% { opacity: .75; }
      70% { opacity: .28; }
      100% { opacity: 0; transform: translateY(-58px) scale(1.22) rotate(10deg); }
    }
    .qc-placeholder.qc-empty-working {
      position: relative;
      min-height: 210px;
      grid-column: 1 / -1;
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: 18px;
      background: radial-gradient(circle at top, rgba(77,166,255,.11), transparent 48%), var(--surface2);
      text-align: center;
      padding: 28px;
    }
    .qc-placeholder.qc-empty-working strong {
      position: relative;
      z-index: 2;
      max-width: 430px;
      color: var(--text);
      font-family: 'Syne', sans-serif;
      font-size: clamp(18px, 3vw, 28px);
      line-height: 1.15;
    }
    .qc-question-effect {
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: .95;
    }
    .qc-question-effect span {
      position: absolute;
      bottom: 18px;
      color: #4da6ff;
      font-family: 'Syne', sans-serif;
      font-weight: 800;
      animation: rcQcQuestionPop 2.75s ease-in-out infinite;
      text-shadow: 0 0 22px rgba(77,166,255,.26);
    }
    .qc-question-effect span:nth-child(1) { left: 10%; font-size: 30px; animation-delay: 0s; }
    .qc-question-effect span:nth-child(2) { left: 24%; font-size: 18px; animation-delay: .45s; }
    .qc-question-effect span:nth-child(3) { left: 43%; font-size: 38px; animation-delay: .85s; }
    .qc-question-effect span:nth-child(4) { left: 61%; font-size: 22px; animation-delay: .18s; }
    .qc-question-effect span:nth-child(5) { left: 77%; font-size: 34px; animation-delay: .68s; }
    .qc-question-effect span:nth-child(6) { left: 90%; font-size: 20px; animation-delay: 1.05s; }
    .qc-load-more-wrap {
      grid-column: 1 / -1;
      display: flex;
      justify-content: center;
      padding-top: 8px;
    }
    .qc-load-more-btn {
      min-height: 44px;
      padding: 0 20px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface2);
      color: var(--text);
      font-family: 'DM Sans', sans-serif;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      transition: transform .18s, border-color .18s, background .18s;
    }
    .qc-load-more-btn:hover {
      transform: translateY(-2px);
      border-color: rgba(77,166,255,.65);
      background: rgba(77,166,255,.12);
    }
    .qc-collection-badge {
      position: absolute;
      right: 10px;
      bottom: 10px;
      z-index: 2;
      min-height: 30px;
      padding: 0 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 999px;
      background: rgba(0,0,0,.62);
      color: #fff;
      font-family: 'DM Sans', sans-serif;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: -.01em;
      backdrop-filter: blur(10px);
      box-shadow: 0 10px 24px rgba(0,0,0,.28);
      pointer-events: none;
    }
    .qc-collection-provider {
      position: absolute;
      left: 10px;
      top: 10px;
      z-index: 2;
      min-height: 26px;
      padding: 0 9px;
      display: inline-flex;
      align-items: center;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 999px;
      background: rgba(0,0,0,.46);
      color: rgba(255,255,255,.88);
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .06em;
      backdrop-filter: blur(10px);
      pointer-events: none;
    }
    .qc-collection-lightbox[hidden] { display: none; }
    .qc-collection-lightbox {
      position: fixed;
      inset: 0;
      z-index: 1100;
      display: grid;
      place-items: center;
      padding: 72px 84px 68px;
      background: rgba(0,0,0,.94);
      color: #fff;
    }
    .qc-collection-top {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      min-height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 18px;
      border-bottom: 1px solid rgba(255,255,255,.14);
    }
    .qc-collection-top p { font-size: 14px; color: rgba(255,255,255,.74); }
    .qc-collection-top strong { color: #fff; }
    .qc-collection-icon, .qc-collection-arrow {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      padding: 0;
      border: 1px solid rgba(255,255,255,.2);
      border-radius: 50%;
      background: rgba(255,255,255,.08);
      color: #fff;
      cursor: pointer;
    }
    .qc-collection-icon:hover, .qc-collection-arrow:hover { background: rgba(255,255,255,.16); }
    .qc-collection-image { max-width: 100%; max-height: calc(100dvh - 150px); object-fit: contain; }
    .qc-collection-arrow { position: absolute; top: 50%; transform: translateY(-50%); }
    .qc-collection-arrow.prev { left: 18px; }
    .qc-collection-arrow.next { right: 18px; }
    .qc-collection-counter {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      font-family: Arial,Helvetica,sans-serif;
      font-size: 14px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    @media (max-width: 640px) {
      .qc-collection-lightbox { padding: 72px 14px 76px; }
      .qc-collection-arrow { top: auto; bottom: 14px; transform: none; }
      .qc-collection-arrow.prev { left: 14px; }
      .qc-collection-arrow.next { right: 14px; }
      .qc-collection-counter { bottom: 30px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .qc-question-effect span { animation: none; opacity: .22; }
      .qc-load-more-btn { transition: none; }
      .qc-load-more-btn:hover { transform: none; }
    }
  `;
  document.head.appendChild(style);
}

function renderEmptyQcState() {
  const qcGrid = document.getElementById("qc-grid");
  const qcCopy = document.getElementById("qc-copy");
  if (!qcGrid || qcGrid.querySelector(".qc-empty-working")) return;
  ensureEmptyQcStyles();
  if (qcCopy) {
    qcCopy.textContent = "";
    qcCopy.hidden = true;
  }
  qcGrid.innerHTML = `
    <div class="qc-placeholder qc-empty-working">
      <div class="qc-question-effect" aria-hidden="true"><span>?</span><span>?</span><span>?</span><span>?</span><span>?</span><span>?</span></div>
      <strong>${EMPTY_QC_MESSAGE}</strong>
    </div>
  `;
}

function shouldReplaceQcText() {
  const qcGrid = document.getElementById("qc-grid");
  const qcCopy = document.getElementById("qc-copy");
  const text = `${qcCopy?.textContent || ""} ${qcGrid?.textContent || ""}`.replace(/\s+/g, " ").trim();
  return BAD_QC_TEXT.some(phrase => text.includes(phrase));
}

function normalizeImageUrl(url) {
  return String(url || "").replace(/\\\//g, "/").replace(/,+$/, "");
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
  return [...new Set(collectImageUrls(value))].filter(url => /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url));
}

function sourcePayloadsFromDebug() {
  const debug = window.__rcQcDebug || {};
  const sources = [];
  const proxyData = debug.proxyPayload?.data || debug.proxyPayload;
  if (proxyData?.acbuy) sources.push({ provider: "ACBuy", payload: proxyData.acbuy });
  if (proxyData?.oopbuy) sources.push({ provider: "OopBuy", payload: proxyData.oopbuy });
  if (debug.directPayload) sources.push({ provider: "ACBuy", payload: debug.directPayload });
  if (debug.oopbuyPayload) sources.push({ provider: "OopBuy", payload: debug.oopbuyPayload });
  if (!sources.length && Array.isArray(debug.entries)) {
    sources.push({ provider: "QC", payload: debug.entries.map(entry => entry.url) });
  }
  return sources;
}

function preferredCollectionCandidates(payload) {
  const candidates = [];
  if (Array.isArray(payload?.data)) candidates.push(...payload.data);
  if (Array.isArray(payload?.data?.data)) candidates.push(...payload.data.data);
  if (Array.isArray(payload?.list)) candidates.push(...payload.list);
  if (Array.isArray(payload?.rows)) candidates.push(...payload.rows);
  if (Array.isArray(payload?.items)) candidates.push(...payload.items);
  if (Array.isArray(payload?.result?.data)) candidates.push(...payload.result.data);
  if (Array.isArray(payload?.result?.list)) candidates.push(...payload.result.list);
  if (Array.isArray(payload?.spu?.qcPhotos)) candidates.push(...payload.spu.qcPhotos);
  if (Array.isArray(payload?.qcPhotos)) candidates.push(...payload.qcPhotos);
  return candidates;
}

function buildQcCollections() {
  const globalSeen = new Set();
  const groupSeen = new Set();
  const groups = [];

  sourcePayloadsFromDebug().forEach(source => {
    const candidates = preferredCollectionCandidates(source.payload);
    const usableCandidates = candidates.length ? candidates : [source.payload];

    usableCandidates.forEach((candidate, index) => {
      const images = uniqueImages(candidate).filter(url => {
        if (globalSeen.has(url)) return false;
        globalSeen.add(url);
        return true;
      });
      if (!images.length) return;
      const signature = images.join("|");
      if (groupSeen.has(signature)) return;
      groupSeen.add(signature);
      groups.push({ provider: source.provider, images, index });
    });
  });

  if (!groups.length && Array.isArray(window.__rcQcDebug?.entries)) {
    const images = [...new Set(window.__rcQcDebug.entries.map(entry => entry.url).filter(Boolean))];
    if (images.length) groups.push({ provider: "QC", images, index: 0 });
  }

  return groups.filter(group => group.images.length);
}

function renderQcCollections() {
  const qcGrid = document.getElementById("qc-grid");
  const qcCopy = document.getElementById("qc-copy");
  if (!qcGrid || qcGrid.querySelector(".qc-empty-working")) return false;
  if (!qcGrid.querySelector(".qc-link[data-qc-index]") && !qcGrid.querySelector(".qc-collection-card")) return false;

  const groups = buildQcCollections();
  if (!groups.length) return false;

  const signature = groups.map(group => `${group.provider}:${group.images.join("|")}`).join("~~~");
  if (signature === renderedCollectionSignature && qcGrid.querySelector(".qc-collection-card")) return true;

  ensureEmptyQcStyles();
  qcCollections = groups;
  renderedCollectionSignature = signature;
  lastQcSignature = "";
  lastKnownColumnCount = 0;
  qcGrid.dataset.visibleQcCount = "";

  const totalImages = groups.reduce((total, group) => total + group.images.length, 0);
  if (qcCopy) {
    qcCopy.hidden = false;
    qcCopy.textContent = `${groups.length} QC collection${groups.length === 1 ? "" : "s"} loaded (${totalImages} picture${totalImages === 1 ? "" : "s"}).`;
  }

  qcGrid.innerHTML = groups.map((group, index) => {
    const extra = Math.max(0, group.images.length - 1);
    return `
      <button class="qc-link qc-collection-card" type="button" data-qc-collection-index="${index}" aria-label="Open QC collection ${index + 1}, ${group.images.length} pictures, provided by ${escapeHtml(group.provider)}">
        <img class="qc-image" src="${escapeHtml(group.images[0])}" alt="QC collection ${index + 1}" loading="lazy">
        <span class="qc-collection-provider">${escapeHtml(group.provider)}</span>
        ${extra ? `<span class="qc-collection-badge">+${extra} more</span>` : ""}
      </button>
    `;
  }).join("");

  qcGrid.onclick = event => {
    const trigger = event.target.closest("[data-qc-collection-index]");
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    openCollectionLightbox(Number(trigger.dataset.qcCollectionIndex), trigger);
  };

  return true;
}

function ensureCollectionLightbox() {
  let lightbox = document.getElementById("qc-collection-lightbox");
  if (lightbox) return lightbox;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="qc-collection-lightbox" id="qc-collection-lightbox" role="dialog" aria-modal="true" aria-label="QC collection viewer" hidden>
      <div class="qc-collection-top">
        <p><strong id="qc-collection-provider">QC Collection</strong></p>
        <button class="qc-collection-icon" id="qc-collection-close" type="button" aria-label="Close QC collection viewer">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <button class="qc-collection-arrow prev" id="qc-collection-prev" type="button" aria-label="Previous QC picture">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <img class="qc-collection-image" id="qc-collection-image" alt="">
      <button class="qc-collection-arrow next" id="qc-collection-next" type="button" aria-label="Next QC picture">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <div class="qc-collection-counter" id="qc-collection-counter">QC: 1/1</div>
    </div>
  `);
  lightbox = document.getElementById("qc-collection-lightbox");
  document.getElementById("qc-collection-close").addEventListener("click", closeCollectionLightbox);
  document.getElementById("qc-collection-prev").addEventListener("click", () => moveCollectionLightbox(-1));
  document.getElementById("qc-collection-next").addEventListener("click", () => moveCollectionLightbox(1));
  lightbox.addEventListener("click", event => { if (event.target === lightbox) closeCollectionLightbox(); });
  return lightbox;
}

function updateCollectionLightbox() {
  const entry = activeCollection[activeCollectionIndex];
  if (!entry) return;
  const image = document.getElementById("qc-collection-image");
  image.src = entry.url;
  image.alt = `QC picture ${activeCollectionIndex + 1}`;
  document.getElementById("qc-collection-provider").textContent = entry.provider;
  document.getElementById("qc-collection-counter").textContent = `QC: ${activeCollectionIndex + 1}/${activeCollection.length}`;
}

function openCollectionLightbox(collectionIndex, trigger) {
  const group = qcCollections[collectionIndex];
  if (!group?.images?.length) return;
  activeCollection = group.images.map(url => ({ url, provider: group.provider }));
  activeCollectionIndex = 0;
  collectionReturnFocus = trigger || null;
  const oldLightbox = document.getElementById("qc-lightbox");
  if (oldLightbox) oldLightbox.hidden = true;
  const lightbox = ensureCollectionLightbox();
  updateCollectionLightbox();
  lightbox.hidden = false;
  document.body.style.overflow = "hidden";
  document.getElementById("qc-collection-close").focus();
}

function closeCollectionLightbox() {
  const lightbox = document.getElementById("qc-collection-lightbox");
  if (!lightbox || lightbox.hidden) return;
  lightbox.hidden = true;
  document.body.style.overflow = "";
  if (collectionReturnFocus) collectionReturnFocus.focus();
}

function moveCollectionLightbox(direction) {
  if (!activeCollection.length) return;
  activeCollectionIndex = (activeCollectionIndex + direction + activeCollection.length) % activeCollection.length;
  updateCollectionLightbox();
}

document.addEventListener("keydown", event => {
  const lightbox = document.getElementById("qc-collection-lightbox");
  if (!lightbox || lightbox.hidden) return;
  if (event.key === "ArrowLeft") moveCollectionLightbox(-1);
  if (event.key === "ArrowRight") moveCollectionLightbox(1);
  if (event.key === "Escape") closeCollectionLightbox();
});

function getQcColumnCount(qcGrid) {
  const template = getComputedStyle(qcGrid).gridTemplateColumns || "";
  const columns = template.split(" ").filter(Boolean).length;
  return Math.max(1, columns || 1);
}

function applyQcPagination() {
  const qcGrid = document.getElementById("qc-grid");
  if (!qcGrid || qcGrid.querySelector(".qc-empty-working")) return;

  const buttons = Array.from(qcGrid.querySelectorAll(".qc-collection-card"));
  if (!buttons.length) return;

  const columnCount = getQcColumnCount(qcGrid);
  const signature = buttons.map(button => button.dataset.qcCollectionIndex).join("|");

  if (signature !== lastQcSignature || columnCount !== lastKnownColumnCount) {
    lastQcSignature = signature;
    lastKnownColumnCount = columnCount;
    qcGrid.dataset.visibleQcCount = String(columnCount);
  }

  let visibleCount = Number(qcGrid.dataset.visibleQcCount || columnCount);
  visibleCount = Math.max(columnCount, Math.min(visibleCount, buttons.length));

  buttons.forEach((button, index) => {
    button.style.display = index < visibleCount ? "" : "none";
  });

  let wrap = qcGrid.querySelector(".qc-load-more-wrap");
  if (visibleCount >= buttons.length) {
    if (wrap) wrap.remove();
    return;
  }

  ensureEmptyQcStyles();
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "qc-load-more-wrap";
    wrap.innerHTML = `<button class="qc-load-more-btn" type="button">Load more</button>`;
    qcGrid.appendChild(wrap);
    wrap.querySelector("button").addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const current = Number(qcGrid.dataset.visibleQcCount || columnCount);
      const latestColumns = getQcColumnCount(qcGrid);
      qcGrid.dataset.visibleQcCount = String(current + latestColumns);
      scheduleCheck();
    });
  }

  wrap.querySelector("button").textContent = "Load more";
}

function runCheck() {
  pagerScheduled = false;
  if (shouldReplaceQcText()) renderEmptyQcState();
  renderQcCollections();
  applyQcPagination();
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
