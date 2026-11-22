import { isAdmin } from "./catalog-index.js";

const mediaPrefix = "video/";
const formats = { "video/mp4": "mp4", "video/webm": "webm" };
const limit = 90 * 1024 * 1024;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function onRequestPut({ request, env }) {
  if (!(await isAdmin(request))) return json({ error: "Admin sign-in required." }, 401);
  if (!env.VIDEO_MEDIA_BUCKET) return json({ error: "Set the VIDEO_MEDIA_BUCKET R2 binding before uploading files." }, 503);

  const type = (request.headers.get("content-type") || "").split(";")[0].toLowerCase();
  const extension = Object.hasOwn(formats, type) ? formats[type] : "";
  if (!extension) return json({ error: "Upload an MP4 or WebM video." }, 415);
  const length = Number(request.headers.get("content-length"));
  if (!request.body || !Number.isSafeInteger(length) || length <= 0) return json({ error: "A video file size is required." }, 411);
  if (length > limit) return json({ error: "Video files must be 90 MB or smaller." }, 413);

  const name = crypto.randomUUID() + "." + extension;
  try {
    await env.VIDEO_MEDIA_BUCKET.put(mediaPrefix + name, request.body, {
      httpMetadata: { contentType: type }
    });
    return json({ url: "/api/video-media?file=" + name }, 201);
  } catch {
    return json({ error: "The video file could not be stored. Try again." }, 502);
  }
}

function byteRange(value, size) {
  const parsed = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!parsed || (!parsed[1] && !parsed[2]) || !size) return null;
  if (!parsed[1]) {
    const length = Math.min(Number(parsed[2]), size);
    return length > 0 ? { offset: size - length, length } : null;
  }
  const offset = Number(parsed[1]);
  const end = parsed[2] ? Math.min(Number(parsed[2]), size - 1) : size - 1;
  return offset <= end ? { offset, length: end - offset + 1 } : null;
}

async function serveMedia({ request, env }, headOnly) {
  const name = new URL(request.url).searchParams.get("file") || "";
  if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}\.(?:mp4|webm)$/.test(name)) {
    return json({ error: "Video not found." }, 404);
  }
  const bucket = env.VIDEO_MEDIA_BUCKET;
  if (!bucket) return json({ error: "Video storage is unavailable." }, 503);
  const key = mediaPrefix + name;
  const metadata = await bucket.head(key);
  if (!metadata) return json({ error: "Video not found." }, 404);
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": metadata.httpMetadata?.contentType || "video/mp4",
    "Content-Length": String(metadata.size),
    "Cache-Control": "public, max-age=86400, immutable",
    "ETag": metadata.httpEtag,
    "X-Content-Type-Options": "nosniff"
  });
  if (headOnly) return new Response(null, { headers });

  const rangeHeader = request.headers.get("range");
  const useRange = rangeHeader && (!request.headers.has("if-range") || request.headers.get("if-range") === metadata.httpEtag);
  const range = useRange ? byteRange(rangeHeader, metadata.size) : null;
  if (useRange && !range) {
    headers.set("Content-Range", "bytes */" + metadata.size);
    headers.delete("Content-Length");
    return new Response(null, { status: 416, headers });
  }
  const file = await bucket.get(key, range ? { range } : undefined);
  if (!file) return json({ error: "Video not found." }, 404);
  if (range) {
    headers.set("Content-Range", "bytes " + range.offset + "-" + (range.offset + range.length - 1) + "/" + metadata.size);
    headers.set("Content-Length", String(range.length));
  }
  return new Response(file.body, { status: range ? 206 : 200, headers });
}

export const onRequestGet = context => serveMedia(context, false);
export const onRequestHead = context => serveMedia(context, true);
