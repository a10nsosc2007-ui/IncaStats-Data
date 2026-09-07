
(() => {
'use strict';
const $=id=>document.getElementById(id);
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const norm=(v='')=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const state={status:null,props:[],fixtures:[],busy:false};
const marketDefs=[
  {keys:['player_shots','player shots','shots'],metric:'shots',label:'Tiros'},
  {keys:['player_shots_on_target','shots on target','sot'],metric:'sot',label:'Tiros a puerta'},
  {keys:['player_goal_scorer_anytime','goalscorer','to score','score anytime'],metric:'goals',label:'Gol'},
  {keys:['player_assists','assist'],metric:'assists',label:'Asistencia'},
  {keys:['player_to_receive_card','player card','card'],metric:'cards',label:'Tarjeta'}
];
function resolveMarket(row){
  const hay=norm(`${row.market_key||''} ${row.market_name||''}`);
  return marketDefs.find(d=>d.keys.some(k=>hay.includes(norm(k))))||null;
}
function metricValue(row,key){
  if(key==='shots')return Number(row.Tiros_Totales||0);
  if(key==='sot')return Number(row.Tiros_Al_Arco||0);
  if(key==='goals')return Number(row.Goles||0);
  if(key==='assists')return Number(row.Asistencias||0);
  if(key==='cards')return Number(row.Tarjetas??((Number(row.Tarjetas_Amarillas)||0)+(Number(row.Tarjetas_Rojas)||0)));
  return 0;
}
function hit(value,direction,point){
  const p=Number(point);if(!Number.isFinite(p))return null;
  return String(direction||'over').toLowerCase()==='under'?value<p:value>p;
}
function playerByName(name,competitionId){
  const dir=window.INCA_PLAYERS?.directoryForLeague?.(Number(competitionId))||[];
  const q=norm(name);if(!q)return null;
  let best=null,score=-1;
  for(const p of dir){
    const x=norm(p.name);let s=x===q?100:x.includes(q)||q.includes(x)?80:0;
    if(!s){const A=new Set(x.split(' ')),B=q.split(' ');s=B.filter(t=>A.has(t)).length*20;}
    if(s>score){score=s;best=p;}
  }
  return score>=40?best:null;
}
async function analyzeProp(prop,fixture,sample){
  const def=resolveMarket(prop);if(!def)return {...prop,fixture,analyzable:false};
  const comp=Number(fixture?.sofascore_competition_id||0),p=playerByName(prop.player_name,comp);
  if(!p)return {...prop,fixture,analyzable:false,def};
  let rows=[];
  try{rows=await window.INCA_PLAYERS?.rowsForPlayerFull?.(Number(p.id))||window.INCA_PLAYERS?.rowsForPlayer?.(Number(p.id))||[];}catch{}
  rows=rows.filter(r=>!comp||Number(r.Competition_ID)===comp).slice(0,sample);
  const results=rows.map(r=>hit(metricValue(r,def.metric),prop.direction,prop.point)).filter(v=>v!==null);
  const hits=results.filter(Boolean).length,rate=results.length?hits/results.length*100:null;
  const price=Number(prop.price),implied=price>1?100/price:null;
  const edge=rate!==null&&implied!==null?rate-implied:null;
  return {...prop,fixture,analyzable:true,def,playerId:p.id,rows:results.length,hits,rate,implied,edge};
}
function injectStatus(){
  if(document.getElementById('incaDataProRail'))return;
  const host=document.querySelector('.portal-header')||document.querySelector('.portal-shell')||document.body;
  const rail=document.createElement('section');rail.id='incaDataProRail';rail.className='inca-data-pro-rail';
  rail.innerHTML=`<div><i class="fa-solid fa-satellite-dish"></i><span><b>DATA PRO</b><small id="incaDataProStamp">Cache central · usuarios 0 llamadas API</small></span></div><div class="inca-data-pro-chips"><em>31 LIGAS</em><em>26 PRECIO</em><em>TITAN + API</em></div>`;
  host.prepend(rail);
}
async function syncStatus(){
  injectStatus();
  try{
    const d=await window.INCA_API_CACHE?.get?.('status',{},120000);state.status=d;
    const t=$('incaDataProStamp');if(t){
      const dt=d?.last_success_at?new Date(d.last_success_at):null;
      t.textContent=dt&&!Number.isNaN(dt.getTime())?`Última sync ${new Intl.DateTimeFormat('es-PE',{dateStyle:'short',timeStyle:'short'}).format(dt)} · cache central`:'Cache central · usuarios 0 llamadas API';
    }
  }catch{}
}
function marketPanel(){
  const root=$('ppsQRoot');if(!root||$('incaRealPropsPanel'))return;
  const box=document.createElement('section');box.id='incaRealPropsPanel';box.className='inca-real-props';
  box.innerHTML=`<header><div><span>MERCADO REAL · PRO</span><h3>PLAYER VALUE SCANNER</h3><p>Solo cuotas publicadas por bookmaker. La racha es contexto; sin precio real no se etiqueta como pick.</p></div><div class="inca-real-badges"><b>BET365 / BETANO</b><small>prioridad si el feed las devuelve</small></div></header>
  <div class="inca-real-filters">
    <label><span>BOOKMAKER</span><select id="irBook"><option value="">TODOS</option></select></label>
    <label><span>MERCADO</span><select id="irMarket"><option value="">TODOS</option></select></label>
    <label><span>CUOTA MÍN.</span><input id="irMinOdd" type="number" min="1.01" step=".05" value="1.50"></label>
    <label><span>RACHA MÍN.</span><select id="irMinRate"><option value="50">50%+</option><option value="60" selected>60%+</option><option value="70">70%+</option><option value="80">80%+</option></select></label>
    <label><span>MUESTRA</span><select id="irSample"><option>5</option><option selected>10</option><option>15</option></select></label>
    <button type="button" id="irRun"><i class="fa-solid fa-wand-magic-sparkles"></i> ANALIZAR MEJORES</button>
  </div><div id="irSummary" class="inca-real-summary"></div><div id="irResults" class="inca-real-results"><div class="inca-real-empty"><i class="fa-solid fa-shield-halved"></i><b>Listo para mercados reales</b><span>Selecciona filtros y pulsa Analizar mejores. Esta acción lee CACHE; no consume API.</span></div></div>`;
  const anchor=root.querySelector('.ppsQ-empty')||root.children[1];anchor?.before(box);
  $('irRun').onclick=run;
  loadLists();
}
async function loadLists(){
  try{
    const [p,f]=await Promise.all([
      window.INCA_API_CACHE.get('playerprops',{hours:336},300000),
      window.INCA_API_CACHE.get('fixtures',{hours:336},300000)
    ]);
    state.props=p?.playerprops||[];state.fixtures=f?.fixtures||[];
    const priority=['bet365','betano','pinnacle','betfair','unibet'];
    const books=[...new Set(state.props.map(x=>x.bookmaker).filter(Boolean))].sort((a,b)=>{const aa=priority.findIndex(x=>norm(a).includes(x)),bb=priority.findIndex(x=>norm(b).includes(x));return (aa<0?99:aa)-(bb<0?99:bb)||String(a).localeCompare(String(b),'es');});
    const markets=[...new Set(state.props.map(x=>x.market_name||x.market_key).filter(Boolean))].sort();
    if($('irBook'))$('irBook').innerHTML='<option value="">TODOS</option>'+books.map(x=>`<option>${esc(x)}</option>`).join('');
    if($('irMarket'))$('irMarket').innerHTML='<option value="">TODOS</option>'+markets.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    const s=$('irSummary');if(s)s.innerHTML=`<span><b>${state.props.length}</b><small>precios player</small></span><span><b>${books.length}</b><small>bookmakers</small></span><span><b>${state.fixtures.length}</b><small>fixtures cache</small></span>`;
  }catch{}
}
async function run(){
  if(state.busy)return;state.busy=true;
  const out=$('irResults');if(out)out.innerHTML='<div class="inca-real-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cruzando cuota real con TITAN…</div>';
  try{
    await window.INCA_PLAYERS?.ensureReady?.();await window.INCA_PLAYERS?.ensureCurrentReady?.().catch(()=>{});
    await loadLists();
    const comp=Number($('ppsQLeague')?.value||0),book=$('irBook')?.value||'',market=$('irMarket')?.value||'',minOdd=Number($('irMinOdd')?.value||1.5),minRate=Number($('irMinRate')?.value||60),sample=Number($('irSample')?.value||10);
    const fxMap=new Map(state.fixtures.map(x=>[Number(x.fixture_id),x]));
    let rows=state.props.filter(p=>{
      const fx=fxMap.get(Number(p.fixture_id));if(!fx)return false;
      if(comp&&Number(fx.sofascore_competition_id)!==comp)return false;
      if(book&&p.bookmaker!==book)return false;
      if(market&&(p.market_name||p.market_key)!==market)return false;
      return Number(p.price)>=minOdd;
    }).slice(0,120);
    const analyzed=[];for(const p of rows)analyzed.push(await analyzeProp(p,fxMap.get(Number(p.fixture_id)),sample));
    const good=analyzed.filter(x=>x.analyzable&&x.rows>=Math.min(5,sample)&&x.rate>=minRate).sort((a,b)=>(b.edge??-999)-(a.edge??-999)||b.rate-a.rate||Number(b.price)-Number(a.price)).slice(0,40);
    if(!good.length){
      out.innerHTML=`<div class="inca-real-empty warning"><i class="fa-solid fa-filter-circle-xmark"></i><b>Sin picks reales que superen el filtro</b><span>${rows.length?'Hay cuotas reales, pero ninguna supera racha/muestra.':'No hay player props reales publicados para esta liga/filtro.'} No se fabrican líneas ni cuotas.</span></div>`;return;
    }
    out.innerHTML=good.map((x,i)=>{
      const fx=x.fixture||{},price=Number(x.price).toFixed(2),edge=Number.isFinite(x.edge)?`${x.edge>=0?'+':''}${x.edge.toFixed(1)} pp`:'—';
      return `<article class="inca-real-card"><div class="inca-real-rank">${i+1}</div><div class="inca-real-main"><span>${esc(fx.league_name||'')} · ${esc(x.bookmaker||'BOOK')}</span><h4>${esc(x.player_name)}</h4><p>${esc(fx.home_team_name||'')} <b>vs</b> ${esc(fx.away_team_name||'')}</p><em>${esc(x.market_name||x.market_key)} · ${esc(x.direction||'')} ${x.point??''}</em></div><div class="inca-real-kpi odd"><small>CUOTA REAL</small><b>${price}</b></div><div class="inca-real-kpi"><small>HIT ${x.rows}</small><b>${x.hits}/${x.rows}</b><em>${x.rate.toFixed(0)}%</em></div><div class="inca-real-kpi edge"><small>EDGE BRUTO</small><b>${edge}</b><em>vs implícita ${x.implied?.toFixed(0)||'—'}%</em></div></article>`;
    }).join('');
  }catch(e){
    out.innerHTML=`<div class="inca-real-empty warning"><i class="fa-solid fa-triangle-exclamation"></i><b>No se pudo abrir Mercado PRO</b><span>${esc(e.message||'CACHE')}</span></div>`;
  }finally{state.busy=false;}
}
function watchPlayers(){
  const obs=new MutationObserver(()=>marketPanel());obs.observe(document.documentElement,{childList:true,subtree:true});marketPanel();
}
document.addEventListener('DOMContentLoaded',()=>{syncStatus();watchPlayers();});
window.addEventListener('inca:auth-ready',syncStatus);
})();
