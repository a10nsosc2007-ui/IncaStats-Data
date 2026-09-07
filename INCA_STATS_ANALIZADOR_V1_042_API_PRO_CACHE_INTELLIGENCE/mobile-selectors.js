(() => {
  'use strict';

  const SELECT_SCOPE = '#scannerView select, #incaPortal select';
  const LABELS = Object.freeze({
    selectEquipo: 'Seleccionar equipo', selectLiga: 'Seleccionar liga', selectTemporada: 'Seleccionar temporada',
    selectCondicion: 'Localía / condición', selectTiempo: 'Periodo del juego', selectLigaPro: 'Seleccionar competición',
    selectTemporadaPro: 'Seleccionar temporada', selectFasePro: 'Seleccionar tabla / torneo', selectEquipoPro: 'Seleccionar equipo histórico',
    rankingsSelectLiga: 'Seleccionar liga', rankingsSelectTemporada: 'Seleccionar temporada', ppsQLeague: 'Seleccionar liga', ppsQTeam: 'Seleccionar equipo'
  });

  let overlay = null;
  let activeSelect = null;
  let activeOptions = [];
  let searchTerm = '';
  let renderToken = 0;
  let lastOpenAt = 0;
  let choiceState = null;

  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const isMobile = () => window.innerWidth <= 900 || (window.innerWidth <= 1180 && window.matchMedia?.('(pointer: coarse)')?.matches);

  function getLabel(select) {
    if (!select) return 'Seleccionar';
    if (LABELS[select.id]) return LABELS[select.id];
    const escId = window.CSS?.escape ? window.CSS.escape(select.id || '') : String(select.id || '').replace(/[\"']/g,'\\$&');
    const explicit = escId ? document.querySelector(`label[for="${escId}"]`) : null;
    if (explicit?.textContent?.trim()) return explicit.textContent.trim();
    return select.closest('label')?.querySelector(':scope > span')?.textContent?.trim() || 'Seleccionar';
  }
  function getContext(select) {
    const id = select?.id || '';
    if (/equipo|team/i.test(id)) return 'team';
    if (/liga|league|competition/i.test(id)) return 'league';
    if (/temporada|season|year/i.test(id)) return 'season';
    if (/fase/i.test(id)) return 'phase';
    return 'generic';
  }
  function competitionId(option) {
    const direct = Number(option?.dataset?.competitionId || 0); if (direct) return direct;
    const m = /^TITAN_C(\d+)$/i.exec(String(option?.value || '')); if (m) return Number(m[1]);
    const numeric = Number(option?.value || 0); return numeric > 0 && numeric < 100000 ? numeric : 0;
  }
  function optionLogo(select, option) {
    const context = getContext(select);
    if (context === 'league') { const id = competitionId(option); return id ? `./TITAN_LOGOS_COMP/logos_png/${id}.png` : ''; }
    if (context === 'team') {
      const teamId = Number(option?.dataset?.teamId || option?.dataset?.team_id || (/^\d+$/.test(String(option?.value || '')) ? option.value : 0));
      const name = String(option?.dataset?.displayName || option?.textContent || '').replace(/\s+·\s+\d+\s*$/, '').trim();
      try { return window.INCA_TITAN?.logoUrl?.(name, teamId || null) || window.obtenerEscudoEquipo?.(name) || ''; } catch (_) { return ''; }
    }
    return '';
  }

  function ensureOverlay() {
    if (overlay?.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'incaMobileSelectOverlay';
    overlay.className = 'inca-mobile-select-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="inca-mobile-select-sheet" role="dialog" aria-modal="true" aria-labelledby="incaMobileSelectTitle">
        <header class="inca-mobile-select-head"><div><small>INCA STATS · SELECTOR</small><h2 id="incaMobileSelectTitle">Seleccionar</h2><p id="incaMobileSelectMeta"></p></div><button type="button" class="inca-mobile-select-close" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></header>
        <label class="inca-mobile-select-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" autocomplete="off" placeholder="Buscar..." aria-label="Buscar opción"><button type="button" aria-label="Limpiar"><i class="fa-solid fa-xmark"></i></button></label>
        <div class="inca-mobile-select-list" role="listbox"></div>
      </section>`;
    document.body.appendChild(overlay);
    const search = overlay.querySelector('.inca-mobile-select-search input');
    overlay.querySelector('.inca-mobile-select-close')?.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    search.addEventListener('input', () => { searchTerm = search.value || ''; render(); });
    overlay.querySelector('.inca-mobile-select-search button')?.addEventListener('click', () => { search.value=''; searchTerm=''; render(); search.focus(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay && !overlay.hidden) close(); });
    return overlay;
  }

  function setOpenUi(title, meta, context, count, searchable = false) {
    ensureOverlay();
    overlay.querySelector('#incaMobileSelectTitle').textContent = title || 'Seleccionar';
    overlay.querySelector('#incaMobileSelectMeta').textContent = meta || `${count || 0} opciones`;
    const searchWrap = overlay.querySelector('.inca-mobile-select-search');
    const search = searchWrap.querySelector('input');
    searchTerm=''; search.value=''; searchWrap.hidden = !searchable;
    search.placeholder = context === 'team' ? 'Buscar equipo...' : context === 'league' ? 'Buscar liga o país...' : 'Buscar...';
    overlay.dataset.context = context || 'generic';
    overlay.hidden = false;
    document.body.classList.add('inca-mobile-select-open');
  }

  function collectOptions(select) {
    const rows=[];
    [...select.children].forEach(child => {
      if (child.tagName === 'OPTGROUP') [...child.children].forEach(option => rows.push({option, group:child.label || ''}));
      else if (child.tagName === 'OPTION') rows.push({option:child, group:''});
    });
    return rows.filter(r => !r.option.hidden);
  }

  function buildOptionButton({label, meta='', selected=false, disabled=false, logo='', icon='', value, group=''}) {
    const b=document.createElement('button'); b.type='button'; b.className='inca-mobile-select-option'; b.disabled=disabled;
    b.dataset.value=String(value ?? ''); b.dataset.group=group || ''; b.setAttribute('role','option'); b.setAttribute('aria-selected',String(selected)); if(selected)b.classList.add('is-selected');
    if(logo){ const img=document.createElement('img'); img.alt=''; img.loading='lazy'; img.decoding='async'; img.src=logo; img.onerror=()=>img.remove(); b.appendChild(img); }
    else { const s=document.createElement('span'); s.className='inca-mobile-select-option-icon'; s.innerHTML=`<i class="fa-solid ${icon || 'fa-check'}"></i>`; b.appendChild(s); }
    const copy=document.createElement('span'); copy.className='inca-mobile-select-option-copy'; const strong=document.createElement('strong'); strong.textContent=label || '—'; copy.appendChild(strong);
    if(meta){ const small=document.createElement('small'); small.textContent=meta; copy.appendChild(small); } b.appendChild(copy);
    const end=document.createElement('i'); end.className=selected?'fa-solid fa-check inca-mobile-select-check':'fa-solid fa-chevron-right inca-mobile-select-arrow'; b.appendChild(end);
    return b;
  }

  function render() {
    if(!overlay || overlay.hidden) return;
    const list=overlay.querySelector('.inca-mobile-select-list'); const token=++renderToken; const term=norm(searchTerm); const frag=document.createDocumentFragment();
    if(choiceState){
      const filtered=choiceState.options.filter(o=>!term || norm(`${o.label||''} ${o.meta||''} ${o.group||''}`).includes(term));
      if(!filtered.length){ const e=document.createElement('div'); e.className='inca-mobile-select-empty'; e.innerHTML='<i class="fa-solid fa-magnifying-glass"></i><strong>Sin resultados</strong><span>Prueba otra búsqueda.</span>'; frag.appendChild(e); }
      else {
        let lastGroup=null;
        filtered.forEach(o=>{ if(o.group && o.group!==lastGroup){const g=document.createElement('div');g.className='inca-mobile-select-group';g.textContent=o.group;frag.appendChild(g);lastGroup=o.group;}
          const b=buildOptionButton({...o,selected:String(o.value)===String(choiceState.value)}); b.addEventListener('click',()=>{ const v=o.value; const cb=choiceState?.onChoose; close(); cb?.(v,o); }); frag.appendChild(b); });
      }
    } else if(activeSelect){
      const context=getContext(activeSelect); const filtered=activeOptions.filter(({option,group})=>!term || norm(`${option.textContent} ${group} ${option.dataset.country||''} ${option.dataset.region||''}`).includes(term));
      if(!filtered.length){ const e=document.createElement('div'); e.className='inca-mobile-select-empty'; e.innerHTML='<i class="fa-solid fa-magnifying-glass"></i><strong>Sin resultados</strong><span>Prueba otro nombre.</span>'; frag.appendChild(e); }
      else {
        const grouped=new Map(); filtered.forEach(r=>{const k=r.group||'';if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(r.option);});
        for(const [group,opts] of grouped){ if(group){const g=document.createElement('div');g.className='inca-mobile-select-group';g.textContent=group;frag.appendChild(g);} opts.forEach(option=>{
          const meta=[]; if(option.dataset.country)meta.push(option.dataset.country); if(option.dataset.region)meta.push(option.dataset.region); if(option.dataset.status==='CURRENT')meta.push('ACTUAL');
          const icon=context==='season'?'fa-calendar':context==='phase'?'fa-table-list':context==='team'?'fa-shield-halved':'fa-check';
          const b=buildOptionButton({label:String(option.dataset.displayName||option.textContent||option.value).trim(),meta:meta.join(' · '),selected:option.selected,disabled:option.disabled,logo:optionLogo(activeSelect,option),icon,value:option.value,group});
          b.addEventListener('click',()=>choose(option)); frag.appendChild(b);
        }); }
      }
    }
    if(token===renderToken) list.replaceChildren(frag);
  }

  function choose(option) {
    if(!activeSelect || !option || option.disabled) return;
    const select=activeSelect, previous=select.value; select.value=option.value; [...select.options].forEach(o=>o.selected=o===option);
    select.dispatchEvent(new Event('input',{bubbles:true})); if(previous!==select.value)select.dispatchEvent(new Event('change',{bubbles:true}));
    try{window.refrescarSelectCustom?.(select.id);}catch(_){ } close();
  }

  function open(select) {
    if(!select || select.disabled || !isMobile()) return false;
    activeSelect=select; choiceState=null; activeOptions=collectOptions(select);
    try{window.cerrarTodosDropdowns?.();}catch(_){ }
    document.querySelectorAll('.custom-list.show').forEach(n=>n.classList.remove('show'));
    document.querySelectorAll('.custom-display[aria-expanded="true"]').forEach(n=>n.setAttribute('aria-expanded','false'));
    document.querySelectorAll('.league-logo-select.is-open,.league-logo-select__more-panel.is-open').forEach(n=>n.classList.remove('is-open'));
    const selected=select.options[select.selectedIndex]; const context=getContext(select); const count=activeOptions.filter(r=>!r.option.disabled).length;
    setOpenUi(getLabel(select), selected?`Actual: ${String(selected.textContent||'').trim()} · ${count} opciones`:`${count} opciones`, context, count, count>7 || context==='team' || context==='league');
    render(); requestAnimationFrame(()=>overlay.querySelector('.inca-mobile-select-option.is-selected')?.scrollIntoView({block:'center'})); return true;
  }

  function openChoice({title='Seleccionar',meta='',context='generic',value='',options=[],onChoose,searchable=false}={}){
    if(!isMobile()) return false;
    activeSelect=null; activeOptions=[]; choiceState={title,meta,context,value,options:(options||[]).map(o=>({...o})),onChoose};
    setOpenUi(title,meta||`${choiceState.options.length} opciones`,context,choiceState.options.length,searchable||choiceState.options.length>10);
    render(); requestAnimationFrame(()=>overlay.querySelector('.inca-mobile-select-option.is-selected')?.scrollIntoView({block:'center'})); return true;
  }

  function close(){ if(!overlay)return; overlay.hidden=true; document.body.classList.remove('inca-mobile-select-open'); activeSelect=null;activeOptions=[];choiceState=null;searchTerm=''; }

  function selectFromTarget(target){
    const direct=target.closest?.(SELECT_SCOPE); if(direct)return direct;
    const display=target.closest?.('.custom-display'); if(display){const wrap=display.closest('.custom-select-wrapper')||display.parentElement; const s=wrap?.querySelector('select');if(s)return s;}
    const leagueCurrent=target.closest?.('.league-logo-select__current'); if(leagueCurrent){const s=leagueCurrent.closest('.league-logo-select')?.querySelector('select');if(s)return s;}
    return null;
  }
  function intercept(event){
    if(!isMobile() || event.target.closest?.('#incaMobileSelectOverlay'))return;
    const select=selectFromTarget(event.target); if(!select)return;
    event.preventDefault(); event.stopImmediatePropagation();
    const now=Date.now(); if(now-lastOpenAt<150 && activeSelect===select && overlay && !overlay.hidden)return; lastOpenAt=now; open(select);
  }
  document.addEventListener('pointerdown',e=>{if(e.isPrimary!==false)intercept(e)},true);
  document.addEventListener('click',intercept,true);
  window.addEventListener('resize',()=>{if(!isMobile())close()},{passive:true});

  window.INCA_MOBILE_SELECT=Object.freeze({shouldUse:isMobile,open,close});
  window.INCA_MOBILE_CHOICE=Object.freeze({shouldUse:isMobile,open:openChoice,close});
  console.info('[INCA MOBILE SELECT V1.016] selectores táctiles universales + choices Player Picks');
})();
