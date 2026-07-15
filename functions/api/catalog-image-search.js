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
  if (!env.SERPER_API_KEY) {
    return json({ error: "SERPER_API_KEY is not configured in Cloudflare Pages." }, 500);
  }

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
