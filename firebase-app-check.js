import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app-check.js";

const SITE_KEY = "6Lex_jwtAAAAAA7h-DHF6lebL4uxvcX7j7liRixl";
const instances = new Map();

export function enableAppCheck(app) {
  if (!instances.has(app.name)) {
    instances.set(app.name, initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(SITE_KEY),
      isTokenAutoRefreshEnabled: true
    }));
  }
  return instances.get(app.name);
}
