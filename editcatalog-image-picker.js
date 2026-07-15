import { getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const ADMIN_UID = "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";
const REPO_PREFIX = "https://raw.githubusercontent.com/MinerBlox/repssite/dev/";

const auth = getAuth(getApp("edit-catalog-admin"));
let picker = null;
let activeCard = null;
let activeResults = [];
let observer = null;

function showStatus(message, isError = false, timeout = 3500) {
  const box = document.getElementById("admin-status");
  if (!box) return;
  box.textContent = message;
  box.classList.toggle("error", isError);
  box.classList.add("show");
  if (timeout) setTimeout(() => box.classList.remove("show"), timeout);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function installStyles() {
  if (document.getElementById("rc-png-picker-styles")) return;
  const style = document.createElement("style");
  style.id = "rc-png-picker-styles";
  style.textContent = `
    .rc-find-pngs{width:100%;min-height:36px;margin-top:10px;border:1px solid rgba(77,166,255,.5)!important;border-radius:9px;background:rgba(77,166,255,.09)!important;color:#4da6ff!important;font-size:11px!important;font-weight:900!important;letter-spacing:.055em;text-transform:uppercase;cursor:pointer}.rc-find-pngs:hover{background:rgba(77,166,255,.18)!important}
    .rc-png-picker{position:fixed;inset:0;z-index:100000;display:none;place-items:center;padding:24px;background:rgba(0,0,0,.78);backdrop-filter:blur(10px)}.rc-png-picker.open{display:grid}.rc-png-panel{width:min(1180px,100%);max-height:92vh;overflow:auto;padding:20px;border:1px solid var(--border,#29292f);border-radius:16px;background:var(--surface,#111114);box-shadow:0 30px 100px rgba(0,0,0,.65)}
    .rc-png-head{display:flex;justify-content:space-between;gap:18px;margin-bottom:16px}.rc-png-title{font-family:'Syne',sans-serif;font-size:24px;font-weight:800;color:var(--text,#f0f0f0)}.rc-png-sub{margin-top:6px;color:var(--muted,#92929c);font-size:13px}.rc-png-close{width:38px;height:38px;flex:none;border:1px solid var(--border,#29292f)!important;border-radius:9px;background:var(--surface2,#18181c)!important;color:var(--text,#f0f0f0)!important;font-size:22px;cursor:pointer}
    .rc-png-search-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-bottom:16px}.rc-png-search-input{width:100%;min-height:44px;padding:0 12px;border:1px solid var(--border,#29292f);border-radius:9px;outline:0;background:var(--surface2,#18181c);color:var(--text,#f0f0f0);font:inherit}.rc-png-search-btn{min-height:44px;padding:0 16px!important;border:0;border-radius:9px;background:#4da6ff!important;color:#fff!important;font-weight:800!important;cursor:pointer}
    .rc-png-results{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.rc-png-choice{overflow:hidden;padding:0!important;border:1px solid var(--border,#29292f)!important;border-radius:12px;background:var(--surface2,#18181c)!important;color:var(--text,#f0f0f0)!important;text-align:left;cursor:pointer;transition:.15s ease}.rc-png-choice:hover{border-color:#4da6ff!important;transform:translateY(-2px)}.rc-png-choice:disabled{opacity:.55;cursor:wait}.rc-png-choice img{width:100%;aspect-ratio:1/1;display:block;object-fit:contain;background:#fff}.rc-png-copy{padding:10px}.rc-png-choice-title{font-size:11px;line-height:1.35;font-weight:700;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.rc-png-choice-source{margin-top:5px;color:var(--muted,#92929c);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rc-png-state{min-height:250px;grid-column:1/-1;display:grid;place-items:center;color:var(--muted,#92929c);text-align:center;font-size:14px}.rc-png-note{margin-top:12px;color:var(--muted,#92929c);font-size:11px;text-align:center}
    @media(max-width:900px){.rc-png-results{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.rc-png-results{grid-template-columns:1fr}.rc-png-search-row{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function installPicker() {
  if (picker) return;
  picker = document.createElement("div");
  picker.className = "rc-png-picker";
  picker.innerHTML = `
    <div class="rc-png-panel">
      <div class="rc-png-head">
        <div><div class="rc-png-title">CHOOSE A CLEAN PRODUCT IMAGE</div><div class="rc-png-sub">Five results searched specifically for transparent-background PNG product images.</div></div>
        <button class="rc-png-close" type="button">×</button>
      </div>
      <div class="rc-png-search-row"><input class="rc-png-search-input" type="text"><button class="rc-png-search-btn" type="button">SEARCH AGAIN</button></div>
      <div class="rc-png-results"></div>
      <div class="rc-png-note">Pick the cleanest accurate match. Clicking one permanently replaces the current GitHub image.</div>
    </div>`;
  document.body.appendChild(picker);
  picker.querySelector(".rc-png-close").addEventListener("click", closePicker);
  picker.addEventListener("click", event => { if (event.target === picker) closePicker(); });
  picker.querySelector(".rc-png-search-btn").addEventListener("click", searchCurrent);
  picker.querySelector(".rc-png-search-input").addEventListener("keydown", event => { if (event.key === "Enter") searchCurrent(); });
}

function closePicker() {
  picker?.classList.remove("open");
  activeCard = null;
  activeResults = [];
}

function productName(card) {
  return card.querySelector(".product-name")?.textContent?.trim() || "";
}

function currentImageUrl(card) {
  return (card.querySelector(".product-image")?.getAttribute("src") || "").split("?")[0];
}

function openPicker(card) {
  activeCard = card;
  picker.querySelector(".rc-png-search-input").value = productName(card);
  picker.classList.add("open");
  searchCurrent();
}

async function searchCurrent() {
  if (!activeCard) return;
  const query = picker.querySelector(".rc-png-search-input").value.trim();
  const results = picker.querySelector(".rc-png-results");
  if (!query) return;
  results.innerHTML = '<div class="rc-png-state">Searching for five transparent-background PNG options…</div>';

  try {
    const response = await fetch(`/api/catalog-image-search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Search failed (${response.status}).`);
    activeResults = data.results || [];
    if (!activeResults.length) {
      results.innerHTML = '<div class="rc-png-state">No results found. Try a more specific name.</div>';
      return;
    }

    results.innerHTML = activeResults.map((item, index) => `
      <button class="rc-png-choice" type="button" data-index="${index}">
        <img src="${escapeHtml(item.thumbnailUrl || item.imageUrl)}" alt="${escapeHtml(item.title || "Image result")}" loading="lazy" referrerpolicy="no-referrer">
        <div class="rc-png-copy"><div class="rc-png-choice-title">${escapeHtml(item.title || "Image result")}</div><div class="rc-png-choice-source">${escapeHtml(item.source || "")}</div></div>
      </button>`).join("");

    results.querySelectorAll(".rc-png-choice").forEach(button => {
      button.addEventListener("click", () => useResult(Number(button.dataset.index)));
    });
  } catch (error) {
    results.innerHTML = `<div class="rc-png-state">${escapeHtml(error.message)}</div>`;
  }
}

function base64ToBlob(base64, contentType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType || "image/png" });
}

async function normalizeToPng(blob) {
  if (!window.createImageBitmap) return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("Could not process image.")), "image/png"));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function useResult(index) {
  const item = activeResults[index];
  const card = activeCard;
  if (!item || !card) return;
  picker.querySelectorAll(".rc-png-choice").forEach(button => button.disabled = true);
  showStatus("Replacing GitHub image…", false, 0);

  try {
    const user = auth.currentUser;
    if (!user || user.uid !== ADMIN_UID) throw new Error("Admin login required.");

    const imageUrl = currentImageUrl(card);
    if (!imageUrl.startsWith(REPO_PREFIX)) throw new Error("Current image is not in the dev GitHub image folder.");
    let path = decodeURIComponent(imageUrl.slice(REPO_PREFIX.length));

    const sourceResponse = await fetch("/api/catalog-image-fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: item.imageUrl })
    });
    const source = await sourceResponse.json().catch(() => ({}));
    if (!sourceResponse.ok) throw new Error(source.error || "Could not download selected image.");

    const pngBlob = await normalizeToPng(base64ToBlob(source.base64, source.contentType));
    const base64 = await blobToBase64(pngBlob);

    if (!path.toLowerCase().endsWith(".png")) path = path.replace(/\.[^.]+$/, ".png");
    const idToken = await user.getIdToken();
    const replaceResponse = await fetch("/api/catalog-image-replace", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ path, base64 })
    });
    const replaced = await replaceResponse.json().catch(() => ({}));
    if (!replaceResponse.ok) throw new Error(replaced.error || "GitHub replacement failed.");

    const image = card.querySelector(".product-image");
    const newUrl = `${REPO_PREFIX}${path}`;
    if (image) image.src = `${newUrl}?v=${Date.now()}`;
    closePicker();
    showStatus("Done — image permanently replaced in GitHub.", false, 5000);
  } catch (error) {
    picker.querySelectorAll(".rc-png-choice").forEach(button => button.disabled = false);
    showStatus(`Could not replace image: ${error.message}`, true, 9000);
  }
}

function decorateCards() {
  document.querySelectorAll(".product-card").forEach(card => {
    const body = card.querySelector(".product-body");
    if (!body || body.querySelector(".rc-find-pngs")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rc-find-pngs";
    button.textContent = "FIND 5 PNGS";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      openPicker(card);
    });
    const markButton = body.querySelector(".rc-mark-above");
    if (markButton) body.insertBefore(button, markButton); else body.appendChild(button);
  });
}

function start() {
  installStyles();
  installPicker();
  decorateCards();
  observer?.disconnect();
  observer = new MutationObserver(decorateCards);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
