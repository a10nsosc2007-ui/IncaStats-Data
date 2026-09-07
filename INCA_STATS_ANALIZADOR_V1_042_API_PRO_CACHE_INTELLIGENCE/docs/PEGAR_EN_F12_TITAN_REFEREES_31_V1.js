(async function TITAN_REFEREES_31_V1(){
'use strict';

const VERSION='1.0.0';
const APP_ID='incaTitanReferees31V1';
const API='/api/v1';
const DB_NAME='INCASTATS_TITAN_REFEREES_31_V1';
const DB_VERSION=1;
const STATE_KEY='run_state';
const MAX_SEED_MATCHES_PER_LEAGUE=50;
const MAX_REF_MATCHES=50;
const MAX_RETRIES=4;
const BOOKING_POINTS={yellow:10,effective_red:25}; // Política INCA configurable, NO universal de bookmaker.
const LEAGUES=[
  [17,'INGLATERRA','Premier League'],[18,'INGLATERRA','Championship'],[24,'INGLATERRA','League One'],[25,'INGLATERRA','League Two'],
  [8,'ESPAÑA','LaLiga EA Sports'],[54,'ESPAÑA','LaLiga Hypermotion'],[23,'ITALIA','Serie A'],[53,'ITALIA','Serie B'],
  [35,'ALEMANIA','Bundesliga'],[44,'ALEMANIA','2. Bundesliga'],[34,'FRANCIA','Ligue 1'],[182,'FRANCIA','Ligue 2'],
  [238,'PORTUGAL','Liga Portugal'],[239,'PORTUGAL','Liga Portugal 2'],[37,'PAÍSES BAJOS','Eredivisie'],[131,'PAÍSES BAJOS','Eerste Divisie'],
  [38,'BÉLGICA','Belgian Pro League'],[52,'TURQUÍA','Süper Lig'],[98,'TURQUÍA','1. Lig'],[45,'AUSTRIA','Austrian Bundesliga'],
  [215,'SUIZA','Swiss Super League'],[39,'DINAMARCA','Danish Superliga'],[40,'SUECIA','Allsvenskan'],[20,'NORUEGA','Eliteserien'],
  [152,'RUMANÍA','Liga I'],[185,'GRECIA','Super League Greece'],[325,'BRASIL','Brasileirão Série A'],[390,'BRASIL','Brasileirão Série B'],
  [155,'ARGENTINA','Liga Profesional Argentina'],[406,'PERÚ','Liga 1 Perú'],[242,'EE. UU. / CANADÁ','MLS']
].map(([id,country,name])=>({id,country,name}));

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const nowIso=()=>new Date().toISOString();
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const avg=a=>a.length?a.reduce((x,y)=>x+(Number(y)||0),0)/a.length:0;
const dmy=ts=>{const d=new Date(Number(ts||0)*1000);return Number.isNaN(d.getTime())?'':`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;};
const csvCell=v=>{if(v===null||v===undefined)return '';const s=typeof v==='object'?JSON.stringify(v):String(v);return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
const csv=(rows,cols)=>[cols.join(','),...rows.map(r=>cols.map(c=>csvCell(r[c])).join(','))].join('\n');
const finished=e=>e?.status?.type==='finished'||[100,106,110,113,120].includes(Number(e?.status?.code));
const eventObj=d=>d?.event||d||{};
const refObj=e=>e?.referee||e?.event?.referee||null;

let masterKey=window.LLAVE_MAESTRA_REF||null;
const originalFetch=window.fetch.bind(window);
if(!window.__INCA_REF_FETCH_HOOK__){
  window.__INCA_REF_FETCH_HOOK__=true;
  window.fetch=async function(...args){
    try{const cfg=args[1]||{},h=new Headers(cfg.headers||{}),k=h.get('x-requested-with');if(k&&k.length>=4)masterKey=k;}catch{}
    return originalFetch(...args);
  };
}

const R={running:false,paused:false,stop:false,phase:'idle',requests:0,leagueIndex:0,refIndex:0,referees:new Map(),seedEvents:new Map(),errors:[],rateGap:260,nextRequestAt:0,startedAt:null};

// --------------------------- IndexedDB checkpoint ---------------------------
function openDB(){return new Promise((resolve,reject)=>{const q=indexedDB.open(DB_NAME,DB_VERSION);q.onupgradeneeded=()=>{const db=q.result;if(!db.objectStoreNames.contains('kv'))db.createObjectStore('kv');if(!db.objectStoreNames.contains('referees'))db.createObjectStore('referees',{keyPath:'referee_id'});};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
async function idbPut(store,keyOrValue,value){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite'),os=tx.objectStore(store);if(value===undefined)os.put(keyOrValue);else os.put(value,keyOrValue);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
async function idbGet(store,key){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),q=tx.objectStore(store).get(key);q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>{db.close();reject(q.error);};});}
async function idbAll(store){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),q=tx.objectStore(store).getAll();q.onsuccess=()=>{db.close();resolve(q.result||[]);};q.onerror=()=>{db.close();reject(q.error);};});}
async function idbClear(){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(['kv','referees'],'readwrite');tx.objectStore('kv').clear();tx.objectStore('referees').clear();tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
async function checkpoint(extra={}){await idbPut('kv',STATE_KEY,{version:VERSION,phase:R.phase,leagueIndex:R.leagueIndex,refIndex:R.refIndex,requests:R.requests,referees:[...R.referees.values()],seedEvents:[...R.seedEvents.values()].map(e=>({id:e.id,startTimestamp:e.startTimestamp,tournament:e.tournament,season:e.season,homeTeam:e.homeTeam,awayTeam:e.awayTeam,status:e.status,referee:e.referee})),errors:R.errors.slice(-300),updated_at:nowIso(),...extra});}
async function restore(){const s=await idbGet('kv',STATE_KEY).catch(()=>null);if(!s)return false;R.phase=s.phase||'idle';R.leagueIndex=Number(s.leagueIndex)||0;R.refIndex=Number(s.refIndex)||0;R.requests=Number(s.requests)||0;R.referees=new Map((s.referees||[]).map(x=>[Number(x.id),x]));R.seedEvents=new Map((s.seedEvents||[]).map(x=>[Number(x.id),x]));R.errors=s.errors||[];return true;}

// ------------------------------ UI -----------------------------------------
document.getElementById(APP_ID)?.remove();
const panel=document.createElement('div');panel.id=APP_ID;panel.style.cssText='position:fixed;z-index:2147483647;top:12px;left:12px;width:520px;max-height:94vh;overflow:auto;background:#07130f;color:#e6f4ef;border:1px solid #1a5f4a;border-radius:12px;padding:13px;font:12px/1.45 Inter,Arial,sans-serif;box-shadow:0 18px 50px #0008';
panel.innerHTML=`
<div style="display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #24463b;padding-bottom:10px"><div><b style="font-size:17px;color:#37e2ad">TITAN REFEREES 31 · V1</b><div style="font-size:10px;color:#9dbcb1">31 LIGAS → ÁRBITROS ACTIVOS → ÚLTIMOS 50 → TARJETAS/FALTAS/PERIODOS</div></div><button id="irClose">✕</button></div>
<div style="margin-top:10px;padding:10px;border:1px solid #24463b;border-radius:9px;background:#0a1b15"><b>REGLA DE TARJETAS</b><div style="font-size:10px;color:#a9c2ba;margin-top:4px">✓ titular / jugador que entró · ✓ tarjeta en banco si luego entró · ✕ banco que nunca entró · ✕ DT/staff · ✕ tarjeta posterior a ser sustituido.</div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px"><label>Ritmo<select id="irSpeed" style="width:100%;padding:7px;background:#06110d;color:white;border:1px solid #315a4d;border-radius:6px"><option value="420">Seguro · 420 ms</option><option value="260" selected>Normal · 260 ms</option><option value="170">Turbo · 170 ms</option></select></label><label>Puntos amarilla / roja efectiva<div style="display:flex;gap:5px"><input id="irYellowPts" value="10" type="number" min="0" style="width:50%;padding:7px;background:#06110d;color:white;border:1px solid #315a4d;border-radius:6px"><input id="irRedPts" value="25" type="number" min="0" style="width:50%;padding:7px;background:#06110d;color:white;border:1px solid #315a4d;border-radius:6px"></div></label></div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:9px"><button id="irStart" style="padding:10px;background:#20d69b;border:0;border-radius:7px;font-weight:900;color:#042218">▶ INICIAR</button><button id="irPause" style="padding:10px;background:#203d34;border:0;border-radius:7px;font-weight:900;color:white">⏸ PAUSA</button><button id="irResume" style="padding:10px;background:#203d34;border:0;border-radius:7px;font-weight:900;color:white">↻ REANUDAR</button></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px"><button id="irExport" style="padding:9px;background:#175d49;border:0;border-radius:7px;font-weight:900;color:white">💾 EXPORTAR ACTUAL</button><button id="irReset" style="padding:9px;background:#392521;border:0;border-radius:7px;font-weight:900;color:#ffd4c8">BORRAR CHECKPOINT</button></div>
<div style="margin-top:10px;padding:10px;background:#05100c;border:1px solid #24463b;border-radius:9px"><div id="irStatus" style="font-weight:900;color:#64f4c5">Listo.</div><div style="height:8px;background:#183129;border-radius:99px;overflow:hidden;margin-top:8px"><div id="irBar" style="height:100%;width:0;background:#20d69b"></div></div><div id="irCounts" style="color:#a7bdb5;font-size:10px;margin-top:7px"></div></div>
<div id="irLog" style="margin-top:9px;max-height:190px;overflow:auto;background:#020806;padding:8px;border-radius:7px;font:10px/1.45 Consolas,monospace;color:#9fc2b5"></div>`;
document.body.appendChild(panel);
const $=id=>panel.querySelector('#'+id);
$('irClose').onclick=()=>panel.remove();
function log(msg,color='#9fc2b5'){const d=document.createElement('div');d.style.color=color;d.textContent=`${new Date().toLocaleTimeString()} · ${msg}`;$('irLog').prepend(d);}
function ui(status){if(status)$('irStatus').textContent=status;const total=Math.max(1,LEAGUES.length+R.referees.size),done=Math.min(total,R.leagueIndex+R.refIndex);$('irBar').style.width=`${Math.min(100,done/total*100)}%`;$('irCounts').textContent=`Fase: ${R.phase} · Ligas: ${R.leagueIndex}/${LEAGUES.length} · Árbitros: ${R.referees.size} · Procesados: ${R.refIndex}/${R.referees.size} · Requests: ${R.requests} · Errores: ${R.errors.length}`;}
async function waitIfPaused(){while(R.paused&&!R.stop)await sleep(350);if(R.stop)throw new Error('STOP_REQUESTED');}

// ------------------------- API / throttling --------------------------------
async function rateLimit(){await waitIfPaused();const now=Date.now(),wait=Math.max(0,R.nextRequestAt-now);if(wait)await sleep(wait);R.nextRequestAt=Math.max(Date.now(),R.nextRequestAt)+R.rateGap+Math.floor(Math.random()*70);if(R.requests>0&&R.requests%100===0){log('Enfriamiento preventivo 7 s','#f2cc69');await sleep(7000);}}
async function apiGet(path,opt={},retry=0){
  await rateLimit();R.requests++;ui();
  const headers={accept:'application/json,text/plain,*/*'};if(masterKey)headers['x-requested-with']=masterKey;
  let r;try{r=await originalFetch(API+path,{headers,credentials:'include',cache:'no-store'});}catch(e){if(retry>=MAX_RETRIES)throw e;await sleep(900*(retry+1));return apiGet(path,opt,retry+1);}
  if(r.status===429){if(retry>=MAX_RETRIES)throw new Error(`429: ${path}`);const t=6000*Math.pow(1.5,retry);log(`429 · enfriando ${Math.round(t/1000)} s`,'#f2cc69');await sleep(t);return apiGet(path,opt,retry+1);}
  if(r.status===403){masterKey=null;if(retry>=MAX_RETRIES)throw new Error(`403: ${path}`);log('403 · abre/navega SofaScore unos segundos para renovar llave. Reintento.','#f2cc69');await sleep(7000);return apiGet(path,opt,retry+1);}
  if(opt.allowMissing&&[400,404,410,422].includes(r.status))return {__missing:true,status:r.status};
  if(r.status>=500&&retry<MAX_RETRIES){await sleep(1000*(retry+1));return apiGet(path,opt,retry+1);}
  if(!r.ok)throw new Error(`${r.status} ${path}`);return r.json();
}
async function apiAny(paths){let last;for(const p of paths){try{const d=await apiGet(p,{allowMissing:true});if(!d?.__missing)return d;}catch(e){last=e;}}throw last||new Error('ENDPOINT_NOT_AVAILABLE');}

// -------------------------- League discovery -------------------------------
function seasonSortKey(s){const raw=String(s?.year||s?.name||'');const y=Math.max(...(raw.match(/\d{4}/g)||['0']).map(Number));return Number(s?.startTimestamp||s?.startTime||0)||y*1e9||Number(s?.id)||0;}
async function seasonsForLeague(compId){const d=await apiGet(`/unique-tournament/${compId}/seasons`);return (d?.seasons||[]).slice().sort((a,b)=>seasonSortKey(b)-seasonSortKey(a));}
async function recentLeagueEvents(league,limit=50){
  const seasons=await seasonsForLeague(league.id),map=new Map();
  for(const season of seasons.slice(0,4)){
    for(let page=0;page<12&&map.size<limit;page++){
      const d=await apiGet(`/unique-tournament/${league.id}/season/${season.id}/events/last/${page}`,{allowMissing:true});if(d?.__missing)break;
      const events=d?.events||[];for(const e of events){if(!finished(e))continue;const cid=Number(e?.tournament?.uniqueTournament?.id||league.id);if(cid!==league.id)continue;map.set(Number(e.id),e);}
      if(!d?.hasNextPage||!events.length)break;
    }
    if(map.size>=limit)break;
  }
  return [...map.values()].sort((a,b)=>Number(b.startTimestamp)-Number(a.startTimestamp)).slice(0,limit);
}
async function eventWithRef(e){if(refObj(e)?.id)return e;try{const d=await apiGet(`/event/${e.id}`,{allowMissing:true});const x=eventObj(d);return {...e,...x};}catch{return e;}}
async function discoverReferees(){
  R.phase='DISCOVERY';ui('Descubriendo árbitros en las 31 ligas…');
  for(let i=R.leagueIndex;i<LEAGUES.length;i++){
    await waitIfPaused();const league=LEAGUES[i];ui(`Liga ${i+1}/31 · ${league.name}`);log(`Escaneando ${league.name} · últimos ${MAX_SEED_MATCHES_PER_LEAGUE}`);
    try{
      const events=await recentLeagueEvents(league,MAX_SEED_MATCHES_PER_LEAGUE);
      for(const base of events){
        let e=base;if(!refObj(e)?.id)e=await eventWithRef(e);R.seedEvents.set(Number(e.id),e);
        const ref=refObj(e);if(!ref?.id)continue;const id=Number(ref.id),old=R.referees.get(id)||{id,name:ref.name||`Referee ${id}`,country:ref.country?.name||ref.country?.alpha2||'',discovered_in_competition_ids:[],seed_event_ids:[]};
        if(!old.discovered_in_competition_ids.includes(league.id))old.discovered_in_competition_ids.push(league.id);if(!old.seed_event_ids.includes(Number(e.id)))old.seed_event_ids.push(Number(e.id));R.referees.set(id,old);
      }
      log(`${league.name}: ${events.length} partidos · ${R.referees.size} árbitros únicos acumulados`,'#67e8b9');
    }catch(e){R.errors.push({phase:'DISCOVERY',league_id:league.id,error:String(e?.message||e),at:nowIso()});log(`ERROR ${league.name}: ${e.message}`,'#ff9a8b');}
    R.leagueIndex=i+1;await checkpoint();
  }
  R.phase='REFEREE_HISTORY';R.refIndex=0;await checkpoint();
}

// -------------------------- Referee history --------------------------------
async function refereeEvents(refId,limit=50){
  const map=new Map();
  for(let page=0;page<20&&map.size<limit;page++){
    let d;
    try{d=await apiAny([`/referee/${refId}/events/last/${page}`,`/referee/${refId}/events/last?page=${page}`]);}
    catch(e){if(page===0)throw e;break;}
    const events=d?.events||[];for(const e of events){if(finished(e)&&Number(e?.tournament?.category?.sport?.id||1)===1)map.set(Number(e.id),e);}
    if(!d?.hasNextPage||!events.length)break;
  }
  return [...map.values()].sort((a,b)=>Number(b.startTimestamp)-Number(a.startTimestamp)).slice(0,limit);
}
function statsByPeriod(d){
  const out={ALL:{home:null,away:null},'1ST':{home:null,away:null},'2ND':{home:null,away:null}};
  for(const p of d?.statistics||[]){if(!out[p.period])continue;for(const g of p.groups||[])for(const it of g.statisticsItems||[]){if(String(it?.name||'').toLowerCase()==='fouls'){out[p.period].home=num(it.homeValue??it.home);out[p.period].away=num(it.awayValue??it.away);}}}
  return out;
}
function allLineupEntries(side){const a=[];for(const key of ['players','substitutes'])for(const x of side?.[key]||[])a.push(x);return a;}
function subMinute(i){return Number(i?.time)||0;}
async function participationProof(eventId,incidents,lineups){
  const participated=new Set(),exitMinute=new Map(),entryMinute=new Map(),known=new Set();
  for(const side of ['home','away'])for(const x of allLineupEntries(lineups?.[side])){const id=Number(x?.player?.id);if(!id)continue;known.add(id);const mins=Number(x?.statistics?.minutesPlayed)||0;if(x?.substitute===false||mins>0)participated.add(id);}
  for(const i of incidents||[]){if(i?.incidentType!=='substitution')continue;const pin=Number(i?.playerIn?.id),pout=Number(i?.playerOut?.id),m=subMinute(i);if(pin){participated.add(pin);entryMinute.set(pin,m);}if(pout){participated.add(pout);exitMinute.set(pout,m);}}
  return {participated,exitMinute,entryMinute,known};
}
async function playerParticipatedFallback(eventId,playerId,cache){const key=`${eventId}|${playerId}`;if(cache.has(key))return cache.get(key);let ok=false;try{const d=await apiGet(`/event/${eventId}/player/${playerId}/statistics`,{allowMissing:true});ok=!d?.__missing&&(Number(d?.statistics?.minutesPlayed)||0)>0;}catch{}cache.set(key,ok);return ok;}
function cardClass(i){const c=String(i?.incidentClass||i?.cardType||'').toLowerCase();if(c.includes('yellowred')||c.includes('second'))return 'yellowRed';if(c.includes('red'))return 'red';if(c.includes('yellow'))return 'yellow';return c;}
function periodForMinute(m){return m<=45?'1ST':m<=90?'2ND':'ET';}
async function validCardsForEvent(e,incidents,lineups){
  const all=(incidents||[]).filter(i=>i?.incidentType==='card'),proof=await participationProof(e.id,incidents,lineups),fallback=new Map(),eligible=[],excluded=[];
  for(const i of all){
    const cls=cardClass(i),pid=Number(i?.player?.id)||0,minute=Number(i?.time)||0,added=Number(i?.addedTime)||0,teamId=i?.isHome?Number(e.homeTeam?.id):Number(e.awayTeam?.id),base={event_id:Number(e.id),team_id:teamId,player_id:pid||null,player_name:i?.player?.name||'',minute,added_time:added,period:periodForMinute(minute),incident_class:cls};
    if(!pid){excluded.push({...base,reason:'NO_PLAYER_STAFF_OR_BENCH_ENTITY'});continue;}
    let participated=proof.participated.has(pid);if(!participated)participated=await playerParticipatedFallback(e.id,pid,fallback);
    if(!participated){excluded.push({...base,reason:'BENCH_NEVER_ENTERED'});continue;}
    const exit=proof.exitMinute.get(pid);if(Number.isFinite(exit)&&minute>exit){excluded.push({...base,reason:'AFTER_SUBBED_OFF',exit_minute:exit});continue;}
    const yellow=cls==='yellow'||cls==='yellowRed'?1:0,red=cls==='red'||cls==='yellowRed'?1:0,direct=cls==='red'?1:0,second=cls==='yellowRed'?1:0;
    eligible.push({...base,yellow_event:yellow,effective_red:red,direct_red:direct,second_yellow_red:second,booking_points:yellow*BOOKING_POINTS.yellow+red*BOOKING_POINTS.effective_red,reason:'COUNTED_PARTICIPANT'});
  }
  return {eligible,excluded};
}
async function analyzeEvent(base,ref){
  const d=await apiGet(`/event/${base.id}`,{allowMissing:true}),e={...base,...eventObj(d)};if(!e.id)return null;
  const stats=await apiGet(`/event/${e.id}/statistics`,{allowMissing:true});const periods=stats?.__missing?statsByPeriod(null):statsByPeriod(stats);
  let incidentsData=await apiGet(`/event/${e.id}/incidents`,{allowMissing:true}),incidents=incidentsData?.__missing?[]:(incidentsData?.incidents||[]);
  let lineupsData=incidents.some(i=>i?.incidentType==='card')?await apiGet(`/event/${e.id}/lineups`,{allowMissing:true}):{home:{},away:{}};if(lineupsData?.__missing)lineupsData={home:{},away:{}};
  const cards=await validCardsForEvent(e,incidents,lineupsData);
  const yell=cards.eligible.reduce((a,c)=>a+c.yellow_event,0),reds=cards.eligible.reduce((a,c)=>a+c.effective_red,0),bp=cards.eligible.reduce((a,c)=>a+c.booking_points,0);
  const byPer=p=>cards.eligible.filter(c=>c.period===p),sum=(a,k)=>a.reduce((x,c)=>x+(Number(c[k])||0),0),p1=byPer('1ST'),p2=byPer('2ND'),pet=byPer('ET');
  const homeId=Number(e.homeTeam?.id),awayId=Number(e.awayTeam?.id),homeCards=cards.eligible.filter(c=>c.team_id===homeId),awayCards=cards.eligible.filter(c=>c.team_id===awayId);
  return {
    event_id:Number(e.id),date:dmy(e.startTimestamp),start_timestamp:Number(e.startTimestamp)||0,competition_id:Number(e?.tournament?.uniqueTournament?.id)||0,competition_name:e?.tournament?.uniqueTournament?.name||e?.tournament?.name||'',season_id:Number(e?.season?.id)||0,season_name:e?.season?.name||e?.season?.year||'',
    home_team_id:homeId,home_team:e.homeTeam?.name||'',away_team_id:awayId,away_team:e.awayTeam?.name||'',home_score:e.homeScore?.display??e.homeScore?.current??null,away_score:e.awayScore?.display??e.awayScore?.current??null,
    referee_id:Number(ref.id),referee_name:ref.name||'',yellow_cards:yell,red_cards:reds,direct_red_cards:sum(cards.eligible,'direct_red'),second_yellow_red_cards:sum(cards.eligible,'second_yellow_red'),booking_points:bp,
    home_yellow_cards:sum(homeCards,'yellow_event'),away_yellow_cards:sum(awayCards,'yellow_event'),home_red_cards:sum(homeCards,'effective_red'),away_red_cards:sum(awayCards,'effective_red'),
    home_fouls:periods.ALL.home,away_fouls:periods.ALL.away,fouls_total:(periods.ALL.home??0)+(periods.ALL.away??0),home_fouls_1h:periods['1ST'].home,away_fouls_1h:periods['1ST'].away,home_fouls_2h:periods['2ND'].home,away_fouls_2h:periods['2ND'].away,
    yellow_1h:sum(p1,'yellow_event'),red_1h:sum(p1,'effective_red'),cards_1h:sum(p1,'yellow_event')+sum(p1,'effective_red'),yellow_2h:sum(p2,'yellow_event'),red_2h:sum(p2,'effective_red'),cards_2h:sum(p2,'yellow_event')+sum(p2,'effective_red'),yellow_et:sum(pet,'yellow_event'),red_et:sum(pet,'effective_red'),cards_et:sum(pet,'yellow_event')+sum(pet,'effective_red'),
    eligible_cards:cards.eligible,excluded_cards:cards.excluded
  };
}
function summarizeRef(ref,matches){const vals=k=>matches.map(x=>Number(x[k])).filter(Number.isFinite);return {referee_id:Number(ref.id),name:ref.name||'',country:ref.country||'',discovered_in_competition_ids:(ref.discovered_in_competition_ids||[]).slice().sort((a,b)=>a-b),match_count:matches.length,avg_yellow_cards:avg(vals('yellow_cards')),avg_red_cards:avg(vals('red_cards')),avg_booking_points:avg(vals('booking_points')),avg_fouls_total:avg(vals('fouls_total')),avg_home_fouls:avg(vals('home_fouls')),avg_away_fouls:avg(vals('away_fouls')),avg_cards_1h:avg(vals('cards_1h')),avg_cards_2h:avg(vals('cards_2h')),generated_at:nowIso()};}
async function processReferees(){
  R.phase='REFEREE_HISTORY';const refs=[...R.referees.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  for(let i=R.refIndex;i<refs.length;i++){
    await waitIfPaused();const ref=refs[i];ui(`Árbitro ${i+1}/${refs.length} · ${ref.name}`);
    const existing=await idbGet('referees',Number(ref.id)).catch(()=>null);if(existing?.matches?.length>=MAX_REF_MATCHES){R.refIndex=i+1;continue;}
    try{
      const events=await refereeEvents(ref.id,MAX_REF_MATCHES),matches=[];
      for(let j=0;j<events.length;j++){
        await waitIfPaused();ui(`${ref.name} · partido ${j+1}/${events.length}`);
        try{const row=await analyzeEvent(events[j],ref);if(row)matches.push(row);}catch(e){R.errors.push({phase:'EVENT',referee_id:ref.id,event_id:events[j]?.id,error:String(e?.message||e),at:nowIso()});}
      }
      const record={referee_id:Number(ref.id),referee:ref,summary:summarizeRef(ref,matches),matches,generated_at:nowIso()};await idbPut('referees',record);log(`${ref.name}: ${matches.length} partidos guardados`,'#67e8b9');
    }catch(e){R.errors.push({phase:'REFEREE',referee_id:ref.id,error:String(e?.message||e),at:nowIso()});log(`ERROR ${ref.name}: ${e.message}`,'#ff9a8b');}
    R.refIndex=i+1;await checkpoint();
  }
  R.phase='COMPLETED';await checkpoint({completed_at:nowIso()});ui('Extracción completa. Exporta el ZIP.');log('COMPLETADO · listo para exportar','#37e2ad');
}

// ------------------------------ Export -------------------------------------
async function ensureJSZip(){if(window.JSZip)return window.JSZip;await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});return window.JSZip;}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2500);}
async function exportZip(){
  ui('Preparando ZIP…');const data=await idbAll('referees'),summaries=data.map(x=>x.summary).filter(Boolean).sort((a,b)=>String(a.name).localeCompare(String(b.name))),allMatches=data.flatMap(x=>x.matches||[]),eligible=allMatches.flatMap(m=>(m.eligible_cards||[]).map(c=>({...c,referee_id:m.referee_id,referee_name:m.referee_name,date:m.date,competition_id:m.competition_id,competition_name:m.competition_name}))),excluded=allMatches.flatMap(m=>(m.excluded_cards||[]).map(c=>({...c,referee_id:m.referee_id,referee_name:m.referee_name,date:m.date,competition_id:m.competition_id,competition_name:m.competition_name}))),JSZip=await ensureJSZip(),z=new JSZip();
  const root=z.folder('TITAN_REFEREES_CURRENT');
  root.file('manifest.json',JSON.stringify({schema_version:'incastats.referees.v1',extractor_version:VERSION,generated_at:nowIso(),league_count:LEAGUES.length,discovered_referees:R.referees.size,exported_referees:summaries.length,referee_matches:allMatches.length,eligible_cards:eligible.length,excluded_cards:excluded.length,max_seed_matches_per_league:MAX_SEED_MATCHES_PER_LEAGUE,max_matches_per_referee:MAX_REF_MATCHES,booking_points_policy:BOOKING_POINTS,card_policy:{count:'starter or player who eventually entered',count_bench_before_entry:'yes, only if player later entered',exclude_bench_never_entered:true,exclude_staff_and_manager:true,exclude_after_substitution_out:true},leagues:LEAGUES,requests:R.requests,errors:R.errors},null,2));
  root.file('referees_master.json',JSON.stringify({schema_version:'incastats.referees.v1',generated_at:nowIso(),booking_points_policy:BOOKING_POINTS,referees:summaries},null,2));
  const by=root.folder('by_referee');for(const x of data)by.file(`${x.referee_id}.json`,JSON.stringify(x,null,2));
  const c=root.folder('csv');
  const sumCols=['referee_id','name','country','match_count','avg_yellow_cards','avg_red_cards','avg_booking_points','avg_fouls_total','avg_home_fouls','avg_away_fouls','avg_cards_1h','avg_cards_2h','discovered_in_competition_ids'];c.file('referee_summary.csv',csv(summaries,sumCols));
  const matchCols=['referee_id','referee_name','event_id','date','competition_id','competition_name','season_id','season_name','home_team_id','home_team','away_team_id','away_team','home_score','away_score','yellow_cards','red_cards','direct_red_cards','second_yellow_red_cards','booking_points','home_yellow_cards','away_yellow_cards','home_red_cards','away_red_cards','home_fouls','away_fouls','fouls_total','home_fouls_1h','away_fouls_1h','home_fouls_2h','away_fouls_2h','yellow_1h','red_1h','cards_1h','yellow_2h','red_2h','cards_2h','yellow_et','red_et','cards_et'];c.file('referee_matches.csv',csv(allMatches,matchCols));
  const cardCols=['referee_id','referee_name','event_id','date','competition_id','competition_name','team_id','player_id','player_name','minute','added_time','period','incident_class','yellow_event','effective_red','direct_red','second_yellow_red','booking_points','reason'];c.file('cards_eligible.csv',csv(eligible,cardCols));c.file('cards_excluded.csv',csv(excluded,[...cardCols,'exit_minute']));
  root.file('README_PRIMERO.txt',`INCASTATS TITAN REFEREES 31 V1\n\n1. Copia la carpeta TITAN_REFEREES_CURRENT a la raíz del repo IncaStats-Data.\n2. Git add/commit/push.\n3. V22.2 la lee automáticamente.\n\nREGLA TARJETAS:\n- Cuenta jugador que fue titular o entró.\n- Si recibió tarjeta en banco y luego entró, cuenta.\n- Banco que nunca entró: NO.\n- DT/staff: NO.\n- Después de haber sido sustituido: NO.\n\nBooking points INCA configurables: amarilla ${BOOKING_POINTS.yellow}, roja efectiva ${BOOKING_POINTS.effective_red}.\n`);
  const blob=await z.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}},m=>ui(`Comprimiendo ${Math.round(m.percent)}%…`));download(blob,`TITAN_REFEREES_CURRENT_${new Date().toISOString().slice(0,10)}.zip`);ui('ZIP exportado.');
}

// ------------------------------ Controls -----------------------------------
$('irSpeed').onchange=()=>R.rateGap=Math.max(120,Number($('irSpeed').value)||260);
$('irYellowPts').onchange=()=>BOOKING_POINTS.yellow=Math.max(0,Number($('irYellowPts').value)||0);
$('irRedPts').onchange=()=>BOOKING_POINTS.effective_red=Math.max(0,Number($('irRedPts').value)||0);
$('irPause').onclick=async()=>{R.paused=true;await checkpoint();ui('Pausado. Checkpoint guardado.');};
$('irResume').onclick=()=>{R.paused=false;ui('Reanudando…');};
$('irExport').onclick=()=>exportZip().catch(e=>{log('EXPORT ERROR '+e.message,'#ff9a8b');ui('Error exportando.');});
$('irReset').onclick=async()=>{if(!confirm('¿Borrar checkpoint y resultados de TITAN REFEREES?'))return;R.stop=true;await idbClear();location.reload();};
$('irStart').onclick=async()=>{
  if(R.running)return;R.running=true;R.stop=false;R.paused=false;R.rateGap=Math.max(120,Number($('irSpeed').value)||260);BOOKING_POINTS.yellow=Math.max(0,Number($('irYellowPts').value)||10);BOOKING_POINTS.effective_red=Math.max(0,Number($('irRedPts').value)||25);R.startedAt=R.startedAt||nowIso();
  try{if(R.phase==='idle'||R.phase==='DISCOVERY')await discoverReferees();if(R.phase==='REFEREE_HISTORY')await processReferees();if(R.phase==='COMPLETED')ui('Ya está completo. Exporta el ZIP.');}catch(e){if(e.message!=='STOP_REQUESTED'){R.errors.push({phase:R.phase,error:String(e?.message||e),at:nowIso()});log('FATAL '+e.message,'#ff9a8b');await checkpoint();ui('Detenido con error; puedes reanudar.');}}finally{R.running=false;}
};

const had=await restore();if(had){log(`Checkpoint recuperado · fase ${R.phase} · ${R.referees.size} árbitros`,'#67e8b9');ui('Checkpoint disponible. Pulsa INICIAR para continuar.');}else ui('Listo. Pulsa INICIAR.');
console.info('[INCASTATS TITAN REFEREES 31 V1]',{version:VERSION,leagues:LEAGUES.length,max_ref_matches:MAX_REF_MATCHES,card_policy:'strict participant only'});
})();
