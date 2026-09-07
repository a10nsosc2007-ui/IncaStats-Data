(()=>{
  'use strict';
  const views={home:'portalHome',leagues:'portalLeagues',referees:'portalReferees',fixtures:'portalFixtures',streaks:'portalStreaks',players:'portalPlayers',compare:'portalCompare',rankings:'portalRankings',betlab:'portalBetLab',scanner:'scannerView'};
  const shell=document.getElementById('incaPortal');
  const scanner=document.getElementById('scannerView');
  const progress=document.getElementById('portalScrollProgress');
  const topButton=document.getElementById('portalScrollTop');
  const cache={fixtures:[],players:[],playerPage:0};

  const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toLowerCase();
  const pctSignal=s=>Number.isFinite(Number(s?.percentage))?Number(s.percentage):Number(s?.probability||0)*100;
  const bridge=()=>window.INCA_DATA_BRIDGE;
  const matches=()=>bridge()?.getMatches?.()||[];
  const teams=()=>bridge()?.getTeams?.()||[];
  const fmtDate=value=>new Intl.DateTimeFormat('es-PE',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));

  function wakeScanner(){requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));document.dispatchEvent(new CustomEvent('inca:scanner-visible'));const selected=document.getElementById('selectEquipo');if(selected?.value)selected.dispatchEvent(new Event('change',{bubbles:true}));});}
  function show(name){
    const isScanner=name==='scanner';
    if(isScanner){shell?.classList.add('portal-shell-hidden');scanner?.classList.remove('portal-hidden');scanner.hidden=false;scanner.style.display='block';document.body.classList.add('scanner-active');window.scrollTo({top:0,behavior:'instant'});console.info('[INCA PORTAL] Analizador visible',{scannerParent:scanner?.parentElement?.id||scanner?.parentElement?.tagName,display:getComputedStyle(scanner).display});wakeScanner();return;}
    document.body.classList.remove('scanner-active');scanner?.classList.add('portal-hidden');shell?.classList.remove('portal-shell-hidden');
    Object.entries(views).forEach(([key,id])=>{if(key!=='scanner')document.getElementById(id)?.classList.toggle('portal-hidden',key!==name);});
    document.querySelectorAll('.portal-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
    document.querySelector('.portal-nav')?.classList.remove('open');shell?.scrollTo({top:0,behavior:'smooth'});requestAnimationFrame(updateScrollUI);
    if(name==='leagues')window.INCA_LEAGUE_CENTER?.activate?.();
    if(name==='referees')window.INCA_REFEREE_CENTER?.activate?.();
    if(name==='fixtures')window.INCA_MATCH_CENTER?.activate?.();
    if(name==='players')loadPlayerDirectory();
    if(name==='compare')window.INCA_COMPARE?.activate?.();
    if(name==='rankings')window.INCA_GLOBAL_RANKINGS?.activate?.();
    if(name==='betlab')window.INCA_TEAM_INTEL?.activate?.();
    if(name==='streaks')runStreaks();
  }
  function updateScrollUI(){if(!shell)return;const max=Math.max(1,shell.scrollHeight-shell.clientHeight),ratio=Math.min(1,Math.max(0,shell.scrollTop/max));if(progress)progress.style.width=`${ratio*100}%`;topButton?.classList.toggle('visible',shell.scrollTop>420);}
  // Navegación pública interna para módulos que abren un partido desde Team Intel / Ligas.
  window.INCA_PORTAL_NAV=Object.freeze({show});
  document.addEventListener('click',e=>{const t=e.target.closest('[data-view]');if(t){e.preventDefault();show(t.dataset.view);}});
  document.getElementById('portalMobileMenu')?.addEventListener('click',()=>document.querySelector('.portal-nav')?.classList.toggle('open'));
  shell?.addEventListener('scroll',updateScrollUI,{passive:true});topButton?.addEventListener('click',()=>shell?.scrollTo({top:0,behavior:'smooth'}));

  function signalText(){
    const s=window.INCA_LAST_SIGNAL;if(!s)return 'Todavía no existe una señal activa. Selecciona equipo, mercado, condición y línea en el Analizador.';
    const p=pctSignal(s),n=Number(s.sample||0),h=Number(s.hits||0);
    const grade=n>=15&&p>=75?'Señal fuerte':n>=10&&p>=65?'Señal utilizable':'Señal de precaución';
    const risk=n<6?'Muestra pequeña.':p>=90?'El porcentaje es alto; revisa rival y alineación antes de interpretarlo como probabilidad.':'Contrasta la tendencia con cuota, rival y disponibilidad del equipo.';
    return `${grade}: ${h}/${n} aciertos (${p.toFixed(1)}%). ${risk}`;
  }
  function syncSignalCards(){const s=window.INCA_LAST_SIGNAL,value=document.getElementById('heroSignalValue'),meta=document.getElementById('heroSignalMeta');if(!value||!meta)return;if(!s){value.textContent='—';meta.textContent='Abre el analizador para generar una lectura';return;}const p=pctSignal(s),n=Number(s.sample||0),h=Number(s.hits||0);value.textContent=`${p.toFixed(1)}%`;meta.textContent=`${h}/${n} aciertos · ${s.equipo||'equipo seleccionado'}`;}
  function runAI(){const txt=signalText();document.getElementById('incaAssistantText')?.replaceChildren(txt);document.getElementById('aiModalOutput')?.replaceChildren(txt);syncSignalCards();}
  document.getElementById('runIncaAssistant')?.addEventListener('click',runAI);document.getElementById('openAiFilter')?.addEventListener('click',()=>{runAI();document.getElementById('incaAiModal')?.classList.remove('portal-hidden');});document.getElementById('closeAiModal')?.addEventListener('click',()=>document.getElementById('incaAiModal')?.classList.add('portal-hidden'));document.getElementById('analyzeCurrentSignal')?.addEventListener('click',runAI);
  window.addEventListener('inca:signal-updated',()=>{syncSignalCards();runAI();});

  async function fetchFixtures(){
    const target=document.getElementById('fixtureRows'),status=document.getElementById('fixtureStatus');
    if(status)status.textContent='Agenda disponible en Centro de Ligas';
    if(target)target.innerHTML='<div class="portal-loader"><span></span> Usa Ligas para consultar los próximos partidos.</div>';
    cache.fixtures=[];
  }
  function bestOdds(game){
    const selections={home:[],draw:[],away:[],over:[]};
    for(const book of game.bookmakers||[])for(const market of book.markets||[]){if(market.key==='h2h')for(const o of market.outcomes||[]){const entry={price:o.price,book:book.title};if(norm(o.name)===norm(game.home_team))selections.home.push(entry);else if(norm(o.name)===norm(game.away_team))selections.away.push(entry);else selections.draw.push(entry);}if(market.key==='totals')for(const o of market.outcomes||[])if(o.name==='Over'&&Number(o.point)===2.5)selections.over.push({price:o.price,book:book.title});}
    const best=arr=>arr.sort((a,b)=>b.price-a.price)[0]||null;return {home:best(selections.home),draw:best(selections.draw),away:best(selections.away),over:best(selections.over)};
  }
  function renderFixtures(){
    const box=document.getElementById('fixtureRows');if(!box)return;const range=document.querySelector('.portal-tabs button.active')?.dataset.range||'all';const market=document.getElementById('fixtureMarket')?.value||'popular';const now=new Date(),end=new Date(now);end.setDate(end.getDate()+(range==='today'?1:range==='tomorrow'?2:range==='3days'?3:365));
    const rows=cache.fixtures.filter(g=>{const d=new Date(g.commence_time);if(range==='today')return d.toDateString()===now.toDateString();if(range==='tomorrow'){const t=new Date(now);t.setDate(t.getDate()+1);return d.toDateString()===t.toDateString();}return d>=now&&d<=end;});
    if(!rows.length){box.innerHTML=empty('fa-calendar-xmark','Sin encuentros en el filtro','Cambia el rango o la competición.');return;}
    box.innerHTML=rows.map(g=>{const o=bestOdds(g);const selected=market==='over25'?o.over:o.home;return `<article class="fixture-row"><div class="fixture-league"><i class="fa-solid fa-trophy"></i><span>${esc(document.getElementById('fixtureLeague')?.selectedOptions[0]?.textContent||'Competición')}</span></div><div class="fixture-match"><strong>${esc(g.home_team)} <b>vs</b> ${esc(g.away_team)}</strong><small>${fmtDate(g.commence_time)}</small></div><div class="fixture-market"><span>${market==='over25'?'Over 2.5':'Mejor cuota local'}</span><strong>${selected?Number(selected.price).toFixed(2):'—'}</strong><small>${esc(selected?.book||'Sin mercado')}</small></div>${g._demo?'<span class="fixture-demo-chip">DEMO</span>':''}<button class="fixture-action" data-team="${esc(g.home_team)}">Analizar</button></article>`;}).join('');
    box.querySelectorAll('.fixture-action').forEach(btn=>btn.addEventListener('click',()=>openTeamInScanner(btn.dataset.team)));
  }
  function empty(icon,title,text){return `<div class="portal-empty"><i class="fa-solid ${icon}"></i><h3>${title}</h3><p>${text}</p></div>`;}
  document.getElementById('refreshFixtures')?.addEventListener('click',fetchFixtures);document.getElementById('fixtureLeague')?.addEventListener('change',fetchFixtures);document.getElementById('fixtureMarket')?.addEventListener('change',renderFixtures);
  document.querySelectorAll('#portalFixtures .portal-tabs button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('#portalFixtures .portal-tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderFixtures();}));

  function metricConfig(){
    const stat=document.getElementById('streakStat')?.value||'goals',line=Number(document.getElementById('streakLine')?.value||2.5);
    const configs={goals:{label:'Goles totales',value:(m)=>num(m.sLocal.Goles)+num(m.sVisita.Goles)},btts:{label:'BTTS',value:m=>(num(m.sLocal.Goles)>0&&num(m.sVisita.Goles)>0?1:0)},bp:{label:'Booking points',value:m=>num(m.sLocal['Puntos por Tarjetas'])+num(m.sVisita['Puntos por Tarjetas'])},corners:{label:'Córners',value:m=>num(m.sLocal['Córners'])+num(m.sVisita['Córners'])},cards:{label:'Tarjetas',value:m=>num(m.sLocal.Tarjetas)+num(m.sVisita.Tarjetas)},shots:{label:'Tiros',value:m=>num(m.sLocal['Tiros Totales'])+num(m.sVisita['Tiros Totales'])},offsides:{label:'Offsides',value:m=>num(m.sLocal['Fueras de Juego'])+num(m.sVisita['Fueras de Juego'])},fouls:{label:'Faltas',value:m=>num(m.sLocal.Faltas)+num(m.sVisita.Faltas)}};
    return {...configs[stat],line,stat};
  }
  const num=v=>Number(v)||0;
  function runStreaks(){
    const result=document.getElementById('streakResult'),data=matches();if(!result)return;if(!data.length){result.innerHTML=empty('fa-database','Base todavía cargando','Espera a que el motor termine de cargar la temporada.');return;}
    const cfg=metricConfig(),sampleRaw=document.getElementById('streakSample')?.value||'6',sample=sampleRaw==='all'?999:Number(sampleRaw),threshold=Number(document.getElementById('streakThreshold')?.value||60),out=[];
    for(const team of teams()){
      const relevant=data.filter(m=>m.local===team||m.visita===team).sort((a,b)=>b.sortTime-a.sortTime).slice(0,sample);if(!relevant.length)continue;
      const hits=relevant.filter(m=>cfg.stat==='btts'?cfg.value(m)===1:cfg.value(m)>cfg.line).length,p=hits/relevant.length*100;
      if(p>=threshold)out.push({team,hits,n:relevant.length,p,streak:consecutive(relevant,m=>cfg.stat==='btts'?cfg.value(m)===1:cfg.value(m)>cfg.line)});
    }
    out.sort((a,b)=>b.p-a.p||b.streak-a.streak);if(!out.length){result.innerHTML=empty('fa-filter-circle-xmark','No hay coincidencias','Reduce el umbral o cambia la línea.');return;}
    result.innerHTML=`<div class="streak-grid">${out.slice(0,24).map(x=>`<article class="streak-card"><div><small>${esc(cfg.label)} · Over ${cfg.line}</small><h3>${esc(x.team)}</h3></div><strong>${x.p.toFixed(0)}%</strong><p>${x.hits}/${x.n} aciertos · racha actual ${x.streak}</p><button data-team="${esc(x.team)}">Ver análisis</button></article>`).join('')}</div>`;
    result.querySelectorAll('[data-team]').forEach(b=>b.addEventListener('click',()=>openTeamInScanner(b.dataset.team)));
  }
  function consecutive(arr,pred){let n=0;for(const x of arr){if(!pred(x))break;n++;}return n;}
  document.getElementById('applyStreakFilter')?.addEventListener('click',runStreaks);['streakStat','streakLine','streakThreshold','streakSample'].forEach(id=>document.getElementById(id)?.addEventListener('change',runStreaks));

  async function loadPlayerDirectory(){
    const target=document.getElementById('playerRows');if(!target)return;if(!cache.players.length){target.innerHTML='<div class="portal-loader"><span></span> Cargando directorio de jugadores</div>';try{const r=await fetch('./jugadores_ids.json');const j=await r.json();cache.players=Object.values(j.jugadores||{}).map(p=>({name:p.nombre,id:p.id,face:p.ruta}));}catch(e){target.innerHTML=empty('fa-triangle-exclamation','No se pudo cargar jugadores',esc(e.message));return;}}
    renderPlayers();
  }
  function renderPlayers(){
    const target=document.getElementById('playerRows');if(!target)return;const q=norm(document.getElementById('playerSearch')?.value),min=Number(document.getElementById('playerMinStreak')?.value||3);document.getElementById('playerRangeValue').textContent=min;
    const list=cache.players.filter(p=>!q||norm(p.name).includes(q)).slice(0,60);target.innerHTML=list.length?`<div class="player-directory">${list.map(p=>{const avatar=`https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=eaf7f2&color=087b5d&bold=true&format=svg`;const modern=window.INCA_PLAYERS?.faceUrl?.(p.id)||'';const legacy=/^https?:/i.test(p.face||'')?p.face:'';const src=modern||legacy||avatar;return `<article><img src="${esc(src)}" alt="${esc(p.name)}" data-legacy="${esc(legacy)}" data-fallback="${esc(avatar)}" onerror="if(this.dataset.legacy){const u=this.dataset.legacy;this.dataset.legacy='';this.src=u}else if(this.dataset.fallback){const u=this.dataset.fallback;this.dataset.fallback='';this.src=u}else{this.onerror=null}"><div><strong>${esc(p.name)}</strong><small>ID ${esc(p.id)} · filtro de racha ≥ ${min}</small></div><button data-player="${esc(p.name)}">Abrir props</button></article>`}).join('')}</div>`:empty('fa-user-slash','Sin resultados','Prueba otra búsqueda.');
    target.querySelectorAll('[data-player]').forEach(b=>b.addEventListener('click',()=>openPlayerInScanner(b.dataset.player)));
  }
  document.getElementById('playerSearch')?.addEventListener('input',renderPlayers);document.getElementById('playerMinStreak')?.addEventListener('input',renderPlayers);
  document.querySelectorAll('#portalPlayers .portal-category-tabs button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('#portalPlayers .portal-category-tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.getElementById('playerCategoryLabel').textContent=b.textContent;}));

  const compareState={logos:{},logoReady:false};
  const COMPARE_METRICS={
    goals:{label:'Goles',keys:['Goles']},shots:{label:'Tiros',keys:['Tiros Totales']},sot:{label:'Tiros a puerta',keys:['Tiros a Puerta']},corners:{label:'Córners',keys:['Córners','Corners']},cards:{label:'Tarjetas',keys:['Tarjetas']},booking:{label:'Booking points',keys:['Puntos por Tarjetas']},fouls:{label:'Faltas',keys:['Faltas']},offsides:{label:'Offsides',keys:['Fueras de Juego','Offsides']},tackles:{label:'Tackles',keys:['Entradas','Tackles']}
  };
  function hashAccent(name){let h=0;for(const c of String(name||''))h=(h*31+c.charCodeAt(0))%360;return {a:`hsl(${h} 72% 42%)`,b:`hsl(${(h+38)%360} 76% 54%)`};}
  async function ensureCompareLogos(){if(compareState.logoReady)return;try{await window.INCA_TITAN?.ensureReady?.();}catch(_){}compareState.logoReady=true;}
  function teamLogo(name){return window.INCA_TITAN?.logoUrl?.(name)||window.obtenerEscudoEquipo?.(name)||'';}
  function cloneSelectOptions(source,target){if(!source||!target)return;const current=source.value;target.innerHTML=[...source.options].map(o=>`<option value="${esc(o.value)}" ${o.value===current?'selected':''}>${esc(o.textContent)}</option>`).join('');}
  function syncComparatorContext(){cloneSelectOptions(document.getElementById('selectLiga'),document.getElementById('compareLeague'));cloneSelectOptions(document.getElementById('selectTemporada'),document.getElementById('compareSeason'));}
  async function syncTeamLists(){await ensureCompareLogos();syncComparatorContext();const list=teams(),a=document.getElementById('compareA'),b=document.getElementById('compareB');if(!a||!b)return;const oldA=a.value,oldB=b.value;const options=list.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');a.innerHTML='<option value="">Selecciona Equipo A</option>'+options;b.innerHTML='<option value="">Selecciona Equipo B</option>'+options;a.value=list.includes(oldA)?oldA:(list[0]||'');b.value=list.includes(oldB)?oldB:(list.find(x=>x!==a.value)||list[1]||'');updateComparePicker('A');updateComparePicker('B');document.getElementById('compareDataStatus').innerHTML=`<i class="fa-solid fa-database"></i> ${matches().length} partidos · ${list.length} equipos · datos locales`;}
  function updateComparePicker(side){const select=document.getElementById(`compare${side}`),name=select?.value||'',picker=document.getElementById(`comparePicker${side}`),img=document.getElementById(`compareLogo${side}`),meta=document.getElementById(`compareMeta${side}`);if(!picker)return;const colors=hashAccent(name);picker.style.setProperty('--club-a',colors.a);picker.style.setProperty('--club-b',colors.b);if(img){const logo=teamLogo(name);if(logo){img.style.display='';img.src=logo;img.onerror=()=>{img.onerror=null;img.removeAttribute('src');img.style.display='none';};}else{img.removeAttribute('src');img.style.display='none';}}if(meta){const count=matches().filter(m=>m.local===name||m.visita===name).length;meta.textContent=name?`${count} partidos disponibles en la temporada`:'Selecciona un equipo';}}
  function readStat(obj,keys){for(const key of keys){const hit=Object.keys(obj||{}).find(k=>norm(k)===norm(key));if(hit!==undefined){const n=Number(String(obj[hit]??0).replace('%','').replace(',','.'));if(Number.isFinite(n))return n;}}return 0;}
  function metricConfig(code){const [family,mode='for']=String(code||'goals_for').split('_');return {family,mode,...(COMPARE_METRICS[family]||COMPARE_METRICS.goals)};}
  function sampleMatches(team,sample,condition){let rel=matches().filter(m=>m.local===team||m.visita===team);if(condition==='home')rel=rel.filter(m=>m.local===team);if(condition==='away')rel=rel.filter(m=>m.visita===team);rel.sort((a,b)=>b.sortTime-a.sortTime);return sample==='ALL'?rel:rel.slice(0,Math.max(1,Number(sample)||10));}
  function valueForMatch(m,team,cfg){const isHome=m.local===team,own=isHome?m.sLocal:m.sVisita,opp=isHome?m.sVisita:m.sLocal;const ownV=readStat(own,cfg.keys),oppV=readStat(opp,cfg.keys);return cfg.mode==='total'?ownV+oppV:cfg.mode==='against'?oppV:ownV;}
  function median(values){if(!values.length)return 0;const x=[...values].sort((a,b)=>a-b),mid=Math.floor(x.length/2);return x.length%2?x[mid]:(x[mid-1]+x[mid])/2;}
  function teamMetricAdvanced(team,code,sample,condition){const cfg=metricConfig(code),rel=sampleMatches(team,sample,condition),rows=rel.map(m=>({date:m.fecha||'',opponent:m.local===team?m.visita:m.local,condition:m.local===team?'LOCAL':'VISITA',value:valueForMatch(m,team,cfg),home:m.local,away:m.visita})),values=rows.map(r=>r.value),sum=values.reduce((a,b)=>a+b,0),avg=values.length?sum/values.length:0;return {team,cfg,n:values.length,avg,median:median(values),min:values.length?Math.min(...values):0,max:values.length?Math.max(...values):0,total:sum,last:values.slice(0,5),rows};}
  function formatMetric(v){return Number.isInteger(v)?String(v):Number(v).toFixed(2);}
  function compareCard(data,side){const colors=hashAccent(data.team);return `<article class="compare-pro-team" style="--club-a:${colors.a};--club-b:${colors.b}"><header>${teamLogo(data.team)?`<img src="${esc(teamLogo(data.team))}" alt="${esc(data.team)}" onerror="this.remove()">`:``}<div><small>EQUIPO ${side}</small><h2>${esc(data.team)}</h2><span>${data.n} partidos analizados</span></div></header><div class="compare-main-kpi"><span>Promedio</span><strong>${data.avg.toFixed(2)}</strong><small>${esc(data.cfg.label)} · ${data.cfg.mode==='total'?'total':data.cfg.mode==='against'?'recibidos':'hechos'}</small></div><div class="compare-kpi-grid"><div><span>Mediana</span><b>${formatMetric(data.median)}</b></div><div><span>Mínimo</span><b>${formatMetric(data.min)}</b></div><div><span>Máximo</span><b>${formatMetric(data.max)}</b></div><div><span>Acumulado</span><b>${formatMetric(data.total)}</b></div></div><div class="compare-form-strip">${data.last.map((v,i)=>`<span title="Partido ${i+1}">${formatMetric(v)}</span>`).join('')}</div></article>`;}
  function recentRows(data){return `<div class="compare-recent"><h3><i class="fa-solid fa-clock-rotate-left"></i> Partidos utilizados · ${esc(data.team)}</h3>${data.rows.slice(0,10).map(r=>`<div><span>${esc(r.date)}</span><b class="${r.condition==='LOCAL'?'is-home':'is-away'}">${r.condition}</b><strong>${esc(r.opponent)}</strong><em>${formatMetric(r.value)}</em></div>`).join('')}</div>`;}
  function renderAdvancedComparison(){const a=document.getElementById('compareA')?.value,b=document.getElementById('compareB')?.value,result=document.getElementById('compareResult'),metric=document.getElementById('compareMetric')?.value||'shots_for',sample=document.getElementById('compareSample')?.value||'10',condition=document.getElementById('compareCondition')?.value||'global';if(!result)return;if(!a||!b){result.innerHTML=empty('fa-triangle-exclamation','Faltan equipos','Selecciona los dos clubes antes de comparar.');return;}if(a===b){result.innerHTML=empty('fa-clone','Equipos repetidos','Selecciona dos equipos diferentes.');return;}const A=teamMetricAdvanced(a,metric,sample,condition),B=teamMetricAdvanced(b,metric,sample,condition);if(!A.n||!B.n){result.innerHTML=empty('fa-circle-question','Sin muestra suficiente','Cambia la condición o selecciona otra temporada.');return;}const diff=Math.abs(A.avg-B.avg),winner=A.avg===B.avg?'Equilibrio':A.avg>B.avg?a:b,cfg=A.cfg;result.innerHTML=`<div class="compare-pro-summary"><div><span>Mercado</span><strong>${esc(cfg.label)}</strong></div><div><span>Muestra</span><strong>${sample==='ALL'?'Temporada completa':`Últimos ${sample}`}</strong></div><div><span>Condición</span><strong>${condition==='home'?'Local':condition==='away'?'Visitante':'Global'}</strong></div><div class="compare-edge"><span>Ventaja promedio</span><strong>${diff.toFixed(2)}</strong><small>${esc(winner)}</small></div></div><div class="compare-pro-grid">${compareCard(A,'A')}<div class="compare-vs-pro"><span>VS</span><small>${diff.toFixed(2)} diferencia</small></div>${compareCard(B,'B')}</div><div class="compare-insight"><i class="fa-solid fa-wand-magic-sparkles"></i><div><b>Lectura automática</b><p>${esc(winner)} registra el promedio más alto en ${cfg.label.toLowerCase()} (${cfg.mode==='total'?'total del partido':cfg.mode==='against'?'recibidos':'hechos'}) dentro de la muestra elegida. La diferencia es ${diff.toFixed(2)} por partido.</p></div></div><div class="compare-recent-grid">${recentRows(A)}${recentRows(B)}</div>`;}
  async function changeComparatorDataset(type){const source=document.getElementById(type==='league'?'selectLiga':'selectTemporada'),target=document.getElementById(type==='league'?'compareLeague':'compareSeason');if(!source||!target||source.value===target.value)return;source.value=target.value;source.dispatchEvent(new Event('change',{bubbles:true}));const status=document.getElementById('compareDataStatus');if(status)status.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Cargando nueva base…';setTimeout(syncTeamLists,1200);}
  document.getElementById('compareLeague')?.addEventListener('change',()=>changeComparatorDataset('league'));
  document.getElementById('compareSeason')?.addEventListener('change',()=>changeComparatorDataset('season'));
  document.getElementById('compareA')?.addEventListener('change',()=>updateComparePicker('A'));
  document.getElementById('compareB')?.addEventListener('change',()=>updateComparePicker('B'));
  document.getElementById('runComparison')?.addEventListener('click',renderAdvancedComparison);
  ['compareMetric','compareSample','compareCondition'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>{if(document.getElementById('compareA')?.value&&document.getElementById('compareB')?.value)renderAdvancedComparison();}));

  function openTeamInScanner(team){show('scanner');setTimeout(()=>{const select=document.getElementById('selectEquipo');if(!select)return;const option=[...select.options].find(o=>norm(o.value)===norm(team)||norm(o.textContent)===norm(team));if(option){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));}},250);}
  function openPlayerInScanner(name){if(window.INCA_NAV?.openProps){window.INCA_NAV.openProps(name);return;}show('scanner');setTimeout(()=>{window.abrirVistaJugadores?.();const input=document.getElementById('inputBusquedaJugador');if(input){input.value=name;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}},300);}

  function syncEngineStatus(){const st=document.getElementById('statusCarga'),text=st?.classList.contains('success')?'Base lista':st?.classList.contains('error')?'Revisando datos':'Cargando base',short=st?.classList.contains('success')?'Lista':st?.classList.contains('error')?'Revisando':'Cargando';['portalDataStatus','heroEngineStatus'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=short;});const footer=document.getElementById('footerEngineStatus');if(footer)footer.textContent=text;const count=bridge()?.getStatus?.().matches||0;const c=document.getElementById('heroMatchCount');if(c)c.textContent=count?`${count}`:'—';syncSignalCards();}
  window.addEventListener('inca:data-ready',()=>{syncEngineStatus();syncTeamLists();runStreaks();});setInterval(syncEngineStatus,5000);
  show('home');updateScrollUI();syncEngineStatus();
})();


/* Auto-fit selected text so complete names stay visible. */
(() => {
  function fitSelect(sel){
    if(!(sel instanceof HTMLSelectElement))return;
    const text=sel.selectedOptions?.[0]?.textContent?.trim()||'';
    sel.title=text;
    const len=text.length;
    const size=len>46?8.6:len>38?9.2:len>30?9.8:len>23?10.6:11.5;
    sel.style.fontSize=`${size}px`;
    sel.style.letterSpacing=len>34?'-.025em':'-.01em';
  }

  function fitAll(root=document){
    root.querySelectorAll?.('select').forEach(fitSelect);
  }

  document.addEventListener('change',e=>{
    if(e.target instanceof HTMLSelectElement)fitSelect(e.target);
  },true);

  const start=()=>{
    fitAll();
    // Los selectores dinámicos notifican por eventos de vista/datos; no observamos todo el DOM.
    window.addEventListener('inca:data-ready',()=>requestAnimationFrame(()=>fitAll()));
    window.addEventListener('inca:titan-ready',()=>requestAnimationFrame(()=>fitAll()));
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
