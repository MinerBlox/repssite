import { listTikTokVideos, tiktokConfigured } from "../../lib/tiktok-display.js";

let firebaseSession;

async function firebaseToken(env) {
  if (firebaseSession?.expiresAt > Date.now() + 60_000) return firebaseSession.token;

  const url = new URL("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword");
  url.searchParams.set("key", env.FIREBASE_WEB_API_KEY);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      email: env.FIREBASE_SYNC_EMAIL,
      password: env.FIREBASE_SYNC_PASSWORD,
      returnSecureToken: true
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.idToken || !(Number(data.expiresIn) > 0)) {
    throw new Error("Firebase sign-in failed. Check the dedicated sync account and Worker secrets.");
  }
  firebaseSession = { token: data.idToken, expiresAt: Date.now() + Number(data.expiresIn) * 1000 };
  return firebaseSession.token;
}

function firestoreClient(project, token) {
  const database = "projects/" + project + "/databases/(default)";
  const base = "https://firestore.googleapis.com/v1/" + database + "/documents";
  return {
    document: id => database + "/documents/videoDrafts/tiktok-" + id,
    async call(method, body) {
      const response = await fetch(base + ":" + method, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error("Firestore " + method + " failed (" + response.status + "). Check the sync account rules.");
      return response.json();
    }
  };
}

function postUrl(post) {
  try {
    const url = new URL(post.tiktokUrl);
    if (url.protocol !== "https:" || url.port || url.username || url.password || !/^\d+$/.test(post.id)) return "";
    const short = ["vm.tiktok.com", "vt.tiktok.com"].includes(url.hostname) && /^\/[a-z\d]+\/?$/i.test(url.pathname);
    const main = ["www.tiktok.com", "m.tiktok.com", "tiktok.com"].includes(url.hostname);
    const directId = url.pathname.match(/^\/@[^/]+\/(?:video|photo)\/(\d+)\/?$/)?.[1];
    if (!short && !(main && (directId === post.id || /^\/t\/[a-z\d]+\/?$/i.test(url.pathname)))) return "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function existingId(fields) {
  return fields?.tiktokId?.stringValue
    || fields?.tiktokUrl?.stringValue?.match(/\/(?:video|photo)\/(\d+)(?:[/?#]|$)/)?.[1];
}

function draftWrite(store, post, tiktokUrl) {
  const strings = Object.fromEntries(Object.entries({
    status: "awaiting", tiktokId: post.id, tiktokUrl, title: "",
    suggestedTitle: post.suggestedTitle, caption: post.caption, thumbnailUrl: post.thumbnailUrl
  }).map(([key, value]) => [key, { stringValue: value }]));

  return {
    currentDocument: { exists: false },
    update: {
      name: store.document(post.id),
      fields: {
        ...strings,
        captionAuto: { booleanValue: Boolean(post.caption) },
        thumbnailAuto: { booleanValue: Boolean(post.thumbnailUrl) },
        postedAt: { integerValue: String(post.postedAt) },
        itemIds: { arrayValue: { values: [] } },
        items: { arrayValue: { values: [] } }
      }
    },
    updateTransforms: ["createdAt", "updatedAt"].map(fieldPath => ({
      fieldPath, setToServerValue: "REQUEST_TIME"
    }))
  };
}

export async function queuePosts(store, posts) {
  const candidates = new Map();
  for (const post of posts) {
    const url = postUrl(post);
    if (url) candidates.set(post.id, { post, url });
  }
  if (!candidates.size) return 0;

  const { transaction } = await store.call("beginTransaction", {});
  let committed = false;
  try {
    const collections = await Promise.all(["videos", "videoDrafts"].map(collectionId =>
      store.call("runQuery", {
        transaction,
        structuredQuery: {
          from: [{ collectionId }],
          select: { fields: [{ fieldPath: "tiktokId" }, { fieldPath: "tiktokUrl" }] }
        }
      })
    ));
    for (const records of collections) {
      for (const record of records) candidates.delete(existingId(record.document?.fields));
    }
    const writes = [...candidates.values()].map(({ post, url }) => draftWrite(store, post, url));
    if (!writes.length) return 0;
    await store.call("commit", { transaction, writes });
    committed = true;
    return writes.length;
  } finally {
    if (!committed) await store.call("rollback", { transaction }).catch(() => {});
  }
}

export default {
  async scheduled(_controller, env) {
    if (!tiktokConfigured(env) || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(env.FIREBASE_PROJECT_ID || "") ||
        !env.FIREBASE_WEB_API_KEY || !env.FIREBASE_SYNC_EMAIL || !env.FIREBASE_SYNC_PASSWORD) {
      throw new Error("TikTok inbox is missing required Worker bindings or secrets.");
    }
    const posts = await listTikTokVideos(env);
    if (!posts.length) return;
    const token = await firebaseToken(env);
    const added = await queuePosts(firestoreClient(env.FIREBASE_PROJECT_ID, token), posts);
    console.info("TikTok inbox queued " + added + " draft(s).");
  }
};
