export async function onRequest(context) {
  try {
    if (context.request.method !== "GET") return json({ error: "method not allowed" }, 405);
    const url = new URL(context.request.url);
    const rawGoodsId = url.searchParams.get("goodsId");
    const platform = (url.searchParams.get("platform") || "WD").toUpperCase();

    if (!rawGoodsId) return json({ error: "missing goodsId" }, 400);
    if (!["WD", "TB", "AL"].includes(platform)) return json({ error: "invalid platform" }, 400);

    const numericId = String(rawGoodsId).replace(/^(WD|TB|AL)/i, "").replace(/\D/g, "");
    if (!/^\d{1,30}$/.test(numericId)) return json({ error: "invalid goodsId" }, 400);

    const acPrefix = platform === "TB" ? "TB" : platform === "AL" ? "AL" : "WD";
    const oopbuyChannel = platform === "TB" ? "TAOBAO" : platform === "AL" ? "1688" : "weidian";
    const acGoodsId = `${acPrefix}${numericId}`;
    const acbuyApi = `https://www.acbuy.com/prefix-api/store-product/product/api/item/Photos?goodsId=${acGoodsId}`;
    const oopbuyApi = `https://webapi.oopbuy.com/orderProduct/getSpuPurchaseInfo?spuNo=${numericId}&channel=${oopbuyChannel}`;

    const [acbuy, oopbuy] = await Promise.all([
      fetchProvider(acbuyApi, {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json,text/plain,*/*",
        "Referer": "https://www.acbuy.com/"
      }, "ACBuy"),
      fetchProvider(oopbuyApi, {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json,text/plain,*/*",
        "Referer": "https://oopbuy.com/"
      }, "OopBuy")
    ]);

    if (!acbuy.ok && !oopbuy.ok) {
      return json({ error: "QC providers unavailable" }, 502);
    }

    return json({
      goodsId: acGoodsId,
      platform,
      itemId: numericId,
      data: {
        acbuy: acbuy.ok ? acbuy.data : null,
        oopbuy: oopbuy.ok ? oopbuy.data : null
      },
      providers: {
        acbuy: { ok: acbuy.ok, status: acbuy.status },
        oopbuy: { ok: oopbuy.ok, status: oopbuy.status }
      }
    });
  } catch {
    return json({ error: "internal server error" }, 500);
  }
}

async function fetchProvider(api, headers, name) {
  try {
    const response = await fetch(api, { headers, signal: AbortSignal.timeout(8000) });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, status: response.status, error: `Invalid JSON from ${name}` };
    }
    if (!response.ok) {
      return { ok: false, status: response.status, error: `${name} returned ${response.status}` };
    }
    return { ok: true, status: response.status, data };
  } catch {
    return { ok: false, status: 0, error: "Provider request failed" };
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=300"
    }
  });
}
