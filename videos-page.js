import "/site-analytics.js?v=2026-07-07-videos-firestore";
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { assetUrl, gridMessage, linkedItems, renderVideoGrid, sortVideos, tiktokUrl } from "/video-grid.js";

const get = id => document.getElementById(id);
const grid = get("video-grid");
const dialog = get("video-details");
let videosById = new Map();
let openId = "";

function renderDetails(video) {
  const title = video.title || "Untitled video";
  const caption = get("details-caption");
  const watch = get("details-watch");
  const url = tiktokUrl(video.tiktokUrl);
  get("details-title").textContent = title;
  caption.textContent = video.caption || "";
  caption.hidden = !caption.textContent;
  watch.hidden = !url;
  if (url) watch.href = url;
  else watch.removeAttribute("href");

  const list = get("details-items");
  list.replaceChildren();
  for (const item of linkedItems(video)) {
    if (item.id === "." || item.id === "..") continue;
    const row = document.createElement("li");
    const link = document.createElement("a");
    link.className = "details-item";
    link.href = "/items/" + encodeURIComponent(item.id) + "/";
    const thumbnail = assetUrl(item.imageUrl);
    if (thumbnail) {
      const image = document.createElement("img");
      image.alt = "";
      image.addEventListener("error", () => image.remove(), { once: true });
      image.src = thumbnail;
      link.append(image);
    }
    link.append(document.createTextNode(item.name || "View item " + item.id));
    row.append(link);
    list.append(row);
  }
  get("details-empty").hidden = list.children.length > 0;
}

grid.addEventListener("click", event => {
  const id = event.target.closest("[data-video-id]")?.dataset.videoId;
  const video = videosById.get(id);
  if (!video) return;
  openId = id;
  renderDetails(video);
  dialog.showModal();
});

dialog.addEventListener("close", () => {
  const previousButton = [...grid.querySelectorAll("[data-video-id]")].find(button => button.dataset.videoId === openId);
  previousButton?.focus();
  openId = "";
});

const db = getFirestore(getApp());
onSnapshot(collection(db, "videos"), snapshot => {
  const videos = sortVideos(snapshot.docs.map(entry => ({ ...entry.data(), id: entry.id }))
    .filter(video => video.isActive !== false));
  videosById = new Map(videos.map(video => [video.id, video]));
  renderVideoGrid(grid, videos, "No videos have been added yet.");
  if (dialog.open) {
    const current = videosById.get(openId);
    if (current) renderDetails(current);
    else dialog.close();
  }
}, () => gridMessage(grid, "Couldn’t load videos. Try refreshing the page."));
