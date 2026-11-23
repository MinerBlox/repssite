const origin = "https://www.tikwm.com";
const storageKey = "rc-tiktok-media-v1";
const unknownLifetime = 15 * 60 * 1000;
const refreshBuffer = 60 * 1000;
const maxEntries = 32;
const memory = new Map();

export function mediaCacheKey(value) {
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  return url.href;
}

function readStorage() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "{}") || {};
  } catch {
    return {};
  }
}

export function readTikTokMedia(key, now = Date.now()) {
  const cached = memory.get(key);
  if (cached?.expiresAt > now) return cached;
  const stored = readStorage()[key];
  return stored?.expiresAt > now ? stored : null;
}

export function forgetTikTokMedia(key, entry) {
  if (memory.get(key)?.expiresAt === entry.expiresAt) memory.delete(key);
  try {
    const stored = readStorage();
    if (stored[key]?.expiresAt !== entry.expiresAt) return;
    delete stored[key];
    localStorage.setItem(storageKey, JSON.stringify(stored));
  } catch {}
}

function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value, origin);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url.href : "";
  } catch {
    return "";
  }
}

function expiry(value, now) {
  const url = new URL(value);
  for (const key of ["x-expires", "Expires", "expires", "expire"]) {
    const seconds = url.searchParams.get(key);
    if (/^\d{10}$/.test(seconds)) return Number(seconds) * 1000;
  }
  // Signed TikTok MP4 routes put Unix seconds in hex after the path signature.
  const signedPath = /(?:^|\.)tiktokcdn(?:-[a-z]+)?\.com$/i.test(url.hostname)
    && url.pathname.match(/^\/[a-f\d]{32}\/([a-f\d]{8})\/video\//i);
  return signedPath ? parseInt(signedPath[1], 16) * 1000 : now + unknownLifetime;
}

export function cacheTikTokMedia(key, data, now = Date.now()) {
  const images = Array.isArray(data?.images) ? data.images.map(safeUrl).filter(Boolean) : [];
  const isPhoto = new URL(key).pathname.includes("/photo/") || Boolean(data?.images?.length);
  const videoUrl = images.length || isPhoto ? "" : safeUrl(data?.hdplay) || safeUrl(data?.play);
  const links = videoUrl ? [videoUrl] : images;
  if (!links.length) return null;
  const expiresAt = Math.min(...links.map(url => expiry(url, now))) - refreshBuffer;
  const entry = { videoUrl, images, expiresAt };
  if (expiresAt <= now) return entry;

  memory.delete(key);
  memory.set(key, entry);
  if (memory.size > maxEntries) memory.delete(memory.keys().next().value);
  try {
    const stored = Object.entries(readStorage()).filter(([url, item]) => url !== key && item?.expiresAt > now);
    localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries([...stored.slice(-(maxEntries - 1)), [key, entry]])));
  } catch {}
  return entry;
}

export async function lookupTikTokMedia(key, signal) {
  const response = await fetch(origin + "/api/", {
    method: "POST",
    body: new URLSearchParams({ url: key, hd: "1" }),
    credentials: "omit",
    signal
  });
  if (!response.ok) return null;
  const result = await response.json();
  if (result.code !== 0) return null;
  return cacheTikTokMedia(key, result.data);
}
