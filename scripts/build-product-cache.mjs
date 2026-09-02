import admin from "firebase-admin";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

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

console.log("Reading liveproducts from Firestore...");
const snapshot = await db.collection("liveproducts").get();

const products = snapshot.docs
  .map(doc => ({
    id: doc.id,
    ...serializable(doc.data())
  }))
  .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));

const payload = {
  version: Date.now(),
  generatedAt: new Date().toISOString(),
  count: products.length,
  products
};

const body = JSON.stringify(payload);

console.log(`Uploading ${products.length.toLocaleString()} products (${(Buffer.byteLength(body) / 1024 / 1024).toFixed(2)} MiB) to R2...`);

await r2.send(new PutObjectCommand({
  Bucket: bucketName,
  Key: "catalog/products.json",
  Body: body,
  ContentType: "application/json; charset=utf-8",
  CacheControl: "public, max-age=3600, s-maxage=86400"
}));

console.log("✅ catalog/products.json updated.");
