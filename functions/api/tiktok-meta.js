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
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => decodeCodePoint(match, parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (match, number) => decodeCodePoint(match, Number(number)))
    .trim();
}

function decodeCodePoint(original, codePoint) {
  return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : original;
}

function validateTikTokUrl(input, base) {
  let parsed;

  try {
    parsed = new URL(String(input || "").trim(), base);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" || parsed.port || parsed.username || parsed.password) return null;

  const shortHost = ["vm.tiktok.com", "vt.tiktok.com"].includes(parsed.hostname);
  const postHost = ["www.tiktok.com", "m.tiktok.com", "tiktok.com"].includes(parsed.hostname);
  const postPath = /^\/@[^/]+\/(?:video|photo)\/\d+\/?$/i;
  const shortPath = /^\/[a-z\d]+\/?$/i;
  const sharePath = /^\/t\/[a-z\d]+\/?$/i;
  if (!(shortHost && shortPath.test(parsed.pathname)) &&
      !(postHost && (postPath.test(parsed.pathname) || sharePath.test(parsed.pathname)))) return null;

  parsed.hash = "";
  return parsed.href;
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
    redirect: "error",
    signal: AbortSignal.timeout(7000),
    headers: {
      "accept": "application/json",
      "user-agent": "Mozilla/5.0 RepsCentralBot/1.0"
    }
  });

  if (!response.ok) throw new Error(`TikTok oEmbed returned ${response.status}`);

  const data = await response.json();

  return {
    source: "oembed",
    caption: typeof data.title === "string" ? data.title.trim() : "",
    title: typeof data.title === "string" ? data.title.trim() : "",
    thumbnailUrl: data.thumbnail_url || "",
    authorName: data.author_name || "",
    authorUrl: data.author_url || "",
    embedHtml: data.html || ""
  };
}

async function fetchHtmlMeta(tiktokUrl) {
  const options = {
    redirect: "manual",
    signal: AbortSignal.timeout(7000),
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-GB,en;q=0.9",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    }
  };

  let url = tiktokUrl;
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const response = await fetch(url, options);
    if (response.status >= 300 && response.status < 400) {
      const destination = response.headers.get("location");
      const nextUrl = destination && validateTikTokUrl(destination, url);
      if (!nextUrl) throw new Error("TikTok did not redirect to a supported post.");
      url = nextUrl;
      continue;
    }
    if (!response.ok) throw new Error("TikTok page returned " + response.status);
    return { url, ...readHtmlMeta(await response.text()) };
  }
  throw new Error("Too many TikTok redirects.");
}

function readHtmlMeta(html) {


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
  return body?.url;
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

  const oembed = await fetchOEmbed(tiktokUrl).catch(() => null);
  if (oembed?.caption && oembed.thumbnailUrl) return json({ ok: true, url: tiktokUrl, ...oembed });

  const page = await fetchHtmlMeta(tiktokUrl).catch(() => null);
  const resolved = page?.url && page.url !== tiktokUrl && !(page.caption && page.thumbnailUrl)
    ? await fetchOEmbed(page.url).catch(() => null) : null;
  const preferred = resolved || oembed || page;
  const caption = resolved?.caption || oembed?.caption || page?.caption || "";
  const thumbnailUrl = resolved?.thumbnailUrl || oembed?.thumbnailUrl || page?.thumbnailUrl || "";
  if (caption || thumbnailUrl) {
    return json({ ...preferred, ok: true, url: page?.url || tiktokUrl, caption, thumbnailUrl });
  }

  return json({
    ok: false,
    url: tiktokUrl,
    error: "TikTok didn’t provide metadata. Try a public post link or enter the caption and thumbnail manually."
  }, 502);
}
