(() => {
'use strict';

const VERSION='1.040';
const TITAN_REPO='https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/';
const LOCAL_ROOT='./data/player-master-2025/';
const REMOTE_ROOT=TITAN_REPO+'TITAN_PLAYERS_MASTER_2025_PLUS/';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toLowerCase();
const n=v=>{const x=Number(String(v??'').replace(',','.').replace(/^\+/,''));return Number.isFinite(x)?x:0};
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const med=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2};
const MONTHS=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

const rangeHalf=(start,end,step=1)=>{const out=[];for(let x=start;x<=end+1e-9;x+=step)out.push(Number(x.toFixed(1)));return out};
const METRICS=[
 {k:'shots',l:'Tiros',f:'Tiros_Totales',icon:'fa-crosshairs',lines:rangeHalf(.5,5.5),def:1.5},
 {k:'sot',l:'Tiros a puerta',f:'Tiros_Al_Arco',icon:'fa-bullseye',lines:rangeHalf(.5,3.5),def:.5},
 {k:'passes',l:'Pases',f:'Pases_Totales',icon:'fa-arrows-left-right',manual:true,min:.5,max:1999.5,step:1,def:54.5},
 {k:'passesok',l:'Pases acertados',f:'Pases_Acertados',icon:'fa-check-double',lines:rangeHalf(9.5,109.5,5),def:44.5},
 {k:'goals',l:'Goles',f:'Goles',icon:'fa-futbol',lines:rangeHalf(.5,2.5),def:.5},
 {k:'assists',l:'Asistencias',f:'Asistencias',icon:'fa-handshake-angle',lines:rangeHalf(.5,2.5),def:.5},
 {k:'ga',l:'Goles + asistencias',icon:'fa-bolt',lines:rangeHalf(.5,3.5),def:.5,calc:r=>n(r.Goles)+n(r.Asistencias)},
 {k:'saves',l:'Atajadas',f:'Atajadas',icon:'fa-hands',lines:rangeHalf(.5,7.5),def:2.5},
 {k:'fouls',l:'Faltas cometidas',f:'Faltas_Cometidas',icon:'fa-gavel',lines:rangeHalf(.5,4.5),def:.5},
 {k:'fouled',l:'Faltas recibidas',f:'Faltas_Recibidas',icon:'fa-person-falling',lines:rangeHalf(.5,4.5),def:.5},
 {k:'tackles',l:'Tackles',f:'Entradas_Tackles',icon:'fa-shield-halved',lines:rangeHalf(.5,5.5),def:1.5},
 {k:'cards',l:'Tarjetas',f:'Tarjetas',icon:'fa-clone',lines:rangeHalf(.5,2.5),def:.5},
 {k:'yellow',l:'Amarillas',f:'Tarjetas_Amarillas',icon:'fa-square',lines:[.5,1.5],def:.5},
 {k:'red',l:'Rojas',f:'Tarjetas_Rojas',icon:'fa-square',lines:[.5],def:.5},
 {k:'offsides',l:'Offsides',f:'Offsides',icon:'fa-flag',lines:rangeHalf(.5,3.5),def:.5},
 {k:'minutes',l:'Minutos',f:'Minutos_Jugados',icon:'fa-clock',lines:[44.5,59.5,74.5,89.5],def:59.5},
 {k:'rating',l:'Rating',f:'Rating',icon:'fa-star',lines:[5.5,6.5,7.5,8.5,9.5],def:6.5,dec:2}
];
const MM=Object.fromEntries(METRICS.map(x=>[x.k,x]));
const METRIC_GROUPS=[
 {label:'REMATES Y GOL',icon:'fa-crosshairs',keys:['shots','sot','goals','assists','ga']},
 {label:'PASE',icon:'fa-arrows-left-right',keys:['passes','passesok']},
 {label:'DEFENSA E INFRACCIONES',icon:'fa-shield-halved',keys:['tackles','fouls','fouled','offsides']},
 {label:'DISCIPLINA',icon:'fa-clone',keys:['cards','yellow','red']},
 {label:'PORTERO',icon:'fa-hands',keys:['saves']}
];

const state={
 manifest:null,root:'',source:'',fields:[],fi:{},playerCache:new Map(),
 comp:'17',team:'',player:null,metric:'shots',range:10,line:1.5,query:'',playerCompetition:'ALL',condition:'ALL',
 searchMode:'team',competitionOptions:[],currentLeagueAugmented:new Set(),playerMetaMap:new Map()
};
let searchFaceObserver=null;

function decodeRows(raw){
 return (raw||[]).map(arr=>{
   const o={};state.fields.forEach((f,i)=>o[f]=arr[i]??'');
   o.__ms=parseDate(o.Fecha);return o;
 }).sort((a,b)=>b.__ms-a.__ms);
}
function parseDate(s){
 const m=String(s||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 return m?new Date(+m[3],+m[2]-1,+m[1]).getTime():0;
}
function dateParts(s){
 const m=String(s||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 if(!m)return {main:String(s||'—'),year:''};
 return {main:`${String(m[1]).padStart(2,'0')} ${MONTHS[Math.max(0,Math.min(11,+m[2]-1))]}`,year:m[3]};
}
function metricVal(r,m){if(m.calc)return n(m.calc(r));if(m.k==='xg')return n(r?.xG??r?.xG_Esperados);return n(r?.[m.f])}
function format(m,v){
 if(m.dec===2)return Number(v||0).toFixed(2);
 return Math.abs(v-Math.round(v))<1e-9?String(Math.round(v)):Number(v||0).toFixed(1);
}
function meets(v,line){return Number.isInteger(line)?v>=line:v>line}
function positionLabel(v){
 const p=String(v||'').toUpperCase();
 if(/^G|GK|POR/.test(p))return 'PORTERO';
 if(/^D|DEF/.test(p))return 'DEFENSA';
 if(/^M|MID/.test(p))return 'MEDIO';
 if(/^F|FW|ATT|DEL/.test(p))return 'DELANTERO';
 return p||'JUGADOR';
}

async function fetchJSON(url){
 const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();
}
async function loadManifest(){
 if(state.manifest)return state.manifest;
 // La vista debe abrir inmediatamente. El manifiesto local pesa poco y ya viaja
 // con la app; CURRENT/HISTORY se cargan después, al elegir jugador.
 try{
   state.manifest=await fetchJSON(`${LOCAL_ROOT}manifest.json?v=${VERSION}`);
   state.root=REMOTE_ROOT;
 }catch(localErr){
   state.manifest=await fetchJSON(`${REMOTE_ROOT}manifest.json?v=${VERSION}`);
   state.root=REMOTE_ROOT;
 }
 const info=window.INCA_PLAYERS?.info?.()||{};
 state.source=info.currentReady?'PLAYER MASTER 2025+ + CURRENT DELTA':'PLAYER MASTER 2025+ · CURRENT DELTA PRIORITARIO';
 state.manifest.players=Array.isArray(state.manifest.players)?state.manifest.players:[];
 state.fields=Array.from(new Set([...(state.manifest.fields||[]),'xG','Entradas_Tackles','Atajadas','Tarjetas','Minutos_Jugados']));
 state.fi=Object.fromEntries(state.fields.map((f,i)=>[f,i]));
 state.playerMetaMap=new Map((state.manifest.players||[]).map(p=>[String(p.id),p]));
 // Precarga no bloqueante: nunca deja Player Picks en una pantalla vacía.
 setTimeout(()=>{
   window.INCA_PLAYERS?.ensureCurrentReady?.().then(()=>{
     state.source='PLAYER MASTER 2025+ + CURRENT DELTA';
     const src=document.getElementById('ppsQSource'); if(src) src.textContent=state.source;
     // CURRENT puede terminar de cargar después de que Player Picks ya esté visible.
     // Rehidrata SOLO la liga visible y nunca recorre la base completa por cada cambio.
     state.currentLeagueAugmented.delete(String(state.comp||''));
     if(document.getElementById('ppsQRoot')) refreshCurrentLeagueFromCurrent();
   }).catch(()=>{});
 },40);
 return state.manifest;
}
async function loadPlayer(id){
 const key=String(id);
 if(state.playerCache.has(key))return state.playerCache.get(key);
 const meta=playerMeta(key);if(!meta)return [];
 const promise=(async()=>{
   // V1.040: PLAYER PICKS usa el MASTER 2025+ completo. CURRENT es overlay y gana en duplicados.
   try{
     await Promise.allSettled([window.INCA_PLAYERS?.ensureCurrentReady?.(),window.INCA_PLAYERS?.ensureReady?.()]);
     const full=await window.INCA_PLAYERS?.rowsForPlayerFull?.(Number(key));
     if(Array.isArray(full)&&full.length)return full.map(r=>({...r,__ms:Number(r.__dateMs)||parseDate(r.Fecha)})).sort((a,b)=>b.__ms-a.__ms);
     const recent=window.INCA_PLAYERS?.rowsForPlayer?.(Number(key))||[];
     if(recent.length)return recent.map(r=>({...r,__ms:Number(r.__dateMs)||parseDate(r.Fecha)})).sort((a,b)=>b.__ms-a.__ms);
   }catch(err){console.warn('[PLAYER PICKS V1.040] PLAYER DATA HUB no disponible; usando fichero individual del mismo MASTER.',err?.message||err)}
   if(!meta.file)return [];
   return fetchJSON(`${state.root}${meta.file}?v=${VERSION}`).then(pack=>decodeRows(Array.isArray(pack)?pack:(pack?.rows||[])));
 })();
 state.playerCache.set(key,promise);
 try{const rows=await promise;state.playerCache.set(key,rows);return rows}catch(e){state.playerCache.delete(key);throw e}
}
function playerMeta(id){return state.playerMetaMap.get(String(id))||(state.manifest.players||[]).find(p=>String(p.id)===String(id))}
function leagueMeta(id){return state.manifest?.leagues?.[String(id)]||null}
function teamLogo(name){try{return typeof obtenerEscudoEquipo==='function'?obtenerEscudoEquipo(name):''}catch{return ''}}
function leagueLogo(id){const a=window.INCA_TITAN?.competitionLogoCandidates?.(id)||[];return a[0]||`./TITAN_LOGOS_COMP/logos_png/${id}.png`}
function opponentLogo(row){return teamLogo(row.Rival||'')}

function playerFaceData(meta={}){
 return {idJugador:meta.id||'',nombre:meta.name||'',equipo:meta.primary_team||'',fotoUrl:meta.photo||'',prioridad:false};
}
function hydrateFace(img,meta,priority=false){
 if(!img||!meta)return;
 const data={...playerFaceData(meta),prioridad:priority};
 const placeholder=img.parentElement?.querySelector('.ppsQ-face-placeholder,.ppsQ-resultface-placeholder')||null;
 img.loading=priority?'eager':'lazy'; img.decoding='async';
 // V1.040: la cara HD del nuevo TITAN se intenta primero; los assets viejos quedan como fallback.
 const id=String(meta.id||'').trim();
 const urls=id&&window.INCA_PLAYERS?.faceCandidates?window.INCA_PLAYERS.faceCandidates(id,meta.photo||''):[];
 if(!urls.length&&meta.photo)urls.push(meta.photo);
 if(id&&!urls.some(u=>String(u).includes('/player/'+id+'/image')))urls.push(`https://api.sofascore.com/api/v1/player/${encodeURIComponent(id)}/image`);
 urls.push(`https://ui-avatars.com/api/?name=${encodeURIComponent(meta.name||'Jugador')}&background=e9eef1&color=22313c&bold=true&rounded=true&size=256`);
 let i=0;
 const next=()=>{const u=urls[i++];if(!u){img.style.opacity='0';if(placeholder)placeholder.style.display='grid';return;}img.onload=()=>{img.style.opacity='1';if(placeholder)placeholder.style.display='none';};img.onerror=next;img.src=u;};next();
}


function mount(){
 const view=$('vista-jugadores');if(!view)return;
 view.classList.add('ppsQ-host');
 view.innerHTML=`<main class="ppsQ" id="ppsQRoot">
  <div class="ppsQ-navrow">
    <button class="ppsQ-back" id="ppsQBack" type="button"><i class="fa-solid fa-arrow-left"></i><span>VOLVER AL ANALYZER</span></button>
  </div>
  <header class="ppsQ-top">
    <div class="ppsQ-title">
      <small>ANALYZER · JUGADORES</small>
      <h2>PLAYER PICKS</h2>
      <p>MASTER 2025+ oficial. CURRENT/DELTA reciente tiene prioridad al actualizar.</p>
    </div>
    <div class="ppsQ-selectors">
      <label><span>LIGA</span><div class="ppsQ-select"><img id="ppsQLeagueLogo" alt=""><select id="ppsQLeague" data-no-league-enhance="1"></select><i class="fa-solid fa-chevron-down"></i></div></label>
      <label><span>EQUIPO</span><div class="ppsQ-select"><img id="ppsQTeamLogo" alt=""><select id="ppsQTeam"></select><i class="fa-solid fa-chevron-down"></i></div></label>
      <button class="ppsQ-find" id="ppsQFind" type="button" aria-label="Buscar jugador">
        <i class="fa-solid fa-magnifying-glass"></i>
        <span><strong id="ppsQFindLabel">BUSCAR JUGADOR</strong><small id="ppsQFindMeta">Búsqueda manual</small></span>
        <kbd>⌘ K</kbd>
      </button>
    </div>
  </header>

  <section class="ppsQ-empty" id="ppsQEmpty">
    <div class="ppsQ-empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
    <div><strong>BUSCA UN JUGADOR PARA EMPEZAR</strong><span>${state.manifest?.counts?.final_players||state.manifest?.counts?.players||0} jugadores disponibles · filtra por liga/equipo o usa búsqueda global.</span></div>
    <button type="button" id="ppsQEmptyFind">BUSCAR JUGADOR <i class="fa-solid fa-arrow-right"></i></button>
  </section>

  <section class="ppsQ-work" id="ppsQWork" hidden>
    <div class="ppsQ-playerbar">
      <div class="ppsQ-player">
        <div class="ppsQ-face">
          <img id="ppsQFace" alt="">
          <span class="ppsQ-face-placeholder"><i class="fa-solid fa-user"></i></span>
        </div>
        <div class="ppsQ-playercopy">
          <small>PLAYER PROFILE</small>
          <h2 id="ppsQName">JUGADOR</h2>
          <p><span id="ppsQTeamName">EQUIPO</span><b id="ppsQPos">—</b></p>
        </div>
      </div>
      <div class="ppsQ-playerpulse">
        <small>CUMPLIMIENTO</small>
        <strong id="ppsQHeroHit">0%</strong>
        <span id="ppsQHeroMeta">0 de 0 partidos</span>
      </div>
      <button class="ppsQ-export" id="ppsQExport" type="button" title="Exportar análisis como imagen PNG">
        <i class="fa-regular fa-image"></i>
        <span><strong>EXPORTAR</strong><small>IMAGEN PNG</small></span>
      </button>
    </div>

    <div class="ppsQ-controlrow">
      <label class="metric"><span>MÉTRICA</span><div id="ppsQMetricPicker"></div></label>
      <label class="competition"><span>COMPETICIÓN</span><div id="ppsQCompetitionPicker"></div></label>
      <label class="condition"><span>CONDICIÓN</span><div id="ppsQConditionPicker"></div></label>
      <label class="range"><span>MUESTRA</span><div id="ppsQRangePicker"></div></label>
      <label class="line"><span>LÍNEA</span><div id="ppsQLine"></div></label>
    </div>

    <article class="ppsQ-chartpanel">
      <div class="ppsQ-charthead">
        <div class="ppsQ-charttitle"><span class="ppsQ-metricicon"><i id="ppsQChartIcon" class="fa-solid fa-crosshairs"></i></span><div><small id="ppsQSource">${esc(state.source)}</small><h3 id="ppsQChartTitle">TIROS</h3><p id="ppsQChartContext">TODAS LAS COMPETICIONES</p></div></div>
        <div class="ppsQ-kpis">
          <span class="primary"><small>ACIERTOS</small><strong id="ppsQHit">0%</strong></span>
          <span><small>PROMEDIO</small><strong id="ppsQAvg">0</strong></span>
          <span><small>MEDIANA</small><strong id="ppsQMed">0</strong></span>
          <span><small>MUESTRA</small><strong id="ppsQSample">0 PJ</strong></span>
        </div>
      </div>
      <div class="ppsQ-chart" id="ppsQChart"></div>
    </article>

    <section class="ppsQ-log">
      <div class="ppsQ-loghead"><div><small>DETALLE</small><h3>PARTIDOS ANALIZADOS</h3></div><strong id="ppsQLogCount">0 PARTIDOS</strong></div>
      <div class="ppsQ-lines" id="ppsQLines"></div>
    </section>
  </section>

  <button class="ppsQ-quick-find" id="ppsQQuickFind" type="button"><i class="fa-solid fa-user-pen"></i><span>CAMBIAR JUGADOR</span></button>

  <div class="ppsQ-modal" id="ppsQModal" hidden>
    <div class="ppsQ-dialog">
      <header><div><small>DIRECTORIO DE JUGADORES</small><h3>Buscar jugador</h3><p>Escribe nombre o equipo. La búsqueda usa la campaña actual y el histórico validado disponible.</p></div><button id="ppsQClose" type="button" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></header>
      <div class="ppsQ-search-modes" role="group" aria-label="Modo de búsqueda">
        <button type="button" data-search-mode="team"><i class="fa-solid fa-users"></i><span>EQUIPO ACTUAL</span></button>
        <button type="button" data-search-mode="name"><i class="fa-solid fa-magnifying-glass"></i><span>BUSCAR POR NOMBRE</span></button>
      </div>
      <label class="ppsQ-search"><i class="fa-solid fa-magnifying-glass"></i><input id="ppsQSearch" type="search" placeholder="Escribe el nombre del jugador..." autocomplete="off"><kbd>ESC</kbd></label>
      <div class="ppsQ-results" id="ppsQResults"></div>
    </div>
  </div>

  <div class="ppsQ-metric-modal" id="ppsQMetricModal" hidden>
    <div class="ppsQ-metric-dialog" role="dialog" aria-modal="true" aria-labelledby="ppsQMetricModalTitle">
      <header>
        <div><small>ANALYZER · MÉTRICAS DE JUGADOR</small><h3 id="ppsQMetricModalTitle">Elegir métrica</h3><p>Selecciona una estadística compatible con la posición del jugador.</p></div>
        <button id="ppsQMetricClose" type="button" aria-label="Cerrar selector de métrica"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="ppsQ-metric-groups" id="ppsQMetricGroups"></div>
    </div>
  </div>
 </main>`;
 bind();
}

function bind(){
 let leagueChangeSeq=0,leagueTimer=0;
 $('ppsQBack')?.addEventListener('click',()=>{ if(window.INCA_NAV?.openScanner) window.INCA_NAV.openScanner(); else if(typeof window.volverAlEscanerOriginal==='function') window.volverAlEscanerOriginal(); });
 $('ppsQLeague').addEventListener('change',()=>{
   const select=$('ppsQLeague');
   const next=String(select?.value||'');
   if(!next||next===String(state.comp))return;
   const seq=++leagueChangeSeq;
   clearTimeout(leagueTimer);
   document.body.classList.add('ppsQ-league-changing');
   if(select)select.disabled=true;
   leagueTimer=setTimeout(()=>{
     try{
       if(seq!==leagueChangeSeq)return;
       state.comp=next;
       state.player=null;state.playerCompetition='ALL';state.condition='ALL';state.query='';
       if($('ppsQWork'))$('ppsQWork').hidden=true;
       if($('ppsQEmpty'))$('ppsQEmpty').hidden=false;
       if($('ppsQFindLabel'))$('ppsQFindLabel').textContent='BUSCAR JUGADOR';
       closeSearch();closePickers();
       fillTeams({preserveTeam:false});
     }catch(err){
       console.error('[PLAYER PICKS] cambio de liga protegido',err);
     }finally{
       if(select)select.disabled=false;
       document.body.classList.remove('ppsQ-league-changing');
     }
   },40);
 });
 $('ppsQTeam').addEventListener('change',()=>{state.team=$('ppsQTeam').value;syncTeamLogo();updateFindMeta()});
 $('ppsQFind').addEventListener('click',()=>openSearch('team'));
 $('ppsQQuickFind')?.addEventListener('click',()=>openSearch('team'));
 $('ppsQEmptyFind')?.addEventListener('click',()=>openSearch('name'));
 $('ppsQClose').addEventListener('click',closeSearch);
 $('ppsQModal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeSearch()});
 $('ppsQMetricClose').addEventListener('click',closeMetricMenu);
 $('ppsQMetricModal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeMetricMenu()});
 $('ppsQSearch').addEventListener('input',e=>{state.query=e.target.value||'';renderSearch()});
 $('ppsQModal').querySelectorAll('[data-search-mode]').forEach(b=>b.addEventListener('click',()=>{state.searchMode=b.dataset.searchMode||'team';state.query='';$('ppsQSearch').value='';syncSearchMode();renderSearch();requestAnimationFrame(()=>$('ppsQSearch').focus())}));
 $('ppsQExport').addEventListener('click',exportPlayerPng);
 document.addEventListener('click',e=>{if(!e.target.closest('.ppsQ-picker'))closePickers()});
 document.addEventListener('keydown',e=>{
   if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'&&$('vista-jugadores')?.style.display!=='none'){
     e.preventDefault();openSearch('name');
   }
   if(e.key==='Escape'){
     closePickers();
     if(!$('ppsQMetricModal')?.hidden)closeMetricMenu();
     if(!$('ppsQModal')?.hidden)closeSearch();
   }
 });
}

function augmentCurrentPlayersForLeague(){
 const comp=String(state.comp||'');
 if(!comp||state.currentLeagueAugmented.has(comp))return false;
 const playersApi=window.INCA_PLAYERS;
 if(!playersApi?.info?.().currentReady)return false;
 const lm=leagueMeta(comp);if(!lm)return false;
 lm.teams=lm.teams||{};
 const current=playersApi.directoryForLeague?.(Number(comp))||[];
 if(!current.length){state.currentLeagueAugmented.add(comp);return false;}
 for(const p of current){
   const id=String(p.id||'');if(!id)continue;
   const teamId=String(p.teamId||'').trim()||`current_${norm(p.team)}`;
   if(!lm.teams[teamId])lm.teams[teamId]={name:p.team||'Equipo',players:[]};
   const slot=lm.teams[teamId];
   if(!Array.isArray(slot.players))slot.players=[];
   if(!slot.players.includes(id))slot.players.push(id);
   const old=state.playerMetaMap.get(id);
   const merged={...(old||{}),id,name:p.name||old?.name||`Jugador ${id}`,primary_team:p.team||old?.primary_team||'',primary_team_id:String(p.teamId||old?.primary_team_id||''),primary_competition_id:comp,position:p.position||old?.position||'',matches:Math.max(Number(old?.matches)||0,Number(p.matches)||0),photo:old?.photo||`https://api.sofascore.com/api/v1/player/${id}/image`,source:'TITAN_PLAYERS_CURRENT',file:old?.file||''};
   if(old)Object.assign(old,merged);
   else{state.playerMetaMap.set(id,merged);state.manifest.players.push(merged);}
 }
 state.manifest.counts=state.manifest.counts||{};
 state.manifest.counts.final_players=state.manifest.players.length;
 state.currentLeagueAugmented.add(comp);
 return true;
}

function refreshCurrentLeagueFromCurrent(){
 const select=$('ppsQLeague');
 if(!select||String(select.value)!==String(state.comp))return;
 try{augmentCurrentPlayersForLeague();fillTeams({preserveTeam:true,skipAugment:true});}catch(err){console.warn('[PLAYER PICKS] refresh CURRENT diferido',err)}
}

function fillLeagues(){
 const sel=$('ppsQLeague');
 const cur=window.INCA_TITAN?.CURATED_COMPETITIONS||[];
 sel.innerHTML=cur.map(c=>{
   const lm=leagueMeta(c.id),count=lm?Object.values(lm.teams||{}).reduce((a,t)=>a+(t.players?.length||0),0):0;
   return `<option value="${c.id}" data-competition-id="${c.id}" data-display-name="${esc(c.name)}" data-region="${esc(c.region||'')}" data-country="${esc(c.country||'')}">${esc(c.name)}${count?` · ${count}`:''}</option>`;
 }).join('');
 const context=Number(window.INCA_TITAN?.competitionId?.($('selectLiga')?.value)||window.INCA_TITAN?.competitionId?.($('selectLigaPro')?.value)||17);
 state.comp=cur.some(c=>Number(c.id)===context)?String(context):String(cur[0]?.id||17);
 sel.value=state.comp;
 syncLeagueLogo();fillTeams();
}
function syncLeagueLogo(){const im=$('ppsQLeagueLogo');if(!im)return;im.src=leagueLogo(state.comp);im.onerror=()=>im.style.visibility='hidden';im.onload=()=>im.style.visibility='visible'}
function fillTeams({preserveTeam=true,skipAugment=false}={}){
 syncLeagueLogo();
 if(!skipAugment)augmentCurrentPlayersForLeague();
 const lm=leagueMeta(state.comp),teams=lm?.teams||{};
 const arr=Object.entries(teams).sort((a,b)=>String(a[1]?.name||'').localeCompare(String(b[1]?.name||''),'es'));
 const sel=$('ppsQTeam');if(!sel)return;
 const previous=preserveTeam?String(state.team||sel.value||''):'';
 sel.innerHTML=arr.length?arr.map(([id,t])=>`<option value="${esc(id)}" data-team-id="${esc(id)}" data-display-name="${esc(t.name)}">${esc(t.name)} · ${(t.players||[]).length}</option>`).join(''):'<option value="">SIN JUGADORES</option>';
 if(previous&&arr.some(([id])=>String(id)===previous))sel.value=previous;
 state.team=sel.value||'';
 syncTeamLogo();updateFindMeta();
}
function syncTeamLogo(){
 const name=leagueMeta(state.comp)?.teams?.[state.team]?.name||'';
 const im=$('ppsQTeamLogo'),src=teamLogo(name);im.src=src||'';im.style.visibility=src?'visible':'hidden';im.onerror=()=>im.style.visibility='hidden';
}
function updateFindMeta(){
 const lm=leagueMeta(state.comp),team=lm?.teams?.[state.team];
 const meta=$('ppsQFindMeta');if(meta)meta.textContent=team?`${(team.players||[]).length} jugadores · ${team.name}`:`${state.manifest?.counts?.final_players||state.manifest?.counts?.players||0} jugadores en búsqueda global`;
}

function searchCandidates(){
 const q=norm(state.query);
 const teamPlayers=leagueMeta(state.comp)?.teams?.[state.team]?.players||[];
 const teamSet=new Set(teamPlayers);
 const all=state.manifest.players||[];
 const pool=state.searchMode==='team'&&teamSet.size?all.filter(p=>teamSet.has(String(p.id))):all;
 const filtered=q?pool.filter(p=>norm(`${p.name} ${p.primary_team} ${p.position}`).includes(q)):pool;
 return filtered.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'es')).slice(0,100);
}
function syncSearchMode(){
 const modal=$('ppsQModal');if(!modal)return;
 modal.querySelectorAll('[data-search-mode]').forEach(b=>b.classList.toggle('active',b.dataset.searchMode===state.searchMode));
 const inp=$('ppsQSearch');
 if(inp)inp.placeholder=state.searchMode==='name'?'Escribe el nombre del jugador...':'Busca dentro del equipo seleccionado...';
}
function openSearch(mode='team'){
 state.searchMode=mode;state.query='';$('ppsQSearch').value='';syncSearchMode();renderSearch();$('ppsQModal').hidden=false;document.body.classList.add('ppsQ-lock');requestAnimationFrame(()=>$('ppsQSearch').focus())
}
function closeSearch(){$('ppsQModal').hidden=true;document.body.classList.remove('ppsQ-lock')}
function warmSearchFaces(root){
 if(!root)return;
 const refresh=()=>root.querySelectorAll('img[data-player-face]').forEach((img,i)=>{if(i<12 || img.getBoundingClientRect().top < innerHeight+260)hydrateFace(img,playerMeta(img.dataset.playerFace),true)});
 try{
   const ready=typeof asegurarMapasCarasListos==='function'?asegurarMapasCarasListos():null;
   if(ready?.then)ready.then(()=>requestAnimationFrame(refresh)).catch(()=>{});
 }catch(_){ }
 setTimeout(refresh,80);
 setTimeout(refresh,650);
}
function renderSearch(){
 const root=$('ppsQResults'),list=searchCandidates();
 root.innerHTML=list.length?list.map(p=>{
   const teamSrc=teamLogo(p.primary_team||'');
   return `<button data-id="${esc(p.id)}" type="button">
    <span class="ppsQ-resultface"><img data-player-face="${esc(p.id)}" alt=""><span class="ppsQ-resultface-placeholder"><i class="fa-solid fa-user"></i></span></span>
    <span class="ppsQ-resultcopy"><strong>${esc(p.name)}</strong><small>${teamSrc?`<img src="${esc(teamSrc)}" alt="">`:''}${esc(p.primary_team||'Búsqueda global')} · ${esc(positionLabel(p.position))}</small></span>
    <b>${p.matches} PJ</b><i class="fa-solid fa-chevron-right"></i>
   </button>`;
 }).join(''):'<div class="ppsQ-noresults"><i class="fa-regular fa-face-frown"></i><strong>SIN COINCIDENCIAS</strong><span>Prueba con otro nombre o cambia el modo de búsqueda.</span></div>';
 root.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',async()=>{await choosePlayer(b.dataset.id);closeSearch()}));
 searchFaceObserver?.disconnect?.();
 if('IntersectionObserver' in window){
   searchFaceObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;const img=entry.target;searchFaceObserver.unobserve(img);hydrateFace(img,playerMeta(img.dataset.playerFace),true)}),{root:root,rootMargin:'220px 0px',threshold:.01});
   root.querySelectorAll('img[data-player-face]').forEach((img,i)=>{if(i<8)hydrateFace(img,playerMeta(img.dataset.playerFace),true);else searchFaceObserver.observe(img)});
 }else root.querySelectorAll('img[data-player-face]').forEach(img=>hydrateFace(img,playerMeta(img.dataset.playerFace),true));
 warmSearchFaces(root);
}

async function choosePlayer(id){
 const meta=playerMeta(id);if(!meta)return;
 const rows=await loadPlayer(id);
 state.player={...meta,rows};
 state.playerCompetition='ALL';state.condition='ALL';
 $('ppsQEmpty').hidden=true;$('ppsQWork').hidden=false;
 $('ppsQName').textContent=meta.name;
 $('ppsQTeamName').textContent=meta.primary_team||rows[0]?.Equipo||'EQUIPO';
 $('ppsQPos').textContent=positionLabel(meta.position||rows[0]?.Posicion||'JUG');
 $('ppsQFindLabel').textContent=meta.name.toUpperCase();
 const face=$('ppsQFace');hydrateFace(face,meta,true);
 fillMetrics();fillPlayerCompetitions();render();
 $('ppsQWork').scrollIntoView({behavior:'smooth',block:'start'});
}

function closePickers(except=null){
 document.querySelectorAll('#vista-jugadores .ppsQ-picker.open').forEach(p=>{if(p!==except)p.classList.remove('open')});
}
function renderPicker(rootId,{value,icon='fa-chevron-down',groups=[],onChange}){
 const root=$(rootId);if(!root)return;
 const flat=groups.flatMap(g=>(g.options||[]).map(o=>({...o,group:g.label||'OPCIONES'}))),cur=flat.find(o=>String(o.value)===String(value))||flat[0]||{label:'—',value:''};
 root.innerHTML=`<div class="ppsQ-picker"><button class="ppsQ-picker-button" type="button"><i class="fa-solid ${esc(cur.icon||icon)}"></i><strong>${esc(cur.label)}</strong><i class="fa-solid fa-chevron-down"></i></button><div class="ppsQ-picker-menu">${groups.map(g=>`<section><small>${esc(g.label||'OPCIONES')}</small>${(g.options||[]).map(o=>`<button type="button" data-value="${esc(o.value)}" class="${String(o.value)===String(value)?'selected':''}"><span>${esc(o.label)}</span>${String(o.value)===String(value)?'<i class="fa-solid fa-check"></i>':''}</button>`).join('')}</section>`).join('')}</div></div>`;
 const picker=root.firstElementChild,trigger=picker.querySelector('.ppsQ-picker-button');
 trigger.addEventListener('click',e=>{
   e.stopPropagation();
   if(window.INCA_MOBILE_CHOICE?.shouldUse?.()){
     const title=rootId==='ppsQConditionPicker'?'Localía / condición':rootId==='ppsQRangePicker'?'Muestra de partidos':rootId==='ppsQCompetitionPicker'?'Competición':rootId==='ppsQLine'?'Línea':'Seleccionar';
     window.INCA_MOBILE_CHOICE.open({title,context:rootId==='ppsQCompetitionPicker'?'league':'generic',value:String(value),options:flat.map(o=>({value:String(o.value),label:o.label,group:o.group,icon:o.icon||icon})),onChoose:v=>onChange?.(v)});
     return;
   }
   const was=picker.classList.contains('open');closePickers(picker);picker.classList.toggle('open',!was);
 });
 picker.querySelectorAll('[data-value]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();picker.classList.remove('open');onChange?.(b.dataset.value)}));
}

function metricAvailable(key){
 const m=MM[key];if(!m)return false;if(m.calc||!m.f)return true;
 const rows=state.player?.rows||[];
 return rows.some(r=>Object.prototype.hasOwnProperty.call(r,m.f)&&String(r[m.f]??'').trim()!=='');
}
function metricGroupsForPlayer(){
 const pos=String(state.player?.position||state.player?.rows?.[0]?.Posicion||'').toUpperCase();
 if(/^G|GK|POR/.test(pos)){
   const keys=['saves','passes','cards'];
   return [{label:'ARQUERO',icon:'fa-hands',options:keys.filter(metricAvailable).map(k=>({value:k,label:MM[k].l.toUpperCase(),icon:MM[k].icon}))}];
 }
 return METRIC_GROUPS.filter(g=>g.label!=='PORTERO').map(g=>({label:g.label,icon:g.icon,options:g.keys.filter(metricAvailable).map(k=>({value:k,label:MM[k].l.toUpperCase(),icon:MM[k].icon}))})).filter(g=>g.options.length);
}
function metricDescription(key){
 const map={
  shots:'Remates totales del jugador',sot:'Remates dirigidos al arco',passes:'Pases intentados por partido',passesok:'Pases completados',goals:'Goles anotados',assists:'Asistencias registradas',ga:'Goles + asistencias',saves:'Atajadas del arquero',fouls:'Faltas cometidas',fouled:'Faltas recibidas',tackles:'Entradas / tackles',cards:'Tarjetas recibidas',yellow:'Tarjetas amarillas',red:'Tarjetas rojas',offsides:'Posiciones adelantadas',minutes:'Minutos jugados',rating:'Rating del jugador'
 };
 return map[key]||'Estadística por partido';
}
function renderMetricModal(){
 const root=$('ppsQMetricGroups');if(!root)return;
 const groups=metricGroupsForPlayer();
 root.innerHTML=groups.map(g=>`<section class="ppsQ-metric-section"><div class="ppsQ-metric-section-title"><span><i class="fa-solid ${esc(g.icon||'fa-chart-simple')}"></i></span><div><strong>${esc(g.label)}</strong><small>${g.options.length} MÉTRICAS</small></div></div><div class="ppsQ-metric-grid">${g.options.map(o=>`<button type="button" class="ppsQ-metric-option ${String(o.value)===String(state.metric)?'selected':''}" data-metric="${esc(o.value)}"><span class="ppsQ-metric-option-icon"><i class="fa-solid ${esc(o.icon||'fa-chart-simple')}"></i></span><span class="ppsQ-metric-option-copy"><strong>${esc(o.label)}</strong><small>${esc(metricDescription(o.value))}</small></span><i class="fa-solid fa-check ppsQ-metric-option-check"></i></button>`).join('')}</div></section>`).join('');
 root.querySelectorAll('[data-metric]').forEach(btn=>btn.addEventListener('click',()=>{
   const v=btn.dataset.metric;if(!MM[v])return;
   state.metric=v;state.line=MM[v].def;
   renderMetricPicker();renderLine();render();closeMetricMenu();
 }));
}
function openMetricMenu(){
 renderMetricModal();
 const modal=$('ppsQMetricModal');if(!modal)return;
 modal.hidden=false;document.body.classList.add('ppsQ-lock');
 requestAnimationFrame(()=>modal.querySelector('.ppsQ-metric-option.selected')?.focus());
}
function closeMetricMenu(){
 const modal=$('ppsQMetricModal');if(modal)modal.hidden=true;
 if($('ppsQModal')?.hidden!==false)document.body.classList.remove('ppsQ-lock');
}
function renderMetricPicker(){
 const root=$('ppsQMetricPicker');if(!root)return;
 const m=MM[state.metric]||MM.shots;
 root.innerHTML=`<button class="ppsQ-picker-button ppsQ-metric-trigger" type="button" aria-haspopup="dialog"><i class="fa-solid ${esc(m.icon||'fa-chart-simple')}"></i><strong>${esc(m.l.toUpperCase())}</strong><i class="fa-solid fa-chevron-right"></i></button>`;
 root.querySelector('button')?.addEventListener('click',openMetricMenu);
}
function renderCompetitionPicker(){
 renderPicker('ppsQCompetitionPicker',{value:state.playerCompetition,icon:'fa-trophy',groups:[{label:'COMPETICIÓN',options:state.competitionOptions}],onChange:v=>{state.playerCompetition=v;renderCompetitionPicker();render()}});
}
function renderConditionPicker(){
 renderPicker('ppsQConditionPicker',{value:state.condition,icon:'fa-location-dot',groups:[{label:'LOCALÍA / CONDICIÓN',options:[{value:'ALL',label:'GLOBAL',icon:'fa-earth-americas'},{value:'LOCAL',label:'LOCAL',icon:'fa-house'},{value:'VISITA',label:'VISITA',icon:'fa-plane'}]}],onChange:v=>{state.condition=v;renderConditionPicker();render()}});
}
function renderRangePicker(){
 renderPicker('ppsQRangePicker',{value:String(state.range),icon:'fa-layer-group',groups:[{label:'MUESTRA',options:[{value:'5',label:'ÚLTIMOS 5'},{value:'10',label:'ÚLTIMOS 10'},{value:'20',label:'ÚLTIMOS 20'},{value:'all',label:'TODA LA COMPETICIÓN'}]}],onChange:v=>{state.range=v==='all'?'all':Number(v);renderRangePicker();render()}});
}
function fillMetrics(){
 const groups=metricGroupsForPlayer(),available=new Set(groups.flatMap(g=>g.options.map(o=>o.value)));
 state.metric=available.has(defaultMetric())?defaultMetric():(groups[0]?.options?.[0]?.value||'cards');
 state.line=MM[state.metric].def;renderMetricPicker();renderLine();
}
function fillPlayerCompetitions(){
 if(!state.player)return;
 const map=new Map();
 (state.player.rows||[]).forEach(r=>{
   const id=String(r.Competition_ID||'').trim(),name=String(r.Torneo||'Competición').trim();
   if(id&&!map.has(id))map.set(id,name);
 });
 const items=[...map.entries()].sort((a,b)=>a[1].localeCompare(b[1],'es'));
 state.competitionOptions=[{value:'ALL',label:'TODAS LAS COMPETICIONES',icon:'fa-trophy'},...items.map(([id,name])=>({value:id,label:name.toUpperCase(),icon:'fa-futbol'}))];
 state.playerCompetition='ALL';
 renderCompetitionPicker();renderConditionPicker();renderRangePicker();
}
function defaultMetric(){
 const p=String(state.player?.position||'').toUpperCase();
 if(/^G|GK|POR/.test(p))return 'saves';
 if(/^D|DEF/.test(p))return 'tackles';
 if(/^M|MID/.test(p))return 'passes';
 return 'shots';
}
function normalizeManualHalfLine(raw,fallback=54.5){
 const value=Number(String(raw??'').replace(',','.'));
 if(!Number.isFinite(value))return Number(fallback)||54.5;
 // Las líneas de casas para pases se guardan siempre en x.5.
 return Math.max(.5,Math.min(1999.5,Math.floor(Math.max(0,value))+.5));
}
function renderLine(){
 const m=MM[state.metric],root=$('ppsQLine');
 if(!root||!m)return;

 if(m.manual){
   state.line=normalizeManualHalfLine(state.line,m.def);
   root.innerHTML=`<div class="ppsQ-manual ppsQ-manual-pass" role="group" aria-label="Línea manual de pases"><span><i class="fa-solid fa-keyboard"></i></span><input id="ppsQManualLineInput" type="number" min="${m.min??.5}" max="${m.max??1999.5}" step="${m.step??1}" inputmode="decimal" autocomplete="off" value="${Number(state.line).toFixed(1)}" placeholder="Ej. 54.5" aria-label="Escribir línea manual de pases"></div>`;
   const input=root.querySelector('#ppsQManualLineInput');
   let timer=0;
   const apply=(finalize=false)=>{
     const raw=String(input?.value??'').trim();
     if(!raw)return;
     const numeric=Number(raw.replace(',','.'));
     if(!Number.isFinite(numeric))return;
     state.line=finalize?normalizeManualHalfLine(numeric,m.def):numeric;
     if(finalize&&input)input.value=Number(state.line).toFixed(1);
     clearTimeout(timer);
     timer=setTimeout(()=>render(),finalize?0:180);
   };
   input?.addEventListener('input',()=>apply(false));
   input?.addEventListener('change',()=>apply(true));
   input?.addEventListener('blur',()=>apply(true));
   input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply(true);input.blur()}});
   return;
 }

 const lines=(m.lines||[.5])
   .filter(x=>Number.isFinite(Number(x)))
   .map(Number)
   .filter(x=>Math.abs((x-Math.floor(x))-.5)<1e-9);
 if(!lines.some(x=>x===Number(state.line)))state.line=lines[0]??.5;
 renderPicker('ppsQLine',{value:String(state.line),icon:'fa-sliders',groups:[{label:'MERCADO · LÍNEAS .5',options:lines.map(x=>({value:String(x),label:Number(x).toFixed(1),icon:'fa-minus'}))}],onChange:v=>{state.line=n(v);renderLine();render()}});
}

function conditionKey(v){
 const x=norm(v);
 if(x==='local'||x==='home'||x==='h'||x.includes('local'))return 'LOCAL';
 if(x==='visita'||x==='visitante'||x==='away'||x==='a'||x.includes('visita')||x.includes('away'))return 'VISITA';
 return 'OTRA';
}
function competitionRows(){
 let rows=state.player?.rows||[];
 if(state.playerCompetition!=='ALL')rows=rows.filter(r=>String(r.Competition_ID)===String(state.playerCompetition));
 if(state.condition!=='ALL')rows=rows.filter(r=>conditionKey(r.Condicion)===state.condition);
 return rows;
}
function sample(){
 const rows=competitionRows();
 return state.range==='all'?rows:rows.slice(0,Number(state.range)||10);
}
function currentCompetitionName(){
 let label='TODAS LAS COMPETICIONES';
 if(state.playerCompetition!=='ALL'){
   const row=(state.player?.rows||[]).find(r=>String(r.Competition_ID)===String(state.playerCompetition));
   label=String(row?.Torneo||'COMPETICIÓN').toUpperCase();
 }
 return `${label} · ${state.condition==='ALL'?'GLOBAL':state.condition}`;
}
function render(){
 if(!state.player)return;
 const m=MM[state.metric],rows=sample(),vals=rows.map(r=>metricVal(r,m)),line=Number(state.line||0),hits=vals.filter(v=>meets(v,line)).length,pct=rows.length?Math.round(hits*100/rows.length):0;
 $('ppsQChartIcon').className=`fa-solid ${m.icon}`;
 $('ppsQChartTitle').textContent=m.l.toUpperCase();
 $('ppsQChartContext').textContent=currentCompetitionName();
 $('ppsQSource').textContent=state.source;
 $('ppsQHit').textContent=`${pct}%`;
 $('ppsQHeroHit').textContent=`${pct}%`;
 $('ppsQHeroMeta').textContent=`${hits} de ${rows.length} · ${state.condition==='ALL'?'GLOBAL':state.condition} · línea ${line}`;
 $('ppsQAvg').textContent=format(m,avg(vals));
 $('ppsQMed').textContent=format(m,med(vals));
 $('ppsQSample').textContent=`${rows.length} PJ`;
 const pulse=$('ppsQHeroHit');pulse.classList.toggle('low',pct<50);pulse.classList.toggle('high',pct>=50);
 renderChart(rows,m,line);renderLines(rows,m,line);
}
function renderChart(rows,m,line){
 const root=$('ppsQChart');
 if(!rows.length){root.innerHTML='<div class="ppsQ-chart-empty">SIN PARTIDOS EN ESTA MUESTRA</div>';return}
 const vals=rows.map(r=>metricVal(r,m));
 // La línea del mercado se usa para CUMPLE / NO CUMPLE, pero ya no se dibuja encima
 // del gráfico. El eje depende únicamente de los valores observados para que desktop
 // y móvil compartan exactamente la misma geometría.
 const rawMax=Math.max(.5,...vals);
 const targetMax=Math.max(1,rawMax*1.18);
 const axisStep=Math.max(.5,Math.ceil((targetMax/4)*2)/2);
 const max=axisStep*4;
 const ticks=[max,axisStep*3,axisStep*2,axisStep,0];
 const contentWidth=Math.max(620,rows.length*82);
 root.innerHTML=`<div class="ppsQ-y">${ticks.map(v=>`<span>${v===0?'0':Number(v).toFixed(1)}</span>`).join('')}</div>
 <div class="ppsQ-plot-scroll" tabindex="0" aria-label="Gráfico desplazable horizontalmente">
  <div class="ppsQ-plot ppsQ-recalc" style="--pps-content-width:${contentWidth}px">
   <div class="ppsQ-gridlines"><i style="bottom:25%"></i><i style="bottom:50%"></i><i style="bottom:75%"></i></div>
   <div class="ppsQ-bars" style="--pps-count:${rows.length};--pps-bar-w:${Math.max(18,Math.min(42,Math.floor(390/Math.max(rows.length,1))))}px">${rows.map((r,i)=>{
     const v=vals[i],h=Math.max(0,Math.min(100,(v/max)*100)),hit=meets(v,line),logo=opponentLogo(r),d=dateParts(r.Fecha),parts=String(d.main||'').split(/\s+/),day=parts.shift()||'',month=parts.join(' ')||'';
     return `<div class="ppsQ-game ${hit?'hit':'miss'}" data-index="${i}">
       <strong class="ppsQ-value">${format(m,v)}</strong>
       <div class="ppsQ-barzone"><i style="--bar-h:${h}%"></i></div>
       <div class="ppsQ-game-meta" title="${esc(r.Rival||'Rival')} · ${esc(r.Fecha||'')}">
         <span class="ppsQ-opp">${logo?`<img src="${esc(logo)}" alt="${esc(r.Rival||'Rival')}">`:'<i class="fa-solid fa-shield"></i>'}</span>
         <small class="ppsQ-gamedate"><b>${esc(day)}</b><span>${esc(month)}</span><em>${esc(d.year)}</em></small>
       </div>
     </div>`;
   }).join('')}</div>
   <div class="ppsQ-hover" hidden></div>
  </div>
 </div>`;
 const plot=root.querySelector('.ppsQ-plot'),scroll=root.querySelector('.ppsQ-plot-scroll'),tip=root.querySelector('.ppsQ-hover');
 let pinnedIndex=null;
 const coarse=()=>Boolean(window.matchMedia?.('(pointer: coarse)').matches||window.innerWidth<=900);
 const hideTip=()=>{if(tip){tip.hidden=true;tip.classList.remove('is-pinned')}pinnedIndex=null};
 const fillTip=(r,v,hit,logo)=>{
   if(!tip)return;
   tip.innerHTML=`<div>${logo?`<img src="${esc(logo)}" alt="">`:''}<span><strong>${esc(r.Rival||'Rival')}</strong><small>${esc(r.Fecha||'')} · ${esc(conditionKey(r.Condicion))}</small></span></div><p><span>${esc(m.l.toUpperCase())}<b>${format(m,v)}</b></span><span>MERCADO<b>${Number(line).toFixed(1)}</b></span><em class="${hit?'hit':'miss'}">${hit?'CUMPLE':'NO CUMPLE'}</em></p>`;
 };
 const placePinned=(el)=>{
   if(!tip||tip.hidden||!plot||!scroll||!el)return;
   requestAnimationFrame(()=>{
     const tw=tip.offsetWidth||248,th=tip.offsetHeight||104;
     const visibleLeft=scroll.scrollLeft||0,visibleWidth=scroll.clientWidth||plot.clientWidth;
     const center=(el.offsetLeft||0)+(el.offsetWidth||0)/2;
     const x=Math.max(visibleLeft+8,Math.min(visibleLeft+visibleWidth-tw-8,center-tw/2));
     const barTop=Math.max(10,(el.offsetTop||0)+34);
     const y=Math.max(10,Math.min((plot.clientHeight||360)-th-10,barTop));
     tip.style.left=`${x}px`;tip.style.top=`${y}px`;
   });
 };
 requestAnimationFrame(()=>plot?.classList.remove('ppsQ-recalc'));
 root.querySelectorAll('.ppsQ-game').forEach(el=>{
   const i=Number(el.dataset.index),r=rows[i],v=vals[i],hit=meets(v,line),logo=opponentLogo(r);
   const show=e=>{
     if(!tip||!plot||coarse())return;
     fillTip(r,v,hit,logo);tip.hidden=false;
     const pr=plot.getBoundingClientRect(),tw=tip.offsetWidth||220,th=tip.offsetHeight||100,x=Math.max(10,Math.min(pr.width-tw-10,e.clientX-pr.left+14)),y=Math.max(10,Math.min(pr.height-th-10,e.clientY-pr.top-th-12));tip.style.left=`${x}px`;tip.style.top=`${y}px`;
   };
   const move=e=>{if(!tip||tip.hidden||!plot||coarse())return;const pr=plot.getBoundingClientRect(),tw=tip.offsetWidth||220,th=tip.offsetHeight||100,x=Math.max(10,Math.min(pr.width-tw-10,e.clientX-pr.left+14)),y=Math.max(10,Math.min(pr.height-th-10,e.clientY-pr.top-th-12));tip.style.left=`${x}px`;tip.style.top=`${y}px`};
   el.addEventListener('pointerenter',show);
   el.addEventListener('pointermove',move);
   el.addEventListener('pointerleave',()=>{if(tip&&!tip.classList.contains('is-pinned')&&!coarse())tip.hidden=true});
   el.addEventListener('click',e=>{
     if(!coarse())return;
     e.preventDefault();e.stopPropagation();
     if(pinnedIndex===i&&tip&&!tip.hidden){hideTip();return}
     pinnedIndex=i;fillTip(r,v,hit,logo);
     if(tip){tip.hidden=false;tip.classList.add('is-pinned');placePinned(el)}
   });
 });
 plot?.addEventListener('click',e=>{if(coarse()&&!e.target.closest('.ppsQ-game'))hideTip()});
 scroll?.addEventListener('scroll',()=>{if(pinnedIndex===null)return;const el=root.querySelector(`.ppsQ-game[data-index="${pinnedIndex}"]`);placePinned(el)},{passive:true});
}

function renderLines(rows,m,line){
 $('ppsQLogCount').textContent=`${rows.length} PARTIDOS`;
 const root=$('ppsQLines');
 root.innerHTML=rows.length?rows.map(r=>{
   const v=metricVal(r,m),hit=meets(v,line),logo=opponentLogo(r),d=dateParts(r.Fecha);
   return `<div class="ppsQ-row ${hit?'hit':'miss'}">
    <time><strong>${esc(d.main)}</strong><small>${esc(d.year)}</small></time>
    <span class="status"><i class="fa-solid ${hit?'fa-check':'fa-xmark'}"></i></span>
    <span class="opponent">${logo?`<img src="${esc(logo)}" alt="">`:''}<span><strong>${esc(r.Rival||'Rival')}</strong><small>${esc(r.Torneo||'')}</small></span></span>
    <span class="ppsQ-condition"><small>CONDICIÓN</small><strong>${esc(r.Condicion||'—')}</strong></span>
    <span><small>MINUTOS</small><strong>${esc(r.Minutos_Jugados||'0')}</strong></span>
    <span class="ppsQ-stat"><small>${esc(m.l.toUpperCase())}</small><strong>${format(m,v)}</strong></span>
    <span class="ppsQ-linevalue"><small>LÍNEA</small><strong>${line}</strong></span>
   </div>`;
 }).join(''):'<div class="ppsQ-noresults">SIN PARTIDOS</div>';
}


function safeName(v){
 return String(v||'reporte').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,80);
}
function rounded(ctx,x,y,w,h,r,fill,stroke=''){
 r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}
}
function fitText(ctx,text,max){
 let t=String(text||'');if(ctx.measureText(t).width<=max)return t;
 while(t.length>2&&ctx.measureText(t+'…').width>max)t=t.slice(0,-1);return t+'…';
}
async function canvasImage(url){
 if(!url)return null;
 try{
   const res=await fetch(url,{cache:'force-cache'});if(!res.ok)throw 0;
   const blob=await res.blob(),obj=URL.createObjectURL(blob);
   try{return await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=obj})}
   finally{setTimeout(()=>URL.revokeObjectURL(obj),5000)}
 }catch{return null}
}
function drawContain(ctx,img,x,y,w,h){
 if(!img)return;const rw=img.naturalWidth||img.width,rh=img.naturalHeight||img.height;if(!rw||!rh)return;
 const k=Math.min(w/rw,h/rh),dw=rw*k,dh=rh*k;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
function canvasDownload(canvas,name){
 canvas.toBlob(blob=>{if(!blob)return;const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)},'image/png',1);
}
async function exportPlayerPng(){
 if(!state.player)return;
 const btn=$('ppsQExport'),old=btn?.innerHTML;if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i><span><strong>GENERANDO</strong><small>IMAGEN PNG</small></span>'}
 try{
   await document.fonts?.ready;
   const m=MM[state.metric],rows=sample(),vals=rows.map(r=>metricVal(r,m)),line=Number(state.line||0),hits=vals.filter(v=>meets(v,line)).length,pct=rows.length?Math.round(hits*100/rows.length):0;
   const shown=rows.slice(0,38),W=1600,margin=64,rowH=52,chartH=330,headerH=250,filtersH=96,listHeadH=74,footerH=76;
   const H=headerH+filtersH+chartH+listHeadH+shown.length*rowH+footerH+70,scale=Math.min(2,window.devicePixelRatio||1.5);
   const canvas=document.createElement('canvas');canvas.width=Math.round(W*scale);canvas.height=Math.round(H*scale);const ctx=canvas.getContext('2d');ctx.scale(scale,scale);
   ctx.fillStyle='#f4f6f7';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,headerH);ctx.fillStyle='#0fbf83';ctx.fillRect(0,0,8,H);
   const faceUrl=$('ppsQFace')?.currentSrc||$('ppsQFace')?.src||'',teamUrl=teamLogo(state.player.primary_team||shown[0]?.Equipo||'')||'';
   const brandEl=document.querySelector('.portal-brand img,.brand-logo'),brandUrl=brandEl?.currentSrc||brandEl?.src||'';
   const oppUrls=shown.map(opponentLogo),imgs=await Promise.all([canvasImage(faceUrl),canvasImage(teamUrl),canvasImage(brandUrl),...oppUrls.map(canvasImage)]),face=imgs[0],team=imgs[1],brand=imgs[2],oppImgs=imgs.slice(3);
   rounded(ctx,margin,50,112,112,28,'#edf1f3','#dfe5e8');if(face)drawContain(ctx,face,margin,50,112,112);else{ctx.fillStyle='#9ba6ad';ctx.font='700 42px Arial';ctx.textAlign='center';ctx.fillText('●',margin+56,118)}
   ctx.textAlign='left';ctx.fillStyle='#73808a';ctx.font='800 12px Arial';ctx.fillText('PLAYER PICKS · INCA STATS ANALIZADOR',margin+142,70);
   ctx.fillStyle='#101820';ctx.font='800 38px Arial';ctx.fillText(fitText(ctx,state.player.name,720),margin+142,112);
   if(team)drawContain(ctx,team,margin+142,130,28,28);ctx.fillStyle='#45535d';ctx.font='700 15px Arial';ctx.fillText(fitText(ctx,state.player.primary_team||shown[0]?.Equipo||'',430),margin+178,150);
   ctx.fillStyle='#7b8790';ctx.font='700 12px Arial';ctx.fillText(positionLabel(state.player.position||shown[0]?.Posicion||''),margin+142,178);
   ctx.textAlign='right';ctx.fillStyle=pct>=50?'#20b866':'#e33d52';ctx.font='900 52px Arial';ctx.fillText(`${pct}%`,W-margin,104);ctx.fillStyle='#7b8790';ctx.font='800 11px Arial';ctx.fillText('CUMPLIMIENTO',W-margin,128);ctx.font='700 11px Arial';ctx.fillText(`${hits} DE ${rows.length} PARTIDOS`,W-margin,150);
   const fY=headerH+20,filters=[['MÉTRICA',m.l.toUpperCase()],['COMPETICIÓN',currentCompetitionName().replace(` · ${state.condition==='ALL'?'GLOBAL':state.condition}`,'')],['CONDICIÓN',state.condition==='ALL'?'GLOBAL':state.condition],['MUESTRA',state.range==='all'?'TODA LA COMPETICIÓN':`ÚLTIMOS ${state.range}`],['LÍNEA',String(line)]];
   const fw=(W-margin*2-16*4)/5;filters.forEach(([a,b],i)=>{const x=margin+i*(fw+16);rounded(ctx,x,fY,fw,58,12,'#fff','#dce2e6');ctx.textAlign='left';ctx.fillStyle='#8a959c';ctx.font='800 9px Arial';ctx.fillText(a,x+14,fY+20);ctx.fillStyle='#19232a';ctx.font='800 13px Arial';ctx.fillText(fitText(ctx,b,fw-28),x+14,fY+41)});
   const cY=headerH+filtersH,chartX=margin,chartW=W-margin*2;rounded(ctx,chartX,cY,chartW,chartH,18,'#11171b');ctx.fillStyle='#fff';ctx.font='800 25px Arial';ctx.textAlign='left';ctx.fillText(m.l.toUpperCase(),chartX+24,cY+40);ctx.fillStyle='#7e8b93';ctx.font='700 10px Arial';ctx.fillText(currentCompetitionName(),chartX+24,cY+60);
   const kpis=[['ACIERTOS',`${pct}%`],['PROMEDIO',format(m,avg(vals))],['MEDIANA',format(m,med(vals))],['MUESTRA',`${rows.length} PJ`]];kpis.forEach(([a,b],i)=>{const x=W-margin-390+i*98;ctx.fillStyle='#76838b';ctx.font='800 8px Arial';ctx.fillText(a,x,cY+31);ctx.fillStyle=i===0?(pct>=50?'#20b866':'#e33d52'):'#f3f6f7';ctx.font='800 18px Arial';ctx.fillText(b,x,cY+52)});
   const graphY=cY+92,graphH=chartH-120,rawMax=Math.max(.5,...vals),axisStep=Math.max(.5,Math.ceil((Math.max(1,rawMax*1.18)/4)*2)/2),max=axisStep*4,count=Math.max(shown.length,1),slot=(chartW-70)/count,barW=Math.max(8,Math.min(30,slot*.42));
   ctx.textAlign='right';ctx.fillStyle='#8fa0aa';ctx.font='800 9px Arial';[[max,graphY+4],[axisStep*2,graphY+graphH*.5+3],[0,graphY+graphH+3]].forEach(([v,yy])=>ctx.fillText(v===0?'0':Number(v).toFixed(1),chartX+31,yy));
   shown.forEach((r,i)=>{const v=metricVal(r,m),hit=meets(v,line),bh=Math.max(v>0?5:0,(v/max)*graphH),cx=chartX+48+slot*i+slot/2;ctx.fillStyle=hit?'#20b866':'#e33d52';rounded(ctx,cx-barW/2,graphY+graphH-bh,barW,bh,5,ctx.fillStyle);ctx.fillStyle='#e8eef1';ctx.font='800 9px Arial';ctx.textAlign='center';ctx.fillText(format(m,v),cx,graphY+graphH-bh-8)});
   const lY=cY+chartH+28;ctx.textAlign='left';ctx.fillStyle='#75818a';ctx.font='800 10px Arial';ctx.fillText('DETALLE',margin,lY);ctx.fillStyle='#111820';ctx.font='800 26px Arial';ctx.fillText('PARTIDOS ANALIZADOS',margin,lY+31);ctx.textAlign='right';ctx.fillStyle='#75818a';ctx.font='800 10px Arial';ctx.fillText(`${shown.length} PARTIDOS`,W-margin,lY+22);
   let y=lY+52;shown.forEach((r,i)=>{const v=metricVal(r,m),hit=meets(v,line),d=dateParts(r.Fecha),img=oppImgs[i];ctx.strokeStyle='#e1e6e9';ctx.beginPath();ctx.moveTo(margin,y+rowH);ctx.lineTo(W-margin,y+rowH);ctx.stroke();ctx.fillStyle=hit?'#20b866':'#e33d52';ctx.fillRect(margin,y+10,3,rowH-20);ctx.textAlign='left';ctx.fillStyle='#202a31';ctx.font='800 12px Arial';ctx.fillText(d.main,margin+18,y+23);ctx.fillStyle='#9aa3aa';ctx.font='700 9px Arial';ctx.fillText(d.year,margin+18,y+39);if(img)drawContain(ctx,img,margin+112,y+10,34,34);ctx.fillStyle='#1d2830';ctx.font='800 13px Arial';ctx.fillText(fitText(ctx,r.Rival||'Rival',390),margin+158,y+23);ctx.fillStyle='#8a949b';ctx.font='700 9px Arial';ctx.fillText(fitText(ctx,r.Torneo||'',390),margin+158,y+39);const rx=W-margin;ctx.textAlign='right';ctx.fillStyle='#89949b';ctx.font='800 8px Arial';ctx.fillText(`${conditionKey(r.Condicion)} · ${r.Minutos_Jugados||0} MIN`,rx-180,y+20);ctx.fillStyle=hit?'#169b52':'#d2384c';ctx.font='900 17px Arial';ctx.fillText(`${format(m,v)}  /  ${line}`,rx,y+34);y+=rowH});
   const fy=H-footerH;ctx.fillStyle='#111820';ctx.fillRect(0,fy,W,footerH);
   if(brand){rounded(ctx,margin,fy+14,48,48,10,'#fff');drawContain(ctx,brand,margin+4,fy+18,40,40)}
   ctx.textAlign='left';ctx.fillStyle='#fff';ctx.font='800 13px Arial';ctx.fillText('INCA STATS ANALIZADOR',margin+(brand?62:0),fy+30);ctx.fillStyle='#93a1aa';ctx.font='700 10px Arial';ctx.fillText('PLAYER PICKS · análisis estadístico sobre datos validados',margin+(brand?62:0),fy+49);
   ctx.textAlign='right';ctx.fillStyle='#fff';ctx.font='800 12px Arial';ctx.fillText(fitText(ctx,state.player.name,330),W-margin,fy+29);ctx.fillStyle='#20b866';ctx.font='800 9px Arial';ctx.fillText('MASTER 2025+ + CURRENT · DATOS VALIDADOS',W-margin,fy+48);
   canvasDownload(canvas,`INCA_STATS_PLAYER_${safeName(state.player.name)}_${safeName(m.l)}.png`);
 }catch(err){console.error('[INCA PLAYER EXPORT]',err);window.alert('No se pudo generar la imagen. Inténtalo nuevamente.')}finally{if(btn){btn.disabled=false;btn.innerHTML=old}}
}

async function open(){
 if(typeof estadoApp!=='undefined')estadoApp.vistaActiva='jugadores';
 document.body.classList.add('pro-mode','player-picks-mode');
 if($('topBarScanner')){ $('topBarScanner').style.display='none'; $('topBarScanner').classList.add('ppsQ-force-hidden'); }
 if($('topBarPro'))$('topBarPro').style.display='none';
 if($('topBarJugadores'))$('topBarJugadores').style.display='none';
 ['vista-escaner','vista-database','vista-rankings'].forEach(id=>{const e=$(id);if(e)e.style.display='none'});
 const view=$('vista-jugadores');
 if(view){
   view.style.display='block';
   if(!state.manifest) view.innerHTML='<div class="ppsQ-boot"><span></span><strong>PLAYER PICKS</strong><small>Preparando directorio…</small></div>';
 }
 try{
   await loadManifest();
   mount();
   fillLeagues();
 }catch(err){
   console.error('[PLAYER PICKS] No se pudo abrir',err);
   if(view) view.innerHTML='<div class="ppsQ-boot is-error"><strong>PLAYER PICKS</strong><small>No se pudo leer el directorio local. Recarga la página una vez.</small></div>';
 }
}
async function selectByName(name){
 await open();state.query=name||'';
 const p=(state.manifest.players||[]).find(x=>norm(x.name)===norm(name))||(state.manifest.players||[]).find(x=>norm(x.name).includes(norm(name)));
 if(!p)return false;await choosePlayer(p.id);return true;
}

window.addEventListener('inca:players-current-ready',()=>{if(document.getElementById('ppsQRoot')){state.currentLeagueAugmented.delete(String(state.comp||''));requestAnimationFrame(refreshCurrentLeagueFromCurrent);}});

const api=Object.freeze({open,selectByName,state});
window.INCA_PLAYER_PROPS=api;
})();
