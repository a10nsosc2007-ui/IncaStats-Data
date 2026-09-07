(() => {
  'use strict';

  const BOOT_MAX_WAIT = 12000;
  const BOOT_MIN_VISIBLE = 650;
  const state = { started:false, dismissed:false, startAt:0, overlay:null, stage:0, leagueTimer:null };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const safe = fn => { try { return fn?.(); } catch (_) { return null; } };

  function appLogo() {
    return document.querySelector('.portal-brand img, .brand-logo img, img[alt*="INCA" i]')?.src || 'img/logo.png';
  }

  function ensureBootOverlay() {
    if (state.overlay) return state.overlay;
    const el = document.createElement('div');
    el.className = 'inca-fast-boot';
    el.id = 'incaFastBoot';
    el.innerHTML = `
      <section class="inca-fast-boot__card inca-fast-boot__card--clean" role="status" aria-live="polite">
        <div class="inca-fast-visual" aria-hidden="true">
          <div class="inca-fast-pitch">
            <span class="inca-fast-pitch__line inca-fast-pitch__line--mid"></span>
            <span class="inca-fast-pitch__circle"></span>
            <span class="inca-fast-ball inca-fast-ball--1"><i class="fa-regular fa-futbol"></i></span>
            <span class="inca-fast-ball inca-fast-ball--2"><i class="fa-regular fa-futbol"></i></span>
            <span class="inca-fast-ball inca-fast-ball--3"><i class="fa-regular fa-futbol"></i></span>
          </div>
        </div>

        <div class="inca-fast-clean-copy">
          <div class="inca-fast-boot__brand inca-fast-boot__brand--clean">
            <img id="incaFastBrandLogo" alt="" />
            <div>
              <strong>INCA STATS ANALIZADOR</strong>
              <small>PREPARANDO EL ENTORNO</small>
            </div>
          </div>

          <h2>Todo listo para analizar.</h2>
          <p>Estamos cargando la base, los equipos y los jugadores más usados para que la navegación después sea inmediata.</p>

          <div class="inca-fast-boot__bar"><span id="incaFastBootBar"></span></div>
          <div class="inca-fast-boot__meta">
            <span id="incaFastBootStage">Inicializando…</span>
            <b id="incaFastBootPct">4%</b>
          </div>

          <button class="inca-fast-boot__skip" id="incaFastBootSkip" type="button">
            Entrar ahora
          </button>
        </div>
      </section>`;
    document.body.appendChild(el);
    el.querySelector('#incaFastBrandLogo').src = appLogo();
    el.querySelector('#incaFastBootSkip')?.addEventListener('click', () => dismissBoot(true));
    state.overlay = el;
    return el;
  }

  function setBootProgress(pct, text, step, status='active') {
    const el = ensureBootOverlay();
    const n = Math.max(4, Math.min(100, Math.round(Number(pct) || 0)));
    el.querySelector('#incaFastBootBar').style.width = `${n}%`;
    el.querySelector('#incaFastBootPct').textContent = `${n}%`;
    if (text) el.querySelector('#incaFastBootStage').textContent = text;
    if (step) {
      el.querySelectorAll('.inca-fast-step').forEach(node => {
        const idx = Number(node.dataset.fastStep);
        node.classList.toggle('is-active', idx === step && status === 'active');
        if (idx < step || (idx === step && status === 'done')) node.classList.add('is-done');
        if (idx === step && status === 'error') node.classList.add('is-error');
      });
    }
  }

  function dismissBoot(skipped=false) {
    if (state.dismissed) return;
    state.dismissed = true;
    const el = ensureBootOverlay();
    setBootProgress(100, skipped ? 'La carga terminará en segundo plano.' : 'Todo listo.', 4, 'done');
    setTimeout(() => {
      el.classList.remove('is-open');
      document.documentElement.classList.remove('inca-fast-preparing');
    }, skipped ? 140 : 360);
  }

  function imgReady(url, priority='low') {
    if (!url) return Promise.resolve(false);
    return new Promise(resolve => {
      const img = new Image();
      img.decoding = 'async';
      img.fetchPriority = priority;
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  async function preloadFastLogos() {
    const titan = window.INCA_TITAN;
    if (!titan) return 0;
    const urls = [];
    for (const comp of (titan.CURATED_COMPETITIONS || [])) {
      const url = titan.competitionLogoUrl?.(comp.id);
      if (url) urls.push(url);
    }

    try {
      const league = document.getElementById('selectLiga')?.value;
      const season = document.getElementById('selectTemporada')?.value;
      const teams = titan.teamsForCompetitionSeason?.(league, season) || [];
      for (const team of teams.slice(0, 30)) {
        const url = titan.logoUrl?.(team.name, team.team_id);
        if (url) urls.push(url);
      }
    } catch (_) {}

    let cursor = 0, ok = 0;
    const concurrency=window.matchMedia?.('(max-width: 1100px)').matches?3:6;
    const workers = Array.from({length:Math.min(concurrency, urls.length)}, async () => {
      while (cursor < urls.length) {
        const i = cursor++;
        if (await imgReady(urls[i], i < 8 ? 'high' : 'low')) ok++;
      }
    });
    await Promise.allSettled(workers);
    return ok;
  }

  function waitForInitialLeague(timeout=18000) {
    return new Promise(resolve => {
      const status = document.getElementById('statusCarga');
      if (!status) return resolve(false);
      if (status.classList.contains('ready')) return resolve(true);
      const finish = ok => { try { obs.disconnect(); } catch (_) {} clearTimeout(timer); resolve(ok); };
      const obs = new MutationObserver(() => {
        if (status.classList.contains('ready')) finish(true);
        else if (status.classList.contains('error')) finish(false);
      });
      obs.observe(status,{attributes:true,attributeFilter:['class','title']});
      const timer = setTimeout(() => finish(status.classList.contains('ready')), timeout);
    });
  }

  async function warmup() {
    if (state.started) return;
    state.started = true;
    state.startAt = Date.now();
    document.documentElement.classList.add('inca-fast-preparing');
    const overlay = ensureBootOverlay();
    overlay.classList.add('is-open');
    setTimeout(() => overlay.querySelector('#incaFastBootSkip')?.classList.add('is-visible'), 4200);

    const hardStop = setTimeout(() => dismissBoot(true), BOOT_MAX_WAIT);
    try {
      setBootProgress(10,'Cargando base de datos…',1);
      await window.INCA_TITAN?.ensureReady?.();
      setBootProgress(28,'Base lista · preparando equipos…',1,'done');

      // En móvil no precargamos team_details/caras/logos masivos durante el arranque.
      // Esas capas se cargan bajo demanda al abrir el módulo correspondiente.
      if (window.matchMedia?.('(max-width: 1100px)').matches) {
        setBootProgress(100,'Listo para analizar.',4,'done');
        setTimeout(() => dismissBoot(false), 80);
        return;
      }

      const teamDetailsPromise = window.INCA_TITAN?.ensureTeamDetails?.().catch(() => null);
      setBootProgress(36,'Preparando escudos…',2);
      await preloadFastLogos();
      setBootProgress(52,'Escudos listos.',2,'done');

      setBootProgress(58,'Preparando jugadores…',3);
      const facesPromise = typeof window.asegurarMapasCarasListos === 'function'
        ? window.asegurarMapasCarasListos().catch(() => null)
        : Promise.resolve(null);
      await Promise.race([Promise.allSettled([teamDetailsPromise,facesPromise]), sleep(9000)]);
      setBootProgress(76,'Jugadores listos.',3,'done');

      setBootProgress(82,'Preparando la liga inicial…',4);
      await Promise.race([waitForInitialLeague(11000), sleep(11000)]);
      setBootProgress(96,'Finalizando…',4,'done');
      await sleep(250);

      const elapsed = Date.now() - state.startAt;
      if (elapsed < BOOT_MIN_VISIBLE) await sleep(BOOT_MIN_VISIBLE - elapsed);
      dismissBoot(false);
    } catch (error) {
      console.warn('[INCA FAST BOOT]', error);
      dismissBoot(true);
    } finally {
      clearTimeout(hardStop);
    }
  }

  function ensureLeagueToast() {
    let el = document.getElementById('incaLeagueLoading');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'inca-league-loading';
    el.id = 'incaLeagueLoading';
    el.innerHTML = `<div class="inca-league-loading__head"><span class="inca-league-loading__spinner"></span><div><strong id="incaLeagueLoadingTitle">Actualizando liga…</strong><small id="incaLeagueLoadingDetail">Cargando equipos…</small></div></div><div class="inca-league-loading__bar"><span id="incaLeagueLoadingBar"></span></div>`;
    document.body.appendChild(el);
    return el;
  }

  function leagueStart(select) {
    const el = ensureLeagueToast();
    clearTimeout(state.leagueTimer);
    el.classList.remove('is-ok','is-error');
    const label = select?.selectedOptions?.[0]?.textContent?.trim() || 'nueva liga';
    el.querySelector('#incaLeagueLoadingTitle').textContent = `Preparando ${label}`;
    el.querySelector('#incaLeagueLoadingDetail').textContent = 'Leyendo índice rápido y temporada…';
    el.querySelector('#incaLeagueLoadingBar').style.width = '16%';
    el.classList.add('is-open');
    state.leagueTimer = setTimeout(() => leagueEnd(false,'La carga se liberó. Puedes seguir usando el Analizador.'), 16000);
  }

  function leagueProgress(status) {
    const el = ensureLeagueToast();
    if (!el.classList.contains('is-open')) return;
    const title = String(status?.title || '');
    if (title) el.querySelector('#incaLeagueLoadingDetail').textContent = title.replace(/^TITAN:\s*/i,'');
    const m = title.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) {
      const done=Number(m[1]), total=Number(m[2]);
      const pct = total ? Math.max(16, Math.min(92, 16 + (done/total)*76)) : 36;
      el.querySelector('#incaLeagueLoadingBar').style.width = `${pct}%`;
    } else {
      el.querySelector('#incaLeagueLoadingBar').style.width = '42%';
    }
  }

  function leagueEnd(ok=true, message='Datos listos') {
    const el = ensureLeagueToast();
    clearTimeout(state.leagueTimer);
    if (!el.classList.contains('is-open')) return;
    el.classList.toggle('is-ok', ok);
    el.classList.toggle('is-error', !ok);
    el.querySelector('#incaLeagueLoadingDetail').textContent = message;
    el.querySelector('#incaLeagueLoadingBar').style.width = '100%';
    state.leagueTimer = setTimeout(() => el.classList.remove('is-open','is-ok','is-error'), ok ? 700 : 2400);
  }

  function installLeagueUX() {
    ['selectLiga','selectLigaPro'].forEach(id => {
      const select = document.getElementById(id);
      if (!select || select.dataset.fastUxBound === '1') return;
      select.dataset.fastUxBound='1';
      select.addEventListener('change', () => leagueStart(select), {capture:true});
    });

    [['statusCarga','selectLiga'],['statusCargaPro','selectLigaPro']].forEach(([statusId,selectId]) => {
      const status = document.getElementById(statusId);
      if (!status) return;
      const obs = new MutationObserver(() => {
        if (status.classList.contains('loading')) {
          const select=document.getElementById(selectId);
          if (!ensureLeagueToast().classList.contains('is-open')) leagueStart(select);
          leagueProgress(status);
        } else if (status.classList.contains('ready')) {
          leagueEnd(true, status.classList.contains('partial') ? 'Temporada en curso · datos disponibles listos' : 'Equipos listos · análisis actualizado');
        } else if (status.classList.contains('error')) {
          leagueEnd(false,'No se pudo completar la carga. Reintenta.');
        }
      });
      obs.observe(status,{attributes:true,attributeFilter:['class','title']});
    });
  }

  window.INCA_FAST_UX = Object.freeze({ warmup, leagueStart, leagueEnd, leagueProgress });

  const bootIfAuth = () => {
    installLeagueUX();
    warmup();
  };
  window.addEventListener('inca:auth-ready', bootIfAuth, {once:true});
  if (document.documentElement.classList.contains('inca-authenticated')) setTimeout(bootIfAuth,0);
  document.addEventListener('DOMContentLoaded', installLeagueUX, {once:true});
})();
