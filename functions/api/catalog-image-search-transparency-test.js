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
  if (!env.SERPER_API_KEY) return json({ error: "SERPER_API_KEY is not configured." }, 500);

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  if (!query) return json({ error: "Missing product name." }, 400);

  const response = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: {
      "X-API-KEY": env.SERPER_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ q: query, num: 15, gl: "us", hl: "en", tbs: "ic:trans" })
  });

  if (!response.ok) return json({ error: `Image search failed (${response.status}).` }, 502);

  const data = await response.json();
  const seen = new Set();
  const results = [];

  for (const item of data.images || []) {
    const imageUrl = item.imageUrl || item.image || "";
    if (!/^https?:\/\//i.test(imageUrl) || seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    results.push({ imageUrl, thumbnailUrl: item.thumbnailUrl || imageUrl, title: item.title || query, source: item.source || "", link: item.link || "" });
    if (results.length === 5) break;
  }

  return json({ query, filter: "ic:trans", results });
}
