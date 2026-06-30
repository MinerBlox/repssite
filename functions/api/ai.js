const MODEL = "gemini-3.1-flash-lite";

const SYSTEM_PROMPT = `You are RepsCentral AI. Only answer about RepsCentral site help, fashion finds, product quality checks, sizing, links, agents and shipping basics. Refuse unrelated requests. Keep replies short, practical and complete. Never end mid-sentence.`;

const REPSCENTRAL_KNOWLEDGE = `
RepsCentral knowledge:
- RepsCentral recommends HipoBuy as the best agent right now.
- HipoBuy invite link: https://hipobuy.com/register?inviteCode=QTYP3P8P5
- HipoBuy gives 25% off shipping with the invite link.
- HipoBuy is recommended because it gives the discount, has solid item handling, and makes it easy to request help/refunds if something goes wrong.
- RepsCentral helps users browse fashion finds, check item photos, use product links, estimate shipping and navigate the site.

RepsCentral page guide:
- Home/Tutorial page: explains how to use RepsCentral and the basic buying process.
- Spreadsheet page: browse RepsCentral's recommended fashion finds/items. Users can look through items and open product links from there.
- Quality Checks page: lets users search/view available QC/item photos. Users do NOT upload images there. If no photos are available, tell them to wait or check again later.
- Link Converter page: converts supported product links into usable agent/platform links. Send users there when they ask to convert links.
- AI Assistant page: this chat page. It answers questions about RepsCentral, items, QCs, links, sizing, agents and shipping.
- Tutorial navigation link: sends users back to the main tutorial/home page.
- If a user asks where to upload images, say RepsCentral does not currently have an image-upload QC checker on the public site.

General advice:
- Some spreadsheet links may change over time if old links stop working or better alternatives release.
- QC advice: check stitching, logo placement, shape, colour and compare with retail/reference photos. Warehouse lighting or camera quality can make items look different from real life.
- Agent lighting/camera quality can make items look shinier, duller or more polyester than they are in real life.
- Shipping: 3-10kg is usually best value. Avoid very large hauls over 13kg.
- Remove shoeboxes and bulky packaging to save weight where appropriate.
- Rehearse parcel to find estimated weight and volume before paying shipping.
- Exact shipping cost is not known until items arrive and the user tries to ship. You can only estimate before then.
- Save money by using the HipoBuy invite link, joining HipoBuy events/coupons, rehearsing haul, removing boxes, and avoiding peak shipping seasons like Christmas.
- If another agent seems cheaper, explain that price is not the only factor; reliability, item handling, refunds, support and QC/photo quality also matter.
- Missing spreadsheet photo checks: tell users to stay patient because RepsCentral is working on it.
- For most recent video links: tell users to comment, or check the spreadsheet if they cannot wait.
`;

const MAX_INPUT_CHARS = 600;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 260;
const MAX_OUTPUT_TOKENS = 512;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 450;

const ALLOWED_TOPIC_TERMS = [
  "hello", "hi", "hey", "yo", "hiya", "sup", "wassup", "whats up", "what's up", "help",
  "page", "pages", "site", "navigate", "navigation", "tutorial", "home",
  "upload", "uploads", "image", "images", "photo", "photos", "viewer",
  "repscentral", "spreadsheet", "fashion", "clothes", "clothing",
  "shoe", "shoes", "trainer", "trainers", "sneaker", "sneakers",
  "hoodie", "jacket", "shirt", "tee", "t-shirt", "pants", "jeans", "shorts", "bag", "watch", "watches", "electronics",

  "qc", "qcs", "quality check", "quality checks", "stitching", "logo", "shape", "colour", "color",
  "retail", "reference", "batch", "batches", "polyester",

  "agent", "agents", "hipobuy", "shipping", "ship", "haul", "kg", "parcel", "package", "packaging",
  "shoebox", "shoeboxes", "rehearse", "rehearsal", "coupon", "coupons", "safe", "safety",
  "refund", "refunds", "import",

  "link", "links", "convert", "converter", "weidian", "taobao", "tmall", "1688",
  "reddit", "fashionreps",

  "size", "sizing", "fit", "fits", "tts", "small", "large",
  "find", "item", "items", "product", "products", "video", "tiktok"
];

const FOLLOW_UP_TERMS = [
  "why", "why?", "how", "how?", "what", "what?", "which", "which?",
  "explain", "more", "expand", "again", "that", "this", "it",
  "them", "those", "they", "same", "ok", "okay"
];

const OFF_TOPIC_REPLY = "I can only help with RepsCentral-related questions: fashion finds, QCs, agents, shipping, sizing, links and site help.";

export async function onRequest(context) {
  try {
    if (context.request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const apiKey = String(context.env?.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      console.error("Missing GEMINI_API_KEY binding");
      return json({ error: "AI is unavailable right now." }, 503);
    }

    let body;
    try {
      body = await context.request.json();
    } catch {
      return json({ error: "Invalid request." }, 400);
    }

    const message = cleanMessage(body?.message, MAX_INPUT_CHARS);
    if (!message) {
      return json({ error: "Please enter a message." }, 400);
    }

    const localReply = localAnswer(message);
    if (localReply) {
      return json({ reply: localReply, local: true });
    }

    const history = cleanHistory(body?.messages);
    const topicText = `${history.map(item => item.text).join(" ")} ${message}`;

    if (!isAllowedTopic(topicText, message)) {
      return json({ reply: OFF_TOPIC_REPLY, local: true });
    }

    const result = await callGeminiWithRetry(MODEL, apiKey, message, history);
    if (result.ok && result.reply) {
      return json({ reply: result.reply.trim() });
    }

    console.error(`Gemini request failed after ${result.attempts || 1} attempt(s): ${result.status || 502} ${result.error || "unknown"}`);

    if (result.status === 429) {
      return json({ error: "AI is busy right now. Please wait a minute and try again." }, 429);
    }

    return json({ error: "AI is unavailable right now." }, 502);
  } catch (error) {
    console.error("AI function failed", error?.message || error);
    return json({ error: "AI is unavailable right now." }, 500);
  }
}

function localAnswer(message) {
  const text = String(message || "").toLowerCase().trim();

  if (/^(hi|hello|hey|yo|hiya|sup|wassup|whats up|what's up)[!. ]*$/.test(text)) {
    return "Hey — I can help with RepsCentral, QCs, links, sizing, shipping, agents and finding items.";
  }

  if ((text.includes("best") || text.includes("recommend") || text.includes("which")) && text.includes("agent")) {
    return "**HipoBuy** is the agent RepsCentral recommends. Use the invite link for **25% off shipping**: https://hipobuy.com/register?inviteCode=QTYP3P8P5";
  }

  if (text.includes("hipobuy") && (text.includes("why") || text.includes("good") || text.includes("use"))) {
    return "HipoBuy is recommended because it gives **25% off shipping** with the RepsCentral invite link, has solid item handling, and makes it easy to request help/refunds if something goes wrong.";
  }

  if (
    (text.includes("quality checks") || text.includes("quality check") || text.includes("qc") || text.includes("qcs")) &&
    (text.includes("upload") || text.includes("image") || text.includes("photo") || text.includes("put"))
  ) {
    return "The **Quality Checks** page is for searching/viewing available QC photos. You do **not** upload images there. If a QC is missing, check again later while RepsCentral works on adding more.";
  }

  if (
    (text.includes("what") || text.includes("explain") || text.includes("does") || text.includes("do")) &&
    (text.includes("quality checks") || text.includes("quality check") || text.includes("qc") || text.includes("qcs")) &&
    text.includes("page")
  ) {
    return "The **Quality Checks** page lets you search and view available QC/item photos. It is not an upload page.";
  }

  if (
    (text.includes("what") || text.includes("explain") || text.includes("does") || text.includes("do")) &&
    text.includes("spreadsheet") &&
    text.includes("page")
  ) {
    return "The **Spreadsheet** page is where you browse RepsCentral's recommended items and open product links.";
  }

  if (
    (text.includes("what") || text.includes("explain") || text.includes("does") || text.includes("do")) &&
    (text.includes("link converter") || text.includes("converter")) &&
    text.includes("page")
  ) {
    return "The **Link Converter** page converts supported product links into usable agent/platform links.";
  }

  if (
    (text.includes("what") || text.includes("explain") || text.includes("does") || text.includes("do")) &&
    (text.includes("ai") || text.includes("assistant")) &&
    text.includes("page")
  ) {
    return "The **AI Assistant** page is this chat. It helps with RepsCentral, QCs, links, sizing, shipping, agents and finding items.";
  }

  if (
    (text.includes("what") || text.includes("explain") || text.includes("does") || text.includes("do")) &&
    (text.includes("tutorial") || text.includes("home")) &&
    text.includes("page")
  ) {
    return "The **Home/Tutorial** page explains how to use RepsCentral and the basic buying process.";
  }

  if (
    text.includes("what") &&
    (text.includes("pages") || text.includes("site"))
  ) {
    return [
      "**Spreadsheet**: browse recommended items and product links.",
      "**Quality Checks**: search/view available QC photos. No uploads.",
      "**Link Converter**: convert supported product links.",
      "**AI Assistant**: ask questions about RepsCentral, QCs, links, sizing, agents and shipping.",
      "**Home/Tutorial**: learn how to use the site."
    ].join("\n");
  }

  return "";
}

async function callGeminiWithRetry(model, apiKey, message, history) {
  let lastResult = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    lastResult = await callGemini(model, apiKey, message, history);
    lastResult.attempts = attempt;

    if (lastResult.ok || lastResult.status !== 429 || attempt === MAX_ATTEMPTS) {
      return lastResult;
    }

    await sleep(backoffDelay(attempt));
  }

  return lastResult || { ok: false, status: 502, error: "no result", attempts: 0 };
}

async function callGemini(model, apiKey, message, history) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const contents = buildContents(message, history);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: `${SYSTEM_PROMPT}\n\n${REPSCENTRAL_KNOWLEDGE}` }]
      },
      contents,
      generationConfig: {
        temperature: 0.25,
        topP: 0.7,
        topK: 12,
        maxOutputTokens: MAX_OUTPUT_TOKENS
      }
    }),
    signal: AbortSignal.timeout(12000)
  });

  const text = await response.text();
  let data = null;

  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, status: response.status, error: "non-json response" };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.error?.message || `HTTP ${response.status}`
    };
  }

  const reply = extractReply(data);

  return {
    ok: Boolean(reply),
    status: response.status,
    reply,
    error: reply ? null : "empty reply"
  };
}

function buildContents(message, history) {
  const contents = history.map(item => ({
    role: item.role === "model" ? "model" : "user",
    parts: [{ text: item.text }]
  }));

  contents.push({
    role: "user",
    parts: [{ text: message }]
  });

  return contents;
}

function cleanHistory(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-MAX_HISTORY_MESSAGES)
    .map(item => ({
      role: item?.role === "model" || item?.role === "assistant" ? "model" : "user",
      text: cleanMessage(item?.text || item?.content || "", MAX_HISTORY_CHARS)
    }))
    .filter(item => item.text);
}

function isAllowedTopic(topicText, latestMessage) {
  const combined = ` ${String(topicText || "").toLowerCase()} `;

  if (ALLOWED_TOPIC_TERMS.some(term => combined.includes(term))) {
    return true;
  }

  const latest = String(latestMessage || "")
    .toLowerCase()
    .trim()
    .replace(/[!?.,]+$/g, "");

  return FOLLOW_UP_TERMS.includes(latest) &&
    ALLOWED_TOPIC_TERMS.some(term => combined.includes(term));
}

function backoffDelay(attempt) {
  const exponential = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * BASE_BACKOFF_MS);
  return exponential + jitter;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanMessage(value, maxChars) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function extractReply(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];

  return parts
    .map(part => typeof part?.text === "string" ? part.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store"
    }
  });
}
