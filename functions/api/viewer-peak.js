import { isAdmin } from "./catalog-index.js";

const key = "analytics/viewer-peak.json";
const headers = { "Cache-Control": "no-store" };
const reply = (data, status = 200) => Response.json(data, { status, headers });

async function readPeak(bucket) {
  const object = await bucket.get(key);
  return { etag: object?.httpEtag, peak: object ? await object.json() : { count: 0, recordedAt: null } };
}

export async function onRequest({ request, env }) {
  if (!["GET", "POST"].includes(request.method)) return reply({ error: "Method not allowed." }, 405);
  if (!(await isAdmin(request))) return reply({ error: "Admin sign-in required." }, 401);
  const bucket = env.CATALOG_INDEX_BUCKET;
  if (!bucket) return reply({ error: "Peak storage is unavailable." }, 503);

  try {
    if (request.method === "GET") return reply((await readPeak(bucket)).peak);
    const body = await request.json().catch(() => null);
    const count = body?.count;
    if (!Number.isSafeInteger(count) || count < 1) return reply({ error: "Invalid viewer count." }, 400);
    const history = Date.parse(body?.recordedAt);
    const recordedAt = Number.isFinite(history) && history <= Date.now() ? new Date(history).toISOString() : new Date().toISOString();
    for (let attempt = 0; attempt < 4; attempt++) {
      const { etag, peak } = await readPeak(bucket);
      if (count <= peak.count) return reply(peak);
      const next = { count, recordedAt };
      const stored = await bucket.put(key, JSON.stringify(next), {
        onlyIf: new Headers(etag ? { "If-Match": etag } : { "If-None-Match": "*" }),
        httpMetadata: { contentType: "application/json" }
      });
      if (stored) return reply(next);
    }
    return reply({ error: "Peak storage is busy." }, 409);
  } catch (error) {
    console.error("Viewer peak could not be loaded or saved", error);
    return reply({ error: "Viewer peak could not be loaded or saved." }, 502);
  }
}
