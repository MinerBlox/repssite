import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { setTimeout as delay } from "node:timers/promises";
import { normalizeTikTokMedia, signedVideoKey, tikwmOrigin } from "../lib/tiktok-media.js";

const renewWithin = 2 * 60 * 60 * 1000;
const manifestKey = "catalog/video-playback-manifest.json";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing required environment variable: " + name);
  return value;
}

function lookupUrl(origin, post) {
  return origin + "/api/tiktok-playback?" + new URLSearchParams({ id: post.id, url: post.url });
}

async function renew(origin, post) {
  const endpoint = lookupUrl(origin, post);
  const cached = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
  if (cached.ok) {
    const media = await cached.json();
    if (media.expiresAt > Date.now() + renewWithin) return "current";
  } else if (cached.status !== 404) {
    throw new Error("Shared cache lookup returned HTTP " + cached.status);
  }

  const result = await fetch(tikwmOrigin + "/api/", {
    method: "POST",
    body: new URLSearchParams({ url: post.url }),
    signal: AbortSignal.timeout(12000)
  });
  if (!result.ok) throw new Error("TikWM returned HTTP " + result.status);
  const data = await result.json();
  if (data.code !== 0) throw new Error("TikWM did not return a playable post");
  if (data.data?.images?.length) return "photo";
  const media = normalizeTikTokMedia(post.url, { play: data.data?.play });
  if (!media || !signedVideoKey(media.videoUrl) || media.expiresAt <= Date.now() + renewWithin) {
    throw new Error("TikWM did not return a standard video link with enough validity");
  }

  const response = await fetch(origin + "/api/tiktok-playback", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ id: post.id, url: post.url, videoUrl: media.videoUrl, renew: true }),
    signal: AbortSignal.timeout(20000)
  });
  if (response.status === 404) return "removed";
  if (!response.ok) throw new Error("Shared verification returned HTTP " + response.status);
  const saved = await response.json();
  if (saved.expiresAt <= Date.now() + renewWithin) throw new Error("The shared link was not refreshed");
  return response.status === 201 ? "refreshed" : "current";
}

const origin = new URL(process.env.PLAYBACK_ORIGIN || "https://repscentral.pages.dev").origin;
const client = new S3Client({
  region: "auto",
  endpoint: "https://" + required("CLOUDFLARE_ACCOUNT_ID") + ".r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY")
  }
});
const object = await client.send(new GetObjectCommand({
  Bucket: required("R2_BUCKET_NAME"), Key: manifestKey
}));
const { posts } = JSON.parse(await object.Body.transformToString());
if (!Array.isArray(posts)) throw new Error("The playback manifest is invalid.");

const counts = { current: 0, refreshed: 0, photo: 0, removed: 0, failed: 0 };
for (const post of posts) {
  try {
    const status = await renew(origin, post);
    counts[status]++;
    if (status !== "current") await delay(1100);
  } catch (error) {
    counts.failed++;
    console.error("Could not warm video " + post.id + ": " + error.message);
    await delay(1100);
  }
}
console.info("Video playback cache:", counts);
if (counts.failed) process.exitCode = 1;
