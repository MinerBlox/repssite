import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const serviceAccount = JSON.parse(required("FIREBASE_SERVICE_ACCOUNT"));
const accountId = required("CLOUDFLARE_ACCOUNT_ID");
const accessKeyId = required("R2_ACCESS_KEY_ID");
const secretAccessKey = required("R2_SECRET_ACCESS_KEY");
const bucketName = required("R2_BUCKET_NAME");

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
});

function serializable(value) {
  if (value == null) return value;

  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serializable);
  }

  if (typeof value === "object") {
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = serializable(child);
    }
    return output;
  }

  return value;
}

async function readWithQuotaRetry(query, collection) {
  const maxAttempts = 12;
  const retryMs = 2 * 60 * 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(`Reading ${collection} from Firestore (attempt ${attempt}/${maxAttempts})...`);
      return await query.get();
    } catch (error) {
      const quotaExceeded =
        error?.code === 8 ||
        String(error?.code || "").includes("RESOURCE_EXHAUSTED") ||
        String(error?.message || "").includes("RESOURCE_EXHAUSTED") ||
        String(error?.message || "").includes("Quota exceeded");

      if (!quotaExceeded || attempt === maxAttempts) throw error;

      console.warn(
        `Firestore quota has not reset yet. Retrying in 2 minutes... (${attempt}/${maxAttempts})`
      );
      await new Promise(resolve => setTimeout(resolve, retryMs));
    }
  }

  throw new Error("Firestore quota did not reset within the retry window.");
}

async function writeCache(key, content, snapshotStartedAt) {
  const body = JSON.stringify({ ...content, version: Date.now(), generatedAt: new Date().toISOString(), snapshotStartedAt });
  await r2.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: "application/json; charset=utf-8",
    Metadata: { snapshotstartedat: snapshotStartedAt },
    CacheControl: "public, max-age=3600, s-maxage=86400"
  }));
  console.log(`Saved ${key} (${content.count.toLocaleString()} entries).`);
}

async function exportProducts(collection, key, includeCategories = false) {
  const snapshotStartedAt = new Date().toISOString();
  const snapshot = await readWithQuotaRetry(db.collection(collection), collection);
  const products = snapshot.docs
    .map(doc => ({ ...serializable(doc.data()), id: doc.id }))
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
  const payload = { count: products.length, products };
  if (includeCategories) {
    const categories = await readWithQuotaRetry(db.collection("categories").select("name"), "categories");
    payload.categories = categories.docs.map(doc => doc.data().name || doc.id);
  }
  await writeCache(key, payload, snapshotStartedAt);
}

async function exportInteractions() {
  const key = "catalog/interactions.json";
  let previous;
  try {
    const object = await r2.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
    previous = JSON.parse(await object.Body.transformToString());
  } catch (error) {
    if (error.name !== "NoSuchKey" && error.$metadata?.httpStatusCode !== 404) throw error;
  }
  const snapshotStartedAt = new Date().toISOString();
  const counts = new Map(Object.entries(previous?.interactions || {}));
  let query = db.collection("analyticsProducts");
  if (previous?.snapshotStartedAt) {
    query = query.where("updatedAt", ">=", new Date(previous.snapshotStartedAt));
  }
  const snapshot = await readWithQuotaRetry(query.select("totalInteractions"), "analyticsProducts");
  for (const doc of snapshot.docs) counts.set(doc.id, Number(doc.data().totalInteractions) || 0);
  await writeCache(key, { count: counts.size, interactions: Object.fromEntries(counts) }, snapshotStartedAt);
}

async function exportPlaybackManifest() {
  const snapshotStartedAt = new Date().toISOString();
  const snapshot = await readWithQuotaRetry(db.collection("videos").select("isActive", "tiktokUrl", "mediaUrl"), "videos");
  const posts = [];
  for (const doc of snapshot.docs) {
    const { tiktokUrl, isActive, mediaUrl } = doc.data();
    if (isActive === false || mediaUrl || typeof tiktokUrl !== "string") continue;
    try {
      const url = new URL(tiktokUrl);
      const tiktok = ["www.tiktok.com", "m.tiktok.com", "tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(url.hostname);
      if (url.protocol !== "https:" || url.username || url.password || url.port || !tiktok) continue;
      url.search = "";
      url.hash = "";
      posts.push({ id: doc.id, url: url.href });
    } catch {}
  }
  await writeCache("catalog/video-playback-manifest.json", { count: posts.length, posts }, snapshotStartedAt);
}

const target = process.env.CATALOG_TARGET || "all";
const exportsByTarget = {
  spreadsheet: () => exportProducts("liveproducts", "catalog/products.json", true),
  video: () => exportProducts("videoproducts", "catalog/video-products.json"),
  interactions: exportInteractions,
  playback: exportPlaybackManifest
};
if (target !== "all" && !Object.hasOwn(exportsByTarget, target)) throw new Error("Unknown export target: " + target);
const selected = target === "all" ? Object.entries(exportsByTarget) : [[target, exportsByTarget[target]]];
let failed = false;
for (const [name, run] of selected) {
  try {
    await run();
  } catch (error) {
    console.error(`Could not export ${name}:`, error);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
