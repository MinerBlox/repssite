const ADMIN_UID = "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";
const FIREBASE_PROJECT_ID = "reps-central";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const CATALOG_KEY = "catalog/products.json";
const ALLOWED_FIELDS = new Set(["homePopularRank", "isOurPick", "homeSummer", "homeAutumn", "homeWinter"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array([...binary].map(char => char.charCodeAt(0)));
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function verifyFirebaseIdToken(idToken) {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = decodeJsonPart(parts[0]);
    payload = decodeJsonPart(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID || payload.iss !== FIREBASE_ISSUER) return null;
  if (typeof payload.sub !== "string" || !payload.sub) return null;
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (typeof payload.iat !== "number" || payload.iat > now + 300) return null;

  let jwks;
  try {
    const response = await fetch(FIREBASE_JWKS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!response.ok) return null;
    jwks = await response.json();
  } catch {
    return null;
  }

  const jwk = jwks.keys?.find(key => key.kid === header.kid);
  if (!jwk) return null;

  try {
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = decodeBase64Url(parts[2]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, signedData);
    return valid ? payload : null;
  } catch {
    return null;
  }
}

async function isAdmin(request) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;
  const payload = await verifyFirebaseIdToken(token);
  return payload?.sub === ADMIN_UID || payload?.user_id === ADMIN_UID;
}

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request))) return json({ error: "Unauthorized" }, 401);
  if (!env.CATALOG_INDEX_BUCKET) return json({ error: "CATALOG_INDEX_BUCKET R2 binding is not configured." }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const patches = Array.isArray(body?.patches) ? body.patches : [];
  if (!patches.length) return json({ error: "patches must be a non-empty array." }, 400);

  const object = await env.CATALOG_INDEX_BUCKET.get(CATALOG_KEY);
  if (!object) return json({ error: "Full product catalog has not been generated yet." }, 404);

  const catalog = JSON.parse(await object.text());
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const byId = new Map(products.map(item => [String(item?.id || ""), item]));

  let changed = 0;
  for (const patch of patches) {
    const id = String(patch?.id || "").trim();
    const item = byId.get(id);
    if (!item) continue;
    for (const [field, value] of Object.entries(patch?.fields || {})) {
      if (!ALLOWED_FIELDS.has(field)) continue;
      if (value === null) delete item[field];
      else item[field] = value;
    }
    changed += 1;
  }

  catalog.version = Date.now();
  catalog.generatedAt = new Date().toISOString();
  catalog.count = products.length;

  await env.CATALOG_INDEX_BUCKET.put(CATALOG_KEY, JSON.stringify(catalog), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: "public, max-age=60, s-maxage=60"
    }
  });

  return json({ ok: true, changed, version: catalog.version, count: products.length });
}
