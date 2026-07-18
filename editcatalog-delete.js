import { getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const ADMIN_UID = "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";
const REPO_PREFIX = "https://raw.githubusercontent.com/MinerBlox/repssite/dev/";

const app = getApp("edit-catalog-admin");
const auth = getAuth(app);
const db = getFirestore(app);
let observer = null;

function showStatus(message, isError = false, timeout = 4500) {
  const box = document.getElementById("admin-status");
  if (!box) return;
  box.textContent = message;
  box.classList.toggle("error", isError);
  box.classList.add("show");
  if (timeout) setTimeout(() => box.classList.remove("show"), timeout);
}

function installStyles() {
  if (document.getElementById("rc-delete-item-styles")) return;
  const style = document.createElement("style");
  style.id = "rc-delete-item-styles";
  style.textContent = `
    .rc-delete-item{
      width:100%;min-height:36px;margin-top:8px;
      border:1px solid rgba(239,68,68,.7)!important;
      border-radius:9px;background:rgba(127,29,29,.16)!important;
      color:#f87171!important;font-size:11px!important;font-weight:900!important;
      letter-spacing:.055em;text-transform:uppercase;cursor:pointer
    }
    .rc-delete-item:hover{background:rgba(220,38,38,.28)!important;color:#fff!important}
    .rc-delete-item:disabled{opacity:.55;cursor:wait}
  `;
  document.head.appendChild(style);
}

function getProductId(card) {
  return card.querySelector("[data-agent-product]")?.dataset.agentProduct || "";
}

function getImagePath(card) {
  const raw = (card.querySelector(".product-image")?.getAttribute("src") || "").split("?")[0];
  if (!raw.startsWith(REPO_PREFIX)) return "";
  return decodeURIComponent(raw.slice(REPO_PREFIX.length));
}

async function deleteItem(card, button) {
  const user = auth.currentUser;
  if (!user || user.uid !== ADMIN_UID) {
    showStatus("Admin login required.", true);
    return;
  }

  const productId = getProductId(card);
  const name = card.querySelector(".product-name")?.textContent?.trim() || productId || "this item";
  const imagePath = getImagePath(card);

  if (!productId) {
    showStatus("Could not identify this product.", true);
    return;
  }

  const confirmed = window.confirm(
    `Permanently delete \"${name}\"?\n\nThis will remove the Firestore product and its GitHub image from the dev branch. This cannot be undone.`
  );
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "DELETING...";

  try {
    if (imagePath) {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/catalog-image-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({ path: imagePath })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not delete GitHub image.");
    }

    await deleteDoc(doc(db, "liveproducts", productId));
    card.remove();
    showStatus(`Deleted ${name} from Firebase and GitHub.`, false, 5500);
  } catch (error) {
    button.disabled = false;
    button.textContent = "DELETE ITEM";
    showStatus(`Could not fully delete item: ${error.message}`, true, 9000);
  }
}

function decorateCards() {
  document.querySelectorAll(".product-card").forEach(card => {
    const body = card.querySelector(".product-body");
    if (!body || body.querySelector(".rc-delete-item")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "rc-delete-item";
    button.textContent = "DELETE ITEM";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      deleteItem(card, button);
    });
    body.appendChild(button);
  });
}

function start() {
  installStyles();
  decorateCards();
  observer?.disconnect();
  observer = new MutationObserver(decorateCards);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
