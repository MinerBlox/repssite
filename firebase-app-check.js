import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app-check.js";

const SITE_KEY = "6Lex_jwtAAAAAA7h-DHF6lebL4uxvcX7j7liRixl";
const instances = new Map();

export function enableAppCheck(app) {
  if (instances.has(app.name)) return instances.get(app.name);

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
