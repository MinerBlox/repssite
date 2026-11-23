import { isAdmin } from "./catalog-index.js";
import { listTikTokVideos, tiktokConfigured } from "../../lib/tiktok-display.js";

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request))) return json({ error: "Admin sign-in required." }, 401);
  if (!tiktokConfigured(env)) return json({ configured: false, videos: [] });

  try {
    return json({ configured: true, videos: await listTikTokVideos(env) });
  } catch (error) {
    const known = /^(TikTok (?:is reconnecting|authorization could not|could not list videos)|Authorize the TikTok)/.test(error?.message || "");
    return json({ error: known ? error.message : "TikTok sync failed. Try again shortly." }, 502);
  }
}
