import { isAdmin } from "./catalog-index.js";

const albums = {
  spreadsheet: { snapshot: "catalog/products.json", changes: "catalog/admin-changes.json" },
  video: { snapshot: "catalog/video-products.json", changes: "catalog/video-admin-changes.json" }
};
const INTERACTIONS_KEY = "catalog/interactions.json";

function selectAlbum(request) {
  const name = new URL(request.url).searchParams.get("album") || "spreadsheet";
  return Object.hasOwn(albums, name) ? albums[name] : null;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readChanges(bucket, album) {
  const object = await bucket.get(album.changes);
  return { etag: object?.httpEtag, changes: object ? await object.json() : {} };
}

function applicableChanges(changes, cutoff) {
  return Object.entries(changes).filter(([, entry]) => entry.updatedAt > cutoff);
}

async function readCatalog(bucket, album) {
  const [object, { changes }] = await Promise.all([bucket.get(album.snapshot), readChanges(bucket, album)]);
  if (!object && album === albums.spreadsheet) return null;

  const parsed = object ? await object.json() : {};
  let products = Array.isArray(parsed?.products) ? parsed.products : [];
  const cutoff = Date.parse(parsed.snapshotStartedAt || parsed.generatedAt) || 0;
  const applicable = applicableChanges(changes, cutoff);
  if (applicable.length) {
    const byId = new Map(products.map(item => [item.id, item]));
    for (const [id, entry] of applicable) {
      if (entry.product) {
        const before = byId.get(id);
        if ((Date.parse(before?.updatedAt) || 0) > entry.updatedAt) continue;
        byId.set(id, { ...before, ...entry.product, id, updatedAt: new Date(entry.updatedAt).toISOString() });
      } else {
        byId.delete(id);
      }
    }
    products = [...byId.values()].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  }

  return {
    version: parsed?.version || null,
    generatedAt: parsed?.generatedAt || null,
    count: products.length,
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    products
  };
}

export async function onRequestGet({ request, env }) {
  if (!env.CATALOG_INDEX_BUCKET) {
    return json(
      { error: "CATALOG_INDEX_BUCKET R2 binding is not configured." },
      503,
      { "Cache-Control": "no-store" }
    );
  }

  const url = new URL(request.url);
  if (url.searchParams.get("metrics") === "interactions") {
    const headers = { "Cache-Control": "no-store" };
    if (!(await isAdmin(request))) return json({ error: "Admin sign-in required." }, 401, headers);
    const metrics = await env.CATALOG_INDEX_BUCKET.get(INTERACTIONS_KEY);
    return metrics ? json(await metrics.json(), 200, headers) :
      json({ error: "Run Build Product Cache to export interaction totals." }, 404, headers);
  }

  const album = selectAlbum(request);
  if (!album) return json({ error: "Unknown catalogue." }, 400, { "Cache-Control": "no-store" });
  const ids = url.searchParams.getAll("ids");
  if (ids.length > 50 || ids.some(id => !id || id.length > 256)) {
    return json({ error: "Request up to 50 valid product IDs." }, 400, { "Cache-Control": "no-store" });
  }

  let catalog;
  try {
    catalog = await readCatalog(env.CATALOG_INDEX_BUCKET, album);
  } catch (error) {
    return json(
      { error: "Catalog cache could not be read.", detail: String(error?.message || error) },
      500,
      { "Cache-Control": "no-store" }
    );
  }

  if (!catalog) {
    return json(
      { error: "Full product catalog has not been generated yet." },
      404,
      { "Cache-Control": "no-store" }
    );
  }

  if (ids.length) {
    const requestedIds = new Set(ids);
    const products = catalog.products.filter(item => requestedIds.has(String(item?.id || "")));
    return json(
      { products, generatedAt: catalog.generatedAt, version: catalog.version },
      200,
      { "Cache-Control": "public, max-age=300, s-maxage=900" }
    );
  }

  const requested = String(url.searchParams.get("id") || "").trim();

  if (requested) {
    const direct = catalog.products.find(item => String(item?.id || "") === requested);
    const product = direct || catalog.products.find(item => slugify(item?.name) === requested);

    if (!product) {
      return json(
        { error: "Product not found." },
        404,
        { "Cache-Control": "public, max-age=300, s-maxage=3600" }
      );
    }

    return json(
      { product, generatedAt: catalog.generatedAt, version: catalog.version },
      200,
      { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600" }
    );
  }

  return json(
    catalog,
    200,
    { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600" }
  );
}

export async function onRequestPost({ request, env }) {
  const noCache = { "Cache-Control": "no-store" };
  if (!(await isAdmin(request))) return json({ error: "Admin sign-in required." }, 401, noCache);
  const bucket = env.CATALOG_INDEX_BUCKET;
  if (!bucket) return json({ error: "Catalogue cache is unavailable." }, 503, noCache);
  const album = selectAlbum(request);
  if (!album) return json({ error: "Unknown catalogue." }, 400, noCache);
  const raw = await request.text();
  if (raw.length > 32768) return json({ error: "Item exceeds the cache request limit." }, 413, noCache);
  let data;
  try { data = JSON.parse(raw); } catch { return json({ error: "Invalid JSON." }, 400, noCache); }
  const { id, product } = data || {};
  const updatedAt = Number(data?.updatedAt);
  if (typeof id !== "string" || !id || id.length > 256 || id.includes("/") ||
      !(product === null || product && typeof product === "object" && !Array.isArray(product)) ||
      !Number.isSafeInteger(updatedAt) || updatedAt <= 0 || updatedAt > Date.now() + 60000) {
    return json({ error: "Invalid catalogue change." }, 400, noCache);
  }

  const base = await bucket.head(album.snapshot);
  if (!base && album === albums.spreadsheet) {
    return json({ error: "Catalogue cache has not been generated yet." }, 503, noCache);
  }
  // The writer publishes this metadata with the snapshot, so mutations avoid downloading the full catalogue.
  const cutoff = Date.parse(base?.customMetadata?.snapshotstartedat || "") || 0;
  if (updatedAt <= cutoff) return json({ ok: true }, 200, noCache);

  for (let attempt = 0; attempt < 5; attempt++) {
    const { etag, changes } = await readChanges(bucket, album);
    const entries = new Map(applicableChanges(changes, cutoff));
    if (entries.get(id)?.updatedAt > updatedAt) return json({ ok: true }, 200, noCache);
    entries.set(id, { product, updatedAt });
    const stored = await bucket.put(album.changes, JSON.stringify(Object.fromEntries(entries)), {
      onlyIf: new Headers(etag ? { "If-Match": etag } : { "If-None-Match": "*" }),
      httpMetadata: { contentType: "application/json" }
    });
    if (stored) return json({ ok: true }, 200, noCache);
  }
  return json({ error: "Catalogue cache is busy. Retry sync." }, 409, noCache);
}
