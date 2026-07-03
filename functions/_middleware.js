function aiHrefFromPath(pathname) {
  return pathname.startsWith('/repssite/') ? '/repssite/ai.html' : '/ai.html';
}

function isHtml(response) {
  return (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
}

export async function onRequest(context) {
  const response = await context.next();
  if (!isHtml(response)) return response;

  const pathname = new URL(context.request.url).pathname;
  const aiHref = aiHrefFromPath(pathname);

  return new HTMLRewriter()
    .on('.hero-badge', {
      element(element) {
        element.replace(`<a href="${aiHref}" class="hero-badge">✦ New AI Assistant Feature</a>`, { html: true });
      }
    })
    .on('body', {
      element(element) {
        element.append(`
<style>
  .product-actions{display:grid!important;grid-template-columns:1fr 1fr!important;align-items:center!important;gap:10px!important}
  .product-actions .product-btn.primary{width:100%!important;min-height:38px!important;padding:0 13px!important;border:1px solid transparent!important;border-radius:9px!important;background:var(--blue,#4da6ff)!important;color:#fff!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;font-size:12px!important;font-weight:800!important;line-height:1!important;text-align:center!important}
  .product-actions .product-btn:not(.primary){width:100%!important;min-height:38px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:var(--muted,#888)!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;font-size:12px!important;font-weight:800!important;line-height:1.3!important;text-align:center!important}
</style>
<script>
(function(){
var aiHref=${JSON.stringify(aiHref)};
function clean(v){return String(v||'').split('?')[0].split('#')[0].replace(/\/$/,'')}
function isAiPage(){var p=clean(location.pathname);return p.slice(-3)==='/ai'||p.slice(-8)==='/ai.html'}
function isHome(){var p=clean(location.pathname)||'/';return p==='/'||p.slice(-11)==='/index.html'||p.slice(-9)==='/repssite'}
function pathOf(h){try{return clean(new URL(h,location.href).pathname)}catch(e){return clean(h)}}
function isAi(a){var t=(a.textContent||'').trim().toLowerCase(),p=pathOf(a.getAttribute('href')||'');return t==='ai assistant'||p.slice(-3)==='/ai'||p.slice(-8)==='/ai.html'}
function tutorial(c){return [].slice.call(c.querySelectorAll('a')).find(function(a){return /tutorial/i.test(a.textContent||'')||/index\.html/i.test(a.getAttribute('href')||'')})}
function patchNav(c,m){if(!c)return;var ai=[].slice.call(c.querySelectorAll('a')).filter(isAi),k=ai[ai.length-1];ai.forEach(function(a){if(a!==k)a.remove()});if(!k)k=document.createElement('a');k.href=aiHref;k.textContent='AI Assistant';if(!m)k.className='nav-link'+(isAiPage()?' active':'');var t=tutorial(c);if(t&&t.nextSibling!==k)t.after(k);else if(!t&&k.parentNode!==c)c.appendChild(k)}
function patchTool(){if(!isHome())return;var g=document.getElementById('tools-grid');if(!g)return;if([].slice.call(g.querySelectorAll('a')).some(isAi))return;var cards=[].slice.call(g.querySelectorAll('.tool-card')),old=cards.find(function(x){return /coming soon/i.test(x.textContent||'')});var card=document.createElement('div');card.className='tool-card';card.style.background='var(--surface)';card.style.border='1px solid var(--border)';card.innerHTML='<div class="tool-icon">AI</div><div class="tool-name">AI Assistant</div><p class="tool-desc">Ask questions about items, sizing, QCs, links, agents and shipping.</p><a href="'+aiHref+'" class="tool-btn">Open AI</a>';if(old)old.replaceWith(card);else g.appendChild(card)}
function run(){document.querySelectorAll('.nav-links').forEach(function(n){patchNav(n,false)});document.querySelectorAll('.mobile-nav-menu').forEach(function(n){patchNav(n,true)});document.querySelectorAll('[data-agent-product]').forEach(function(a){a.textContent='Link';a.classList.add('primary')});document.querySelectorAll('[data-view-product]').forEach(function(a){if(/view details/i.test(a.textContent||''))a.textContent='View Details →'});var b=document.querySelector('.hero-badge');if(b){b.href=aiHref;b.textContent='✦ New AI Assistant Feature'}patchTool()}
run();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});setTimeout(run,250);setTimeout(run,1000);setTimeout(run,2500);setTimeout(run,5000);
})();
</script>`, { html: true });
      }
    })
    .transform(response);
}
