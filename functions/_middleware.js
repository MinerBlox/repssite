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
  .product-actions { display:grid!important; grid-template-columns:1fr 1fr!important; align-items:center!important; gap:10px!important; }
  .product-actions .product-btn.primary { width:100%!important; min-height:38px!important; padding:0 13px!important; border:1px solid transparent!important; border-radius:9px!important; background:var(--blue,#4da6ff)!important; color:#fff!important; display:inline-flex!important; align-items:center!important; justify-content:center!important; font-size:12px!important; font-weight:800!important; line-height:1!important; text-align:center!important; }
  .product-actions .product-btn:not(.primary) { width:100%!important; min-height:38px!important; padding:0!important; border:0!important; border-radius:0!important; background:transparent!important; color:var(--muted,#888)!important; display:inline-flex!important; align-items:center!important; justify-content:center!important; font-size:12px!important; font-weight:800!important; line-height:1.3!important; text-align:center!important; }
</style>
<script>
(function(){
  var aiHref=${JSON.stringify(aiHref)};
  function cleanPath(v){return String(v||'').split('?')[0].split('#')[0].replace(/\/$/,'')}
  function currentIsAi(){var p=cleanPath(location.pathname);return p.slice(-3)==='/ai'||p.slice(-8)==='/ai.html'}
  function pathOf(href){try{return cleanPath(new URL(href,location.href).pathname)}catch(e){return cleanPath(href)}}
  function isAi(a){var text=(a.textContent||'').trim().toLowerCase();var path=pathOf(a.getAttribute('href')||'');return text==='ai assistant'||path.slice(-3)==='/ai'||path.slice(-8)==='/ai.html'}
  function findTutorial(container){return [].slice.call(container.querySelectorAll('a')).find(function(a){return /tutorial/i.test(a.textContent||'')||/index\.html/i.test(a.getAttribute('href')||'')})}
  function placeAfterTutorial(container,link){var tutorial=findTutorial(container);if(tutorial&&tutorial.nextSibling!==link){tutorial.after(link)}else if(!tutorial&&link.parentNode!==container){container.appendChild(link)}}
  function patchContainer(container,mobile){
    if(!container)return;
    var ai=[].slice.call(container.querySelectorAll('a')).filter(isAi);
    var keep=ai[ai.length-1];
    ai.forEach(function(a){if(a!==keep)a.remove()});
    if(!keep){keep=document.createElement('a')}
    keep.href=aiHref;keep.textContent='AI Assistant';
    if(!mobile){keep.className='nav-link'+(currentIsAi()?' active':'')}
    placeAfterTutorial(container,keep);
  }
  function run(){
    document.querySelectorAll('.nav-links').forEach(function(n){patchContainer(n,false)});
    document.querySelectorAll('.mobile-nav-menu').forEach(function(n){patchContainer(n,true)});
    document.querySelectorAll('[data-agent-product]').forEach(function(a){a.textContent='Link';a.classList.add('primary')});
    document.querySelectorAll('[data-view-product]').forEach(function(a){if(/view details/i.test(a.textContent||''))a.textContent='View Details →'});
    var badge=document.querySelector('.hero-badge');if(badge){badge.href=aiHref;badge.textContent='✦ New AI Assistant Feature'}
  }
  run();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
  setTimeout(run,250);setTimeout(run,1000);setTimeout(run,2500);setTimeout(run,5000);
})();
</script>`, { html: true });
      }
    })
    .transform(response);
}
