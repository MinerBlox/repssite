export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const rawGoodsId = url.searchParams.get("goodsId");
    const platform = (url.searchParams.get("platform") || "WD").toUpperCase();

    if (!rawGoodsId) return json({ error: "missing goodsId" }, 400);

    const numericId = String(rawGoodsId).replace(/^(WD|TB|AL)/i, "").replace(/\D/g, "");
    if (!numericId) return json({ error: "invalid goodsId", goodsId: rawGoodsId }, 400);

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
      return json({
        error: "Both QC providers failed",
        goodsId: acGoodsId,
        providers: { acbuy, oopbuy }
      }, 502);
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
        acbuy: { ok: acbuy.ok, status: acbuy.status, api: acbuyApi, error: acbuy.error || null },
        oopbuy: { ok: oopbuy.ok, status: oopbuy.status, api: oopbuyApi, error: oopbuy.error || null }
      }
    });
  } catch (error) {
    return json({ error: error.message }, 500);
  }
}

async function fetchProvider(api, headers, name) {
  try {
    const response = await fetch(api, { headers });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, status: response.status, error: `Invalid JSON from ${name}`, raw: text.slice(0, 500) };
    }
    if (!response.ok) {
      return { ok: false, status: response.status, error: `${name} returned ${response.status}`, data };
    }
    return { ok: true, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300"
    }
  });
}
