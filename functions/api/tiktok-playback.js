import { validateTikTokUrl } from "./tiktok-meta.js";
import { normalizeTikTokMedia, tikwmOrigin } from "../../lib/tiktok-media.js";

const firestore = "https://firestore.googleapis.com/v1/projects/reps-central/databases/(default)/documents/videos/";
const upstreamTimeout = 4200;
const prefix = "tiktok-playback/v1/";

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

async function getCache(bucket, key) {
  const object = await bucket.get(key);
  return object ? { etag: object.httpEtag, record: await object.json() } : {};
}

async function publishedVideo(id, source) {
  const uri = new URL(firestore + encodeURIComponent(id));
  for (const field of ["tiktokUrl", "isActive"]) uri.searchParams.append("mask.fieldPaths", field);
  const response = await fetch(uri.href, { signal: AbortSignal.timeout(3000), headers: { Accept: "application/json" } });
  if (!response.ok) return false;
  const { fields } = await response.json();
  return fields?.isActive?.booleanValue !== false && canonical(fields?.tiktokUrl?.stringValue) === source;
}

async function fetchProvider(url, options) {
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(3000),
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return { code: "http-" + response.status };
    const data = await response.json().catch(() => null);
    if (data?.code !== 0) return { code: data ? "provider-error" : "invalid-response" };
    return { data: data.data };
  } catch (error) {
    console.error("TikWM playback fetch failed", error);
    return { code: error?.name === "TimeoutError" ? "provider-timeout" : "request-failed" };
  }
}

async function fetchLink(source) {
  const url = tikwmOrigin + "/api/";
  const body = new URLSearchParams({ url: source, hd: "1" });
  const get = await fetchProvider(url + "?" + body);
  if (get.data) return { media: normalizeTikTokMedia(source, get.data) };
  if (get.code === "http-403" || get.code === "http-429") return get;
  const post = await fetchProvider(url, { method: "POST", body });
  return post.data ? { media: normalizeTikTokMedia(source, post.data) } : post;
}

function valid(record, source) {
  return record?.source === source && record.media?.expiresAt > Date.now();
}

async function waitForLink(bucket, key, source) {
  for (const delay of [100, 230, 450, 800]) {
    await new Promise(resolve => setTimeout(resolve, delay));
    const { record } = await getCache(bucket, key);
    if (valid(record, source)) return json(record.media);
    if (record?.source !== source || record.pendingUntil <= Date.now() || record.retryAt) break;
  }
  return json({ error: "Shared link is being refreshed." }, 503);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const source = canonical(url.searchParams.get("url"));
  const bucket = env.CATALOG_INDEX_BUCKET;
  if (!/^[\w-]{1,128}$/.test(id) || !source) return json({ error: "Invalid video." }, 400);
  if (!bucket) return json({ error: "Shared video storage is unavailable." }, 503);

  const key = prefix + id + ".json";
  let stage = "cache-read";
  try {
    const { etag, record } = await getCache(bucket, key);
    if (valid(record, source)) return json(record.media);
    if (record?.source === source && record.retryAt > Date.now()) {
      return json({ error: "Shared provider is temporarily unavailable." }, 503);
    }
    if (record?.source === source && record.pendingUntil > Date.now()) return waitForLink(bucket, key, source);
    stage = "video-verification";
    if (!(await publishedVideo(id, source))) return json({ error: "Published video not found." }, 404);
    stage = "refresh-lease";
    const lease = await bucket.put(key, JSON.stringify({ source, pendingUntil: Date.now() + 8000 }), {
      onlyIf: new Headers(etag ? { "If-Match": etag } : { "If-None-Match": "*" })
    });
    if (!lease) return waitForLink(bucket, key, source);

    const result = await fetchLink(source);
    const media = result.media;
    const entry = media?.expiresAt > Date.now()
      ? { source, media }
      : { source, retryAt: Date.now() + 30000 };
    stage = "cache-write";
    await bucket.put(key, JSON.stringify(entry), { onlyIf: new Headers({ "If-Match": lease.httpEtag }) });
    if (entry.media) return json(media);
    return json({ error: "Shared provider could not resolve video.", reason: result.code || "no-media" }, 502);
  } catch (error) {
    console.error("TikTok playback " + stage + " failed", error);
    return json({ error: "Shared video lookup failed.", reason: stage }, 502);
  }
}
