import { isAdmin } from "./catalog-index.js";

const types = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
const maxSize = 10 * 1024 * 1024;
const prefix = "catalog/admin-images/";

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request))) return Response.json({ error: "Admin sign-in required." }, { status: 401 });
  if (!env.CATALOG_INDEX_BUCKET) return Response.json({ error: "Image storage is unavailable." }, { status: 503 });
  const type = request.headers.get("Content-Type");
  if (!Object.hasOwn(types, type)) return Response.json({ error: "Unsupported image type." }, { status: 415 });
  const size = Number(request.headers.get("Content-Length"));
  if (!Number.isSafeInteger(size) || size <= 0 || size > maxSize) {
    return Response.json({ error: "Choose an image up to 10 MB." }, { status: 413 });
  }
  const name = crypto.randomUUID() + "." + types[type];
  await env.CATALOG_INDEX_BUCKET.put(prefix + name, request.body, { httpMetadata: { contentType: type } });
  return Response.json({ url: "/api/catalog-item-image?file=" + name }, { status: 201 });
}

export async function onRequestGet({ request, env }) {
  const name = new URL(request.url).searchParams.get("file") || "";
  if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}\.(jpg|png|webp|gif|avif)$/.test(name)) {
    return new Response(null, { status: 404 });
  }
  const file = await env.CATALOG_INDEX_BUCKET?.get(prefix + name);
  if (!file) return new Response(null, { status: 404 });
  const headers = new Headers({ "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
  file.writeHttpMetadata(headers);
  return new Response(file.body, { headers });
}
