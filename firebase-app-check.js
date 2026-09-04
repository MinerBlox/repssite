import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app-check.js";

const SITE_KEY = "6Lex_jwtAAAAAA7h-DHF6lebL4uxvcX7j7liRixl";
const instances = new Map();

const path = window.location.pathname.replace(/\/+$/, "") || "/";
if (path === "/" || path === "/index.html") {
  import("./homepage-curation.js?v=2026-09-04-homepage-manager-1").catch(error => console.warn("Homepage curation could not load", error));
}
if (path.includes("/spreadsheetadmin") || path.endsWith("/editcatalog.html") || path.endsWith("/editcatalog")) {
  import("./catalog-index-admin-sync.js?v=2026-08-20-index-1").catch(() => {});
}

function addHomepageManagerCard() {
  const cleanPath = window.location.pathname.replace(/\/+$/, "") || "/";
  if (cleanPath !== "/admin" && cleanPath !== "/admin/index.html") return;
  const add = () => {
    const grid = document.querySelector(".tool-grid");
    if (!grid || document.getElementById("homepage-manager-card")) return;
    const card = document.createElement("a");
    card.id = "homepage-manager-card";
    card.className = "tool-card";
    card.href = "homepage-manager/";
    card.innerHTML = `
      <span class="tool-icon">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M3 5h18v14H3z"/>
          <path d="M7 9h4M7 13h10M15 9h2"/>
        </svg>
      </span>
      <h2>Homepage Manager</h2>
      <p>Choose the products shown in Most Popular, Our Picks and the seasonal homepage rows.</p>
      <span class="tool-arrow"><span>Manage homepage</span><span aria-hidden="true">&rarr;</span></span>
    `;
    grid.insertBefore(card, grid.children[1] || null);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add, { once: true });
  else add();
}

addHomepageManagerCard();

function shouldSkipAppCheck() {
  const hostname = window.location.hostname.toLowerCase();

  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".pages.dev") ||
    hostname.includes("localhost") ||
    hostname.includes("pages.dev");
}

export function enableAppCheck(app) {
  if (instances.has(app.name)) return instances.get(app.name);

  if (shouldSkipAppCheck()) {
    instances.set(app.name, null);
    return null;
  }

  try {
    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });

    instances.set(app.name, appCheck);
    return appCheck;
  } catch (error) {
    console.warn("Firebase App Check could not start. Continuing without App Check.", error?.message || error);
    instances.set(app.name, null);
    return null;
  }
}
