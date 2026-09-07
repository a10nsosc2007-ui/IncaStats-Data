(() => {
  'use strict';

  const SELECT_IDS = ['fixtureLeague', 'compareLeagueA', 'compareLeagueB', 'selectLiga', 'selectLigaPro', 'rankingsSelectLiga'];
  const QUICK_TITAN_IDS = [17, 8, 23, 35, 34]; // Premier, LaLiga, Serie A, Bundesliga, Ligue 1

  const VALUE_TO_COMPETITION = {
    Premier: 'Premier', PremierLeague: 'Premier', 'Premier League': 'Premier', soccer_epl: 'Premier',
    Championship: 'Championship', 'EFL Championship': 'Championship', soccer_efl_champ: 'Championship',
    LaLiga: 'LaLiga', Laliga: 'LaLiga', 'La Liga': 'LaLiga', soccer_spain_la_liga: 'LaLiga',
    SerieA: 'SerieA', 'Serie A': 'SerieA', soccer_italy_serie_a: 'SerieA',
    Bundesliga: 'Bundesliga', soccer_germany_bundesliga: 'Bundesliga',
    Ligue1: 'Ligue1', 'Ligue 1': 'Ligue1', soccer_france_ligue_one: 'Ligue1',
    Brasileirao: 'Brasileirao', 'Brasileirão': 'Brasileirao', 'Brasileirão Série A': 'Brasileirao', soccer_brazil_campeonato: 'Brasileirao'
  };

  const TITAN_TO_LEGACY = {
    17: 'Premier', 18: 'Championship', 8: 'LaLiga', 23: 'SerieA',
    35: 'Bundesliga', 34: 'Ligue1', 325: 'Brasileirao'
  };

  const LEGACY_COMPETITION_IDS = Object.freeze({
    Premier:17, Championship:18, LaLiga:8, SerieA:23,
    Bundesliga:35, Ligue1:34, Brasileirao:325,
    LigaPortugal:238, Eredivisie:37, Argentina:155, MLS:242
  });

  const LEGACY_COMPETITION_META = Object.freeze({
    Premier:{competitionId:17,country:'INGLATERRA',region:'EUROPA',name:'Premier League'},
    Championship:{competitionId:18,country:'INGLATERRA',region:'EUROPA',name:'Championship'},
    LaLiga:{competitionId:8,country:'ESPAÑA',region:'EUROPA',name:'LaLiga EA Sports'},
    SerieA:{competitionId:23,country:'ITALIA',region:'EUROPA',name:'Serie A'},
    Bundesliga:{competitionId:35,country:'ALEMANIA',region:'EUROPA',name:'Bundesliga'},
    Ligue1:{competitionId:34,country:'FRANCIA',region:'EUROPA',name:'Ligue 1'},
    LigaPortugal:{competitionId:238,country:'PORTUGAL',region:'EUROPA',name:'Liga Portugal'},
    Eredivisie:{competitionId:37,country:'PAÍSES BAJOS',region:'EUROPA',name:'Eredivisie'},
    Brasileirao:{competitionId:325,country:'BRASIL',region:'AMÉRICA',name:'Brasileirão Série A'},
    Argentina:{competitionId:155,country:'ARGENTINA',region:'AMÉRICA',name:'Liga Profesional Argentina'},
    MLS:{competitionId:242,country:'EE. UU. / CANADÁ',region:'AMÉRICA',name:'MLS'}
  });

  function localCompetitionLogo(competitionId){
    const id = Number(competitionId || 0);
    return id ? `./fast-assets/competition-logos/${id}.webp` : '';
  }

  const COUNTRY_FLAGS = {
    'ALEMANIA':'🇩🇪','ARGENTINA':'🇦🇷','AUSTRIA':'🇦🇹','BÉLGICA':'🇧🇪','BRASIL':'🇧🇷',
    'DINAMARCA':'🇩🇰','EE. UU. / CANADÁ':'🇺🇸','ESPAÑA':'🇪🇸','FRANCIA':'🇫🇷',
    'GRECIA':'🇬🇷','INGLATERRA':'🏴','ITALIA':'🇮🇹','NORUEGA':'🇳🇴','PAÍSES BAJOS':'🇳🇱',
    'PERÚ':'🇵🇪','PORTUGAL':'🇵🇹','RUMANÍA':'🇷🇴','SUECIA':'🇸🇪','SUIZA':'🇨🇭','TURQUÍA':'🇹🇷'
  };

  let competitionData = {};

  const cleanText = value => String(value || '').trim();
  const norm = value => cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const titanId = value => Number((/^TITAN_C(\d+)$/i.exec(cleanText(value)) || [])[1]) || null;
  const alpha = (a, b) => String(a || '').localeCompare(String(b || ''), 'es', { sensitivity: 'base' });

  function competitionKey(value, text = '') {
    const id = titanId(value);
    if (id && TITAN_TO_LEGACY[id]) return TITAN_TO_LEGACY[id];
    const direct = VALUE_TO_COMPETITION[value] || VALUE_TO_COMPETITION[text];
    if (direct) return direct;
    const clean = norm(value || text);
    if (clean.includes('champ')) return 'Championship';
    if (clean.includes('premier') || clean.includes('epl')) return 'Premier';
    if (clean.includes('laliga') || clean.includes('la liga') || clean.includes('spain')) return 'LaLiga';
    if (clean === 'serie a' || clean.includes('italy_serie_a')) return 'SerieA';
    if (clean === 'bundesliga' || clean.includes('germany_bundesliga')) return 'Bundesliga';
    if (clean === 'ligue 1' || clean.includes('france_ligue_one')) return 'Ligue1';
    if (clean.includes('brasileirao') || clean.includes('brasileirão') || clean.includes('brazil_campeonato')) return 'Brasileirao';
    return '';
  }

  function infoFor(option) {
    const value = option?.value || '';
    const text = option?.dataset?.displayName || option?.textContent?.trim() || value;
    const key = competitionKey(value, text);
    const source = competitionData[key] || {};
    const legacyMeta = LEGACY_COMPETITION_META[key] || {};
    const competitionId = Number(
      option?.dataset?.competitionId ||
      titanId(value) ||
      window.INCA_TITAN?.legacyCompetitionId?.(value) ||
      legacyMeta.competitionId ||
      LEGACY_COMPETITION_IDS[key] ||
      0
    );
    // V4.27.35: usar el catálogo REAL de TITAN_LOGOS_COMP.
    // Orden: PNG local empaquetado -> WebP rápido -> PNG GitHub exacto.
    const titanCandidates = window.INCA_TITAN?.competitionLogoCandidates?.(competitionId) || [];
    const localLogo = localCompetitionLogo(competitionId);
    const logoCandidates = [...new Set([...titanCandidates, localLogo].filter(Boolean))];
    return {
      key,
      value,
      name: option?.dataset?.displayName || legacyMeta.name || text || source.nombre || 'Selecciona una liga',
      logo: logoCandidates[0] || '',
      logoCandidates,
      region: option?.dataset?.region || legacyMeta.region || '',
      country: option?.dataset?.country || legacyMeta.country || '',
      available: option?.disabled !== true && option?.dataset?.available !== '0',
      competitionId
    };
  }

  function isCurated(select) {
    return select?.dataset?.titanCatalog === 'curated31' || select?.id === 'rankingsSelectLiga';
  }

  function createLogo(info, className) {
    const candidates = [...new Set((info?.logoCandidates || [info?.logo]).filter(Boolean))];
    if (!candidates.length) return null;

    // V4.27.38: NO HOLDER. La propia imagen ES el logo.
    // Así no puede existir un rectángulo blanco vacío encima del escudo.
    const img = document.createElement('img');
    img.className = `${className} is-logo-loading`;
    img.alt = '';
    img.loading = 'eager';
    img.decoding = 'async';

    let index = 0;
    const tryNext = () => {
      img.classList.remove('has-image');
      if (index >= candidates.length) {
        img.remove();
        return;
      }
      img.src = candidates[index++];
    };

    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        tryNext();
        return;
      }
      img.classList.remove('is-logo-loading');
      img.classList.add('has-image');
    };
    img.onerror = tryNext;
    tryNext();

    return img;
  }

  function cleanupOldCustom(select) {
    const outer = select?.closest?.('.custom-select-wrapper');
    if (!outer) return;
    outer.querySelectorAll(':scope > .custom-display, :scope > .custom-list').forEach(node => node.remove());
  }

  function choose(wrapper, option) {
    if (!option || option.disabled || option.dataset.available === '0') return;
    const select = wrapper.__nativeSelect;
    if (!select) return;

    const nextValue = option.value;
    const changed = select.value !== nextValue;
    select.value = nextValue;

    // V47: native select remains source of truth. Fire both browser-level
    // events so Data Pro / Rankings / Portal handlers always receive it.
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));

    closeWrapper(wrapper);
    refresh(wrapper);

    requestAnimationFrame(() => {
      refresh(wrapper);
      if (isCurated(select)) buildQuickMenu(wrapper);
      else buildLegacyMenu(wrapper);
    });

    console.info('[INCA LEAGUE SELECT V47] Selección aplicada', {
      id: select.id,
      value: select.value,
      changed
    });
  }

  function closeWrapper(wrapper) {
    if (!wrapper) return;
    wrapper.classList.remove('is-open', 'is-more-open');
    wrapper.querySelector('.league-logo-select__current')?.setAttribute('aria-expanded', 'false');
    if (wrapper.__morePanel) wrapper.__morePanel.classList.remove('is-open');
  }

  function closeAll(except = null) {
    document.querySelectorAll('.league-logo-select').forEach(wrapper => {
      if (wrapper !== except) closeWrapper(wrapper);
    });
    document.querySelectorAll('.league-logo-select__more-panel.is-open').forEach(panel => {
      if (!except || panel !== except.__morePanel) panel.classList.remove('is-open');
    });
  }

  function refresh(wrapper) {
    const select = wrapper.__nativeSelect;
    const selected = select?.options?.[select.selectedIndex];
    if (!selected) return;
    const info = infoFor(selected);
    const current = wrapper.querySelector('.league-logo-select__current');
    if (!current) return;

    current.replaceChildren();

    // V4.27.39: no existe ningún nodo/tile de logo.
    // El escudo se pinta como background transparente del propio botón.
    const logoUrl = Number(info.competitionId || 0)
      ? `./TITAN_LOGOS_COMP/logos_png/${Number(info.competitionId)}.png`
      : '';
    current.classList.toggle('has-league-logo', Boolean(logoUrl));
    current.style.setProperty('--inca-league-logo', logoUrl ? `url("${logoUrl}")` : 'none');

    const label = document.createElement('span');
    label.className = 'league-logo-select__current-label';
    label.textContent = info.name;
    current.appendChild(label);

    const arrow = document.createElement('span');
    arrow.className = 'league-logo-select__arrow';
    arrow.innerHTML = '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
    current.appendChild(arrow);

    wrapper.dataset.league = info.key || String(info.competitionId || '');
    wrapper.dataset.region = info.region || '';
    cleanupOldCustom(select);
  }

  function optionButton(wrapper, option, mode = 'normal') {
    const info = infoFor(option);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `league-logo-select__pick league-logo-select__pick--${mode}`;
    btn.disabled = !info.available;
    btn.dataset.value = option.value;
    btn.classList.toggle('is-selected', wrapper.__nativeSelect.value === option.value);
    btn.classList.toggle('is-unavailable', !info.available);

    const logoUrl = Number(info.competitionId || 0)
      ? `./TITAN_LOGOS_COMP/logos_png/${Number(info.competitionId)}.png`
      : '';
    btn.classList.toggle('has-league-logo', Boolean(logoUrl));
    btn.style.setProperty('--inca-league-logo', logoUrl ? `url("${logoUrl}")` : 'none');

    const copy = document.createElement('span');
    copy.className = 'league-logo-select__pick-copy';

    const strong = document.createElement('strong');
    strong.textContent = info.name;
    copy.appendChild(strong);

    if (mode === 'more') {
      const small = document.createElement('small');
      small.textContent = info.available ? info.country : `${info.country} · SIN DATA`;
      copy.appendChild(small);
    }
    btn.appendChild(copy);

    if (wrapper.__nativeSelect.value === option.value) {
      const check = document.createElement('i');
      check.className = 'fa-solid fa-check league-logo-select__check';
      check.setAttribute('aria-hidden', 'true');
      btn.appendChild(check);
    }

    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      choose(wrapper, option);
    });
    return btn;
  }

  function buildQuickMenu(wrapper) {
    const select = wrapper.__nativeSelect;
    const menu = wrapper.querySelector('.league-logo-select__menu');
    if (!menu) return;
    menu.replaceChildren();

    const title = document.createElement('div');
    title.className = 'league-logo-select__quick-title';
    title.innerHTML = '<span>LIGAS</span>';
    menu.appendChild(title);

    const list = document.createElement('div');
    list.className = 'league-logo-select__quick-list';

    const allOptions = [...select.options];
    const quick = QUICK_TITAN_IDS
      .map(id => allOptions.find(option => Number(infoFor(option).competitionId) === id))
      .filter(Boolean);

    title.innerHTML = `<span>TOP 5 LIGAS</span><small>${quick.length}</small>`;
    quick.forEach(option => list.appendChild(optionButton(wrapper, option, 'quick')));
    menu.appendChild(list);

    const quickIds = new Set(quick.map(option => Number(infoFor(option).competitionId)));
    const moreCount = allOptions.filter(option => !quickIds.has(Number(infoFor(option).competitionId))).length;

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'league-logo-select__more-trigger';
    more.innerHTML = `
      <span class="league-logo-select__more-icon"><i class="fa-solid fa-list" aria-hidden="true"></i></span>
      <span class="league-logo-select__more-copy"><strong>MÁS LIGAS</strong><small>${moreCount} · POR PAÍS</small></span>
      <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
    `;
    more.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openMorePanel(wrapper);
    });
    menu.appendChild(more);
  }

  function buildLegacyMenu(wrapper) {
    const select = wrapper.__nativeSelect;
    const menu = wrapper.querySelector('.league-logo-select__menu');
    if (!menu) return;
    menu.replaceChildren();
    const list = document.createElement('div');
    list.className = 'league-logo-select__legacy-list';
    [...select.options].forEach(option => list.appendChild(optionButton(wrapper, option, 'legacy')));
    menu.appendChild(list);
  }

  function ensureMorePanel(wrapper) {
    if (wrapper.__morePanel?.isConnected) return wrapper.__morePanel;

    const panel = document.createElement('section');
    panel.className = 'league-logo-select__more-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'Seleccionar liga');

    panel.innerHTML = `
      <header class="league-logo-select__more-head">
        <div>
          <span>INCA STATS · TITAN</span>
          <h3>Seleccionar liga</h3>
          <p data-role="league-count">Ligas adicionales agrupadas por país.</p>
        </div>
        <button type="button" class="league-logo-select__more-close" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="league-logo-select__more-controls">
        <label class="league-logo-select__more-search">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input type="search" placeholder="Buscar liga o país..." autocomplete="off">
        </label>
        <div class="league-logo-select__more-tabs" role="tablist">
          <button type="button" data-region="ALL" class="is-active">TODAS</button>
          <button type="button" data-region="EUROPA">EUROPA</button>
          <button type="button" data-region="AMÉRICA">AMÉRICA</button>
        </div>
      </div>
      <div class="league-logo-select__more-body"></div>
    `;

    panel.addEventListener('click', event => event.stopPropagation());
    panel.querySelector('.league-logo-select__more-close').addEventListener('click', () => closeWrapper(wrapper));

    const input = panel.querySelector('input');
    input.addEventListener('input', () => {
      panel.dataset.search = input.value;
      renderMorePanel(wrapper);
    });

    panel.querySelectorAll('.league-logo-select__more-tabs button').forEach(tab => {
      tab.addEventListener('click', () => {
        panel.dataset.region = tab.dataset.region;
        panel.querySelectorAll('.league-logo-select__more-tabs button').forEach(x => x.classList.toggle('is-active', x === tab));
        renderMorePanel(wrapper);
      });
    });

    document.body.appendChild(panel);
    wrapper.__morePanel = panel;
    return panel;
  }

  function renderMorePanel(wrapper) {
    const panel = ensureMorePanel(wrapper);
    const select = wrapper.__nativeSelect;
    const body = panel.querySelector('.league-logo-select__more-body');
    const region = panel.dataset.region || 'ALL';
    const term = norm(panel.dataset.search || '');

    const allRows = [...select.options]
      .map(option => ({ option, info: infoFor(option) }))
      .filter(({ info }) => !QUICK_TITAN_IDS.includes(Number(info.competitionId)));

    const europeCount = allRows.filter(({info}) => info.region === 'EUROPA').length;
    const americaCount = allRows.filter(({info}) => info.region === 'AMÉRICA').length;
    const countCopy = panel.querySelector('[data-role="league-count"]');
    if (countCopy) countCopy.textContent = `${allRows.length} ligas adicionales · agrupadas por país.`;
    const tabAll = panel.querySelector('[data-region="ALL"]');
    const tabEu = panel.querySelector('[data-region="EUROPA"]');
    const tabAm = panel.querySelector('[data-region="AMÉRICA"]');
    if (tabAll) tabAll.textContent = `TODAS · ${allRows.length}`;
    if (tabEu) tabEu.textContent = `EUROPA · ${europeCount}`;
    if (tabAm) tabAm.textContent = `AMÉRICA · ${americaCount}`;

    let rows = allRows
      .filter(({ info }) => region === 'ALL' || info.region === region)
      .filter(({ info }) => !term || norm(`${info.name} ${info.country} ${info.region}`).includes(term))
      .sort((a, b) => alpha(a.info.country, b.info.country) || alpha(a.info.name, b.info.name));

    body.replaceChildren();

    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'league-logo-select__more-empty';
      empty.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i><strong>Sin resultados</strong><span>Prueba otro nombre o país.</span>';
      body.appendChild(empty);
      return;
    }

    const groups = new Map();
    rows.forEach(row => {
      const country = row.info.country || 'OTRAS';
      if (!groups.has(country)) groups.set(country, []);
      groups.get(country).push(row);
    });

    const grid = document.createElement('div');
    grid.className = 'league-logo-select__country-grid';

    [...groups.entries()].sort((a, b) => alpha(a[0], b[0])).forEach(([country, items]) => {
      const card = document.createElement('section');
      card.className = 'league-logo-select__country-card';

      const heading = document.createElement('div');
      heading.className = 'league-logo-select__country-title';
      heading.innerHTML = `<span class="league-logo-select__flag">${COUNTRY_FLAGS[country] || '🌐'}</span><strong>${country}</strong><b>${items.length}</b>`;
      card.appendChild(heading);

      const list = document.createElement('div');
      list.className = 'league-logo-select__country-list';
      items.sort((a, b) => alpha(a.info.name, b.info.name))
        .forEach(({ option }) => list.appendChild(optionButton(wrapper, option, 'more')));
      card.appendChild(list);
      grid.appendChild(card);
    });

    body.appendChild(grid);
  }

  function positionMorePanel(wrapper) {
    const panel = wrapper.__morePanel;
    const current = wrapper.querySelector('.league-logo-select__current');
    if (!panel || !current || !panel.classList.contains('is-open')) return;

    const rect = current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (vw <= 900) {
      panel.style.left = '12px';
      panel.style.right = '12px';
      panel.style.top = '7vh';
      panel.style.width = 'auto';
      panel.style.maxHeight = '86vh';
      return;
    }

    const width = Math.min(640, vw - 32);
    let left = rect.right + 12;
    if (left + width > vw - 12) left = Math.max(12, rect.left - width - 12);

    const desiredHeight = Math.min(660, vh * 0.82);
    let top = rect.top - 32;
    top = Math.max(12, Math.min(top, vh - desiredHeight - 12));

    panel.style.width = `${width}px`;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.right = 'auto';
    panel.style.top = `${Math.round(top)}px`;
    panel.style.maxHeight = `${Math.round(desiredHeight)}px`;
  }

  function openMorePanel(wrapper) {
    closeAll(wrapper);
    wrapper.classList.remove('is-open');
    wrapper.classList.add('is-more-open');
    wrapper.querySelector('.league-logo-select__current')?.setAttribute('aria-expanded', 'false');

    const panel = ensureMorePanel(wrapper);
    panel.dataset.region = 'ALL';
    panel.dataset.search = '';
    panel.querySelector('input').value = '';
    panel.querySelectorAll('.league-logo-select__more-tabs button').forEach(tab => {
      tab.classList.toggle('is-active', tab.dataset.region === 'ALL');
    });

    renderMorePanel(wrapper);
    panel.classList.add('is-open');
    positionMorePanel(wrapper);
    requestAnimationFrame(() => panel.querySelector('input')?.focus({ preventScroll: true }));
  }

  function rebuild(wrapper) {
    const select = wrapper.__nativeSelect;
    if (!select) return;
    cleanupOldCustom(select);
    if (isCurated(select)) buildQuickMenu(wrapper);
    else buildLegacyMenu(wrapper);
    refresh(wrapper);
    if (wrapper.__morePanel?.classList.contains('is-open')) renderMorePanel(wrapper);
  }

  function enhance(select) {
    if (!select || select.dataset.leagueLogoEnhanced === '1') return;
    select.dataset.leagueLogoEnhanced = '1';
    cleanupOldCustom(select);

    const wrapper = document.createElement('div');
    wrapper.className = 'league-logo-select';
    wrapper.__nativeSelect = select;

    const current = document.createElement('button');
    current.type = 'button';
    current.className = 'league-logo-select__current';
    current.setAttribute('aria-haspopup', 'listbox');
    current.setAttribute('aria-expanded', 'false');

    const menu = document.createElement('div');
    menu.className = 'league-logo-select__menu';
    menu.setAttribute('role', 'listbox');

    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(select, current, menu);
    if (select.id === 'selectLigaPro') select.closest('.data-pro-competition-wrap')?.classList.add('is-custom-league-active');
    if (select.id === 'rankingsSelectLiga') select.closest('.rk39-rank-league-wrap')?.classList.add('is-custom-league-active');
    select.classList.add('league-logo-select__native');
    select.classList.remove('hidden-native-select');

    current.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (window.INCA_MOBILE_SELECT?.shouldUse?.()) {
        window.INCA_MOBILE_SELECT.open(select);
        return;
      }
      const opening = !wrapper.classList.contains('is-open');
      closeAll(wrapper);

      if (opening) {
        rebuild(wrapper);
        wrapper.classList.add('is-open');
      } else {
        wrapper.classList.remove('is-open');
      }

      current.setAttribute('aria-expanded', String(opening));
    });

    select.addEventListener('change', () => {
      cleanupOldCustom(select);
      refresh(wrapper);
      if (wrapper.__morePanel?.classList.contains('is-open')) renderMorePanel(wrapper);
    });

    let rebuildQueued = false;
    const queueRebuild = () => {
      if (rebuildQueued) return;
      rebuildQueued = true;
      requestAnimationFrame(() => {
        rebuildQueued = false;
        if (!document.contains(select) || !document.contains(wrapper)) return;
        rebuild(wrapper);
      });
    };
    new MutationObserver(queueRebuild)
      .observe(select, { childList: true, subtree: true });

    rebuild(wrapper);
  }

  function enhanceAll() {
    SELECT_IDS.forEach(id => enhance(document.getElementById(id)));
  }

  async function init() {
    // Los 7 badges legacy de competición están embebidos.
    // Los escudos de equipos vienen de GitHub/TITAN_LOGOS vía INCA_TITAN.
    enhanceAll();
    console.info('[INCA LEAGUE SELECT V1.016] selectores estables · sin observer global');
    // Los selectores de liga son nodos estáticos del shell. Evitamos observar todo el DOM:
    // Player Picks, tablas y modales generan miles de mutaciones y antes reactivaban este módulo.
    setTimeout(enhanceAll, 350);

    document.addEventListener('click', () => closeAll());
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeAll();
    });
    let positionQueued = false;
    const queuePositionPanels = () => {
      if (positionQueued) return;
      positionQueued = true;
      requestAnimationFrame(() => {
        positionQueued = false;
        document.querySelectorAll('.league-logo-select').forEach(positionMorePanel);
      });
    };
    window.addEventListener('resize', queuePositionPanels, { passive: true });
    window.addEventListener('scroll', queuePositionPanels, { passive: true, capture: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.addEventListener('inca:titan-ready', () => {
    document.querySelectorAll('.league-logo-select').forEach(wrapper => {
      try { refresh(wrapper); } catch (_) {}
    });
  });

})();
