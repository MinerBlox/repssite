import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app-check.js";

const SITE_KEY = "6Lex_jwtAAAAAA7h-DHF6lebL4uxvcX7j7liRixl";
const instances = new Map();

const path = window.location.pathname.replace(/\/+$/, "") || "/";
if (path === "/" || path === "/index.html") {
  import("./homepage-curation.js?v=2026-08-16-hide-brands-2").catch(error => console.warn("Homepage curation could not load", error));
}

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
