import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { enableAppCheck } from "./firebase-app-check.js?v=2026-06-30-app-check-1";
import { getFirestore, collection, getDocs, getCountFromServer, query, where, orderBy, limit, startAfter } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDTTzoJlvr0mYxwx82cQ9JJn8rXrMEy7JA",
  authDomain: "reps-central.firebaseapp.com",
  projectId: "reps-central",
  storageBucket: "reps-central.firebasestorage.app",
  messagingSenderId: "812299387060",
  appId: "1:812299387060:web:1c93d1e7bf30b05653d7e1",
  measurementId: "G-8T7F9F1FZ9"
};

const app = initializeApp(firebaseConfig);
enableAppCheck(app);
const db = getFirestore(app);

const HIDDEN_CATEGORY = "uncategorised";
const PAGE_SIZE = 100;
const CATEGORY_SAMPLE_SIZE = 10;
const CURRENCY_KEY = "rc-currency";
const RATE_CACHE_KEY = "rc-cny-rates";
const CATEGORY_COUNT_CACHE_KEY = "rc-category-counts-v2";
const CATEGORY_COUNT_CACHE_MS = 30 * 60 * 1000;
const FALLBACK_FILTER_CATEGORIES = ["Shoes","Hoodies","Tees","Shorts","Sweats","Jeans","Jackets","Puffer","Sweaters","Sets","Jerseys","Accessories","Room Decor","Electronics","Womens"];
const FALLBACK_CURRENCIES = { CNY:"Chinese Yuan", GBP:"British Pound", USD:"United States Dollar", EUR:"Euro", AUD:"Australian Dollar", CAD:"Canadian Dollar", JPY:"Japanese Yen", KRW:"South Korean Won", HKD:"Hong Kong Dollar", SGD:"Singapore Dollar", NZD:"New Zealand Dollar", CHF:"Swiss Franc" };
const FALLBACK_RATES = { CNY:1, GBP:0.103, USD:0.139, EUR:0.119, AUD:0.212, CAD:0.190, JPY:21.8, HKD:1.09, SGD:0.178, CHF:0.111, NZD:0.232, KRW:191.5 };

let firebaseItems = [];
let visibleItems = [];
let renderedCount = 0;
let selectedCategory = "All";
let searchTerm = new URLSearchParams(location.search).get("search") || "";
const requestedBrand = new URLSearchParams(location.search).get("brand");
let selectedBrand = requestedBrand || sessionStorage.getItem("rc-pending-brand") || "";
sessionStorage.removeItem("rc-pending-brand");
let selectedCurrency = localStorage.getItem(CURRENCY_KEY) || "";
let currencyNames = { ...FALLBACK_CURRENCIES };
let cnyRates = { ...FALLBACK_RATES };
let filterCategories = [...FALLBACK_FILTER_CATEGORIES];
let categoryCounts = new Map();
let countsReady = false;
let categorySamplesReady = false;
let lastAllDoc = null;
let allFinished = false;
let loadingPage = false;
let fullSearchLoaded = false;
let searchTimer = 0;
let renderFrame = 0;
const categoryCache = new Map();
const categoryPreviewCache = new Map();

const style = document.createElement("style");
style.textContent = `@media(min-width:721px){.category-row{overflow:visible!important}.category-chips{flex-wrap:wrap!important;overflow-x:visible!important}}`;
document.head.appendChild(style);

const esc = value => String(value || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;");
const hidden = value => String(value || "").trim().toLowerCase() === HIDDEN_CATEGORY;
function safeUrl(value){ try { const u=new URL(String(value||""),location.href); return /^https?:$/.test(u.protocol)?u.href:""; } catch { return ""; } }
function formatMoney(value,currency){ try{return new Intl.NumberFormat(undefined,{style:"currency",currency,currencyDisplay:"narrowSymbol"}).format(value)}catch{return `${currency} ${Number(value).toFixed(2)}`} }
function priceMarkup(item){ const y=Number(item.price||0), c=selectedCurrency||"CNY", r=c==="CNY"?1:Number(cnyRates[c]||1); return `<span class="product-price-stack"><span class="product-price">${formatMoney(y*r,c)}</span><span class="yuan-price">~ ¥${y.toFixed(2)}</span></span>`; }
function imageMarkup(item){ const url=safeUrl(item.imageUrl); return url?`<img class="product-image" src="${esc(url)}" alt="${esc(item.name||"Product image")}" loading="eager" decoding="async">`:`<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`; }
function badgeLabel(type){ return type==="best"?"Best Batch":type==="budget"?"Budget":type==="new"?"New":type==="popular"?"Popular":""; }
function card(item){ const href=item.id?`items/${encodeURIComponent(item.id)}/`:"#"; const agent=safeUrl(item.agentUrl); return `<article class="product-card" data-product-id="${esc(item.id)}"><div class="product-top"><span class="item-badge ${esc(item.badge||"")}">${badgeLabel(item.badge)}</span>${imageMarkup(item)}</div><div class="product-body"><div class="product-name">${esc(item.name||"Unnamed item")}</div><div class="product-meta">${priceMarkup(item)}<span class="product-category">${esc(item.category||"Unsorted")}</span></div><div class="product-actions"><a href="${esc(agent||href)}" class="product-btn primary" data-agent-product="${esc(item.id)}"${agent?' target="_blank" rel="noopener noreferrer"':''}>Link</a><a href="${esc(href)}" class="product-btn" data-view-product="${esc(item.id)}">View Details →</a></div></div></article>`; }
function normalize(docs){ return docs.map(d=>({id:d.id,...d.data()})).filter(i=>i.isActive!==false&&!hidden(i.category)); }
function merge(items){ const map=new Map(firebaseItems.map(i=>[i.id,i])); items.forEach(i=>map.set(i.id,i)); firebaseItems=[...map.values()]; }
function filtered(){ const q=searchTerm.trim().toLowerCase(); return firebaseItems.filter(i=>!hidden(i.category)&&(selectedCategory==="All"||i.category===selectedCategory)&&(!selectedBrand||String(i.brand||"").toLowerCase()===selectedBrand.toLowerCase())&&(`${i.name||""} ${i.brand||""} ${i.category||""} ${(i.tags||[]).join(" ")}`.toLowerCase().includes(q))); }

function totalForCurrent(){ if(searchTerm.trim()||selectedBrand) return filtered().length; if(!countsReady) return null; if(selectedCategory!=="All") return Number(categoryCounts.get(selectedCategory)||0); return [...categoryCounts.values()].reduce((a,b)=>a+Number(b||0),0); }
function updateMeta(){
  const count=document.getElementById("results-count"), copy=document.getElementById("results-copy"), pill=document.getElementById("active-filter-pill");
  const total=totalForCurrent();
  if(count) count.textContent=total==null?"Loading…":`${total} item${total===1?"":"s"}`;
  if(pill) pill.textContent=selectedBrand?`Brand: ${selectedBrand}`:`Category: ${selectedCategory}`;
  if(copy){
    if(searchTerm.trim()) copy.textContent=`Showing results for “${searchTerm.trim()}”.`;
    else if(selectedCategory!=="All") copy.textContent=`Browse ${selectedCategory}.`;
    else copy.textContent="Browse all items.";
  }
}

function renderChips(){
  const wrap=document.getElementById("category-chips");
  if(!wrap)return;
  let cats=filterCategories.filter(c=>c&&!hidden(c));
  if(countsReady) cats=cats.filter(c=>Number(categoryCounts.get(c)||0)>0);
  else if(categorySamplesReady) cats=cats.filter(c=>(categoryPreviewCache.get(c)||[]).length>0);
  wrap.innerHTML=["All",...new Set(cats)].map(c=>`<button class="category-chip ${selectedCategory===c?"active":""}" type="button" data-category="${esc(c)}">${esc(c)}</button>`).join("");
}

function columns(){ const grid=document.getElementById("product-grid"); if(!grid)return 1; const w=grid.clientWidth; return w<520?1:w<720?2:Math.max(1,Math.floor((w+16)/(220+16))); }
function rowHeight(){ const grid=document.getElementById("product-grid"), first=grid?.querySelector(".product-card"); if(!first)return 360; const gap=parseFloat(getComputedStyle(grid).rowGap||getComputedStyle(grid).gap)||16; return Math.max(160,first.getBoundingClientRect().height+gap); }
function targetCount(){ const grid=document.getElementById("product-grid"); if(!grid)return 0; const top=grid.getBoundingClientRect().top+scrollY; const depth=Math.max(innerHeight,scrollY+innerHeight-top); const rows=Math.ceil(depth/rowHeight())+2; return rows*columns(); }
function appendUntilTarget(){ const grid=document.getElementById("product-grid"); if(!grid)return; const target=Math.min(visibleItems.length,targetCount()); if(target>renderedCount){ grid.insertAdjacentHTML("beforeend",visibleItems.slice(renderedCount,target).map(card).join("")); renderedCount=target; } updateMeta(); }
function resetRendered(){ const grid=document.getElementById("product-grid"); if(!grid)return; visibleItems=filtered(); renderedCount=0; grid.innerHTML=""; const empty=document.getElementById("empty-state"); if(empty) empty.style.display=visibleItems.length?"none":"block"; appendUntilTarget(); }

async function loadCounts(){
  try{
    const cached=JSON.parse(localStorage.getItem(CATEGORY_COUNT_CACHE_KEY)||"null");
    if(cached?.savedAt&&Date.now()-cached.savedAt<CATEGORY_COUNT_CACHE_MS){
      categoryCounts=new Map(Object.entries(cached.counts||{}));countsReady=true;renderChips();updateMeta();return;
    }
  }catch{}
  const counts=new Map();
  await Promise.all(filterCategories.map(async c=>{try{const s=await getCountFromServer(query(collection(db,"liveproducts"),where("category","==",c)));counts.set(c,s.data().count||0)}catch{counts.set(c,0)}}));
  categoryCounts=counts;countsReady=true;
  try{localStorage.setItem(CATEGORY_COUNT_CACHE_KEY,JSON.stringify({savedAt:Date.now(),counts:Object.fromEntries(counts)}))}catch{}
  renderChips();updateMeta();
}

async function preloadCategorySamples(){
  await Promise.all(filterCategories.map(async category=>{
    if(hidden(category)) return;
    try{
      const s=await getDocs(query(collection(db,"liveproducts"),where("category","==",category),limit(CATEGORY_SAMPLE_SIZE)));
      categoryPreviewCache.set(category,normalize(s.docs));
    }catch{
      categoryPreviewCache.set(category,[]);
    }
  }));
  categorySamplesReady=true;
  renderChips();
}

async function loadCategories(){
  try{
    const s=await getDocs(collection(db,"categories"));
    const stored=s.docs.map(d=>d.data().name||d.id).filter(c=>c&&!hidden(c));
    filterCategories=[...new Set([...FALLBACK_FILTER_CATEGORIES,...stored])];
  }catch{}
  renderChips();
  void preloadCategorySamples();
  void loadCounts();
}

async function loadInitial(){
  loadingPage=true;
  try{
    const s=await getDocs(query(collection(db,"liveproducts"),orderBy("sortOrder","asc"),limit(PAGE_SIZE)));
    lastAllDoc=s.docs.at(-1)||null;allFinished=s.docs.length<PAGE_SIZE;firebaseItems=normalize(s.docs);
  }catch{
    const s=await getDocs(query(collection(db,"liveproducts"),limit(PAGE_SIZE)));
    lastAllDoc=s.docs.at(-1)||null;allFinished=s.docs.length<PAGE_SIZE;firebaseItems=normalize(s.docs);
  }finally{loadingPage=false;}
  resetRendered();
  document.getElementById("spreadsheet-loading")?.style.setProperty("display","none");
  document.getElementById("product-grid")?.style.setProperty("display","grid");
}

async function loadNextPage(){
  if(loadingPage||allFinished||selectedCategory!=="All"||searchTerm.trim()||selectedBrand)return;
  loadingPage=true;
  try{
    const q=lastAllDoc?query(collection(db,"liveproducts"),orderBy("sortOrder","asc"),startAfter(lastAllDoc),limit(PAGE_SIZE)):query(collection(db,"liveproducts"),orderBy("sortOrder","asc"),limit(PAGE_SIZE));
    const s=await getDocs(q);
    if(s.docs.length)lastAllDoc=s.docs.at(-1);
    if(s.docs.length<PAGE_SIZE)allFinished=true;
    merge(normalize(s.docs));visibleItems=filtered();appendUntilTarget();
  }catch{}finally{loadingPage=false;}
}

async function loadCategory(category){
  selectedCategory=category;selectedBrand="";searchTerm="";
  const input=document.getElementById("search-input");if(input)input.value="";
  renderChips();
  if(category==="All"){resetRendered();return;}
  if(categoryCache.has(category)){firebaseItems=categoryCache.get(category);resetRendered();return;}

  const preview=categoryPreviewCache.get(category)||[];
  if(preview.length){firebaseItems=preview;resetRendered();}

  try{
    const s=await getDocs(query(collection(db,"liveproducts"),where("category","==",category)));
    const items=normalize(s.docs).sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0));
    categoryCache.set(category,items);
    firebaseItems=items;
    resetRendered();
  }catch{
    if(!preview.length){firebaseItems=[];resetRendered();}
  }
}

async function ensureFullForSearch(){ if(fullSearchLoaded)return; const s=await getDocs(collection(db,"liveproducts")); firebaseItems=normalize(s.docs); fullSearchLoaded=true; resetRendered(); }

async function maybeLoadMore(){
  if(renderFrame)return;
  renderFrame=requestAnimationFrame(async()=>{
    renderFrame=0;
    appendUntilTarget();
    if(selectedCategory==="All"&&!searchTerm.trim()&&!selectedBrand&&renderedCount>=visibleItems.length-2&&!allFinished){await loadNextPage();appendUntilTarget();}
  });
}

function renderCurrencyList(search=""){ const list=document.getElementById("currency-list"); if(!list)return; const n=search.trim().toLowerCase(); list.innerHTML=Object.entries(currencyNames).filter(([c,name])=>!n||c.toLowerCase().includes(n)||name.toLowerCase().includes(n)).map(([c,name])=>`<button class="currency-option ${c===selectedCurrency?"selected":""}" type="button" data-currency="${c}"><span class="currency-code">${c}</span><span class="currency-name">${name}</span></button>`).join(""); }
function openCurrencyPicker(required=false){ const overlay=document.getElementById("currency-overlay"), close=document.getElementById("currency-close"); if(!overlay)return; overlay.classList.add("open"); if(close)close.hidden=required||!selectedCurrency; renderCurrencyList(); }
function closeCurrencyPicker(){ if(selectedCurrency)document.getElementById("currency-overlay")?.classList.remove("open"); }
function chooseCurrency(code){ selectedCurrency=code;localStorage.setItem(CURRENCY_KEY,code);document.getElementById("currency-overlay")?.classList.remove("open");const pill=document.getElementById("currency-pill");if(pill)pill.textContent=`Currency: ${code}`;resetRendered(); }
async function loadCurrencyData(){ try{const cached=JSON.parse(localStorage.getItem(RATE_CACHE_KEY)||"null");if(cached?.rates)cnyRates={...cnyRates,...cached.rates}}catch{} try{const [c,r]=await Promise.all([fetch("https://api.frankfurter.dev/v1/currencies"),fetch("https://api.frankfurter.dev/v1/latest?base=CNY")]);if(c.ok)currencyNames={...currencyNames,...await c.json()};if(r.ok){const d=await r.json();cnyRates={...cnyRates,CNY:1,...d.rates};localStorage.setItem(RATE_CACHE_KEY,JSON.stringify({rates:cnyRates,savedAt:Date.now()}));resetRendered()}}catch{} }
function initializeCurrency(){ const pill=document.getElementById("currency-pill");if(pill)pill.textContent=`Currency: ${selectedCurrency||"Select"}`;document.getElementById("currency-search")?.addEventListener("input",e=>renderCurrencyList(e.target.value));document.getElementById("currency-list")?.addEventListener("click",e=>{const o=e.target.closest("[data-currency]");if(o)chooseCurrency(o.dataset.currency)});document.getElementById("currency-close")?.addEventListener("click",closeCurrencyPicker);if(!selectedCurrency)openCurrencyPicker(true);void loadCurrencyData(); }

const searchInput=document.getElementById("search-input");
if(searchInput){searchInput.value=searchTerm;searchInput.addEventListener("input",e=>{searchTerm=e.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(async()=>{if(searchTerm.trim())await ensureFullForSearch();resetRendered();},220)})}
document.getElementById("category-chips")?.addEventListener("click",e=>{const chip=e.target.closest("[data-category]");if(chip)void loadCategory(chip.dataset.category)});
document.getElementById("product-grid")?.addEventListener("click",e=>{const a=e.target.closest("[data-agent-product]");if(a){window.rcTrackProductInteraction?.(a.dataset.agentProduct,"outboundClicks");return}const v=e.target.closest("[data-view-product]");if(v)window.rcTrackProductInteraction?.(v.dataset.viewProduct,"viewClicks")});
window.addEventListener("scroll",maybeLoadMore,{passive:true});
window.addEventListener("resize",maybeLoadMore);
window.setCategory=loadCategory;
window.clearCategory=()=>loadCategory("All");
window.openCurrencyPicker=openCurrencyPicker;
window.copyProductLink=async(url,id)=>{if(url&&url!=="#"){await navigator.clipboard.writeText(new URL(url,location.href).href);window.rcTrackProductInteraction?.(id,"copyClicks")}};

initializeCurrency();
renderChips();
void loadCategories();
await loadInitial();
if(searchTerm.trim()||selectedBrand){await ensureFullForSearch();resetRendered();}
