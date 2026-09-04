(async function INCASTATS_PLAYER_DELTA_15D_PLAYERLIST_SAFE_V4_MAX6(){
'use strict';

const VERSION='4.0.0_PLAYERLIST_7395_DELTA_15D_SAFE_MAX6';
const CHECKPOINT_VERSION='3.0.0_PLAYERLIST_7395_DELTA_15D_SAFE';
const APP_ID='incaPlayerDelta15dPlayerListSafeV4Max6';
const API='/api/v1';
const STATE_KEY='incastats_player_delta_15d_playerlist_safe_v3_state';
const DB_NAME='incastats_player_delta_15d_playerlist_safe_v3_db';
const DB_VERSION=2;
const STORE_EVENTS='events';
const STORE_SCANS='team_scans';
const MAX_HISTORY_PAGES=6;
const MAX_RETRIES=4;
const DEFAULT_GAP_MS=1050;
const JITTER_MS=420;
const SPEED_BASE_GAP_MS={1:1350,2:1050,3:850,4:700,5:600,6:520};
const DEFAULT_LOOKBACK_DAYS=15;

const MASTER_FIELDS=[
 'ID_Jugador','Jugador','Event_ID','Fecha','Competition_ID','Torneo','Season_ID','Season','Team_ID','Equipo','Rival_ID','Rival','Condicion','Posicion','Minutos_Jugados','Rating','Goles','Asistencias','xG_Esperados','Tiros_Totales','Tiros_Al_Arco','Tiros_Al_Palo','Pases_Totales','Pases_Acertados','Pases_Clave','Grandes_Ocasiones_Creadas','Duelos_Ganados','Atajadas','Faltas_Cometidas','Faltas_Recibidas','Entradas_Tackles','Intercepciones','Tarjetas','Tarjetas_Amarillas','Tarjetas_Rojas','Offsides'
];
const EXTENDED_FIELDS=[
 'Event_ID','Player_ID','Team_ID','Competition_ID','Season_ID','Season_Label','Start_Timestamp','Condicion','Titular','Fuente_Stats',
 'Liga','Temporada','Partido','Fecha','Jugador','Posicion','Equipo','Minutos_Jugados','Rating','Goles','Asistencias','xG','xA','Tiros_Totales','Tiros_Al_Arco','Tiros_Al_Palo','Pases_Totales','Pases_Clave','Grandes_Ocasiones_Creadas','Grandes_Ocasiones_Falladas','Toques','Regates_Completados','Entradas(Tackles)','Intercepciones','Duelos_Ganados','Faltas_Cometidas','Faltas_Recibidas','Tarjetas_Amarillas','Tarjetas_Rojas','Offsides','Atajadas(Portero)'
];
const INFO_FIELDS=['ID_Jugador','Jugador','Foto_URL','Pais','Fecha_Nacimiento','Posicion','Altura','Pie','Valor_Mercado','Team_ID','Equipo','Competition_ID','Torneo'];

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const nowIso=()=>new Date().toISOString();
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const num=(v,d=0)=>{const n=Number(v);return Number.isFinite(n)?n:d;};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function dmy(ts){const d=new Date(Number(ts)*1000);if(!Number.isFinite(d.getTime()))return'';return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;}
function localInputValue(d){const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;}
function sec(v){const t=new Date(v).getTime();return Number.isFinite(t)?Math.floor(t/1000):null;}
function iso(s){return new Date(s*1000).toISOString();}
function csvCell(v){if(v===null||v===undefined||v==='')return '';const s=String(v);return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
const csvLine=a=>a.map(csvCell).join(',');
function safe(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9._-]+/gi,'_').slice(0,80)||'item';}

// ---------- IndexedDB checkpoint: búsqueda derivada desde la lista de jugadores + resultado por evento ----------
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE_EVENTS))db.createObjectStore(STORE_EVENTS,{keyPath:'event_id'});if(!db.objectStoreNames.contains(STORE_SCANS))db.createObjectStore(STORE_SCANS,{keyPath:'scan_key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function dbPutEvent(value){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE_EVENTS,'readwrite');tx.objectStore(STORE_EVENTS).put(value);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
async function dbGetEvent(id){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE_EVENTS,'readonly');const q=tx.objectStore(STORE_EVENTS).get(Number(id));q.onsuccess=()=>{const v=q.result;db.close();resolve(v||null);};q.onerror=()=>{db.close();reject(q.error);};});}
async function dbPutScan(value){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE_SCANS,'readwrite');tx.objectStore(STORE_SCANS).put(value);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
async function dbGetScan(key){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE_SCANS,'readonly');const q=tx.objectStore(STORE_SCANS).get(String(key));q.onsuccess=()=>{const v=q.result;db.close();resolve(v||null);};q.onerror=()=>{db.close();reject(q.error);};});}
async function dbDeleteAll(){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction([STORE_EVENTS,STORE_SCANS],'readwrite');tx.objectStore(STORE_EVENTS).clear();tx.objectStore(STORE_SCANS).clear();tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}

// ---------- Runtime / punto temporal persistente ----------
function loadState(){try{return JSON.parse(localStorage.getItem(STATE_KEY)||'null')||{}}catch{return {}}}
function saveState(patch){const cur=loadState();const next={...cur,...patch};localStorage.setItem(STATE_KEY,JSON.stringify(next));return next;}
const saved=loadState();
const active=(saved?.active_run?.requested_from&&saved?.active_run?.requested_to)?saved.active_run:null;
const now=new Date();
const defaultTo=active?new Date(active.requested_to):now;
const defaultFrom=active?new Date(active.requested_from):(saved?.last_successful_to?new Date(saved.last_successful_to):new Date(Date.now()-DEFAULT_LOOKBACK_DAYS*86400000));
const R={selection:null,playerMap:new Map(),teamMap:new Map(),running:false,paused:false,stop:false,requests:0,discovered:new Map(),scanAudit:[],valid:[],incomplete:[],friendlies:[],prepared:null,downloaded:false,lastRequestAt:0,adaptiveGap:DEFAULT_GAP_MS,hard403:false,windowKey:null,reusedTeamScans:0,reusedEvents:0};
function makeWindowKey(requested,from,to){return `${CHECKPOINT_VERSION}|${requested}|${from}|${to}`;}
function checkpointCompatible(v){return v===VERSION||v===CHECKPOINT_VERSION;}
function selectedWorkers(){return Math.max(1,Math.min(6,Number(document.getElementById('pdWorkers')?.value)||2));}
function selectedBaseGap(){return SPEED_BASE_GAP_MS[selectedWorkers()]||DEFAULT_GAP_MS;}

document.getElementById('incaPlayerDelta15dPlayerListSafeV3')?.remove();
document.getElementById(APP_ID)?.remove();
const panel=document.createElement('div');panel.id=APP_ID;panel.style.cssText='position:fixed;z-index:2147483647;top:8px;left:8px;width:570px;max-height:96vh;overflow:auto;background:#06110f;color:#e9fff8;border:2px solid #19c993;border-radius:14px;padding:14px;font:12px/1.42 Consolas,monospace;box-shadow:0 16px 50px #000c';
panel.innerHTML=`
<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #21443a;padding-bottom:10px"><div><b style="font:900 18px Arial;color:#41edb7">INCASTATS · PLAYER DELTA 15D · PLAYER LIST SAFE V4 · MAX 6</b><div style="font-size:10px;color:#9bd8c6;margin-top:3px">ENTRADA = JSON DE JUGADORES · 15 DÍAS · CHECKPOINT · REANUDABLE</div></div><button id="pdClose">X</button></div>
<div style="margin-top:10px;padding:10px;background:#0a1c18;border:1px solid #21443a;border-radius:9px"><b style="color:#f4d06f">MODO SEGURO</b><div style="margin-top:5px;color:#b9d5cc">Carga tu lista maestra de jugadores. El extractor agrupa internamente sus clubes para no hacer 7,395 consultas de perfil. Guarda checkpoint por bloque de búsqueda y por evento. Si cierras/reinicias, reutiliza lo ya hecho. Ante 403 o 429 persistente se detiene sin martillar la API.</div><div style="margin-top:6px;color:#ffd27a">Velocidad 1–6 disponible. 2 es recomendada; 6 reduce el intervalo entre requests pero conserva gate global, cooldown y checkpoint.</div></div>
<label style="display:block;margin-top:10px;background:#0d2721;border:1px dashed #41edb7;border-radius:8px;padding:11px;text-align:center;cursor:pointer;font-weight:900">📁 CARGAR TITAN_DELTA_PLAYERS_7395.json<input id="pdConfig" type="file" accept=".json" style="display:none"></label><div id="pdSel" style="margin:6px 2px;color:#9bb6ad">Esperando lista maestra de jugadores…</div>
<div style="margin-top:9px;background:#0a1c18;padding:10px;border:1px solid #21443a;border-radius:9px"><b>VENTANA</b><div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px"><label>Desde<input id="pdFrom" type="datetime-local" value="${localInputValue(defaultFrom)}"></label><label>Hasta<input id="pdTo" type="datetime-local" value="${localInputValue(defaultTo)}"></label></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px"><label>Solape horas<input id="pdOverlap" type="number" min="0" max="168" value="${Number(saved?.overlap_hours)||72}"></label><label>Eventos en paralelo<select id="pdWorkers"><option value="1">1 · Ultra seguro</option><option value="2" selected>2 · Recomendado</option><option value="3">3 · Medio</option><option value="4">4 · Rápido</option><option value="5">5 · Muy rápido</option><option value="6">6 · Máximo</option></select></label></div><label style="display:flex;gap:7px;align-items:center;margin-top:8px"><input id="pdUseOverlap" type="checkbox" checked> Releer solape para correcciones tardías</label><label style="display:flex;gap:7px;align-items:center;margin-top:6px"><input id="pdIncludeNew" type="checkbox" checked> Incluir jugadores nuevos detectados en los mismos clubes</label><button id="pdRun" disabled style="width:100%;margin-top:9px;background:#21d89c;color:#03120d;border:0;border-radius:8px;padding:12px;font-weight:900">▶ EXTRAER / REANUDAR PLAYER DELTA 15D</button></div>
<div style="margin-top:9px;background:#03100d;padding:10px;border:1px solid #21443a;border-radius:9px"><div id="pdCurrent" style="color:#60d8b2;font-weight:900">Listo.</div><div style="height:9px;background:#173028;border-radius:99px;overflow:hidden;margin-top:7px"><div id="pdBar" style="height:100%;width:0;background:#21d89c"></div></div><div id="pdCounts" style="margin-top:7px;color:#afc8c0">Jugadores 0 · Eventos 0 · Requests 0</div><div id="pdCheckpoint" style="margin-top:5px;color:#7fa99b;font-size:10px">Checkpoint listo.</div></div>
<div id="pdExportBox" style="display:none;margin-top:9px;background:#102337;padding:10px;border:1px solid #315b78;border-radius:9px"><b style="color:#8bcaff">DELTA PREPARADO</b><div id="pdExportText" style="margin:6px 0"></div><button id="pdDownload" style="width:100%;background:#2478d4;color:white;border:0;border-radius:8px;padding:10px;font-weight:900">💾 DESCARGAR ZIP</button><button id="pdConfirm" disabled style="width:100%;margin-top:6px;background:#205342;color:#9af0cf;border:1px solid #37715e;border-radius:8px;padding:9px;font-weight:900">✅ CONFIRMAR ZIP GUARDADO</button></div>
<div style="display:flex;gap:7px;margin-top:9px"><button id="pdPause">PAUSAR</button><button id="pdStop">PARAR SEGURO</button><button id="pdClear">BORRAR CHECKPOINT</button></div><div id="pdLog" style="height:190px;overflow:auto;background:#000;border:1px solid #1c3931;border-radius:7px;margin-top:9px;padding:8px;color:#a8f5d6;font-size:10px"></div>`;
document.body.appendChild(panel);
panel.querySelectorAll('input,select').forEach(x=>{if(x.type==='checkbox'||x.type==='file')return;x.style.cssText='width:100%;box-sizing:border-box;background:#020a08;color:#eafff7;border:1px solid #315047;border-radius:6px;padding:7px;margin-top:3px';});
panel.querySelectorAll('button').forEach(b=>{if(!b.style.background)b.style.cssText='background:#16342c;color:#eafff7;border:1px solid #315047;border-radius:7px;padding:8px 10px;cursor:pointer';});
const $=id=>document.getElementById(id);$('pdClose').onclick=()=>panel.remove();
function log(m,c='#a8f5d6'){const d=document.createElement('div');d.textContent='> '+m;d.style.color=c;$('pdLog').appendChild(d);$('pdLog').scrollTop=$('pdLog').scrollHeight;while($('pdLog').children.length>180)$('pdLog').firstElementChild.remove();}
async function waitPause(){while(R.paused&&!R.stop)await sleep(300);if(R.stop)throw new Error('STOP_REQUESTED');}

// ---------- Respectful request gate ----------
let gateTail=Promise.resolve();
async function requestGate(){
 const turn=gateTail.then(async()=>{
  await waitPause();
  const base=selectedBaseGap();
  if(R.adaptiveGap<base)R.adaptiveGap=base;
  const target=R.adaptiveGap+Math.floor(Math.random()*JITTER_MS);
  const wait=Math.max(0,R.lastRequestAt+target-Date.now());
  if(wait)await sleep(wait);
  R.lastRequestAt=Date.now();
 });
 gateTail=turn.catch(()=>{});
 return turn;
}
async function apiGet(path,opt={},retry=0){
 await requestGate();R.requests++;
 let res;
 try{res=await fetch(API+path,{credentials:'include',headers:{Accept:'application/json,text/plain,*/*'}});}catch(e){if(retry>=MAX_RETRIES)throw e;await sleep(1200*(retry+1));return apiGet(path,opt,retry+1);}
 if(res.status===429){const ra=Number(res.headers.get('retry-after'));const ms=Number.isFinite(ra)&&ra>0?ra*1000:Math.min(180000,15000*Math.pow(2,retry));R.adaptiveGap=Math.min(2400,R.adaptiveGap+220);log(`429 · enfriando ${Math.round(ms/1000)}s. Checkpoint intacto.`, '#ffd27a');if(retry>=MAX_RETRIES){R.stop=true;throw new Error('SAFE_PAUSE_429');}await sleep(ms);return apiGet(path,opt,retry+1);}
 if(res.status===403){R.hard403=true;R.stop=true;log('403 recibido. PARADA SEGURA. No se harán más requests; recarga/navega normalmente y luego reanuda desde checkpoint.','#ff9b9b');throw new Error('SAFE_PAUSE_403');}
 if(opt.allowMissing&&[400,404,410,422].includes(res.status))return {__missing:true,status:res.status};
 if(res.status>=500){if(retry>=MAX_RETRIES)throw new Error(`${res.status} ${path}`);await sleep(2500*(retry+1));return apiGet(path,opt,retry+1);}
 if(!res.ok)throw new Error(`${res.status} ${res.statusText}: ${path}`);
 {const base=selectedBaseGap();if(R.adaptiveGap>base)R.adaptiveGap=Math.max(base,R.adaptiveGap-10);}
 return res.json();
}

function normalizePlayerSelection(raw){
 const arr=raw?.players||raw;if(!Array.isArray(arr))throw new Error('JSON inválido: debe contener players[]');
 const players=new Map(),teams=new Map();
 for(const p of arr){
  const id=Number(p?.id??p?.player_id??p?.Player_ID??p?.ID_Jugador);if(!Number.isInteger(id)||id<=0)continue;
  const teamId=Number(p?.primary_team_id??p?.team_id??p?.Team_ID??0)||0;
  const item={id,name:p?.name??p?.Jugador??`Player ${id}`,team_id:teamId,team:p?.primary_team??p?.team??p?.Equipo??'',position:p?.position??p?.Posicion??'',photo:p?.photo??p?.Foto_URL??`https://api.sofascore.com/api/v1/player/${id}/image`,last_date:p?.last_date??null,competition_id:Number(p?.primary_competition_id??p?.competition_id??p?.Competition_ID??0)||0};
  players.set(id,item);
  if(teamId>0&&!teams.has(teamId))teams.set(teamId,{id:teamId,name:item.team||`Team ${teamId}`});
 }
 if(!players.size)throw new Error('El JSON no contiene Player_ID válidos.');
 if(!teams.size)throw new Error('Los jugadores no contienen team_id/primary_team_id para agrupar la búsqueda.');
 return {schema_version:raw?.schema_version||'incastats.player_selection.v1',players:[...players.values()],teams:[...teams.values()]};
}
$('pdConfig').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{R.selection=normalizePlayerSelection(JSON.parse(await f.text()));R.playerMap=new Map(R.selection.players.map(p=>[Number(p.id),p]));R.teamMap=new Map(R.selection.teams.map(t=>[Number(t.id),t]));$('pdSel').innerHTML=`<b style="color:#41edb7">${R.selection.players.length} jugadores</b> · ${R.selection.teams.length} clubes derivados automáticamente · NO necesitas JSON de teams`;$('pdRun').disabled=!R.selection.players.length;log(`PLAYER JSON OK: ${R.selection.players.length} jugadores · ${R.selection.teams.length} clubes internos para reducir requests.`,'#41edb7');}catch(err){alert(err.message||err);}};

function eventMeta(e){const t=e.tournament||{},ut=t.uniqueTournament||{},s=e.season||{};return {competition_id:Number(ut.id||t.id)||0,competition_name:ut.name||t.name||'',season_id:Number(s.id)||0,season_label:String(s.name||s.year||''),competition_type:(norm(t.category?.name).includes('international')?'INTERNATIONAL':/cup|copa|pokal|coupe|coppa|taça|taca/.test(norm(ut.name||t.name))?'CUP':'LEAGUE')};}
function isFriendly(e,meta){return /friendly|friendlies|amistoso|pre[ -]?season/.test(norm([meta.competition_name,e?.tournament?.name,e?.season?.name].filter(Boolean).join(' ')));}
function isExhibition(e,meta){return /emirates cup|telekom cup|atlantic cup|audi cup|joan gamper|florida cup|soccer champions tour/.test(norm([meta.competition_name,e?.tournament?.name].join(' ')));}
function playerNum(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function pval(s,keys,d=0){for(const k of keys){const v=s?.[k];if(v!==undefined&&v!==null&&v!=='')return v;}return d;}
function shots(s){if(s?.totalShots!==undefined&&s.totalShots!==null)return playerNum(s.totalShots);return playerNum(s?.blockedScoringAttempt)+playerNum(s?.onTargetScoringAttempt)+playerNum(s?.shotOffTarget);}
function lineupPlayers(o){if(Array.isArray(o))return o;if(Array.isArray(o?.players))return o.players;return [];}
function seasonLegacy(s){const x=String(s||'');const m=x.match(/(20\d{2})\D+(20\d{2}|\d{2})/);if(m)return `${String(Number(m[1])%100).padStart(2,'0')}_${String(Number(m[2])%100).padStart(2,'0')}`;const y=x.match(/20\d{2}/);return y?y[0]:x.replace(/[\/\s]+/g,'_');}
function cardMap(inc){const m=new Map();for(const i of (inc?.incidents||[])){if(i?.incidentType!=='card'||!i.player?.id)continue;const id=Number(i.player.id);if(!m.has(id))m.set(id,{yellow:0,red:0});const v=m.get(id),c=i.incidentClass||i.cardType;if(c==='yellow')v.yellow++;else if(c==='yellowRed'){v.yellow++;v.red++;}else if(c==='red')v.red++;}return m;}
function countryName(p){return p?.country?.name||p?.country?.alpha2||'';}
function buildRows(e,meta,lineups,cards){const master=[],extended=[],infos=[];for(const side of ['home','away']){const team=side==='home'?e.homeTeam:e.awayTeam,rival=side==='home'?e.awayTeam:e.homeTeam;for(const entry of lineupPlayers(lineups?.[side])){const p=entry?.player,s=entry?.statistics;if(!p?.id||!s)continue;const selected=R.playerMap.has(Number(p.id));if(!selected&&!$('pdIncludeNew')?.checked)continue;const minutes=playerNum(pval(s,['minutesPlayed'],0));if(minutes<=0)continue;const cm=cards.get(Number(p.id))||{yellow:0,red:0};const totalCards=cm.yellow+cm.red;const common={ID_Jugador:String(p.id),Jugador:p.name||p.shortName||'',Event_ID:String(e.id),Fecha:dmy(e.startTimestamp),Competition_ID:String(meta.competition_id),Torneo:meta.competition_name,Season_ID:String(meta.season_id),Season:meta.season_label,Team_ID:String(team?.id||''),Equipo:team?.name||'',Rival_ID:String(rival?.id||''),Rival:rival?.name||'',Condicion:side==='home'?'Local':'Visita',Posicion:p.position||entry?.position||'',Minutos_Jugados:minutes,Rating:pval(s,['rating'],''),Goles:playerNum(pval(s,['goals'],0)),Asistencias:playerNum(pval(s,['goalAssist','assists'],0)),xG_Esperados:pval(s,['expectedGoals','xg'],0),Tiros_Totales:shots(s),Tiros_Al_Arco:playerNum(pval(s,['onTargetScoringAttempt','shotsOnTarget'],0)),Tiros_Al_Palo:playerNum(pval(s,['hitWoodwork'],0)),Pases_Totales:playerNum(pval(s,['totalPass','passes'],0)),Pases_Acertados:playerNum(pval(s,['accuratePass','accuratePasses'],0)),Pases_Clave:playerNum(pval(s,['keyPass','keyPasses'],0)),Grandes_Ocasiones_Creadas:playerNum(pval(s,['bigChanceCreated','bigChancesCreated'],0)),Duelos_Ganados:playerNum(pval(s,['duelWon','duelsWon'],0)),Atajadas:playerNum(pval(s,['saves','goalkeeperSaves'],0)),Faltas_Cometidas:playerNum(pval(s,['fouls'],0)),Faltas_Recibidas:playerNum(pval(s,['wasFouled','fouled'],0)),Entradas_Tackles:playerNum(pval(s,['totalTackle','tackles'],0)),Intercepciones:playerNum(pval(s,['interceptionWon','interceptions'],0)),Tarjetas:totalCards,Tarjetas_Amarillas:cm.yellow,Tarjetas_Rojas:cm.red,Offsides:playerNum(pval(s,['totalOffside','offsides'],0))};master.push(common);
 const ext={Event_ID:Number(e.id),Player_ID:Number(p.id),Team_ID:Number(team?.id)||0,Competition_ID:Number(meta.competition_id)||0,Season_ID:Number(meta.season_id)||0,Season_Label:meta.season_label,Start_Timestamp:Number(e.startTimestamp)||0,Condicion:common.Condicion,Titular:entry?.substitute===true?0:1,Fuente_Stats:'lineups',Liga:meta.competition_name,Temporada:seasonLegacy(meta.season_label),Partido:`${e.homeTeam?.name||''} vs ${e.awayTeam?.name||''}`,Fecha:common.Fecha,Jugador:common.Jugador,Posicion:common.Posicion,Equipo:common.Equipo,Minutos_Jugados:minutes,Rating:common.Rating,Goles:common.Goles,Asistencias:common.Asistencias,xG:common.xG_Esperados,xA:playerNum(pval(s,['expectedAssists','expectedAssist','xa'],0)),Tiros_Totales:common.Tiros_Totales,Tiros_Al_Arco:common.Tiros_Al_Arco,Tiros_Al_Palo:common.Tiros_Al_Palo,Pases_Totales:common.Pases_Totales,Pases_Clave:common.Pases_Clave,Grandes_Ocasiones_Creadas:common.Grandes_Ocasiones_Creadas,Grandes_Ocasiones_Falladas:playerNum(pval(s,['bigChanceMissed','bigChancesMissed'],0)),Toques:playerNum(pval(s,['touches'],0)),Regates_Completados:playerNum(pval(s,['successfulDribble','wonContest','accurateDribble'],0)),'Entradas(Tackles)':common.Entradas_Tackles,Intercepciones:common.Intercepciones,Duelos_Ganados:common.Duelos_Ganados,Faltas_Cometidas:common.Faltas_Cometidas,Faltas_Recibidas:common.Faltas_Recibidas,Tarjetas_Amarillas:cm.yellow,Tarjetas_Rojas:cm.red,Offsides:common.Offsides,'Atajadas(Portero)':common.Atajadas};extended.push(ext);
 infos.push({ID_Jugador:String(p.id),Jugador:common.Jugador,Foto_URL:`https://api.sofascore.com/api/v1/player/${p.id}/image`,Pais:countryName(p),Fecha_Nacimiento:'',Posicion:common.Posicion,Altura:p.height||'',Pie:p.preferredFoot||'',Valor_Mercado:'',Team_ID:String(team?.id||''),Equipo:common.Equipo,Competition_ID:String(meta.competition_id),Torneo:meta.competition_name});}}
 return {master,extended,infos};}

async function discover(team,from,to){const scanKey=`${R.windowKey}|${team.id}`;const cached=await dbGetScan(scanKey);if(checkpointCompatible(cached?.version)&&Array.isArray(cached.events)){R.reusedTeamScans++;R.scanAudit.push({team_id:team.id,team_name:team.name,pages:cached.pages||0,events:cached.events.length,reused:true});return cached.events;}const out=[];let pages=0;for(let page=0;page<MAX_HISTORY_PAGES;page++){pages++;const d=await apiGet(`/team/${team.id}/events/last/${page}`,{allowMissing:true});if(d?.__missing)break;const ev=Array.isArray(d?.events)?d.events:[];if(!ev.length)break;for(const e of ev){const ts=Number(e.startTimestamp)||0;if(ts>=from&&ts<=to&&(Number(e.homeTeam?.id)===team.id||Number(e.awayTeam?.id)===team.id))out.push(e);}if(ev.every(e=>(Number(e.startTimestamp)||0)<from)||d.hasNextPage===false)break;}await dbPutScan({scan_key:scanKey,version:VERSION,team_id:team.id,team_name:team.name,from,to,pages,events:out,saved_at:nowIso()});R.scanAudit.push({team_id:team.id,team_name:team.name,pages,events:out.length,reused:false});return out;}
async function processEvent(e){const cached=await dbGetEvent(e.id);if(checkpointCompatible(cached?.version)&&cached?.window_key===R.windowKey&&['valid','excluded'].includes(cached.kind)){R.reusedEvents++;return cached;}const meta=eventMeta(e);if(isFriendly(e,meta)||isExhibition(e,meta)){const r={version:VERSION,window_key:R.windowKey,event_id:Number(e.id),kind:'excluded',reason:'FRIENDLY_OR_EXHIBITION',master:[],extended:[],infos:[]};await dbPutEvent(r);return r;}const finished=e.status?.type==='finished'||[100,106,110,113,120].includes(e.status?.code);if(!finished){const r={version:VERSION,window_key:R.windowKey,event_id:Number(e.id),kind:'incomplete',reason:'NOT_FINISHED',master:[],extended:[],infos:[]};await dbPutEvent(r);return r;}const lineups=await apiGet(`/event/${e.id}/lineups`,{allowMissing:true});if(lineups?.__missing){const r={version:VERSION,window_key:R.windowKey,event_id:Number(e.id),kind:'incomplete',reason:'NO_LINEUPS',master:[],extended:[],infos:[]};await dbPutEvent(r);return r;}let inc={incidents:[]};try{const x=await apiGet(`/event/${e.id}/incidents`,{allowMissing:true});if(!x?.__missing)inc=x;}catch(_){}const built=buildRows(e,meta,lineups,cardMap(inc));const r={version:VERSION,window_key:R.windowKey,event_id:Number(e.id),kind:built.master.length?'valid':'incomplete',reason:built.master.length?'':'NO_PLAYER_STATS',meta,master:built.master,extended:built.extended,infos:built.infos};await dbPutEvent(r);return r;}
async function pool(items,n,fn,onDone){let next=0,done=0;const out=new Array(items.length);async function w(){while(true){const i=next++;if(i>=items.length)return;await waitPause();try{out[i]=await fn(items[i],i);}catch(e){if(['SAFE_PAUSE_403','SAFE_PAUSE_429','STOP_REQUESTED'].includes(e.message))throw e;out[i]={kind:'error',event_id:Number(items[i]?.id)||0,reason:e.message||String(e),master:[],extended:[],infos:[]};}done++;onDone?.(done,items.length);}}await Promise.all(Array.from({length:Math.max(1,n)},w));return out;}
async function ensureZip(){if(window.JSZip)return window.JSZip;await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';s.onload=res;s.onerror=()=>rej(new Error('JSZip no cargó'));document.head.appendChild(s);});return window.JSZip;}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2500);}
async function buildZip(){const JSZip=await ensureZip(),zip=new JSZip(),masterMap=new Map(),extMap=new Map(),infoMap=new Map(),aud=[];for(const e of R.discovered.values()){const r=await dbGetEvent(e.id);if(!r){aud.push({event_id:e.id,reason:'NO_CHECKPOINT'});continue;}if(r.kind!=='valid'){aud.push({event_id:r.event_id,reason:r.reason||r.kind});continue;}for(const row of r.master||[])masterMap.set(`${row.Event_ID}|${row.ID_Jugador}`,row);for(const row of r.extended||[])extMap.set(`${row.Event_ID}|${row.Player_ID}`,row);for(const x of r.infos||[]){const old=infoMap.get(String(x.ID_Jugador));if(!old||Number(x.Team_ID))infoMap.set(String(x.ID_Jugador),x);}}
 const master=[...masterMap.values()],extended=[...extMap.values()],infos=[...infoMap.values()];master.sort((a,b)=>String(a.Fecha).localeCompare(String(b.Fecha))||Number(a.Event_ID)-Number(b.Event_ID)||Number(a.ID_Jugador)-Number(b.ID_Jugador));
 zip.file('players/player_match_stats_master_upsert.csv','\ufeff'+MASTER_FIELDS.join(',')+'\n'+master.map(r=>csvLine(MASTER_FIELDS.map(k=>r[k]??''))).join('\n'));
 zip.file('players/player_match_stats_current_upsert.csv','\ufeff'+EXTENDED_FIELDS.join(',')+'\n'+extended.map(r=>csvLine(EXTENDED_FIELDS.map(k=>r[k]??''))).join('\n'));
 zip.file('players/players_info_upsert.csv','\ufeff'+INFO_FIELDS.join(',')+'\n'+infos.map(r=>csvLine(INFO_FIELDS.map(k=>r[k]??''))).join('\n'));
 zip.file('faces/player_face_targets.json',JSON.stringify({schema_version:'incastats.player_face_targets.delta.v1',generated_at:nowIso(),players:infos.map(x=>({id:String(x.ID_Jugador),name:x.Jugador||'',photo:x.Foto_URL||`https://api.sofascore.com/api/v1/player/${x.ID_Jugador}/image`}))},null,2));
 zip.file('audit/incomplete_or_excluded.json',JSON.stringify(aud,null,2));zip.file('audit/search_blocks_from_player_list.json',JSON.stringify(R.scanAudit,null,2));
 const selectedIds=new Set((R.selection?.players||[]).map(p=>String(p.id))),seenSelected=new Set(master.map(x=>String(x.ID_Jugador)).filter(id=>selectedIds.has(id)));
 const coverage={schema_version:'incastats.player_delta.coverage.v1',selected_players:selectedIds.size,selected_players_with_rows:seenSelected.size,selected_players_without_rows_in_window:selectedIds.size-seenSelected.size,note:'Sin filas en la ventana no significa error: puede no haber jugado o no haber partido en esos 15 días.'};zip.file('audit/player_coverage_summary.json',JSON.stringify(coverage,null,2));
 const manifest={schema_version:'incastats.player_delta.v3',extractor_version:VERSION,provider:'sofascore',created_at:nowIso(),architecture:'PLAYER_LIST_INPUT_EVENT_CENTRIC_15D_DUAL_CHECKPOINT',window:R.prepared?.window||null,counts:{selected_players:R.selection?.players?.length||0,derived_search_clubs:R.selection?.teams?.length||0,discovered_events:R.discovered.size,player_rows:master.length,unique_players:new Set(master.map(x=>String(x.ID_Jugador))).size,selected_players_with_rows:seenSelected.size,requests:R.requests,reused_search_blocks:R.reusedTeamScans,reused_events:R.reusedEvents,audit_rows:aud.length},merge_key:['Event_ID','ID_Jugador'],current_merge_key:['Event_ID','Player_ID'],operation:'UPSERT_REPLACE_SAME_KEY',targets:['TITAN_PLAYERS_MASTER_2025_PLUS','TITAN_PLAYERS_CURRENT']};zip.file('player_delta_manifest.json',JSON.stringify(manifest,null,2));
 const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:5}},m=>$('pdCurrent').textContent=`Comprimiendo ${m.percent.toFixed(0)}%`);const stamp=String(R.prepared?.window?.requested_to||nowIso()).replace(/[:.]/g,'-');download(blob,`INCASTATS_PLAYER_DELTA_15D_PLAYERLIST_SAFE_V4_MAX6_${stamp}_${master.length}_rows.zip`);R.downloaded=true;$('pdConfirm').disabled=false;$('pdCurrent').textContent='ZIP descargado. Confirma solo cuando lo veas guardado.';}

$('pdPause').onclick=()=>{R.paused=!R.paused;if(!R.paused)R.hard403=false;$('pdPause').textContent=R.paused?'REANUDAR':'PAUSAR';log(R.paused?'Pausa manual.':'Reanudado.');};
$('pdStop').onclick=()=>{R.stop=true;log('Parada segura solicitada. Checkpoints ya procesados quedan guardados.','#ffd27a');};
$('pdClear').onclick=async()=>{if(confirm('¿Borrar checkpoint de eventos y punto temporal?')){await dbDeleteAll();localStorage.removeItem(STATE_KEY);$('pdCheckpoint').textContent='Checkpoint borrado.';log('Checkpoint completo borrado.');}};
$('pdDownload').onclick=()=>buildZip().catch(e=>alert(e.message||e));
$('pdConfirm').onclick=()=>{if(!R.prepared||!R.downloaded)return;const next=saveState({schema_version:'incastats.player_delta_state.v3',last_successful_to:R.prepared.window.requested_to,overlap_hours:R.prepared.window.overlap_hours,confirmed_at:nowIso(),active_run:null});$('pdFrom').value=localInputValue(new Date(next.last_successful_to));$('pdTo').value=localInputValue(new Date());$('pdConfirm').disabled=true;$('pdCheckpoint').textContent=`Punto confirmado: ${next.last_successful_to}`;log(`✅ Punto confirmado: ${next.last_successful_to}`,'#41edb7');};

$('pdRun').onclick=async()=>{
 if(R.running||!R.selection)return;
 const requested=sec($('pdFrom').value),to=sec($('pdTo').value),over=Math.max(0,Number($('pdOverlap').value)||0),from=requested-($('pdUseOverlap').checked?over*3600:0);
 if(!requested||!to||to<=requested)return alert('Fechas inválidas');
 R.running=true;R.stop=false;R.paused=false;R.hard403=false;R.requests=0;R.adaptiveGap=selectedBaseGap();R.discovered.clear();R.scanAudit=[];R.prepared=null;R.downloaded=false;R.reusedTeamScans=0;R.reusedEvents=0;R.windowKey=makeWindowKey(requested,from,to);
 $('pdExportBox').style.display='none';$('pdBar').style.width='0';
 const activeRun={requested_from:iso(requested),effective_from:iso(from),requested_to:iso(to),overlap_hours:$('pdUseOverlap').checked?over:0,window_key:R.windowKey,started_at:nowIso(),status:'RUNNING'};
 saveState({schema_version:'incastats.player_delta_state.v3',overlap_hours:activeRun.overlap_hours,active_run:activeRun});
 $('pdCheckpoint').textContent=`Run guardado · ${activeRun.requested_from.slice(0,10)} → ${activeRun.requested_to.slice(0,10)}`;
 try{
  const teams=R.selection.teams;const scanWorkers=selectedWorkers();
  $('pdCurrent').textContent='Fase 1/2 · buscando eventos de los jugadores por clubes derivados · checkpoint…';
  const scans=await pool(teams,scanWorkers,t=>discover(t,from,to),(d,total)=>{$('pdBar').style.width=`${45*d/Math.max(1,total)}%`;$('pdCounts').textContent=`Bloques ${d}/${total} · Jugadores ${R.selection.players.length} · Requests ${R.requests} · reutilizados ${R.reusedTeamScans}`;$('pdCheckpoint').textContent=`Checkpoint búsqueda ${d}/${total}`;});
  for(const arr of scans)for(const e of (arr||[]))R.discovered.set(Number(e.id),e);
  const events=[...R.discovered.values()].sort((a,b)=>(a.startTimestamp||0)-(b.startTimestamp||0));
  log(`Discovery: ${events.length} eventos únicos · ${R.reusedTeamScans} bloques reutilizados · ${R.selection.players.length} jugadores objetivo.`, '#41edb7');
  $('pdCurrent').textContent='Fase 2/2 · lineups + tarjetas · checkpoint por evento…';
  const workers=selectedWorkers();
  await pool(events,workers,e=>processEvent(e),(d,total)=>{$('pdBar').style.width=`${45+55*d/Math.max(1,total)}%`;$('pdCounts').textContent=`Eventos ${d}/${total} · Requests ${R.requests} · reutilizados ${R.reusedEvents} · gap ${R.adaptiveGap}ms`;$('pdCheckpoint').textContent=`Checkpoint eventos ${d}/${total}`;});
  R.prepared={window:{requested_from:iso(requested),effective_from:iso(from),requested_to:iso(to),overlap_hours:$('pdUseOverlap').checked?over:0},finished_at:nowIso()};
  saveState({active_run:{...activeRun,status:'PREPARED',finished_at:R.prepared.finished_at}});
  $('pdExportText').textContent=`${events.length} eventos · ${R.reusedTeamScans} scans de equipo reutilizados · ${R.reusedEvents} eventos reutilizados · ${R.requests} requests nuevas. Exporta ZIP y aplica BAT.`;
  $('pdExportBox').style.display='block';$('pdCurrent').textContent='PLAYER DELTA 15D V4 MAX6 preparado.';$('pdCheckpoint').textContent='Checkpoint completo · falta descargar/confirmar ZIP.';
  log(`DELTA listo para ${R.selection.players.length} jugadores objetivo. Input PLAYER JSON; clubes solo se derivaron internamente para ahorrar miles de requests.`,'#41edb7');
 }catch(e){
  const status=e.message==='SAFE_PAUSE_403'?'PAUSED_403':e.message==='SAFE_PAUSE_429'?'PAUSED_429':e.message==='STOP_REQUESTED'?'STOPPED':'ERROR';
  const st=loadState();if(st?.active_run)saveState({active_run:{...st.active_run,status,last_error:String(e.message||e),updated_at:nowIso()}});
  $('pdCheckpoint').textContent=`Checkpoint guardado · ${status}`;
  if(e.message==='SAFE_PAUSE_403')log('403 · pausa segura. El checkpoint de equipos/eventos ya hechos queda guardado. Navega normalmente, recarga si hace falta, pega el extractor de nuevo y usa la misma ventana.','#ffb0b0');
  else if(e.message==='SAFE_PAUSE_429')log('429 persistente · pausa segura. No se harán más requests. Espera y reanuda después; el checkpoint evita repetir trabajo.','#ffd27a');
  else if(e.message!=='STOP_REQUESTED')log('ERROR: '+(e.message||e),'#ff8d8d');
 }finally{R.running=false;}
};

if(active){log(`♻️ Run pendiente detectado (${active.status||'guardado'}). Se restauró exactamente su ventana.`,'#8bcaff');$('pdCheckpoint').textContent=`Run pendiente: ${active.status||'guardado'}`;}else log(`SAFE V4 MAX6 PLAYER LIST listo · carga TITAN_DELTA_PLAYERS_7395.json · primera ejecución = últimos ${DEFAULT_LOOKBACK_DAYS} días · 72h solape.`);
})();
