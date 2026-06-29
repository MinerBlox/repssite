const BRAND_NAME = "RepsCentral";
const FAVICON_URL = "systemimages/repscentrallogo.png";

function basePath() {
  return window.rcBasePath || (window.location.pathname.startsWith("/repssite/") ? "/repssite/" : "/");
}

function siteAssetPath(path) {
  return `${basePath()}${String(path || "").replace(/^\/+/, "")}`;
}

function upsertLink(rel, href) {
  let link = document.querySelector(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
}

function normalizeTitle() {
  const current = document.title || BRAND_NAME;
  const fixed = current
    .replace(/repscentral\.com/gi, "RepsCentral.net")
    .replace(/repscentral/gi, BRAND_NAME)
    .replace(/reps central/gi, BRAND_NAME);
  document.title = fixed.includes(BRAND_NAME) ? fixed : `${fixed} - ${BRAND_NAME}`;
}

function applyHeadBranding() {
  const icon = siteAssetPath(FAVICON_URL);
  upsertLink("icon", icon);
  upsertLink("shortcut icon", icon);
  upsertLink("apple-touch-icon", icon);
  normalizeTitle();
}

function silenceProductionConsole() {
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const debugEnabled = new URLSearchParams(window.location.search).has("debug");
  if (isLocal || debugEnabled) return;
  ["debug", "log", "info", "warn"].forEach(method => {
    try { console[method] = () => {}; } catch {}
  });
}

silenceProductionConsole();
applyHeadBranding();

const headObserver = new MutationObserver(applyHeadBranding);
headObserver.observe(document.head, { childList: true, subtree: true, characterData: true });

window.setTimeout(applyHeadBranding, 500);
window.setTimeout(applyHeadBranding, 1500);
window.setTimeout(applyHeadBranding, 3000);
window.addEventListener("pagehide", () => headObserver.disconnect());
