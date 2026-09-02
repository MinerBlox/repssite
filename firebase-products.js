import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { enableAppCheck } from "./firebase-app-check.js?v=2026-06-30-app-check-1";
import { getFirestore, collection, getDocs, query, where, orderBy, limit, startAfter, documentId } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig={apiKey:"AIzaSyDTTzoJlvr0mYxwx82cQ9JJn8rXrMEy7JA",authDomain:"reps-central.firebaseapp.com",projectId:"reps-central",storageBucket:"reps-central.firebasestorage.app",messagingSenderId:"812299387060",appId:"1:812299387060:web:1c93d1e7bf30b05653d7e1",measurementId:"G-8T7F9F1FZ9"};
const app=initializeApp(firebaseConfig);enableAppCheck(app);const db=getFirestore(app);

const HIDDEN_CATEGORY="uncategorised";
const PAGE_SIZE=100;
const INDEX_BATCH_SIZE=30;
const IN_QUERY_SIZE=30;
const CURRENCY_KEY="rc-currency";
const RATE_CACHE_KEY="rc-cny-rates";
const FALLBACK_CURRENCIES={CNY:"Chinese Yuan",GBP:"British Pound",USD:"United States Dollar",EUR:"Euro",AUD:"Australian Dollar",CAD:"Canadian Dollar",JPY:"Japanese Yen",KRW:"South Korean Won",HKD:"Hong Kong Dollar",SGD:"Singapore Dollar",NZD:"New Zealand Dollar",CHF:"Swiss Franc"};
const FALLBACK_RATES={CNY:1,GBP:.103,USD:.139,EUR:.119,AUD:.212,CAD:.190,JPY:21.8,HKD:1.09,SGD:.178,CHF:.111,NZD:.232,KRW:191.5};

let firebaseItems=[];
let visibleItems=[];
let renderedCount=0;
let selectedCategory="All";
let searchTerm=new URLSearchParams(location.search).get("search")||"";
const requestedBrand=new URLSearchParams(location.search).get("brand");
let selectedBrand=requestedBrand||sessionStorage.getItem("rc-pending-brand")||"";
sessionStorage.removeItem("rc-pending-brand");
let selectedCurrency=localStorage.getItem(CURRENCY_KEY)||"";
let currencyNames={...FALLBACK_CURRENCIES};
let cnyRates={...FALLBACK_RATES};
let filterCategories=[];
let categoryCounts=new Map();
let allTotalCount=null;
let lastAllDoc=null;
let allFinished=false;
let loadingPage=false;
let categoryLoading=false;
let searchLoading=false;
let searchTimer=0;
let renderFrame=0;
let catalogIndex=[];
let indexReady=false;
let indexPromise=null;
let indexedModeIds=[];
let indexedModeCursor=0;
let indexedRequestToken=0;
let indexedLoadingToken=0;
let fullCatalogPromise=null;

async function loadFullCatalog(){
  if(fullCatalogPromise)return fullCatalogPromise;
  fullCatalogPromise=(async()=>{
    const r=await fetch("/api/catalog",{cache:"default"});
    if(!r.ok)throw new Error(`catalog ${r.status}`);
    const d=await r.json();
    return sortItems((Array.isArray(d.products)?d.products:[]).filter(i=>i&&i.isActive!==false&&!hidden(i.category)));
  })().catch(error=>{
    fullCatalogPromise=null;
    throw error;
  });
  return fullCatalogPromise;
}

const style=document.createElement("style");
style.textContent=`@media(min-width:721px){.category-row{overflow:visible!important}.category-chips{flex-wrap:wrap!important;overflow-x:visible!important}}.image-loading-label{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:12px;font-weight:600;background:var(--surface2);z-index:0}.image-loading-label.is-hidden{display:none}.product-image{position:relative;z-index:1;opacity:0;transition:opacity .12s ease}.product-image.is-loaded{opacity:1}.category-loading-label{display:inline-flex;align-items:center;min-height:32px;padding:0 4px;color:var(--muted);font-size:12px;font-weight:600}`;
document.head.appendChild(style);

const esc=v=>String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;");
const hidden=v=>String(v||"").trim().toLowerCase()===HIDDEN_CATEGORY;
const safeUrl=v=>{try{const u=new URL(String(v||""),location.href);return /^https?:$/.test(u.protocol)?u.href:""}catch{return""}};
function formatMoney(v,c){try{return new Intl.NumberFormat(undefined,{style:"currency",currency:c,currencyDisplay:"narrowSymbol"}).format(v)}catch{return`${c} ${Number(v).toFixed(2)}`}}
function priceMarkup(i){const y=Number(i.price||0),c=selectedCurrency||"CNY",r=c==="CNY"?1:Number(cnyRates[c]||1);return`<span class="product-price-stack"><span class="product-price">${formatMoney(y*r,c)}</span><span class="yuan-price">~ ¥${y.toFixed(2)}</span></span>`}
function imageMarkup(i){const u=safeUrl(i.imageUrl);if(!u)return`<span class="image-loading-label">Image unavailable</span>`;return`<span class="image-loading-label">Loading image...</span><img class="product-image" src="${esc(u)}" alt="${esc(i.name||"Product image")}" loading="eager" decoding="async" onload="this.classList.add('is-loaded');this.previousElementSibling&&this.previousElementSibling.classList.add('is-hidden')" onerror="this.style.display='none';if(this.previousElementSibling)this.previousElementSibling.textContent='Image unavailable'">`}
function badgeLabel(t){return t==="best"?"Best Batch":t==="budget"?"Budget":t==="new"?"New":t==="popular"?"Popular":""}
function card(i){const href=i.id?`items/${encodeURIComponent(i.id)}/`:"#",agent=safeUrl(i.agentUrl);return`<article class="product-card" data-product-id="${esc(i.id)}"><div class="product-top"><span class="item-badge ${esc(i.badge||"")}">${badgeLabel(i.badge)}</span>${imageMarkup(i)}</div><div class="product-body"><div class="product-name">${esc(i.name||"Unnamed item")}</div><div class="product-meta">${priceMarkup(i)}<span class="product-category">${esc(i.category||"Unsorted")}</span></div><div class="product-actions"><a href="${esc(agent||href)}" class="product-btn primary" data-agent-product="${esc(i.id)}"${agent?' target="_blank" rel="noopener noreferrer"':''}>Link</a><a href="${esc(href)}" class="product-btn" data-view-product="${esc(i.id)}">View Details →</a></div></div></article>`}
function normalizeDocs(docs){return docs.map(d=>({id:d.id,...d.data()})).filter(i=>i.isActive!==false&&!hidden(i.category))}
function sortItems(items){return items.sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0))}
function merge(items){const m=new Map(firebaseItems.map(i=>[i.id,i]));items.forEach(i=>m.set(i.id,i));firebaseItems=sortItems([...m.values()])}

function totalForCurrent(){if(searchTerm.trim()||selectedBrand)return indexedModeIds.length;if(selectedCategory!=="All")return Number(categoryCounts.get(selectedCategory)||indexedModeIds.length);if(allTotalCount!=null)return allTotalCount;return Math.max(firebaseItems.length,visibleItems.length)}
function updateMeta(){const c=document.getElementById("results-count"),copy=document.getElementById("results-copy"),pill=document.getElementById("active-filter-pill"),total=totalForCurrent();if(c)c.textContent=`${total} item${total===1?"":"s"}`;if(pill)pill.textContent=selectedBrand?`Brand: ${selectedBrand}`:`Category: ${selectedCategory}`;if(copy){if(searchTerm.trim())copy.textContent=searchLoading?`Searching for “${searchTerm.trim()}”…`:`Showing results for “${searchTerm.trim()}”.`;else if(selectedCategory!=="All")copy.textContent=categoryLoading?`Loading ${selectedCategory}…`:`Browse ${selectedCategory}.`;else copy.textContent="Browse all items."}}
function setEmptyState(mode){const e=document.getElementById("empty-state");if(!e)return;const h=e.querySelector("h3"),p=e.querySelector("p");if(mode==="hidden"){e.style.display="none";return}if(mode==="loading"){if(h)h.textContent="Loading items";if(p)p.textContent="Getting things ready…";e.style.display="block";return}if(h)h.textContent="No items found";if(p)p.textContent="Try changing the search term or selecting a different category.";e.style.display="block"}
function refreshEmptyState(){if(categoryLoading||searchLoading){setEmptyState("loading");return}if(visibleItems.length){setEmptyState("hidden");return}if(searchTerm.trim()){setEmptyState("empty");return}if(selectedCategory!=="All"){setEmptyState(indexedModeIds.length?"loading":"empty");return}setEmptyState("empty")}
function renderChips(){const w=document.getElementById("category-chips");if(!w)return;if(!indexReady){w.innerHTML=`<span class="category-loading-label">Loading filters...</span>`;return}w.innerHTML=["All",...filterCategories].map(c=>`<button class="category-chip ${selectedCategory===c?"active":""}" type="button" data-category="${esc(c)}">${esc(c)}</button>`).join("")}
function columns(){const g=document.getElementById("product-grid");if(!g)return 1;const w=g.clientWidth;return w<520?1:w<720?2:Math.max(1,Math.floor((w+16)/236))}
function rowHeight(){const g=document.getElementById("product-grid"),f=g?.querySelector(".product-card");if(!f)return 360;const gap=parseFloat(getComputedStyle(g).rowGap||getComputedStyle(g).gap)||16;return Math.max(160,f.getBoundingClientRect().height+gap)}
function targetCount(){const g=document.getElementById("product-grid");if(!g)return 0;const top=g.getBoundingClientRect().top+scrollY,depth=Math.max(innerHeight,scrollY+innerHeight-top);return(Math.ceil(depth/rowHeight())+2)*columns()}
function appendUntilTarget(){const g=document.getElementById("product-grid");if(!g||categoryLoading||searchLoading)return;const t=Math.min(visibleItems.length,targetCount());if(t>renderedCount){g.insertAdjacentHTML("beforeend",visibleItems.slice(renderedCount,t).map(card).join(""));renderedCount=t}updateMeta();refreshEmptyState()}
function resetRendered(){const g=document.getElementById("product-grid");if(!g)return;visibleItems=[...firebaseItems];renderedCount=0;g.innerHTML="";appendUntilTarget();refreshEmptyState()}

function compactFromFull(item){return{id:String(item.id||""),name:String(item.name||""),category:String(item.category||""),brand:String(item.brand||""),sortOrder:Number(item.sortOrder||0),isActive:item.isActive!==false}}
function deriveIndexMetadata(){const active=catalogIndex.filter(i=>i.isActive!==false&&!hidden(i.category));const counts=new Map();for(const item of active){const c=String(item.category||"").trim();if(c)counts.set(c,(counts.get(c)||0)+1)}categoryCounts=counts;filterCategories=[...counts.keys()].sort((a,b)=>a.localeCompare(b));allTotalCount=active.length;indexReady=true;renderChips();updateMeta()}
async function loadCatalogIndex(){if(indexReady)return catalogIndex;if(indexPromise)return indexPromise;indexPromise=(async()=>{const full=await loadFullCatalog();catalogIndex=full.map(compactFromFull);catalogIndex.sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0));deriveIndexMetadata();return catalogIndex})().finally(()=>{indexPromise=null});return indexPromise}

async function loadInitial(){loadingPage=true;try{firebaseItems=[...(await loadFullCatalog())];allFinished=true;lastAllDoc=null}finally{loadingPage=false}resetRendered();document.getElementById("spreadsheet-loading")?.style.setProperty("display","none");document.getElementById("product-grid")?.style.setProperty("display","grid")}
async function loadNextPage(){allFinished=true;appendUntilTarget()}

async function loadItemsByIds(ids){if(!ids.length)return[];const full=await loadFullCatalog();const map=new Map(full.map(item=>[String(item.id),item]));return ids.map(id=>map.get(String(id))).filter(i=>i&&i.isActive!==false&&!hidden(i.category))}
async function loadNextIndexedBatch(token=indexedRequestToken){if(token!==indexedRequestToken||indexedModeCursor>=indexedModeIds.length)return;if(indexedLoadingToken===token)return;indexedLoadingToken=token;try{const start=indexedModeCursor;const ids=indexedModeIds.slice(start,start+INDEX_BATCH_SIZE);const items=await loadItemsByIds(ids);if(token!==indexedRequestToken)return;indexedModeCursor=start+ids.length;merge(items);visibleItems=[...firebaseItems];appendUntilTarget()}finally{if(indexedLoadingToken===token)indexedLoadingToken=0}}
function matchingIndexIds(){const term=searchTerm.trim().toLowerCase();return catalogIndex.filter(i=>i.isActive!==false&&!hidden(i.category)&&(selectedCategory==="All"||i.category===selectedCategory)&&(!selectedBrand||String(i.brand||"").toLowerCase()===selectedBrand.toLowerCase())&&(!term||`${i.name||""} ${i.category||""} ${i.brand||""} ${i.id||""}`.toLowerCase().includes(term))).sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0)).map(i=>i.id)}
async function startIndexedMode({category="All",term="",brand=""}={}){await loadCatalogIndex();indexedRequestToken++;const token=indexedRequestToken;indexedLoadingToken=0;selectedCategory=category;searchTerm=term;selectedBrand=brand;indexedModeIds=matchingIndexIds();indexedModeCursor=0;firebaseItems=[];visibleItems=[];renderedCount=0;const g=document.getElementById("product-grid");if(g)g.innerHTML="";categoryLoading=category!=="All"&&!term;searchLoading=Boolean(term);renderChips();updateMeta();refreshEmptyState();if(!indexedModeIds.length){categoryLoading=false;searchLoading=false;refreshEmptyState();return}try{await loadNextIndexedBatch(token)}catch{if(token===indexedRequestToken){categoryLoading=false;searchLoading=false;refreshEmptyState()}return}if(token!==indexedRequestToken)return;categoryLoading=false;searchLoading=false;resetRendered()}
async function loadCategory(category){const input=document.getElementById("search-input");if(input)input.value="";if(category==="All"){indexedRequestToken++;indexedLoadingToken=0;selectedCategory="All";selectedBrand="";searchTerm="";categoryLoading=false;searchLoading=false;indexedModeIds=[];indexedModeCursor=0;await loadInitial();renderChips();return}await startIndexedMode({category,term:"",brand:""})}

async function maybeLoadMore(){if(renderFrame)return;renderFrame=requestAnimationFrame(async()=>{renderFrame=0;appendUntilTarget();const nearEnd=renderedCount>=visibleItems.length-2;if(!nearEnd)return;if(selectedCategory==="All"&&!searchTerm.trim()&&!selectedBrand){if(!allFinished)await loadNextPage();appendUntilTarget();return}if(indexedModeCursor<indexedModeIds.length){await loadNextIndexedBatch(indexedRequestToken);appendUntilTarget()}})}

function renderCurrencyList(search=""){const l=document.getElementById("currency-list");if(!l)return;const n=search.trim().toLowerCase();l.innerHTML=Object.entries(currencyNames).filter(([c,name])=>!n||c.toLowerCase().includes(n)||name.toLowerCase().includes(n)).map(([c,name])=>`<button class="currency-option ${c===selectedCurrency?"selected":""}" type="button" data-currency="${c}"><span class="currency-code">${c}</span><span class="currency-name">${name}</span></button>`).join("")}
function openCurrencyPicker(required=false){const o=document.getElementById("currency-overlay"),c=document.getElementById("currency-close");if(!o)return;o.classList.add("open");if(c)c.hidden=required||!selectedCurrency;renderCurrencyList()}
function closeCurrencyPicker(){if(selectedCurrency)document.getElementById("currency-overlay")?.classList.remove("open")}
function chooseCurrency(code){selectedCurrency=code;localStorage.setItem(CURRENCY_KEY,code);document.getElementById("currency-overlay")?.classList.remove("open");const p=document.getElementById("currency-pill");if(p)p.textContent=`Currency: ${code}`;resetRendered()}
async function loadCurrencyData(){try{const cached=JSON.parse(localStorage.getItem(RATE_CACHE_KEY)||"null");if(cached?.rates)cnyRates={...cnyRates,...cached.rates}}catch{}try{const[c,r]=await Promise.all([fetch("https://api.frankfurter.dev/v1/currencies"),fetch("https://api.frankfurter.dev/v1/latest?base=CNY")]);if(c.ok)currencyNames={...currencyNames,...await c.json()};if(r.ok){const d=await r.json();cnyRates={...cnyRates,CNY:1,...d.rates};localStorage.setItem(RATE_CACHE_KEY,JSON.stringify({rates:cnyRates,savedAt:Date.now()}));resetRendered()}}catch{}}
function initializeCurrency(){const p=document.getElementById("currency-pill");if(p)p.textContent=`Currency: ${selectedCurrency||"Select"}`;document.getElementById("currency-search")?.addEventListener("input",e=>renderCurrencyList(e.target.value));document.getElementById("currency-list")?.addEventListener("click",e=>{const o=e.target.closest("[data-currency]");if(o)chooseCurrency(o.dataset.currency)});document.getElementById("currency-close")?.addEventListener("click",closeCurrencyPicker);if(!selectedCurrency)openCurrencyPicker(true);void loadCurrencyData()}

const searchInput=document.getElementById("search-input");if(searchInput){searchInput.value=searchTerm;searchInput.addEventListener("input",e=>{const term=e.target.value;clearTimeout(searchTimer);indexedRequestToken++;indexedLoadingToken=0;searchTimer=setTimeout(()=>{if(!term.trim()){void loadCategory("All");return}void startIndexedMode({category:"All",term,brand:""})},180)})}
document.getElementById("category-chips")?.addEventListener("click",e=>{const chip=e.target.closest("[data-category]");if(chip)void loadCategory(chip.dataset.category)});
document.getElementById("product-grid")?.addEventListener("click",e=>{const a=e.target.closest("[data-agent-product]");if(a){window.rcTrackProductInteraction?.(a.dataset.agentProduct,"outboundClicks");return}const v=e.target.closest("[data-view-product]");if(v)window.rcTrackProductInteraction?.(v.dataset.viewProduct,"viewClicks")});
window.addEventListener("scroll",maybeLoadMore,{passive:true});window.addEventListener("resize",maybeLoadMore);window.setCategory=loadCategory;window.clearCategory=()=>loadCategory("All");window.openCurrencyPicker=openCurrencyPicker;window.copyProductLink=async(url,id)=>{if(url&&url!=="#"){await navigator.clipboard.writeText(new URL(url,location.href).href);window.rcTrackProductInteraction?.(id,"copyClicks")}};

initializeCurrency();
renderChips();
await loadInitial();
await loadCatalogIndex();
if(searchTerm.trim()||selectedBrand){await startIndexedMode({category:"All",term:searchTerm,brand:selectedBrand})}
