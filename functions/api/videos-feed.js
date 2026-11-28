import { isAdmin } from "./catalog-index.js";

const feedKey = "catalog/public-videos-feed.json";
const lifetime = 60 * 60 * 1000;
const base = "https://firestore.googleapis.com/v1/projects/reps-central/databases/(default)/documents/videos";
const fields = ["isActive", "title", "caption", "thumbnailUrl", "tiktokUrl", "mediaUrl", "sortOrder", "createdAt", "itemIds", "items"];
const headers = { "Cache-Control": "no-store" };
const json = (data, status = 200) => Response.json(data, { status, headers });

function decode(field) {
  if ("stringValue" in field) return field.stringValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return field.doubleValue;
  if ("timestampValue" in field) {
    const value = field.timestampValue;
    return {
      seconds: Math.floor(Date.parse(value) / 1000),
      nanoseconds: Number((value.match(/\.(\d+)/)?.[1] || "").padEnd(9, "0"))
    };
  }
  if ("arrayValue" in field) return (field.arrayValue.values || []).map(decode);
  if ("mapValue" in field) return decodeFields(field.mapValue.fields);
  return null;
}

function decodeFields(values = {}) {
  return Object.fromEntries(Object.entries(values).map(([field, value]) => [field, decode(value)]));
}

async function readFeed(bucket) {
  const object = await bucket.get(feedKey);
  return { etag: object?.httpEtag, value: object ? await object.json() : null };
}

function writeFeed(bucket, etag, value) {
  return bucket.put(feedKey, JSON.stringify(value), {
    onlyIf: new Headers(etag ? { "If-Match": etag } : { "If-None-Match": "*" }),
    httpMetadata: { contentType: "application/json" }
  });
}

async function loadFirestore() {
  let pageToken = "";
  const videos = [];
  do {
    const url = new URL(base);
    url.searchParams.set("pageSize", "200");
    for (const field of fields) url.searchParams.append("mask.fieldPaths", field);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url.href, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error("Firestore video feed returned HTTP " + response.status);
    const page = await response.json();
    for (const entry of page.documents || []) {
      const video = decodeFields(entry.fields);
      if (video.isActive !== false) videos.push({ ...video, id: entry.name.split("/").pop() });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return videos;
}

async function whenRefreshed(bucket) {
  for (const delay of [100, 250, 500, 900, 1500]) {
    await new Promise(resolve => setTimeout(resolve, delay));
    const { value } = await readFeed(bucket);
    if (Array.isArray(value?.videos)) return json({ videos: value.videos });
    if (!(value?.refreshUntil > Date.now())) break;
  }
  return json({ error: "The video feed is refreshing." }, 503);
}

export async function onRequestGet({ env }) {
  const bucket = env.CATALOG_INDEX_BUCKET;
  if (!bucket) return json({ error: "Video storage unavailable." }, 503);
  try {
    const { etag, value } = await readFeed(bucket);
    if (value?.expiresAt > Date.now() && Array.isArray(value.videos)) return json({ videos: value.videos });
    if (value?.refreshUntil > Date.now()) return await whenRefreshed(bucket);
    const lease = await writeFeed(bucket, etag, { refreshUntil: Date.now() + 15000 });
    if (!lease) return await whenRefreshed(bucket);
    const videos = await loadFirestore();
    if (!(await writeFeed(bucket, lease.httpEtag, { videos, expiresAt: Date.now() + lifetime }))) {
      // An admin saved while the snapshot was loading.
      return json({ error: "The video feed changed during refresh." }, 503);
    }
    return json({ videos });
  } catch (error) {
    console.error("Video feed refresh failed", error);
    return json({ error: "The video feed could not be loaded." }, 502);
  }
}

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request))) return json({ error: "Admin sign-in required." }, 401);
  if (!env.CATALOG_INDEX_BUCKET) return json({ error: "Video storage unavailable." }, 503);
  await env.CATALOG_INDEX_BUCKET.put(feedKey, "{}");
  return json({ ok: true });
}
