(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const VIEW_IDS = ['vista-escaner','vista-database','vista-jugadores','vista-rankings'];
  const BAR_IDS = ['topBarScanner','topBarPro','topBarJugadores'];
  const isMobile = () => window.innerWidth <= 1100;

  function setDisplay(id, value){ const el=$(id); if(el) el.style.display=value; }
  function appRoute(){
    if(document.body.classList.contains('player-picks-mode')) return 'players';
    if(document.body.classList.contains('data-pro-mode')) return 'database';
    if(document.body.classList.contains('leaderboards-mode')) return 'rankings';
    try{
      if(typeof estadoApp!=='undefined'){
        if(estadoApp.vistaActiva==='jugadores') return 'players';
        if(estadoApp.vistaActiva==='database') return 'database';
        if(estadoApp.vistaActiva==='rankings') return 'rankings';
      }
    }catch(_){ }
    return 'scanner';
  }

  function normalizeRouteClasses(route){
    const body=document.body;
    const shouldPlayers=route==='players', shouldDb=route==='database', shouldRank=route==='rankings';
    if(body.classList.contains('player-picks-mode')!==shouldPlayers) body.classList.toggle('player-picks-mode',shouldPlayers);
    if(body.classList.contains('data-pro-mode')!==shouldDb) body.classList.toggle('data-pro-mode',shouldDb);
    if(body.classList.contains('leaderboards-mode')!==shouldRank) body.classList.toggle('leaderboards-mode',shouldRank);
    body.classList.toggle('pro-mode',shouldPlayers||shouldDb||shouldRank);
  }

  function enforceAnalyzerRoute(){
    if(!document.body.classList.contains('scanner-active')) return;
    const route=appRoute();
    normalizeRouteClasses(route);
    const viewMap={scanner:'vista-escaner',database:'vista-database',players:'vista-jugadores',rankings:'vista-rankings'};
    const barMap={scanner:'topBarScanner',database:'topBarPro'};
    VIEW_IDS.forEach(id=>setDisplay(id,id===viewMap[route]?(route==='rankings'?'flex':route==='scanner'?'flex':'block'):'none'));
    BAR_IDS.forEach(id=>setDisplay(id,id===barMap[route]?'flex':'none'));
    $('topBarScanner')?.classList.toggle('ppsQ-force-hidden',route!=='scanner');
    document.body.dataset.analyzerRoute=route;
  }

  function createAnalyzerTrigger(){
    const scanner=$('scannerView');
    if(!scanner || $('incaAnalyzerMobileTrigger')) return;
    const btn=document.createElement('button');
    btn.id='incaAnalyzerMobileTrigger';
    btn.className='inca-analyzer-mobile-trigger';
    btn.type='button';
    btn.setAttribute('aria-label','Abrir menú del Analizador');
    btn.setAttribute('aria-controls','sidebarMenu');
    btn.setAttribute('aria-expanded','false');
    btn.innerHTML='<i class="fa-solid fa-bars" aria-hidden="true"></i><span>MENÚ</span>';
    btn.addEventListener('click',()=>{
      window.INCA_MOBILE_SELECT?.close?.();
      const open=typeof window.toggleMobileMenu==='function' ? window.toggleMobileMenu() : false;
      btn.setAttribute('aria-expanded',String(Boolean(open)));
    });
    scanner.appendChild(btn);
  }

  function syncMobileTrigger(){
    const btn=$('incaAnalyzerMobileTrigger'); if(!btn) return;
    const show=document.body.classList.contains('scanner-active') && isMobile() && appRoute()==='scanner';
    btn.hidden=!show;
    if(!show && typeof window.toggleMobileMenu==='function') window.toggleMobileMenu(false);
  }

  function closeDrawerAfterNavigation(target){
    if(!isMobile() || !target?.closest?.('#sidebarMenu')) return;
    if(target.closest('select,.custom-display,.league-logo-select__current,.league-logo-select__menu,.accordion-header')) return;
    if(target.closest('.menu-option,.db-pro-btn,.scanner-return,.mobile-close-btn')){
      setTimeout(()=>window.toggleMobileMenu?.(false),40);
      setTimeout(enforceAnalyzerRoute,70);
    }
  }

  function syncSelectVisual(id){
    const select=$(id); if(!select) return;
    const option=select.options?.[select.selectedIndex >= 0 ? select.selectedIndex : 0];
    const text=String(option?.textContent || option?.label || option?.value || '').trim();
    const wrapper=select.closest('.custom-select-wrapper') || select.parentElement;
    const span=wrapper?.querySelector(':scope > .custom-display span');
    if(span && text && span.textContent !== text) span.textContent=text;
    if(id==='selectEquipo'){
      const logo=$('logoEquipoMain');
      if(logo && text){
        let src='';
        try{ src=window.obtenerEscudoEquipo?.(text) || window.INCA_TITAN?.logoUrl?.(text, Number(option?.dataset?.teamId || option?.value || 0) || null) || ''; }catch(_){ }
        if(src){ logo.src=src; logo.style.display='block'; }
      }
    }
  }

  function syncScannerFilterVisuals(){
    ['selectEquipo','selectCondicion','selectTiempo'].forEach(syncSelectVisual);
  }


  function relocateRateCards(){
    const board=$('incaSignalBoard');
    const grid=board?.querySelector('.inca-signal-grid');
    const home=board?.querySelector('.inca-rate-card--home') || document.querySelector('#homeTableWrapper > .inca-rate-card--home');
    const away=board?.querySelector('.inca-rate-card--away') || document.querySelector('#awayTableWrapper > .inca-rate-card--away');
    const homeWrap=$('homeTableWrapper'), awayWrap=$('awayTableWrapper');
    if(!board || !grid || !home || !away || !homeWrap || !awayWrap) return;
    const mobileScanner=window.innerWidth<=700 && appRoute()==='scanner' && document.body.classList.contains('scanner-active');
    if(mobileScanner){
      const homeHead=homeWrap.querySelector('.table-header-title');
      const awayHead=awayWrap.querySelector('.table-header-title');
      // En móvil cada porcentaje pertenece visualmente a SU tabla. Lo incrustamos
      // en la cabecera HOME/AWAY para evitar dos bloques apilados y duplicados.
      if(homeHead && home.parentElement!==homeHead) homeHead.appendChild(home);
      if(awayHead && away.parentElement!==awayHead) awayHead.appendChild(away);
      board.classList.add('inca-mobile-rates-detached');
    }else{
      if(home.parentElement!==grid) grid.appendChild(home);
      if(away.parentElement!==grid) grid.appendChild(away);
      board.classList.remove('inca-mobile-rates-detached');
    }
  }

  function cleanStalePlayerSelectEnhancer(){
    const league=$('ppsQLeague'); if(!league) return;
    const wrapper=league.closest('.league-logo-select');
    if(wrapper && wrapper.parentNode){ wrapper.parentNode.insertBefore(league,wrapper); wrapper.remove(); }
    const host=league.closest('.ppsQ-select');
    host?.querySelectorAll('.league-logo-select').forEach(node=>{if(!node.contains(league))node.remove();});
    league.dataset.noLeagueEnhance='1';
    delete league.dataset.leagueLogoEnhanced;
  }

  function init(){
    createAnalyzerTrigger();
    enforceAnalyzerRoute();
    syncMobileTrigger();
    syncScannerFilterVisuals();
    relocateRateCards();

    let routeQueued=false;
    new MutationObserver(()=>{
      if(routeQueued)return; routeQueued=true;
      requestAnimationFrame(()=>{
        routeQueued=false;
        enforceAnalyzerRoute();
        syncMobileTrigger();
        syncScannerFilterVisuals();
        cleanStalePlayerSelectEnhancer();
        relocateRateCards();
      });
    }).observe(document.body,{attributes:true,attributeFilter:['class']});

    document.addEventListener('change',e=>{
      if(e.target?.matches?.('#selectEquipo,#selectCondicion,#selectTiempo')) requestAnimationFrame(syncScannerFilterVisuals);
    },true);

    document.addEventListener('click',e=>{
      closeDrawerAfterNavigation(e.target);
      if(e.target.closest('#btnIrDatabase,#btnIrJugadores,#btnIrRankings,.scanner-return')){
        setTimeout(enforceAnalyzerRoute,0);setTimeout(enforceAnalyzerRoute,120);setTimeout(enforceAnalyzerRoute,650);
      }
    },true);
    window.addEventListener('resize',()=>{syncMobileTrigger();relocateRateCards();if(!isMobile())window.toggleMobileMenu?.(false)},{passive:true});
    window.addEventListener('inca:players-current-ready',()=>requestAnimationFrame(cleanStalePlayerSelectEnhancer));
    setTimeout(cleanStalePlayerSelectEnhancer,500);

    console.info('[INCA MOBILE V1.018] porcentajes integrados HOME/AWAY + tabla móvil completa + eje Player Picks lineal');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
