(() => {
'use strict';

const IDS = ['compareMetricA', 'compareMetricB'];
const SIDE_BY_ID = { compareMetricA:'A', compareMetricB:'B' };

const ICONS = {
  'Goles':'fa-futbol',
  'Córners':'fa-flag',
  'Tarjetas':'fa-square',
  'Puntos de tarjetas':'fa-layer-group',
  'Tiros':'fa-bullseye',
  'Tiros al arco':'fa-crosshairs',
  'Faltas':'fa-hand',
  'Fueras de juego':'fa-person-running',
  'Saques de meta':'fa-person-kicking-ball',
  'Saques de banda':'fa-arrows-left-right',
  'Tackles':'fa-shield-halved'
};

const HELPERS = {
  'Goles':'Marcador',
  'Córners':'Balón parado',
  'Tarjetas':'Disciplina',
  'Puntos de tarjetas':'Disciplina',
  'Tiros':'Remates',
  'Tiros al arco':'Precisión',
  'Faltas':'Infracciones',
  'Fueras de juego':'Posición',
  'Saques de meta':'Reanudaciones',
  'Saques de banda':'Reanudaciones',
  'Tackles':'Recuperación'
};

let syncing = false;
let activeSelect = null;
let showAllCategories = false;
const enhanced = new Map();

function esc(v=''){
  return String(v).replace(/[&<>'"]/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[c]));
}

function optionGroup(option){
  return option?.parentElement?.tagName === 'OPTGROUP'
    ? option.parentElement.label
    : '';
}
function optionRole(value){
  if(!value)return '';
  if(/_total$/.test(value))return 'total';
  if(/_team$/.test(value)||/_for$/.test(value))return 'team';
  if(/_rival$/.test(value)||/_against$/.test(value))return 'rival';
  return '';
}
function roleLabel(role){
  return role==='team'?'Equipo':role==='rival'?'Rival':'Total partido';
}
function roleHelp(role){
  return role==='team'
    ? 'Lo que produce el equipo'
    : role==='rival'
      ? 'Lo que permite al rival'
      : 'Suma de ambos equipos';
}
function peerSelect(select){
  return document.getElementById(
    select.id === 'compareMetricA' ? 'compareMetricB' : 'compareMetricA'
  );
}
function selectedInfo(select){
  const option=select?.selectedOptions?.[0];
  return {
    option,
    group:optionGroup(option),
    role:optionRole(option?.value||'')
  };
}
function firstOptionInGroup(select,group,preferredRole='total'){
  const exact=[...select.options].find(o=>
    o.value && optionGroup(o)===group && optionRole(o.value)===preferredRole
  );
  if(exact)return exact;
  return [...select.options].find(o=>o.value && optionGroup(o)===group)||null;
}

function syncPeer(source){
  if(syncing||!source?.value)return;
  const peer=peerSelect(source);
  if(!peer)return;

  const src=selectedInfo(source);
  if(!src.group)return;

  const peerInfo=selectedInfo(peer);
  let target=null;

  // Al cambiar de categoría en un lado, el otro entra a la misma categoría.
  if(peerInfo.group!==src.group){
    target=firstOptionInGroup(peer,src.group,src.role==='total'?'total':'total');
  }else if(src.role==='total'&&peerInfo.role!=='total'){
    // Regla heredada V4.21: Total se refleja como Total en ambos.
    target=firstOptionInGroup(peer,src.group,'total');
  }

  if(!target||peer.value===target.value){
    refreshAll();
    return;
  }

  syncing=true;
  peer.value=target.value;
  peer.dispatchEvent(new Event('change',{bubbles:true}));
  syncing=false;
  refreshAll();
}

function lockedGroupFor(select){
  if(showAllCategories)return '';
  const peer=peerSelect(select);
  if(!peer?.value)return '';
  return selectedInfo(peer).group;
}

function ensureModal(){
  let overlay=document.getElementById('incaMetricModalV42714');
  if(overlay)return overlay;

  overlay=document.createElement('div');
  overlay.id='incaMetricModalV42714';
  overlay.className='cmp-metric-modal';
  overlay.hidden=true;
  overlay.innerHTML=`
    <div class="cmp-metric-backdrop" data-cmp-metric-close></div>
    <section class="cmp-metric-dialog" role="dialog" aria-modal="true">
      <header class="cmp-metric-dialog-head">
        <div class="cmp-metric-title-wrap">
          <span class="cmp-metric-eyebrow">COMPARADOR PRO</span>
          <h2 id="cmpMetricModalTitle">Selecciona una métrica</h2>
          <p id="cmpMetricModalSubtitle">Elige qué quieres medir.</p>
        </div>
        <button class="cmp-metric-close" type="button" data-cmp-metric-close aria-label="Cerrar">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </header>

      <div class="cmp-metric-syncbar" id="cmpMetricSyncbar"></div>

      <div class="cmp-metric-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input id="cmpMetricSearch" type="search" autocomplete="off"
          placeholder="Buscar goles, tiros, córners, faltas...">
        <span id="cmpMetricCount"></span>
      </div>

      <div class="cmp-metric-body" id="cmpMetricBody"></div>
    </section>`;

  document.body.appendChild(overlay);

  overlay.querySelectorAll('[data-cmp-metric-close]').forEach(el=>
    el.addEventListener('click',closeModal)
  );

  overlay.querySelector('#cmpMetricSearch').addEventListener('input',e=>
    filterModal(e.target.value)
  );

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!overlay.hidden)closeModal();
  });

  return overlay;
}

function closeModal(){
  const overlay=document.getElementById('incaMetricModalV42714');
  if(!overlay)return;
  overlay.classList.remove('is-open');
  document.body.classList.remove('cmp-metric-modal-open');
  setTimeout(()=>{overlay.hidden=true},120);
  activeSelect=null;
  showAllCategories=false;
}

function groupsFor(select){
  return [...select.children].filter(n=>n.tagName==='OPTGROUP');
}

function buildSyncbar(select){
  const overlay=ensureModal();
  const bar=overlay.querySelector('#cmpMetricSyncbar');
  const peer=peerSelect(select);
  const locked=lockedGroupFor(select);

  if(!locked){
    bar.innerHTML=`
      <div>
        <i class="fa-solid fa-link"></i>
        <span><b>Sincronización A/B activa.</b> La categoría que elijas también limitará el otro equipo.</span>
      </div>`;
    return;
  }

  bar.innerHTML=`
    <div>
      <i class="fa-solid fa-lock"></i>
      <span>
        <b>Categoría sincronizada: ${esc(locked)}.</b>
        Equipo ${SIDE_BY_ID[peer.id]} ya trabaja con esta categoría.
      </span>
    </div>
    <button type="button" id="cmpMetricUnlockCategory">
      <i class="fa-solid fa-arrows-rotate"></i> Cambiar categoría para ambos
    </button>`;

  bar.querySelector('#cmpMetricUnlockCategory').addEventListener('click',()=>{
    showAllCategories=true;
    buildModal(activeSelect);
  });
}

function buildModal(select){
  const overlay=ensureModal();
  const body=overlay.querySelector('#cmpMetricBody');
  const side=SIDE_BY_ID[select.id];
  const locked=lockedGroupFor(select);

  overlay.querySelector('#cmpMetricModalTitle').textContent=
    `Métrica del Equipo ${side}`;
  overlay.querySelector('#cmpMetricModalSubtitle').textContent=
    locked
      ? `Solo ${locked} para mantener una comparación coherente.`
      : 'Selecciona una categoría y después Equipo, Rival o Total partido.';

  buildSyncbar(select);
  body.innerHTML='';

  groupsFor(select).forEach(group=>{
    if(locked&&group.label!==locked)return;

    const section=document.createElement('section');
    section.className='cmp-metric-group';

    const head=document.createElement('div');
    head.className='cmp-metric-group-head';
    head.innerHTML=`
      <span class="cmp-metric-group-icon">
        <i class="fa-solid ${ICONS[group.label]||'fa-chart-line'}"></i>
      </span>
      <div>
        <strong>${esc(group.label)}</strong>
        <small>${esc(HELPERS[group.label]||'Estadística')}</small>
      </div>`;

    const grid=document.createElement('div');
    grid.className='cmp-metric-options';

    [...group.children].forEach(option=>{
      const role=optionRole(option.value);
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='cmp-metric-option';
      btn.dataset.metricValue=option.value;
      btn.dataset.search=`${group.label} ${option.textContent} ${roleLabel(role)} ${roleHelp(role)}`;
      if(option.value===select.value)btn.classList.add('is-selected');

      btn.innerHTML=`
        <span class="cmp-metric-option-icon">
          <i class="fa-solid ${ICONS[group.label]||'fa-chart-line'}"></i>
        </span>
        <span class="cmp-metric-option-copy">
          <b>${esc(roleLabel(role))}</b>
          <small>${esc(roleHelp(role))}</small>
        </span>
        <span class="cmp-metric-option-check">
          <i class="fa-solid fa-check"></i>
        </span>`;

      btn.addEventListener('click',()=>{
        select.value=option.value;
        select.dispatchEvent(new Event('change',{bubbles:true}));
        closeModal();
      });

      grid.appendChild(btn);
    });

    section.append(head,grid);
    body.appendChild(section);
  });

  const search=overlay.querySelector('#cmpMetricSearch');
  search.value='';
  filterModal('');
}

function filterModal(query){
  const overlay=ensureModal();
  const q=String(query||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().trim();

  let count=0;
  overlay.querySelectorAll('.cmp-metric-group').forEach(section=>{
    let visible=0;
    section.querySelectorAll('.cmp-metric-option').forEach(btn=>{
      const hay=String(btn.dataset.search||'')
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .toLowerCase();
      const show=!q||hay.includes(q);
      btn.hidden=!show;
      if(show){visible++;count++;}
    });
    section.hidden=visible===0;
  });

  overlay.querySelector('#cmpMetricCount').textContent=`${count} opciones`;
}

function openModal(select){
  if(!select||![...select.options].some(o=>o.value))return;
  activeSelect=select;
  showAllCategories=false;

  const overlay=ensureModal();
  buildModal(select);

  overlay.hidden=false;
  requestAnimationFrame(()=>{
    overlay.classList.add('is-open');
    document.body.classList.add('cmp-metric-modal-open');
    overlay.querySelector('#cmpMetricSearch')?.focus({preventScroll:true});
  });
}

function refreshTrigger(instance){
  const {select,current,wrap}=instance;
  const option=select.selectedOptions[0];
  const group=optionGroup(option);
  const role=optionRole(option?.value||'');
  const hasMetrics=[...select.options].some(o=>o.value);

  current.disabled=!hasMetrics;
  wrap.classList.toggle('is-disabled',!hasMetrics);

  current.innerHTML=`
    <span class="metric-pro-select__icon">
      <i class="fa-solid ${ICONS[group]||'fa-chart-line'}"></i>
    </span>
    <span class="metric-pro-select__copy">
      <strong>${esc(option?.value?option.textContent:`Selecciona la métrica del Equipo ${SIDE_BY_ID[select.id]}`)}</strong>
      <small>${option?.value
        ? `${esc(HELPERS[group]||group)} · ${esc(roleLabel(role))}`
        : 'Abrir selector de métricas'}</small>
    </span>
    <span class="metric-pro-select__arrow">
      <i class="fa-solid fa-up-right-and-down-left-from-center"></i>
    </span>`;
}

function refreshAll(){
  enhanced.forEach(refreshTrigger);
}

function enhance(select){
  if(!select||select.dataset.metricEnhanced==='1')return;
  select.dataset.metricEnhanced='1';

  const wrap=document.createElement('div');
  wrap.className='metric-pro-select metric-pro-select-v42714';

  const current=document.createElement('button');
  current.type='button';
  current.className='metric-pro-select__current';

  select.parentNode.insertBefore(wrap,select);
  wrap.append(select,current);
  select.classList.add('metric-pro-select__native');

  const instance={select,wrap,current};
  enhanced.set(select.id,instance);

  current.addEventListener('click',()=>openModal(select));

  select.addEventListener('change',()=>{
    syncPeer(select);
    refreshAll();
  });

  const observer=new MutationObserver(()=>refreshAll());
  observer.observe(select,{
    childList:true,
    subtree:true,
    attributes:true,
    attributeFilter:['disabled']
  });

  refreshTrigger(instance);
}

function ensureNativeMetrics(){
  for(const id of IDS){
    const select=document.getElementById(id);
    if(!select)continue;
    if([...select.options].filter(o=>o.value).length>=20)continue;
    const html=window.INCA_COMPARE?.metricOptions?.();
    if(html)select.innerHTML=html;
  }
}

function init(){
  ensureNativeMetrics();
  IDS.forEach(id=>enhance(document.getElementById(id)));
  refreshAll();
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init,{once:true});
}else{
  init();
}
})();