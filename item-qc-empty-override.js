const EMPTY_QC_MESSAGE = "We're still working on QC pictures for this item...";
const QC_PAGE_SIZE = 10;
const BAD_QC_TEXT = [
  "Add the original Weidian, 1688 or Taobao link in Product URL to load QC pictures.",
  "The QC providers replied, but there were no image links for this item.",
  "Could not load QC pictures yet. Open the console and search [RC QC]."
];

let lastQcSignature = "";
let pagerScheduled = false;
let observer = null;

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
      padding: 0 18px;
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

function applyQcPagination() {
  const qcGrid = document.getElementById("qc-grid");
  if (!qcGrid || qcGrid.querySelector(".qc-empty-working")) return;

  const buttons = Array.from(qcGrid.querySelectorAll(".qc-link[data-qc-index]"));
  if (!buttons.length) return;

  const signature = buttons.map(button => button.dataset.qcIndex).join("|");
  if (signature !== lastQcSignature) {
    lastQcSignature = signature;
    qcGrid.dataset.visibleQcCount = String(QC_PAGE_SIZE);
  }

  let visibleCount = Number(qcGrid.dataset.visibleQcCount || QC_PAGE_SIZE);
  visibleCount = Math.max(QC_PAGE_SIZE, Math.min(visibleCount, buttons.length));

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
    wrap.innerHTML = `<button class="qc-load-more-btn" type="button"></button>`;
    qcGrid.appendChild(wrap);
    wrap.querySelector("button").addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const current = Number(qcGrid.dataset.visibleQcCount || QC_PAGE_SIZE);
      qcGrid.dataset.visibleQcCount = String(current + QC_PAGE_SIZE);
      scheduleCheck();
    });
  }

  const remaining = buttons.length - visibleCount;
  wrap.querySelector("button").textContent = `Load 10 more QCs (${remaining} left)`;
}

function runCheck() {
  pagerScheduled = false;
  if (shouldReplaceQcText()) renderEmptyQcState();
  applyQcPagination();
}

function scheduleCheck() {
  if (pagerScheduled) return;
  pagerScheduled = true;
  requestAnimationFrame(runCheck);
}

observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    if (mutation.target?.closest?.(".qc-load-more-wrap")) continue;
    scheduleCheck();
    break;
  }
});
observer.observe(document.body, { childList: true, subtree: true, characterData: true });

scheduleCheck();
setTimeout(scheduleCheck, 500);
setTimeout(scheduleCheck, 1500);
setTimeout(scheduleCheck, 3000);
