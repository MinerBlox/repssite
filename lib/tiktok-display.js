const sessionKey = "private/tiktok-session.json";
const lockKey = "private/tiktok-session.lock";
const api = "https://open.tiktokapis.com/v2";

async function seedFingerprint(token) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function getSession(bucket, seed) {
  const object = await bucket.get(sessionKey);
  if (!object) return null;
  const value = await object.json();
  return value.seed === seed ? value : null;
}

async function refreshSession(env) {
  const bucket = env.VIDEO_MEDIA_BUCKET;
  const seed = await seedFingerprint(env.TIKTOK_REFRESH_TOKEN);
  let session = await getSession(bucket, seed);
  if (session?.expiresAt > Date.now() + 60_000) return session.accessToken;

  const oldLock = await bucket.head(lockKey);
  if (oldLock && Date.now() - oldLock.uploaded.getTime() < 120_000) {
    throw new Error("TikTok is reconnecting. Try again shortly.");
  }
  const lock = await bucket.put(lockKey, crypto.randomUUID(), {
    onlyIf: new Headers(oldLock ? { "If-Match": oldLock.httpEtag } : { "If-None-Match": "*" })
  });
  if (!lock) throw new Error("TikTok is reconnecting. Try again shortly.");

  try {
    session = await getSession(bucket, seed);
    if (session?.expiresAt > Date.now() + 60_000) return session.accessToken;
    const response = await fetch(api + "/oauth/token/", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({
        client_key: env.TIKTOK_CLIENT_KEY,
        client_secret: env.TIKTOK_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: session?.refreshToken || env.TIKTOK_REFRESH_TOKEN
      })
    });
    const token = await response.json().catch(() => ({}));
    if (!response.ok || !token.access_token || !token.refresh_token || !(Number(token.expires_in) > 0)) {
      throw new Error("TikTok authorization could not be renewed. Check your TikTok app and refresh token.");
    }
    if (token.scope && !token.scope.split(",").map(scope => scope.trim()).includes("video.list")) {
      throw new Error("Authorize the TikTok app with video.list.");
    }

    await bucket.put(sessionKey, JSON.stringify({
      seed, accessToken: token.access_token, refreshToken: token.refresh_token,
      expiresAt: Date.now() + Number(token.expires_in) * 1000
    }), { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
    return token.access_token;
  } finally {
    await bucket.delete(lockKey);
  }
}

function normalize(post) {
  const id = String(post?.id || "");
  if (!/^\d+$/.test(id) || typeof post.share_url !== "string") return null;
  return {
    id,
    tiktokUrl: post.share_url,
    suggestedTitle: typeof post.title === "string" ? post.title : "",
    caption: typeof post.video_description === "string" ? post.video_description : "",
    thumbnailUrl: typeof post.cover_image_url === "string" ? post.cover_image_url : "",
    postedAt: Number(post.create_time) || 0
  };
}

export function tiktokConfigured(env) {
  return Boolean(env.VIDEO_MEDIA_BUCKET && env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET && env.TIKTOK_REFRESH_TOKEN);
}

export async function listTikTokVideos(env) {
  const accessToken = await refreshSession(env);
  const fields = "id,title,share_url,video_description,cover_image_url,create_time";
  const response = await fetch(api + "/video/list/?fields=" + fields, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: { "Authorization": "Bearer " + accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ max_count: 20 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.data?.videos)) {
    throw new Error("TikTok could not list videos. Check the creator authorization and video.list scope.");
  }
  const cutoff = env.TIKTOK_IMPORT_AFTER ? Date.parse(env.TIKTOK_IMPORT_AFTER) / 1000 : 0;
  if (!Number.isFinite(cutoff)) throw new Error("TikTok import cutoff must be an ISO date and time.");
  return data.data.videos.map(normalize).filter(post => post && (!cutoff || post.postedAt >= cutoff));
}
