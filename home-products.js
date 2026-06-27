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

const tutorialSteps = [
  {
    number: 3,
    title: "Customise item.",
    subtext: "Choose size and style under the price.",
    image: "https://github.com/MinerBlox/repssite/blob/main/systemimages/tutorial/step3.png?raw=true",
    alt: "Customise item tutorial step"
  },
  {
    number: 4,
    title: "Add item to cart",
    subtext: "Fill in information and check out to order item.",
    image: "https://github.com/MinerBlox/repssite/blob/main/systemimages/tutorial/step4.png?raw=true",
    alt: "Add item to cart tutorial step"
  },
  {
    number: 5,
    title: "Check item QCs",
    subtext: "When the item arrives, check QCs (sorry I had to use another item due to lack of time)",
    image: "https://github.com/MinerBlox/repssite/blob/main/systemimages/tutorial/step5.png?raw=true",
    alt: "Check item QCs tutorial step"
  },
  {
    number: 6,
    title: "NEXT STEPS COMING SOON",
    subtext: "Waiting for items to arrive at warehouse to finish tutorial...",
    comingSoon: true
  }
];

const stepTwoImage = "https://github.com/MinerBlox/repssite/blob/main/systemimages/tutorial/step2.png?raw=true";
const tutorialImageUrls = [stepTwoImage, ...tutorialSteps.map(step => step.image).filter(Boolean)];

function preloadTutorialImages() {
  tutorialImageUrls.forEach(url => {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = url;
    document.head.appendChild(link);
    const image = new Image();
    image.src = url;
  });
}

function injectHomepageModalPolish() {
  if (document.getElementById("homepage-modal-polish")) return;
  const style = document.createElement("style");
  style.id = "homepage-modal-polish";
  style.textContent = `
    #modal-overlay {
      flex-direction: column !important;
      gap: 10px !important;
    }
    .modal-box {
      box-shadow: 0 0 34px rgba(77,166,255,0.24), 0 0 0 1px rgba(77,166,255,0.08), 0 24px 70px rgba(0,0,0,0.52) !important;
    }
    body.light .modal-box {
      box-shadow: 0 0 34px rgba(77,166,255,0.22), 0 0 0 1px rgba(77,166,255,0.1), 0 24px 70px rgba(15,23,42,0.18) !important;
    }
    .modal-close { display: none !important; }
    .modal-close.rc-visible { display: block !important; }
    .tutorial-close-link[hidden] { display: none !important; }
    .modal-body { padding: 22px 28px 24px !important; }
    .tutorial-close-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      padding: 0 12px;
      color: #fff;
      background: transparent;
      border: 0;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      opacity: 0.82;
      text-shadow: 0 1px 14px rgba(0,0,0,0.45);
      transition: opacity 0.15s, transform 0.15s;
    }
    .tutorial-close-link:hover { opacity: 1; transform: translateY(-1px); }
    body.light .tutorial-close-link { color: #fff; }
    .tutorial-nav-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 18px;
    }
    .tutorial-nav-row.single { grid-template-columns: 1fr; }
    .tutorial-nav-btn {
      min-height: 46px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--surface2);
      color: var(--text);
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      transition: opacity 0.15s, transform 0.15s;
    }
    .tutorial-nav-btn:hover { opacity: 0.85; transform: translateY(-1px); }
    .tutorial-nav-btn.primary {
      background: #4da6ff;
      border-color: transparent;
      color: #fff;
      box-shadow: 0 8px 24px rgba(77,166,255,0.25);
    }
    .tutorial-step-sub,
    .tutorial-step2-sub {
      margin: -6px 0 16px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
      text-align: left;
    }
    .tutorial-step-shot,
    .tutorial-step2-shot {
      display: block;
      width: 100%;
      max-height: 315px;
      aspect-ratio: 16 / 9;
      object-fit: contain;
      border: 0;
      border-radius: 12px;
      background: var(--surface2);
    }
    .tutorial-coming-soon { display:grid; place-items:center; min-height:300px; padding:32px; position:relative; overflow:hidden; border:1px solid var(--border); border-radius:12px; text-align:center; background:var(--surface2); }
    .tutorial-coming-soon::before { content:""; position:absolute; inset:-30px; background:radial-gradient(circle at 30% 25%, rgba(77,166,255,0.25), transparent 44%), var(--surface2); filter:blur(18px); opacity:0.9; }
    .tutorial-coming-soon-copy { position:relative; z-index:1; max-width:390px; }
    .tutorial-coming-soon-copy strong { display:block; color:var(--text); font-size:26px; line-height:1.15; }
    .tutorial-coming-soon-copy span { display:block; margin-top:10px; color:var(--muted); font-size:14px; line-height:1.5; }
  `;
  document.head.appendChild(style);
}

function injectTutorialCloseLink() {
  const add = () => {
    const overlay = document.getElementById("modal-overlay");
    const box = document.getElementById("modal-box");
    if (!overlay || !box || document.getElementById("tutorial-close-link")) return;
    const button = document.createElement("button");
    button.id = "tutorial-close-link";
    button.className = "tutorial-close-link";
    button.type = "button";
    button.textContent = "Close tutorial →";
    button.addEventListener("click", () => window.closeModal?.());
    button.hidden = true;
    box.insertAdjacentElement("afterend", button);
  };
  add();
  requestAnimationFrame(add);
}

function renderTutorialProgress(activeStep) {
  return `
    <div class="progress-bar">
      <div class="progress-bar-inner">
        ${Array.from({ length: 6 }, (_, index) => `<div class="progress-segment ${index < activeStep ? "done" : ""}"></div>`).join("")}
      </div>
      <span class="progress-label">${activeStep} / 6</span>
    </div>
  `;
}

function currentTutorialStepNumber() {
  const progress = document.querySelector("#modal-content .progress-label")?.textContent?.trim() || "";
  return Number(progress.match(/^(\d+)/)?.[1] || 0);
}

function showStepNumber(stepNumber) {
  if (stepNumber <= 1) return window.goToStep?.("step1");
  if (stepNumber === 2) return window.goToStep?.("step2");
  const step = tutorialSteps.find(item => item.number === stepNumber);
  if (!step) return window.__rcOriginalGoToStep?.("done") || window.goToStep?.("done");

  const content = document.getElementById("modal-content");
  const box = document.getElementById("modal-box");
  if (!content) return;
  const tutorialClose = document.getElementById("tutorial-close-link");
  if (tutorialClose) tutorialClose.hidden = false;
  content.classList.add("fading");
  setTimeout(() => {
    box?.classList.add("wide");
    content.innerHTML = `
      <div style="animation:rc-fadein 0.4s ease">
        ${renderTutorialProgress(step.number)}
        <div class="step-badge">STEP ${step.number}</div>
        ${step.comingSoon ? `<div class="tutorial-coming-soon"><div class="tutorial-coming-soon-copy"><strong>${step.title}</strong><span>${step.subtext}</span></div></div>` : `<h2 class="step-title">${step.title}</h2><p class="tutorial-step-sub">${step.subtext}</p><div class="yt-embed"><img class="tutorial-step-shot" src="${step.image}" alt="${step.alt}"></div>`}
        <div class="checkbox-row" onclick="window.showTutorialStep?.(${step.number + 1})">
          <div class="checkbox-box"></div>
          <span class="checkbox-label">Next Step</span>
        </div>
        <div class="step-progress-note">You're <span>${step.number}/6</span> of the way to your future hauls!</div>
      </div>
    `;
    content.classList.remove("fading");
  }, 350);
}

function installTutorialDoneGuard() {
  if (window.__rcTutorialDoneGuard === true) return;
  if (typeof window.goToStep !== "function") {
    requestAnimationFrame(installTutorialDoneGuard);
    return;
  }

  window.__rcOriginalGoToStep = window.goToStep;
  window.__rcTutorialDoneGuard = true;
  window.goToStep = next => {
    if (next === "done") {
      const currentStep = currentTutorialStepNumber();
      if (currentStep && currentStep < 6) return showStepNumber(currentStep + 1);
    }
    return window.__rcOriginalGoToStep(next);
  };
}

function injectTutorialNavButtons() {
  const patch = () => {
    const content = document.getElementById("modal-content");
    if (!content) return;
    const row = content.querySelector(".checkbox-row");
    if (!row || row.dataset.repsNavPatched === "true") return;
    const currentStep = currentTutorialStepNumber();
    if (!currentStep) return;

    const nav = document.createElement("div");
    nav.className = "tutorial-nav-row";
    row.dataset.repsNavPatched = "true";

    if (currentStep === 1) {
      nav.classList.add("single");
      nav.innerHTML = `<button class="tutorial-nav-btn primary" type="button">Next Step</button>`;
      nav.querySelector("button").addEventListener("click", () => window.goToStep?.("step2"));
    } else {
      nav.innerHTML = `
        <button class="tutorial-nav-btn" type="button">Previous Step</button>
        <button class="tutorial-nav-btn primary" type="button">Next Step</button>
      `;
      nav.children[0].addEventListener("click", () => showStepNumber(currentStep - 1));
      nav.children[1].addEventListener("click", () => showStepNumber(currentStep + 1));
    }

    row.replaceWith(nav);
  };

  patch();
  const observer = new MutationObserver(patch);
  const waitForContent = () => {
    const content = document.getElementById("modal-content");
    if (content) observer.observe(content, { childList: true, subtree: true });
    else requestAnimationFrame(waitForContent);
  };
  waitForContent();
}

function injectTutorialStepCopy() {
  window.showTutorialStep = showStepNumber;
  window.showTutorialStepThree = () => showStepNumber(3);

  const patch = () => {
    const content = document.getElementById("modal-content");
    if (!content) return;

    content.querySelectorAll(".modal-title span, .step-link .sub").forEach(node => {
      if (node.textContent.includes("35%")) node.textContent = node.textContent.replace(/35%/g, "25%");
    });

    const progress = content.querySelector(".progress-label");
    if (progress?.textContent.trim() === "1 / 3") progress.textContent = "1 / 6";
    if (progress?.textContent.trim() === "2 / 3") progress.textContent = "2 / 6";

    const stepTitle = content.querySelector(".step-title");
    if (!stepTitle || stepTitle.textContent.trim() !== "Watch the quick tutorial.") return;
    stepTitle.textContent = "Browse our spreadsheet";

    if (!content.querySelector(".tutorial-step-sub") && !content.querySelector(".tutorial-step2-sub")) {
      const subtext = document.createElement("p");
      subtext.className = "tutorial-step-sub";
      subtext.textContent = "Pick an item and open the link in your browser.";
      stepTitle.insertAdjacentElement("afterend", subtext);
    }

    const frame = content.querySelector(".yt-embed");
    if (frame && frame.dataset.repsStep2Image !== "true") {
      frame.dataset.repsStep2Image = "true";
      frame.innerHTML = `<img class="tutorial-step-shot" src="${stepTwoImage}" alt="Browse spreadsheet tutorial step">`;
    }
  };

  patch();
  const observer = new MutationObserver(patch);
  const waitForContent = () => {
    const content = document.getElementById("modal-content");
    if (content) observer.observe(content, { childList: true, subtree: true });
    else requestAnimationFrame(waitForContent);
  };
  waitForContent();
}

preloadTutorialImages();
injectHomepageModalPolish();
injectTutorialCloseLink();
installTutorialDoneGuard();
injectTutorialNavButtons();
injectTutorialStepCopy();

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