const ADMIN_UID = "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";

async function isAdmin(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !env.FIREBASE_WEB_API_KEY) return false;

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token })
    }
  );

  if (!response.ok) return false;
  const data = await response.json();
  return data.users?.[0]?.localId === ADMIN_UID;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ error: "Unauthorized" }, 401);
  if (!env.SERPER_API_KEY) return json({ error: "SERPER_API_KEY is not configured in Cloudflare Pages." }, 500);

  const url = new URL(request.url);
  const name = (url.searchParams.get("q") || "").trim();
  if (!name) return json({ error: "Missing product name." }, 400);

  const query = `${name} transparent background PNG product`;

  const response = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: {
      "X-API-KEY": env.SERPER_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ q: query, num: 15, gl: "us", hl: "en" })
  });

  if (!response.ok) {
    const text = await response.text();
    return json({ error: `Image search failed (${response.status}).`, details: text.slice(0, 300) }, 502);
  }

  const data = await response.json();
  const seen = new Set();
  const results = [];

  for (const item of data.images || []) {
    const imageUrl = item.imageUrl || item.image || "";
    const thumbnailUrl = item.thumbnailUrl || imageUrl;
    if (!/^https?:\/\//i.test(imageUrl) || seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    results.push({
      imageUrl,
      thumbnailUrl,
      title: item.title || name,
      source: item.source || "",
      link: item.link || ""
    });
    if (results.length === 5) break;
  }

  return json({ query, results });
}
