const CATALOG_KEY = "catalog/products.json";

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

async function readCatalog(bucket) {
  const object = await bucket.get(CATALOG_KEY);
  if (!object) return null;

  const parsed = JSON.parse(await object.text());
  const products = Array.isArray(parsed?.products) ? parsed.products : [];

  return {
    version: parsed?.version || null,
    generatedAt: parsed?.generatedAt || null,
    count: Number(parsed?.count || products.length),
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

  const url = new URL(request.url);
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
