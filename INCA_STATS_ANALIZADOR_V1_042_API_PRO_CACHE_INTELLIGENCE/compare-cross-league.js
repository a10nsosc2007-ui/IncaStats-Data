(() => {
'use strict';

const $=id=>document.getElementById(id);
const CORE=()=>window.INCA_BET_CORE;
const TITAN=()=>window.INCA_TITAN;
const esc=v=>CORE().esc(v);
const fmt=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'—';
const smartFmt=(v,kind='value')=>{
  const n=Number(v);
  if(!Number.isFinite(n))return '—';
  if(kind==='raw')return Math.abs(n-Math.round(n))<1e-9?String(Math.round(n)):n.toFixed(1).replace(/\.0$/,'');
  if(Math.abs(n-Math.round(n))<1e-9)return String(Math.round(n));
  return n.toFixed(1).replace(/\.0$/,'');
};

const state={
  initialized:false,
  allTeams:[],
  historyA:null,historyB:null,
  teamA:null,teamB:null,
  contextsA:[],contextsB:[],
  anchorSeasonA:null,anchorSeasonB:null
};

const METRICS={
  goals_total:{label:'Goles · Total partido',market:'goals',mode:'total'},
  goals_team:{label:'Goles · Equipo',market:'goals',mode:'team'},
  goals_rival:{label:'Goles · Rival',market:'goals',mode:'rival'},
  corners_total:{label:'Córners · Total partido',market:'corners',mode:'total'},
  corners_team:{label:'Córners · Equipo',market:'corners',mode:'team'},
  corners_rival:{label:'Córners · Rival',market:'corners',mode:'rival'},
  cards_total:{label:'Tarjetas · Total partido',market:'cards',mode:'total'},
  cards_team:{label:'Tarjetas · Equipo',market:'cards',mode:'team'},
  cards_rival:{label:'Tarjetas · Rival',market:'cards',mode:'rival'},
  booking_total:{label:'Puntos de tarjetas · Total partido',market:'booking',mode:'total'},
  booking_team:{label:'Puntos de tarjetas · Equipo',market:'booking',mode:'team'},
  booking_rival:{label:'Puntos de tarjetas · Rival',market:'booking',mode:'rival'},
  shots_total:{label:'Tiros · Total partido',market:'shots',mode:'total'},
  shots_team:{label:'Tiros · Equipo',market:'shots',mode:'team'},
  shots_rival:{label:'Tiros · Rival',market:'shots',mode:'rival'},
  sot_total:{label:'Tiros al arco · Total partido',market:'sot',mode:'total'},
  sot_team:{label:'Tiros al arco · Equipo',market:'sot',mode:'team'},
  sot_rival:{label:'Tiros al arco · Rival',market:'sot',mode:'rival'},
  shots_ht_total:{label:'Tiros · HT · Total partido',market:'shots_ht',mode:'total',period:'1ST'},
  shots_ht_team:{label:'Tiros · HT · Equipo',market:'shots_ht',mode:'team',period:'1ST'},
  shots_ht_rival:{label:'Tiros · HT · Rival',market:'shots_ht',mode:'rival',period:'1ST'},
  sot_ht_total:{label:'Tiros al arco · HT · Total partido',market:'sot_ht',mode:'total',period:'1ST'},
  sot_ht_team:{label:'Tiros al arco · HT · Equipo',market:'sot_ht',mode:'team',period:'1ST'},
  sot_ht_rival:{label:'Tiros al arco · HT · Rival',market:'sot_ht',mode:'rival',period:'1ST'},
  fouls_total:{label:'Faltas · Total partido',market:'fouls',mode:'total'},
  fouls_team:{label:'Faltas · Equipo',market:'fouls',mode:'team'},
  fouls_rival:{label:'Faltas · Rival',market:'fouls',mode:'rival'},
  offsides_total:{label:'Fueras de juego · Total partido',market:'offsides',mode:'total'},
  offsides_team:{label:'Fueras de juego · Equipo',market:'offsides',mode:'team'},
  offsides_rival:{label:'Fueras de juego · Rival',market:'offsides',mode:'rival'},
  goalkicks_total:{label:'Saques de meta · Total partido',market:'goalkicks',mode:'total'},
  goalkicks_team:{label:'Saques de meta · Equipo',market:'goalkicks',mode:'team'},
  goalkicks_rival:{label:'Saques de meta · Rival',market:'goalkicks',mode:'rival'},
  throwins_total:{label:'Saques de banda · Total partido',market:'throwins',mode:'total'},
  throwins_team:{label:'Saques de banda · Equipo',market:'throwins',mode:'team'},
  throwins_rival:{label:'Saques de banda · Rival',market:'throwins',mode:'rival'},
  tackles_total:{label:'Tackles · Total partido',market:'tackles',mode:'total'},
  tackles_team:{label:'Tackles · Equipo',market:'tackles',mode:'team'},
  tackles_rival:{label:'Tackles · Rival',market:'tackles',mode:'rival'}
};

function metricOptions(){
  const groups=[
    ['Goles',['goals_total','goals_team','goals_rival']],
    ['Córners',['corners_total','corners_team','corners_rival']],
    ['Tarjetas',['cards_total','cards_team','cards_rival']],
    ['Puntos de tarjetas',['booking_total','booking_team','booking_rival']],
    ['Tiros · FT',['shots_total','shots_team','shots_rival']],
    ['Tiros al arco · FT',['sot_total','sot_team','sot_rival']],
    ['Tiros · HT',['shots_ht_total','shots_ht_team','shots_ht_rival']],
    ['Tiros al arco · HT',['sot_ht_total','sot_ht_team','sot_ht_rival']],
    ['Faltas',['fouls_total','fouls_team','fouls_rival']],
    ['Fueras de juego',['offsides_total','offsides_team','offsides_rival']],
    ['Saques de meta',['goalkicks_total','goalkicks_team','goalkicks_rival']],
    ['Saques de banda',['throwins_total','throwins_team','throwins_rival']],
    ['Tackles',['tackles_total','tackles_team','tackles_rival']]
  ];
  return '<option value="">Selecciona una métrica</option>'+
    groups.map(([label,keys])=>`<optgroup label="${esc(label)}">${keys.map(k=>`<option value="${k}">${esc(METRICS[k].label)}</option>`).join('')}</optgroup>`).join('');
}

function norm(v=''){
  return String(v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function compact(v=''){return norm(v).replace(/\s+/g,'');}

function scoreTeam(team,query){
  const q=norm(query), qc=compact(query), name=norm(team.name), nc=compact(team.name);
  if(!q)return 999;
  if(name===q||nc===qc)return 0;
  if(name.startsWith(q)||nc.startsWith(qc))return 1;
  if(name.split(' ').some(w=>w.startsWith(q)))return 2;
  if(name.includes(q)||nc.includes(qc))return 3;
  const tokens=q.split(' ').filter(Boolean);
  if(tokens.length&&tokens.every(t=>name.includes(t)))return 4;
  return 999;
}

function searchTeams(query){
  const q=norm(query);
  if(q.length<2)return [];
  return state.allTeams
    .map(t=>({t,score:scoreTeam(t,q)}))
    .filter(x=>x.score<999)
    .sort((a,b)=>a.score-b.score || String(a.t.name).localeCompare(String(b.t.name),'es',{sensitivity:'base'}))
    .slice(0,12)
    .map(x=>x.t);
}

function logoUrl(team){
  if(!team)return'';
  return TITAN()?.logoUrl?.(team.name,team.team_id)||'';
}

async function setTeamLogo(side,team){
  const img=$(`compareLogo${side}`);
  const crest=img?.closest('.compare-team-crest');
  if(!img||!crest)return;

  img.onload=null;
  img.onerror=null;
  img.removeAttribute('src');
  img.style.display='none';
  img.style.visibility='visible';
  crest.classList.remove('has-team-logo');

  if(!team)return;

  const url=await TITAN()?.resolveLogoUrl?.(team.name,team.team_id).catch(()=>logoUrl(team)) || '';
  if(!url)return;

  img.onload=()=>{
    img.style.visibility='visible';
    img.style.display='block';
    crest.classList.add('has-team-logo');
  };
  img.onerror=()=>{
    img.removeAttribute('src');
    img.style.display='none';
    img.style.visibility='visible';
    crest.classList.remove('has-team-logo');
  };
  img.src=url;
}

function resultLogo(team){
  const url=logoUrl(team);
  return `<span class="compare-result-logo">
    <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
    ${url?`<img src="${esc(url)}" alt="" crossorigin="anonymous" decoding="async" onerror="this.remove()">`:''}
  </span>`;
}

function competitionVisual(side,compId){
  const box=$(`compareCompetitionLogo${side}`);
  if(!box)return;

  const candidates=TITAN()?.competitionLogoCandidates?.(Number(compId))||
    [TITAN()?.competitionLogoUrl?.(Number(compId))].filter(Boolean);

  if(!candidates.length){
    box.classList.remove('has-image');
    box.innerHTML='<i class="fa-solid fa-trophy"></i>';
    return;
  }

  box.classList.add('has-image');
  box.innerHTML='<img alt="" loading="lazy" decoding="async">';
  const img=box.querySelector('img');
  let index=0;

  const tryNext=()=>{
    if(index>=candidates.length){
      box.classList.remove('has-image');
      box.innerHTML='<i class="fa-solid fa-trophy"></i>';
      return;
    }
    img.src=candidates[index++];
  };

  img.onerror=tryNext;
  tryNext();
}

function updateCompetitionVisual(side){
  const sel=$(`compareTournament${side}`);
  const value=sel?.value||'ALL';
  if(value==='ALL'){
    const ctx=state[`contexts${side}`]||[];
    const year=$(`compareYear${side}`)?.value||'';
    const visible=contextsForYear(ctx,year);
    const league=visible.find(c=>String(c.competition_type||'').toUpperCase()==='LEAGUE')||visible[0];
    competitionVisual(side,league?.competition_id||0);
    return;
  }
  const [compId]=value.split('|');
  competitionVisual(side,Number(compId));
}

function yearKey(c){
  const a=Number(c.start_year),b=Number(c.end_year);
  if(!a)return '';
  return `${a}|${b||a}`;
}
function yearLabel(key){
  const [a,b]=String(key).split('|').map(Number);
  if(!a)return 'Temporada';
  return a===b?String(a):`${a}/${String(b).slice(-2)}`;
}
function contextsForYear(contexts,key){
  return (contexts||[]).filter(c=>yearKey(c)===key);
}

function populateYears(side){
  const ctx=state[`contexts${side}`]||[];
  const sel=$(`compareYear${side}`);
  const groups=new Map();
  for(const c of ctx){
    const key=yearKey(c);
    if(!key)continue;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(c);
  }

  const years=[...groups.keys()].sort((a,b)=>{
    const [aa,ab]=a.split('|').map(Number),[ba,bb]=b.split('|').map(Number);
    return bb-ab || ba-aa;
  });

  sel.innerHTML='<option value="">Selecciona año</option>'+
    years.map(k=>`<option value="${k}">${esc(yearLabel(k))}</option>`).join('');
  sel.disabled=!years.length;

  if(years.length){
    sel.value=years[0];
    yearChanged(side);
  }
}

function populateTournament(side){
  const year=$(`compareYear${side}`).value;
  const all=contextsForYear(state[`contexts${side}`],year);
  const sel=$(`compareTournament${side}`);
  sel.innerHTML='<option value="ALL">Todos los torneos del año</option>'+
    all.map(c=>`<option value="${c.key}">${esc(c.competition_name)}${c.season_label?` · ${esc(c.season_label)}`:''}</option>`).join('');
  sel.disabled=!all.length;

  const league=all.find(c=>String(c.competition_type||'').toUpperCase()==='LEAGUE')||all[0]||null;
  state[`anchorSeason${side}`]=league?.season_id||all[0]?.season_id||null;

  $(`compareCondition${side}`).disabled=!all.length;
  $(`compareMetric${side}`).disabled=false;
  updateCompetitionVisual(side);
  updatePicker(side);
}

function yearChanged(side){
  populateTournament(side);
}

function hideSearch(side){
  const box=$(`compareSearchResults${side}`);
  if(box)box.hidden=true;
}
function showSearch(side,query){
  const box=$(`compareSearchResults${side}`);
  if(!box)return;
  const results=searchTeams(query);
  if(!results.length){
    box.innerHTML='<div class="compare-search-empty">No encontré equipos. Prueba con otra parte del nombre.</div>';
    box.hidden=false;
    return;
  }

  box.innerHTML=results.map(t=>{
    const url=logoUrl(t);
    return `<button type="button" class="compare-search-option" data-team-id="${t.team_id}">
      <span class="compare-search-logo"><i class="fa-solid fa-shield-halved"></i>${url?`<img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()">`:''}</span>
      <span><strong>${esc(t.name)}</strong><small>${esc(t.country||t.region||'')}</small></span>
      <i class="fa-solid fa-chevron-right"></i>
    </button>`;
  }).join('');
  box.hidden=false;

  box.querySelectorAll('[data-team-id]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      selectTeam(side,Number(btn.dataset.teamId));
    });
  });
}

function resetSide(side,{keepSearch=false}={}){
  state[`history${side}`]=null;
  state[`team${side}`]=null;
  state[`contexts${side}`]=[];
  state[`anchorSeason${side}`]=null;

  $(`compare${side}`).value='';
  $(`compareTitle${side}`).textContent='Busca un club';
  $(`compareMeta${side}`).textContent='Escribe parte del nombre para comenzar';

  if(!keepSearch)$(`compareSearch${side}`).value='';

  const img=$(`compareLogo${side}`);
  img.removeAttribute('src');
  img.style.display='none';
  img.style.visibility='visible';
  img.closest('.compare-team-crest')?.classList.remove('has-team-logo');

  const year=$(`compareYear${side}`);
  year.innerHTML='<option value="">Selecciona año</option>';year.disabled=true;

  const tournament=$(`compareTournament${side}`);
  tournament.innerHTML='<option value="ALL">Todos los torneos</option>';tournament.disabled=true;

  const cond=$(`compareCondition${side}`);
  cond.value='global';cond.disabled=true;

  const metric=$(`compareMetric${side}`);
  metric.value='';metric.disabled=false;

  const compLogo=$(`compareCompetitionLogo${side}`);
  compLogo.classList.remove('has-image');
  compLogo.innerHTML='<i class="fa-solid fa-magnifying-glass"></i>';
}

async function selectTeam(side,id){
  const catalogTeam=state.allTeams.find(t=>Number(t.team_id)===Number(id));
  if(!catalogTeam)return;

  hideSearch(side);
  $(`compare${side}`).value=String(id);
  $(`compareSearch${side}`).value=catalogTeam.name;
  $(`compareTitle${side}`).textContent=catalogTeam.name;
  $(`compareMeta${side}`).textContent='Preparando historial del equipo…';
  await setTeamLogo(side,catalogTeam);

  const year=$(`compareYear${side}`),tournament=$(`compareTournament${side}`),cond=$(`compareCondition${side}`),metric=$(`compareMetric${side}`);
  year.disabled=true;tournament.disabled=true;cond.disabled=true;metric.disabled=false;

  try{
    const history=await CORE().teamHistory(id);
    state[`history${side}`]=history;
    state[`team${side}`]=history.team;

    let contexts=TITAN()?.teamContexts?.(id,null)||[];
    contexts=contexts.filter(c=>c.start_year&&c.season_id&&c.competition_id);
    state[`contexts${side}`]=contexts;

    $(`compareTitle${side}`).textContent=history.team.name;
    await setTeamLogo(side,history.team);
    populateYears(side);
    $(`compareMeta${side}`).textContent=`${contexts.length} temporadas y torneos disponibles`;
  }catch(e){
    $(`compareMeta${side}`).textContent='Datos del equipo temporalmente no disponibles';
    year.disabled=true;tournament.disabled=true;cond.disabled=true;metric.disabled=false;
  }
}

async function updatePicker(side){
  const history=state[`history${side}`];
  if(!history)return;
  const team=history.team;
  await setTeamLogo(side,team);

  const tournament=$(`compareTournament${side}`).value||'ALL';
  const label=tournament==='ALL'
    ? `Todos los torneos · ${yearLabel($(`compareYear${side}`).value)}`
    : ($(`compareTournament${side}`).selectedOptions[0]?.textContent||'Torneo');

  $(`compareMeta${side}`).textContent=`Muestra: ${label}`;
  updateCompetitionVisual(side);
}

function metricOpts(side){
  const code=$(`compareMetric${side}`).value;
  const m=METRICS[code];
  if(!m)return null;

  const tournament=$(`compareTournament${side}`).value||'ALL';
  let anchor=state[`anchorSeason${side}`];

  if(tournament!=='ALL'){
    const [,seasonId]=tournament.split('|');
    anchor=Number(seasonId)||anchor;
  }

  return{
    anchorSeasonId:Number(anchor),
    tournament,
    conditionFilter:$(`compareCondition${side}`).value||'global',
    period:m.period||'ALL',
    sample:$('compareSample').value||'10',
    market:m.market,
    mode:m.mode
  };
}

async function simpleStats(history,opts){
  const rows=await CORE().valuesFor(history,opts);
  const vals=rows.map(r=>r.value).filter(Number.isFinite);
  const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
  const sorted=[...vals].sort((a,b)=>a-b);
  const med=sorted.length?(sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2):0;
  return{
    rows,n:vals.length,avg,median:med,
    min:vals.length?Math.min(...vals):0,
    max:vals.length?Math.max(...vals):0
  };
}

function metricNoun(metric){
  const map={
    goals:'goles',
    corners:'córners',
    cards:'tarjetas',
    booking:'puntos de tarjeta',
    shots:'tiros',
    sot:'tiros al arco',
    shots_ht:'tiros HT',
    sot_ht:'tiros al arco HT',
    fouls:'faltas',
    offsides:'fueras de juego',
    goalkicks:'saques de meta',
    throwins:'saques de banda',
    tackles:'tackles'
  };
  return map[metric?.market]||'acciones';
}

function modePhrase(mode,teamName){
  if(mode==='team')return `${teamName} produce`;
  if(mode==='rival')return `${teamName} permite`;
  return `En los partidos de ${teamName} hay`;
}

function comparisonRead(hA,a,mA,hB,b,mB){
  const nameA=hA.team.name,nameB=hB.team.name,noun=metricNoun(mA);
  const left=`${modePhrase(mA.mode,nameA)} ${smartFmt(a.avg)} ${noun} por partido`;
  const right=`${modePhrase(mB.mode,nameB).toLowerCase()} ${smartFmt(b.avg)}`;
  const diff=Math.abs(a.avg-b.avg);

  let tag='Cruce de promedios';
  if(mA.mode==='team'&&mB.mode==='rival')tag='Producción A vs concesión B';
  else if(mA.mode==='rival'&&mB.mode==='team')tag='Concesión A vs producción B';
  else if(mA.mode===mB.mode)tag='Comparación directa';

  return {
    tag,
    text:`${left}; ${right}. Diferencia de la muestra: ${smartFmt(diff)}.`,
    diff
  };
}

function card(side,history,stats,metric){
  const team=history.team;
  const range=`${smartFmt(stats.min,'raw')} – ${smartFmt(stats.max,'raw')}`;

  return `<article class="compare-pro-team compare-pro-team-v42714 side-${side.toLowerCase()}">
    <header>
      ${resultLogo(team)}
      <div class="compare-result-team-copy">
        <small>EQUIPO ${side}</small>
        <h2>${esc(team.name)}</h2>
        <span>${stats.n} partidos en la muestra</span>
      </div>
      <span class="compare-result-role">${esc(metric.mode==='team'?'PRODUCE':metric.mode==='rival'?'PERMITE':'TOTAL PARTIDO')}</span>
    </header>

    <div class="compare-main-kpi compare-main-kpi-v42714">
      <div>
        <span>${esc(metric.label)}</span>
        <strong>${smartFmt(stats.avg)}</strong>
        <small>promedio por partido</small>
      </div>
      <div class="compare-kpi-mini">
        <div><span>Mediana</span><b>${smartFmt(stats.median)}</b></div>
        <div><span>Rango</span><b>${range}</b></div>
        <div><span>Muestra</span><b>${stats.n}</b></div>
      </div>
    </div>
  </article>`;
}

function recent(stats,metric,team){
  return `<section class="compare-recent compare-recent-v42714">
    <header class="compare-recent-head">
      <div>
        <i class="fa-solid fa-clock-rotate-left"></i>
        <span>
          <b>${esc(team.name)}</b>
          <small>Partidos usados · ${esc(metric.label)}</small>
        </span>
      </div>
      <strong>${stats.n}</strong>
    </header>
    <div class="compare-recent-list">${
      stats.rows.map(r=>`
        <article class="compare-used-match">
          <time>${esc(r.date)}</time>
          <span class="compare-used-condition ${r.condition==='LOCAL'?'is-home':'is-away'}">
            ${esc(r.condition||'—')}
          </span>
          <div class="compare-used-rival">
            <b>vs ${esc(r.opponent||'Rival')}</b>
            <small>${esc(r.context?.competition_name||'Torneo')}</small>
          </div>
          <em>${smartFmt(r.value,'raw')}</em>
        </article>`).join('')
    }</div>
  </section>`;
}

function sideReady(side){
  return Boolean(
    state[`history${side}`] &&
    $(`compareYear${side}`).value &&
    $(`compareTournament${side}`).value &&
    $(`compareMetric${side}`).value
  );
}

function updateRunButton(){
  const btn=$('runComparison');
  const ready=sideReady('A')&&sideReady('B');
  btn.disabled=!ready;
  btn.classList.toggle('is-ready',ready);
}

async function run(){
  const out=$('compareResult'),btn=$('runComparison');
  btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i><span>Comparando</span>';
  try{
    const hA=state.historyA,hB=state.historyB;
    const oA=metricOpts('A'),oB=metricOpts('B');
    if(!hA||!hB)throw new Error('Selecciona los dos equipos.');
    if(!oA||!oB)throw new Error('Selecciona una métrica para cada equipo.');

    const [a,b]=await Promise.all([simpleStats(hA,oA),simpleStats(hB,oB)]);
    if(!a.n||!b.n)throw new Error('No hay muestra suficiente en uno de los lados.');

    const mA=METRICS[$('compareMetricA').value],mB=METRICS[$('compareMetricB').value];
    const read=comparisonRead(hA,a,mA,hB,b,mB);
    const totalAvg=Math.max(0,a.avg)+Math.max(0,b.avg);
    const shareA=totalAvg>0?Math.max(8,Math.min(92,a.avg/totalAvg*100)):50;
    const sampleText=$('compareSample').value==='ALL'?'Toda la muestra':`Últimos ${$('compareSample').value}`;

    out.innerHTML=`
      <section class="compare-result-hero">
        <div class="compare-result-hero-copy">
          <span>LECTURA DEL CRUCE</span>
          <h2>${esc(read.tag)}</h2>
          <p>${esc(read.text)}</p>
        </div>
        <div class="compare-result-sample">
          <small>MUESTRA</small>
          <strong>${esc(sampleText)}</strong>
          <span>${a.n} vs ${b.n} partidos válidos</span>
        </div>
      </section>

      <section class="compare-balance-v42714">
        <div class="compare-balance-labels">
          <span><b>A</b> ${esc(hA.team.name)}</span>
          <strong>${smartFmt(a.avg)} <i>vs</i> ${smartFmt(b.avg)}</strong>
          <span>${esc(hB.team.name)} <b>B</b></span>
        </div>
        <div class="compare-balance-track">
          <i style="width:${shareA}%"></i>
        </div>
      </section>

      <div class="compare-pro-grid compare-pro-grid-v42714">
        ${card('A',hA,a,mA)}
        <div class="compare-vs-pro compare-vs-pro-v42714">
          <span>VS</span>
          <small>Δ ${smartFmt(read.diff)}</small>
        </div>
        ${card('B',hB,b,mB)}
      </div>

      <div class="compare-recent-grid compare-recent-grid-v42714">
        ${recent(a,mA,hA.team)}
        ${recent(b,mB,hB.team)}
      </div>`;
  }catch(e){
    out.innerHTML=`<div class="portal-empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>No se pudo comparar</h3><p>${esc(e.message)}</p></div>`;
  }finally{
    btn.innerHTML='<i class="fa-solid fa-chart-simple"></i><span>Comparar equipos</span>';
    updateRunButton();
  }
}

function bindSearch(side){
  const input=$(`compareSearch${side}`);
  let timer=null;

  input.addEventListener('input',()=>{
    clearTimeout(timer);
    const q=input.value;
    if(Number($(`compare${side}`).value)){
      $(`compare${side}`).value='';
      state[`history${side}`]=null;
      state[`team${side}`]=null;
      $(`compareMetric${side}`).disabled=false;
    }
    timer=setTimeout(()=>showSearch(side,q),70);
    updateRunButton();
  });

  input.addEventListener('focus',()=>{
    if(input.value.trim().length>=2)showSearch(side,input.value);
  });

  input.addEventListener('keydown',e=>{
    if(e.key==='Escape')hideSearch(side);
    if(e.key==='Enter'){
      const first=$(`compareSearchResults${side}`)?.querySelector('[data-team-id]');
      if(first){e.preventDefault();first.click();}
    }
  });
}

async function init(){
  if(state.initialized)return;
  state.initialized=true;

  await TITAN()?.ensureReady?.();
  await TITAN()?.ensureTeamDetails?.();
  await TITAN()?.ensureLogoIndex?.().catch(()=>{});

  state.allTeams=(TITAN()?.getCatalog?.()?.teams||[])
    .filter(t=>Number(t.team_id)&&String(t.name||'').trim())
    .map(t=>({
      team_id:Number(t.team_id),
      name:String(t.name||'').trim(),
      country:String(t.country||'').trim(),
      region:String(t.region||'').trim()
    }))
    .sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));

  $('compareMetricA').innerHTML=metricOptions();
  $('compareMetricB').innerHTML=metricOptions();

  for(const side of ['A','B']){
    bindSearch(side);
    resetSide(side);

    $(`compareYear${side}`).addEventListener('change',()=>{
      yearChanged(side);
      updateRunButton();
    });
    $(`compareTournament${side}`).addEventListener('change',()=>{
      updatePicker(side);
      updateRunButton();
    });
    $(`compareCondition${side}`).addEventListener('change',updateRunButton);
    $(`compareMetric${side}`).addEventListener('change',updateRunButton);
  }

  $('compareSample').addEventListener('change',updateRunButton);
  $('runComparison').addEventListener('click',run);

  document.addEventListener('click',e=>{
    if(!e.target.closest('.compare-team-search')){
      hideSearch('A');hideSearch('B');
    }
  });

  $('compareDataStatus').innerHTML=`<i class="fa-solid fa-magnifying-glass"></i><span>Busca cualquier equipo TITAN por nombre. ${state.allTeams.length} equipos indexados.</span>`;
  updateRunButton();
}

async function activate(){await init();}
window.INCA_COMPARE=Object.freeze({activate,run,metricOptions,metrics:METRICS});
})();