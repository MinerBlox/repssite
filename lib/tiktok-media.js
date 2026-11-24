export const tikwmOrigin = "https://www.tikwm.com";
const unknownLifetime = 15 * 60 * 1000;
const refreshBuffer = 60 * 1000;

function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value, tikwmOrigin);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url.href : "";
  } catch {
    return "";
  }
}

function expiry(value, now) {
  const url = new URL(value);
  // Signed TikTok MP4 routes put Unix seconds in hex after the path signature.
  const signedPath = /(?:^|\.)tiktokcdn(?:-[a-z]+)?\.com$/i.test(url.hostname)
    && url.pathname.match(/^\/[a-f\d]{32}\/([a-f\d]{8})\/video\//i);
  const deadlines = signedPath ? [parseInt(signedPath[1], 16) * 1000] : [];
  for (const key of ["x-expires", "Expires", "expires", "expire"]) {
    const seconds = url.searchParams.get(key);
    if (/^\d{10}$/.test(seconds)) deadlines.push(Number(seconds) * 1000);
  }
  return deadlines.length ? Math.min(...deadlines) : now + unknownLifetime;
}

export function normalizeTikTokMedia(key, data, now = Date.now()) {
  const images = Array.isArray(data?.images) ? data.images.map(safeUrl).filter(Boolean) : [];
  const isPhoto = new URL(key).pathname.includes("/photo/") || Boolean(data?.images?.length);
  const videoUrl = images.length || isPhoto ? "" : safeUrl(data?.hdplay) || safeUrl(data?.play);
  const links = videoUrl ? [videoUrl] : images;
  if (!links.length) return null;
  const expiresAt = Math.min(...links.map(url => expiry(url, now))) - refreshBuffer;
  return { videoUrl, images, expiresAt };
}

export function signedVideoKey(value) {
  const url = safeUrl(value);
  if (!url) return "";
  const parsed = new URL(url);
  if (!/(?:^|\.)tiktokcdn(?:-[a-z]+)?\.com$/i.test(parsed.hostname) || parsed.searchParams.has("video_id")) return "";
  return parsed.pathname.match(/^\/[a-f\d]{32}\/[a-f\d]{8}\/video\/tos\/[\w-]+\/[\w-]+\/([\w-]+)\/?$/i)?.[1] || "";
}

export function officialVideoKey(value) {
  const url = safeUrl(value);
  if (!url) return "";
  const parsed = new URL(url);
  const path = parsed.pathname.match(/\/video\/tos\/[\w-]+\/[\w-]+\/([\w-]+)(?:\/|$)/i)?.[1];
  return path || parsed.searchParams.get("video_id") || "";
}
