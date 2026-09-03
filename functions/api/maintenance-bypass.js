async function sessionToken(secret) {
  const payload = new TextEncoder().encode(`repscentral-maintenance-v1:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost({ request, env }) {
  const secret = env.MAINTENANCE_ADMIN_PASSWORD;

  if (!secret) {
    return Response.json(
      { error: "Admin bypass is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid request." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (typeof body?.password !== "string" || body.password !== secret) {
    return Response.json(
      { error: "Incorrect password." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const token = await sessionToken(secret);

  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": `rc_maintenance_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict`
      }
    }
  );
}
