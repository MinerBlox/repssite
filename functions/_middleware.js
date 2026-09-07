const MAINTENANCE_ENABLED = false;

async function sessionToken(secret) {
  const payload = new TextEncoder().encode(`repscentral-maintenance-v1:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function injectDevCurrencyOverride(response) {
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const injected = html.includes("/dev-currency-rate.js")
    ? html
    : html.replace("</head>", '<script src="/dev-currency-rate.js"></script>\n</head>');

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");

  return new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;

  if (!MAINTENANCE_ENABLED) {
    return injectDevCurrencyOverride(await next());
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  if (
    pathname === "/maintenance" ||
    pathname === "/maintenance/" ||
    pathname === "/maintenance.html" ||
    pathname === "/api/maintenance-bypass" ||
    pathname === "/api/maintenance-bypass/"
  ) {
    return injectDevCurrencyOverride(await next());
  }

  const secret = env.MAINTENANCE_ADMIN_PASSWORD;
  if (secret) {
    const supplied = getCookie(request, "rc_maintenance_session");
    const expected = await sessionToken(secret);
    if (supplied && supplied === expected) {
      return injectDevCurrencyOverride(await next());
    }
  }

  const returnTo = encodeURIComponent(pathname + url.search);
  return Response.redirect(
    `${url.origin}/maintenance?return=${returnTo}`,
    302
  );
}
