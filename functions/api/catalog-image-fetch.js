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

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

export async function onRequestPost({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  let target;
  try {
    target = new URL(String(body?.url || ""));
  } catch {
    return json({ error: "Invalid image URL." }, 400);
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return json({ error: "Unsupported URL protocol." }, 400);
  }

  const response = await fetch(target.toString(), {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
  });

  if (!response.ok) return json({ error: `Source image returned HTTP ${response.status}.` }, 502);

  const contentType = (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) {
    return json({ error: `Source did not return an image (${contentType || "unknown type"}).` }, 415);
  }

  const declaredLength = Number(response.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BYTES) return json({ error: "Image is too large." }, 413);

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) return json({ error: "Image is too large." }, 413);

  return json({
    contentType,
    base64: bytesToBase64(new Uint8Array(buffer))
  });
}
