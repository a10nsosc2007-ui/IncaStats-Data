(function(){
  'use strict';
  const ITEMS=[
    ['home','fa-house','Inicio','Portada'],['leagues','fa-trophy','Ligas','Agenda y Match Center'],['referees','fa-user-tie','Árbitros','Disciplina y últimos 50'],['streaks','fa-fire','Rachas','Tendencias y líneas'],
    ['players','fa-person-running','Jugadores','Campaña y per 90'],['compare','fa-scale-balanced','Comparar','Equipo vs equipo'],['rankings','fa-ranking-star','Rankings','Extremos de liga'],
    ['betlab','fa-shield-halved','Team Intel','Perfil y contexto'],['scanner','fa-microscope','Analizador','Motor estadístico']
  ];
  const isMobile=()=>window.innerWidth<=980;
  function init(){
    const topbar=document.querySelector('.portal-topbar'); if(!topbar)return;
    const legacy=document.getElementById('portalMobileMenu'); if(legacy){legacy.hidden=true;legacy.setAttribute('aria-hidden','true');legacy.tabIndex=-1;}
    let btn=document.getElementById('editorialMenuBtn');
    if(!btn){btn=document.createElement('button');btn.id='editorialMenuBtn';btn.className='portal-desktop-menu';btn.type='button';btn.innerHTML='<i class="fa-solid fa-bars"></i>';topbar.appendChild(btn);}
    btn.setAttribute('aria-label','Abrir navegación');btn.setAttribute('aria-expanded','false');

    document.getElementById('editorialDrawer')?.remove();
    const overlay=document.createElement('div'); overlay.className='editorial-drawer-overlay';overlay.id='editorialDrawer';overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML=`<aside class="editorial-drawer" role="dialog" aria-modal="true" aria-label="Navegación INCA STATS">
      <div class="editorial-drawer-head"><div><small>NAVEGACIÓN</small><strong>INCA STATS <span>ANALIZADOR</span></strong></div><button class="editorial-drawer-close" type="button" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>
      <nav class="editorial-drawer-nav">${ITEMS.map(([target,icon,label,meta],i)=>`<button class="editorial-drawer-link" data-target="${target}" type="button"><span class="drawer-num">${String(i+1).padStart(2,'0')}</span><span class="drawer-icon"><i class="fa-solid ${icon}"></i></span><span class="drawer-copy"><b>${label}</b><small>${meta}</small></span><i class="fa-solid fa-arrow-right drawer-arrow"></i></button>`).join('')}</nav>
      <div class="editorial-drawer-foot"><span class="drawer-live-dot"></span><b>INCA DATA ACTIVE</b><small>Campaña actual · 31 ligas</small></div>
    </aside>`;
    document.body.appendChild(overlay);

    const close=()=>{overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');btn.setAttribute('aria-expanded','false');document.body.classList.remove('inca-drawer-open');};
    const open=()=>{window.INCA_MOBILE_SELECT?.close?.();overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');btn.setAttribute('aria-expanded','true');document.body.classList.add('inca-drawer-open');requestAnimationFrame(()=>overlay.querySelector('.editorial-drawer-close')?.focus({preventScroll:true}));};
    btn.onclick=e=>{e.preventDefault();e.stopPropagation();overlay.classList.contains('open')?close():open();};
    overlay.querySelector('.editorial-drawer-close').onclick=e=>{e.preventDefault();e.stopPropagation();close();};
    overlay.addEventListener('pointerdown',e=>{if(e.target===overlay && !isMobile())close();});
    overlay.querySelectorAll('[data-target]').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const target=link.dataset.target;close();requestAnimationFrame(()=>{if(window.INCA_PORTAL_NAV?.show)window.INCA_PORTAL_NAV.show(target);else document.querySelector(`.portal-nav-btn[data-view="${target}"]`)?.click();});}));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.classList.contains('open'))close();});
    window.addEventListener('resize',()=>{if(!isMobile()&&overlay.classList.contains('open'))close();},{passive:true});
    window.INCA_EDITORIAL_MENU=Object.freeze({open,close});
    console.info('[INCA NAV V1.016] menú portal táctil estable');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
