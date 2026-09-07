(() => {
'use strict';

const $=id=>document.getElementById(id);
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const num=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(String(v).replace('%','').replace(',','.'));return Number.isFinite(x)?x:null};
const fmt=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'—';

const state={
  initialized:false,
  profiles:null,honours:null,
  profileById:new Map(),honoursById:new Map(),
  history:null,team:null,
  tournament:'ALL',sampleSize:10,condition:'ALL',
  currentTeams:[],fixtures:[],cacheLoaded:false,localTeamMap:[],
  allTeams:[],titanCatalog:[],requestedCompetition:null
};

const METRICS=[
  {key:'Goals',label:'Goles a favor',against:false},
  {key:'Goals',label:'Goles recibidos',against:true},
  {key:'Total shots',label:'Tiros',against:false},
  {key:'Shots on target',label:'Tiros al arco',against:false},
  {key:'Corner kicks',label:'Córners',against:false},
  {key:'Corner kicks',label:'Córners rival',against:true},
  {key:'Fouls',label:'Faltas',against:false},
  {key:'__cards',label:'Tarjetas',against:false},
  {key:'Offsides',label:'Fueras de juego',against:false},
  {key:'Goal kicks',label:'Saques de meta',against:false},
  {key:'Throw-ins',label:'Saques de banda',against:false},
  {key:'__tackles',label:'Entradas / tackles',against:false}
];

function metricValue(row,key){
  if(!row)return null;
  if(key==='__cards'){
    const y=num(row['Yellow cards']),r=num(row['Red cards']);
    if(y===null&&r===null)return null;
    return (y||0)+(r||0);
  }
  if(key==='__tackles'){
    const t=num(row['Total tackles']); return t!==null?t:num(row['Tackles']);
  }
  return num(row[key]);
}
function parseDate(v){
  const s=String(v||'').trim();
  const iso=/^\d{4}-\d{2}-\d{2}/.test(s)?new Date(s).getTime():NaN;
  if(Number.isFinite(iso))return iso;
  const m=/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(s);
  if(m)return new Date(Number(m[3]),Number(m[2])-1,Number(m[1])).getTime()||0;
  return new Date(s).getTime()||0;
}
function ownCondition(row){
  const v=String(row?.Condicion||'').toUpperCase();
  return (v==='LOCAL'||v==='HOME')?'LOCAL':(v==='VISITA'||v==='AWAY'||v==='VISITANTE')?'VISITA':'';
}
function pairIndex(history){
  if(history.__tiPairs)return history.__tiPairs;
  const map=new Map();
  for(const row of history.allRows||[]){
    const eid=String(row.Event_ID||''),time=String(row.Tiempo||'').toUpperCase(),tid=Number(row.Team_ID);
    if(!eid||!tid)continue;
    const k=`${eid}|${time}`;
    if(!map.has(k))map.set(k,new Map());
    map.get(k).set(tid,row);
  }
  try{Object.defineProperty(history,'__tiPairs',{value:map,enumerable:false})}catch{}
  return map;
}
function historyContexts(){
  if(Array.isArray(state.history?.contexts)&&state.history.contexts.length)return state.history.contexts;
  if(!state.team)return[];
  return window.INCA_TITAN?.teamContexts?.(state.team.team_id,null)||[];
}
function competitionName(compId,row=null){
  const id=Number(compId);
  const ctx=historyContexts().find(c=>Number(c.competition_id)===id);
  if(ctx?.competition_name)return ctx.competition_name;
  if(row?.Competition_Name)return row.Competition_Name;
  const comp=window.INCA_TITAN?.getCatalog?.()?.competitions?.find(c=>Number(c.competition_id??c.id)===id);
  return comp?.name||`Torneo ${id}`;
}
function tournamentList(){
  const map=new Map();
  for(const r of state.history?.rows||[]){
    if(String(r.Tiempo||'').toUpperCase()!=='ALL')continue;
    const id=Number(r.Competition_ID);if(!id)continue;
    if(!map.has(id))map.set(id,competitionName(id,r));
  }
  for(const c of historyContexts()){
    const id=Number(c.competition_id);if(id&&!map.has(id))map.set(id,c.competition_name||`Torneo ${id}`);
  }
  return [...map.entries()].map(([id,name])=>({id,name})).sort((a,b)=>String(a.name).localeCompare(String(b.name),'es',{sensitivity:'base'}));
}
function baseMatches(){
  if(!state.history||!state.team)return[];
  const pairs=pairIndex(state.history),ownId=Number(state.team.team_id);
  const tournamentId=state.tournament==='ALL'?0:Number(state.tournament);
  const condition=state.condition;
  const out=(state.history.rows||[])
    .filter(r=>String(r.Tiempo||'').toUpperCase()==='ALL')
    .filter(r=>!tournamentId||Number(r.Competition_ID)===tournamentId)
    .filter(r=>condition==='ALL'||ownCondition(r)===condition)
    .map(row=>{
      const eid=String(row.Event_ID||'');
      const pair=pairs.get(`${eid}|ALL`);
      const oppEntry=pair?[...pair.entries()].find(([tid])=>Number(tid)!==ownId):null;
      if(!oppEntry)return null;
      const [oppId,opp]=oppEntry;
      return{
        eventId:eid,date:String(row.Fecha||''),sortTime:parseDate(row.Fecha),
        condition:ownCondition(row),tournament:competitionName(Number(row.Competition_ID),row),
        competitionId:Number(row.Competition_ID)||0,
        own:row,opp,opponentId:Number(oppId),
        opponent:String(opp.Equipo||window.INCA_TITAN?.getCatalog?.()?.teams?.find(t=>Number(t.team_id)===Number(oppId))?.name||'Rival'),
        ownGoals:metricValue(row,'Goals'),oppGoals:metricValue(opp,'Goals')
      };
    }).filter(Boolean)
    .sort((a,b)=>b.sortTime-a.sortTime||Number(b.eventId)-Number(a.eventId));
  return out.slice(0,Math.max(10,Number(state.sampleSize)||10));
}
function avg(arr,key,against=false){
  const vals=[];
  for(const m of arr){const v=metricValue(against?m.opp:m.own,key);if(v!==null)vals.push(v)}
  return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
}
function metricSets(matches){
  const l5=matches.slice(0,5),l10=matches.slice(0,10);
  return METRICS.map(m=>({...m,sample:avg(matches,m.key,m.against),l10:avg(l10,m.key,m.against),l5:avg(l5,m.key,m.against)}));
}
function resultOf(m){
  if(m.ownGoals===null||m.oppGoals===null)return'';
  return m.ownGoals>m.oppGoals?'W':m.ownGoals<m.oppGoals?'L':'D';
}

async function fetchFirstJson(urls,label){
  let lastError=null;
  for(const url of urls.filter(Boolean)){
    try{
      const r=await fetch(url,{cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const data=await r.json();
      if(!data||typeof data!=='object')throw new Error('JSON vacío');
      return {data,url};
    }catch(e){lastError=e}
  }
  throw new Error(`${label} no disponible · ${lastError?.message||'sin respuesta'}`);
}
async function loadStaticJson(){
  if(state.profiles&&state.honours)return;
  const cfg=window.INCA_ARCH||{};
  const [pr,hr]=await Promise.all([
    fetchFirstJson([cfg.titanTeamIntelProfilesUrl,...(cfg.titanTeamIntelProfilesFallbackUrls||[])],'team_profiles.json'),
    fetchFirstJson([cfg.titanTeamIntelHonoursUrl,...(cfg.titanTeamIntelHonoursFallbackUrls||[])],'team_honours.json')
  ]);
  state.profiles=pr.data;state.honours=hr.data;
  state.profileById=new Map((pr.data.teams||[]).map(x=>[Number(x.team_id),x]));
  state.honoursById=new Map((hr.data.teams||[]).map(x=>[Number(x.team_id),x]));
  state.profileSource=pr.url;state.honoursSource=hr.url;
}
async function loadFootballCache(){
  if(state.cacheLoaded)return;
  state.cacheLoaded=true;
  let teams=[],fixtures=[];
  try{const a=await fetch('./data/live/current_teams.json').then(r=>r.json());teams=a?.teams||[]}catch{}
  try{
    const fx=window.INCA_FIXTURES;await fx?.ensureReady?.();
    fixtures=(fx?.upcoming?.({from:Date.now()-3600000})||[]).map(fx.toCacheFixture);
  }catch{
    try{const b=await fetch('./data/live/fixtures_next.json').then(r=>r.json());fixtures=b?.fixtures||[]}catch{}
  }
  try{
    const local=await fetch('./data/live/titan_team_map.json',{cache:'default'}).then(r=>r.ok?r.json():null);
    state.localTeamMap=Array.isArray(local?.teams)?local.teams:[];
  }catch{state.localTeamMap=[]}
  state.currentTeams=teams;state.fixtures=fixtures;
}
function teamNorm(v=''){
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/\b(?:fc|afc|cf|sc|ac|cd|ud|rc|fk|sk|bk|sv|as|us|ca)\b/g,' ')
    .replace(/\b(?:football club|futbol club|club de futbol|club atletico|atletico club)\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function teamNameScore(a,b){
  a=teamNorm(a);b=teamNorm(b);if(!a||!b)return 0;if(a===b)return 1;
  if(a.includes(b)||b.includes(a))return .94;
  const A=new Set(a.split(' ')),B=new Set(b.split(' '));
  const hit=[...A].filter(x=>B.has(x)).length;
  return hit/Math.max(A.size,B.size,1);
}
function candidateCatalogForCompetition(compId){
  const all=state.titanCatalog.length?state.titanCatalog:state.localTeamMap;
  const exact=all.filter(t=>Array.isArray(t.competition_ids)&&t.competition_ids.some(id=>Number(id)===Number(compId)));
  return exact.length?exact:all;
}
function resolveSofaIdForRow(row,compId=null){
  const direct=Number(row?.sofascore_team_id);if(direct>0)return direct;
  const candidates=candidateCatalogForCompetition(compId??row?.sofascore_competition_id);
  const rowCountry=teamNorm(row?.country||'');
  let best=null,bestScore=0;
  for(const t of candidates){
    const tc=teamNorm(t.country||'');if(rowCountry&&tc&&rowCountry!==tc)continue;
    const s=teamNameScore(row?.team_name||'',t.name||'');if(s>bestScore){best=t;bestScore=s}
  }
  return bestScore>=.82?Number(best?.team_id)||null:null;
}
function currentRowForSofa(teamId,compId=null){
  const sid=Number(teamId);
  return state.currentTeams.find(x=>resolveSofaIdForRow(x,Number(x.sofascore_competition_id))===sid&&(compId===null||Number(x.sofascore_competition_id)===Number(compId)))||null;
}
function fixtureForSofa(teamId){
  const compId=state.tournament==='ALL'?0:Number(state.tournament);
  const row=currentRowForSofa(teamId,compId||null)||currentRowForSofa(teamId),apiId=Number(row?.api_team_id),sid=Number(teamId),now=Date.now()-3600000;
  return state.fixtures.filter(f=>new Date(f.kickoff_utc).getTime()>=now&&(!compId||Number(f.sofascore_competition_id)===compId)&&(Number(f.home_sofascore_team_id)===sid||Number(f.away_sofascore_team_id)===sid||Number(f.home_api_team_id)===apiId||Number(f.away_api_team_id)===apiId)).sort((a,b)=>new Date(a.kickoff_utc)-new Date(b.kickoff_utc))[0]||null;
}
function formatPeruKickoff(value){
  const d=new Date(value);if(Number.isNaN(d.getTime()))return{date:'Fecha por confirmar',time:''};
  return{
    date:new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'long',day:'2-digit',month:'long'}).format(d),
    time:new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit',hour12:true}).format(d)+' · hora Perú'
  };
}

function norm(v=''){
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function compactName(v=''){return norm(v).replace(/\s+/g,'')}
function scoreQuickTeam(team,query){
  const q=norm(query),qc=compactName(query),name=norm(team.name),nc=compactName(team.name);
  if(!q)return 999;if(name===q||nc===qc)return 0;if(name.startsWith(q)||nc.startsWith(qc))return 1;
  if(name.split(' ').some(w=>w.startsWith(q)))return 2;if(name.includes(q)||nc.includes(qc))return 3;
  const tokens=q.split(' ').filter(Boolean);return tokens.length&&tokens.every(t=>name.includes(t))?4:999;
}
function searchQuickTeams(query){
  if(norm(query).length<2)return[];
  const source=state.allTeams.length?state.allTeams:(window.INCA_TITAN?.getCatalog?.()?.teams||[]);
  const aliases={'barca':'fc barcelona','barcelona':'fc barcelona','psg':'paris saint germain','bayern':'bayern munich','madrid':'real madrid'};
  const q=aliases[norm(query)]||query;
  return source.map(t=>({t,score:scoreQuickTeam(t,q)})).filter(x=>x.score<999)
    .sort((a,b)=>a.score-b.score||String(a.t.name).localeCompare(String(b.t.name),'es',{sensitivity:'base'}))
    .slice(0,20).map(x=>x.t);
}
function quickLogo(team){return window.INCA_TITAN?.logoUrl?.(team.name,team.team_id)||''}
function teamLogoSlot(url,cls='ti-inline-logo'){
  return `<span class="${cls}"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>${url?`<img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()">`:''}</span>`;
}
function setMainTeamLogo(url){
  const slot=$('tiTeamLogoSlot'),img=$('tiTeamLogo');if(!slot||!img)return;
  slot.classList.remove('has-logo');img.removeAttribute('src');img.style.display='none';img.style.visibility='visible';
  if(!url)return;
  img.onload=()=>{img.style.display='block';slot.classList.add('has-logo')};
  img.onerror=()=>{img.style.display='none';slot.classList.remove('has-logo')};
  img.src=url;
}
function renderQuickResults(query){
  const box=$('tiQuickResults');if(!box)return;
  const results=searchQuickTeams(query);
  if(!norm(query)||norm(query).length<2){box.hidden=true;box.innerHTML='';return}
  box.innerHTML=results.length?results.map(t=>`<button type="button" data-ti-team="${t.team_id}">${teamLogoSlot(quickLogo(t),'ti-search-logo')}<b>${esc(t.name)}</b><small>${esc(t.country||t.region||'')}</small><i class="fa-solid fa-chevron-right"></i></button>`).join(''):'<div class="ti-search-empty">No encontré equipos con ese nombre.</div>';
  box.hidden=false;
  box.querySelectorAll('[data-ti-team]').forEach(btn=>btn.addEventListener('click',async()=>{
    const id=Number(btn.dataset.tiTeam);const team=state.allTeams.find(t=>Number(t.team_id)===id)||window.INCA_TITAN?.getCatalog?.()?.teams?.find(t=>Number(t.team_id)===id);
    box.hidden=true;$('tiQuickSearch').value=team?.name||'';await teamChanged(id);
  }));
}

function renderTournamentOptions(){
  const sel=$('tiQuickTournament');if(!sel)return;
  const list=tournamentList();
  sel.innerHTML='<option value="ALL">Todos los torneos</option>'+list.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  sel.disabled=!state.team;
  const requested=Number(state.requestedCompetition)||0;
  if(requested&&list.some(x=>Number(x.id)===requested)){state.tournament=String(requested);sel.value=String(requested)}
  else if(state.tournament!=='ALL'&&!list.some(x=>String(x.id)===String(state.tournament))){state.tournament='ALL';sel.value='ALL'}
  else sel.value=String(state.tournament||'ALL');
  state.requestedCompetition=null;
}
function filterLabel(){
  const tournament=state.tournament==='ALL'?'Todos los torneos':tournamentList().find(x=>String(x.id)===String(state.tournament))?.name||'Torneo';
  const condition=state.condition==='LOCAL'?'Local':state.condition==='VISITA'?'Visita':'General';
  return `${tournament} · ${condition} · últimos ${state.sampleSize}`;
}
function updateFilterButtons(){
  document.querySelectorAll('#tiCondition [data-ti-condition]').forEach(btn=>btn.classList.toggle('active',btn.dataset.tiCondition===state.condition));
}

function parseHonours(text){
  let raw=String(text||'').trim();
  if(!raw || raw.length>50000 || /Championship titles.*season_statistics/i.test(raw))return [];
  raw=raw.replace(/^.*?Total won\s*\d+\s*titles?/i,'').replace(/Compare trophies.*$/i,'').trim();
  if(!raw)return [];
  const rx=/(.+?)\s*((?:(?:\d{2}\/\d{2})|(?:\d{4}\/\d{4}))*)\s*(\d{1,3})(?=[A-Za-zÀ-ÿ]|$)/g;
  const out=[];let match;
  while((match=rx.exec(raw))){
    const name=String(match[1]||'').trim();const seasons=(String(match[2]||'').match(/\d{4}\/\d{4}|\d{2}\/\d{2}/g)||[]);const count=Number(match[3]);
    if(!name||!Number.isFinite(count)||count<=0||count>150)continue;out.push({name,count,seasons});
  }
  return out;
}
function renderHonours(h){
  const target=$('tiHonoursText');if(!target)return;
  const total=Number.isFinite(Number(h?.total_titles))?Number(h.total_titles):null;const parsed=parseHonours(h?.titles_text);
  if(total===null&&!parsed.length){target.innerHTML='<div class="ti-honours-empty">Palmarés no disponible para este equipo.</div>';return}
  target.innerHTML=`<div class="ti-honours-simple-total"><strong>${total??'—'}</strong><span>${total===1?'título registrado':'títulos registrados'}</span></div>${parsed.length?`<div class="ti-honours-simple-list">${parsed.map(x=>`<div class="ti-honours-simple-row"><div><b>${esc(x.name)}</b><small>${x.seasons.length?esc(x.seasons.join(' · ')):'Años no disponibles'}</small></div><strong>${x.count}</strong></div>`).join('')}</div>`:'<div class="ti-honours-note">Solo está disponible el total registrado.</div>'}`;
}
function renderProfile(){
  const id=Number(state.team?.team_id),p=state.profileById.get(id)||{},h=state.honoursById.get(id)||{},sq=p.squad_summary||{};
  if($('tiCoach'))$('tiCoach').textContent=p.manager?.name||'No disponible';
  if($('tiVenue'))$('tiVenue').textContent=p.venue?.name||'No disponible';
  if($('tiVenueMeta'))$('tiVenueMeta').textContent=[p.venue?.city,p.venue?.capacity?`${Number(p.venue.capacity).toLocaleString()} cap.`:''].filter(Boolean).join(' · ');
  if($('tiCountry'))$('tiCountry').textContent=p.country?.name||state.team?.country||'—';
  if($('tiPlayers'))$('tiPlayers').textContent=sq.total_players??'—';
  if($('tiAge'))$('tiAge').textContent=sq.average_player_age!=null?`${sq.average_player_age} años`:'—';
  if($('tiForeign'))$('tiForeign').textContent=sq.foreign_players??'—';
  if($('tiNational'))$('tiNational').textContent=sq.national_team_players??'—';
  if($('tiTitles'))$('tiTitles').textContent=h.total_titles!=null?String(h.total_titles):'—';
  renderHonours(h);
}
async function openNextFixtureAnalysis(f){
  const eventId=Number(f?.sofascore_event_id||f?.fixture_id)||0,competitionId=Number(f?.sofascore_competition_id)||0;if(!eventId)return;
  try{sessionStorage.setItem('inca_match_return','betlab')}catch{}
  window.INCA_PORTAL_NAV?.show?.('fixtures');await window.INCA_MATCH_CENTER?.openFixture?.({eventId,competitionId});
}
async function renderLiveNext(){
  const box=$('tiNextMatch');if(!box)return;
  if(!state.team){box.innerHTML='<div class="ti-empty">Esperando equipo.</div>';return}
  await loadFootballCache().catch(()=>{});const f=fixtureForSofa(state.team.team_id);
  if(!f){box.innerHTML='<div class="ti-live-offline"><i class="fa-solid fa-calendar-day"></i><strong>Sin próximo partido sincronizado</strong><span>La agenda se actualiza de forma central. Los usuarios no consumen créditos al abrir Team Intel.</span></div>';return}
  const sid=Number(state.team.team_id),ownRow=currentRowForSofa(sid),apiOwnId=Number(ownRow?.api_team_id)||0;
  const selectedIsHome=Number(f.home_sofascore_team_id)===sid||(apiOwnId&&apiOwnId===Number(f.home_api_team_id));
  const when=formatPeruKickoff(f.kickoff_utc),status=String(f.status_type||'notstarted').toLowerCase();
  const statusLabel=status==='postponed'?'APLAZADO':status==='suspended'?'SUSPENDIDO':status==='inprogress'?'EN JUEGO':'PROGRAMADO';
  const referee=String(f.referee||'').trim(),round=f.round?`Jornada ${f.round}`:'Jornada por confirmar',eventId=Number(f.sofascore_event_id||f.fixture_id)||0;
  const homeName=f.home_team_name||'Local',awayName=f.away_team_name||'Visitante';
  const homeLogo=f.home_logo||window.INCA_TITAN?.logoUrl?.(homeName,Number(f.home_sofascore_team_id))||'';
  const awayLogo=f.away_logo||window.INCA_TITAN?.logoUrl?.(awayName,Number(f.away_sofascore_team_id))||'';
  box.innerHTML=`<button class="ti-next-match-button" type="button" data-ti-open-fixture="${eventId}" aria-label="Abrir análisis de ${esc(homeName)} vs ${esc(awayName)}"><div class="ti-next-topline"><span class="ti-next-league"><i class="fa-solid fa-trophy"></i>${esc(f.league_name||'Competición')}</span><span class="ti-next-status ${esc(status)}">${esc(statusLabel)}</span></div><div class="ti-next-main ti-next-main-pro"><div class="ti-next-team home ${selectedIsHome?'selected':''}"><span class="ti-next-side-label">LOCAL</span>${teamLogoSlot(homeLogo,'ti-next-logo')}<b>${esc(homeName)}</b>${selectedIsHome?'<em>TU EQUIPO</em>':''}</div><div class="ti-next-vs ti-next-vs-pro"><strong>VS</strong><span>${esc(when.date)}</span><b>${esc(when.time)}</b><small>${esc(round)}</small></div><div class="ti-next-team away ${!selectedIsHome?'selected':''}"><span class="ti-next-side-label">VISITANTE</span>${teamLogoSlot(awayLogo,'ti-next-logo')}<b>${esc(awayName)}</b>${!selectedIsHome?'<em>TU EQUIPO</em>':''}</div></div><div class="ti-next-info-strip"><span><i class="fa-solid fa-location-dot"></i><b>SEDE</b><small>${esc(f.venue||'Por confirmar')}</small></span><span class="ti-next-referee"><i class="fa-solid fa-user-tie"></i><b>ÁRBITRO</b><small>${esc(referee||'Por definir')}</small></span><span><i class="fa-solid fa-calendar-check"></i><b>AGENDA</b><small>actualización central</small></span></div><div class="ti-next-open"><span>ABRIR ANÁLISIS DEL PARTIDO</span><i class="fa-solid fa-arrow-right"></i></div></button>`;
  box.querySelector('[data-ti-open-fixture]')?.addEventListener('click',()=>openNextFixtureAnalysis(f));
}
function recentMatchNarrative(matches){
  if(!matches.length)return ['No hay partidos recientes disponibles con este filtro.'];
  const w=matches.filter(m=>resultOf(m)==='W').length,d=matches.filter(m=>resultOf(m)==='D').length,l=matches.filter(m=>resultOf(m)==='L').length;
  const gf=matches.reduce((a,m)=>a+(Number.isFinite(Number(m.ownGoals))?Number(m.ownGoals):0),0),ga=matches.reduce((a,m)=>a+(Number.isFinite(Number(m.oppGoals))?Number(m.oppGoals):0),0);
  const lines=[`${state.team.name} registra ${w} victorias, ${d} empates y ${l} derrotas en los ${matches.length} partidos disponibles de la muestra seleccionada. Marcó ${gf} goles y recibió ${ga}.`];
  const last5=matches.slice(0,5);
  if(last5.length)lines.push(`Sus partidos más recientes: ${last5.map(m=>{const score=(m.ownGoals!==null&&m.oppGoals!==null)?`${fmt(m.ownGoals,0)}-${fmt(m.oppGoals,0)}`:'sin marcador';const r=resultOf(m),word=r==='W'?'ganó':r==='L'?'perdió':r==='D'?'empató':'jugó';return `${word} ${score} vs ${m.opponent} (${m.tournament}, ${m.date})`}).join('; ')}.`);
  return lines;
}
function renderDashboard(){
  if(!state.history||!state.team)return;
  const matches=baseMatches(),stats=metricSets(matches);
  if($('tiMetricRows'))$('tiMetricRows').innerHTML=stats.map(s=>{
    const delta=(s.l10!=null&&s.sample!=null)?s.l10-s.sample:null,trend=delta==null?'—':Math.abs(delta)<0.05?'≈':delta>0?`↑ ${fmt(Math.abs(delta))}`:`↓ ${fmt(Math.abs(delta))}`;
    const cls=delta==null||Math.abs(delta)<0.05?'flat':delta>0?'up':'down';
    return `<div class="ti-metric-row"><b>${esc(s.label)}</b><span>${fmt(s.l5)}</span><span>${fmt(s.l10)}</span><strong>${fmt(s.sample)}</strong><em class="ti-trend ${cls}">${trend}</em></div>`;
  }).join('');
  if($('tiForm'))$('tiForm').innerHTML=matches.map(m=>{
    const res=resultOf(m),score=(m.ownGoals!==null&&m.oppGoals!==null)?`${fmt(m.ownGoals,0)}-${fmt(m.oppGoals,0)}`:'—';
    const cat=window.INCA_TITAN?.getCatalog?.()?.teams?.find(t=>Number(t.team_id)===Number(m.opponentId));const logo=cat?window.INCA_TITAN?.logoUrl?.(cat.name,cat.team_id):'';
    return `<div class="ti-form-match ${res}">${teamLogoSlot(logo,'ti-form-logo')}<div><b>${esc(m.opponent)}</b><small>${esc(m.tournament)} · ${esc(m.condition||'')} · ${esc(m.date)}</small></div><strong>${score}</strong><i>${res||'—'}</i></div>`;
  }).join('')||'<div class="ti-empty">Sin partidos en este filtro.</div>';
  const latest=matches[0];
  if($('tiLastMatch'))$('tiLastMatch').innerHTML=latest?`<b>${esc(latest.opponent)}</b><span>${esc(latest.tournament)} · ${esc(latest.condition||'')} · ${esc(latest.date)}</span><strong>${latest.ownGoals!=null&&latest.oppGoals!=null?`${fmt(latest.ownGoals,0)} - ${fmt(latest.oppGoals,0)}`:'—'}</strong>`:'<span>Sin último partido en la muestra.</span>';
  if($('tiNarrative'))$('tiNarrative').innerHTML=recentMatchNarrative(matches).map(x=>`<p>${esc(x)}</p>`).join('')||'<p>Sin partidos recientes.</p>';
  if($('tiMatchCount'))$('tiMatchCount').textContent=`${matches.length} partidos · ${filterLabel()}`;
  if($('tiFormSubtitle'))$('tiFormSubtitle').textContent=`${filterLabel()}`;
  if($('tiTeamSub'))$('tiTeamSub').textContent=`${state.team.country||''}${state.team.country?' · ':''}${filterLabel()}`;
}
async function teamChanged(id){
  id=Number(id);if(!id){resetDashboard();return}
  if($('tiDataStatus'))$('tiDataStatus').textContent='Cargando historial TITAN del equipo…';
  try{
    const [history]=await Promise.all([window.INCA_TITAN.loadTeamHistory(id),loadStaticJson().catch(()=>null)]);
    state.history=history;state.team=history.team;state.tournament='ALL';state.condition='ALL';updateFilterButtons();
    await window.INCA_TITAN?.ensureLogoIndex?.().catch(()=>{});
    setMainTeamLogo(window.INCA_TITAN?.logoUrl?.(state.team.name,state.team.team_id)||'');
    if($('tiTeamName'))$('tiTeamName').textContent=state.team.name;
    renderTournamentOptions();renderProfile();renderDashboard();await renderLiveNext();
    if($('tiDataStatus'))$('tiDataStatus').textContent=`Información de ${state.team.name} lista`;
  }catch(e){
    console.error('[INCA TEAM INTEL V22.1] No se pudo cargar el equipo',id,e);
    if($('tiDataStatus'))$('tiDataStatus').textContent=`Datos del equipo temporalmente no disponibles · ${e?.message||e}`;
  }
}
function resetDashboard(){
  state.history=null;state.team=null;state.tournament='ALL';state.condition='ALL';updateFilterButtons();
  if($('tiTeamName'))$('tiTeamName').textContent='Selecciona un equipo';if($('tiTeamSub'))$('tiTeamSub').textContent='31 ligas disponibles';setMainTeamLogo('');
  for(const id of ['tiCoach','tiVenue','tiCountry','tiPlayers','tiAge','tiForeign','tiNational','tiTitles'])if($(id))$(id).textContent='—';
  if($('tiVenueMeta'))$('tiVenueMeta').textContent='';if($('tiHonoursText'))$('tiHonoursText').innerHTML='<div class="ti-honours-empty">Palmarés no disponible.</div>';
  if($('tiMetricRows'))$('tiMetricRows').innerHTML='<div class="ti-empty">Selecciona un equipo para cargar sus promedios.</div>';
  if($('tiForm'))$('tiForm').innerHTML='';if($('tiLastMatch'))$('tiLastMatch').innerHTML='<span>Esperando equipo.</span>';if($('tiNarrative'))$('tiNarrative').innerHTML='<p>El resumen se genera únicamente con tus datos TITAN.</p>';
  if($('tiNextMatch'))$('tiNextMatch').innerHTML='<div class="ti-empty">Esperando equipo.</div>';if($('tiMatchCount'))$('tiMatchCount').textContent='';
  if($('tiQuickTournament')){$('tiQuickTournament').innerHTML='<option value="ALL">Todos los torneos</option>';$('tiQuickTournament').disabled=true}
}

async function init(){
  if(state.initialized)return;
  if(!$('tiQuickSearch'))return;
  state.initialized=true;
  try{
    await window.INCA_TITAN?.ensureReady?.();
    await window.INCA_TITAN?.ensureTeamDetails?.().catch(e=>console.warn('[INCA TEAM INTEL V22.1] team_details remoto no disponible',e));
    await loadFootballCache().catch(()=>{});

    const catalog=(window.INCA_TITAN?.getCatalog?.()?.teams||[]).filter(t=>Number(t.team_id)&&String(t.name||'').trim());
    const localById=new Map(state.localTeamMap.map(t=>[Number(t.team_id),t]));
    state.titanCatalog=catalog.map(t=>{
      const local=localById.get(Number(t.team_id))||{};
      return {...t,team_id:Number(t.team_id),name:String(t.name||'').trim(),competition_ids:t.competition_ids||local.competition_ids||[],seasons:t.seasons||local.seasons||[]};
    });
    for(const t of state.localTeamMap){if(!state.titanCatalog.some(x=>Number(x.team_id)===Number(t.team_id)))state.titanCatalog.push({...t,team_id:Number(t.team_id)})}
    state.allTeams=state.titanCatalog;

    let quickTimer=null;const quickInput=$('tiQuickSearch');
    quickInput.addEventListener('input',()=>{clearTimeout(quickTimer);quickTimer=setTimeout(()=>renderQuickResults(quickInput.value),55)});
    quickInput.addEventListener('keydown',e=>{
      if(e.key==='Escape')$('tiQuickResults').hidden=true;
      if(e.key==='Enter'){const first=$('tiQuickResults').querySelector('[data-ti-team]');if(first){e.preventDefault();first.click()}}
    });
    $('tiSampleSize')?.addEventListener('change',e=>{state.sampleSize=Number(e.target.value)||10;renderDashboard()});
    $('tiQuickTournament')?.addEventListener('change',async e=>{state.tournament=e.target.value||'ALL';renderDashboard();await renderLiveNext()});
    document.querySelectorAll('#tiCondition [data-ti-condition]').forEach(btn=>btn.addEventListener('click',()=>{state.condition=btn.dataset.tiCondition||'ALL';updateFilterButtons();renderDashboard()}));

    try{
      await loadStaticJson();
      if($('tiIntelGlobalStatus'))$('tiIntelGlobalStatus').innerHTML=`<i class="fa-solid fa-circle-check"></i> ${state.profileById.size} perfiles Team Intel · ${state.allTeams.length} equipos TITAN`;
      const badge=document.querySelector('.ti-title-badge');if(badge)badge.innerHTML=`<i class="fa-solid fa-shield-halved"></i> 31 LIGAS · ${state.allTeams.length} EQUIPOS TITAN`;
    }catch(e){
      console.warn('[INCA TEAM INTEL V22.1] perfiles adicionales no disponibles',e);
      if($('tiIntelGlobalStatus'))$('tiIntelGlobalStatus').innerHTML='<i class="fa-solid fa-clock-rotate-left"></i> Historial TITAN listo · perfil adicional pendiente';
    }
    resetDashboard();
    if($('tiDataStatus'))$('tiDataStatus').textContent='Busca un equipo para comenzar.';
    console.info('[INCA TEAM INTEL V22.1] listo',{teams:state.allTeams.length,profiles:state.profileById.size});
  }catch(e){
    state.initialized=false;console.error('[INCA TEAM INTEL V22.1] Error de inicialización',e);
    if($('tiDataStatus'))$('tiDataStatus').textContent=`Team Intel no pudo iniciar · ${e?.message||e}`;
  }
}
async function activate(){await init()}
async function openTeam(teamId,compId=null){
  await init();window.INCA_PORTAL_NAV?.show?.('betlab');
  state.requestedCompetition=compId?Number(compId):null;
  const team=state.allTeams.find(t=>Number(t.team_id)===Number(teamId));if($('tiQuickSearch'))$('tiQuickSearch').value=team?.name||'';
  await teamChanged(Number(teamId));
}
document.addEventListener('inca:open-team-intel',e=>{const d=e.detail||{};if(d.teamId)openTeam(Number(d.teamId),d.compId?Number(d.compId):null)});
window.INCA_TEAM_INTEL=Object.freeze({activate,openTeam});
})();
