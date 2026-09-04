const PAGE_SIZE = 200;

let catalog = [];
let searchable = [];
let visibleCount = PAGE_SIZE;
let currentQuery = "";
let loaded = false;
let loadingPromise = null;

const esc = value => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

function productCard(product) {
  const image = product.imageUrl
    ? `<img src="${esc(product.imageUrl)}" alt="" loading="lazy" decoding="async">`
    : `<div style="width:64px;height:64px;background:#0e0e11;border-radius:8px"></div>`;

  return `<article class="product">
    ${image}
    <div>
      <div class="product-name">${esc(product.name || "Unnamed item")}</div>
      <div class="product-cat">${esc(product.category || "Unsorted")}${product.brand ? ` · ${esc(product.brand)}` : ""}</div>
    </div>
    <button type="button" data-pick="${esc(product.id)}">Choose</button>
  </article>`;
}

async function loadCatalog() {
  if (loaded) return catalog;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const response = await fetch("/api/catalog", { cache: "no-store" });
    if (!response.ok) throw new Error(`Catalog ${response.status}`);

    const data = await response.json();
    catalog = (Array.isArray(data.products) ? data.products : [])
      .filter(product => product && product.isActive !== false);

    searchable = catalog.map(product => ({
      product,
      text: `${product.name || ""} ${product.category || ""} ${product.brand || ""} ${product.id || ""} ${(Array.isArray(product.tags) ? product.tags.join(" ") : "")}`.toLowerCase()
    }));

    loaded = true;
    return catalog;
  })().finally(() => {
    loadingPromise = null;
  });

  return loadingPromise;
}

function matchesFor(query) {
  if (!query) return searchable.map(entry => entry.product);

  const terms = query.split(/\s+/).filter(Boolean);
  return searchable
    .filter(entry => terms.every(term => entry.text.includes(term)))
    .map(entry => entry.product);
}

function render() {
  const grid = document.getElementById("grid");
  const search = document.getElementById("search");
  if (!grid || !search || !loaded) return;

  const query = search.value.trim().toLowerCase();
  if (query !== currentQuery) {
    currentQuery = query;
    visibleCount = PAGE_SIZE;
  }

  const matches = matchesFor(query);
  const shown = matches.slice(0, visibleCount);
  const remaining = matches.length - shown.length;

  const cards = shown.map(productCard).join("");
  const footer = matches.length
    ? `<div style="grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:12px;padding:14px 0 4px;color:#92929c;font-size:12px">
        <span>${matches.length.toLocaleString()} matching product${matches.length === 1 ? "" : "s"}</span>
        ${remaining > 0 ? `<button id="rc-show-more-products" type="button" style="min-height:36px;padding:0 14px;border:1px solid #29292f;border-radius:8px;background:#18181c;color:#fff;font-weight:700">Show ${Math.min(PAGE_SIZE, remaining).toLocaleString()} more</button>` : ""}
      </div>`
    : `<div class="empty" style="grid-column:1/-1">No matching products.</div>`;

  grid.innerHTML = cards + footer;
}

async function activate() {
  const search = document.getElementById("search");
  const grid = document.getElementById("grid");
  if (!search || !grid) {
    requestAnimationFrame(activate);
    return;
  }

  try {
    await loadCatalog();
  } catch (error) {
    console.error("Could not load cached catalogue for homepage admin search", error);
    return;
  }

  // Capture the search event before the old 120-result renderer. The picker now
  // searches the complete R2 catalogue locally, so typing never causes Firestore reads.
  search.addEventListener("input", event => {
    event.stopImmediatePropagation();
    render();
  }, true);

  grid.addEventListener("click", event => {
    const more = event.target.closest("#rc-show-more-products");
    if (!more) return;
    event.preventDefault();
    event.stopPropagation();
    visibleCount += PAGE_SIZE;
    render();
  }, true);

  render();
}

activate();
