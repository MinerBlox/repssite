export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const rawGoodsId = url.searchParams.get("goodsId");
    const platform = (url.searchParams.get("platform") || "WD").toUpperCase();

    if (!rawGoodsId) {
      return json({ error: "missing goodsId" }, 400);
    }

    const numericId = String(rawGoodsId).replace(/^(WD|TB|AL)/i, "").replace(/\D/g, "");
    if (!numericId) {
      return json({ error: "invalid goodsId", goodsId: rawGoodsId }, 400);
    }

    let prefix = "WD";
    if (platform === "TB") prefix = "TB";
    if (platform === "AL") prefix = "AL";

    const acGoodsId = `${prefix}${numericId}`;
    const api = `https://www.acbuy.com/prefix-api/store-product/product/api/item/Photos?goodsId=${acGoodsId}`;

    const r = await fetch(api, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json,text/plain,*/*",
        "Referer": "https://www.acbuy.com/"
      }
    });

    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return json({
        error: "Invalid JSON from ACBuy",
        status: r.status,
        goodsId: acGoodsId,
        api,
        raw: text
      }, 502);
    }

    return json({ goodsId: acGoodsId, api, data }, 200);
  } catch (error) {
    return json({ error: error.message }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
