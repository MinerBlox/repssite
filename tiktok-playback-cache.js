import { normalizeTikTokMedia, tikwmOrigin } from "/lib/tiktok-media.js";

const storageKey = "rc-tiktok-media-v2";
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

function remember(key, entry, now = Date.now()) {
  const { expiresAt } = entry;
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
  const response = await fetch(tikwmOrigin + "/api/", {
    method: "POST",
    body: new URLSearchParams({ url: key, hd: "1" }),
    credentials: "omit",
    signal
  });
  if (!response.ok) return null;
  const result = await response.json();
  if (result.code !== 0) return null;
  const entry = normalizeTikTokMedia(key, result.data);
  return entry && remember(key, entry);
}

export async function lookupSharedTikTokMedia(id, key, signal) {
  try {
    const query = new URLSearchParams({ id, url: key });
    const response = await fetch("/api/tiktok-playback?" + query, { signal });
    if (response.ok) {
      const entry = await response.json();
      if (entry.expiresAt > Date.now() && (entry.videoUrl || entry.images?.length)) {
        return remember(key, { ...entry, shared: true });
      }
    }
  } catch (error) {
    if (signal.aborted) throw error;
  }
  const media = await lookupTikTokMedia(key, signal);
  if (media?.videoUrl) {
    void fetch("/api/tiktok-playback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, url: key, videoUrl: media.videoUrl }),
      keepalive: true
    }).catch(() => {});
  }
  return media;
}
