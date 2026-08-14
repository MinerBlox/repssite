const ADMIN_UID = "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";
const FIREBASE_PROJECT_ID = "reps-central";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
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

  let header;
  let payload;
  try {
    header = decodeJsonPart(parts[0]);
    payload = decodeJsonPart(parts[1]);
  } catch {
    return null;
  }

  if (header.alg !== "RS256" || !header.kid) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID) return null;
  if (payload.iss !== FIREBASE_ISSUER) return null;
  if (typeof payload.sub !== "string" || !payload.sub) return null;
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (typeof payload.iat !== "number" || payload.iat > now + 300) return null;

  let jwks;
  try {
    const response = await fetch(FIREBASE_JWKS_URL, {
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
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
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      signature,
      signedData
    );
    return valid ? payload : null;
  } catch {
    return null;
  }
}

async function isAdmin(request) {
  const header = request.headers.get("Authorization") || "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return false;
  const payload = await verifyFirebaseIdToken(idToken);
  return payload?.sub === ADMIN_UID || payload?.user_id === ADMIN_UID;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata.google.internal") return true;
  if (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;

  const parts = host.split(".");
  if (parts.length === 4 && parts.every(part => /^\d+$/.test(part))) {
    const octets = parts.map(Number);
    if (octets.some(value => value < 0 || value > 255)) return true;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
  }

  return false;
}

function validateExternalUrl(input) {
  let parsed;
  try {
    parsed = new URL(String(input || ""));
  } catch {
    throw new Error("Invalid image URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported URL protocol.");
  if (parsed.username || parsed.password) throw new Error("Credentialed URLs are not allowed.");
  if (isBlockedHostname(parsed.hostname)) throw new Error("Private or local network URLs are not allowed.");
  return parsed;
}

async function safeImageFetch(initialUrl) {
  let target = validateExternalUrl(initialUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(target.toString(), {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount === MAX_REDIRECTS) throw new Error("Too many redirects.");
      const location = response.headers.get("Location");
      if (!location) throw new Error("Redirect response did not include a destination.");
      target = validateExternalUrl(new URL(location, target).toString());
      continue;
    }

    return response;
  }

  throw new Error("Too many redirects.");
}

export async function onRequestPost({ request }) {
  if (!(await isAdmin(request))) return json({ error: "Unauthorized" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }

  let response;
  try {
    response = await safeImageFetch(body?.url);
  } catch (error) {
    return json({ error: error.message || "Could not fetch image." }, 400);
  }

  if (!response.ok) return json({ error: `Source image returned HTTP ${response.status}.` }, 502);

  const contentType = (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) return json({ error: `Source did not return an image (${contentType || "unknown type"}).` }, 415);

  const declaredLength = Number(response.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BYTES) return json({ error: "Image is too large." }, 413);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) return json({ error: "Image is too large." }, 413);

  return json({ contentType, base64: bytesToBase64(new Uint8Array(buffer)) });
}
