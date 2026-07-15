const ADMIN_UID = "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";
const MAX_BYTES = 12 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function isAdmin(request, env) {
  const header = request.headers.get("Authorization") || "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken || !env.FIREBASE_WEB_API_KEY) return false;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_WEB_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });
  if (!response.ok) return false;
  const data = await response.json();
  return data.users?.[0]?.localId === ADMIN_UID;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ error: "Unauthorized" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }

  let target;
  try { target = new URL(String(body?.url || "")); } catch { return json({ error: "Invalid image URL." }, 400); }
  if (!["http:", "https:"].includes(target.protocol)) return json({ error: "Unsupported URL protocol." }, 400);

  const response = await fetch(target.toString(), {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" }
  });
  if (!response.ok) return json({ error: `Source image returned HTTP ${response.status}.` }, 502);

  const contentType = (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) return json({ error: `Source did not return an image (${contentType || "unknown type"}).` }, 415);

  const declaredLength = Number(response.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BYTES) return json({ error: "Image is too large." }, 413);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) return json({ error: "Image is too large." }, 413);

  return json({ contentType, base64: bytesToBase64(new Uint8Array(buffer)) });
}
