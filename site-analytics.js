import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp, increment, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDTTzoJlvr0mYxwx82cQ9JJn8rXrMEy7JA",
  authDomain: "reps-central.firebaseapp.com",
  projectId: "reps-central",
  storageBucket: "reps-central.firebasestorage.app",
  messagingSenderId: "812299387060",
  appId: "1:812299387060:web:1c93d1e7bf30b05653d7e1",
  measurementId: "G-8T7F9F1FZ9"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const HEARTBEAT_MS = 20000;

function pageDetails() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path.endsWith("/index.html")) return { id: "home", name: "Homepage" };
  if (path.endsWith("/spreadsheet.html")) return { id: "spreadsheet", name: "Spreadsheet" };
  if (path.endsWith("/quality-checks.html")) return { id: "quality-checks", name: "QC Viewer" };
  if (path.endsWith("/link-converter.html")) return { id: "link-converter", name: "Link Converter" };
  if (path.endsWith("/agents.html")) return { id: "agents", name: "Agents" };
  if (path.includes("/items/")) return { id: "item-pages", name: "Item Pages" };
  if (path.endsWith("/404.html")) return { id: "not-found", name: "404 Page" };
  return { id: path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "other", name: document.title || "Other" };
}

function visitorId() {
  const key = "rc-analytics-visitor";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2);
    localStorage.setItem(key, id);
  }
  return id;
}

const page = pageDetails();
const presenceRef = doc(db, "analyticsPresence", visitorId());
const interactionFields = ["viewClicks", "copyClicks", "detailViews", "outboundClicks"];

async function trackProductInteraction(productId, interactionType) {
  if (!productId || !interactionFields.includes(interactionType)) return;
  const counters = Object.fromEntries(interactionFields.map(field => [field, increment(field === interactionType ? 1 : 0)]));
  await setDoc(doc(db, "analyticsProducts", String(productId)), {
    ...counters,
    totalInteractions: increment(1),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

window.rcTrackProductInteraction = (productId, interactionType) => {
  trackProductInteraction(productId, interactionType).catch(error => console.warn("Product interaction tracking unavailable:", error));
};

async function recordVisit() {
  await Promise.all([
    setDoc(doc(db, "analyticsTotals", "summary"), {
      totalVisits: increment(1),
      updatedAt: serverTimestamp()
    }, { merge: true }),
    setDoc(doc(db, "analyticsPages", page.id), {
      name: page.name,
      path: window.location.pathname,
      totalVisits: increment(1),
      updatedAt: serverTimestamp()
    }, { merge: true })
  ]);
}

async function heartbeat() {
  await setDoc(presenceRef, {
    pageId: page.id,
    pageName: page.name,
    path: window.location.pathname,
    lastSeen: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000)
  }, { merge: true });
}

recordVisit().catch(error => console.warn("Visit tracking unavailable:", error));
heartbeat().catch(error => console.warn("Live tracking unavailable:", error));
const heartbeatTimer = window.setInterval(() => {
  if (document.visibilityState === "visible") heartbeat().catch(() => {});
}, HEARTBEAT_MS);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") heartbeat().catch(() => {});
});

window.addEventListener("pagehide", () => {
  clearInterval(heartbeatTimer);
});
