export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("text/html")) {
    return response;
  }

  return new HTMLRewriter()
    .on("body", {
      element(element) {
        element.append(`
<script>
(function () {
  function basePath() {
    return window.location.pathname.startsWith('/repssite/') ? '/repssite/' : '/';
  }

  function aiHref() {
    return basePath() + 'ai.html';
  }

  function hasAiLink(container) {
    return !!container.querySelector('a[href$="ai.html"], a[href$="/ai"], a[href="ai.html"]');
  }

  function makeAiLink(isMobile) {
    var link = document.createElement('a');
    link.href = aiHref();
    link.textContent = 'AI Assistant';

    if (!isMobile) {
      link.className = 'nav-link' + (/\/ai(?:\.html)?\/?$/i.test(window.location.pathname) ? ' active' : '');
    }

    return link;
  }

  function insertAiLink(container, isMobile) {
    if (!container || hasAiLink(container)) return;

    var links = Array.prototype.slice.call(container.querySelectorAll('a'));
    var tutorial = links.find(function (link) {
      var text = (link.textContent || '').toLowerCase();
      var href = link.getAttribute('href') || '';
      return text.includes('tutorial') || href.includes('index.html');
    });

    var ai = makeAiLink(isMobile);

    if (tutorial) container.insertBefore(ai, tutorial);
    else container.appendChild(ai);
  }

  function patchNav() {
    document.querySelectorAll('.nav-links').forEach(function (nav) {
      insertAiLink(nav, false);
    });

    document.querySelectorAll('.mobile-nav-menu').forEach(function (menu) {
      insertAiLink(menu, true);
    });
  }

  function patchHomepageAiFeature() {
    var path = window.location.pathname.replace(/\/+$/, '') || '/';
    var isHome = path === '/' || path.endsWith('/index.html') || path.endsWith('/repssite');
    if (!isHome) return;

    var badge = document.querySelector('.hero-badge');
    if (badge) {
      if (badge.tagName === 'A') {
        badge.href = aiHref();
        badge.textContent = '✦ NEW AI FEATURE';
      } else {
        var replacement = document.createElement('a');
        replacement.href = aiHref();
        replacement.className = badge.className;
        replacement.textContent = '✦ NEW AI FEATURE';
        badge.replaceWith(replacement);
      }
    }

    var grid = document.getElementById('tools-grid');
    if (!grid || grid.querySelector('a[href$="ai.html"]')) return;

    var cards = Array.prototype.slice.call(grid.querySelectorAll('.tool-card'));
    var comingSoon = cards.find(function (card) {
      return /coming soon/i.test(card.textContent || '');
    });

    var aiCard = document.createElement('div');
    aiCard.className = 'tool-card';
    aiCard.style.background = 'var(--surface)';
    aiCard.style.border = '1px solid var(--border)';
    aiCard.innerHTML = '<div class="tool-icon">🤖</div><div class="tool-name">AI Assistant</div><p class="tool-desc">Ask questions about items, sizing, QCs, links, agents and shipping.</p><a href="' + aiHref() + '" class="tool-btn">Open AI</a>';

    if (comingSoon) comingSoon.replaceWith(aiCard);
    else grid.appendChild(aiCard);
  }

  function runPatch() {
    patchNav();
    patchHomepageAiFeature();
  }

  runPatch();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runPatch, { once: true });
  }

  window.setTimeout(runPatch, 250);
  window.setTimeout(runPatch, 1000);
  window.setTimeout(runPatch, 2500);
})();
</script>
        `, { html: true });
      }
    })
    .transform(response);
}
