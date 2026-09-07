(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN;};
  const finite=v=>Number.isFinite(num(v));
  const avg=arr=>{const v=arr.map(num).filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:NaN;};
  const smart=(v,d=1)=>{const n=num(v);if(!Number.isFinite(n))return '—';const s=n.toFixed(d);return s.endsWith('.0')?s.slice(0,-2):s;};
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const state={ready:false,wired:false,query:'',selected:null,history:[],tab:'overview',visible:12};

  function face(r,cls='rsh-face'){
    const url=window.INCA_REFEREES?.faceUrl?.(r)||'';
    return `<span class="${cls}">${url?`<img src="${esc(url)}" alt="${esc(r?.name||'Árbitro')}" loading="lazy" decoding="async" onerror="this.remove()">`:''}<i class="fa-solid fa-user-tie"></i></span>`;
  }
  function dateLabel(v){
    const s=String(v||'').trim();if(!s)return '—';let d=null;
    if(/^\d{4}-\d{2}-\d{2}$/.test(s))d=new Date(`${s}T12:00:00`);
    else if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){const [dd,mm,yy]=s.split('/');d=new Date(`${yy}-${mm}-${dd}T12:00:00`);}
    if(!d||Number.isNaN(d.getTime()))return s;
    return new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric'}).format(d).replace('.','');
  }
  function cleanCompetitionName(value){
    let s=String(value||'').replace(/\s+/g,' ').trim();
    if(!s)return 'Competición';
    s=s
      .replace(/^CONMEBOL\s+Libertadores\b/i,'Copa Libertadores')
      .replace(/^CONMEBOL\s+Sudamericana\b/i,'Copa Sudamericana')
      .replace(/^CONMEBOL\s+Recopa(?:\s+Sudamericana)?\b/i,'Recopa Sudamericana')
      .replace(/^UEFA\s+Europa\s+Conference\s+League\b/i,'Conference League')
      .replace(/^UEFA\s+Conference\s+League\b/i,'Conference League')
      .replace(/^UEFA\s+Europa\s+League\b/i,'Europa League')
      .replace(/^UEFA\s+Champions\s+League\b/i,'Champions League');
    const stage=/^(?:group|grupo|qualification|qualifying|qualifier|play-?off|knockout|round|league phase|preliminary|finals?|fase|octavos|cuartos|semifinal|semi-final|relegation|championship round)\b/i;
    const parts=s.split(/\s*,\s*/);
    if(parts.length>1&&stage.test(parts[1]))s=parts[0];
    s=s.replace(/\s+(?:-|–|—)\s+(?:Group|Grupo|Qualification|Qualifying|Play-?off|Knockout|Round|League phase|Preliminary|Finals?|Fase)\b.*$/i,'').trim();
    return s||'Competición';
  }
  function val(r,...keys){for(const k of keys){const n=num(r?.[k]);if(Number.isFinite(n))return n;}return NaN;}
  function totalFouls(r){const t=val(r,'fouls_total','fouls');if(Number.isFinite(t))return t;const h=val(r,'home_fouls'),a=val(r,'away_fouls');return Number.isFinite(h)&&Number.isFinite(a)?h+a:NaN;}
  function firstDisplay(r){const d=String(r?.first_card_minute_display||'').trim();if(d&&d.toLowerCase()!=='null')return `${d}'`;const n=val(r,'first_card_minute');return Number.isFinite(n)?`${smart(n,0)}'`:'—';}
  function pct(a,b){return b>0?Math.round(a*100/b):0;}
  function info(){return window.INCA_REFEREES?.info?.()||{};}

  function overall(item,rows){
    const use=(field,keys)=>finite(item?.[field])?num(item[field]):avg(rows.map(r=>val(r,...keys)));
    return {
      matches:Number(item?.match_count||rows.length||0),
      yellow:use('avg_yellow_cards',['yellow_cards','yellows']),red:use('avg_red_cards',['red_cards','reds']),
      fouls:finite(item?.avg_fouls_total)?num(item.avg_fouls_total):avg(rows.map(totalFouls)),
      first:use('avg_first_card_minute',['first_card_minute']),h1:use('avg_cards_1h',['cards_1h']),h2:use('avg_cards_2h',['cards_2h']),
      y1:avg(rows.map(r=>val(r,'yellow_1h'))),r1:avg(rows.map(r=>val(r,'red_1h'))),
      y2:avg(rows.map(r=>val(r,'yellow_2h'))),r2:avg(rows.map(r=>val(r,'red_2h')))
    };
  }
  function splitStats(rows){
    return {
      hy:avg(rows.map(r=>val(r,'home_yellow_cards'))),ay:avg(rows.map(r=>val(r,'away_yellow_cards'))),
      hr:avg(rows.map(r=>val(r,'home_red_cards'))),ar:avg(rows.map(r=>val(r,'away_red_cards'))),
      hf:avg(rows.map(r=>val(r,'home_fouls'))),af:avg(rows.map(r=>val(r,'away_fouls')))
    };
  }
  function competitionStats(rows){
    const map=new Map();
    for(const r of rows){const k=cleanCompetitionName(r.competition_name||r.competition||'Competición');if(!map.has(k))map.set(k,[]);map.get(k).push(r);}
    return [...map.entries()].map(([name,rr])=>({
      name,matches:rr.length,yellow:avg(rr.map(r=>val(r,'yellow_cards'))),red:avg(rr.map(r=>val(r,'red_cards'))),
      fouls:avg(rr.map(totalFouls)),first:avg(rr.map(r=>val(r,'first_card_minute')))
    })).sort((a,b)=>b.matches-a.matches||a.name.localeCompare(b.name,'es'));
  }
  function featured(){
    const api=window.INCA_REFEREES;if(!api)return [];
    return (api.all?.()||[]).filter(r=>api.hasFace?.(r)&&Number(r.match_count||0)>0)
      .sort((a,b)=>String(b.last_match_date||'').localeCompare(String(a.last_match_date||''))||Number(b.match_count||0)-Number(a.match_count||0)||String(a.name||'').localeCompare(String(b.name||''),'es')).slice(0,12);
  }

  function renderLanding(){
    state.selected=null;state.history=[];state.tab='overview';state.visible=12;
    $('refpLanding')?.removeAttribute('hidden');$('refpProfile')?.setAttribute('hidden','');
    const meta=info(),summary=$('rshDatasetPulse'),host=$('refpFeatured');
    if(summary){
      const dr=meta.dateRange||{};
      summary.innerHTML=`<span><small>BASE</small><b>TITAN V9.3</b><em>2024+ oficial</em></span><span><small>ÁRBITROS</small><b>${Number(meta.count||0).toLocaleString('es-PE')}</b><em>perfiles enlazados</em></span><span><small>COMPETICIONES</small><b>${Number(meta.competitions||0).toLocaleString('es-PE')}</b><em>torneos detectados</em></span><span><small>COBERTURA</small><b>${esc(dateLabel(dr.min||''))}</b><em>hasta ${esc(dateLabel(dr.max||''))}</em></span>`;
    }
    if(!host)return;
    const cards=featured();
    host.innerHTML=cards.length?cards.map(r=>`<button type="button" class="rsh-ref-card" data-ref-open="${esc(r.name)}">
      ${face(r,'rsh-ref-face')}<span class="rsh-ref-copy"><strong>${esc(r.name)}</strong><small>${esc(r.country||'País no indicado')}</small><em>${smart(r.avg_yellow_cards)} amarillas / partido · ${smart(r.avg_red_cards)} rojas / partido</em></span><span class="rsh-ref-go"><i class="fa-solid fa-arrow-right"></i></span>
    </button>`).join(''):`<div class="rsh-empty">No hay perfiles con cara disponibles en el maestro.</div>`;
    host.querySelectorAll('[data-ref-open]').forEach(b=>b.onclick=()=>openProfile(b.dataset.refOpen));
  }
  function renderSuggestions(){
    const host=$('refpSuggestions');if(!host)return;const q=String(state.query||'').trim();
    if(q.length<2){host.hidden=true;host.innerHTML='';return;}
    const rows=(window.INCA_REFEREES?.search?.(q,{minMatches:0})||[]).slice(0,8);host.hidden=false;
    if(!rows.length){host.innerHTML='<div class="rsh-no-result"><i class="fa-solid fa-magnifying-glass"></i><span><b>Sin coincidencias</b><small>Prueba con nombre o apellido.</small></span></div>';return;}
    host.innerHTML=rows.map(r=>`<button type="button" data-ref-suggest="${esc(r.name)}">${face(r,'rsh-suggest-face')}<span><strong>${esc(r.name)}</strong><small>${esc(r.country||'País no indicado')} · histórico disponible desde 2024</small></span><i class="fa-solid fa-chevron-right"></i></button>`).join('');
    host.querySelectorAll('[data-ref-suggest]').forEach(b=>b.onclick=()=>openProfile(b.dataset.refSuggest));
  }

  function matchCard(r){
    const hy=val(r,'home_yellow_cards'),ay=val(r,'away_yellow_cards'),hr=val(r,'home_red_cards'),ar=val(r,'away_red_cards');
    const hf=val(r,'home_fouls'),af=val(r,'away_fouls');
    const totalY=Number.isFinite(hy)&&Number.isFinite(ay)?hy+ay:val(r,'yellow_cards','yellows');
    const totalR=Number.isFinite(hr)&&Number.isFinite(ar)?hr+ar:val(r,'red_cards','reds');
    const totalCards=Number.isFinite(totalY)&&Number.isFinite(totalR)?totalY+totalR:NaN;
    const totalF=Number.isFinite(hf)&&Number.isFinite(af)?hf+af:totalFouls(r);
    const y1=val(r,'yellow_1h'),r1=val(r,'red_1h');
    const cards1=Number.isFinite(y1)&&Number.isFinite(r1)?y1+r1:val(r,'cards_1h');
    const hg=val(r,'home_goals'),ag=val(r,'away_goals'),eid=r.event_id||'';
    const detail=String(r.card_details_raw||'').trim(),home=String(r.home_team||r.home||'Local'),away=String(r.away_team||r.away||'Visitante');
    const n=v=>Number.isFinite(v)?smart(v,0):'—';
    const whistle=`<i class="rsh-whistle-icon" aria-hidden="true"><svg viewBox="0 0 32 20" focusable="false"><path d="M3 7h11.4L17 2.5h10.2l-2.7 5.2h-3.1A7.7 7.7 0 1 1 13.8 7H3z"></path><circle cx="13.8" cy="12.3" r="2.6"></circle><path class="rsh-whistle-wave" d="M27.2 4.1h3M27.1 8.1l2.7 1.5"></path></svg></i>`;
    const cardsIcon=`<i class="rsh-cards-icon" aria-hidden="true"><span class="rsh-card-yellow"></span><span class="rsh-card-red"></span></i>`;
    const stat=(kind,label,value)=>`<span class="rsh-row-stat ${kind}">${kind==='fouls'?whistle:(kind==='cards'?cardsIcon:'<i></i>')}<b>${n(value)}</b><small>${label}</small></span>`;
    const teamMeta=(y,red,f)=>`<span class="rsh-row-team-meta">${stat('yellow','AM',y)}${stat('red','ROJ',red)}${stat('fouls','FALTAS',f)}</span>`;
    return `<article class="rsh-match rsh-match-row-v31">
      <div class="rsh-row-main">
        <div class="rsh-row-team home"><small>LOCAL</small><strong>${esc(home)}</strong>${teamMeta(hy,hr,hf)}</div>
        <div class="rsh-row-score"><b>${Number.isFinite(hg)?smart(hg,0):'—'}<i>–</i>${Number.isFinite(ag)?smart(ag,0):'—'}</b><small>1ª tarjeta ${esc(firstDisplay(r))}</small></div>
        <div class="rsh-row-team away"><small>VISITA</small><strong>${esc(away)}</strong>${teamMeta(ay,ar,af)}</div>
        <div class="rsh-row-first-half"><small>PRIMER TIEMPO</small><div>${stat('yellow','AM',y1)}${stat('red','ROJ',r1)}${stat('cards','TARJ.',cards1)}</div></div>
        <div class="rsh-row-total"><small>TOTAL PARTIDO</small><div>${stat('yellow','AM',totalY)}${stat('red','ROJ',totalR)}${stat('cards','TARJ.',totalCards)}${stat('fouls','FALTAS',totalF)}</div></div>
        <div class="rsh-row-comp"><strong>${esc(cleanCompetitionName(r.competition_name||r.competition||'Competición'))}</strong><span>${esc(dateLabel(r.date_iso||r.date))}</span></div>
      </div>
      <details class="rsh-match-detail"><summary>Detalle <i class="fa-solid fa-chevron-down"></i></summary><div><span><small>EVENT ID</small><b>${esc(eid||'—')}</b></span><span><small>RONDA</small><b>${esc(r.round??'—')}</b></span><span><small>MIN. 1ª TARJETA</small><b class="rsh-first-card-detail">${esc(firstDisplay(r))}</b></span>${detail?`<p>${esc(detail)}</p>`:'<p>Sin incidencias de tarjeta registradas.</p>'}</div></details>
    </article>`;
  }

  function barPair(label,a,b,suffix=''){
    const aa=Number.isFinite(num(a))?num(a):0,bb=Number.isFinite(num(b))?num(b):0,max=Math.max(aa,bb,0.01);
    return `<div class="rsh-compare-row"><header><span>${esc(label)}</span><b>${smart(aa)}${suffix} <i>vs</i> ${smart(bb)}${suffix}</b></header><div class="rsh-bars"><span style="--w:${clamp(aa/max*100,2,100)}%"><i></i><small>LOCAL</small></span><span class="away" style="--w:${clamp(bb/max*100,2,100)}%"><i></i><small>VISITA</small></span></div></div>`;
  }
  function renderOverview(item,rows){
    const o=overall(item,rows),s=splitStats(rows),comps=competitionStats(rows).slice(0,8);
    return `<section class="rsh-overview-grid">
      <article class="rsh-panel rsh-dna"><header><span>DISCIPLINE DNA</span><h2>Cómo dirige sus partidos</h2><p>Comparación LOCAL vs VISITA usando el histórico disponible desde 2024.</p></header>${barPair('Amarillas / partido',s.hy,s.ay)}${barPair('Rojas / partido',s.hr,s.ar)}${barPair('Faltas / partido',s.hf,s.af)}</article>
      <article class="rsh-panel rsh-rhythm"><header><span>DISCIPLINA POR TIEMPO</span><h2>Cuándo aparecen las tarjetas</h2><p>Promedios del partido completo, sin separar por equipo.</p></header><div class="rsh-rhythm-grid"><span><i class="fa-regular fa-clock"></i><b>${Number.isFinite(o.first)?`${smart(o.first,0)}'`:'—'}</b><small>1ª tarjeta promedio</small></span><span><em>1T</em><b>${smart(o.y1)} <i class="rsh-mini-yellow"></i> · ${smart(o.r1)} <i class="rsh-mini-red"></i></b><small>amarillas · rojas</small></span><span><em>2T</em><b>${smart(o.y2)} <i class="rsh-mini-yellow"></i> · ${smart(o.r2)} <i class="rsh-mini-red"></i></b><small>amarillas · rojas</small></span><span><i class="fa-solid fa-layer-group"></i><b>${smart(o.h1)} / ${smart(o.h2)}</b><small>incidentes 1T / 2T</small></span></div></article>
      <article class="rsh-panel rsh-competitions"><header><span>COMPETICIONES</span><h2>Dónde ha arbitrado</h2><p>Promedios por competición; sin usar el total de partidos como KPI principal.</p></header><div class="rsh-comp-list">${comps.map(c=>`<div><strong>${esc(c.name)}</strong><span><b>${smart(c.yellow)}</b><small>AMARILLAS</small></span><span><b>${smart(c.red)}</b><small>ROJAS</small></span><span><b>${smart(c.fouls)}</b><small>FALTAS</small></span><span><b>${Number.isFinite(c.first)?`${smart(c.first,0)}'`:'—'}</b><small>1ª TARJETA</small></span></div>`).join('')}</div></article>
    </section>`;
  }
  function renderMatches(rows){
    const shown=rows.slice(0,state.visible),more=rows.length-shown.length;
    return `<section class="rsh-matches-section"><header class="rsh-section-title"><div><span>HISTORIAL 2024+</span><h2>Partido a partido</h2><p>Tarjetas y faltas por equipo · primer tiempo del partido · totales generales · liga y fecha.</p></div></header><div class="rsh-history-head"><span>LOCAL</span><span>MARCADOR</span><span>VISITA</span><span>1T</span><span>TOTAL</span><span>LIGA / FECHA</span></div><div class="rsh-match-list">${shown.map(matchCard).join('')}</div>${more>0?`<button type="button" class="rsh-load-more" id="rshLoadMore"><span>Cargar más partidos</span><small>Continuar historial disponible</small><i class="fa-solid fa-arrow-down"></i></button>`:'<div class="rsh-end"><i class="fa-solid fa-circle-check"></i>Fin del historial disponible</div>'}</section>`;
  }
  function renderProfile(){
    const item=state.selected,rows=state.history||[],host=$('refpProfile');if(!item||!host)return;
    $('refpLanding')?.setAttribute('hidden','');host.removeAttribute('hidden');const o=overall(item,rows),comps=[...new Set((item.competition_names||[]).map(cleanCompetitionName).filter(Boolean))].slice(0,3);
    host.innerHTML=`<button class="rsh-back" type="button" id="refpBack"><i class="fa-solid fa-arrow-left"></i><span>Referee Stat Hub</span></button>
      <section class="rsh-profile-hero">${face(item,'rsh-profile-face')}<div class="rsh-profile-copy"><span>REFEREE STAT HUB · TITAN V9.3</span><h1>${esc(item.name)}</h1><p><i class="fa-solid fa-location-dot"></i>${esc(item.country||'País no indicado')}<b>·</b> datos desde 2024</p><div>${comps.map(x=>`<em>${esc(x)}</em>`).join('')}</div></div><div class="rsh-hero-kpis"><span><small>AMARILLAS</small><b>${smart(o.yellow)}</b><em>/ partido</em></span><span><small>ROJAS</small><b>${smart(o.red)}</b><em>/ partido</em></span><span><small>FALTAS</small><b>${smart(o.fouls)}</b><em>/ partido</em></span><span><small>1ª TARJETA</small><b>${Number.isFinite(o.first)?`${smart(o.first,0)}'`:'—'}</b><em>promedio</em></span></div></section>
      <nav class="rsh-tabs"><button class="${state.tab==='overview'?'active':''}" data-ref-tab="overview" type="button"><i class="fa-solid fa-chart-simple"></i>Resumen</button><button class="${state.tab==='matches'?'active':''}" data-ref-tab="matches" type="button"><i class="fa-solid fa-list"></i>Histórico de partidos</button></nav>
      <section class="rsh-profile-body">${state.tab==='overview'?renderOverview(item,rows):renderMatches(rows)}</section>`;
    $('refpBack').onclick=()=>{const inp=$('refpSearch');if(inp)inp.value='';state.query='';renderLanding();window.scrollTo({top:0,behavior:'smooth'});};
    host.querySelectorAll('[data-ref-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.refTab;if(state.tab==='matches'&&state.visible<12)state.visible=12;renderProfile();});
    $('rshLoadMore')?.addEventListener('click',()=>{state.visible+=12;renderProfile();document.getElementById('rshLoadMore')?.scrollIntoView({block:'center'});});
    window.scrollTo({top:0,behavior:'smooth'});
  }
  async function openProfile(ref){
    await window.INCA_REFEREES?.ensureReady?.();
    const item=typeof ref==='object'?ref:(Number(ref)?window.INCA_REFEREES?.findById?.(ref):window.INCA_REFEREES?.findByName?.(ref));if(!item)return false;
    state.selected=item;state.tab='overview';state.visible=12;state.history=[];
    $('refpLanding')?.setAttribute('hidden','');const host=$('refpProfile');if(host){host.removeAttribute('hidden');host.innerHTML=`<div class="rsh-profile-loading">${face(item,'rsh-profile-face')}<span><b>${esc(item.name)}</b><small>Cargando historial V9.3…</small></span><i class="fa-solid fa-spinner fa-spin"></i></div>`;}
    state.history=await window.INCA_REFEREES?.history?.(item)||[];renderProfile();return true;
  }
  function wire(){
    if(state.wired)return;state.wired=true;const input=$('refpSearch');
    input?.addEventListener('input',e=>{state.query=e.target.value;renderSuggestions();});
    input?.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const rows=window.INCA_REFEREES?.search?.(state.query,{minMatches:0})||[];if(rows[0])openProfile(rows[0]);});
    document.addEventListener('click',e=>{if(!e.target.closest('.rsh-search')&&!e.target.closest('#refpSuggestions')){const h=$('refpSuggestions');if(h)h.hidden=true;}});
  }
  async function activate(){
    const featured=$('refpFeatured');if(featured&&!state.ready)featured.innerHTML='<div class="rsh-loading"><span></span><b>Conectando TITAN REFEREES V9.3…</b></div>';
    try{await window.INCA_REFEREES?.ensureReady?.();state.ready=true;wire();if(state.selected)renderProfile();else renderLanding();}
    catch(e){console.error('[REFEREE STAT HUB]',e);if(featured)featured.innerHTML='<div class="rsh-empty error"><i class="fa-solid fa-triangle-exclamation"></i><strong>No se pudo cargar TITAN REFEREES V9.3</strong><span>La V1.028 ya no usa el snapshot arbitral antiguo. Revisa que TITAN_REFEREES_CURRENT esté publicado en GitHub.</span></div>';}
  }
  window.INCA_REFEREE_CENTER=Object.freeze({activate,openProfile,open:openProfile,renderLanding,renderProfile});
})();
