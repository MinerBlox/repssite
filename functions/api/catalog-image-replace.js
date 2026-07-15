const ADMIN_UID = "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";
const FIREBASE_PROJECT_ID = "reps-central";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const REPO = "MinerBlox/repssite";
const BRANCH = "dev";

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

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request))) return json({ error: "Unauthorized" }, 401);
  if (!env.GITHUB_TOKEN) return json({ error: "GITHUB_TOKEN is not configured in Cloudflare Pages." }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const path = String(body?.path || "").trim();
  const content = String(body?.base64 || "").trim();
  if (!path.startsWith("liveproductimages/") || path.includes("..")) {
    return json({ error: "Invalid GitHub image path." }, 400);
  }
  if (!content) return json({ error: "Missing image content." }, 400);

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${encodedPath}`;
  const headers = {
    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "RepsCentral-Catalog-Editor"
  };

  const existingResponse = await fetch(`${apiUrl}?ref=${encodeURIComponent(BRANCH)}`, { headers });
  if (!existingResponse.ok) {
    return json({ error: `Could not read existing GitHub image (${existingResponse.status}).` }, 502);
  }
  const existing = await existingResponse.json();

  const updateResponse = await fetch(apiUrl, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Replace catalog image ${path.split("/").pop()}`,
      content,
      sha: existing.sha,
      branch: BRANCH
    })
  });

  if (!updateResponse.ok) {
    const error = await updateResponse.json().catch(() => ({}));
    return json({ error: error.message || `GitHub update failed (${updateResponse.status}).` }, 502);
  }

  const updated = await updateResponse.json();
  return json({ ok: true, commit: updated.commit?.sha || "" });
}
