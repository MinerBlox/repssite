const MODEL = "gemini-3.1-flash-lite";
const SYSTEM_PROMPT = `You are RepsCentral AI. Only answer about RepsCentral, fashion finds, QCs, links, agents, shipping, sizing and site help. Refuse unrelated requests. Do not help evade customs or break laws. Keep replies short and practical.`;
const REPSCENTRAL_KNOWLEDGE = `
RepsCentral knowledge:
- Recommended agent: HipoBuy. Invite link: https://hipobuy.com/register?inviteCode=QTYP3P8P5
- HipoBuy gives 25% off shipping with the invite link. RepsCentral recommends HipoBuy as its preferred Chinese agent.
- Spreadsheet items are based on items RepsCentral has bought and recommends. Some links may not be the exact video link because old links die or better batches release.
- QC advice: check stitching, logo placement, shape, colour and compare with retail/reference photos. Agent lighting or camera quality can make items look shinier or different from real life.
- Shipping: recommended haul weight is 3-10kg for best value. Avoid very large hauls over 13kg.
- Remove shoeboxes and bulky packaging to save weight where appropriate.
- Rehearse parcel to find estimated weight and volume before paying shipping.
- Exact shipping cost is not known until items arrive and the user tries to ship. You can only estimate before then.
- Save money by using the HipoBuy invite link, joining HipoBuy events/coupons, rehearsing haul, removing boxes, and avoiding peak shipping seasons like Christmas.
- If a user asks about cheaper agents, explain that price is not the only factor; reliability, item handling, refunds, support and QC quality also matter.
- Link converter: direct users to the Link Converter page.
- QC for items not on the spreadsheet: direct users to the Quality Checks page.
- Missing spreadsheet QC: tell users to stay patient because RepsCentral is working on it.
- To find items not on spreadsheet: suggest reddit.com/r/fashionreps and checking comments for links.
- For most recent video links: tell users to comment, or check the spreadsheet if they cannot wait.
- If users ask if it is safe: explain that HipoBuy is RepsCentral's preferred agent and users can request refunds if there are item or haul issues. For customs, tell users to follow local laws, carrier rules and import requirements.
`;
const MAX_INPUT_CHARS = 600;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 260;
const MAX_OUTPUT_TOKENS = 140;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 450;

const ALLOWED_TOPIC_TERMS = [
  "rep", "reps", "repscentral", "spreadsheet", "fashion", "clothes", "clothing", "shoe", "shoes", "trainer", "trainers", "sneaker", "sneakers", "hoodie", "jacket", "shirt", "tee", "t-shirt", "pants", "jeans", "shorts", "bag", "watch", "watches", "electronics",
  "qc", "qcs", "quality check", "quality checks", "stitching", "logo", "shape", "colour", "color", "retail", "reference", "batch", "batches", "polyester",
  "agent", "agents", "hipobuy", "shipping", "ship", "haul", "kg", "parcel", "package", "packaging", "shoebox", "shoeboxes", "rehearse", "rehearsal", "coupon", "coupons", "safe", "safety", "refund", "refunds", "customs", "import",
  "link", "links", "convert", "converter", "weidian", "taobao", "tmall", "1688", "acbuy", "cnfans", "mulebuy", "oopbuy", "reddit", "fashionreps",
  "size", "sizing", "fit", "fits", "tts", "small", "large", "find", "item", "items", "product", "products", "video", "tiktok"
];

const FOLLOW_UP_TERMS = ["why", "why?", "how", "how?", "what", "what?", "which", "which?", "explain", "more", "expand", "again", "that", "this", "it", "them", "those", "they", "same", "ok", "okay"];
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

    const history = cleanHistory(body?.messages);
    const topicText = `${history.map(item => item.text).join(" ")} ${message}`;

    if (!isAllowedTopic(topicText, message)) {
      return json({ reply: OFF_TOPIC_REPLY, local: true });
    }

    const result = await callGeminiWithRetry(MODEL, apiKey, message, history);
    if (result.ok && result.reply) {
      return json({ reply: limitReply(result.reply) });
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
  return { ok: Boolean(reply), status: response.status, reply, error: reply ? null : "empty reply" };
}

function buildContents(message, history) {
  const contents = history.map(item => ({
    role: item.role === "model" ? "model" : "user",
    parts: [{ text: item.text }]
  }));
  contents.push({ role: "user", parts: [{ text: message }] });
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
  if (ALLOWED_TOPIC_TERMS.some(term => combined.includes(term))) return true;

  const latest = String(latestMessage || "").toLowerCase().trim().replace(/[!?.,]+$/g, "");
  return FOLLOW_UP_TERMS.includes(latest) && ALLOWED_TOPIC_TERMS.some(term => combined.includes(term));
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

function limitReply(value) {
  const text = String(value || "").trim();
  return text.length > 1100 ? `${text.slice(0, 1100).trim()}...` : text;
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
