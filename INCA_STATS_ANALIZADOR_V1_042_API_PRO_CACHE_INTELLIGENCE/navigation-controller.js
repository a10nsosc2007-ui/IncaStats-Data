(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const INTERNAL_VIEWS = ['vista-escaner', 'vista-database', 'vista-jugadores', 'vista-rankings'];
  const TOP_BARS = ['topBarScanner', 'topBarPro', 'topBarJugadores'];
  const original = {
    scanner: typeof window.volverAlEscanerOriginal === 'function' ? window.volverAlEscanerOriginal.bind(window) : null,
    database: typeof window.abrirVistaDatabase === 'function' ? window.abrirVistaDatabase.bind(window) : null,
    props: typeof window.abrirVistaJugadores === 'function' ? window.abrirVistaJugadores.bind(window) : null,
    rankings: typeof window.abrirVistaRankings === 'function' ? window.abrirVistaRankings.bind(window) : null,
    modalOpen: typeof window.abrirModalJugador === 'function' ? window.abrirModalJugador.bind(window) : null,
    modalClose: typeof window.cerrarModalJugador === 'function' ? window.cerrarModalJugador.bind(window) : null
  };

  let toastTimer = 0;
  function toast(message, type = 'ok') {
    let el = $('incaNavToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'incaNavToast';
      el.className = 'inca-nav-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = `inca-nav-toast ${type === 'error' ? 'error' : ''} show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  function showScannerShell() {
    $('incaPortal')?.classList.add('portal-shell-hidden');
    const scanner = $('scannerView');
    scanner?.classList.remove('portal-hidden');
    if (scanner) {
      scanner.hidden = false;
      scanner.style.display = 'block';
    }
    document.body.classList.add('scanner-active');
    document.body.classList.remove('modal-open');
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }

  function displayView(viewId, topBarId, mode = 'block') {
    showScannerShell();
    INTERNAL_VIEWS.forEach((id) => {
      const el = $(id);
      if (el) el.style.display = id === viewId ? mode : 'none';
    });
    TOP_BARS.forEach((id) => {
      const el = $(id);
      if (el) el.style.display = id === topBarId ? 'flex' : 'none';
    });
    const main = $('mainContent');
    if (main) main.scrollTop = 0;
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      $(viewId)?.scrollIntoView({ block: 'start' });
    });
  }

  function setLoadingMessage(text) {
    const status = $('statusCargaJugadores');
    if (status) {
      status.classList.remove('success', 'error');
      status.classList.add('loading');
      status.title = text;
    }
    let notice = $('propsImmediateStatus');
    const view = $('vista-jugadores');
    if (!view) return;
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'propsImmediateStatus';
      notice.className = 'props-immediate-status';
      view.prepend(notice);
    }
    notice.innerHTML = `<span class="props-immediate-spinner" aria-hidden="true"></span><div><strong>${text}</strong><small>La vista ya está abierta. La base se termina de preparar en segundo plano.</small></div>`;
    notice.hidden = false;
  }

  function hideLoadingMessage() {
    const notice = $('propsImmediateStatus');
    if (notice) notice.hidden = true;
  }

  function waitFor(test, timeout = 15000, step = 100) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        let value = null;
        try { value = test(); } catch (_) {}
        if (value) return resolve(value);
        if (Date.now() - started >= timeout) return reject(new Error('La base tardó demasiado en responder'));
        setTimeout(tick, step);
      };
      tick();
    });
  }

  async function selectPlayerByName(playerName) {
    if (!playerName) return;
    const input = await waitFor(() => $('inputBusquedaJugador'), 10000);
    input.value = playerName;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
    input.focus({ preventScroll: true });

    try {
      const normalized = String(playerName).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const option = await waitFor(() => {
        const nodes = [...document.querySelectorAll('#resultadosBusquedaJugador button, #resultadosBusquedaJugador [role="option"], #resultadosBusquedaJugador .search-result-item, #resultadosBusquedaJugador [data-player]')];
        return nodes.find(node => node.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(normalized)) || nodes[0];
      }, 7000);
      option?.click();
      toast(`${playerName} seleccionado`);
    } catch (_) {
      toast('Player Picks abierto. Selecciona el jugador en el buscador.');
    }
  }

  async function openProps(playerName = '') {
    showScannerShell();
    document.body.classList.remove('leaderboards-mode','data-pro-mode');
    document.body.classList.add('pro-mode','player-picks-mode');
    // Player Picks tiene sus propios filtros. No mostrar Equipo/Localía/Periodo del Scanner.
    INTERNAL_VIEWS.forEach(id => {
      const el = $(id);
      if (el) el.style.display = id === 'vista-jugadores' ? 'block' : 'none';
    });
    TOP_BARS.forEach(id => {
      const bar = $(id);
      if (bar) { bar.style.display = 'none'; bar.classList.toggle('ppsQ-force-hidden', id === 'topBarScanner'); }
    });
    setLoadingMessage('PREPARANDO PLAYER PICKS…');
    toast('Player Picks abierto');

    try {
      if (original.props) {
        const result = original.props();
        if (result && typeof result.then === 'function') await result;
      }
    } catch (error) {
      console.error('[INCA PROPS OPEN]', error);
      // La navegación no se revierte aunque falle la carga secundaria.
    } finally {
      INTERNAL_VIEWS.forEach(id => {
        const el = $(id);
        if (el) el.style.display = id === 'vista-jugadores' ? 'block' : 'none';
      });
      TOP_BARS.forEach(id => { const bar=$(id); if(bar) bar.style.display='none'; });
      $('topBarScanner')?.classList.add('ppsQ-force-hidden');
    }

    try {
      await waitFor(() => {
        const view = $('vista-jugadores');
        return view && getComputedStyle(view).display !== 'none' && ($('ppsQRoot') || $('inputBusquedaJugador'));
      }, 10000);
      hideLoadingMessage();
      if (playerName) {
        if (window.INCA_PLAYER_PROPS?.selectByName) {
          const ok = await window.INCA_PLAYER_PROPS.selectByName(playerName);
          if (!ok) toast('Jugador no encontrado en la liga/equipo seleccionado.', 'error');
        } else {
          await selectPlayerByName(playerName);
        }
      }
    } catch (error) {
      console.warn('[INCA PROPS READY]', error);
      hideLoadingMessage();
      toast('La vista abrió, pero la base de jugadores sigue cargando.', 'error');
    }
  }

  async function openDatabase() {
    $('topBarScanner')?.classList.remove('ppsQ-force-hidden');
    document.body.classList.remove('leaderboards-mode','player-picks-mode');
    document.body.classList.add('data-pro-mode');
    displayView('vista-database', 'topBarPro', 'block');
    document.body.classList.add('pro-mode');
    toast('Data Histórica PRO abierta');
    try { await original.database?.(); } catch (error) { console.error('[INCA DATABASE OPEN]', error); }
    displayView('vista-database', 'topBarPro', 'block');
  }

  async function openRankings() {
    $('topBarScanner')?.classList.remove('ppsQ-force-hidden');
    document.body.classList.remove('player-picks-mode','data-pro-mode');
    document.body.classList.add('leaderboards-mode');
    // No depender de helpers externos/inexistentes.
    // Leaderboards tiene su propio header y sus propios filtros.
    showScannerShell();

    INTERNAL_VIEWS.forEach(id => {
      const el = $(id);
      if (el) el.style.display = id === 'vista-rankings' ? 'flex' : 'none';
    });
    TOP_BARS.forEach(id => {
      const bar = $(id);
      if (bar) bar.style.display = 'none';
    });

    const main = $('mainContent');
    if (main) main.scrollTop = 0;

    document.body.classList.add('pro-mode');
    toast('Rankings de liga abiertos');

    try {
      await original.rankings?.();
    } catch (error) {
      console.error('[INCA RANKINGS OPEN]', error);
      toast('Leaderboards abrió, pero hubo un problema cargando datos.', 'error');
    }

    // La función legacy puede intentar restaurar topBarPro: lo anulamos otra vez.
    INTERNAL_VIEWS.forEach(id => {
      const el = $(id);
      if (el) el.style.display = id === 'vista-rankings' ? 'flex' : 'none';
    });
    TOP_BARS.forEach(id => {
      const bar = $(id);
      if (bar) bar.style.display = 'none';
    });

    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      $('vista-rankings')?.scrollIntoView({ block:'start' });
    });
  }

  function openScanner() {
    $('topBarScanner')?.classList.remove('ppsQ-force-hidden');
    document.body.classList.remove('leaderboards-mode','player-picks-mode','data-pro-mode');
    displayView('vista-escaner', 'topBarScanner', 'flex');
    document.body.classList.remove('pro-mode');
    try { original.scanner?.(); } catch (error) { console.error('[INCA SCANNER OPEN]', error); }
    displayView('vista-escaner', 'topBarScanner', 'flex');
  }

  function backToPortal() {
    $('topBarScanner')?.classList.remove('ppsQ-force-hidden');
    $('scannerView')?.classList.add('portal-hidden');
    if ($('scannerView')) $('scannerView').style.display = 'none';
    $('incaPortal')?.classList.remove('portal-shell-hidden');
    document.body.classList.remove('scanner-active', 'pro-mode', 'modal-open', 'leaderboards-mode', 'player-picks-mode', 'data-pro-mode');
    INTERNAL_VIEWS.forEach((id) => { const el = $(id); if (el && id !== 'vista-escaner') el.style.display = 'none'; });
    const scannerView = $('vista-escaner');
    if (scannerView) scannerView.style.display = 'flex';
    $('incaPortal')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openPlayerModal(...args) {
    try { original.modalOpen?.(...args); } catch (error) { console.error('[INCA MODAL OPEN]', error); }
    const modal = $('modalJugadorVIP');
    if (modal) {
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }
  }

  function closePlayerModal() {
    try { original.modalClose?.(); } catch (_) {}
    const modal = $('modalJugadorVIP');
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('modal-open');
  }

  window.INCA_NAV = Object.freeze({ openProps, openDatabase, openRankings, openScanner, backToPortal });
  window.abrirVistaJugadores = openProps;
  window.abrirVistaDatabase = openDatabase;
  window.abrirVistaRankings = openRankings;
  window.volverAlEscanerOriginal = openScanner;
  window.abrirModalJugador = openPlayerModal;
  window.cerrarModalJugador = closePlayerModal;

  // Sustituye atributos inline por rutas explícitas.
  $('btnIrJugadores')?.setAttribute('onclick', 'window.INCA_NAV.openProps()');
  $('btnIrDatabase')?.setAttribute('onclick', 'window.INCA_NAV.openDatabase()');
  $('btnIrRankings')?.setAttribute('onclick', 'window.INCA_NAV.openRankings()');
  $('returnToPortal')?.addEventListener('click', backToPortal);

  document.addEventListener('click', (event) => {
    const playerButton = event.target.closest('#playerRows [data-player]');
    if (playerButton) {
      event.preventDefault();
      openProps(playerButton.dataset.player || '');
      return;
    }
    if (event.target === $('modalJugadorVIP')) closePlayerModal();
  });

  console.info('[INCA NAV] Controlador V4.3 listo', {
    props: Boolean(original.props),
    database: Boolean(original.database),
    rankings: Boolean(original.rankings),
    modal: Boolean(original.modalOpen)
  });
})();
