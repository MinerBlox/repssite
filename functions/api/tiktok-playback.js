import { fetchTikTokAvcKeys, validateTikTokUrl } from "./tiktok-meta.js";
import { normalizeSharedSlideshow, normalizeTikTokMedia, signedVideoKey } from "../../lib/tiktok-media.js";

import { isAdmin } from "./catalog-index.js";

const firestore = "https://firestore.googleapis.com/v1/projects/reps-central/databases/(default)/documents/videos/";
const prefix = "tiktok-playback/v3/";
const renewWithin = 2 * 60 * 60 * 1000;

function canonical(value) {
  const validated = validateTikTokUrl(value);
  if (!validated) return "";
  const url = new URL(validated);
  url.search = "";
  return url.href;
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function input(id, value) {
  const source = typeof value === "string" && value.length <= 512 && canonical(value);
  return typeof id === "string" && /^[\w-]{1,128}$/.test(id) && source
    ? { source, key: prefix + id + ".json" }
    : null;
}

async function getCache(bucket, key) {
  const object = await bucket.get(key);
  return object ? { etag: object.httpEtag, record: await object.json() } : {};
}

function valid(record, source) {
  return record?.source === source && record.media?.expiresAt > Date.now();
}

async function publishedVideo(id, source) {
  const uri = new URL(firestore + encodeURIComponent(id));
  for (const field of ["tiktokUrl", "isActive"]) uri.searchParams.append("mask.fieldPaths", field);
  const response = await fetch(uri.href, { signal: AbortSignal.timeout(3000), headers: { Accept: "application/json" } });
  if (!response.ok) return false;
  const { fields } = await response.json();
  return fields?.isActive?.booleanValue !== false && canonical(fields?.tiktokUrl?.stringValue) === source;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const post = input(url.searchParams.get("id"), url.searchParams.get("url"));
  if (!post) return json({ error: "Invalid video." }, 400);
  if (!env.CATALOG_INDEX_BUCKET) return json({ error: "Shared video storage is unavailable." }, 503);

  try {
    const { record } = await getCache(env.CATALOG_INDEX_BUCKET, post.key);
    return valid(record, post.source) ? json(record.media) : json({ error: "No current shared link." }, 404);
  } catch (error) {
    console.error("Shared TikTok cache read failed", error);
    return json({ error: "Shared video lookup failed." }, 502);
  }
}

export async function onRequestPost({ request, env }) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return json({ error: "Same-origin request required." }, 403);
  }
  if (Number(request.headers.get("Content-Length")) > 98304) return json({ error: "Request too large." }, 413);
  const raw = await request.text();
  if (raw.length > 98304) return json({ error: "Request too large." }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid request." }, 400); }

  const bucket = env.CATALOG_INDEX_BUCKET;
  const post = input(body?.id, body?.url);
  const mediaKey = signedVideoKey(body?.videoUrl);
  const isSlideshow = Array.isArray(body?.slideshow?.images);
  if (!post || (!mediaKey && !isSlideshow)) return json({ error: "Invalid video link." }, 400);
  if (isSlideshow && !(await isAdmin(request))) return json({ error: "Admin sign-in required." }, 401);
  if (!bucket) return json({ error: "Shared video storage is unavailable." }, 503);

  const { source, key } = post;
  const media = isSlideshow ? normalizeSharedSlideshow(source, body.slideshow) : normalizeTikTokMedia(source, { play: body.videoUrl });
  if (!media || media.expiresAt <= Date.now()) return json({ error: "Video link expired." }, 400);
  let stage = "cache-read";
  try {
    const { etag, record } = await getCache(bucket, key);
    if (valid(record, source) && (body.renew !== true || record.media.expiresAt > Date.now() + renewWithin ||
        media.expiresAt <= record.media.expiresAt)) return json(record.media);
    stage = "published-record";
    if (!(await publishedVideo(body.id, source))) return json({ error: "Published video not found." }, 404);
    stage = "post-media-verification";
    if (!isSlideshow && !(await fetchTikTokAvcKeys(source)).has(mediaKey)) {
      return json({ error: "The media link is not a verified H.264 version of the public TikTok post." }, 422);
    }
    stage = "cdn-verification";
    if (!isSlideshow) {
      const check = await fetch(media.videoUrl, { method: "HEAD", signal: AbortSignal.timeout(3500) });
      if (!check.ok || signedVideoKey(check.url || media.videoUrl) !== mediaKey ||
          !(check.headers.get("content-type") || "").startsWith("video/")) {
        return json({ error: "The media link is not currently playable." }, 422);
      }
    }
    stage = "cache-write";
    const stored = await bucket.put(key, JSON.stringify({ source, media }), {
      onlyIf: new Headers(etag ? { "If-Match": etag } : { "If-None-Match": "*" })
    });
    if (!stored) {
      const { record: latest } = await getCache(bucket, key);
      if (valid(latest, source)) return json(latest.media);
      return json({ error: "Shared link changed during verification." }, 409);
    }
    return json(media, 201);
  } catch (error) {
    console.error("Shared TikTok " + stage + " failed", error);
    return json({ error: "Shared video could not be verified.", reason: stage }, 502);
  }
}
