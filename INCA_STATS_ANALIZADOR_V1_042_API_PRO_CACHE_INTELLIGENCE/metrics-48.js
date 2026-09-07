(() => {
'use strict';

const $=id=>document.getElementById(id);
const TITAN=()=>window.INCA_TITAN;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const num=v=>{
  if(v===null||v===undefined||v==='')return null;
  const x=Number(String(v).replace('%','').replace(',','.').trim());
  return Number.isFinite(x)?x:null;
};

const METRIC_GROUPS=[
  ['BASE',[
    'Goals','Ball possession','Expected goals','Big chances','Total shots',
    'Goalkeeper saves','Corner kicks','Fouls','Passes','Tackles','Free kicks',
    'Yellow cards','Red cards'
  ]],
  ['ATAQUE Y TIROS',[
    'Shots on target','Hit woodwork','Shots off target','Blocked shots',
    'Shots inside box','Shots outside box','Big chances scored','Big chances missed',
    'Through balls','Touches in penalty area','Fouled in final third','Offsides'
  ]],
  ['PASE Y TERRITORIO',[
    'Accurate passes','Throw-ins','Final third entries','Final third phase',
    'Long balls','Crosses'
  ]],
  ['DUELOS Y DEFENSA',[
    'Duels','Dispossessed','Ground duels','Aerial duels','Dribbles',
    'Tackles won','Total tackles','Interceptions','Recoveries','Clearances',
    'Errors lead to a shot'
  ]],
  ['PORTERO',[
    'Total saves','Goals prevented','Big saves','High claims','Punches','Goal kicks'
  ]]
];

const LABELS={
  'Goals':'Goles',
  'Ball possession':'Posesión',
  'Expected goals':'xG',
  'Big chances':'Grandes ocasiones',
  'Total shots':'Tiros totales',
  'Goalkeeper saves':'Atajadas del portero',
  'Corner kicks':'Córners',
  'Fouls':'Faltas',
  'Passes':'Pases',
  'Tackles':'Tackles',
  'Free kicks':'Tiros libres',
  'Yellow cards':'Tarjetas amarillas',
  'Red cards':'Tarjetas rojas',
  'Shots on target':'Tiros al arco',
  'Hit woodwork':'Tiros al palo',
  'Shots off target':'Tiros fuera',
  'Blocked shots':'Tiros bloqueados',
  'Shots inside box':'Tiros dentro del área',
  'Shots outside box':'Tiros fuera del área',
  'Big chances scored':'Grandes ocasiones convertidas',
  'Big chances missed':'Grandes ocasiones falladas',
  'Through balls':'Pases filtrados',
  'Touches in penalty area':'Toques en el área',
  'Fouled in final third':'Faltas recibidas en último tercio',
  'Offsides':'Fueras de juego',
  'Accurate passes':'Pases precisos',
  'Throw-ins':'Saques de banda',
  'Final third entries':'Entradas al último tercio',
  'Final third phase':'Fase en último tercio',
  'Long balls':'Balones largos',
  'Crosses':'Centros',
  'Duels':'Duelos',
  'Dispossessed':'Pérdidas por desposesión',
  'Ground duels':'Duelos al suelo',
  'Aerial duels':'Duelos aéreos',
  'Dribbles':'Regates',
  'Tackles won':'Tackles ganados',
  'Total tackles':'Tackles totales',
  'Interceptions':'Intercepciones',
  'Recoveries':'Recuperaciones',
  'Clearances':'Despejes',
  'Errors lead to a shot':'Errores que terminan en tiro',
  'Total saves':'Atajadas totales',
  'Goals prevented':'Goles evitados',
  'Big saves':'Grandes atajadas',
  'High claims':'Balones aéreos atrapados',
  'Punches':'Despejes de puños',
  'Goal kicks':'Saques de meta'
};

const DEFAULT_LINES={
  'Goals':2.5,
  'Ball possession':50.5,
  'Expected goals':1.5,
  'Big chances':2.5,
  'Total shots':10.5,
  'Goalkeeper saves':2.5,
  'Corner kicks':4.5,
  'Fouls':10.5,
  'Passes':350.5,
  'Tackles':14.5,
  'Free kicks':10.5,
  'Yellow cards':1.5,
  'Red cards':0.5,
  'Shots on target':3.5,
  'Hit woodwork':0.5,
  'Shots off target':4.5,
  'Blocked shots':2.5,
  'Shots inside box':6.5,
  'Shots outside box':3.5,
  'Big chances scored':0.5,
  'Big chances missed':0.5,
  'Through balls':0.5,
  'Touches in penalty area':20.5,
  'Fouled in final third':2.5,
  'Offsides':1.5,
  'Accurate passes':300.5,
  'Throw-ins':17.5,
  'Final third entries':35.5,
  'Long balls':35.5,
  'Crosses':12.5,
  'Duels':45.5,
  'Dispossessed':8.5,
  'Ground duels':30.5,
  'Aerial duels':10.5,
  'Dribbles':7.5,
  'Tackles won':8.5,
  'Total tackles':14.5,
  'Interceptions':7.5,
  'Recoveries':40.5,
  'Clearances':15.5,
  'Errors lead to a shot':0.5,
  'Total saves':2.5,
  'Goals prevented':0.5,
  'Big saves':0.5,
  'High claims':0.5,
  'Punches':0.5,
  'Goal kicks':6.5
};

const state={
  initialized:false,
  dataset:null,
  competitionId:null,
  seasonId:null
};

function fmt(v){
  if(!Number.isFinite(Number(v)))return '—';
  const n=Number(v);
  return Math.abs(n)>=100?n.toFixed(0):Math.abs(n)>=10?n.toFixed(1):n.toFixed(2);
}

function parseDate(v){
  const s=String(v||'').trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s))return new Date(s).getTime()||0;
  const m=/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(s);
  if(m)return new Date(Number(m[3]),Number(m[2])-1,Number(m[1])).getTime()||0;
  return new Date(s).getTime()||0;
}

function cond(row){
  const v=String(row?.Condicion||'').toUpperCase();
  if(v==='LOCAL'||v==='HOME')return'home';
  if(v==='VISITA'||v==='AWAY'||v==='VISITANTE')return'away';
  return'';
}

function metricOptions(){
  return METRIC_GROUPS.map(([g,items])=>
    `<optgroup label="${esc(g)}">${items.map(m=>`<option value="${esc(m)}">${esc(LABELS[m]||m)}</option>`).join('')}</optgroup>`
  ).join('');
}

function competitionOptions(){
  return (TITAN()?.CURATED_COMPETITIONS||[])
    .map(c=>`<option value="${c.id}">${esc(c.country)} · ${esc(c.name)}</option>`).join('');
}

function seasonsFor(compId){
  return (TITAN()?.getCatalog?.()?.seasons||[])
    .filter(s=>Number(s.competition_id)===Number(compId))
    .sort((a,b)=>
      Number(b.season_status==='CURRENT')-Number(a.season_status==='CURRENT') ||
      (Number(b.start_year)||0)-(Number(a.start_year)||0)
    );
}

function suggestedLineFor(metric,time){
  if(time==='1ST' && metric==='Total shots') return 5.5;
  if(time==='1ST' && metric==='Shots on target') return 1.5;
  return DEFAULT_LINES[metric] ?? 0.5;
}

function syncSuggestedLine(){
  const metric=$('m48Metric')?.value;
  const time=$('m48Time')?.value||'ALL';
  const input=$('m48Line');
  if(!metric||!input)return;
  input.value=String(suggestedLineFor(metric,time));
}

function renderSeasons(){
  const compId=Number($('m48Competition').value);
  const seasons=seasonsFor(compId);
  $('m48Season').innerHTML=seasons.map(s=>
    `<option value="${s.season_id}">${esc(s.label||`${s.start_year}/${s.end_year}`)}${s.season_status==='CURRENT'?' · ACTUAL':''}</option>`
  ).join('');
  state.dataset=null;
  $('m48Status').textContent='Elige métrica y pulsa Analizar.';
}

function teamName(id){
  return TITAN()?.getCatalog?.()?.teams?.find(t=>Number(t.team_id)===Number(id))?.name || `Equipo ${id}`;
}

function teamLogo(id,name){
  return TITAN()?.logoUrl?.(name,id)||'';
}

function pairRows(data,time){
  const rows=data.filter(r=>String(r.Tiempo||'').toUpperCase()===time);
  const byEvent=new Map();
  for(const r of rows){
    const eid=String(r.Event_ID||'');
    if(!eid||!Number(r.Team_ID))continue;
    if(!byEvent.has(eid))byEvent.set(eid,[]);
    byEvent.get(eid).push(r);
  }
  const out=[];
  for(const [eid,arr] of byEvent){
    const valid=arr.filter(r=>Number(r.Team_ID));
    if(valid.length<2)continue;
    for(const own of valid){
      const opp=valid.find(x=>Number(x.Team_ID)!==Number(own.Team_ID));
      if(!opp)continue;
      out.push({
        eventId:eid,
        teamId:Number(own.Team_ID),
        team:teamName(own.Team_ID),
        date:String(own.Fecha||''),
        sortTime:parseDate(own.Fecha),
        condition:cond(own),
        own,opp
      });
    }
  }
  return out;
}

function labelsFor(metric,sort){
  const base=LABELS[metric]||metric;
  const more=sort==='desc';

  const ownSpecial={
    'Goals':more?'Más goles marcados':'Menos goles marcados',
    'Total shots':more?'Más tiros realizados':'Menos tiros realizados',
    'Shots on target':more?'Más tiros al arco':'Menos tiros al arco',
    'Corner kicks':more?'Más córners a favor':'Menos córners a favor',
    'Yellow cards':more?'Más amarillas propias':'Menos amarillas propias',
    'Red cards':more?'Más rojas propias':'Menos rojas propias',
    'Ball possession':more?'Mayor posesión':'Menor posesión'
  };
  const rivalSpecial={
    'Goals':more?'Más goles recibidos':'Menos goles recibidos',
    'Total shots':more?'Más tiros permitidos':'Menos tiros permitidos',
    'Shots on target':more?'Más tiros al arco permitidos':'Menos tiros al arco permitidos',
    'Corner kicks':more?'Más córners concedidos':'Menos córners concedidos',
    'Yellow cards':more?'Más amarillas del rival':'Menos amarillas del rival',
    'Red cards':more?'Más rojas del rival':'Menos rojas del rival',
    'Ball possession':more?'Mayor posesión del rival':'Menor posesión del rival'
  };

  return{
    own:ownSpecial[metric] || `${more?'Más':'Menos'} ${base.toLowerCase()} del equipo`,
    against:rivalSpecial[metric] || `${more?'Más':'Menos'} ${base.toLowerCase()} del rival`
  };
}

function buildRanking(pairs,metric,which,sample,condition,sort,line,direction,rankBy){
  const byTeam=new Map();

  for(const p of pairs){
    if(condition!=='global'&&p.condition!==condition)continue;
    const v=num(which==='own'?p.own?.[metric]:p.opp?.[metric]);
    if(v===null)continue;
    if(!byTeam.has(p.teamId))byTeam.set(p.teamId,[]);
    byTeam.get(p.teamId).push({...p,value:v});
  }

  const limit=sample==='ALL'?Infinity:Number(sample);
  const rows=[];
  for(const [teamId,list] of byTeam){
    list.sort((a,b)=>b.sortTime-a.sortTime||Number(b.eventId)-Number(a.eventId));
    const cut=list.slice(0,limit);
    if(!cut.length)continue;
    const avg=cut.reduce((a,b)=>a+b.value,0)/cut.length;
    const hasLine=Number.isFinite(line);
    const hits=hasLine?cut.filter(x=>direction==='under'?x.value<line:x.value>line).length:0;
    const hitRate=hasLine?(hits/cut.length)*100:null;
    rows.push({
      teamId,
      team:cut[0].team,
      avg,
      n:cut.length,
      latest:cut[0].date,
      hits,
      hitRate
    });
  }

  rows.sort((a,b)=>{
    if(rankBy==='hit'&&Number.isFinite(a.hitRate)&&Number.isFinite(b.hitRate)){
      return b.hitRate-a.hitRate || (sort==='desc'?b.avg-a.avg:a.avg-b.avg);
    }
    return sort==='desc'?b.avg-a.avg:a.avg-b.avg;
  });
  return rows;
}

function renderRanking(targetId,title,rows,sample,line,direction){
  const target=$(targetId);
  const top=rows.slice(0,15);
  if(!top.length){
    target.innerHTML=`<div class="m48-empty">No hay datos suficientes para esta métrica/filtro.</div>`;
    return;
  }

  const expected=sample==='ALL'?null:Number(sample);
  const targetText=Number.isFinite(line)?`${direction==='under'?'Under':'Over'} ${fmt(line)}`:'Sin línea';
  target.innerHTML=`
    <div class="m48-rank-title"><span>${esc(title)}</span><small>${esc(targetText)}</small></div>
    <div class="m48-rank-list">
      ${top.map((r,i)=>{
        const logo=teamLogo(r.teamId,r.team);
        const rate=Number.isFinite(r.hitRate)?r.hitRate:null;
        const coverage=expected?Math.min(100,(r.n/expected)*100):100;
        return `<div class="m48-rank-row">
          <span class="m48-pos">${String(i+1).padStart(2,'0')}</span>
          <span class="m48-team-logo">${logo?`<img src="${esc(logo)}" alt="" loading="lazy" onerror="this.style.display='none'">`:'<i class="fa-solid fa-shield"></i>'}</span>
          <span class="m48-team"><b>${esc(r.team)}</b><small>${r.n}${expected?`/${expected}`:''} partidos · cobertura ${coverage.toFixed(0)}%</small></span>
          <span class="m48-hit-cell">
            <strong>${rate===null?'—':`${rate.toFixed(1)}%`}</strong>
            <small>${rate===null?'sin línea':`${r.hits}/${r.n} cumplen`}</small>
            <i class="m48-hit-track"><b style="width:${rate===null?0:Math.max(0,Math.min(100,rate))}%"></b></i>
          </span>
          <span class="m48-avg-cell"><small>PROM.</small><strong>${fmt(r.avg)}</strong></span>
        </div>`;
      }).join('')}
    </div>`;
}

async function analyze(){
  const compId=Number($('m48Competition').value);
  const seasonId=Number($('m48Season').value);
  const metric=$('m48Metric').value;
  const time=$('m48Time').value;
  const sample=$('m48Sample').value;
  const condition=$('m48Condition').value;
  const sort=$('m48Sort').value;
  const direction=$('m48Direction')?.value||'over';
  const line=num($('m48Line')?.value);
  const rankBy=$('m48RankBy')?.value||'hit';

  if(!compId||!seasonId||!metric)return;

  const button=$('m48Run');
  button.disabled=true;
  button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Cargando…';
  $('m48Status').textContent='Cargando equipos y métricas TITAN…';

  try{
    if(!state.dataset || state.competitionId!==compId || state.seasonId!==seasonId){
      state.dataset=await TITAN().loadCompetitionSeason(compId,seasonId,({completed,total,team})=>{
        $('m48Status').textContent=`Cargando ${completed}/${total}${team?` · ${team}`:''}`;
      });
      state.competitionId=compId;
      state.seasonId=seasonId;
    }

    const pairs=pairRows(state.dataset.data,time);
    const own=buildRanking(pairs,metric,'own',sample,condition,sort,line,direction,rankBy);
    const against=buildRanking(pairs,metric,'against',sample,condition,sort,line,direction,rankBy);
    const titles=labelsFor(metric,sort);

    $('m48MetricTitle').textContent=LABELS[metric]||metric;
    $('m48Context').textContent=`${state.dataset.label} · ${time==='ALL'?'FT':time==='1ST'?'1T':'2T'} · ${condition==='global'?'Global':condition==='home'?'Local':'Visita'} · ${sample==='ALL'?'Temporada completa':`Últimos ${sample}`} · ${direction==='under'?'Under':'Over'} ${Number.isFinite(line)?fmt(line):'—'}`;
    renderRanking('m48Own',titles.own,own,sample,line,direction);
    renderRanking('m48Against',titles.against,against,sample,line,direction);

    const teams=Math.max(own.length,against.length);
    $('m48Status').textContent=`Listo · ${teams} equipos con datos · nulls excluidos`;
  }catch(e){
    $('m48Status').textContent=e.message||'Error cargando datos';
    $('m48Own').innerHTML='<div class="m48-empty">No se pudo cargar esta muestra.</div>';
    $('m48Against').innerHTML='';
  }finally{
    button.disabled=false;
    button.innerHTML='<i class="fa-solid fa-ranking-star"></i> Analizar métrica';
  }
}

async function init(){
  if(state.initialized)return;
  state.initialized=true;

  await TITAN()?.ensureReady?.();
  await TITAN()?.ensureTeamDetails?.();
  TITAN()?.ensureLogoIndex?.().catch(()=>{});

  $('m48Competition').innerHTML=competitionOptions();
  $('m48Metric').innerHTML=metricOptions();
  const applyDefaultLine=()=>{
    const metric=$('m48Metric')?.value;
    const line=$('m48Line');
    if(line&&metric&&DEFAULT_LINES[metric]!==undefined)line.value=String(DEFAULT_LINES[metric]);
  };
  $('m48Metric')?.addEventListener('change',()=>{applyDefaultLine();});
  applyDefaultLine();

  $('m48Competition').addEventListener('change',()=>{
    renderSeasons();
    state.dataset=null;
  });
  $('m48Season').addEventListener('change',()=>{state.dataset=null;});
  $('m48Run').addEventListener('click',analyze);
  $('m48Metric')?.addEventListener('change',syncSuggestedLine);
  $('m48Time')?.addEventListener('change',syncSuggestedLine);

  renderSeasons();
  $('m48Status').textContent='48 métricas TITAN listas · cálculo directo desde los CSV del contexto seleccionado.';
}

window.INCA_METRICS48=Object.freeze({activate:init,analyze});
})();