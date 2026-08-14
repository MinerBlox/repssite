(() => {
  const warmedOrigins = new Set();
  const warmedUrls = new Set();
  const productSelectors = [
    '.product-image',
    '.product-img-real',
    '.podium-img-real',
    '.thumb',
    '.nav-search-result img',
    '[data-product-image]',
    '.item-image img',
    '.product-main-image'
  ].join(',');

  function warmOrigin(src) {
    try {
      const origin = new URL(src, window.location.href).origin;
      if (!origin || warmedOrigins.has(origin)) return;
      warmedOrigins.add(origin);
      const preconnect = document.createElement('link');
      preconnect.rel = 'preconnect';
      preconnect.href = origin;
      preconnect.crossOrigin = 'anonymous';
      document.head.appendChild(preconnect);
      const dns = document.createElement('link');
      dns.rel = 'dns-prefetch';
      dns.href = origin;
      document.head.appendChild(dns);
    } catch {}
  }

  function accelerateImage(img, highPriority = false) {
    if (!(img instanceof HTMLImageElement)) return;
    const src = img.currentSrc || img.src || img.getAttribute('src');
    if (!src) return;
    warmOrigin(src);
    img.loading = 'eager';
    img.decoding = 'async';
    try { img.fetchPriority = highPriority ? 'high' : 'auto'; } catch {}
  }

  function warmImage(src) {
    if (!src || warmedUrls.has(src)) return;
    warmedUrls.add(src);
    warmOrigin(src);
    const image = new Image();
    image.decoding = 'async';
    try { image.fetchPriority = 'low'; } catch {}
    image.src = src;
  }

  function accelerateWithin(root = document) {
    const images = [];
    if (root instanceof HTMLImageElement && root.matches(productSelectors)) images.push(root);
    if (root.querySelectorAll) images.push(...root.querySelectorAll(productSelectors));
    images.forEach((img, index) => accelerateImage(img, index < 8));
  }

  // Images that are already on the page should start immediately.
  accelerateWithin(document);

  // Product cards are inserted while scrolling. Flip their images from native lazy
  // loading to eager as soon as the card is created, while it is still in the buffer row.
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1) accelerateWithin(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Warm URLs for product images already present slightly before they are needed.
  // This is deliberately capped so we never download the whole catalogue at once.
  let frame = 0;
  function warmNearby() {
    frame = 0;
    const viewportBottom = window.innerHeight;
    let warmed = 0;
    document.querySelectorAll(productSelectors).forEach(img => {
      if (warmed >= 24) return;
      const rect = img.getBoundingClientRect();
      if (rect.top <= viewportBottom * 2.5 && rect.bottom >= -viewportBottom) {
        const src = img.currentSrc || img.src || img.getAttribute('src');
        if (src) {
          warmImage(src);
          accelerateImage(img, rect.top < viewportBottom);
          warmed += 1;
        }
      }
    });
  }

  function requestWarmNearby() {
    if (frame) return;
    frame = requestAnimationFrame(warmNearby);
  }

  window.addEventListener('scroll', requestWarmNearby, { passive: true });
  window.addEventListener('resize', requestWarmNearby, { passive: true });
  requestWarmNearby();
})();