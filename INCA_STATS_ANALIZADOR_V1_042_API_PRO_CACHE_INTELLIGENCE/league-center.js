(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = (v='') => String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num = v => { const n=Number(String(v??'').replace('%','').replace(',','.')); return Number.isFinite(n)?n:null; };
  const sum = xs => xs.reduce((a,b)=>a+(Number(b)||0),0);
  const avg = xs => xs.length?sum(xs)/xs.length:null;
  const fmt1 = v => Number.isFinite(v)?Number(v).toFixed(1):'—';
  const refereeAvatar=(r,cls='ref-avatar')=>{const item=typeof r==='object'?r:window.INCA_REFEREES?.findByName?.(r);const u=window.INCA_REFEREES?.faceUrl?.(item||r)||'';const name=item?.name||String(r||'Árbitro');return `<span class="${cls}">${u?`<img src="${esc(u)}" alt="${esc(name)}" loading="lazy" decoding="async" onerror="this.remove()">`:''}<i class="fa-solid fa-user-tie"></i></span>`;};
  const PE='America/Lima';
  const FALLBACK_NO_ODDS_IDS=new Set([325,390,155,406,242]);
  const hasOddsCoverage=()=>window.INCA_ODDS_POLICY?.hasPriceCoverage?window.INCA_ODDS_POLICY.hasPriceCoverage(state.leagueId):!FALLBACK_NO_ODDS_IDS.has(Number(state.leagueId));

  const state={
    initialized:false, loaded:false, leagueId:null, activeTab:'fixtures', dateFrom:'', dateTo:'',
    teams:[], fixtures:[], odds:[], markets:[], playerprops:[], avgCache:new Map(), refereeCache:new Map(),
    playerMetric:'goals', playerScope:'all', streakMarket:'involvement', streakScope:'all', streakMin:3
  };

  const tabsBase=[
    ['fixtures','fa-calendar-days','Fixtures'],
    ['table','fa-table-list','Tabla & promedios'],
    ['topplayers','fa-ranking-star','Top Players'],
    ['playerstreaks','fa-fire','Player Streaks'],
    ['props','fa-crosshairs','Player Props'],
    ['referees','fa-user-tie','Árbitros']
  ];
  function tabsForLeague(){ return hasOddsCoverage()?tabsBase:tabsBase.filter(x=>x[0]!=='props'); }

  function fmtKick(v,full=true){
    const d=new Date(v); if(Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-PE',{timeZone:PE,...(full?{weekday:'short',day:'2-digit',month:'short'}:{}),hour:'2-digit',minute:'2-digit',hour12:true}).format(d).replaceAll('.','')+(full?' · PE':'');
  }
  function peruDateKey(v){
    const d=v instanceof Date?v:new Date(v); if(Number.isNaN(d.getTime()))return '';
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:PE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const g=t=>p.find(x=>x.type===t)?.value||''; return `${g('year')}-${g('month')}-${g('day')}`;
  }
  function dateLabel(v){
    const d=v instanceof Date?v:new Date(v); if(Number.isNaN(d.getTime()))return '—';
    return new Intl.DateTimeFormat('es-PE',{timeZone:PE,weekday:'long',day:'numeric',month:'long'}).format(d);
  }
  function addDaysKey(key,days){
    const m=String(key||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return '';
    const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])+Number(days||0),12));return d.toISOString().slice(0,10);
  }
  function defaultCalendarRange(){const from=peruDateKey(new Date());return {from,to:addDaysKey(from,14)};}
  function ensureCalendarRange(){
    const d=defaultCalendarRange();if(!state.dateFrom)state.dateFrom=d.from;if(!state.dateTo)state.dateTo=d.to;
    if(state.dateTo<state.dateFrom)state.dateTo=state.dateFrom;
    const max=addDaysKey(state.dateFrom,14);if(state.dateTo>max)state.dateTo=max;
  }
  function rangeDays(){ensureCalendarRange();return Math.max(0,Math.round((Date.parse(state.dateTo+'T12:00:00Z')-Date.parse(state.dateFrom+'T12:00:00Z'))/86400000));}

  async function authJson(url){
    const staticDev=/^(localhost|127\.0\.0\.1)$/i.test(location.hostname) && !/^300\d$/.test(location.port||'');
    if(staticDev) throw new Error('LOCAL_STATIC_API_DISABLED');
    let token=''; try{ const s=await window.INCA_AUTH?.client?.auth?.getSession?.(); token=s?.data?.session?.access_token||''; }catch{}
    const headers={accept:'application/json'}; if(token) headers.Authorization=`Bearer ${token}`;
    const r=await fetch(url,{cache:'default',headers}); if(!r.ok)throw new Error(`HTTP_${r.status}`); return r.json();
  }

  function curated(){ return window.INCA_TITAN?.CURATED_COMPETITIONS||[]; }
  function leagueDef(){ return curated().find(x=>Number(x.id)===Number(state.leagueId))||null; }
  function currentSeasonId(){
    const fx=state.fixtures.find(x=>Number(x.sofascore_competition_id)===Number(state.leagueId)&&Number(x.season_id));
    if(fx) return Number(fx.season_id);
    const seasons=(window.INCA_TITAN?.getCatalog?.()?.seasons||[]).filter(s=>Number(s.competition_id)===Number(state.leagueId));
    return Number(seasons.sort((a,b)=>Number(b.season_status==='CURRENT')-Number(a.season_status==='CURRENT')||(Number(b.start_year)||0)-(Number(a.start_year)||0))[0]?.season_id)||0;
  }
  function currentSeasonName(){
    const fx=state.fixtures.find(x=>Number(x.sofascore_competition_id)===Number(state.leagueId)&&x.season_name); return fx?.season_name||'Temporada vigente';
  }

  function normalizeTeams(){
    const api=state.teams.filter(x=>Number(x.sofascore_competition_id)===Number(state.leagueId)&&x.is_current!==false).map(x=>({
      id:Number(x.sofascore_team_id), name:x.team_name, logo:x.team_logo||window.INCA_TITAN?.logoUrl?.(x.team_name,x.sofascore_team_id)||'', competitionId:Number(x.sofascore_competition_id)
    }));
    if(api.length) return api;
    const s=currentSeasonId();
    const titan=(window.INCA_TITAN?.teamsForCompetitionSeason?.(state.leagueId,s)||[]).map(x=>({id:Number(x.team_id),name:x.name,logo:window.INCA_TITAN?.logoUrl?.(x.name,x.team_id)||'',competitionId:Number(state.leagueId)}));
    if(titan.length)return titan;
    const map=new Map();
    for(const f of state.fixtures.filter(x=>Number(x.sofascore_competition_id)===Number(state.leagueId))){
      const pairs=[[f.home_sofascore_team_id,f.home_team_name,f.home_logo],[f.away_sofascore_team_id,f.away_team_name,f.away_logo]];
      for(const [id,name,logo] of pairs){if(Number(id)&&name&&!map.has(Number(id)))map.set(Number(id),{id:Number(id),name,logo:logo||window.INCA_TITAN?.logoUrl?.(name,id)||'',competitionId:Number(state.leagueId)});}
    }
    return [...map.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'es'));
  }
  function rowsTeams(){ return normalizeTeams(); }
  function rowsFixtures(){
    ensureCalendarRange();
    return state.fixtures.filter(x=>{
      if(Number(x.sofascore_competition_id)!==Number(state.leagueId))return false;
      const key=peruDateKey(x.kickoff_utc);return key>=state.dateFrom&&key<=state.dateTo;
    }).sort((a,b)=>new Date(a.kickoff_utc)-new Date(b.kickoff_utc));
  }
  function allLeagueFixtures(){ return state.fixtures.filter(x=>Number(x.sofascore_competition_id)===Number(state.leagueId)).sort((a,b)=>new Date(a.kickoff_utc)-new Date(b.kickoff_utc)); }

  async function load(){
    if(state.loaded)return; state.loaded=true;
    const[a,c,d,e]=await Promise.all([
      authJson('./api/football-cache?action=teams').catch(()=>({teams:[]})),
      authJson('./api/football-cache?action=odds&hours=336').catch(()=>({odds:[]})),
      authJson('./api/football-cache?action=markets').catch(()=>({markets:[]})),
      authJson('./api/football-cache?action=playerprops&hours=336').catch(()=>({playerprops:[]}))
    ]);
    state.teams=a?.teams||[]; state.odds=c?.odds||[]; state.markets=d?.markets||[]; state.playerprops=e?.playerprops||[];
    try{
      const fx=window.INCA_FIXTURES; await fx?.ensureReady?.();
      state.fixtures=(fx?.upcoming?.({from:Date.now()-86400000,to:Date.now()+14*86400000})||[]).map(fx.toCacheFixture);
    }catch{
      try{ const b=await authJson('./api/football-cache?action=fixtures&hours=336'); state.fixtures=b?.fixtures||[]; }catch{state.fixtures=[];}
    }
  }

  function populateLeague(){
    const s=$('leagueHubLeague'); if(!s)return; const defs=curated();
    s.innerHTML=defs.map(x=>`<option value="${x.id}">${esc(x.country)} · ${esc(x.name)}</option>`).join('');
    if(!state.leagueId)state.leagueId=Number(defs[0]?.id||17); s.value=String(state.leagueId);
  }

  function renderHero(){
    const d=leagueDef(), logo=window.INCA_TITAN?.competitionLogoUrl?.(state.leagueId)||'';
    const title=$('leagueHubTitle'), meta=$('leagueHubMeta');
    if(title)title.textContent=d?.name||'Centro de Liga';
    if(meta)meta.textContent=d?`${d.country} · ${currentSeasonName()} · SOLO LIGA · TEMPORADA ACTUAL`:'Selecciona una liga';
    const box=document.querySelector('.league-hub-head');
    if(!box)return;
    let badge=box.querySelector('.league-hub-brand');
    if(!badge){badge=document.createElement('div');badge.className='league-hub-brand';box.firstElementChild?.prepend(badge);}
    badge.innerHTML=`${logo?`<img src="${esc(logo)}" alt="">`:'<i class="fa-solid fa-trophy"></i>'}<span><b>${esc(d?.country||'INCA')}</b><small>LEAGUE CENTER PRO</small></span>`;
    let rail=box.querySelector('.league-hub-hero-rail');
    if(!rail){rail=document.createElement('div');rail.className='league-hub-hero-rail';box.firstElementChild?.appendChild(rail);}
    const fs=allLeagueFixtures(), next=fs.find(f=>new Date(f.kickoff_utc).getTime()>=Date.now()-3600000), teams=rowsTeams();
    rail.innerHTML=`<span><i class="fa-solid fa-users"></i><b>${teams.length||'—'}</b><small>equipos</small></span><span><i class="fa-solid fa-calendar-check"></i><b>${fs.length}</b><small>partidos cargados</small></span><span><i class="fa-solid fa-bolt"></i><b>${next?fmtKick(next.kickoff_utc,false):'—'}</b><small>próximo kickoff</small></span><span class="${hasOddsCoverage()?'coverage-on':'coverage-off'}"><i class="fa-solid ${hasOddsCoverage()?'fa-coins':'fa-ban'}"></i><b>${hasOddsCoverage()?'CUOTAS':'SIN'}</b><small>${hasOddsCoverage()?'capa habilitada':'cuotas en esta liga'}</small></span>`;
  }

  function renderTabs(){
    const h=$('leagueHubTabs'); if(!h)return;
    const tabs=tabsForLeague();
    if(!tabs.some(x=>x[0]===state.activeTab))state.activeTab='fixtures';
    h.style.setProperty('--league-tabs',String(tabs.length));
    h.innerHTML=tabs.map(([k,icon,label])=>`<button class="league-hub-tab ${k===state.activeTab?'active':''}" data-league-tab="${k}" type="button"><i class="fa-solid ${icon}"></i><span>${esc(label)}</span>${k==='props'?'<small>CUOTAS REALES</small>':''}</button>`).join('');
    h.querySelectorAll('[data-league-tab]').forEach(b=>b.onclick=()=>{state.activeTab=b.dataset.leagueTab;renderTabs();render();});
  }

  function bestH2H(fid,name){
    const rs=state.odds.filter(x=>Number(x.fixture_id)===Number(fid)&&['h2h','h2h_3_way'].includes(x.market_key)&&String(x.outcome_name||'').toLowerCase()===String(name||'').toLowerCase());
    return rs.sort((a,b)=>Number(b.price)-Number(a.price))[0]||null;
  }
  function drawOdd(fid){
    const rs=state.odds.filter(x=>Number(x.fixture_id)===Number(fid)&&['h2h','h2h_3_way'].includes(x.market_key)&&['draw','empate','x'].includes(String(x.outcome_name||'').toLowerCase()));
    return rs.sort((a,b)=>Number(b.price)-Number(a.price))[0]||null;
  }
  function statusLabel(f){
    const s=String(f.status_type||'notstarted').toLowerCase();
    return s==='postponed'?'APLAZADO':s==='suspended'?'SUSPENDIDO':s==='cancelled'?'CANCELADO':s==='inprogress'?'EN JUEGO':'PROGRAMADO';
  }

  function dayPicker(){
    ensureCalendarRange();
    const count=rowsFixtures().length,days=rangeDays()+1;
    return `<div class="league-calendar-pro">
      <div class="league-calendar-copy"><i class="fa-regular fa-calendar"></i><div><span>AGENDA</span><strong>Calendario</strong><small>Hora Perú · máximo 14 días</small></div></div>
      <label class="league-calendar-field"><span>DESDE</span><input id="leagueDateFrom" type="date" value="${esc(state.dateFrom)}"></label>
      <i class="fa-solid fa-arrow-right league-calendar-arrow"></i>
      <label class="league-calendar-field"><span>HASTA</span><input id="leagueDateTo" type="date" min="${esc(state.dateFrom)}" max="${esc(addDaysKey(state.dateFrom,14))}" value="${esc(state.dateTo)}"></label>
      <div class="league-calendar-actions"><button type="button" data-calendar-today>HOY</button><button type="button" data-calendar-14>14 DÍAS</button></div>
      <div class="league-calendar-result"><b>${count}</b><span>partidos</span><small>${days} día${days===1?'':'s'}</small></div>
    </div>`;
  }

  function fixtureCard(f){
    const coverage=hasOddsCoverage();
    const ho=coverage?bestH2H(f.fixture_id,f.home_team_name):null, ao=coverage?bestH2H(f.fixture_id,f.away_team_name):null, dr=coverage?drawOdd(f.fixture_id):null;
    const homeLogo=f.home_logo||window.INCA_TITAN?.logoUrl?.(f.home_team_name,f.home_sofascore_team_id)||'';
    const awayLogo=f.away_logo||window.INCA_TITAN?.logoUrl?.(f.away_team_name,f.away_sofascore_team_id)||'';
    const s=String(f.status_type||'notstarted').toLowerCase();
    const odds=coverage?`<div class="league-fixture-odds ${ho||dr||ao?'has-odds':''}"><span><small>1</small><b>${ho?Number(ho.price).toFixed(2):'—'}</b></span><span><small>X</small><b>${dr?Number(dr.price).toFixed(2):'—'}</b></span><span><small>2</small><b>${ao?Number(ao.price).toFixed(2):'—'}</b></span></div>`:`<div class="league-fixture-no-odds"><i class="fa-solid fa-ban"></i><span><b>SIN CUOTAS</b><small>Fuera de cobertura</small></span></div>`;
    return `<article class="league-fixture-pro-card ${esc(s)} ${coverage?'':'no-odds-coverage'}" data-open-fixture="${Number(f.sofascore_event_id||f.fixture_id)||0}" data-open-comp="${Number(f.sofascore_competition_id||state.leagueId)||0}" tabindex="0" role="button">
      <div class="league-fixture-status"><span class="${esc(s)}">${esc(statusLabel(f))}</span><small>${f.round?`JORNADA ${esc(f.round)}`:'JORNADA —'}</small></div>
      <div class="league-fixture-matchup"><div class="league-fixture-club home"><div class="league-club-logo">${homeLogo?`<img src="${esc(homeLogo)}" alt="">`:'<i class="fa-solid fa-shield"></i>'}</div><div><strong>${esc(f.home_team_name)}</strong><small>LOCAL</small></div></div><div class="league-fixture-time"><b>${esc(fmtKick(f.kickoff_utc,false))}</b><span>VS</span><small>${esc(dateLabel(f.kickoff_utc))}</small></div><div class="league-fixture-club away"><div class="league-club-logo">${awayLogo?`<img src="${esc(awayLogo)}" alt="">`:'<i class="fa-solid fa-shield"></i>'}</div><div><strong>${esc(f.away_team_name)}</strong><small>VISITANTE</small></div></div></div>
      <div class="league-fixture-side"><div class="league-fixture-ref"><i class="fa-solid fa-user-tie"></i><span><small>ÁRBITRO</small><b>${esc(f.referee||'Por definir')}</b></span></div><div class="league-fixture-venue"><i class="fa-solid fa-location-dot"></i><span><small>ESTADIO</small><b>${esc(f.venue||'Por confirmar')}</b></span></div></div>
      ${odds}<div class="league-fixture-open"><span>ABRIR ANÁLISIS</span><i class="fa-solid fa-arrow-right"></i></div>
    </article>`;
  }

  function renderFixtures(){
    const fs=rowsFixtures(), picker=dayPicker();
    if(!fs.length)return picker+`<div class="league-pro-empty"><i class="fa-regular fa-calendar-xmark"></i><strong>Sin partidos para este día</strong><span>Ajusta el rango del calendario. La agenda admite hasta 14 días.</span></div>`;
    const groups=new Map(); for(const f of fs){const k=peruDateKey(f.kickoff_utc); if(!groups.has(k))groups.set(k,[]); groups.get(k).push(f);}
    const content=[...groups.entries()].map(([k,rows])=>`<section class="league-fixture-day"><header><div><span>${esc(k)}</span><h3>${esc(dateLabel(rows[0].kickoff_utc))}</h3></div><b>${rows.length} partido${rows.length===1?'':'s'}</b></header><div class="league-fixture-stack">${rows.map(fixtureCard).join('')}</div></section>`).join('');
    return picker+`<div class="league-section-intro"><div><span>PARTIDOS</span><h2>Próximos partidos</h2><p>Solo liga. Toca cualquier encuentro para abrir su análisis completo.</p></div><div class="league-source-badge"><i class="fa-solid fa-database"></i><b>AGENDA DE PARTIDOS</b><small>carga instantánea</small></div></div>${content}`;
  }

  function value(row,keys){ for(const k of keys){const v=row?.[k]; if(v!==undefined&&v!==null&&v!==''){const n=num(v); if(Number.isFinite(n))return n;}} return null; }
  function avgRows(rows,keys){const v=rows.map(r=>value(r,keys)).filter(Number.isFinite);return v.length?avg(v):null;}

  async function teamSeasonStats(t,seasonId){
    const key=`${t.id}|${state.leagueId}|${seasonId}`; if(state.avgCache.has(key)) return state.avgCache.get(key);
    const promise=(async()=>{
      try{
        const h=await window.INCA_TITAN.loadTeamHistory(Number(t.id));
        const currentRows=(h.rows||[]).filter(r=>Number(r.Competition_ID)===Number(state.leagueId)&&String(r.Tiempo||'').toUpperCase()==='ALL'&&(!seasonId||Number(r.Season_ID)===Number(seasonId)));
        // V57: Centro de Ligas = temporada ACTUAL solamente. Si aún no empezó,
        // los promedios quedan vacíos/0; jamás se rellenan con la campaña anterior.
        const averageRows=currentRows;
        let w=0,d=0,l=0,gf=0,ga=0;
        for(const r of currentRows){
          const opp=(h.allRows||[]).find(x=>String(x.Event_ID)===String(r.Event_ID)&&String(x.Tiempo||'').toUpperCase()==='ALL'&&Number(x.Team_ID)!==Number(t.id));
          const a=value(r,['Goles','Goals']), b=value(opp,['Goles','Goals']);
          if(Number.isFinite(a)&&Number.isFinite(b)){gf+=a;ga+=b;if(a>b)w++;else if(a===b)d++;else l++;}
        }
        const cards=averageRows.map(r=>{const y=value(r,['Yellow cards','Tarjetas Amarillas']), rr=value(r,['Red cards','Tarjetas Rojas']);return Number.isFinite(y)||Number.isFinite(rr)?(y||0)+(rr||0):null}).filter(Number.isFinite);
        return {team:t,pj:currentRows.length,w,d,l,gf,ga,gd:gf-ga,pts:w*3+d,goals:avgRows(averageRows,['Goles','Goals']),corners:avgRows(averageRows,['Corner kicks','Córners','Corners']),shots:avgRows(averageRows,['Total shots','Tiros Totales']),sot:avgRows(averageRows,['Shots on target','Tiros a Puerta']),fouls:avgRows(averageRows,['Fouls','Faltas']),cards:cards.length?avg(cards):null,seasonFallback:seasonId};
      }catch{return {team:t,pj:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,pts:0};}
    })();
    state.avgCache.set(key,promise); return promise;
  }

  function seasonTeamName(row, fallback=''){
    return String(row?.Original_Team_Name||fallback||'').trim();
  }

  function buildCurrentSeasonStats(data, rosterTeams=[]){
    const visual=new Map(rowsTeams().map(t=>[Number(t.id),t]));
    const table=new Map();
    const ensure=(id,name='')=>{
      id=Number(id)||0;if(!id)return null;
      if(!table.has(id)){
        const v=visual.get(id)||{};
        table.set(id,{team:{id,name:name||v.name||`Equipo ${id}`,logo:v.logo||window.INCA_TITAN?.logoUrl?.(name||v.name||'',id)||'',competitionId:Number(state.leagueId)},pj:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,pts:0,_goals:[],_corners:[],_shots:[],_sot:[],_fouls:[],_cards:[]});
      }else if(name&&!table.get(id).team.name)table.get(id).team.name=name;
      return table.get(id);
    };
    for(const t of rosterTeams||[])ensure(t.team_id||t.id,t.name||t.team_name||'');
    for(const t of rowsTeams())ensure(t.id,t.name);
    const all=(data||[]).filter(r=>String(r?.Tiempo||'').toUpperCase()==='ALL');
    const byEvent=new Map();
    for(const r of all){
      const id=Number(r.Team_ID)||0,event=String(r.Event_ID||r.ID_Partido||'').trim();if(!id||!event)continue;
      const st=ensure(id,seasonTeamName(r));
      if(!byEvent.has(event))byEvent.set(event,[]);byEvent.get(event).push(r);
      const push=(arr,keys)=>{const v=value(r,keys);if(Number.isFinite(v))arr.push(v);};
      push(st._goals,['Goles','Goals']);push(st._corners,['Corner kicks','Córners','Corners']);push(st._shots,['Total shots','Tiros Totales']);push(st._sot,['Shots on target','Tiros a Puerta']);push(st._fouls,['Fouls','Faltas']);
      const y=value(r,['Yellow cards','Tarjetas Amarillas']),rr=value(r,['Red cards','Tarjetas Rojas']);if(Number.isFinite(y)||Number.isFinite(rr))st._cards.push((y||0)+(rr||0));
    }
    for(const rows of byEvent.values()){
      const uniq=[...new Map(rows.map(r=>[Number(r.Team_ID),r])).values()];if(uniq.length<2)continue;
      const a=uniq[0],b=uniq.find(r=>Number(r.Team_ID)!==Number(a.Team_ID));if(!b)continue;
      const ag=value(a,['Goles','Goals']),bg=value(b,['Goles','Goals']);if(!Number.isFinite(ag)||!Number.isFinite(bg))continue;
      const A=ensure(a.Team_ID,seasonTeamName(a)),B=ensure(b.Team_ID,seasonTeamName(b));
      A.pj++;B.pj++;A.gf+=ag;A.ga+=bg;B.gf+=bg;B.ga+=ag;
      if(ag>bg){A.w++;B.l++;A.pts+=3;}else if(ag<bg){B.w++;A.l++;B.pts+=3;}else{A.d++;B.d++;A.pts++;B.pts++;}
    }
    return [...table.values()].map(x=>{x.gd=x.gf-x.ga;const out={...x,goals:avg(x._goals),corners:avg(x._corners),shots:avg(x._shots),sot:avg(x._sot),fouls:avg(x._fouls),cards:avg(x._cards)};delete out._goals;delete out._corners;delete out._shots;delete out._sot;delete out._fouls;delete out._cards;return out;});
  }

  async function currentSeasonDatasetStats(season){
    try{
      await window.INCA_TITAN?.mergeCurrentSeasonsFromFixtures?.({refreshSelectors:false});
      const ds=await window.INCA_TITAN?.loadCompetitionSeason?.(`TITAN_C${Number(state.leagueId)}`,`TITAN_S${Number(season)}`);
      const stats=buildCurrentSeasonStats(ds?.data||[],ds?.rosterTeams||[]);
      if(stats.length)return {stats,rows:(ds?.data||[]).length,source:'TITAN CURRENT DATASET'};
    }catch(e){console.warn('[INCA LEAGUES V1.023] dataset CURRENT no disponible; fallback por equipo',e?.message||e);}
    return {stats:[],rows:0,source:'FALLBACK'};
  }

  async function renderTable(){
    const teams=rowsTeams(), season=currentSeasonId();
    if(!teams.length)return `<div class="league-pro-empty"><i class="fa-solid fa-table-list"></i><strong>Catálogo de equipos no disponible</strong><span>TITAN no devolvió equipos para esta temporada.</span></div>`;
    let pack=await currentSeasonDatasetStats(season), stats=pack.stats;
    if(!stats.length||!stats.some(x=>x.pj>0)){
      const legacy=await Promise.all(teams.map(t=>teamSeasonStats(t,season)));
      if(legacy.some(x=>x.pj>0)||!stats.length)stats=legacy;
    }
    const table=stats.slice().sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||String(a.team.name).localeCompare(String(b.team.name),'es'));
    const hasPlayed=table.some(x=>x.pj>0);
    return `<div class="league-section-intro"><div><span>LEAGUE TABLE</span><h2>Tabla & promedios de equipo</h2><p>${hasPlayed?'Calculada con los partidos ya extraídos de la campaña vigente en TITAN.':'Todavía no se pudieron leer partidos finalizados de esta campaña en el master de equipos. No se recicla la temporada anterior.'}</p></div><div class="league-source-badge"><i class="fa-solid fa-chart-line"></i><b>${esc(currentSeasonName())}</b><small>${table.length} equipos · CURRENT</small></div></div>
      <div class="league-table-shell"><table class="league-pro-table standings"><thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th>PTS</th></tr></thead><tbody>${table.map((x,i)=>`<tr><td><b>${i+1}</b></td><td><button class="league-team-link" data-ti-team="${x.team.id}" data-ti-comp="${state.leagueId}">${x.team.logo?`<img src="${esc(x.team.logo)}" alt="">`:''}<strong>${esc(x.team.name)}</strong></button></td><td>${x.pj}</td><td>${x.w}</td><td>${x.d}</td><td>${x.l}</td><td>${x.gf}</td><td>${x.ga}</td><td>${x.gd>0?'+':''}${x.gd}</td><td><strong>${x.pts}</strong></td></tr>`).join('')}</tbody></table></div>
      <div class="league-section-subhead"><div><span>TEAM AVERAGES</span><h3>Promedios por partido</h3></div><small>ALL · temporada actual · sin mezclar campañas</small></div>
      <div class="league-table-shell"><table class="league-pro-table averages"><thead><tr><th>Equipo</th><th>Goles</th><th>Córners</th><th>Tiros</th><th>A puerta</th><th>Faltas</th><th>Tarjetas</th><th></th></tr></thead><tbody>${table.map(x=>`<tr><td><button class="league-team-link" data-ti-team="${x.team.id}" data-ti-comp="${state.leagueId}">${x.team.logo?`<img src="${esc(x.team.logo)}" alt="">`:''}<strong>${esc(x.team.name)}</strong></button></td><td>${fmt1(x.goals)}</td><td>${fmt1(x.corners)}</td><td>${fmt1(x.shots)}</td><td>${fmt1(x.sot)}</td><td>${fmt1(x.fouls)}</td><td>${fmt1(x.cards)}</td><td><button class="league-mini-action" data-ti-team="${x.team.id}" data-ti-comp="${state.leagueId}">TEAM INTEL <i class="fa-solid fa-arrow-up-right-from-square"></i></button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function playerSeasonId(){
    // V22.2: TITAN_PLAYERS_CURRENT manda para jugadores de campaña vigente.
    return Number(window.INCA_PLAYERS?.currentSeasonIdForLeague?.(state.leagueId))||Number(currentSeasonId())||0;
  }
  function playerSeasonLabel(seasonId){
    const p=window.INCA_PLAYERS; const r=(p?.rowsForLeague?.(state.leagueId,null)||[]).find(x=>Number(x.Season_ID)===Number(seasonId)); return r?.Season||currentSeasonName();
  }

  async function ensurePlayers(mode='history'){
    try{
      if(mode==='current')await window.INCA_PLAYERS?.ensureCurrentReady?.();
      else await window.INCA_PLAYERS?.ensureReady?.();
      return true;
    }catch(e){console.warn('[INCA LEAGUES] players no disponible',mode,e?.message||e);return false;}
  }
  function playerFace(id){ const pid=Number(id)||0;return window.INCA_PLAYERS?.faceUrl?.(pid)||`./img/${pid}.png`; }
  function playerAvatar(id, extra=''){
    const pid=Number(id)||0,primary=playerFace(pid),fallback=`./img/${pid}.png`;
    return `<span class="inca-player-avatar ${esc(extra)}"><img src="${esc(primary)}" data-fallback="${esc(fallback)}" onerror="if(this.dataset.fallback&&this.src!==new URL(this.dataset.fallback,location.href).href){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.hidden=true;this.nextElementSibling.hidden=false}" alt="" loading="lazy" decoding="async"><i class="fa-solid fa-user-secret" hidden></i></span>`;
  }
  function modalMarketFromStreak(market){
    return ({
      involvement:'involvement',goal:'goal',assist:'assist',sot:'sot05',sot2:'sot15',
      shots2:'shots15',shots3:'shots25',card:'card',foul:'foul05',fouls2:'foul15',
      fouled:'fouled05',fouled2:'fouled15',tackle:'tackle05',tackles2:'tackle15',offside:'off05'
    })[String(market||'')]||'';
  }
  function modalPrimaryMetric(market){
    const key=String(market||'');
    if(key==='involvement')return {label:'G + A',value:r=>(num(r.Goles)||0)+(num(r.Asistencias)||0)};
    if(key==='goal')return {label:'Goles',value:r=>num(r.Goles)||0};
    if(key==='assist')return {label:'Asistencias',value:r=>num(r.Asistencias)||0};
    if(key.startsWith('sot'))return {label:'Tiros a puerta',value:r=>num(r.Tiros_Al_Arco)||0};
    if(key.startsWith('shots'))return {label:'Tiros',value:r=>num(r.Tiros_Totales)||0};
    if(key==='card')return {label:'Tarjetas',value:r=>num(r.Tarjetas)||0};
    if(key.startsWith('fouled'))return {label:'Faltas recibidas',value:r=>num(r.Faltas_Recibidas)||0};
    if(key.startsWith('foul'))return {label:'Faltas',value:r=>num(r.Faltas_Cometidas)||0};
    if(key.startsWith('tackle'))return {label:'Tackles',value:r=>num(r.Entradas_Tackles)||0};
    if(key.startsWith('off'))return {label:'Offsides',value:r=>num(r.Offsides)||0};
    return {label:'Valor',value:()=>0};
  }

  async function renderTopPlayers(){
    if(!(await ensurePlayers('current')))return playerPending('TOP PLAYERS','No se pudo cargar TITAN_PLAYERS_CURRENT de la campaña vigente.');
    const p=window.INCA_PLAYERS, season=playerSeasonId(), metrics=p.METRICS, teamNames=rowsTeams().map(t=>t.name);
    let rows=p.topPlayers(state.leagueId,{seasonId:season,metric:state.playerMetric,scope:state.playerScope,limit:80,minMinutes:0});
    const currentHasStats=rows.some(x=>x.apps>0);
    const seasonLabel=p.currentSeasonLabelForLeague?.(state.leagueId)||currentSeasonName();
    const playerInfo=p.info?.()||{};
    if(!rows.length){
      rows=(p.directoryForTeams?.(teamNames)||[]).map(x=>({...x,rows:[],apps:0,starts:0,minutes:0,total:0,per90:0,rating:0})).slice(0,120);
    }
    const buttons=Object.entries(metrics).filter(([k])=>['goals','assists','involvements','cards','shots','sot','fouls','fouled','tackles','offsides'].includes(k)).map(([k,v])=>`<button class="league-metric-chip ${state.playerMetric===k?'active':''}" data-player-metric="${k}">${esc(v.label)}</button>`).join('');
    const logo=window.INCA_TITAN?.competitionLogoUrl?.(state.leagueId)||'';
    return `<div class="league-section-intro league-player-intro"><div class="league-title-with-logo">${logo?`<img src="${esc(logo)}" alt="">`:''}<div><span>PLAYER STATS · TEMPORADA ACTUAL</span><h2>Top Players</h2><p>${currentHasStats?'Estadísticas por partido de la base unificada de jugadores para la temporada seleccionada.':'La temporada todavía no tiene estadísticas de jugadores: todos comienzan en 0. No se recicla la campaña anterior.'}</p></div></div><div class="league-source-badge players"><i class="fa-solid fa-user-group"></i><b>${esc(seasonLabel)}</b><small>${currentHasStats?`${rows.reduce((s,x)=>s+(x.apps||0),0)} actuaciones · TITAN PLAYERS CURRENT`:playerInfo.currentRows?'sin partidos de esta campaña':'0 stats todavía'}</small></div></div>
      <div class="league-player-toolbar"><div class="league-scope-toggle"><button class="${state.playerScope==='all'?'active':''}" data-player-scope="all">Todos</button><button class="${state.playerScope==='home'?'active':''}" data-player-scope="home">Local</button><button class="${state.playerScope==='away'?'active':''}" data-player-scope="away">Visita</button></div><div class="league-metric-scroll">${buttons}</div></div>
      <div class="league-player-grid">${rows.slice(0,12).map((x,i)=>`<button class="league-player-card" data-open-player="${x.id}"><span class="rank">${i+1}</span>${playerAvatar(x.id,'card')}<div class="identity"><strong>${esc(x.name)}</strong><small>${esc(x.team)} · ${esc(x.position||'—')}</small></div><div class="stat"><b>${state.playerMetric==='rating'?fmt1(x.rating):fmt1(x.total)}</b><small>TOTAL</small></div><div class="stat secondary"><b>${fmt1(x.per90)}</b><small>PER 90</small></div><i class="fa-solid fa-chevron-right"></i></button>`).join('')}</div>
      <div class="league-table-shell"><table class="league-pro-table players"><thead><tr><th>#</th><th>Jugador</th><th>Equipo</th><th>PJ</th><th>Titular</th><th>Min</th><th>Total</th><th>Per 90</th></tr></thead><tbody>${rows.map((x,i)=>`<tr data-open-player="${x.id}" class="clickable"><td>${i+1}</td><td><div class="league-player-cell">${playerAvatar(x.id,'table')}<strong>${esc(x.name)}</strong></div></td><td>${esc(x.team)}</td><td>${x.apps||0}</td><td>${x.starts||0}</td><td>${Math.round(x.minutes||0)}</td><td><strong>${fmt1(x.total||0)}</strong></td><td>${fmt1(x.per90||0)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function renderPlayerStreaks(){
    if(!(await ensurePlayers()))return playerPending('PLAYER STREAKS','El módulo está preparado para leer rachas del master consolidado.');
    await window.INCA_PLAYERS?.ensureCurrentReady?.().catch(()=>null);
    const p=window.INCA_PLAYERS, mk=p.STREAK_MARKETS;
    const currentTeams=rowsTeams();
    const directory=p.directoryForTeams?.(currentTeams.map(t=>t.name))||[];
    const currentById=new Map(directory.map(x=>[Number(x.id),x]));
    const playerIds=directory.map(x=>x.id);
    const raw=p.playerStreaksForIds?.(playerIds,{market:state.streakMarket,scope:state.streakScope,min:state.streakMin,limit:100,competitionId:null})||[];
    const rows=raw.map(x=>{const cur=currentById.get(Number(x.id));return {...x,team:cur?.team||x.team,teamId:Number(cur?.teamId)||Number(x.teamId)||0,position:cur?.position||x.position};});
    const fixtures=allLeagueFixtures().filter(f=>new Date(f.kickoff_utc).getTime()>=Date.now()-3600000);
    const logo=window.INCA_TITAN?.competitionLogoUrl?.(state.leagueId)||'';
    const selectedMarketLabel=mk?.[state.streakMarket]?.label||'Rachas recientes';
    return `<div class="league-section-intro league-player-intro league-streak-intro"><div class="league-title-with-logo">${logo?`<img src="${esc(logo)}" alt="">`:''}<div><span>PLAYER STREAKS · PLANTEL ACTUAL</span><h2>${esc(selectedMarketLabel)}</h2><p>Rachas reales del PLAYER MASTER 2025+ con CURRENT DELTA prioritario, enlazadas al club actual. Toca una tarjeta y el Player Analyzer abre directamente en este mismo mercado.</p></div></div><div class="league-source-badge fire"><i class="fa-solid fa-fire"></i><b>${rows.length}</b><small>rachas ≥ ${state.streakMin}</small></div></div>
      <div class="league-streak-controls league-streak-controls-pro"><div class="league-scope-toggle"><button class="${state.streakScope==='all'?'active':''}" data-streak-scope="all">Todos</button><button class="${state.streakScope==='home'?'active':''}" data-streak-scope="home">Local</button><button class="${state.streakScope==='away'?'active':''}" data-streak-scope="away">Visita</button></div><label><span>Mercado</span><select id="leagueStreakMarket">${Object.entries(mk).map(([k,v])=>`<option value="${k}" ${k===state.streakMarket?'selected':''}>${esc(v.label)}</option>`).join('')}</select></label><label><span>Racha mínima</span><select id="leagueStreakMin"><option ${state.streakMin===3?'selected':''}>3</option><option ${state.streakMin===4?'selected':''}>4</option><option ${state.streakMin===5?'selected':''}>5</option></select></label></div>
      ${rows.length?`<div class="league-streak-list league-streak-list-pro">${rows.map(x=>{const next=fixtures.find(f=>Number(f.home_sofascore_team_id)===Number(x.teamId)||Number(f.away_sofascore_team_id)===Number(x.teamId));const isHome=!!(next&&Number(next.home_sofascore_team_id)===Number(x.teamId)),opp=next?(isHome?next.away_team_name:next.home_team_name):'';return `<button class="league-streak-row league-streak-row-pro" data-open-player="${x.id}" data-open-market="${esc(x.market||state.streakMarket)}"><div class="league-streak-card-top"><div class="league-player-cell">${playerAvatar(x.id,'streak')}<span><strong>${esc(x.name)}</strong><small>${esc(x.team||'Club actual')}</small></span></div><span class="league-streak-count"><b>${x.streak}</b><small>PARTIDOS</small></span></div><div class="streak-copy"><small>MERCADO</small><b>${esc(x.marketLabel||selectedMarketLabel)}</b><span>racha activa · mínimo ${state.streakMin}</span></div><div class="streak-sequence" aria-label="Secuencia reciente">${x.sequence.map(v=>`<i class="hit">${esc(v)}</i>`).join('')}</div><div class="streak-next"><span class="streak-next-kicker">PRÓXIMO</span>${next?`<em class="streak-next-role ${isHome?'home':'away'}">${isHome?'LOCAL':'VISITA'}</em><b>${esc(opp)}</b><time>${esc(fmtKick(next.kickoff_utc))}</time>`:`<b>Sin fixture cercano</b><time>—</time>`}</div><span class="league-streak-open">ABRIR <i class="fa-solid fa-arrow-right"></i></span></button>`;}).join('')}</div>`:`<div class="league-pro-empty"><i class="fa-solid fa-fire-flame-curved"></i><strong>Sin rachas que superen este filtro</strong><span>${directory.length?'Hay plantel identificado, pero ningún jugador cumple la racha mínima/mercado seleccionado.':'Todavía no identificamos el plantel actual de esta liga en TITAN PLAYERS.'}</span></div>`}`;
  }

  function playerPending(title,text){return `<div class="league-section-intro"><div><span>DATOS DE JUGADORES</span><h2>${esc(title)}</h2><p>${esc(text)}</p></div></div><div class="league-pro-empty"><i class="fa-solid fa-database"></i><strong>Conector listo</strong><span>Esta vista se completará cuando el plantel y sus registros estén disponibles.</span></div>`;}

  function renderProps(){
    if(!hasOddsCoverage())return `<div class="league-section-intro"><div><span>PLAYER PROPS</span><h2>Sin cobertura de cuotas</h2><p>Esta liga forma parte de las 5 competiciones sin capa de precios. Fixtures, jugadores, rachas y árbitros siguen disponibles.</p></div></div><div class="league-pro-empty"><i class="fa-solid fa-ban"></i><strong>No se muestran cuotas en esta liga</strong><span>INCA no inventa precios ni usa una casa no cubierta.</span></div>`;
    const fs=rowsFixtures(), ids=new Set(fs.map(x=>Number(x.fixture_id))), rows=state.playerprops.filter(x=>ids.has(Number(x.fixture_id)));
    const best=new Map(); for(const r of rows){const k=`${r.fixture_id}|${r.market_key}|${r.player_name}|${r.direction||r.outcome_name}|${r.point??''}`;const old=best.get(k);if(!old||Number(r.price)>Number(old.price))best.set(k,r);}
    const top=[...best.values()].sort((a,b)=>Number(b.price)-Number(a.price)).slice(0,50);
    return `<div class="league-section-intro"><div><span>PLAYER PROPS</span><h2>Mercados de jugador</h2><p>Solo precios reales cacheados. Si el bookmaker no publica el mercado, INCA no inventa cuota.</p></div><div class="league-source-badge odds"><i class="fa-solid fa-coins"></i><b>${top.length}</b><small>props cacheados</small></div></div>${top.length?`<div class="league-table-shell"><table class="league-pro-table"><thead><tr><th>Jugador</th><th>Mercado</th><th>Línea</th><th>Selección</th><th>Cuota</th><th>Bookmaker</th></tr></thead><tbody>${top.map(r=>`<tr><td><strong>${esc(r.player_name)}</strong></td><td>${esc(r.market_key)}</td><td>${r.point??'—'}</td><td>${esc(r.direction||r.outcome_name||'—')}</td><td><strong>${Number(r.price).toFixed(2)}</strong></td><td>${esc(r.bookmaker||'—')}</td></tr>`).join('')}</tbody></table></div>`:`<div class="league-pro-empty"><i class="fa-solid fa-coins"></i><strong>Sin props reales cacheados</strong><span>No mostramos precios estimados como si fueran bookmaker.</span></div>`}`;
  }

  async function renderReferees(){
    const fs=rowsFixtures().filter(x=>x.referee);
    let directory=[];
    try{await window.INCA_REFEREES?.ensureReady?.();directory=window.INCA_REFEREES?.forLeague?.(state.leagueId)||[];}catch{}
    const byName=new Map(directory.map(r=>[String(r.name||'').trim().toLowerCase(),r]));
    const allNames=new Set([...directory.map(r=>String(r.name||'').trim()).filter(Boolean),...fs.map(f=>String(f.referee||'').trim()).filter(Boolean)]);
    const rows=[...allNames].map(name=>byName.get(name.toLowerCase())||{name,match_count:0,pending:true});
    return `<div class="league-section-intro"><div><span>REFEREE INTELLIGENCE</span><h2>Árbitros & designaciones</h2><p>Histórico oficial completo desde 2024 por árbitro. Amarillas, rojas, faltas, primera tarjeta y tarjetas por tiempo desde TITAN_REFEREES_CURRENT V9.3.</p></div><div class="league-source-badge ref"><i class="fa-solid fa-user-tie"></i><b>${rows.length}</b><small>árbitros de la liga</small></div></div>
      ${fs.length?`<div class="league-ref-assignments"><h3>Próximas designaciones</h3>${fs.map(f=>`<button class="league-ref-card" data-open-referee="${esc(f.referee)}">${refereeAvatar(window.INCA_REFEREES?.findByName?.(f.referee)||f.referee)}<div><strong>${esc(f.referee)}</strong><small>${esc(f.home_team_name)} vs ${esc(f.away_team_name)}</small></div><span><b>${fmtKick(f.kickoff_utc,false)}</b><small>${dateLabel(f.kickoff_utc)}</small></span><i class="fa-solid fa-chevron-right"></i></button>`).join('')}</div>`:`<div class="league-pro-empty compact"><i class="fa-solid fa-user-tie"></i><strong>Designaciones pendientes</strong><span>Se mostrarán apenas el fixture publique árbitro.</span></div>`}
      <div class="league-section-subhead"><div><span>REFEREE STAT HUB</span><h3>Base arbitral V9.3 · 2024+</h3></div><small>amarillas · rojas · faltas · 1T/2T</small></div>
      ${rows.length?`<div class="league-table-shell"><table class="league-pro-table referee-master"><thead><tr><th>Árbitro</th><th>País</th><th>PJ</th><th>Amarillas</th><th>Rojas</th><th>Faltas</th><th>Tarj. 1T</th><th>Tarj. 2T</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td><button class="league-ref-name" data-open-referee="${esc(r.name)}">${refereeAvatar(r,'ref-avatar small')}<strong>${esc(r.name)}</strong></button></td><td>${esc(r.country||'—')}</td><td>${Number(r.match_count||0)||'—'}</td><td>${Number.isFinite(Number(r.avg_yellow_cards))?fmt1(Number(r.avg_yellow_cards)):'—'}</td><td>${Number.isFinite(Number(r.avg_red_cards))?fmt1(Number(r.avg_red_cards)):'—'}</td><td>${Number.isFinite(Number(r.avg_fouls_total))?fmt1(Number(r.avg_fouls_total)):'—'}</td><td>${Number.isFinite(Number(r.avg_cards_1h))?fmt1(Number(r.avg_cards_1h)):'—'}</td><td>${Number.isFinite(Number(r.avg_cards_2h))?fmt1(Number(r.avg_cards_2h)):'—'}</td><td><button class="league-mini-action" data-open-referee="${esc(r.name)}">ABRIR <i class="fa-solid fa-arrow-right"></i></button></td></tr>`).join('')}</tbody></table></div>`:`<div class="league-pro-empty"><i class="fa-solid fa-database"></i><strong>Extractor arbitral listo, dataset pendiente</strong><span>Ejecuta TITAN REFEREES 31 V1 y sube la carpeta TITAN_REFEREES_CURRENT a IncaStats-Data. La app no inventa números.</span></div>`}`;
  }

  function ensureModal(){
    let m=$('leagueProModal'); if(m)return m;
    m=document.createElement('div');m.id='leagueProModal';m.className='league-pro-modal';m.hidden=true;
    m.innerHTML='<div class="league-pro-modal-backdrop" data-modal-close></div><section class="league-pro-modal-card"><button class="league-pro-modal-close" data-modal-close><i class="fa-solid fa-xmark"></i></button><div id="leagueProModalBody"></div></section>';
    document.body.appendChild(m); m.querySelectorAll('[data-modal-close]').forEach(x=>x.onclick=()=>{m.hidden=true;document.body.classList.remove('league-modal-open');}); return m;
  }
  function showModal(html){const m=ensureModal();$('leagueProModalBody').innerHTML=html;m.hidden=false;document.body.classList.add('league-modal-open');}

  function marketOptions(){
    return [
      ['involvement','Gol o asistencia',r=>(num(r.Goles)||0)+(num(r.Asistencias)||0)>=1],['goal','1+ gol',r=>(num(r.Goles)||0)>=1],['assist','1+ asistencia',r=>(num(r.Asistencias)||0)>=1],
      ['sot05','Over 0.5 tiros a puerta',r=>(num(r.Tiros_Al_Arco)||0)>=1],['sot15','Over 1.5 tiros a puerta',r=>(num(r.Tiros_Al_Arco)||0)>=2],['sot25','Over 2.5 tiros a puerta',r=>(num(r.Tiros_Al_Arco)||0)>=3],
      ['shots05','Over 0.5 tiros totales',r=>(num(r.Tiros_Totales)||0)>=1],['shots15','Over 1.5 tiros totales',r=>(num(r.Tiros_Totales)||0)>=2],['shots25','Over 2.5 tiros totales',r=>(num(r.Tiros_Totales)||0)>=3],['shots35','Over 3.5 tiros totales',r=>(num(r.Tiros_Totales)||0)>=4],
      ['card','Anytime card',r=>(num(r.Tarjetas)||0)>=1],['foul05','Over 0.5 faltas cometidas',r=>(num(r.Faltas_Cometidas)||0)>=1],['foul15','Over 1.5 faltas cometidas',r=>(num(r.Faltas_Cometidas)||0)>=2],['tackle05','Over 0.5 tackles',r=>(num(r.Entradas_Tackles)||0)>=1],['tackle15','Over 1.5 tackles',r=>(num(r.Entradas_Tackles)||0)>=2],['fouled05','Over 0.5 faltas recibidas',r=>(num(r.Faltas_Recibidas)||0)>=1],['fouled15','Over 1.5 faltas recibidas',r=>(num(r.Faltas_Recibidas)||0)>=2],['off05','Over 0.5 offsides',r=>(num(r.Offsides)||0)>=1]
    ];
  }

  async function openPlayer(playerId,options={}){
    if(!(await ensurePlayers()))return;
    await window.INCA_PLAYERS?.ensureCurrentReady?.().catch(()=>null);
    const p=window.INCA_PLAYERS, all=p.rowsForPlayer(playerId), player=all[0]; if(!player)return;
    const compId=Number(options.competitionId||state.leagueId)||0;
    const currentProfile=(p.directoryForLeague?.(compId)||[]).find(x=>Number(x.id)===Number(playerId))||null;
    let rows=all.slice();
    const opts=marketOptions();
    const wantedMarket=modalMarketFromStreak(options.market)||String(options.market||'');
    const defaultMarket=opts.some(x=>x[0]===wantedMarket)?wantedMarket:opts[0][0];
    const comps=[...new Map(all.map(r=>[Number(r.Competition_ID)||0,{id:Number(r.Competition_ID)||0,name:r.Torneo||r.Competition_Name||`Competición ${r.Competition_ID}`}])).values()].filter(x=>x.id);
    showModal(`<div class="player-modal-head">${playerAvatar(playerId,'modal')}<div><span>PLAYER ANALYZER</span><h2>${esc(currentProfile?.name||player.Jugador)}</h2><p>${esc(currentProfile?.team||player.Equipo||'Club por confirmar')} · ${esc(currentProfile?.position||player.Posicion||'—')} · ID ${Number(playerId)}</p></div><div class="player-modal-kpis"><span><b>${all.length}</b><small>partidos</small></span><span><b>${Math.round(sum(all.map(r=>num(r.Minutos_Jugados)||0)))}</b><small>minutos</small></span><span><b>${sum(all.map(r=>num(r.Goles)||0))}</b><small>goles</small></span></div></div>
      <div class="player-modal-nav"><button class="active" data-pview="latest">Últimos partidos</button><button data-pview="opponent">Vs equipo</button><button data-pview="league">Por competición</button></div>
      <div class="player-modal-controls"><div class="league-scope-toggle player-modal-scope"><button class="active" data-pmodal-scope="all">Todos</button><button data-pmodal-scope="home">Local</button><button data-pmodal-scope="away">Visita</button></div><label>Competición<select id="playerModalCompetition"><option value="all">Todas</option>${comps.map(c=>`<option value="${c.id}" ${c.id===compId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>Participación<select id="playerModalStarts"><option value="all">Todos</option><option value="starts">Titular</option></select></label><label>Mercado<select id="playerModalMarket">${opts.map(([k,l])=>`<option value="${k}" ${k===defaultMarket?'selected':''}>${esc(l)}</option>`).join('')}</select></label></div>
      <div id="playerModalTable"></div>`);
    let view='latest';
    const renderTable=()=>{
      const scope=document.querySelector('.player-modal-scope button.active')?.dataset.pmodalScope||'all', market=$('playerModalMarket')?.value||defaultMarket, test=opts.find(x=>x[0]===market)?.[2]||(()=>false), comp=$('playerModalCompetition')?.value||'all', starts=$('playerModalStarts')?.value||'all';
      let filtered=all.filter(r=>(scope==='all'||p.condition(r)===scope)&&(comp==='all'||Number(r.Competition_ID)===Number(comp))&&(starts!=='starts'||String(r.Es_Titular||'').toUpperCase()==='SI'));
      if(view==='opponent') filtered=filtered.sort((a,b)=>String(a.Rival||'').localeCompare(String(b.Rival||''),'es')||Number(b.__dateMs||0)-Number(a.__dateMs||0));
      if(view==='league') filtered=filtered.sort((a,b)=>String(a.Torneo||'').localeCompare(String(b.Torneo||''),'es')||Number(b.__dateMs||0)-Number(a.__dateMs||0));
      filtered=filtered.slice(0,50);
      const primary=modalPrimaryMetric(market);
      $('playerModalTable').innerHTML=`<div class="player-market-focus"><span>MERCADO ACTIVO</span><b>${esc(opts.find(x=>x[0]===market)?.[1]||primary.label)}</b><small>La estadística seleccionada aparece siempre inmediatamente después de MIN.</small></div><div class="player-match-table player-match-table-focused"><table><thead><tr><th>Fecha</th><th>Comp.</th><th>Cond.</th><th>Rival</th><th>Min</th><th class="primary-market">${esc(primary.label)}</th><th>Estado</th></tr></thead><tbody>${filtered.map(r=>`<tr class="${test(r)?'market-hit':'market-miss'}"><td>${esc(r.Fecha)}</td><td><small>${esc(r.Torneo||'—')}</small></td><td><span class="cond ${p.condition(r)}">${p.condition(r)==='home'?'LOCAL':'VISITA'}</span></td><td><strong>${esc(r.Rival||'—')}</strong></td><td>${Math.round(num(r.Minutos_Jugados)||0)}</td><td class="primary-market"><b>${esc(primary.value(r))}</b></td><td><span class="player-market-status ${test(r)?'hit':'miss'}"><i class="fa-solid ${test(r)?'fa-circle-check':'fa-circle-xmark'}"></i>${test(r)?'CUMPLE':'NO CUMPLE'}</span></td></tr>`).join('')}</tbody></table></div>`;
    };
    document.querySelectorAll('[data-pmodal-scope]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-pmodal-scope]').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderTable();});
    document.querySelectorAll('[data-pview]').forEach(b=>b.onclick=()=>{view=b.dataset.pview;document.querySelectorAll('[data-pview]').forEach(x=>x.classList.toggle('active',x===b));renderTable();});
    ['playerModalMarket','playerModalCompetition','playerModalStarts'].forEach(id=>$(id)?.addEventListener('change',renderTable));renderTable();
  }

  async function openReferee(name){
    const clean=String(name||'').trim();if(!clean)return;
    if(window.INCA_REFEREE_CENTER?.openProfile){
      window.INCA_PORTAL_NAV?.show?.('referees');
      await new Promise(r=>setTimeout(r,40));
      const opened=await window.INCA_REFEREE_CENTER.openProfile(clean);
      if(opened)return;
    }
    let item=null;try{await window.INCA_REFEREES?.ensureReady?.();item=window.INCA_REFEREES?.findByName?.(clean)||null;}catch{}
    showModal(`<div class="ref-modal-head">${refereeAvatar(item||clean,'ref-avatar large')}<div><span>REFEREE ANALYZER</span><h2>${esc(clean)}</h2><p>${esc(item?.country||leagueDef()?.name||'')} · histórico oficial 2024+</p></div></div><div class="ref-window"><span>VENTANA</span><button data-ref-limit="10">10</button><button data-ref-limit="20">20</button><button data-ref-limit="30">30</button><button data-ref-limit="40">40</button><button data-ref-limit="50">50</button><button class="active" data-ref-limit="0">TODOS</button></div><div id="refModalContent"><div class="league-pro-empty compact"><i class="fa-solid fa-spinner fa-spin"></i><strong>Cargando histórico arbitral…</strong></div></div>`);
    const loadRef=async limit=>{
      const host=$('refModalContent');if(!host)return;
      let rows=[];
      try{if(item)rows=(await window.INCA_REFEREES?.history?.(item))||[];}catch{}
      if(!rows.length){
        try{const data=await authJson(`./api/football-cache?action=referee-history&referee=${encodeURIComponent(clean)}&limit=${limit}`);rows=data?.matches||data?.referee_history||[];}catch{}
      }
      if(limit>0)rows=rows.slice(0,limit);
      if(!rows.length){host.innerHTML=`<div class="league-pro-empty"><i class="fa-solid fa-database"></i><strong>Histórico pendiente de extracción</strong><span>La ficha está lista. Ejecuta TITAN REFEREES 31 V1; no se rellenan tarjetas, faltas ni puntos con valores inventados.</span></div>`;return;}
      const g=(r,...keys)=>{for(const k of keys)if(r?.[k]!==undefined&&r?.[k]!==null&&r?.[k]!=='')return Number(r[k]);return NaN;};
      const vals=(...keys)=>rows.map(r=>g(r,...keys)).filter(Number.isFinite);
      const yell=vals('yellow_cards','yellows'),reds=vals('red_cards','reds'),fouls=rows.map(r=>{const h=g(r,'home_fouls'),a=g(r,'away_fouls'),t=g(r,'fouls_total','fouls');return Number.isFinite(t)?t:(Number.isFinite(h)||Number.isFinite(a)?(h||0)+(a||0):NaN);}).filter(Number.isFinite),h1=vals('cards_1h'),h2=vals('cards_2h');
      host.innerHTML=`<div class="ref-kpis"><span><small>PARTIDOS</small><b>${rows.length}</b></span><span><small>AMARILLAS AVG</small><b>${fmt1(avg(yell))}</b></span><span><small>ROJAS AVG</small><b>${fmt1(avg(reds))}</b></span><span><small>FALTAS AVG</small><b>${fmt1(avg(fouls))}</b></span><span><small>1T / 2T</small><b>${fmt1(avg(h1))} / ${fmt1(avg(h2))}</b></span><span><small>1ª TARJETA</small><b>${fmt1(avg(vals('first_card_minute')))}'</b></span></div><div class="league-table-shell"><table class="league-pro-table referee-history"><thead><tr><th>Fecha</th><th>Competición</th><th>Partido</th><th>Amarillas</th><th>Rojas</th><th>Faltas L</th><th>Faltas V</th><th>1T</th><th>2T</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.date_iso||r.date||r.kickoff||'—')}</td><td><small>${esc(r.competition_name||r.competition||'—')}</small></td><td><strong>${esc(r.home_team||r.home||'')} vs ${esc(r.away_team||r.away||'')}</strong></td><td>${Number.isFinite(g(r,'yellow_cards','yellows'))?g(r,'yellow_cards','yellows'):'—'}</td><td>${Number.isFinite(g(r,'red_cards','reds'))?g(r,'red_cards','reds'):'—'}</td><td>${Number.isFinite(g(r,'home_fouls'))?g(r,'home_fouls'):'—'}</td><td>${Number.isFinite(g(r,'away_fouls'))?g(r,'away_fouls'):'—'}</td><td>${Number.isFinite(g(r,'cards_1h'))?g(r,'cards_1h'):'—'}</td><td>${Number.isFinite(g(r,'cards_2h'))?g(r,'cards_2h'):'—'}</td></tr>`).join('')}</tbody></table></div>`;
    };
    document.querySelectorAll('[data-ref-limit]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-ref-limit]').forEach(x=>x.classList.remove('active'));b.classList.add('active');loadRef(Number(b.dataset.refLimit));});
    loadRef(0);
  }

  async function render(){
    const host=$('leagueHubContent'); if(!host)return; renderHero();
    let html='';
    if(state.activeTab==='fixtures')html=renderFixtures();
    else if(state.activeTab==='table'){host.innerHTML='<div class="league-pro-loading"><span></span><b>Construyendo tabla y promedios…</b></div>';html=await renderTable();}
    else if(state.activeTab==='topplayers'){host.innerHTML='<div class="league-pro-loading"><span></span><b>Cargando jugadores…</b></div>';html=await renderTopPlayers();}
    else if(state.activeTab==='playerstreaks'){host.innerHTML='<div class="league-pro-loading"><span></span><b>Calculando rachas de jugador…</b></div>';html=await renderPlayerStreaks();}
    else if(state.activeTab==='props')html=renderProps();
    else {host.innerHTML='<div class="league-pro-loading"><span></span><b>Leyendo designaciones…</b></div>';html=await renderReferees();}
    host.innerHTML=html; wire(host);
  }

  function wire(host){
    const from=$('leagueDateFrom'),to=$('leagueDateTo');
    from?.addEventListener('change',()=>{state.dateFrom=from.value||defaultCalendarRange().from;state.dateTo=state.dateTo<state.dateFrom?state.dateFrom:state.dateTo;const max=addDaysKey(state.dateFrom,14);if(state.dateTo>max)state.dateTo=max;render();});
    to?.addEventListener('change',()=>{state.dateTo=to.value||state.dateFrom;ensureCalendarRange();render();});
    host.querySelector('[data-calendar-today]')?.addEventListener('click',()=>{const d=defaultCalendarRange();state.dateFrom=d.from;state.dateTo=d.from;render();});
    host.querySelector('[data-calendar-14]')?.addEventListener('click',()=>{const d=defaultCalendarRange();state.dateFrom=d.from;state.dateTo=d.to;render();});
    host.querySelectorAll('[data-open-fixture]').forEach(b=>{
      const go=async()=>{
        const eventId=Number(b.dataset.openFixture)||0;
        const competitionId=Number(b.dataset.openComp||state.leagueId)||0;
        try{
          sessionStorage.setItem('inca_match_return','leagues');
          sessionStorage.setItem('inca_match_focus',JSON.stringify({eventId,competitionId,at:Date.now()}));
        }catch{}
        window.INCA_PORTAL_NAV?.show?.('fixtures');
        const ok=await window.INCA_MATCH_CENTER?.openFixture?.({eventId,competitionId});
        if(!ok){
          // Segundo intento corto: cubre carreras de navegación/activación sin exigir otro click.
          setTimeout(()=>window.INCA_MATCH_CENTER?.openFixture?.({eventId,competitionId}),80);
        }
      };
      b.onclick=go;
      b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};
    });
    host.querySelectorAll('[data-ti-team]').forEach(b=>b.onclick=e=>{e.stopPropagation();document.dispatchEvent(new CustomEvent('inca:open-team-intel',{detail:{teamId:Number(b.dataset.tiTeam),compId:Number(b.dataset.tiComp)}}));});
    host.querySelectorAll('[data-player-metric]').forEach(b=>b.onclick=()=>{state.playerMetric=b.dataset.playerMetric;render();});
    host.querySelectorAll('[data-player-scope]').forEach(b=>b.onclick=()=>{state.playerScope=b.dataset.playerScope;render();});
    host.querySelectorAll('[data-streak-scope]').forEach(b=>b.onclick=()=>{state.streakScope=b.dataset.streakScope;render();});
    $('leagueStreakMarket')?.addEventListener('change',e=>{state.streakMarket=e.target.value;render();});
    $('leagueStreakMin')?.addEventListener('change',e=>{state.streakMin=Number(e.target.value)||3;render();});
    host.querySelectorAll('[data-open-player]').forEach(b=>b.onclick=()=>openPlayer(Number(b.dataset.openPlayer),{competitionId:Number(b.dataset.openComp||state.leagueId)||state.leagueId,market:b.dataset.openMarket||''}));
    host.querySelectorAll('[data-open-referee]').forEach(b=>b.onclick=()=>openReferee(b.dataset.openReferee));
  }

  async function activate(){ await window.INCA_TITAN?.ensureReady?.(); await load(); populateLeague(); renderHero(); renderTabs(); render(); }
  function init(){
    if(state.initialized)return; state.initialized=true; populateLeague(); renderTabs(); ensureModal();
    $('leagueHubLeague')?.addEventListener('change',e=>{state.leagueId=Number(e.target.value);{const d=defaultCalendarRange();state.dateFrom=d.from;state.dateTo=d.to;}state.avgCache.clear();renderHero();renderTabs();render();});
    document.addEventListener('click',e=>{if(e.target.closest('[data-view="leagues"]'))setTimeout(activate,40);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.INCA_LEAGUE_CENTER=Object.freeze({activate,render,openPlayer,openReferee,hasOddsCoverage});
})();
