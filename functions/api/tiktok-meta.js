const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(parseInt(number, 10)))
    .trim();
}

function validateTikTokUrl(input) {
  let parsed;

  try {
    parsed = new URL(String(input || "").trim());
  } catch {
    return null;
  }

  if (!/^https?:$/.test(parsed.protocol)) return null;

  const hostname = parsed.hostname.toLowerCase();
  const allowed = hostname === "tiktok.com" || hostname.endsWith(".tiktok.com");
  if (!allowed) return null;

  return parsed.toString();
}

function extractMeta(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }

  return "";
}

function cleanCaption(value) {
  return decodeHtml(value)
    .replace(/^TikTok - Make Your Day\s*/i, "")
    .replace(/^Watch.*?on TikTok\s*/i, "")
    .trim();
}

async function fetchOEmbed(tiktokUrl) {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(tiktokUrl)}`;
  const response = await fetch(endpoint, {
    headers: {
      "accept": "application/json",
      "user-agent": "Mozilla/5.0 RepsCentralBot/1.0"
    }
  });

  if (!response.ok) throw new Error(`TikTok oEmbed returned ${response.status}`);

  const data = await response.json();

  return {
    source: "oembed",
    caption: cleanCaption(data.title || ""),
    title: cleanCaption(data.title || ""),
    thumbnailUrl: data.thumbnail_url || "",
    authorName: data.author_name || "",
    authorUrl: data.author_url || "",
    embedHtml: data.html || ""
  };
}

async function fetchHtmlMeta(tiktokUrl) {
  const response = await fetch(tiktokUrl, {
    redirect: "follow",
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-GB,en;q=0.9",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    }
  });

  if (!response.ok) throw new Error(`TikTok page returned ${response.status}`);

  const html = await response.text();

  const ogTitle = extractMeta(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["'][^>]*>/i,
    /<title[^>]*>(.*?)<\/title>/is
  ]);

  const ogDescription = extractMeta(html, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["'][^>]*>/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i
  ]);

  const thumbnailUrl = extractMeta(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']twitter:image["'][^>]*>/i
  ]);

  const authorName = extractMeta(html, [
    /<meta[^>]+name=["']author["'][^>]+content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']author["'][^>]*>/i
  ]);

  return {
    source: "html",
    caption: cleanCaption(ogDescription || ogTitle || ""),
    title: cleanCaption(ogTitle || ogDescription || ""),
    thumbnailUrl,
    authorName,
    authorUrl: "",
    embedHtml: ""
  };
}

async function readUrl(request) {
  if (request.method === "GET") {
    const url = new URL(request.url);
    return url.searchParams.get("url");
  }

  const body = await request.json().catch(() => ({}));
  return body.url;
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  if (!["GET", "POST"].includes(request.method)) {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }

  const rawUrl = await readUrl(request);
  const tiktokUrl = validateTikTokUrl(rawUrl);

  if (!tiktokUrl) {
    return json({ ok: false, error: "Paste a valid TikTok URL." }, 400);
  }

  const attempts = [];

  for (const fetcher of [fetchOEmbed, fetchHtmlMeta]) {
    try {
      const meta = await fetcher(tiktokUrl);

      if (meta.caption || meta.thumbnailUrl || meta.authorName) {
        return json({
          ok: true,
          url: tiktokUrl,
          ...meta
        });
      }

      attempts.push(`${meta.source}: no usable metadata`);
    } catch (error) {
      attempts.push(error.message || "metadata fetch failed");
    }
  }

  return json({
    ok: false,
    url: tiktokUrl,
    error: "Could not fetch TikTok metadata. Paste the caption manually.",
    attempts
  }, 502);
}
