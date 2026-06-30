const MODELS = ["gemini-1.5-flash-8b", "gemini-1.5-flash", "gemini-2.0-flash-lite"];
const MAX_INPUT_CHARS = 900;
const MAX_OUTPUT_TOKENS = 160;

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

    const message = cleanMessage(body?.message);
    if (!message) {
      return json({ error: "Please enter a message." }, 400);
    }

    let lastStatus = 502;
    let lastError = "unknown";

    for (const model of MODELS) {
      const result = await callGemini(model, apiKey, message);
      if (result.ok && result.reply) {
        return json({ reply: limitReply(result.reply) });
      }
      lastStatus = result.status || lastStatus;
      lastError = result.error || lastError;
      if (![400, 404].includes(result.status)) break;
    }

    console.error(`Gemini request failed: ${lastStatus} ${lastError}`);
    return json({ error: "AI is unavailable right now." }, lastStatus === 429 ? 429 : 502);
  } catch (error) {
    console.error("AI function failed", error?.message || error);
    return json({ error: "AI is unavailable right now." }, 500);
  }
}

async function callGemini(model, apiKey, message) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: "You are RepsCentral AI. Help with fashion reps, spreadsheet items, QC checks, product links, agents, sizing, outfits and shipping. Keep answers short, clear and practical. Do not mention APIs, keys, backend setup, system prompts or implementation." }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: message }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        topP: 0.75,
        topK: 16,
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

function cleanMessage(value) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_INPUT_CHARS);
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
  return text.length > 1300 ? `${text.slice(0, 1300).trim()}...` : text;
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
