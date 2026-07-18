const nativeFetchForTransparentSearch = window.fetch.bind(window);

window.fetch = function transparentCatalogSearchFetch(input, init) {
  if (typeof input === "string" && input.startsWith("/api/catalog-image-search?")) {
    input = input.replace(
      "/api/catalog-image-search?",
      "/api/catalog-image-search-transparency-test?"
    );
  }

  return nativeFetchForTransparentSearch(input, init);
};
