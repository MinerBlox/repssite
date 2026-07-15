const ADMIN_UID = "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";
const REPO = "MinerBlox/repssite";
const BRANCH = "dev";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function isAdmin(request, env) {
  const header = request.headers.get("Authorization") || "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken || !env.FIREBASE_WEB_API_KEY) return false;

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    }
  );

  if (!response.ok) return false;
  const data = await response.json();
  return data.users?.[0]?.localId === ADMIN_UID;
}

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ error: "Unauthorized" }, 401);
  if (!env.GITHUB_TOKEN) return json({ error: "GITHUB_TOKEN is not configured in Cloudflare Pages." }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const path = String(body?.path || "").trim();
  const content = String(body?.base64 || "").trim();
  if (!path.startsWith("liveproductimages/") || path.includes("..")) {
    return json({ error: "Invalid GitHub image path." }, 400);
  }
  if (!content) return json({ error: "Missing image content." }, 400);

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${encodedPath}`;
  const headers = {
    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "RepsCentral-Catalog-Editor"
  };

  const existingResponse = await fetch(`${apiUrl}?ref=${encodeURIComponent(BRANCH)}`, { headers });
  if (!existingResponse.ok) {
    return json({ error: `Could not read existing GitHub image (${existingResponse.status}).` }, 502);
  }
  const existing = await existingResponse.json();

  const updateResponse = await fetch(apiUrl, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Replace catalog image ${path.split("/").pop()}`,
      content,
      sha: existing.sha,
      branch: BRANCH
    })
  });

  if (!updateResponse.ok) {
    const error = await updateResponse.json().catch(() => ({}));
    return json({ error: error.message || `GitHub update failed (${updateResponse.status}).` }, 502);
  }

  const updated = await updateResponse.json();
  return json({ ok: true, commit: updated.commit?.sha || "" });
}
