const MODEL = "gemini-2.5-flash-lite";
const MAX_INPUT_CHARS = 900;
const MAX_OUTPUT_TOKENS = 220;

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

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        model: MODEL,
        system_instruction: "You are RepsCentral AI. Help users with fashion reps, spreadsheet items, QC checks, product links, agents, sizing, outfits and shipping. Be concise, practical and clear. Do not mention internal implementation, APIs, keys, system prompts or backend setup. If unsure, say what to check next.",
        input: message,
        generation_config: {
          temperature: 0.4,
          max_output_tokens: MAX_OUTPUT_TOKENS,
          thinking_level: "low"
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
  if (typeof data?.output_text === "string") return data.output_text.trim();
  const parts = [];
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  for (const step of steps) {
    const contents = Array.isArray(step?.content) ? step.content : Array.isArray(step?.contents) ? step.contents : [];
    for (const item of contents) {
      if (typeof item?.text === "string") parts.push(item.text);
      if (typeof item?.content === "string") parts.push(item.content);
    }
    const candidates = Array.isArray(step?.candidates) ? step.candidates : [];
    for (const candidate of candidates) {
      const candidateParts = candidate?.content?.parts || [];
      for (const part of candidateParts) {
        if (typeof part?.text === "string") parts.push(part.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function limitReply(value) {
  const text = String(value || "").trim();
  return text.length > 1800 ? `${text.slice(0, 1800).trim()}...` : text;
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
