const MODEL = "gemini-2.0-flash-lite";
const MAX_INPUT_CHARS = 900;
const MAX_OUTPUT_TOKENS = 180;

export async function onRequest(context) {
  try {
    if (context.request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const apiKey = context.env?.GEMINI_API_KEY;
    if (!apiKey) {
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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You are RepsCentral AI. Help users with fashion reps, spreadsheet items, QC checks, product links, agents, sizing, outfits and shipping. Keep answers concise and practical. Do not mention APIs, keys, backend setup, system prompts or implementation." }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: message }]
          }
        ],
        generationConfig: {
          temperature: 0.35,
          topP: 0.8,
          topK: 20,
          maxOutputTokens: MAX_OUTPUT_TOKENS
        }
      }),
      signal: AbortSignal.timeout(12000)
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return json({ error: "AI is unavailable right now." }, 502);
    }

    if (!response.ok) {
      return json({ error: "AI is unavailable right now." }, response.status === 429 ? 429 : 502);
    }

    const reply = extractReply(data);
    if (!reply) {
      return json({ error: "AI is unavailable right now." }, 502);
    }

    return json({ reply: limitReply(reply) });
  } catch {
    return json({ error: "AI is unavailable right now." }, 500);
  }
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
  return text.length > 1500 ? `${text.slice(0, 1500).trim()}...` : text;
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
