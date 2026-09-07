(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toLowerCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function selectedSeasonIsCurrent(compId){
    const select=$('selectTemporada');
    const option=select?.options?.[select.selectedIndex];
    const optionStatus=String(option?.dataset?.status||'').toUpperCase();
    const optionText=String(option?.textContent||'');
    const selectedId=Number(window.INCA_TITAN?.seasonId?.(select?.value)||0);
    const currentId=Number(window.INCA_TITAN?.currentSeasonForCompetition?.(compId)?.season_id||0);

    if(selectedId&&currentId)return selectedId===currentId;
    if(optionStatus)return optionStatus==='CURRENT';
    return /(?:·\s*ACTUAL|\bCURRENT\b)/i.test(optionText);
  }

  function removeModuleThemeControls(root=document){
    if(!root?.querySelectorAll)return;
    root.querySelectorAll('.theme-toggle-btn,[id^="darkModeToggle"],.rk-theme-toggle,[title="Cambiar Tema"],[aria-label="Cambiar Tema"]')
      .forEach(node=>node.remove());
  }

  /* ---------- lenguaje de producto: no enseñar plumbing interno ---------- */
  const replacements=[
    [/Pendiente\s+API/gi,'Por definir'],
    [/TITAN\s+FIXTURES/gi,'Agenda de partidos'],
    [/TITAN\s+PLAYERS/gi,'Datos de jugadores'],
    [/TITAN\s+DATA/gi,'Datos de temporada'],
    [/Base\s+TITAN/gi,'Base de temporada'],
    [/CSV(?:s)?\s+actual(?:es)?/gi,'datos actuales'],
    [/CSV(?:s)?/gi,'datos'],
    [/GitHub/gi,'agenda central'],
    [/0\s*(?:llamadas?\s+a\s+)?API(?:-Football)?\s*(?:\/|por\s*)?clic/gi,'sin recargas manuales'],
    [/0\s*API\s*POR\s*FILTRO/gi,'cálculo instantáneo'],
    [/API-Football/gi,'servicio de partidos'],
    [/\bAPI\b/gi,'servicio'],
    [/\bTITAN\b/gi,'IncaStats']
  ];
  function friendlyText(text){
    let out=String(text||'');
    for(const [rx,to] of replacements) out=out.replace(rx,to);
    out=out.replace(/IncaStats\s*·\s*0\s*servicio\s*\/\s*CLIC/gi,'Agenda lista');
    out=out.replace(/servicio\s*\/\s*CLIC/gi,'carga instantánea');
    return out;
  }
  function sanitizeNode(root=document.body){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
      const p=node.parentElement;if(!p||['SCRIPT','STYLE','TEXTAREA'].includes(p.tagName))return NodeFilter.FILTER_REJECT;
      return /TITAN|CSV|API|GitHub/i.test(node.nodeValue||'')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
    }});
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(n=>{const next=friendlyText(n.nodeValue);if(next!==n.nodeValue)n.nodeValue=next;});
    const attrEls=[];
    if(root.nodeType===1&&root.matches?.('[title],[aria-label]'))attrEls.push(root);
    root.querySelectorAll?.('[title],[aria-label]').forEach(el=>attrEls.push(el));
    attrEls.forEach(el=>{for(const a of ['title','aria-label']){const v=el.getAttribute(a);if(v&&/TITAN|CSV|API|GitHub/i.test(v))el.setAttribute(a,friendlyText(v));}});
  }

  const blockedIds=new Set(['refreshFixtures','fxRefresh','adminFootballSync','adminOddsSync','footballSyncButton','oddsSyncButton']);
  function removeOperationalRefresh(root=document){
    root.querySelectorAll?.('button').forEach(btn=>{
      const text=(btn.textContent||'').trim();
      if(blockedIds.has(btn.id)||/\b(?:actualizar|refrescar|sincronizar)\b.*\b(?:api|servicio|football|odds)\b/i.test(text)||/\b(?:api|servicio|football|odds)\b.*\b(?:actualizar|refrescar|sincronizar)\b/i.test(text)){
        btn.remove();
      }
    });
  }

  /* ---------- Next Match Bridge del analizador ---------- */
  function logo(name,id){try{return window.INCA_TITAN?.logoUrl?.(name,id)||''}catch{return''}}
  function competitionId(){try{return Number(window.INCA_TITAN?.competitionId?.($('selectLiga')?.value))||0}catch{return 0}}
  function teamIdForName(name,compId){
    const teams=window.INCA_TITAN?.getCatalog?.()?.teams||[];
    const n=norm(name);
    const exact=teams.find(t=>norm(t.name)===n&&(!compId||Number(t.competition_id||t.Competition_ID||0)===Number(compId)))||teams.find(t=>norm(t.name)===n);
    return Number(exact?.team_id||exact?.Team_ID||0)||0;
  }
  function peruParts(iso){
    const d=new Date(iso);if(!Number.isFinite(d.getTime()))return {time:'—',date:'Fecha por definir'};
    const time=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit'}).format(d);
    const date=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'short',day:'2-digit',month:'short'}).format(d);
    return {time,date};
  }
  function nextHost(){
    let host=$('scannerNextFixture');
    if(host)return host;
    host=document.createElement('section');
    host.id='scannerNextFixture';
    host.className='scanner-next-fixture-card editor-panel-style';
    host.setAttribute('aria-label','Próximo partido de la temporada actual');
    host.hidden=true;
    return host;
  }
  function placeNextHost(host,ctx){
    const home=$('homeTableWrapper');
    const away=$('awayTableWrapper');
    const target=ctx?.isHome?home:away;
    if(!host||!target)return false;

    home?.classList.remove('has-next-fixture');
    away?.classList.remove('has-next-fixture');

    if(host.parentElement!==target)target.appendChild(host);
    target.classList.add('has-next-fixture');

    host.dataset.condition=ctx?.isHome?'HOME':'AWAY';
    host.hidden=false;
    return true;
  }
  function hideNextHost(host){
    if(!host)return;
    host.hidden=true;
    $('homeTableWrapper')?.classList.remove('has-next-fixture');
    $('awayTableWrapper')?.classList.remove('has-next-fixture');
  }
  async function findNext(){
    const selected=String($('selectEquipo')?.value||'').trim();
    const comp=competitionId();
    if(!selected||!comp)return null;

    try{
      await Promise.all([
        window.INCA_FIXTURES?.ensureReady?.(),
        window.INCA_TITAN?.ensureReady?.()
      ]);
    }catch{return null}

    // El banner pertenece EXCLUSIVAMENTE a la campaña actual.
    if(!selectedSeasonIsCurrent(comp))return null;

    const seasonId=Number(window.INCA_TITAN?.seasonId?.($('selectTemporada')?.value)||0);
    let teamId=teamIdForName(selected,comp),event=null;

    const rows=window.INCA_FIXTURES?.upcoming?.({from:Date.now()-3600000,competitionId:comp})||[];
    const teamRows=rows.filter(e=>
      (teamId&&(Number(e.home_id)===Number(teamId)||Number(e.away_id)===Number(teamId))) ||
      norm(e.home)===norm(selected)||norm(e.away)===norm(selected)
    );

    // Si SofaScore trae Season_ID, exigimos el de la campaña seleccionada.
    // Si el fixture no trae Season_ID, TITAN_FIXTURES ya es la agenda CURRENT.
    const exact=seasonId
      ? teamRows.filter(e=>!Number(e.season_id)||Number(e.season_id)===seasonId)
      : teamRows;

    event=exact[0]||null;

    if(!event&&teamId){
      const fallback=window.INCA_FIXTURES?.nextForTeam?.(teamId,comp)||null;
      if(
        fallback &&
        (!seasonId||!Number(fallback.season_id)||Number(fallback.season_id)===seasonId)
      ) event=fallback;
    }

    if(event&&!teamId)teamId=norm(event.home)===norm(selected)?Number(event.home_id):Number(event.away_id);
    if(!event)return null;

    const isHome=Number(event.home_id)===Number(teamId)||norm(event.home)===norm(selected);
    return {event,selected,teamId,isHome,condition:isHome?'Local':'Visita'};
  }
  async function renderNextFixture(){
    const host=nextHost();if(!host)return;
    const selected=String($('selectEquipo')?.value||'').trim();
    const comp=competitionId();

    if(!selected||!comp){
      hideNextHost(host);
      return;
    }

    try{await window.INCA_TITAN?.ensureReady?.();}catch{}
    if(!selectedSeasonIsCurrent(comp)){
      hideNextHost(host);
      return;
    }

    const ctx=await findNext();
    if(!ctx){
      hideNextHost(host);
      return;
    }

    placeNextHost(host,ctx);

    const e=ctx.event;
    const p=peruParts(e.kickoff_utc);
    const hLogo=logo(e.home,e.home_id);
    const aLogo=logo(e.away,e.away_id);

    host.innerHTML=`<div class="scanner-next-inner">
      <div class="scanner-next-match">
        <div class="scanner-next-team home">
          ${hLogo?`<img src="${esc(hLogo)}" alt="">`:''}
          <span><strong>${esc(e.home)}</strong><small>LOCAL</small></span>
        </div>
        <div class="scanner-next-kick">
          <b>${esc(p.time)}</b>
          <small>${esc(p.date)}</small>
          <em>${ctx.isHome?'JUEGA DE LOCAL':'JUEGA DE VISITA'}</em>
        </div>
        <div class="scanner-next-team away">
          <span><strong>${esc(e.away)}</strong><small>VISITANTE</small></span>
          ${aLogo?`<img src="${esc(aLogo)}" alt="">`:''}
        </div>
      </div>
      <div class="scanner-next-actions">
        <button class="scanner-next-open" type="button"
          data-next-event="${Number(e.event_id)}"
          data-next-comp="${Number(e.competition_id)}">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Analizar partido
        </button>
      </div>
    </div>`;

    host.querySelector('[data-next-event]')?.addEventListener('click',async ev=>{
      const btn=ev.currentTarget,eid=Number(btn.dataset.nextEvent),cid=Number(btn.dataset.nextComp);
      try{sessionStorage.setItem('inca_match_return','scanner')}catch{}
      window.INCA_PORTAL_NAV?.show?.('fixtures');
      await window.INCA_MATCH_CENTER?.openFixture?.({eventId:eid,competitionId:cid});
    });

    removeModuleThemeControls(document);
    sanitizeNode(host);
  }

  function polishStatic(){
    removeModuleThemeControls(document);
    const engine=document.querySelector('.inca-engine-copy');if(engine){
      const small=engine.querySelector('small'),strong=engine.querySelector('strong'),em=engine.querySelector('em');
      if(small)small.textContent='INCA ANALYTICS';if(strong)strong.textContent='MOTOR DE ANÁLISIS';if(em)em.textContent='31 ligas · temporada activa';
    }
    const dataBtn=$('btnIrDatabase');if(dataBtn)dataBtn.childNodes[dataBtn.childNodes.length-1].nodeValue=' HISTÓRICO PRO ';
    sanitizeNode(document.body);removeOperationalRefresh(document);
  }

  function bind(){
    ['selectEquipo','selectLiga','selectTemporada'].forEach(id=>$(id)?.addEventListener('change',()=>setTimeout(renderNextFixture,40)));
    window.addEventListener('inca:data-ready',()=>setTimeout(renderNextFixture,60));
    window.addEventListener('inca:fixtures-ready',()=>setTimeout(renderNextFixture,60));
    window.addEventListener('inca:auth-ready',()=>setTimeout(renderNextFixture,300));
    let pending=[],queued=false;
    const mo=new MutationObserver(records=>{
      for(const r of records)for(const n of r.addedNodes)pending.push(n);
      if(queued)return;queued=true;
      requestAnimationFrame(()=>{
        queued=false;const batch=pending.splice(0,pending.length);
        for(const n of batch){
          if(n.nodeType===1){sanitizeNode(n);removeOperationalRefresh(n);removeModuleThemeControls(n)}
          else if(n.nodeType===3&&/TITAN|CSV|API|GitHub/i.test(n.nodeValue||''))n.nodeValue=friendlyText(n.nodeValue);
        }
      });
    });
    // Solo mutaciones estructurales; observar atributos de todo el documento causaba trabajo excesivo.
    mo.observe(document.body,{subtree:true,childList:true});
  }

  function init(){polishStatic();bind();renderNextFixture();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.INCA_UI_V60=Object.freeze({renderNextFixture,sanitizeNode});
})();
