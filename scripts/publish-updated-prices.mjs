import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }
}

if (!getApps().length) {
  initializeApp({ credential: cert(parseServiceAccount()) });
}

const db = getFirestore();
const sourceCollection = "products";
const liveCollection = "liveproducts";

console.log(`Reading staged prices from ${sourceCollection}...`);
const sourceSnapshot = await db.collection(sourceCollection).get();
console.log(`Found ${sourceSnapshot.size} staged products.`);

let scanned = 0;
let eligible = 0;
let updated = 0;
let missingLive = 0;
let invalidPrice = 0;
let nonCny = 0;

const liveRefs = [];
const sourceById = new Map();

for (const sourceDoc of sourceSnapshot.docs) {
  scanned += 1;
  const data = sourceDoc.data() || {};
  const price = Number(data.price);
  const currency = String(data.currency || "").trim().toUpperCase();

  if (!Number.isFinite(price) || price <= 0) {
    invalidPrice += 1;
    continue;
  }
  if (currency !== "CNY") {
    nonCny += 1;
    continue;
  }

  eligible += 1;
  const ref = db.collection(liveCollection).doc(sourceDoc.id);
  liveRefs.push(ref);
  sourceById.set(sourceDoc.id, { price, priceUpdatedAt: data.priceUpdatedAt || null });
}

console.log(`Eligible CNY prices: ${eligible}. Checking matching liveproducts documents...`);

const READ_BATCH = 250;
const WRITE_BATCH = 400;
const writes = [];

for (let i = 0; i < liveRefs.length; i += READ_BATCH) {
  const refs = liveRefs.slice(i, i + READ_BATCH);
  const snaps = await db.getAll(...refs);

  for (const snap of snaps) {
    if (!snap.exists) {
      missingLive += 1;
      continue;
    }

    const staged = sourceById.get(snap.id);
    if (!staged) continue;

    writes.push({
      ref: snap.ref,
      data: {
        price: staged.price,
        currency: "CNY",
        priceUpdatedAt: staged.priceUpdatedAt || FieldValue.serverTimestamp()
      }
    });
  }
}

console.log(`Writing ${writes.length} price updates to ${liveCollection}...`);
for (let i = 0; i < writes.length; i += WRITE_BATCH) {
  const batch = db.batch();
  for (const item of writes.slice(i, i + WRITE_BATCH)) {
    batch.update(item.ref, item.data);
  }
  await batch.commit();
  updated += Math.min(WRITE_BATCH, writes.length - i);
  console.log(`Updated ${updated}/${writes.length}`);
}

console.log("\nPrice publish complete.");
console.log(JSON.stringify({ scanned, eligible, updated, missingLive, invalidPrice, nonCny }, null, 2));

if (!updated) {
  throw new Error("No live product prices were updated. Refusing to report success.");
}
