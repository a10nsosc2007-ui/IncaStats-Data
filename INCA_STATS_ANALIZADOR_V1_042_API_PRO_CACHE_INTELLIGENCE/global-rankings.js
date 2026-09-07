(() => {
'use strict';

const $=id=>document.getElementById(id);
const TITAN=()=>window.INCA_TITAN;
const CORE=()=>window.INCA_BET_CORE;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const CACHE_DB='inca_rankings_csv_cache_v2';
const CACHE_STORE='samples';
const CACHE_KEY='all_teams_l25';
const CACHE_TTL=6*60*60*1000; // 6 h. Cache local; los CSV siguen siendo la fuente.

const state={
  initialized:false,
  compact:new Map(),
  loadingPromise:null,
  loadGeneration:0,
  renderGeneration:0,
  cacheSavedAt:0,
  refreshing:false
};

function fmt(v){
  if(!Number.isFinite(Number(v)))return '—';
  const n=Number(v);
  return Math.abs(n)>=100?n.toFixed(0):Math.abs(n)>=10?n.toFixed(1):n.toFixed(2);
}
function pct(v){return Number.isFinite(Number(v))?`${Number(v).toFixed(1)}%`:'—';}

function parseDate(value){
  const s=String(value||'').trim();
  if(!s)return 0;
  if(/^\d{4}-\d{2}-\d{2}/.test(s)){
    const t=new Date(s).getTime(); if(Number.isFinite(t))return t;
  }
  const m=/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(s);
  if(m)return new Date(Number(m[3]),Number(m[2])-1,Number(m[1])).getTime()||0;
  return new Date(s).getTime()||0;
}

function num(v){
  if(v===null||v===undefined)return null;
  const s=String(v).trim();
  if(!s||/^(?:null|nan|n\/a|undefined)$/i.test(s))return null;
  const n=Number(s.replace('%','').replace(',','.'));
  return Number.isFinite(n)?n:null;
}

function metricValue(row,metric){
  if(!row)return null;
  if(metric==='__cards'){
    const y=num(row['Yellow cards']),r=num(row['Red cards']);
    if(y===null&&r===null)return null;
    return (y||0)+(r||0);
  }
  if(metric==='__booking'){
    const y=num(row['Yellow cards']),r=num(row['Red cards']);
    const syr=num(row['Second_Yellow_Reds']??row['second_yellow_red'])||0;
    if(y===null&&r===null)return null;
    return window.INCA_TITAN?.bookingPointsInca ? window.INCA_TITAN.bookingPointsInca(y||0,r||0,syr) : ((r||0)>0 ? (r||0)*20 + ((y||0)>0 ? 10 : 0) : (y||0)*10);
  }
  if(metric==='__tackles'){
    const t=num(row['Total tackles']);
    return t!==null?t:num(row['Tackles']);
  }
  return num(row[metric]);
}

function allTeams(){
  return (TITAN()?.getCatalog?.()?.teams||[])
    .filter(t=>Number(t.team_id)&&String(t.name||'').trim())
    .map(t=>({
      team_id:Number(t.team_id),
      name:String(t.name||'').trim(),
      country:String(t.country||'').trim(),
      region:String(t.region||'').trim()
    }))
    .sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));
}

function marketEntries(){return Object.entries(CORE()?.MARKET_CONFIG||{});}
function marketOptions(){
  return marketEntries().map(([key,m])=>`<option value="${esc(key)}">${esc(m.label)}</option>`).join('');
}
function modeOptions(marketKey){
  const market=CORE()?.MARKET_CONFIG?.[marketKey];
  if(!market)return '';
  const opts=[];
  if(market.lines?.team)opts.push(['team','Equipo']);
  if(market.lines?.rival)opts.push(['rival','Rival / recibido']);
  if(market.lines?.total)opts.push(['total','Total del partido']);
  return opts.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
}
function lineOptions(marketKey,mode){
  return (CORE()?.lines?.(marketKey,mode)||[]).map(v=>`<option value="${v}">${v}</option>`).join('');
}

function syncControls(){
  const market=$('grMarket').value;
  const oldMode=$('grMode').value;
  $('grMode').innerHTML=modeOptions(market);
  if([...$('grMode').options].some(o=>o.value===oldMode))$('grMode').value=oldMode;
  else $('grMode').value='team';

  const mode=$('grMode').value;
  const oldLine=Number($('grLine').value);
  $('grLine').innerHTML=lineOptions(market,mode);

  if([...$('grLine').options].some(o=>Number(o.value)===oldLine))$('grLine').value=String(oldLine);
  else{
    const arr=CORE()?.lines?.(market,mode)||[];
    if(arr.length)$('grLine').value=String(arr[Math.floor(arr.length/2)]);
  }
  updateActiveTitle();
}

function sampleSize(){return Number($('grSample')?.value)||15;}
function marketLabel(){return CORE()?.MARKET_CONFIG?.[$('grMarket').value]?.label||$('grMarket').value;}

function rankingTitle(){
  const label=marketLabel();
  const mode=$('grMode').value;
  const direction=$('grDirection').value;
  const line=$('grLine').value;
  const over=direction==='over';

  const modeText=
    mode==='team'?'del equipo':
    mode==='rival'?'recibidos / del rival':
    'totales del partido';

  return `${over?'Más':'Menos'} de ${line} ${label.toLowerCase()} ${modeText}`;
}

function updateActiveTitle(){
  const n=sampleSize();
  $('grActiveTitle').textContent=rankingTitle();
  $('grContext').textContent=`Últimos ${n} partidos reales de cada equipo · liga + copa + torneos internacionales`;
  const tag=$('grSampleTag');
  if(tag)tag.textContent=`L${n}`;
}

function logo(team){return TITAN()?.logoUrl?.(team.name,team.team_id)||'';}

function friendlyAge(ms){
  const min=Math.round(ms/60000);
  if(min<1)return 'ahora';
  if(min<60)return `hace ${min} min`;
  const h=Math.round(min/60);
  return `hace ${h} h`;
}

function etaText(done,total,started){
  if(!done)return '';
  const elapsed=Date.now()-started;
  const per=elapsed/done;
  const remain=Math.max(0,(total-done)*per);
  const sec=Math.round(remain/1000);
  if(sec<60)return ` · aprox. ${sec}s`;
  return ` · aprox. ${Math.ceil(sec/60)} min`;
}

function progress(done,total,ready,current='',started=Date.now()){
  const percent=total?Math.round(done/total*100):0;
  $('grStatus').innerHTML=`
    <div class="gr-live-progress">
      <span><i class="fa-solid fa-database"></i> Analizando datos ${done}/${total} · ${ready} equipos listos${current?` · ${esc(current)}`:''}${etaText(done,total,started)}</span>
      <strong>${percent}%</strong>
    </div>
    <div class="gr-live-bar"><i style="width:${percent}%"></i></div>`;
}

async function mapLimit(items,limit,task){
  const results=new Array(items.length);
  let cursor=0;
  const workers=Array.from({length:Math.min(limit,items.length)},async()=>{
    while(true){
      const i=cursor++;
      if(i>=items.length)break;
      try{results[i]=await task(items[i],i)}catch(_){results[i]=null}
    }
  });
  await Promise.all(workers);
  return results;
}

/* -------------------------- IndexedDB cache -------------------------- */
function openDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window))return reject(new Error('NO_IDB'));
    const req=indexedDB.open(CACHE_DB,1);
    req.onupgradeneeded=()=>req.result.createObjectStore(CACHE_STORE);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function cacheGet(){
  try{
    const db=await openDb();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(CACHE_STORE,'readonly');
      const req=tx.objectStore(CACHE_STORE).get(CACHE_KEY);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error);
    });
  }catch(_){return null}
}
async function cachePut(payload){
  try{
    const db=await openDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(CACHE_STORE,'readwrite');
      tx.objectStore(CACHE_STORE).put(payload,CACHE_KEY);
      tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);
    });
  }catch(_){}
}
async function cacheClear(){
  try{
    const db=await openDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(CACHE_STORE,'readwrite');
      tx.objectStore(CACHE_STORE).delete(CACHE_KEY);
      tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);
    });
  }catch(_){}
}

function pairIndex(history){
  const map=new Map();
  for(const row of history.allRows||[]){
    if(String(row.Tiempo||'').toUpperCase()!=='ALL')continue;
    const eid=String(row.Event_ID||''),tid=Number(row.Team_ID);
    if(!eid||!tid)continue;
    if(!map.has(eid))map.set(eid,new Map());
    map.get(eid).set(tid,row);
  }
  return map;
}

function compactHistory(history,maxSample=25){
  const ownId=Number(history.team?.team_id);
  const pairs=pairIndex(history);
  const seen=new Set();
  const events=[];

  for(const row of history.rows||[]){
    if(String(row.Tiempo||'').toUpperCase()!=='ALL')continue;
    const eid=String(row.Event_ID||'');
    if(!eid||seen.has(eid))continue;
    seen.add(eid);

    const pair=pairs.get(eid);
    const own=pair?.get(ownId)||row;
    const oppEntry=pair?[...pair.entries()].find(([tid])=>Number(tid)!==ownId):null;
    if(!oppEntry)continue;
    const [,opp]=oppEntry;

    events.push({eid,date:String(row.Fecha||''),t:parseDate(row.Fecha),own,opp});
  }

  events.sort((a,b)=>b.t-a.t||Number(b.eid)-Number(a.eid));
  const config=CORE()?.MARKET_CONFIG||{};

  return{
    team:{
      team_id:ownId,
      name:String(history.team?.name||''),
      country:String(history.team?.country||''),
      region:String(history.team?.region||'')
    },
    events:events.slice(0,maxSample).map(e=>{
      const values={};
      for(const [key,m] of Object.entries(config)){
        const a=metricValue(e.own,m.metric);
        const b=metricValue(e.opp,m.metric);
        values[key]=[a,b,(a!==null&&b!==null)?a+b:null];
      }
      return{eid:e.eid,date:e.date,t:e.t,v:values};
    })
  };
}

function hydrateCache(payload){
  state.compact.clear();
  for(const item of payload?.teams||[]){
    if(Number(item?.team?.team_id)&&Array.isArray(item.events)){
      state.compact.set(Number(item.team.team_id),item);
    }
  }
  state.cacheSavedAt=Number(payload?.savedAt)||0;
}

async function loadCache(){
  const cached=await cacheGet();
  if(!cached?.teams?.length)return false;
  hydrateCache(cached);
  $('grStatus').innerHTML=`
    <i class="fa-solid fa-bolt"></i>
    ${state.compact.size} equipos listos desde caché local · ${friendlyAge(Date.now()-state.cacheSavedAt)}`;
  return true;
}

async function refreshFromCsv(force=false){
  if(state.refreshing&&!force)return;
  state.refreshing=true;

  if(force){
    state.loadGeneration++;
    TITAN()?.clearTeamHistoryCache?.();
    await cacheClear();
  }

  const generation=state.loadGeneration;
  const teams=allTeams();
  const started=Date.now();
  let done=0,ready=0;
  const next=new Map();

  progress(0,teams.length,0,'leyendo CSV actuales',started);

  await mapLimit(teams,18,async team=>{
    if(generation!==state.loadGeneration)return;
    try{
      const history=await CORE().teamHistory(team.team_id);
      const compact=compactHistory(history,25);
      if(compact.events.length){
        next.set(team.team_id,compact);
        ready++;
      }
    }catch(_){
      // Silencioso para usuario: simplemente no entra al ranking hasta tener muestra.
    }finally{
      done++;
      if(done===1||done%5===0||done===teams.length){
        progress(done,teams.length,ready,team.name,started);
      }
    }
  });

  if(generation!==state.loadGeneration){state.refreshing=false;return}

  if(next.size){
    state.compact=next;
    state.cacheSavedAt=Date.now();
    await cachePut({
      schema:'incastats.rankings.direct_csv.cache.v2',
      savedAt:state.cacheSavedAt,
      teams:[...next.values()]
    });
  }

  $('grStatus').innerHTML=`
    <i class="fa-solid fa-circle-check"></i>
    ${state.compact.size} equipos listos · datos actualizados desde tus CSV`;
  state.refreshing=false;

  if(state.compact.size)computeRanking();
}

async function ensureData(){
  if(state.compact.size)return state.compact;

  const hasCache=await loadCache();
  if(hasCache){
    if(Date.now()-state.cacheSavedAt>CACHE_TTL){
      // Muestra ranking de inmediato; actualización silenciosa en segundo plano.
      setTimeout(()=>refreshFromCsv(false),50);
    }
    return state.compact;
  }

  // Primera vez en este navegador: inevitablemente hay que leer los CSV.
  await refreshFromCsv(false);
  return state.compact;
}

function eventValue(e,market,mode){
  const cell=e?.v?.[market];
  if(!Array.isArray(cell))return null;
  return mode==='team'?cell[0]:mode==='rival'?cell[1]:cell[2];
}

function teamStat(compact,options){
  const rows=(compact.events||[]).slice(0,options.sample);
  const values=rows.map(e=>({e,value:eventValue(e,options.market,options.mode)}))
    .filter(x=>Number.isFinite(Number(x.value)));

  if(!values.length)return null;

  const line=Number(options.line);
  const decisions=values.filter(x=>Number(x.value)!==line);
  if(!decisions.length)return null;

  const hits=decisions.filter(x=>options.direction==='under'?Number(x.value)<line:Number(x.value)>line).length;
  const rate=hits/decisions.length*100;
  const avg=values.reduce((a,b)=>a+Number(b.value),0)/values.length;

  let streak=0;
  for(const x of values){
    if(Number(x.value)===line)break;
    const hit=options.direction==='under'?Number(x.value)<line:Number(x.value)>line;
    if(!hit)break;
    streak++;
  }

  return{
    team:compact.team,
    rate,hits,n:decisions.length,valid:values.length,avg,streak
  };
}

async function computeRanking(){
  const generation=++state.renderGeneration;
  const sample=sampleSize();
  const options={
    market:$('grMarket').value,
    mode:$('grMode').value,
    line:Number($('grLine').value),
    direction:$('grDirection').value,
    sample
  };
  const top=Number($('grTop').value)||10;

  updateActiveTitle();

  if(!state.compact.size){
    $('grResults').innerHTML='<div class="gr-empty"><i class="fa-solid fa-spinner fa-spin"></i> Preparando datos…</div>';
    return;
  }

  const rows=[];
  for(const compact of state.compact.values()){
    const stat=teamStat(compact,options);
    if(stat)rows.push(stat);
  }
  if(generation!==state.renderGeneration)return;

  // Comparabilidad adaptada a la muestra elegida.
  const minPrimary=Math.max(3,Math.ceil(sample*0.70));
  const minFallback=Math.max(3,Math.ceil(sample*0.50));
  let filtered=rows.filter(r=>r.n>=minPrimary);
  if(filtered.length<Math.min(top,10))filtered=rows.filter(r=>r.n>=minFallback);

  filtered.sort((a,b)=>{
    if(b.rate!==a.rate)return b.rate-a.rate;
    if(b.streak!==a.streak)return b.streak-a.streak;
    return options.direction==='under'?a.avg-b.avg:b.avg-a.avg;
  });

  renderRows(filtered.slice(0,top),options);
  $('grCalcStatus').textContent=`${filtered.length} equipos comparables · muestra L${sample}`;
}

function renderRows(rows,options){
  const target=$('grResults');
  if(!rows.length){
    target.innerHTML='<div class="gr-empty">No hay muestra suficiente para esta línea.</div>';
    return;
  }

  const podium=rows.slice(0,3),rest=rows.slice(3);
  const card=(r,i)=>{
    const team={team_id:Number(r.team.team_id),name:r.team.name,country:r.team.country,region:r.team.region};
    const url=logo(team);
    return `<article class="gr-podium-card p${i+1}">
      <span class="gr-medal">${i+1}</span>
      <div class="gr-podium-logo">${url?`<img src="${esc(url)}" alt="" onerror="this.style.display='none'">`:'<i class="fa-solid fa-shield"></i>'}</div>
      <h3>${esc(team.name)}</h3>
      <small>${esc(team.country||team.region||'')}</small>
      <strong>${pct(r.rate)}</strong>
      <span>${r.hits}/${r.n} aciertos · prom. ${fmt(r.avg)} · racha ${r.streak}</span>
    </article>`;
  };

  target.innerHTML=`
    <section class="gr-podium">${podium.map(card).join('')}</section>
    <section class="gr-list">
      ${rest.map((r,i)=>{
        const team={team_id:Number(r.team.team_id),name:r.team.name,country:r.team.country,region:r.team.region};
        const url=logo(team);
        return `<div class="gr-row">
          <span class="gr-rank">${i+4}</span>
          <span class="gr-logo">${url?`<img src="${esc(url)}" alt="" loading="lazy" onerror="this.style.display='none'">`:'<i class="fa-solid fa-shield"></i>'}</span>
          <span class="gr-team">
            <b>${esc(team.name)}</b>
            <small>${r.hits}/${r.n} aciertos · prom. ${fmt(r.avg)} · racha ${r.streak}</small>
          </span>
          <strong>${pct(r.rate)}</strong>
        </div>`;
      }).join('')}
    </section>`;
}

async function run(force=false){
  updateActiveTitle();
  const btn=$('grRun');
  btn.disabled=true;
  btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Procesando';

  try{
    if(force){
      await refreshFromCsv(true);
    }else{
      await ensureData();
      await computeRanking();
    }
  }catch(_){
    $('grResults').innerHTML='<div class="gr-empty"><i class="fa-solid fa-clock-rotate-left"></i><h3>Datos temporalmente no disponibles</h3><p>Intenta nuevamente en unos segundos.</p></div>';
  }finally{
    btn.disabled=false;
    btn.innerHTML='<i class="fa-solid fa-ranking-star"></i> Calcular ranking';
  }
}

async function init(){
  if(state.initialized)return;
  state.initialized=true;

  await TITAN()?.ensureReady?.();
  await TITAN()?.ensureTeamDetails?.();
  TITAN()?.ensureLogoIndex?.().catch(()=>{});

  $('grMarket').innerHTML=marketOptions();
  $('grMarket').value='shots';
  syncControls();

  $('grMarket').addEventListener('change',()=>syncControls());
  $('grMode').addEventListener('change',()=>syncControls());
  $('grLine').addEventListener('change',updateActiveTitle);
  $('grDirection').addEventListener('change',updateActiveTitle);
  $('grSample').addEventListener('change',()=>{
    updateActiveTitle();
    if(state.compact.size)computeRanking();
  });
  $('grTop').addEventListener('change',()=>{if(state.compact.size)computeRanking();});

  $('grRun').addEventListener('click',()=>run(false));
  $('grReload')?.addEventListener('click',()=>run(true));

  const cacheReady=await loadCache();
  if(cacheReady){
    updateActiveTitle();
    computeRanking();
    if(Date.now()-state.cacheSavedAt>CACHE_TTL)setTimeout(()=>refreshFromCsv(false),100);
  }else{
    $('grStatus').innerHTML=`<i class="fa-solid fa-bolt"></i> Primera carga: se leerán los CSV una sola vez y quedarán acelerados en este navegador.`;
  }

  $('grCalcStatus').textContent=cacheReady?'Ranking listo':'Sin calcular todavía';
}

window.INCA_GLOBAL_RANKINGS=Object.freeze({activate:init,run});
})();