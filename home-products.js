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

function injectHomepageModalPolish() {
  if (document.getElementById("homepage-modal-polish")) return;
  const style = document.createElement("style");
  style.id = "homepage-modal-polish";
  style.textContent = `
    .modal-box {
      box-shadow: 0 0 34px rgba(77,166,255,0.24), 0 0 0 1px rgba(77,166,255,0.08), 0 24px 70px rgba(0,0,0,0.52) !important;
    }
    body.light .modal-box {
      box-shadow: 0 0 34px rgba(77,166,255,0.22), 0 0 0 1px rgba(77,166,255,0.1), 0 24px 70px rgba(15,23,42,0.18) !important;
    }
    .modal-close { display: none !important; }
    .modal-box.wide { max-width: 760px !important; }
    .modal-body { padding: 30px 30px 28px !important; }
    .tutorial-shot {
      width: 100%;
      max-height: 360px;
      object-fit: contain;
      display: block;
      margin: 18px auto 20px;
      border-radius: 14px;
      border: 1px solid var(--border);
      background: var(--surface2);
      box-shadow: 0 18px 38px rgba(0,0,0,0.24);
    }
    .tutorial-step-copy { text-align: center; max-width: 560px; margin: 0 auto; }
    .tutorial-step-copy h2 {
      font-family: 'Syne', sans-serif;
      font-size: clamp(25px, 5vw, 38px);
      line-height: 1;
      margin-bottom: 10px;
      color: var(--text);
    }
    .tutorial-step-copy p { color: var(--muted); font-size: 14px; line-height: 1.55; }
    .tutorial-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 18px; }
    .tutorial-actions.single { grid-template-columns: 1fr; }
    .tutorial-nav-btn {
      min-height: 48px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--surface2);
      color: var(--text);
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
    }
    .tutorial-nav-btn.primary { background: #4da6ff; border-color: transparent; color: #fff; box-shadow: 0 8px 24px rgba(77,166,255,0.26); }
    .tutorial-nav-btn:disabled { opacity: 0.42; cursor: default; }
    .tutorial-close-text {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 40px;
      margin: 12px auto 0;
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
    }
    .tutorial-close-text:hover { color: var(--text); }
    .tutorial-progress { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; }
    .tutorial-progress-track { flex: 1; display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
    .tutorial-progress-segment { height: 5px; border-radius: 99px; background: var(--surface2); border: 1px solid var(--border); }
    .tutorial-progress-segment.done { background: #4da6ff; border-color: #4da6ff; }
    .tutorial-progress-label { font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 800; color: var(--muted); font-variant-numeric: tabular-nums; }
    .tutorial-signup-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin: 20px 0;
      padding: 16px;
      border-radius: 14px;
      background: var(--surface2);
      border: 1px solid rgba(77,166,255,0.28);
      color: var(--text);
      text-align: left;
    }
    .tutorial-signup-card strong { display: block; color: #4da6ff; font-size: 13px; margin-bottom: 4px; }
    .tutorial-signup-card span { color: var(--muted); font-size: 12px; }
    @media (max-width: 640px) {
      .modal-body { padding: 24px 18px 22px !important; }
      .tutorial-actions { grid-template-columns: 1fr; }
      .tutorial-shot { max-height: 300px; }
      .tutorial-signup-card { align-items: flex-start; flex-direction: column; }
    }
  `;
  document.head.appendChild(style);
}

injectHomepageModalPolish();

const tutorialSteps = [
  {
    title: "First, sign up to HipoBuy.",
    sub: "Create your account and unlock the shipping coupons.",
    image: "",
    action: true
  },
  {
    title: "Browse our spreadsheet.",
    sub: "Find any item you want and copy the link.",
    image: "https://github.com/MinerBlox/repssite/blob/main/systemimages/tutorial/step2.png?raw=true"
  },
  {
    title: "Select item size and style.",
    sub: "Scroll down on most items for size tables.",
    image: "https://github.com/MinerBlox/repssite/blob/main/systemimages/tutorial/step3.png?raw=true"
  },
  {
    title: "Purchase item.",
    sub: "Add it to cart or press buy now and checkout.",
    image: "https://github.com/MinerBlox/repssite/blob/main/systemimages/tutorial/step4.png?raw=true"
  },
  {
    title: "Check QCs.",
    sub: "Sorry I had to use another product due to lack of time.",
    image: "https://github.com/MinerBlox/repssite/blob/main/systemimages/tutorial/step5.png?raw=true"
  }
];

let tutorialStepIndex = -1;

function tutorialCloseButton() {
  return `<button class="tutorial-close-text" type="button" onclick="closeModal()">Close tutorial X</button>`;
}

function renderTutorialIntro() {
  const content = document.getElementById("modal-content");
  const box = document.getElementById("modal-box");
  if (!content || !box) return;
  box.classList.remove("wide");
  content.innerHTML = `
    <div style="text-align:center;margin-bottom:20px">
      <div class="modal-intro-badge">REPSCENTRAL x HIPOBUY</div>
      <h2 class="modal-title">BRINGING YOU <span>35% OFF</span> SHIPPING</h2>
      <p class="modal-sub">in 5 simple steps...</p>
    </div>
    <div class="intro-steps">
      ${[["1","SIGN UP"],["2","BROWSE"],["3","SELECT"],["4","BUY"],["5","QC"]].slice(0,3).map(([num,label],i)=>`
        <div class="intro-step" style="animation-delay:${i*0.08}s">
          <div class="intro-step-emoji">${num}</div>
          <div class="intro-step-label">${label}</div>
          <div class="intro-step-num">${i+1}</div>
        </div>
      `).join("")}
    </div>
    <p style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:16px">Still confused? Follow the quick tutorial.</p>
    <button class="modal-cta" onclick="rcTutorialGo(0)">
      <div class="modal-cta-left">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <div class="modal-cta-info">
          <div class="title">START TUTORIAL</div>
          <div class="sub">Learn everything in 2 minutes - completely free.</div>
        </div>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
    </button>
    <button class="modal-dismiss" onclick="window.location.href='spreadsheet.html'">Skip to spreadsheet
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
    ${tutorialCloseButton()}
  `;
}

function renderTutorialStep() {
  const content = document.getElementById("modal-content");
  const box = document.getElementById("modal-box");
  if (!content || !box) return;
  const step = tutorialSteps[tutorialStepIndex];
  const isFirst = tutorialStepIndex === 0;
  const isLast = tutorialStepIndex === tutorialSteps.length - 1;
  box.classList.add("wide");
  content.innerHTML = `
    <div style="animation:rc-fadein 0.28s ease">
      <div class="tutorial-progress">
        <div class="tutorial-progress-track">
          ${tutorialSteps.map((_, index) => `<span class="tutorial-progress-segment ${index <= tutorialStepIndex ? "done" : ""}"></span>`).join("")}
        </div>
        <span class="tutorial-progress-label">${tutorialStepIndex + 1} / ${tutorialSteps.length}</span>
      </div>
      <div class="step-badge">STEP ${tutorialStepIndex + 1}</div>
      <div class="tutorial-step-copy">
        <h2>${step.title}</h2>
        <p>${step.sub}</p>
      </div>
      ${step.action ? `
        <a href="https://hipobuy.com/register?inviteCode=QTYP3P8P5" target="_blank" rel="noopener noreferrer" class="tutorial-signup-card">
          <div><strong>SIGN UP TO HIPOBUY</strong><span>Includes shipping coupons.</span></div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
      ` : `<img class="tutorial-shot" src="${step.image}" alt="${step.title}" loading="eager">`}
      <div class="tutorial-actions ${isFirst ? "single" : ""}">
        ${isFirst ? "" : `<button class="tutorial-nav-btn" type="button" onclick="rcTutorialGo(${tutorialStepIndex - 1})">Previous Step</button>`}
        <button class="tutorial-nav-btn primary" type="button" onclick="${isLast ? "closeModal()" : `rcTutorialGo(${tutorialStepIndex + 1})`}">${isLast ? "Finish Tutorial" : "Next Step"}</button>
      </div>
      ${tutorialCloseButton()}
    </div>
  `;
}

window.rcTutorialGo = function rcTutorialGo(index) {
  tutorialStepIndex = Math.max(0, Math.min(tutorialSteps.length - 1, Number(index) || 0));
  renderTutorialStep();
};

window.renderModal = renderTutorialIntro;
window.goToStep = function goToStep(next) {
  if (next === "intro") {
    tutorialStepIndex = -1;
    renderTutorialIntro();
    return;
  }
  if (next === "done") {
    closeModal();
    return;
  }
  const match = String(next || "").match(/step(\d+)/);
  window.rcTutorialGo(match ? Number(match[1]) - 1 : 0);
};

renderTutorialIntro();

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
        <p class="podium-desc">${escapeHtml(item.description || `#${medal.rank} most popular product this week`)}</p>
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

function renderHeroParticles(items) {
  const target = document.getElementById("hero-particles");
  if (!target) return;

  const sourceImages = items.filter(item => item.imageUrl);
  const particleCount = Math.min(30, sourceImages.length);
  const images = Array.from({ length: particleCount }, (_, index) => {
    const sourceIndex = Math.floor((index * sourceImages.length) / Math.max(particleCount, 1));
    return sourceImages[sourceIndex];
  });

  target.innerHTML = images.map((item, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(images.length, 1);
    const radiusX = index % 2 === 0 ? 44 : 38;
    const radiusY = index % 3 === 0 ? 46 : 40;
    const x = 50 + Math.cos(angle) * radiusX;
    const y = 50 + Math.sin(angle) * radiusY;
    const dx = Math.round(Math.cos(angle) * (72 + (index % 4) * 8));
    const dy = Math.round(Math.sin(angle) * (54 + (index % 3) * 8));
    const delay = -((index * 1.7) % 24);
    const duration = 18 + (index % 7);
    const size = 26 + (index % 5) * 4;

    return `<img
      class="hero-product-particle"
      src="${escapeHtml(item.imageUrl)}"
      alt=""
      decoding="async"
      style="--particle-x:${x.toFixed(2)}%;--particle-y:${y.toFixed(2)}%;--particle-dx:${dx}px;--particle-dy:${dy}px;--particle-delay:${delay.toFixed(1)}s;--particle-duration:${duration}s;--particle-size:${size}px"
    >`;
  }).join("");
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

function renderProductRow(target, items, moreCount) {
  if (!target) return;
  const count = Math.min(items.length, visibleProductCount(target));
  const remaining = moreCount ?? Math.max(0, items.length - count);
  const backgroundItem = items[count] || items[items.length - 1];
  target.innerHTML = items.slice(0, count).map(productCard).join("") + moreProductCard(remaining, backgroundItem);
}

function renderSeasonProducts(items, seasonName) {
  window.activeSeason = seasonName;
  document.querySelectorAll(".season-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.season === seasonName));
  renderProductRow(document.getElementById("season-grid"), seasonalItems(items, seasonName));
}

function renderProductRows(items) {
  const selectedPicks = items.filter(item => item.isOurPick === true);
  renderProductRow(document.getElementById("our-picks-grid"), selectedPicks.length ? selectedPicks : items, items.length);
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
  renderHeroParticles(items);
  setupProductSearch();

  window.setSeason = seasonName => renderSeasonProducts(currentHomeItems, seasonName);
  window.renderSeason = seasonName => renderSeasonProducts(currentHomeItems, seasonName);
}


let searchActiveIndex = -1;
let searchMatches = [];

function closeProductSearch() {
  const results = document.getElementById("product-search-results");
  const input = document.getElementById("product-search-input");
  if (!results || !input) return;
  results.hidden = true;
  input.setAttribute("aria-expanded", "false");
  searchActiveIndex = -1;
}

function updateSearchActiveResult() {
  document.querySelectorAll(".nav-search-result").forEach((result, index) => {
    const active = index === searchActiveIndex;
    result.classList.toggle("active", active);
    result.setAttribute("aria-selected", String(active));
  });
}

function renderProductSearch(query) {
  const results = document.getElementById("product-search-results");
  const input = document.getElementById("product-search-input");
  if (!results || !input) return;

  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    closeProductSearch();
    results.innerHTML = "";
    return;
  }

  searchMatches = currentHomeItems.filter(item => {
    const searchable = `${item.name || ""} ${item.category || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
    return searchable.includes(normalized);
  }).slice(0, 6);
  searchActiveIndex = -1;

  if (!searchMatches.length) {
    results.innerHTML = '<div class="nav-search-empty">No matching spreadsheet products.</div>';
  } else {
    results.innerHTML = searchMatches.map((item, index) => {
      const image = item.imageUrl
        ? `<img src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy">`
        : '<span class="nav-search-thumb-empty" aria-hidden="true">-</span>';
      return `<a class="nav-search-result" role="option" aria-selected="false" data-search-index="${index}" href="${escapeHtml(itemHref(item))}">
        ${image}
        <span><span class="nav-search-result-name">${escapeHtml(item.name || "Unnamed item")}</span><span class="nav-search-result-category">${escapeHtml(item.category || "Unsorted")}</span></span>
        <span class="nav-search-result-price">${formatPrice(item)}</span>
      </a>`;
    }).join("");
  }

  results.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function setupProductSearch() {
  const form = document.getElementById("product-search-form");
  const input = document.getElementById("product-search-input");
  if (!form || !input || form.dataset.ready === "true") return;
  form.dataset.ready = "true";

  input.addEventListener("input", () => renderProductSearch(input.value));
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (searchActiveIndex >= 0 && searchMatches[searchActiveIndex]) {
        window.location.href = itemHref(searchMatches[searchActiveIndex]);
      } else {
        const query = input.value.trim();
        if (query) window.location.href = `spreadsheet.html?search=${encodeURIComponent(query)}`;
      }
      return;
    }
    if (!searchMatches.length || document.getElementById("product-search-results").hidden) {
      if (event.key === "Escape") closeProductSearch();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      searchActiveIndex = (searchActiveIndex + 1) % searchMatches.length;
      updateSearchActiveResult();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      searchActiveIndex = (searchActiveIndex - 1 + searchMatches.length) % searchMatches.length;
      updateSearchActiveResult();
    } else if (event.key === "Escape") {
      closeProductSearch();
    }
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    if (searchActiveIndex >= 0 && searchMatches[searchActiveIndex]) {
      window.location.href = itemHref(searchMatches[searchActiveIndex]);
      return;
    }
    const query = input.value.trim();
    if (query) window.location.href = `spreadsheet.html?search=${encodeURIComponent(query)}`;
  });

  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      input.focus();
      renderProductSearch(input.value);
    }
  });
  document.addEventListener("click", event => {
    if (!form.contains(event.target)) closeProductSearch();
  });
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
