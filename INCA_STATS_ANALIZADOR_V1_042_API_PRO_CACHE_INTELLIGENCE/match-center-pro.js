(() => {
'use strict';

const $ = id => document.getElementById(id);
const TITAN = () => window.INCA_TITAN;
const CORE = () => window.INCA_BET_CORE;
const CFG = () => window.INCA_ARCH || {};
const FIXTURES = () => window.INCA_FIXTURES;
const FALLBACK_NO_ODDS_IDS=new Set([325,390,155,406,242]);
const matchHasOddsCoverage=()=>window.INCA_ODDS_POLICY?.hasPriceCoverage?window.INCA_ODDS_POLICY.hasPriceCoverage(state.competition?.titanId||0):!FALLBACK_NO_ODDS_IDS.has(Number(state.competition?.titanId||0));

const state = {
  ready:false,
  initPromise:null,
  competitions:[],
  competition:null,
  fixtures:[],
  fixture:null,
  titanHome:null,
  titanAway:null,
  historyHome:null,
  historyAway:null,
  activeTab:'recent',
  liveCache:new Map(),
  playersLoaded:false,
  matchPlayerMetric:'goals',
  matchPlayerScope:'all',
  recentView:'matches',
  recentMode:'all'
};

const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
}[c]));
const refereeFace=(ref,cls='fx-referee-avatar')=>{const item=typeof ref==='object'?ref:window.INCA_REFEREES?.findByName?.(ref);const u=window.INCA_REFEREES?.faceUrl?.(item||ref)||'';const name=item?.name||String(ref||'Árbitro');return `<div class="${cls}">${u?`<img src="${esc(u)}" alt="${esc(name)}" loading="lazy" decoding="async" onerror="this.remove()">`:''}<i class="fa-solid fa-user-tie"></i></div>`;};

const norm=(v='')=>String(v)
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase()
  .replace(/&/g,' and ')
  .replace(/\b(fc|cf|sc|ac|afc|cd|sd|ca|fk|sk|club|deportivo|futbol club|football club)\b/g,' ')
  .replace(/[^a-z0-9]+/g,' ')
  .replace(/\s+/g,' ')
  .trim();

const num=v=>{
  if(v===null||v===undefined||String(v).trim()==='')return null;
  const n=Number(String(v).replace('%','').replace(',','.'));
  return Number.isFinite(n)?n:null;
};

const smart=v=>{
  const n=Number(v);
  if(!Number.isFinite(n))return '—';
  return Math.abs(n-Math.round(n))<1e-9 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/,'');
};

const pct=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(0)}%`:'—';

const parseDate=v=>{
  const s=String(v||'').trim();
  if(!s)return 0;
  if(/^\d{4}-\d{2}-\d{2}/.test(s))return new Date(s).getTime()||0;
  const m=/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(s);
  if(m)return new Date(Number(m[3]),Number(m[2])-1,Number(m[1])).getTime()||0;
  return new Date(s).getTime()||0;
};

function formatKickoff(value){
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))return 'Horario por confirmar';
  return new Intl.DateTimeFormat('es-PE',{
    weekday:'short',day:'2-digit',month:'2-digit',
    hour:'2-digit',minute:'2-digit'
  }).format(d);
}

function hoursUntil(value){
  const ms=new Date(value).getTime()-Date.now();
  return Number.isFinite(ms)?ms/3600000:null;
}

function cleanCountry(value=''){
  return String(value||'').replace('EE. UU. / CANADÁ','USA / Canada');
}

const LIVE_CUPS = Object.freeze([
  {key:'cup:ucl',region:'INTERNACIONAL',country:'',name:'UEFA Champions League',search:'UEFA Champions League'},
  {key:'cup:uel',region:'INTERNACIONAL',country:'',name:'UEFA Europa League',search:'UEFA Europa League'},
  {key:'cup:uecl',region:'INTERNACIONAL',country:'',name:'UEFA Conference League',search:'UEFA Conference League'},
  {key:'cup:libertadores',region:'INTERNACIONAL',country:'',name:'Copa Libertadores',search:'CONMEBOL Libertadores'},
  {key:'cup:sudamericana',region:'INTERNACIONAL',country:'',name:'Copa Sudamericana',search:'CONMEBOL Sudamericana'}
]);

const BET_MARKETS = Object.freeze({
  result:{label:'Resultado del partido',kind:'result'},
  btts:{label:'Ambos equipos marcan',kind:'btts'},
  goals_total:{label:'Goles · Total partido',market:'goals',mode:'total'},
  goals_team:{label:'Goles · Equipo',market:'goals',mode:'team'},
  goals_rival:{label:'Goles · Rival',market:'goals',mode:'rival'},
  corners_total:{label:'Córners · Total partido',market:'corners',mode:'total'},
  corners_team:{label:'Córners · Equipo',market:'corners',mode:'team'},
  corners_rival:{label:'Córners · Rival',market:'corners',mode:'rival'},
  booking_total:{label:'Puntos de tarjetas · Total',market:'booking',mode:'total'},
  booking_team:{label:'Puntos de tarjetas · Equipo',market:'booking',mode:'team'},
  booking_rival:{label:'Puntos de tarjetas · Rival',market:'booking',mode:'rival'},
  cards_total:{label:'Tarjetas · Total partido',market:'cards',mode:'total'},
  cards_team:{label:'Tarjetas · Equipo',market:'cards',mode:'team'},
  cards_rival:{label:'Tarjetas · Rival',market:'cards',mode:'rival'},
  shots_total:{label:'Tiros · Total partido',market:'shots',mode:'total'},
  shots_team:{label:'Tiros · Equipo',market:'shots',mode:'team'},
  shots_rival:{label:'Tiros · Rival',market:'shots',mode:'rival'},
  sot_total:{label:'Tiros al arco · Total',market:'sot',mode:'total'},
  sot_team:{label:'Tiros al arco · Equipo',market:'sot',mode:'team'},
  sot_rival:{label:'Tiros al arco · Rival',market:'sot',mode:'rival'},
  fouls_total:{label:'Faltas · Total partido',market:'fouls',mode:'total'},
  fouls_team:{label:'Faltas · Equipo',market:'fouls',mode:'team'},
  fouls_rival:{label:'Faltas · Rival',market:'fouls',mode:'rival'},
  offsides_total:{label:'Fueras de juego · Total',market:'offsides',mode:'total'},
  offsides_team:{label:'Fueras de juego · Equipo',market:'offsides',mode:'team'},
  offsides_rival:{label:'Fueras de juego · Rival',market:'offsides',mode:'rival'},
  goalkicks_total:{label:'Saques de meta · Total',market:'goalkicks',mode:'total'},
  goalkicks_team:{label:'Saques de meta · Equipo',market:'goalkicks',mode:'team'},
  goalkicks_rival:{label:'Saques de meta · Rival',market:'goalkicks',mode:'rival'},
  throwins_total:{label:'Saques de banda · Total',market:'throwins',mode:'total'},
  throwins_team:{label:'Saques de banda · Equipo',market:'throwins',mode:'team'},
  throwins_rival:{label:'Saques de banda · Rival',market:'throwins',mode:'rival'},
  tackles_total:{label:'Tackles · Total',market:'tackles',mode:'total'},
  tackles_team:{label:'Tackles · Equipo',market:'tackles',mode:'team'},
  tackles_rival:{label:'Tackles · Rival',market:'tackles',mode:'rival'}
});

const RAW_METRICS = Object.freeze([
  ['Goals','Goles'],
  ['Ball possession','Posesión'],
  ['Expected goals','xG'],
  ['Big chances','Grandes ocasiones'],
  ['Total shots','Tiros totales'],
  ['Goalkeeper saves','Atajadas del portero'],
  ['Corner kicks','Córners'],
  ['Fouls','Faltas'],
  ['Passes','Pases'],
  ['Tackles','Tackles'],
  ['Free kicks','Tiros libres'],
  ['Yellow cards','Tarjetas amarillas'],
  ['Red cards','Tarjetas rojas'],
  ['Shots on target','Tiros al arco'],
  ['Hit woodwork','Tiros al palo'],
  ['Shots off target','Tiros fuera'],
  ['Blocked shots','Tiros bloqueados'],
  ['Shots inside box','Tiros dentro del área'],
  ['Shots outside box','Tiros fuera del área'],
  ['Big chances scored','Grandes ocasiones convertidas'],
  ['Big chances missed','Grandes ocasiones falladas'],
  ['Through balls','Pases filtrados'],
  ['Touches in penalty area','Toques en el área'],
  ['Fouled in final third','Faltas recibidas en último tercio'],
  ['Offsides','Fueras de juego'],
  ['Accurate passes','Pases precisos'],
  ['Throw-ins','Saques de banda'],
  ['Final third entries','Entradas al último tercio'],
  ['Final third phase','Fase en último tercio'],
  ['Long balls','Balones largos'],
  ['Crosses','Centros'],
  ['Duels','Duelos'],
  ['Dispossessed','Pérdidas por desposesión'],
  ['Ground duels','Duelos al suelo'],
  ['Aerial duels','Duelos aéreos'],
  ['Dribbles','Regates'],
  ['Tackles won','Tackles ganados'],
  ['Total tackles','Tackles totales'],
  ['Interceptions','Intercepciones'],
  ['Recoveries','Recuperaciones'],
  ['Clearances','Despejes'],
  ['Errors lead to a shot','Errores que terminan en tiro'],
  ['Total saves','Atajadas totales'],
  ['Goals prevented','Goles evitados'],
  ['Big saves','Grandes atajadas'],
  ['High claims','Balones aéreos tomados'],
  ['Punches','Despejes de puños'],
  ['Goal kicks','Saques de meta']
]);

function rawOptionKey(metric,mode){ return `raw:${mode}:${metric}`; }

function statOptionsHTML(){
  const basic=Object.entries(BET_MARKETS).map(([key,m])=>`<option value="${esc(key)}">${esc(m.label)}</option>`).join('');
  const raw=RAW_METRICS.flatMap(([metric,label])=>[
    `<option value="${esc(rawOptionKey(metric,'team'))}">${esc(label)} · Equipo</option>`,
    `<option value="${esc(rawOptionKey(metric,'rival'))}">${esc(label)} · Rival</option>`
  ]).join('');
  return `<optgroup label="MERCADOS DE APUESTA">${basic}</optgroup><optgroup label="48 MÉTRICAS TITAN">${raw}</optgroup>`;
}

function parsedStat(value){
  const v=String(value||'result');
  if(v.startsWith('raw:')){
    const [,mode,...metricParts]=v.split(':');
    return {kind:'raw',mode,metric:metricParts.join(':')};
  }
  return BET_MARKETS[v] || BET_MARKETS.result;
}

function logoForTitan(team){
  if(!team)return '';
  return TITAN()?.logoUrl?.(team.name,team.team_id)||'';
}

function teamVisual({name,logo,titan}){
  const src=logo || logoForTitan(titan);
  return `<span class="fx-team-logo">
    <i class="fa-solid fa-shield-halved"></i>
    ${src?`<img src="${esc(src)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`:''}
  </span><span class="fx-team-name">${esc(name||titan?.name||'Equipo')}</span>`;
}

function compLogo(comp){
  if(comp?.titanId)return TITAN()?.competitionLogoUrl?.(comp.titanId)||'';
  return '';
}

function setMessage(text){
  const el=$('fxStatus');
  if(el)el.textContent=text;
}

function makeCompetitions(){
  const curated=(TITAN()?.CURATED_COMPETITIONS||[]).map(c=>({
    key:`titan:${c.id}`,titanId:Number(c.id),region:c.region,country:c.country,
    name:c.name,search:c.name
  }));
  return curated;
}

function renderLeagueSelector(){
  const sel=$('fxLeague');
  if(!sel)return;
  const groups=new Map();
  for(const c of state.competitions){
    const g=c.region||'OTRAS';
    if(!groups.has(g))groups.set(g,[]);
    groups.get(g).push(c);
  }
  sel.innerHTML=[...groups.entries()].map(([group,list])=>
    `<optgroup label="${esc(group)}">${list.map(c=>
      `<option value="${esc(c.key)}">${esc(c.country?`${c.country} · ${c.name}`:c.name)}</option>`
    ).join('')}</optgroup>`
  ).join('');
}

function currentCompetition(){
  return state.competitions.find(c=>c.key===$('fxLeague')?.value)||state.competitions[0]||null;
}

function localApiUrl(action,extra={}){
  const endpoint=CFG().matchApiEndpoint||'./api/match-center';
  const url=new URL(endpoint,location.href);
  url.searchParams.set('action',action);
  for(const [k,v] of Object.entries(extra)){
    if(v!==null&&v!==undefined&&String(v)!=='')url.searchParams.set(k,String(v));
  }
  return url;
}

async function apiJSON(action,extra={},ttl=0){
  const staticDev=/^(localhost|127\.0\.0\.1)$/i.test(location.hostname) && !/^300\d$/.test(location.port||'');
  if(staticDev) throw new Error('LOCAL_STATIC_API_DISABLED');
  const key=`${action}|${JSON.stringify(extra)}`;
  const cached=state.liveCache.get(key);
  if(cached&&(!ttl||Date.now()-cached.time<ttl))return cached.data;
  const res=await fetch(localApiUrl(action,extra),{cache:'no-store'});
  if(!res.ok)throw new Error('LIVE_UNAVAILABLE');
  const data=await res.json();
  state.liveCache.set(key,{time:Date.now(),data});
  return data;
}

async function loadFixtures(options={}){
  const focusEventId=Number(options?.focusEventId)||0;
  state.competition=currentCompetition();
  state.fixture=null;
  state.fixtures=[];
  clearMatch();
  const target=$('fxFixtureList');
  if(target)target.innerHTML='<div class="fx-loading"><span></span> Preparando agenda de partidos…</div>';
  setMessage('Preparando agenda…');

  try{
    const client=FIXTURES();
    if(!client?.ensureReady)throw new Error('FIXTURE_CLIENT_MISSING');
    await client.ensureReady();
    // V22.4: al abrir un partido desde Centro de Ligas, el Event_ID manda.
    // No se debe perder el click porque el kickoff ya pasó hace 2, 4 o más horas.
    // El listado normal muestra una ventana útil de 14 días, pero un focusEventId
    // se busca en TODO TITAN Fixtures (incluidos finalizados) y se abre directamente.
    const now=Date.now()-6*3600000,end=Date.now()+14*86400000;
    let raw=client.forCompetition(state.competition.titanId,{from:now,to:end});
    if(focusEventId){
      let exact=client.findEvent?.(focusEventId)||null;
      if(!exact){
        exact=client.forCompetition(state.competition.titanId,{from:-Infinity,to:Infinity,includeEnded:true}).find(x=>Number(x.event_id)===focusEventId)||null;
      }
      if(exact){
        // Si el payload vino con una competición desfasada, corregimos desde el propio fixture.
        if(Number(exact.competition_id)&&Number(exact.competition_id)!==Number(state.competition.titanId)){
          const corrected=state.competitions.find(c=>Number(c.titanId)===Number(exact.competition_id));
          if(corrected){
            state.competition=corrected;
            const sel=$('fxLeague'); if(sel)sel.value=corrected.key;
          }
        }
        raw=[exact];
      }
    }
    state.fixtures=raw.map(client.toMatchCenter);
    const meta=client.competitionMeta(state.competition.titanId)||{};
    state.competition={...state.competition,seasonId:meta.season_id||null,season:meta.season_name||null,apiName:meta.competition_name||state.competition.name,fixtureSource:'TITAN FIXTURES'};

    if(!state.fixtures.length){
      target.innerHTML=empty('fa-calendar-day','No hay partidos en los próximos 14 días','La liga no tiene encuentros disponibles en la ventana actual.');
      setMessage('Agenda lista · sin partidos en los próximos 14 días.');
      return;
    }
    renderFixtures();
    setMessage(focusEventId?'Partido listo para analizar':`${state.fixtures.length} partido${state.fixtures.length===1?'':'s'} disponible${state.fixtures.length===1?'':'s'}`);
    if(focusEventId&&state.fixtures.some(x=>Number(x.id)===focusEventId))await selectFixture(String(focusEventId));
  }catch(err){
    console.warn('[INCA FIXTURES] fallback LIVE',err);
    try{
      const data=await apiJSON('fixtures',{liveKey:state.competition.key,leagueName:state.competition.search||state.competition.name,country:cleanCountry(state.competition.country||''),windowHours:336},10*60*1000);
      state.fixtures=Array.isArray(data?.fixtures)?data.fixtures:[];
      if(!state.fixtures.length)throw new Error('NO_FALLBACK_FIXTURES');
      state.competition={...state.competition,apiLeagueId:data.league?.id||null,season:data.league?.season||null,apiName:data.league?.name||state.competition.name,fixtureSource:'API fallback'};
      renderFixtures();setMessage(`${state.fixtures.length} partidos · fallback LIVE · 14 días`);
    }catch(_){
      target.innerHTML=empty('fa-calendar-xmark','Agenda no disponible','No se pudo cargar el calendario de partidos en este momento.');
      setMessage('No se pudo leer la agenda central.');
    }
  }
}

function empty(icon,title,text){
  return `<div class="fx-empty"><i class="fa-solid ${icon}"></i><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}

function renderFixtures(){
  const target=$('fxFixtureList');
  if(!target)return;
  target.innerHTML=state.fixtures.map((f,i)=>{
    const h=hoursUntil(f.start_time);
    const soon=h!==null&&h<=24;
    const st=String(f.status_type||'').toLowerCase();
    const statusLabel=st==='inprogress'?'EN JUEGO':st==='postponed'?'APLAZADO':st==='suspended'?'SUSPENDIDO':soon?'HOY / PRONTO':'≤ 48 H';
    return `<button type="button" class="fx-fixture-card ${state.fixture?.id===f.id?'active':''}" data-fixture="${esc(f.id)}">
      <div class="fx-fixture-date"><span>${esc(formatKickoff(f.start_time))}</span><b>${esc(statusLabel)}</b></div>
      <div class="fx-fixture-teams">
        <div>${teamVisual({name:f.home?.name,logo:f.home?.logo})}</div>
        <span class="fx-vs">VS</span>
        <div>${teamVisual({name:f.away?.name,logo:f.away?.logo})}</div>
      </div>
      <div class="fx-fixture-foot">
        <span>${esc(f.venue?.name||state.competition?.apiName||state.competition?.name||'Partido')}</span>
        <i class="fa-solid fa-chevron-right"></i>
      </div>
    </button>`;
  }).join('');

  target.querySelectorAll('[data-fixture]').forEach(btn=>{
    btn.onclick=()=>selectFixture(btn.dataset.fixture);
  });
}

function setAnalysisHeader(open=false){
  const root=$('portalFixtures');
  if(root)root.classList.toggle('fx-analysis-open',!!open);
  const eyebrow=$('fxPageEyebrow'),title=$('fxPageTitle'),sub=$('fxPageSubtitle');
  if(open&&state.fixture){
    if(eyebrow)eyebrow.textContent=`${state.competition?.apiName||state.competition?.name||'LIGA'} · ANÁLISIS TITAN`;
    if(title)title.textContent=`${state.fixture.home?.name||'Local'} vs ${state.fixture.away?.name||'Visitante'}`;
    if(sub)sub.textContent=`${formatKickoff(state.fixture.start_time)} · Forma, comparador, H2H, rachas, jugadores y contexto en una sola ficha.`;
  }else{
    if(eyebrow)eyebrow.textContent='MATCH CENTER · PARTIDOS Y ANÁLISIS';
    if(title)title.textContent='Partidos listos para analizar';
    if(sub)sub.textContent='Elige una de las 31 ligas y abre cualquier encuentro para entrar a su análisis completo.';
  }
}

function clearMatch(){
  setAnalysisHeader(false);
  state.titanHome=state.titanAway=null;
  state.historyHome=state.historyAway=null;
  state.playersLoaded=false;
  const detail=$('fxMatchDetail');
  if(detail){
    detail.hidden=true;
    detail.innerHTML='';
  }
}

function candidateTeams(comp){
  const catalog=(TITAN()?.getCatalog?.()?.teams||[]);
  if(!comp?.titanId)return catalog;
  const inLeague=new Set();
  for(const t of catalog){
    if((TITAN()?.teamContexts?.(Number(t.team_id),null)||[]).some(c=>Number(c.competition_id)===Number(comp.titanId))){
      inLeague.add(Number(t.team_id));
    }
  }
  return catalog.filter(t=>inLeague.has(Number(t.team_id))).concat(catalog.filter(t=>!inLeague.has(Number(t.team_id))));
}

function matchTitanTeam(apiName){
  const q=norm(apiName);
  if(!q)return null;
  let best=null,bestScore=-1;
  for(const t of candidateTeams(state.competition)){
    const n=norm(t.name);
    if(!n)continue;
    let score=0;
    if(n===q)score=100;
    else if(n.includes(q)||q.includes(n))score=88;
    else{
      const a=new Set(q.split(' ').filter(Boolean));
      const b=new Set(n.split(' ').filter(Boolean));
      const inter=[...a].filter(x=>b.has(x)).length;
      const union=new Set([...a,...b]).size||1;
      score=(inter/union)*80;
      const longest=[...a].sort((x,y)=>y.length-x.length)[0];
      if(longest&&b.has(longest))score+=10;
    }
    if(score>bestScore){best=t;bestScore=score;}
  }
  return bestScore>=52?best:null;
}

async function selectFixture(id){
  const fixture=state.fixtures.find(f=>String(f.id)===String(id));
  if(!fixture)return;
  state.fixture=fixture;
  renderFixtures();
  setAnalysisHeader(true);

  state.titanHome=matchTitanTeam(fixture.home?.name);
  state.titanAway=matchTitanTeam(fixture.away?.name);
  state.historyHome=state.historyAway=null;
  state.playersLoaded=false;

  const target=$('fxMatchDetail');
  target.hidden=false;
  target.innerHTML='<div class="fx-loading fx-detail-loading"><span></span> Preparando análisis TITAN…</div>';
  target.scrollIntoView({behavior:'smooth',block:'start'});

  const jobs=[];
  if(state.titanHome)jobs.push(CORE().teamHistory(state.titanHome.team_id).then(h=>state.historyHome=h).catch(()=>{}));
  if(state.titanAway)jobs.push(CORE().teamHistory(state.titanAway.team_id).then(h=>state.historyAway=h).catch(()=>{}));
  await Promise.all(jobs);

  renderMatchShell();
  switchTab('recent');
}

function matchCoverage(){
  if(state.historyHome&&state.historyAway)return 'Cobertura TITAN completa';
  if(state.historyHome||state.historyAway)return 'Cobertura TITAN parcial';
  return 'Cobertura LIVE';
}

function renderMatchShell(){
  const f=state.fixture,target=$('fxMatchDetail');
  if(!f||!target)return;
  const status=String(f.status_type||'notstarted').toLowerCase();
  const statusLabel=status==='postponed'?'APLAZADO':status==='suspended'?'SUSPENDIDO':status==='inprogress'?'EN JUEGO':'PROGRAMADO';
  const logo=compLogo(state.competition);

  target.innerHTML=`
    <section class="fx-match-hero fx-match-hero-pro">
      <div class="fx-match-meta">${logo?`<img class="fx-match-comp-logo" src="${esc(logo)}" alt="">`:''}<span>${esc(state.competition?.apiName||state.competition?.name||'Competición')}</span><b>${esc(formatKickoff(f.start_time))}</b><small>${esc(f.venue?.name||'Sede por confirmar')}</small></div>
      <div class="fx-match-team home">${teamVisual({name:f.home?.name,logo:f.home?.logo,titan:state.titanHome})}<small>LOCAL</small></div>
      <div class="fx-match-center"><strong>VS</strong><span>${esc(matchCoverage())}</span><em>${esc(statusLabel)}</em></div>
      <div class="fx-match-team away">${teamVisual({name:f.away?.name,logo:f.away?.logo,titan:state.titanAway})}<small>VISITANTE</small></div>
      <button class="fx-match-referee-slot" type="button" id="fxMatchRefereeButton"><i class="fa-solid fa-user-tie"></i><span>ÁRBITRO</span><b>${esc(f.referee?.name||f.referee||'Por definir')}</b><small>${f.referee?'Abrir análisis arbitral':'Se completa cuando llegue la designación'}</small></button>
    </section>

    <nav class="fx-tabs fx-tabs-five" aria-label="Análisis del partido">
      <button data-fx-tab="recent" class="active"><i class="fa-solid fa-clock-rotate-left"></i><span>Forma & comparador</span></button>
      <button data-fx-tab="h2h"><i class="fa-solid fa-code-compare"></i><span>H2H</span></button>
      <button data-fx-tab="trends"><i class="fa-solid fa-fire-flame-curved"></i><span>Rachas</span></button>
      <button data-fx-tab="players"><i class="fa-solid fa-users"></i><span>Jugadores</span></button>
      <button data-fx-tab="match"><i class="fa-solid fa-clipboard-list"></i><span>Match Info</span></button>
    </nav>

    <section class="fx-tab-panel active" id="fxPanel-recent"></section><section class="fx-tab-panel" id="fxPanel-h2h"></section><section class="fx-tab-panel" id="fxPanel-trends"></section><section class="fx-tab-panel" id="fxPanel-players"></section><section class="fx-tab-panel" id="fxPanel-match"></section>`;

  target.querySelectorAll('[data-fx-tab]').forEach(btn=>btn.onclick=()=>switchTab(btn.dataset.fxTab));
  $('fxMatchRefereeButton')?.addEventListener('click',()=>{const name=f.referee?.name||f.referee;if(name)window.INCA_LEAGUE_CENTER?.openReferee?.(name);});
  const refereeName=f.referee?.name||f.referee;
  if(refereeName)window.INCA_REFEREES?.ensureReady?.().then(()=>{const item=window.INCA_REFEREES?.findByName?.(refereeName);const url=window.INCA_REFEREES?.faceUrl?.(item);const btn=$('fxMatchRefereeButton');if(url&&btn&&!btn.querySelector('img')){const img=document.createElement('img');img.className='fx-match-referee-face';img.src=url;img.alt=item?.name||String(refereeName);img.loading='lazy';img.decoding='async';img.onerror=()=>img.remove();btn.prepend(img);}}).catch(()=>{});
}

function switchTab(name){
  state.activeTab=name;
  document.querySelectorAll('[data-fx-tab]').forEach(b=>b.classList.toggle('active',b.dataset.fxTab===name));
  document.querySelectorAll('.fx-tab-panel').forEach(p=>p.classList.toggle('active',p.id===`fxPanel-${name}`));

  if(name==='recent')renderRecent();
  if(name==='h2h')renderH2H();
  if(name==='trends')renderTrends();
  if(name==='players')renderPlayers();
  if(name==='match')renderMatchInfo();
}

async function renderMatchInfo(){
  const panel=$('fxPanel-match'); if(!panel)return;
  const odds=matchHasOddsCoverage()?`<section class="fx-match-info-block"><header><span>CUOTAS</span><small>Solo precios reales disponibles</small></header><div id="fxMatchInfoOdds"></div></section>`:'';
  panel.innerHTML=`<div class="fx-match-info-stack">
    <section class="fx-match-info-block"><header><span>TABLA DE LA LIGA</span><small>Temporada actual · equipos del partido resaltados</small></header><div id="fxMatchInfoStandings"></div></section>
    <section class="fx-match-info-block fx-referee-info-block"><header><span>ÁRBITRO</span><small>Designación + Referee Stat Hub V9.3</small></header><div id="fxMatchInfoReferee"></div></section>
    <section class="fx-match-info-block"><header><span>ALINEACIONES</span><small>Se activa cerca del kickoff</small></header><div id="fxMatchInfoLineups"></div></section>${odds}</div>${!matchHasOddsCoverage()?'<div class="fx-no-odds-strip"><i class="fa-solid fa-ban"></i><b>Esta liga no tiene cobertura de cuotas.</b><span>Fixtures, rachas, jugadores y árbitro siguen disponibles.</span></div>':''}`;
  const jobs=[renderStandings($('fxMatchInfoStandings')),renderRefereeInfo($('fxMatchInfoReferee')),renderLineups($('fxMatchInfoLineups'))];
  if(matchHasOddsCoverage())jobs.push(renderOdds($('fxMatchInfoOdds'))); await Promise.all(jobs);
}

async function renderRefereeInfo(panel){
  if(!panel)return;
  const f=state.fixture||{}, name=String(f.referee?.name||f.referee||'').trim();
  let ref=null;
  if(name){try{await window.INCA_REFEREES?.ensureReady?.();ref=window.INCA_REFEREES?.findByName?.(name)||null;}catch{}}
  const summary=ref?`<div class="fx-referee-live-kpis"><span><small>PJ</small><b>${Number(ref.match_count||0)}</b></span><span><small>AMAR.</small><b>${Number(ref.avg_yellow_cards||0).toFixed(1)}</b></span><span><small>FALTAS</small><b>${Number(ref.avg_fouls_total||0).toFixed(1)}</b></span><span><small>1ª TARJ.</small><b>${Number.isFinite(Number(ref.avg_first_card_minute))?Math.round(Number(ref.avg_first_card_minute))+"'":'—'}</b></span></div>`:'';
  panel.innerHTML=`<section class="fx-referee-card ${name?'ready':'pending'}">${refereeFace(ref||name)}<div class="fx-referee-copy"><span>${name?(ref?'DESIGNADO · TITAN ENLAZADO':'DESIGNADO · SIN MATCH TITAN'):'PENDIENTE API'}</span><h3>${esc(name||'Árbitro por confirmar')}</h3><p>${name?(ref?`${esc(ref.country||'')} · histórico oficial 2024+ disponible`:'La designación existe, pero el nombre aún no coincide con el maestro arbitral.'):'Cuando llegue la designación, este bloque se conecta automáticamente al Referee Center.'}</p></div>${summary}<button type="button" ${name?'':'disabled'} data-match-ref-open>${name?'ABRIR ANÁLISIS':'ESPERANDO DESIGNACIÓN'} <i class="fa-solid fa-arrow-right"></i></button></section>`;
  panel.querySelector('[data-match-ref-open]')?.addEventListener('click',()=>{if(name)window.INCA_LEAGUE_CENTER?.openReferee?.(ref?.name||name);});
}

/* =========================
   TITAN MATCH HELPERS
   ========================= */

function buildPairIndex(history,period='ALL'){
  const grouped=new Map();
  for(const row of history?.allRows||[]){
    if(String(row.Tiempo||'').toUpperCase()!==String(period).toUpperCase())continue;
    const event=String(row.Event_ID||'');
    const team=Number(row.Team_ID);
    if(!event||!team)continue;
    if(!grouped.has(event))grouped.set(event,new Map());
    grouped.get(event).set(team,row);
  }
  return grouped;
}

function conditionOf(row){
  const c=String(row?.Condicion||'').toUpperCase();
  return c==='LOCAL'||c==='HOME'?'home':c==='VISITA'||c==='AWAY'||c==='VISITANTE'?'away':'';
}

function rawValue(row,metric){
  return num(row?.[metric]);
}

function bettingValue(history,eventId,teamId,stat,period='ALL'){
  const pair=buildPairIndex(history,period).get(String(eventId));
  if(!pair)return null;
  const own=pair.get(Number(teamId));
  const oppEntry=[...pair.entries()].find(([id])=>Number(id)!==Number(teamId));
  if(!own||!oppEntry)return null;
  const opp=oppEntry[1];

  if(stat.kind==='raw'){
    return stat.mode==='rival'?rawValue(opp,stat.metric):rawValue(own,stat.metric);
  }

  if(stat.kind==='result'){
    const gf=num(own['Goals']),ga=num(opp['Goals']);
    if(gf===null||ga===null)return null;
    return gf>ga?'WIN':gf<ga?'LOSS':'DRAW';
  }
  if(stat.kind==='btts'){
    const gf=num(own['Goals']),ga=num(opp['Goals']);
    if(gf===null||ga===null)return null;
    return gf>0&&ga>0?'YES':'NO';
  }

  const market=CORE()?.MARKET_CONFIG?.[stat.market];
  if(!market)return null;

  function mv(row){
    if(stat.market==='cards'){
      const y=num(row['Yellow cards']),r=num(row['Red cards']);
      return y===null&&r===null?null:(y||0)+(r||0);
    }
    if(stat.market==='booking'){
      const y=num(row['Yellow cards']),r=num(row['Red cards']);
      const syr=num(row['Second_Yellow_Reds']??row['second_yellow_red'])||0;
      if(y===null&&r===null)return null;
      return window.INCA_TITAN?.bookingPointsInca ? window.INCA_TITAN.bookingPointsInca(y||0,r||0,syr) : ((r||0)>0 ? (r||0)*20 + ((y||0)>0 ? 10 : 0) : (y||0)*10);
    }
    if(stat.market==='tackles'){
      const t=num(row['Total tackles']);
      return t!==null?t:num(row['Tackles']);
    }
    return num(row[market.metric]);
  }

  const a=mv(own),b=mv(opp);
  if(stat.mode==='team')return a;
  if(stat.mode==='rival')return b;
  return a===null||b===null?null:a+b;
}

function matchRowData(history,item){
  const pair=buildPairIndex(history,'ALL').get(String(item.eventId));
  if(!pair)return null;
  const ownId=Number(history.team.team_id);
  const own=pair.get(ownId);
  const opp=[...pair.entries()].find(([id])=>Number(id)!==ownId)?.[1];
  if(!own||!opp)return null;
  const gf=num(own['Goals']),ga=num(opp['Goals']);
  return {
    date:String(own.Fecha||item.date||''),
    competition:item.context?.competition_name || own.Competition_Name || 'Torneo',
    condition:conditionOf(own),
    opponent:String(opp.Equipo||item.opponent||'Rival'),
    gf,ga,eventId:item.eventId
  };
}

function recentBase(history,mode='all',limit=10){
  if(!history)return [];
  const ownId=Number(history.team.team_id);
  const pair=buildPairIndex(history,'ALL');
  const out=[];
  for(const [event,teams] of pair){
    const own=teams.get(ownId);
    const opp=[...teams.entries()].find(([id])=>Number(id)!==ownId)?.[1];
    if(!own||!opp)continue;
    const condition=conditionOf(own);
    if(mode==='venue'){
      const should=history===state.historyHome?'home':'away';
      if(condition!==should)continue;
    }
    const gf=num(own['Goals']),ga=num(opp['Goals']);
    out.push({
      eventId:event,
      date:String(own.Fecha||''),
      sortTime:parseDate(own.Fecha),
      competition:String(own.Competition_Name||'Torneo'),
      condition,
      opponent:String(opp.Equipo||'Rival'),
      gf,ga
    });
  }
  out.sort((a,b)=>b.sortTime-a.sortTime||Number(b.eventId)-Number(a.eventId));
  return out.slice(0,limit);
}

function statDisplay(value,stat){
  if(value===null||value===undefined)return '—';
  if(stat.kind==='result')return ({WIN:'G',DRAW:'E',LOSS:'P'})[value]||value;
  if(stat.kind==='btts')return value==='YES'?'Sí':'No';
  return smart(value);
}

function marketConfigForSelection(selectId){
  const stat=parsedStat($(selectId)?.value||'result');
  return stat;
}

function dynamicHighlights(stat){
  if(stat.kind==='result')return [
    ['WIN','Gana'],['DRAW','Empata'],['LOSS','Pierde']
  ];
  if(stat.kind==='btts')return [['YES','Sí'],['NO','No']];
  if(stat.kind==='raw')return [];
  const lines=CORE()?.lines?.(stat.market,stat.mode)||[];
  return lines.map(v=>[String(v),String(v)]);
}

function recentHit(value,stat,line,direction){
  if(value===null||value===undefined)return 'neutral';
  if(stat.kind==='result'||stat.kind==='btts')return String(value)===String(line)?'hit':'miss';
  if(stat.kind==='raw')return 'neutral';
  const n=Number(value),l=Number(line);
  if(n===l)return 'push';
  return direction==='under'?(n<l?'hit':'miss'):(n>l?'hit':'miss');
}

function scoreText(row){
  if(row.gf===null||row.ga===null)return '—';
  return `${smart(row.gf)}-${smart(row.ga)}`;
}

function resultClass(row){
  if(row.gf===null||row.ga===null)return 'neutral';
  return row.gf>row.ga?'win':row.gf<row.ga?'loss':'draw';
}

/* =========================
   RECENT MATCHES
   ========================= */

function renderRecent(){
  const panel=$('fxPanel-recent');
  if(!panel)return;
  panel.innerHTML=`
    <section class="fx-recent-pro-head">
      <div><span>FORMA RECIENTE · TITAN</span><h2>Forma & comparador</h2><p>Primero revisa los últimos partidos. Cuando necesites contexto agregado, cambia al comparador de temporada.</p></div>
      <div class="fx-recent-view-toggle" id="fxRecentView">
        <button class="${state.recentView==='matches'?'active':''}" data-recent-view="matches"><i class="fa-solid fa-clock-rotate-left"></i><span>Últimos partidos</span></button>
        <button class="${state.recentView==='compare'?'active':''}" data-recent-view="compare"><i class="fa-solid fa-chart-column"></i><span>Comparador</span></button>
      </div>
    </section>
    <section class="fx-recent-context">
      <span>CONTEXTO</span>
      <div class="fx-segmented" id="fxRecentVenue">
        <button class="${state.recentMode==='all'?'active':''}" data-mode="all">Todos</button>
        <button class="${state.recentMode==='venue'?'active':''}" data-mode="venue">Misma localía</button>
      </div>
      <small>${state.recentMode==='venue'?'Local para el equipo local · visita para el visitante':'Últimos partidos sin filtrar por localía'}</small>
    </section>
    <div class="fx-recent-pane ${state.recentView==='matches'?'active':''}" data-recent-pane="matches">
      <section class="fx-control-bar fx-control-bar-recent">
        <div class="fx-control">
          <label>Estadística</label>
          <select id="fxRecentStat">${statOptionsHTML()}</select>
        </div>
        <div class="fx-control">
          <label>Línea / objetivo</label>
          <select id="fxRecentLine"></select>
        </div>
        <div class="fx-control" id="fxRecentDirectionWrap">
          <label>Dirección</label>
          <select id="fxRecentDirection"><option value="over">Más de · Over</option><option value="under">Menos de · Under</option></select>
        </div>
      </section>
      <section class="fx-dual-results" id="fxRecentResults"></section>
    </div>
    <div class="fx-recent-pane ${state.recentView==='compare'?'active':''}" data-recent-pane="compare">
      <section class="fx-compare-explainer"><i class="fa-solid fa-circle-info"></i><div><b>Comparador de temporada actual</b><span>Promedios y resultados de la campaña vigente. No reutiliza la temporada anterior.</span></div></section>
      <section class="fx-average-board" id="fxAverageBoard"></section>
    </div>
  `;

  const statSel=$('fxRecentStat');
  if(statSel){
    statSel.value='goals_total';
    refreshRecentHighlight();
    statSel.onchange=()=>{refreshRecentHighlight();renderRecentBody();};
    $('fxRecentLine').onchange=renderRecentBody;
    $('fxRecentDirection').onchange=renderRecentBody;
  }

  panel.querySelectorAll('[data-recent-view]').forEach(btn=>{
    btn.onclick=()=>{
      state.recentView=btn.dataset.recentView==='compare'?'compare':'matches';
      panel.querySelectorAll('[data-recent-view]').forEach(b=>b.classList.toggle('active',b===btn));
      panel.querySelectorAll('[data-recent-pane]').forEach(p=>p.classList.toggle('active',p.dataset.recentPane===state.recentView));
      renderRecentBody();
    };
  });

  panel.querySelectorAll('#fxRecentVenue [data-mode]').forEach(btn=>{
    btn.onclick=()=>{
      state.recentMode=btn.dataset.mode==='venue'?'venue':'all';
      panel.querySelectorAll('#fxRecentVenue [data-mode]').forEach(b=>b.classList.toggle('active',b===btn));
      const note=panel.querySelector('.fx-recent-context>small');
      if(note)note.textContent=state.recentMode==='venue'?'Local para el equipo local · visita para el visitante':'Últimos partidos sin filtrar por localía';
      renderRecentBody();
    };
  });

  renderRecentBody();
}

function refreshRecentHighlight(){
  const stat=marketConfigForSelection('fxRecentStat');
  const line=$('fxRecentLine'),wrap=$('fxRecentDirectionWrap');
  const opts=dynamicHighlights(stat);
  if(stat.kind==='raw'){
    line.innerHTML='<option value="">Valor del partido</option>';
    line.disabled=true; wrap.hidden=true;
  }else{
    line.disabled=false;
    line.innerHTML=opts.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('');
    if(opts.length)line.value=opts[Math.floor(opts.length/2)][0];
    wrap.hidden=stat.kind==='result'||stat.kind==='btts';
  }
}

function activeRecentMode(){
  return state.recentMode||'all';
}

function renderRecentBody(){
  const target=$('fxRecentResults'),averages=$('fxAverageBoard');
  if(!target||!averages)return;

  const stat=marketConfigForSelection('fxRecentStat');
  const line=$('fxRecentLine')?.value;
  const direction=$('fxRecentDirection')?.value||'over';
  const mode=activeRecentMode();

  const sides=[
    {key:'home',fixtureTeam:state.fixture.home,titan:state.titanHome,history:state.historyHome},
    {key:'away',fixtureTeam:state.fixture.away,titan:state.titanAway,history:state.historyAway}
  ];

  target.innerHTML=sides.map(side=>{
    if(!side.history){
      return `<article class="fx-recent-side">${teamSideHeader(side)}
        ${empty('fa-database','Sin histórico TITAN','Este equipo todavía no forma parte de la base histórica local. El módulo LIVE seguirá disponible.')}
      </article>`;
    }

    const rows=recentBase(side.history,mode,10).map(r=>({
      ...r,
      value:bettingValue(side.history,r.eventId,side.history.team.team_id,stat,'ALL')
    }));

    return `<article class="fx-recent-side">
      ${teamSideHeader(side)}
      <div class="fx-recent-list">
        ${rows.map(r=>{
          const hit=recentHit(r.value,stat,line,direction);
          return `<div class="fx-recent-row">
            <span class="fx-date">${esc(r.date)}</span>
            <span class="fx-loc ${r.condition}">${r.condition==='home'?'LOCAL':'VISITA'}</span>
            <span class="fx-opp"><b>${esc(r.opponent)}</b><small>${esc(r.competition)}</small></span>
            <strong class="fx-score ${resultClass(r)}">${esc(scoreText(r))}</strong>
            <span class="fx-value ${hit}">${esc(statDisplay(r.value,stat))}</span>
          </div>`;
        }).join('') || '<div class="fx-clean-empty">No hay partidos suficientes para esta condición.</div>'}
      </div>
    </article>`;
  }).join('');

  averages.innerHTML=renderAverages(mode);
}

function teamSideHeader(side){
  return `<header class="fx-side-header">
    <div>${teamVisual({name:side.fixtureTeam?.name,logo:side.fixtureTeam?.logo,titan:side.titan})}</div>
    <span>${side.key==='home'?'LOCAL DEL PRÓXIMO PARTIDO':'VISITANTE DEL PRÓXIMO PARTIDO'}</span>
  </header>`;
}

function averageMetric(history,metric,mode){
  const rows=recentBase(history,mode,10);
  const vals=rows.map(r=>bettingValue(history,r.eventId,history.team.team_id,{kind:'raw',mode:'team',metric},'ALL')).filter(Number.isFinite);
  return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
}

function averageRival(history,metric,mode){
  const rows=recentBase(history,mode,10);
  const vals=rows.map(r=>bettingValue(history,r.eventId,history.team.team_id,{kind:'raw',mode:'rival',metric},'ALL')).filter(Number.isFinite);
  return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
}


function currentSeasonBase(history,mode='all',limit=999){
  if(!history)return [];
  const seasonId=Number(state.competition?.seasonId)||0, compId=Number(state.competition?.titanId)||0;
  const ownId=Number(history.team.team_id), pair=buildPairIndex(history,'ALL'), out=[];
  for(const [event,teams] of pair){
    const own=teams.get(ownId),opp=[...teams.entries()].find(([id])=>Number(id)!==ownId)?.[1];
    if(!own||!opp)continue;
    if(seasonId&&Number(own.Season_ID)!==seasonId)continue;
    if(compId&&Number(own.Competition_ID)!==compId)continue;
    const condition=conditionOf(own);
    if(mode==='venue'){
      const should=history===state.historyHome?'home':'away';
      if(condition!==should)continue;
    }
    out.push({eventId:event,date:String(own.Fecha||''),sortTime:parseDate(own.Fecha),condition,gf:num(own.Goals),ga:num(opp.Goals)});
  }
  out.sort((a,b)=>b.sortTime-a.sortTime||Number(b.eventId)-Number(a.eventId));
  return out.slice(0,limit);
}
function comparatorAverage(history,mode,stat,period='ALL'){
  if(!history)return null;
  const base=currentSeasonBase(history,mode,999);
  if(!base.length)return 0;
  const vals=base.map(r=>bettingValue(history,r.eventId,history.team.team_id,stat,period)).filter(Number.isFinite);
  return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
}
function comparatorRows(history,mode){return history?currentSeasonBase(history,mode,999).length:0;}
function comparatorResultRate(history,mode,type){
  const rows=currentSeasonBase(history,mode,999); if(!rows.length)return 0;
  const hits=rows.filter(r=>type==='win'?r.gf>r.ga:type==='draw'?r.gf===r.ga:r.gf<r.ga).length;
  return hits*100/rows.length;
}
function comparatorPPG(history,mode){
  const rows=currentSeasonBase(history,mode,999); if(!rows.length)return 0;
  const pts=rows.reduce((s,r)=>s+(r.gf>r.ga?3:r.gf===r.ga?1:0),0); return pts/rows.length;
}
function cmpVal(v){return Number.isFinite(v)?Number(v).toFixed(2):'—';}
function cmpPct(v){return Number.isFinite(v)?`${Number(v).toFixed(0)}%`:'—';}
function cmpStat(market,mode){return {market,mode,kind:'number'};}
function comparatorSection(title,rows,mode){
  const h=state.historyHome,a=state.historyAway;
  return `<section class="fx-compare-section"><header>${esc(title)}</header>${rows.map(r=>{const [label,hs,as,format]=r;const hv=typeof hs==='function'?hs(h):hs,av=typeof as==='function'?as(a):as,fmt=format==='pct'?cmpPct:cmpVal;return `<div class="fx-compare-row"><b>${fmt(hv)}</b><span>${esc(label)}</span><b>${fmt(av)}</b></div>`;}).join('')}</section>`;
}

function renderAverages(mode){
  const h=state.historyHome,a=state.historyAway;
  const av=(hist,market,kind,period='ALL')=>comparatorAverage(hist,mode,cmpStat(market,kind),period);
  const sections=[
    ['Partidos & resultados',[
      ['Partidos jugados',x=>comparatorRows(x,mode),x=>comparatorRows(x,mode)],
      ['Victorias',x=>comparatorResultRate(x,mode,'win'),x=>comparatorResultRate(x,mode,'win'),'pct'],
      ['Empates',x=>comparatorResultRate(x,mode,'draw'),x=>comparatorResultRate(x,mode,'draw'),'pct'],
      ['Derrotas',x=>comparatorResultRate(x,mode,'loss'),x=>comparatorResultRate(x,mode,'loss'),'pct'],
      ['Puntos por partido',x=>comparatorPPG(x,mode),x=>comparatorPPG(x,mode)]
    ]],
    ['Goles · partido completo',[["Total",x=>av(x,'goals','total'),x=>av(x,'goals','total')],["A favor",x=>av(x,'goals','team'),x=>av(x,'goals','team')],["En contra",x=>av(x,'goals','rival'),x=>av(x,'goals','rival')]]],
    ['Goles · 1.er tiempo',[["Total",x=>av(x,'goals','total','1ST'),x=>av(x,'goals','total','1ST')],["A favor",x=>av(x,'goals','team','1ST'),x=>av(x,'goals','team','1ST')],["En contra",x=>av(x,'goals','rival','1ST'),x=>av(x,'goals','rival','1ST')]]],
    ['Goles · 2.º tiempo',[["Total",x=>av(x,'goals','total','2ND'),x=>av(x,'goals','total','2ND')],["A favor",x=>av(x,'goals','team','2ND'),x=>av(x,'goals','team','2ND')],["En contra",x=>av(x,'goals','rival','2ND'),x=>av(x,'goals','rival','2ND')]]],
    ['Córners',[["Total",x=>av(x,'corners','total'),x=>av(x,'corners','total')],["A favor",x=>av(x,'corners','team'),x=>av(x,'corners','team')],["En contra",x=>av(x,'corners','rival'),x=>av(x,'corners','rival')]]],
    ['Córners · 1.er tiempo',[["Total",x=>av(x,'corners','total','1ST'),x=>av(x,'corners','total','1ST')],["A favor",x=>av(x,'corners','team','1ST'),x=>av(x,'corners','team','1ST')],["En contra",x=>av(x,'corners','rival','1ST'),x=>av(x,'corners','rival','1ST')]]],
    ['Córners · 2.º tiempo',[["Total",x=>av(x,'corners','total','2ND'),x=>av(x,'corners','total','2ND')],["A favor",x=>av(x,'corners','team','2ND'),x=>av(x,'corners','team','2ND')],["En contra",x=>av(x,'corners','rival','2ND'),x=>av(x,'corners','rival','2ND')]]],
    ['Tarjetas & booking points',[["Tarjetas totales",x=>av(x,'cards','total'),x=>av(x,'cards','total')],["Tarjetas propias",x=>av(x,'cards','team'),x=>av(x,'cards','team')],["Booking total",x=>av(x,'booking','total'),x=>av(x,'booking','total')],["Booking propio",x=>av(x,'booking','team'),x=>av(x,'booking','team')]]],
    ['Tiros',[["Tiros totales",x=>av(x,'shots','total'),x=>av(x,'shots','total')],["Tiros a favor",x=>av(x,'shots','team'),x=>av(x,'shots','team')],["Tiros en contra",x=>av(x,'shots','rival'),x=>av(x,'shots','rival')],["A puerta a favor",x=>av(x,'sot','team'),x=>av(x,'sot','team')],["A puerta en contra",x=>av(x,'sot','rival'),x=>av(x,'sot','rival')]]],
    ['Disciplina & juego',[["Faltas cometidas",x=>av(x,'fouls','team'),x=>av(x,'fouls','team')],["Faltas recibidas",x=>av(x,'fouls','rival'),x=>av(x,'fouls','rival')],["Offsides",x=>av(x,'offsides','team'),x=>av(x,'offsides','team')],["Tackles",x=>av(x,'tackles','team'),x=>av(x,'tackles','team')]]],
    ['Reanudaciones',[["Saques de meta",x=>av(x,'goalkicks','team'),x=>av(x,'goalkicks','team')],["Saques de banda",x=>av(x,'throwins','team'),x=>av(x,'throwins','team')]]]
  ];
  const hp=comparatorRows(h,mode),ap=comparatorRows(a,mode),zero=!hp&&!ap;
  return `<section class="fx-adam-comparator"><div class="fx-comparator-head"><div>${teamVisual({name:state.fixture.home.name,logo:state.fixture.home.logo,titan:state.titanHome})}<small>${mode==='venue'?'LOCAL':'TEMPORADA'}</small></div><span>COMPARADOR · ${esc(state.competition?.season||'TEMPORADA ACTUAL')}</span><div>${teamVisual({name:state.fixture.away.name,logo:state.fixture.away.logo,titan:state.titanAway})}<small>${mode==='venue'?'VISITA':'TEMPORADA'}</small></div></div>${zero?`<div class="fx-season-zero"><i class="fa-solid fa-circle-info"></i><div><b>Temporada actual todavía en 0</b><span>Los últimos partidos de arriba sirven como forma reciente. Este comparador NO reutiliza promedios de la campaña anterior.</span></div><strong>0 · 0</strong></div>`:''}${sections.map(([title,rows])=>comparatorSection(title,rows,mode)).join('')}</section>`;
}

/* =========================
   HEAD TO HEAD
   ========================= */

function h2hEvents(){
  if(!state.historyHome||!state.historyAway||!state.titanHome||!state.titanAway)return [];
  const pair=buildPairIndex(state.historyHome,'ALL');
  const homeId=Number(state.titanHome.team_id),awayId=Number(state.titanAway.team_id);
  const out=[];
  for(const [event,teams] of pair){
    if(!teams.has(homeId)||!teams.has(awayId))continue;
    const h=teams.get(homeId),a=teams.get(awayId);
    const hCondition=conditionOf(h);
    out.push({
      event,date:String(h.Fecha||a.Fecha||''),sortTime:parseDate(h.Fecha||a.Fecha),
      homeRow:h,awayRow:a,
      upcomingHomeWasHome:hCondition==='home',
      competition:String(h.Competition_Name||'Torneo')
    });
  }
  return out.sort((x,y)=>y.sortTime-x.sortTime||Number(y.event)-Number(x.event));
}

function renderH2H(){
  const panel=$('fxPanel-h2h');
  if(!panel)return;

  panel.innerHTML=`
    <section class="fx-h2h-mode">
      <div class="fx-segmented" id="fxH2HMode">
        <button class="active" data-mode="all">Todos los cruces</button>
        <button data-mode="venue">Misma localía del próximo</button>
      </div>
      <span>Si ${esc(state.fixture.home.name)} es local ahora, el segundo modo muestra solo cruces históricos con esa misma orientación.</span>
    </section>
    <section class="fx-control-bar h2h">
      <div class="fx-control"><label>Mostrar estadística</label><select id="fxH2HStat">${statOptionsHTML()}</select></div>
      <div class="fx-control"><label>Perspectiva</label><select id="fxH2HPerspective"><option value="home">${esc(state.fixture.home.name)}</option><option value="away">${esc(state.fixture.away.name)}</option></select></div>
      <div class="fx-control"><label>Resaltar mercado</label><select id="fxH2HLine"></select></div>
      <div class="fx-control" id="fxH2HDirectionWrap"><label>Over / Under</label><select id="fxH2HDirection"><option value="over">Más de · Over</option><option value="under">Menos de · Under</option></select></div>
    </section>
    <section id="fxH2HBody"></section>`;

  $('fxH2HStat').value='result';
  refreshH2HHighlight();

  $('fxH2HStat').onchange=()=>{refreshH2HHighlight();renderH2HBody();};
  $('fxH2HLine').onchange=renderH2HBody;
  $('fxH2HDirection').onchange=renderH2HBody;
  $('fxH2HPerspective').onchange=renderH2HBody;

  panel.querySelectorAll('#fxH2HMode [data-mode]').forEach(btn=>{
    btn.onclick=()=>{
      panel.querySelectorAll('#fxH2HMode [data-mode]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); renderH2HBody();
    };
  });

  renderH2HBody();
}

function refreshH2HHighlight(){
  const stat=parsedStat($('fxH2HStat')?.value);
  const line=$('fxH2HLine'),wrap=$('fxH2HDirectionWrap');
  const opts=dynamicHighlights(stat);
  if(stat.kind==='raw'){
    line.innerHTML='<option value="">Valor del cruce</option>';line.disabled=true;wrap.hidden=true;
  }else{
    line.disabled=false;
    line.innerHTML=opts.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('');
    if(opts.length)line.value=opts[Math.floor(opts.length/2)][0];
    wrap.hidden=stat.kind==='result'||stat.kind==='btts';
  }
}

function activeH2HMode(){
  return document.querySelector('#fxH2HMode [data-mode].active')?.dataset.mode||'all';
}

function h2hValue(event,stat,perspective){
  const team=perspective==='away'?state.titanAway:state.titanHome;
  return bettingValue(state.historyHome,event.event,team.team_id,stat,'ALL');
}

function h2hHit(value,stat,line,direction){
  if(value===null||value===undefined)return 'neutral';
  if(stat.kind==='result'||stat.kind==='btts')return String(value)===String(line)?'hit':'miss';
  if(stat.kind==='raw')return 'neutral';
  const n=Number(value),l=Number(line);
  if(n===l)return 'push';
  return direction==='under'?(n<l?'hit':'miss'):(n>l?'hit':'miss');
}

function h2hScore(event){
  const hr=event.upcomingHomeWasHome?event.homeRow:event.awayRow;
  const ar=event.upcomingHomeWasHome?event.awayRow:event.homeRow;
  const hg=num(hr['Goals']),ag=num(ar['Goals']);
  return hg===null||ag===null?'—':`${smart(hg)}-${smart(ag)}`;
}

function renderH2HBody(){
  const body=$('fxH2HBody');
  if(!body)return;
  if(!state.historyHome||!state.historyAway){
    body.innerHTML=empty('fa-code-compare','H2H sin histórico común','Cuando ambos equipos existan en TITAN, aquí se cruzarán sus Event_ID reales.');
    return;
  }
  let rows=h2hEvents();
  if(activeH2HMode()==='venue')rows=rows.filter(r=>r.upcomingHomeWasHome);
  if(!rows.length){
    body.innerHTML=empty('fa-link','Sin cruces para esta orientación','No hay enfrentamientos registrados con la misma localía del próximo partido.');
    return;
  }

  const stat=parsedStat($('fxH2HStat')?.value);
  const perspective=$('fxH2HPerspective')?.value||'home';
  const line=$('fxH2HLine')?.value;
  const direction=$('fxH2HDirection')?.value||'over';

  const values=rows.map(r=>{
    const value=h2hValue(r,stat,perspective);
    return {...r,value,hit:h2hHit(value,stat,line,direction)};
  });
  const decisions=values.filter(x=>x.hit==='hit'||x.hit==='miss');
  const hits=values.filter(x=>x.hit==='hit').length;

  body.innerHTML=`
    <section class="fx-h2h-summary">
      <div><small>CRUCES</small><strong>${rows.length}</strong><span>${activeH2HMode()==='venue'?'misma localía':'histórico completo'}</span></div>
      <div><small>CUMPLE SELECCIÓN</small><strong>${decisions.length?pct(hits/decisions.length*100):'—'}</strong><span>${hits}/${decisions.length}</span></div>
      <div><small>PERSPECTIVA</small><strong>${esc(perspective==='home'?state.fixture.home.name:state.fixture.away.name)}</strong><span>${esc($('fxH2HStat').selectedOptions[0]?.textContent||'')}</span></div>
    </section>
    <div class="fx-h2h-table-wrap">
      <table class="fx-h2h-table">
        <thead><tr><th>Fecha</th><th>Torneo</th><th>Local</th><th>Marcador</th><th>Visitante</th><th>Dato</th></tr></thead>
        <tbody>${values.map(r=>{
          const localName=r.upcomingHomeWasHome?state.fixture.home.name:state.fixture.away.name;
          const awayName=r.upcomingHomeWasHome?state.fixture.away.name:state.fixture.home.name;
          const localTitan=r.upcomingHomeWasHome?state.titanHome:state.titanAway;
          const awayTitan=r.upcomingHomeWasHome?state.titanAway:state.titanHome;
          return `<tr>
            <td>${esc(r.date)}</td>
            <td>${esc(r.competition)}</td>
            <td><span class="fx-club-cell">${teamVisual({name:localName,titan:localTitan})}</span></td>
            <td><strong>${esc(h2hScore(r))}</strong></td>
            <td><span class="fx-club-cell">${teamVisual({name:awayName,titan:awayTitan})}</span></td>
            <td><span class="fx-market-pill ${r.hit}">${esc(statDisplay(r.value,stat))}</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
}

/* =========================
   TRENDS — API + TITAN CONTEXT
   ========================= */

async function renderTrends(){
  const panel=$('fxPanel-trends');
  if(!panel)return;
  panel.innerHTML='<div class="fx-loading"><span></span> Preparando rachas del partido…</div>';

  try{
    const data=await apiJSON('trends',{
      homeTeamId:state.fixture.home?.id,
      awayTeamId:state.fixture.away?.id
    },15*60*1000);

    if(data?.configured&&data.home&&data.away){
      panel.innerHTML=`
        <section class="fx-trends-intro">
          <div><i class="fa-solid fa-satellite-dish"></i><span><b>FORMA LIVE DEL PROVEEDOR</b><small>Últimos resultados del equipo, separados de tu histórico TITAN.</small></span></div>
          <span>API · L10</span>
        </section>
        <div class="fx-trend-grid">${trendCard(state.fixture.home,data.home,'home')}${trendCard(state.fixture.away,data.away,'away')}</div>
        ${renderTitanBettingTrends()}`;
      wireTrendFilters(panel);
      return;
    }
  }catch(_){}

  panel.innerHTML=`<section class="fx-trends-intro"><div><i class="fa-solid fa-database"></i><span><b>RACHAS TITAN</b><small>Últimos 10 partidos · global y condición del próximo encuentro.</small></span></div></section>${renderTitanBettingTrends()}`;
  wireTrendFilters(panel);
}

function trendCard(team,data,side){
  const results=(data.matches||[]).slice(0,10);
  const wins=results.filter(x=>x.result==='W').length;
  const draws=results.filter(x=>x.result==='D').length;
  const losses=results.filter(x=>x.result==='L').length;
  return `<article class="fx-api-trend">
    <header>${teamVisual({name:team.name,logo:team.logo,titan:side==='home'?state.titanHome:state.titanAway})}</header>
    <div class="fx-form-kpis">
      <div><strong>${wins}</strong><span>Victorias</span></div>
      <div><strong>${draws}</strong><span>Empates</span></div>
      <div><strong>${losses}</strong><span>Derrotas</span></div>
    </div>
    <div class="fx-form-seq">${results.map(m=>`<span class="${m.result==='W'?'w':m.result==='D'?'d':'l'}" title="${esc(m.opponent||'')}">${esc(m.result)}</span>`).join('')}</div>
  </article>`;
}

function titanTrendFor(history,fixtureSide,market,mode,line){
  if(!history)return null;
  const rows=recentBase(history,fixtureSide==='home'?'venue':'venue',10);
  }


function trendEventRows(history,mode='all'){
  return recentBase(history,mode,10);
}
function trendMetric(history,eventId,market,which='team',period='ALL'){
  return bettingValue(history,eventId,history.team.team_id,{market,mode:which,kind:'number'},period);
}
function buildTrendDefinitions(){
  return [
    ['result','Unbeaten', (h,e)=>{const v=bettingValue(h,e,h.team.team_id,{kind:'result'},'ALL');return v!==null&&v!=='LOSS';}],
    ['result','Won', (h,e)=>bettingValue(h,e,h.team.team_id,{kind:'result'},'ALL')==='WIN'],
    ['goals','Scored 1+ goal', (h,e)=>(trendMetric(h,e,'goals','team')||0)>=1],
    ['goals','Over 1.5 match goals', (h,e)=>(trendMetric(h,e,'goals','total')||0)>1.5],
    ['goals','Over 2.5 match goals', (h,e)=>(trendMetric(h,e,'goals','total')||0)>2.5],
    ['btts','Both teams scored', (h,e)=>bettingValue(h,e,h.team.team_id,{kind:'btts'},'ALL')==='YES'],
    ['half','Scored in 1st half', (h,e)=>(trendMetric(h,e,'goals','team','1ST')||0)>=1],
    ['half','Scored in 2nd half', (h,e)=>(trendMetric(h,e,'goals','team','2ND')||0)>=1],
    ['corners','Won over 3.5 corners', (h,e)=>(trendMetric(h,e,'corners','team')||0)>3.5],
    ['corners','Won over 4.5 corners', (h,e)=>(trendMetric(h,e,'corners','team')||0)>4.5],
    ['corners','Most corners', (h,e)=>{const a=trendMetric(h,e,'corners','team'),b=trendMetric(h,e,'corners','rival');return Number.isFinite(a)&&Number.isFinite(b)&&a>b;}],
    ['corners','Under 9.5 total corners', (h,e)=>{const v=trendMetric(h,e,'corners','total');return Number.isFinite(v)&&v<9.5;}],
    ['corners','Under 10.5 total corners', (h,e)=>{const v=trendMetric(h,e,'corners','total');return Number.isFinite(v)&&v<10.5;}],
    ['booking','Opponents received 10+ booking points', (h,e)=>(trendMetric(h,e,'booking','rival')||0)>=10],
    ['booking','30+ total booking points', (h,e)=>(trendMetric(h,e,'booking','total')||0)>=30],
    ['booking','40+ total booking points', (h,e)=>(trendMetric(h,e,'booking','total')||0)>=40],
    ['cards','1+ team card', (h,e)=>(trendMetric(h,e,'cards','team')||0)>=1],
    ['cards','4+ total cards', (h,e)=>(trendMetric(h,e,'cards','total')||0)>=4],
    ['shots','11+ team shots', (h,e)=>(trendMetric(h,e,'shots','team')||0)>=11],
    ['shots','4+ shots on target', (h,e)=>(trendMetric(h,e,'sot','team')||0)>=4],
    ['fouls','10+ team fouls', (h,e)=>(trendMetric(h,e,'fouls','team')||0)>=10],
    ['fouls','Opponent 10+ fouls', (h,e)=>(trendMetric(h,e,'fouls','rival')||0)>=10],
    ['offsides','1+ team offside', (h,e)=>(trendMetric(h,e,'offsides','team')||0)>=1],
    ['goalkicks','6+ goal kicks', (h,e)=>(trendMetric(h,e,'goalkicks','team')||0)>=6],
    ['throwins','18+ throw-ins', (h,e)=>(trendMetric(h,e,'throwins','team')||0)>=18],
    ['tackles','10+ tackles', (h,e)=>(trendMetric(h,e,'tackles','team')||0)>=10]
  ];
}
function trendAnalysis(history,mode='all'){
  if(!history)return [];
  const events=trendEventRows(history,mode),defs=buildTrendDefinitions(),out=[];
  return defs.map(([category,label,test])=>{
    let hits=0,streak=0,open=true;
    for(const r of events){const ok=!!test(history,r.eventId);if(ok)hits++;if(open&&ok)streak++;else open=false;}
    return {category,label,hits,n:events.length,rate:events.length?hits/events.length*100:0,streak};
  }).sort((a,b)=>b.rate-a.rate||b.streak-a.streak||a.label.localeCompare(b.label,'es'));
}
function trendTeamBoard(team,titan,history,side){
  const all=trendAnalysis(history,'all'),venue=trendAnalysis(history,'venue');
  return `<article class="fx-adam-trend-team"><header>${teamVisual({name:team.name,logo:team.logo,titan})}<span>${side==='home'?'LOCAL DEL PRÓXIMO':'VISITANTE DEL PRÓXIMO'}</span></header><div class="fx-adam-trend-rows">${all.map((r,i)=>{const vr=venue.find(x=>x.category===r.category&&x.label===r.label);return `<div class="fx-adam-trend-row" data-trend-category="${esc(r.category)}"><div><b>${esc(r.label)}</b><small>${r.hits}/${r.n} partidos · racha ${r.streak}</small></div><span><strong>${pct(r.rate)}</strong><em>${vr?`${pct(vr.rate)} ${side==='home'?'local':'visita'}`:'—'}</em></span></div>`;}).join('')}</div></article>`;
}
function wireTrendFilters(panel){
  panel.querySelectorAll('[data-trend-filter]').forEach(btn=>btn.onclick=()=>{const cat=btn.dataset.trendFilter;panel.querySelectorAll('[data-trend-filter]').forEach(x=>x.classList.toggle('active',x===btn));panel.querySelectorAll('[data-trend-category]').forEach(row=>row.hidden=cat!=='all'&&row.dataset.trendCategory!==cat);});
}

function renderTitanBettingTrends(){
  const cats=[['all','All'],['result','Result'],['goals','Goals'],['btts','BTTS'],['half','Half'],['corners','Corners'],['booking','Booking Points'],['cards','Cards'],['shots','Shots'],['fouls','Fouls'],['offsides','Offsides'],['goalkicks','Goal Kicks'],['throwins','Throw Ins'],['tackles','Tackles']];
  return `<section class="fx-titan-trends fx-adam-trends"><div class="fx-section-title"><span>RACHAS & TENDENCIAS · ÚLTIMOS 10</span><small>Global + local/visita del próximo partido</small></div><div class="fx-trend-category-tabs">${cats.map(([k,l],i)=>`<button data-trend-filter="${k}" class="${i===0?'active':''}">${esc(l)}</button>`).join('')}</div><div class="fx-adam-trend-compare">${trendTeamBoard(state.fixture.home,state.titanHome,state.historyHome,'home')}${trendTeamBoard(state.fixture.away,state.titanAway,state.historyAway,'away')}</div></section>`;
}

function calcMarketTrend(history,side,market,mode,line){
  if(!history)return {global:null,venue:null};
  function calc(filterMode){
    const rows=recentBase(history,filterMode,10)
      .map(r=>bettingValue(history,r.eventId,history.team.team_id,{market,mode,kind:'number'},'ALL'))
      .filter(Number.isFinite);
    const hits=rows.filter(v=>v>line).length;
    let streak=0;
    for(const v of rows){if(v>line)streak++;else break;}
    return {n:rows.length,hits,rate:rows.length?hits/rows.length*100:0,streak};
  }
  return {global:calc('all'),venue:calc('venue')};
}

function renderTrendMarket(market,mode,line,label){
  const h=calcMarketTrend(state.historyHome,'home',market,mode,line);
  const a=calcMarketTrend(state.historyAway,'away',market,mode,line);
  return `<article class="fx-trend-market">
    <header><b>${esc(label)}</b><span>Over ${esc(line)}</span></header>
    <div>
      <span>${esc(state.fixture.home.name)}</span><strong>${h.global?pct(h.global.rate):'—'}</strong><small>Global · ${h.global?.hits||0}/${h.global?.n||0}</small>
      <em>${h.venue?pct(h.venue.rate):'—'} local</em>
    </div>
    <div>
      <span>${esc(state.fixture.away.name)}</span><strong>${a.global?pct(a.global.rate):'—'}</strong><small>Global · ${a.global?.hits||0}/${a.global?.n||0}</small>
      <em>${a.venue?pct(a.venue.rate):'—'} visita</em>
    </div>
  </article>`;
}


function matchPlayerAvatar(id,extra=''){
  const pid=Number(id)||0,primary=window.INCA_PLAYERS?.faceUrl?.(pid)||`./img/${pid}.png`,fallback=`./img/${pid}.png`;
  return `<span class="inca-player-avatar ${esc(extra)}"><img src="${esc(primary)}" data-fallback="${esc(fallback)}" onerror="if(this.dataset.fallback&&this.src!==new URL(this.dataset.fallback,location.href).href){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.hidden=true;this.nextElementSibling.hidden=false}" alt="" loading="lazy" decoding="async"><i class="fa-solid fa-user-secret" hidden></i></span>`;
}
function titanRowNumber(row,keys){
  for(const key of keys){const n=num(row?.[key]);if(Number.isFinite(n))return n;}
  return null;
}
function currentStandingsFromTitan(data,rosterTeams=[]){
  const visual=new Map();
  for(const t of rosterTeams||[]){const id=Number(t?.team_id||t?.id)||0;if(id)visual.set(id,{name:t?.name||t?.team_name||'',logo:t?.logo||''});}
  for(const f of state.fixtures||[]){
    const hid=Number(f?.home?.id||f?.home_id||f?.home_sofascore_team_id)||0, aid=Number(f?.away?.id||f?.away_id||f?.away_sofascore_team_id)||0;
    if(hid&&!visual.has(hid))visual.set(hid,{name:f?.home?.name||f?.home||f?.home_team_name||'',logo:f?.home?.logo||''});
    if(aid&&!visual.has(aid))visual.set(aid,{name:f?.away?.name||f?.away||f?.away_team_name||'',logo:f?.away?.logo||''});
  }
  const table=new Map();
  const ensure=(id,name='')=>{
    id=Number(id)||0;if(!id)return null;
    const v=visual.get(id)||{};
    if(!table.has(id))table.set(id,{id,name:name||v.name||`Equipo ${id}`,logo:v.logo||TITAN()?.logoUrl?.(name||v.name||'',id)||'',pj:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,pts:0});
    else if(name&&/^Equipo \d+$/.test(table.get(id).name))table.get(id).name=name;
    return table.get(id);
  };
  for(const [id,v] of visual)ensure(id,v.name);
  const all=(data||[]).filter(r=>String(r?.Tiempo||'').toUpperCase()==='ALL');
  const byEvent=new Map();
  for(const r of all){
    const id=Number(r?.Team_ID)||0,event=String(r?.Event_ID||r?.ID_Partido||'').trim();if(!id||!event)continue;
    ensure(id,String(r?.Original_Team_Name||'').trim());
    if(!byEvent.has(event))byEvent.set(event,new Map());
    byEvent.get(event).set(id,r);
  }
  for(const teams of byEvent.values()){
    const rows=[...teams.values()];if(rows.length<2)continue;
    const a=rows[0],b=rows.find(r=>Number(r?.Team_ID)!==Number(a?.Team_ID));if(!b)continue;
    const ag=titanRowNumber(a,['Goles','Goals','Score']),bg=titanRowNumber(b,['Goles','Goals','Score']);
    if(!Number.isFinite(ag)||!Number.isFinite(bg))continue;
    const A=ensure(a.Team_ID,String(a?.Original_Team_Name||'').trim()),B=ensure(b.Team_ID,String(b?.Original_Team_Name||'').trim());
    A.pj++;B.pj++;A.gf+=ag;A.ga+=bg;B.gf+=bg;B.ga+=ag;
    if(ag>bg){A.w++;B.l++;A.pts+=3;}else if(ag<bg){B.w++;A.l++;B.pts+=3;}else{A.d++;B.d++;A.pts++;B.pts++;}
  }
  const out=[...table.values()];out.forEach(x=>x.gd=x.gf-x.ga);return out;
}
async function currentStandingsDataset(compId,seasonId){
  try{
    await TITAN()?.mergeCurrentSeasonsFromFixtures?.({refreshSelectors:false});
    const ds=await TITAN()?.loadCompetitionSeason?.(`TITAN_C${Number(compId)}`,`TITAN_S${Number(seasonId)}`);
    const table=currentStandingsFromTitan(ds?.data||[],ds?.rosterTeams||[]);
    return {table,rows:Number(ds?.data?.length)||0};
  }catch(err){console.warn('[INCA MATCH V1.023] current standings dataset',err?.message||err);return {table:[],rows:0};}
}

/* =========================
   STANDINGS
   ========================= */

async function renderStandings(targetPanel=null){
  const panel=targetPanel||$('fxPanel-standings'); if(!panel)return;
  panel.innerHTML='<div class="fx-loading"><span></span> Construyendo tabla TITAN CURRENT…</div>';
  try{
    await FIXTURES()?.ensureReady?.();
    const compId=Number(state.competition?.titanId)||0, seasonId=Number(state.competition?.seasonId)||0;
    let table=[],source='';
    const current=compId&&seasonId?await currentStandingsDataset(compId,seasonId):{table:[]};
    if(current.table?.some(x=>x.pj>0)){table=current.table;source='TITAN · campaña actual';}
    if(!table.length||!table.some(x=>x.pj>0)){
      const events=(FIXTURES()?.forCompetition?.(compId,{includeEnded:true})||[]).filter(e=>!seasonId||Number(e.season_id)===seasonId);
      const map=new Map();
      const add=(id,name)=>{id=Number(id)||0;if(!id||!name)return;if(!map.has(id))map.set(id,{id,name,logo:TITAN()?.logoUrl?.(name,id)||'',pj:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,pts:0});};
      for(const e of events){add(e.home_id,e.home);add(e.away_id,e.away);}
      for(const e of events){
        const hs=Number(e.home_score),as=Number(e.away_score),status=String(e.status_type||'').toLowerCase();
        const finished=['finished','ended','afterextra','afterpenalties'].includes(status)&&Number.isFinite(hs)&&Number.isFinite(as);if(!finished)continue;
        const h=map.get(Number(e.home_id)),a=map.get(Number(e.away_id));if(!h||!a)continue;
        h.pj++;a.pj++;h.gf+=hs;h.ga+=as;a.gf+=as;a.ga+=hs;
        if(hs>as){h.w++;a.l++;h.pts+=3;}else if(hs<as){a.w++;h.l++;a.pts+=3;}else{h.d++;a.d++;h.pts++;a.pts++;}
      }
      const fixtureTable=[...map.values()];fixtureTable.forEach(x=>x.gd=x.gf-x.ga);
      if(fixtureTable.some(x=>x.pj>0)||!table.length){table=fixtureTable;source=fixtureTable.some(x=>x.pj>0)?'Fixtures finalizados':'Plantel de la temporada';}
    }
    const hasPlayed=table.some(x=>x.pj>0);
    table.sort((a,b)=>hasPlayed?(b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||String(a.name).localeCompare(String(b.name),'es')):String(a.name).localeCompare(String(b.name),'es'));
    if(table.length){
      const homeName=norm(state.fixture.home.name),awayName=norm(state.fixture.away.name),rankOf=name=>table.findIndex(x=>norm(x.name)===name)+1;
      panel.innerHTML=`<section class="fx-table-head"><div><span>${hasPlayed?'POSICIÓN ACTUAL':'TEMPORADA ACTUAL'}</span><h2>${esc(state.competition?.apiName||state.competition?.name||'Liga')}</h2><p>${hasPlayed?`Calculada con datos ya extraídos de la campaña vigente · ${esc(source)}.`:'La campaña vigente todavía no devuelve partidos finalizados en TITAN; no se reutiliza una temporada anterior.'}</p></div><div class="fx-table-match-ranks"><span><small>${esc(state.fixture.home.name)}</small><b>${hasPlayed&&rankOf(homeName)>0?'#'+rankOf(homeName):'—'}</b></span><span><small>${esc(state.fixture.away.name)}</small><b>${hasPlayed&&rankOf(awayName)>0?'#'+rankOf(awayName):'—'}</b></span></div></section><div class="fx-standings-wrap"><table class="fx-standings"><thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th>PTS</th></tr></thead><tbody>${table.map((r,i)=>{const selected=norm(r.name)===homeName||norm(r.name)===awayName,side=norm(r.name)===homeName?'LOCAL':norm(r.name)===awayName?'VISITA':'';return `<tr class="${selected?'selected':''}"><td>${i+1}</td><td><span class="fx-standing-team">${teamVisual({name:r.name,logo:r.logo})}${side?`<em>${side}</em>`:''}</span></td><td>${r.pj}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gd>0?'+':''}${r.gd}</td><td><b>${r.pts}</b></td></tr>`;}).join('')}</tbody></table></div>`;
      return;
    }
  }catch(err){console.warn('[INCA STANDINGS TITAN]',err);}
  panel.innerHTML=empty('fa-table-list','Tabla todavía no disponible','TITAN CURRENT no devolvió suficientes filas para construir la tabla.');
}

/* =========================
   PLAYERS
   ========================= */

async function renderPlayers(){
  const panel=$('fxPanel-players'); if(!panel)return;
  panel.innerHTML='<div class="fx-loading"><span></span> Preparando Player Stats + rachas…</div>';
  const p=window.INCA_PLAYERS;
  if(!p?.ensureReady){panel.innerHTML=empty('fa-users','TITAN PLAYERS pendiente','El master de jugadores todavía no está cargado.');return;}
  try{
    await p.ensureReady();await p.ensureCurrentReady?.().catch(()=>null);
    const compId=Number(state.competition?.titanId)||0,seasonId=Number(state.competition?.seasonId)||0,metric=state.matchPlayerMetric,scope=state.matchPlayerScope;
    const metricDef=p.METRICS[metric]||p.METRICS.goals,logo=compLogo(state.competition);
    const directoryFor=team=>p.directoryForTeams?.([team.name])||[];
    const homeDir=directoryFor(state.fixture.home),awayDir=directoryFor(state.fixture.away);
    const currentById=new Map([...homeDir,...awayDir].map(x=>[Number(x.id),x]));
    const build=(team,dir)=>dir.map(d=>{const st=p.playerCurrentStats?.(d.id,compId,seasonId,scope,metric)||{apps:0,starts:0,minutes:0,total:0,per90:0};return {...d,...st,team:d.team||team.name};}).sort((a,b)=>b.total-a.total||b.per90-a.per90||String(a.name).localeCompare(String(b.name),'es'));
    const home=build(state.fixture.home,homeDir),away=build(state.fixture.away,awayDir);
    const metricOptions=Object.entries(p.METRICS).filter(([k])=>['goals','assists','involvements','cards','shots','sot','fouls','fouled','tackles','offsides'].includes(k)).map(([k,v])=>`<option value="${k}" ${metric===k?'selected':''}>${esc(v.label)}</option>`).join('');
    const side=(team,titan,rows,where)=>`<article class="fx-match-player-side"><header>${teamVisual({name:team.name,logo:team.logo,titan})}<span>${where}</span></header><div class="fx-match-player-table"><div class="head"><span>Jugador</span><span>PJ</span><span>Min</span><span>Total</span><span>Per 90</span></div>${rows.length?rows.slice(0,35).map(x=>`<button data-match-player="${x.id}" data-match-player-comp="${compId}"><span class="player">${matchPlayerAvatar(x.id,'match-table')}<b>${esc(x.name)}</b><small>${esc(x.team||team.name)} · ${esc(x.position||'—')}</small></span><span>${x.apps||0}</span><span>${Math.round(x.minutes||0)}</span><span><b>${Number(x.total||0).toFixed(1)}</b></span><span>${Number(x.per90||0).toFixed(2)}</span></button>`).join(''):`<div class="fx-clean-empty">Plantel actual no identificado todavía.</div>`}</div></article>`;
    const streaksFor=(team,dir)=>{
      const ids=dir.map(x=>x.id);if(!ids.length)return [];
      const all=[];
      for(const [market,def] of Object.entries(p.STREAK_MARKETS||{})){
        const found=p.playerStreaksForIds?.(ids,{market,scope:'all',min:3,limit:20,competitionId:null})||[];
        found.forEach(x=>{const cur=currentById.get(Number(x.id));all.push({...x,market,marketLabel:def.label,team:cur?.team||team.name,teamId:Number(cur?.teamId)||Number(x.teamId)||0,position:cur?.position||x.position});});
      }
      const seen=new Set();return all.sort((a,b)=>b.streak-a.streak||String(a.name).localeCompare(String(b.name),'es')).filter(x=>{const k=`${x.id}|${x.market}`;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,12);
    };
    const streakSide=(team,titan,rows,where)=>`<article class="fx-player-streak-side"><header>${teamVisual({name:team.name,logo:team.logo,titan})}<span>${where}</span></header>${rows.length?`<div class="fx-player-streak-list">${rows.map(x=>`<button data-match-player="${x.id}" data-match-player-comp="${compId}" data-match-player-market="${esc(x.market||'')}"><span class="fx-player-streak-person">${matchPlayerAvatar(x.id,'match-streak')}<b>${esc(x.name)}</b><small>${esc(x.team||team.name)}</small></span><span class="fx-player-streak-market"><b>${esc(x.marketLabel)}</b><small>últimos ${x.streak} consecutivos</small></span><span class="fx-player-streak-seq">${x.sequence.map(v=>`<i>${esc(v)}</i>`).join('')}</span><strong>${x.streak}</strong><i class="fa-solid fa-arrow-right"></i></button>`).join('')}</div>`:`<div class="fx-clean-empty tall">Sin rachas disponibles para este plantel en el master actual.</div>`}</article>`;
    const hs=streaksFor(state.fixture.home,homeDir),as=streaksFor(state.fixture.away,awayDir);
    panel.innerHTML=`<section class="fx-player-stats-head">${logo?`<img src="${esc(logo)}" alt="">`:''}<div><span>PLAYER STATS · ${esc(state.competition?.season||'TEMPORADA ACTUAL')}</span><h2>${esc(metricDef.label)}</h2><p>Los datos usan PLAYER MASTER 2025+ y CURRENT DELTA prioritario. La API aporta fixture/alineación; TITAN aporta el histórico validado del jugador.</p></div></section><div class="fx-match-player-controls fx-match-player-controls-pro"><div class="fx-match-player-scope"><button class="${scope==='all'?'active':''}" data-match-player-scope="all">Todos</button><button class="${scope==='home'?'active':''}" data-match-player-scope="home">Local</button><button class="${scope==='away'?'active':''}" data-match-player-scope="away">Visita</button></div><label class="fx-match-player-market-picker"><span>MERCADO</span><select id="fxMatchPlayerMetric">${metricOptions}</select></label></div><div class="fx-match-player-grid">${side(state.fixture.home,state.titanHome,home,'LOCAL')}${side(state.fixture.away,state.titanAway,away,'VISITANTE')}</div><section class="fx-match-player-streaks"><div class="fx-section-title"><span>RACHAS DE JUGADORES · HISTÓRICO RECIENTE</span><small>Plantel actual · mínimo 3 consecutivos · tocar abre Player Analyzer en el mismo mercado</small></div><div class="fx-player-streak-grid">${streakSide(state.fixture.home,state.titanHome,hs,'LOCAL')}${streakSide(state.fixture.away,state.titanAway,as,'VISITANTE')}</div></section>`;
    $('fxMatchPlayerMetric')?.addEventListener('change',e=>{state.matchPlayerMetric=e.target.value||'goals';renderPlayers();});
    panel.querySelectorAll('[data-match-player-scope]').forEach(b=>b.onclick=()=>{state.matchPlayerScope=b.dataset.matchPlayerScope;renderPlayers();});
    panel.querySelectorAll('[data-match-player]').forEach(b=>b.onclick=()=>window.INCA_LEAGUE_CENTER?.openPlayer?.(Number(b.dataset.matchPlayer),{competitionId:Number(b.dataset.matchPlayerComp),market:b.dataset.matchPlayerMarket||''}));
    state.playersLoaded=true;
  }catch(err){console.warn('[INCA PLAYERS MATCH]',err);panel.innerHTML=empty('fa-users','Player Stats temporalmente no disponible','La vista queda lista y se llenará con TITAN PLAYERS.');}
}

function playerSide(apiTeam,titanTeam,list){
  return `<article class="fx-player-side">
    <header>${teamVisual({name:apiTeam.name,logo:apiTeam.logo,titan:titanTeam})}<strong>${list.length}</strong></header>
    <div class="fx-player-list">${list.slice(0,30).map(p=>`
      <button data-player="${esc(p.nombre)}"><span><i class="fa-solid fa-user"></i></span><b>${esc(p.nombre)}</b><small>${esc(p.posicion||'Jugador')}</small><i class="fa-solid fa-chevron-right"></i></button>
    `).join('')||'<div class="fx-clean-empty">Plantel histórico no disponible en la base local.</div>'}</div>
  </article>`;
}

/* =========================
   LINEUPS
   ========================= */

async function renderLineups(targetPanel=null){
  const panel=targetPanel||$('fxPanel-lineups');
  if(!panel)return;
  panel.innerHTML='<div class="fx-loading"><span></span> Consultando alineaciones publicadas…</div>';

  const apiFixtureId=Number(state.fixture?.api_fixture_id)||0;
  if(!apiFixtureId){panel.innerHTML=empty('fa-users','Alineaciones por definir','Se mostrarán cuando la información oficial esté disponible.');return;}
  try{
    const data=await apiJSON('lineups',{fixtureId:apiFixtureId},5*60*1000);
    const teams=data?.lineups||[];
    if(!data?.configured||!teams.length){
      panel.innerHTML=empty('fa-people-group','Alineaciones aún no publicadas','Este bloque se completa automáticamente cuando el proveedor publica titulares y suplentes.');
      return;
    }

    panel.innerHTML=`<div class="fx-lineups-grid">${teams.map(l=>`
      <article class="fx-lineup-card">
        <header>${teamVisual({name:l.team?.name,logo:l.team?.logo})}<span>${esc(l.formation||'Formación')}</span></header>
        <div class="fx-lineup-section"><b>TITULARES</b>${(l.startXI||[]).map((x,i)=>`<div><span>${i+1}</span><strong>${esc(x.player?.name||'Jugador')}</strong><small>${esc(x.player?.number||'')}</small></div>`).join('')}</div>
        <div class="fx-lineup-section subs"><b>SUPLENTES</b>${(l.substitutes||[]).map((x,i)=>`<div><span>${i+1}</span><strong>${esc(x.player?.name||'Jugador')}</strong><small>${esc(x.player?.number||'')}</small></div>`).join('')}</div>
      </article>`).join('')}</div>`;
  }catch(_){
    panel.innerHTML=empty('fa-people-group','Alineaciones aún no disponibles','Se consultarán nuevamente al acercarse la hora del partido.');
  }
}

/* =========================
   ODDS — TWO PROVIDERS
   ========================= */

async function renderOdds(targetPanel=null){
  const panel=targetPanel||$('fxPanel-odds');
  if(!panel)return;
  if(!matchHasOddsCoverage()){panel.innerHTML=empty('fa-ban','Sin cobertura de cuotas','Esta competición pertenece a las 5 ligas sin capa de precios. No se consultan ni inventan cuotas.');return;}
  panel.innerHTML='<div class="fx-loading"><span></span> Consultando cuotas disponibles…</div>';

  const apiFixtureId=Number(state.fixture?.api_fixture_id)||0;
  const calls=[
    apiFixtureId?apiJSON('odds',{fixtureId:apiFixtureId},10*60*1000).catch(()=>null):Promise.resolve(null),
    fetchSecondOdds().catch(()=>null)
  ];
  const [footballOdds,secondOdds]=await Promise.all(calls);

  const sourceA=footballOdds?.bookmakers||[];
  const sourceB=secondOdds?.bookmakers||[];

  if(!sourceA.length&&!sourceB.length){
    panel.innerHTML=empty('fa-coins','Cuotas preparadas','Cuando configures al menos un proveedor, aquí aparecerán las cuotas del partido sin cambiar el resto del análisis.');
    return;
  }

  panel.innerHTML=`
    <section class="fx-odds-note">
      <i class="fa-solid fa-circle-info"></i>
      <span>Se priorizan Bet365 o Betano cuando el proveedor realmente los devuelve. Si no están disponibles, se muestran las casas recibidas sin inventar cuotas.</span>
    </section>
    ${sourceA.length?oddsSource('API-FOOTBALL',sourceA):''}
    ${sourceB.length?oddsSource('THE ODDS API',sourceB):''}
  `;
}

async function fetchSecondOdds(){
  const endpoint=CFG().oddsEndpoint||'./api/odds';
  const url=new URL(endpoint,location.href);
  url.searchParams.set('leagueName',state.competition?.apiName||state.competition?.name||'');
  url.searchParams.set('home',state.fixture.home?.name||'');
  url.searchParams.set('away',state.fixture.away?.name||'');
  url.searchParams.set('commenceTime',state.fixture.start_time||'');
  const res=await fetch(url,{cache:'no-store'});
  if(!res.ok)throw new Error('ODDS2');
  return res.json();
}

function oddsSource(title,bookmakers){
  const priority=['bet365','betano','pinnacle','unibet','betfair'];
  const ordered=bookmakers.slice().sort((a,b)=>{
    const aa=priority.findIndex(x=>norm(a.name).includes(x));
    const bb=priority.findIndex(x=>norm(b.name).includes(x));
    return (aa<0?99:aa)-(bb<0?99:bb);
  });

  return `<section class="fx-odds-source">
    <div class="fx-section-title"><span>${esc(title)}</span><small>${ordered.length} casas recibidas</small></div>
    <div class="fx-bookmaker-grid">${ordered.slice(0,12).map(book=>`
      <article class="fx-bookmaker-card">
        <header><b>${esc(book.name)}</b><small>${esc(book.updated||'')}</small></header>
        ${(book.markets||[]).slice(0,5).map(m=>`
          <div class="fx-odds-market"><span>${esc(m.name)}</span>
            <div>${(m.values||[]).slice(0,6).map(v=>`<b><small>${esc(v.value)}</small>${esc(v.odd)}</b>`).join('')}</div>
          </div>`).join('')}
      </article>`).join('')}</div>
  </section>`;
}

/* =========================
   INIT
   ========================= */

function bind(){
  $('fxLeague')?.addEventListener('change',()=>loadFixtures());
  $('fxBackButton')?.addEventListener('click',()=>{let origin='leagues';try{origin=sessionStorage.getItem('inca_match_return')||'leagues';sessionStorage.removeItem('inca_match_return');}catch{}window.INCA_PORTAL_NAV?.show?.(origin==='betlab'?'betlab':'leagues');});
  $('fxRefresh')?.addEventListener('click',()=>{
    state.liveCache.clear(); loadFixtures();
  });
}

async function init(){
  if(state.ready)return;
  if(state.initPromise)return state.initPromise;
  state.initPromise=(async()=>{
    await TITAN()?.ensureReady?.();
    await TITAN()?.ensureTeamDetails?.().catch(()=>[]);
    state.competitions=makeCompetitions();
    renderLeagueSelector();
    bind();
    state.ready=true;
    await loadFixtures();
  })();
  try{return await state.initPromise}finally{state.initPromise=null}
}

function readPendingFocus(){
  try{
    const raw=sessionStorage.getItem('inca_match_focus');
    if(!raw)return null;
    const x=JSON.parse(raw);
    return {eventId:Number(x?.eventId)||0,competitionId:Number(x?.competitionId)||0};
  }catch{return null;}
}
function clearPendingFocus(){try{sessionStorage.removeItem('inca_match_focus');}catch{}}

async function activate(){
  try{
    await init();
    // Si la navegación ocurrió antes de que terminara el handler del click,
    // recuperamos el partido pendiente y lo abrimos igualmente.
    const pending=readPendingFocus();
    if(pending?.eventId)await openFixture(pending);
  }catch(_){
    setMessage('Match Center preparado.');
  }
}

async function openFixture({eventId,competitionId}={}){
  await init();
  const eid=Number(eventId)||0, cid=Number(competitionId)||0;
  if(!eid)return false;
  if(cid){
    const option=state.competitions.find(c=>Number(c.titanId)===cid);
    if(option){
      const sel=$('fxLeague');
      if(sel)sel.value=option.key;
      state.competition=option;
    }
  }
  await loadFixtures({focusEventId:eid});
  const ok=Number(state.fixture?.id)===eid;
  if(ok)clearPendingFocus();
  return ok;
}

window.INCA_MATCH_CENTER=Object.freeze({activate,refresh:loadFixtures,openFixture});
})();