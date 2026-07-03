function aiHrefFromPath(pathname) {
  return pathname.startsWith('/repssite/') ? '/repssite/ai.html' : '/ai.html';
}

function isAiPagePath(pathname) {
  const normalized = String(pathname || '').replace(/\/+$/, '');
  return normalized.endsWith('/ai') || normalized.endsWith('/ai.html');
}

function isHtml(response) {
  return (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
}

export async function onRequest(context) {
  const response = await context.next();

  if (!isHtml(response)) {
    return response;
  }

  const pathname = new URL(context.request.url).pathname;
  const aiHref = aiHrefFromPath(pathname);
  const isAiPage = isAiPagePath(pathname);

  let rewriter = new HTMLRewriter()
    .on('.hero-badge', {
      element(element) {
        element.replace(
          `<a href="${aiHref}" class="hero-badge">✦ New AI Assistant Feature</a>`,
          { html: true }
        );
      }
    });

  if (!isAiPage) {
    rewriter = rewriter
      .on('.nav-links', {
        element(element) {
          element.append(
            `<a href="${aiHref}" class="nav-link rc-ai-nav-link">AI Assistant</a>`,
            { html: true }
          );
        }
      })
      .on('.mobile-nav-menu', {
        element(element) {
          element.append(
            `<a href="${aiHref}" class="rc-ai-nav-link">AI Assistant</a>`,
            { html: true }
          );
        }
      });
  }

  rewriter = rewriter.on('body', {
    element(element) {
      element.append(`
<style>
  .product-actions {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    align-items: center !important;
    gap: 10px !important;
  }

  .product-actions .product-btn.primary {
    width: 100% !important;
    min-height: 38px !important;
    padding: 0 13px !important;
    border: 1px solid transparent !important;
    border-radius: 9px !important;
    background: var(--blue, #4da6ff) !important;
    color: #fff !important;
    box-shadow: none !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 12px !important;
    font-weight: 800 !important;
    line-height: 1 !important;
    text-align: center !important;
  }

  .product-actions .product-btn:not(.primary) {
    width: 100% !important;
    min-height: 38px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    color: var(--muted, #888) !important;
    box-shadow: none !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 12px !important;
    font-weight: 800 !important;
    line-height: 1.3 !important;
    text-align: center !important;
  }
</style>

<script>
(function () {
  var aiHref = ${JSON.stringify(aiHref)};

  function normalizeHref(value) {
    try {
      return new URL(value, window.location.href).pathname.replace(/\\/+$/, '');
    } catch (error) {
      return String(value || '').replace(/\\/+$/, '');
    }
  }

  function isAiPageNow() {
    var normalized = window.location.pathname.replace(/\\/+$/, '');
    return normalized.endsWith('/ai') || normalized.endsWith('/ai.html');
  }

  function isAiLink(link) {
    var href = link.getAttribute('href') || '';
    var text = (link.textContent || '').trim().toLowerCase();
    var path = normalizeHref(href);
    return text === 'ai assistant' || path.endsWith('/ai') || path.endsWith('/ai.html');
  }

  function removeAiLinks(container) {
    if (!container) return;
    Array.prototype.slice.call(container.querySelectorAll('a'))
      .filter(isAiLink)
      .forEach(function (link) {
        link.remove();
      });
  }

  function dedupeAiLinks(container) {
    if (!container) return;
    var aiLinks = Array.prototype.slice.call(container.querySelectorAll('a')).filter(isAiLink);
    aiLinks.forEach(function (link, index) {
      if (index > 0) link.remove();
    });
  }

  function ensureAiLink(container, mobile) {
    if (!container) return;

    dedupeAiLinks(container);

    var existing = Array.prototype.slice.call(container.querySelectorAll('a')).find(isAiLink);
    if (existing) {
      existing.href = aiHref;
      existing.textContent = 'AI Assistant';
      if (!mobile) existing.classList.add('nav-link');
      return;
    }

    var link = document.createElement('a');
    link.href = aiHref;
    link.textContent = 'AI Assistant';
    if (!mobile) link.className = 'nav-link';

    var links = Array.prototype.slice.call(container.querySelectorAll('a'));
    var tutorial = links.find(function (item) {
      return /tutorial/i.test(item.textContent || '') || /index\\.html/i.test(item.getAttribute('href') || '');
    });

    if (tutorial) container.insertBefore(link, tutorial);
    else container.appendChild(link);
  }

  function patchNav() {
    var onAiPage = isAiPageNow();

    document.querySelectorAll('.nav-links').forEach(function (nav) {
      if (onAiPage) {
        removeAiLinks(nav);
      } else {
        ensureAiLink(nav, false);
      }
    });

    document.querySelectorAll('.mobile-nav-menu').forEach(function (menu) {
      if (onAiPage) {
        removeAiLinks(menu);
      } else {
        ensureAiLink(menu, true);
      }
    });
  }

  function patchSpreadsheetButtons() {
    document.querySelectorAll('[data-agent-product]').forEach(function (link) {
      link.textContent = 'Link';
      link.classList.add('primary');
    });

    document.querySelectorAll('[data-view-product]').forEach(function (link) {
      if (/view details/i.test(link.textContent || '')) {
        link.textContent = 'View Details →';
      }
    });
  }

  function patchHomepageAiFeature() {
    var path = window.location.pathname.replace(/\\/+$/, '') || '/';
    var isHome = path === '/' || path.endsWith('/index.html') || path.endsWith('/repssite');
    if (!isHome) return;

    var badge = document.querySelector('.hero-badge');
    if (badge) {
      badge.href = aiHref;
      badge.textContent = '✦ New AI Assistant Feature';
    }
  }

  function runPatch() {
    patchNav();
    patchSpreadsheetButtons();
    patchHomepageAiFeature();
  }

  runPatch();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runPatch, { once: true });
  }

  setTimeout(runPatch, 250);
  setTimeout(runPatch, 1000);
  setTimeout(runPatch, 2500);
  setTimeout(runPatch, 5000);
})();
</script>
      `, { html: true });
    }
  });

  return rewriter.transform(response);
}
