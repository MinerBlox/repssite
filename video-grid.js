export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function assetUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim(), location.origin + "/");
    return url.protocol === "https:" || url.origin === location.origin ? url.href : "";
  } catch {
    return "";
  }
}

export function tiktokUrl(value) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
    const shortHost = ["vm.tiktok.com", "vt.tiktok.com"].includes(url.hostname);
    const postHost = ["www.tiktok.com", "m.tiktok.com", "tiktok.com"].includes(url.hostname);
    const postPath = /^\/@[^/]+\/(?:video|photo)\/\d+\/?$/i;
    const shortPath = /^\/[a-z\d]+\/?$/i;
    const sharePath = /^\/t\/[a-z\d]+\/?$/i;
    if (!(shortHost && shortPath.test(url.pathname)) &&
        !(postHost && (postPath.test(url.pathname) || sharePath.test(url.pathname)))) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

export function linkedItems(video) {
  const items = new Map();
  for (const id of Array.isArray(video.itemIds) ? video.itemIds : []) {
    if (typeof id === "string" && id) items.set(id, { id });
  }
  for (const item of Array.isArray(video.items) ? video.items : []) {
    if (typeof item?.id === "string" && item.id) items.set(item.id, item);
  }
  return [...items.values()];
}

export function sortVideos(videos) {
  return videos.sort((left, right) =>
    (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0) ||
    (right.createdAt?.seconds || 0) - (left.createdAt?.seconds || 0) ||
    left.id.localeCompare(right.id)
  );
}

export function gridMessage(grid, message) {
  const paragraph = document.createElement("p");
  paragraph.className = "video-grid-message";
  paragraph.textContent = message;
  grid.replaceChildren(paragraph);
}

export function renderVideoGrid(grid, videos, emptyMessage) {
  if (!videos.length) {
    gridMessage(grid, emptyMessage);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const video of videos) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "video-tile";
    button.dataset.videoId = video.id;

    const cover = document.createElement("span");
    cover.className = "video-tile-cover";
    cover.setAttribute("aria-hidden", "true");
    const fallback = document.createElement("span");
    fallback.className = "video-tile-placeholder";
    fallback.textContent = "▷";
    cover.append(fallback);

    const thumbnail = assetUrl(video.thumbnailUrl);
    if (thumbnail) {
      const image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", () => image.remove(), { once: true });
      image.src = thumbnail;
      cover.append(image);
    }

    const count = document.createElement("span");
    count.className = "video-tile-count";
    const total = linkedItems(video).length;
    count.textContent = total === 1 ? "1 item" : total + " items";
    cover.append(count);

    const title = document.createElement("span");
    title.className = "video-tile-title";
    title.textContent = video.title || "Untitled video";
    button.append(cover, title);
    fragment.append(button);
  }
  grid.replaceChildren(fragment);
}
