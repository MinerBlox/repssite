(() => {
  const USD_PER_CNY = 0.173;
  const RATE_CACHE_KEY = "rc-cny-rates";

  // Clear any previously cached mixed rates so every currency is rebuilt
  // from the same live FX snapshot on the next request.
  try {
    localStorage.removeItem(RATE_CACHE_KEY);
  } catch {}

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";

    if (!String(requestUrl).includes("api.frankfurter.dev/v1/latest?base=CNY") || !response.ok) {
      return response;
    }

    try {
      const data = await response.clone().json();
      const marketUsdPerCny = Number(data?.rates?.USD);

      if (!Number.isFinite(marketUsdPerCny) || marketUsdPerCny <= 0) {
        return response;
      }

      // Preserve the live market relationships between currencies, while
      // anchoring the site's CNY conversion at ¥10 = $1.73.
      const scale = USD_PER_CNY / marketUsdPerCny;
      const adjustedRates = {};

      for (const [code, rate] of Object.entries(data.rates || {})) {
        const numericRate = Number(rate);
        adjustedRates[code] = Number.isFinite(numericRate)
          ? numericRate * scale
          : rate;
      }

      adjustedRates.USD = USD_PER_CNY;
      data.rates = adjustedRates;

      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch {
      return response;
    }
  };
})();
