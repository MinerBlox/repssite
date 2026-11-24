import { isAdmin } from "./catalog-index.js";

const CATALOG_KEY = "catalog/products.json";
const CHANGES_KEY = "catalog/admin-changes.json";

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

async function readChanges(bucket) {
  const object = await bucket.get(CHANGES_KEY);
  return { etag: object?.httpEtag, changes: object ? await object.json() : {} };
}

function applicableChanges(changes, cutoff) {
  return Object.entries(changes).filter(([, entry]) => entry.updatedAt > cutoff);
}

async function readCatalog(bucket) {
  const [object, { changes }] = await Promise.all([bucket.get(CATALOG_KEY), readChanges(bucket)]);
  if (!object) return null;

  const parsed = JSON.parse(await object.text());
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
  const ids = url.searchParams.getAll("ids");
  if (ids.length > 50 || ids.some(id => !id || id.length > 256)) {
    return json({ error: "Request up to 50 valid product IDs." }, 400, { "Cache-Control": "no-store" });
  }

  let catalog;
  try {
    catalog = await readCatalog(env.CATALOG_INDEX_BUCKET);
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

  const base = await bucket.head(CATALOG_KEY);
  if (!base) return json({ error: "Catalogue cache has not been generated yet." }, 503, noCache);
  // The writer publishes this metadata with the snapshot, so mutations avoid downloading the full catalogue.
  const cutoff = Date.parse(base.customMetadata?.snapshotstartedat || "") || 0;
  if (updatedAt <= cutoff) return json({ ok: true }, 200, noCache);

  for (let attempt = 0; attempt < 5; attempt++) {
    const { etag, changes } = await readChanges(bucket);
    const entries = new Map(applicableChanges(changes, cutoff));
    if (entries.get(id)?.updatedAt > updatedAt) return json({ ok: true }, 200, noCache);
    entries.set(id, { product, updatedAt });
    const stored = await bucket.put(CHANGES_KEY, JSON.stringify(Object.fromEntries(entries)), {
      onlyIf: new Headers(etag ? { "If-Match": etag } : { "If-None-Match": "*" }),
      httpMetadata: { contentType: "application/json" }
    });
    if (stored) return json({ ok: true }, 200, noCache);
  }
  return json({ error: "Catalogue cache is busy. Retry sync." }, 409, noCache);
}
