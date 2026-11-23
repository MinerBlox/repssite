import { validateTikTokUrl } from "./tiktok-meta.js";

const provider = "https://www.tikwm.com/api/";

function httpsMediaUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value, "https://www.tikwm.com/");
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url.href : "";
  } catch {
    return "";
  }
}

export async function onRequestPost({ request }) {
  const input = await request.json().catch(() => null);
  const url = validateTikTokUrl(input?.url);
  const headers = { "Cache-Control": "no-store" };
  if (!url) {
    return Response.json({ error: "Paste a valid TikTok URL." }, { status: 400, headers });
  }

  try {
    const response = await fetch(provider, {
      method: "POST",
      body: new URLSearchParams({ url, hd: "1" }),
      redirect: "error",
      signal: AbortSignal.timeout(8000)
    });
    if (response.ok) {
      const result = await response.json();
      if (result.code === 0) {
        const videoUrl = httpsMediaUrl(result.data?.hdplay) || httpsMediaUrl(result.data?.play);
        if (videoUrl) return Response.json({ videoUrl }, { headers });
      }
    }
  } catch {
    // The video dialog keeps the original TikTok link available.
  }
  return Response.json({ error: "No playable video returned by TikWM." }, { status: 502, headers });
}
