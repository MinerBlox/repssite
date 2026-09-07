(() => {
  const USD_PER_CNY = 0.173;
  const RATE_CACHE_KEY = "rc-cny-rates";

  try {
    const cached = JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || "null") || {};
    const rates = { ...(cached.rates || {}), CNY: 1, USD: USD_PER_CNY };
    localStorage.setItem(RATE_CACHE_KEY, JSON.stringify({
      ...cached,
      rates,
      savedAt: Date.now()
    }));
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
      data.rates = { ...(data.rates || {}), USD: USD_PER_CNY };
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
