import { getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const ADMIN_UID = "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";
const PRESENCE_WINDOW_MS = 65000;

let unsubscribers = [];
let storedHigh = 0;
let pendingHigh = 0;
let dailyViews = [];
let hourlyViews = [];

function stop() {
  unsubscribers.forEach(unsubscribe => unsubscribe());
  unsubscribers = [];
  storedHigh = 0;
  pendingHigh = 0;
  dailyViews = [];
  hourlyViews = [];
}

function dateFromDayId(id) {
  const parts = String(id).split("-").map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function currentChartRange() {
  return document.querySelector(".chart-range.active")?.dataset.chartRange || "daily";
}

function chartSeries(range) {
  const now = new Date();
  const groups = new Map();

  if (range === "hourly") {
    hourlyViews
      .filter(item => /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(item.id))
      .forEach(item => groups.set(item.id, Number(item.totalVisits || 0)));

    const currentHour = new Date();
    currentHour.setUTCMinutes(0, 0, 0);

    return Array.from({ length: 24 }, (_, index) => {
      const hour = new Date(currentHour.getTime() - (23 - index) * 60 * 60 * 1000);
      const key = hour.toISOString().slice(0, 13);
      return {
        label: hour.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC"
        }),
        value: groups.get(key) || 0
      };
    });
  }

  const rows = dailyViews
    .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  let cutoff = null;
  let keyFor = item => item.id;
  let labelFor = key => {
    const date = dateFromDayId(key);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC"
    });
  };

  if (range === "daily") {
    cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
  }

  if (range === "monthly" || range === "all") {
    if (range === "monthly") {
      cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    }
    keyFor = item => item.id.slice(0, 7);
    labelFor = key => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC"
    });
  }

  if (range === "yearly") {
    keyFor = item => item.id.slice(0, 4);
    labelFor = key => key;
  }

  rows.forEach(item => {
    const date = dateFromDayId(item.id);
    if (cutoff && date < cutoff) return;
    const key = keyFor(item);
    groups.set(key, (groups.get(key) || 0) + Number(item.totalVisits || 0));
  });

  return [...groups].map(([key, value]) => ({ label: labelFor(key), value }));
}

function installTooltip() {
  const canvas = document.getElementById("views-chart");
  const wrap = canvas?.closest(".chart-wrap");
  if (!canvas || !wrap || canvas.dataset.hoverTooltipReady === "true") return;
  canvas.dataset.hoverTooltipReady = "true";

  const tooltip = document.createElement("div");
  tooltip.id = "views-chart-tooltip";
  tooltip.style.cssText = [
    "position:absolute",
    "z-index:10",
    "display:none",
    "pointer-events:none",
    "min-width:92px",
    "padding:8px 10px",
    "border:1px solid #29292f",
    "border-radius:8px",
    "background:rgba(17,17,20,.96)",
    "box-shadow:0 10px 28px rgba(0,0,0,.35)",
    "color:#f1f1f3",
    "font:12px 'DM Sans',sans-serif",
    "line-height:1.35",
    "white-space:nowrap",
    "transform:translate(-50%,-100%)"
  ].join(";");
  wrap.appendChild(tooltip);

  canvas.addEventListener("mousemove", event => {
    const series = chartSeries(currentChartRange());
    if (!series.length) {
      tooltip.style.display = "none";
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 1;
    const padLeft = 42;
    const padRight = 12;
    const plotWidth = Math.max(1, width - padLeft - padRight);
    const localX = Math.min(width - padRight, Math.max(padLeft, event.clientX - rect.left));
    const index = series.length === 1
      ? 0
      : Math.round(((localX - padLeft) / plotWidth) * (series.length - 1));
    const point = series[Math.max(0, Math.min(series.length - 1, index))];
    const pointX = series.length === 1
      ? padLeft + plotWidth / 2
      : padLeft + plotWidth * index / (series.length - 1);

    tooltip.innerHTML = `<strong style="display:block;margin-bottom:2px">${point.label}</strong><span style="color:#92929c">${Number(point.value || 0).toLocaleString()} view${Number(point.value) === 1 ? "" : "s"}</span>`;
    tooltip.style.left = `${pointX}px`;
    tooltip.style.top = `${Math.max(34, event.clientY - rect.top - 8)}px`;
    tooltip.style.display = "block";
  });

  canvas.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });

  document.querySelectorAll(".chart-range").forEach(button => {
    button.addEventListener("click", () => {
      tooltip.style.display = "none";
    });
  });
}

function start(db) {
  stop();
  installTooltip();

  const totalsRef = doc(db, "analyticsTotals", "summary");

  unsubscribers.push(onSnapshot(totalsRef, snapshot => {
    storedHigh = Number(snapshot.data()?.allTimeHighLive || 0);
    if (storedHigh >= pendingHigh) pendingHigh = 0;
  }));

  unsubscribers.push(onSnapshot(collection(db, "analyticsPresence"), async snapshot => {
    const cutoff = Date.now() - PRESENCE_WINDOW_MS;
    const liveCount = snapshot.docs.reduce((count, presenceDoc) => {
      const lastSeen = presenceDoc.data()?.lastSeen?.toMillis?.() || 0;
      return count + (lastSeen >= cutoff ? 1 : 0);
    }, 0);

    const threshold = Math.max(storedHigh, pendingHigh);
    if (liveCount <= threshold) return;

    pendingHigh = liveCount;
    try {
      await setDoc(totalsRef, {
        allTimeHighLive: liveCount,
        allTimeHighLiveAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      storedHigh = Math.max(storedHigh, liveCount);
    } catch (error) {
      pendingHigh = 0;
      console.warn("Could not save all-time live viewer high", error);
    }
  }));

  unsubscribers.push(onSnapshot(collection(db, "analyticsDaily"), snapshot => {
    dailyViews = snapshot.docs.map(dayDoc => ({ id: dayDoc.id, ...dayDoc.data() }));
  }));

  unsubscribers.push(onSnapshot(collection(db, "analyticsHourly"), snapshot => {
    hourlyViews = snapshot.docs.map(hourDoc => ({ id: hourDoc.id, ...hourDoc.data() }));
  }));
}

function boot(attempt = 0) {
  if (!getApps().length) {
    if (attempt < 30) window.setTimeout(() => boot(attempt + 1), 50);
    return;
  }

  const app = getApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  onAuthStateChanged(auth, user => {
    if (user?.uid === ADMIN_UID) start(db);
    else stop();
  });
}

boot();
