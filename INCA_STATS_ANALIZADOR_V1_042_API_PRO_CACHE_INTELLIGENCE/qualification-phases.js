(() => {
  'use strict';

  const REPO_ROOT = 'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/';
  const CDN_ROOT = 'https://cdn.jsdelivr.net/gh/a10nsosc2007-ui/IncaStats-Data@main/';
  const API_ROOT = 'https://api.github.com/repos/a10nsosc2007-ui/IncaStats-Data/contents/';
  const CANONICAL_FILE = 'INCASTATS_CUPOS_FASES_31_CURRENT.json';
  const SNAPSHOT_FILE = 'INCASTATS_CUPOS_FASES_31_2026-08-30T22-25-47-720Z.json';
  const FILE_RE = /^INCASTATS_CUPOS_FASES_31_(?!CURRENT\.json$).+\.json$/i;

  const state = {
    promise: null,
    data: null,
    sourceUrl: '',
    byCompetitionSeason: new Map(),
    byCompetition: new Map(),
    error: null
  };

  const isLocal = () => /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(location.hostname || '');
  const textKey = value => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[_/.,-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().toUpperCase();

  function withTimeout(ms = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, stop: () => clearTimeout(timer) };
  }

  async function fetchJSON(url, timeout = 9000) {
    const t = withTimeout(timeout);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: t.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json || !Array.isArray(json.leagues)) throw new Error('JSON de cupos/fases inválido');
      return json;
    } finally {
      t.stop();
    }
  }

  function indexData(data) {
    state.byCompetitionSeason.clear();
    state.byCompetition.clear();
    for (const league of data?.leagues || []) {
      const compId = Number(league?.competition_id || 0);
      const seasonId = Number(league?.season_id || 0);
      if (!compId) continue;
      if (!state.byCompetition.has(compId)) state.byCompetition.set(compId, []);
      state.byCompetition.get(compId).push(league);
      if (seasonId) state.byCompetitionSeason.set(`${compId}|${seasonId}`, league);
    }
  }

  async function discoverLatestRootFile() {
    const t = withTimeout(8000);
    try {
      const res = await fetch(API_ROOT, {
        cache: 'no-store',
        signal: t.signal,
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!res.ok) throw new Error(`GitHub contents HTTP ${res.status}`);
      const list = await res.json();
      if (!Array.isArray(list)) return '';
      const matches = list
        .filter(item => item?.type === 'file' && FILE_RE.test(String(item?.name || '')) && item?.download_url)
        .sort((a, b) => String(b.name).localeCompare(String(a.name)));
      return matches[0]?.download_url || '';
    } catch (error) {
      console.warn('[INCA CUPOS/FASES] No se pudo descubrir el último snapshot en raíz.', error?.message || error);
      return '';
    } finally {
      t.stop();
    }
  }

  async function load() {
    const candidates = isLocal()
      ? [
          `./${CANONICAL_FILE}`,
          `${REPO_ROOT}${CANONICAL_FILE}`,
          `${CDN_ROOT}${CANONICAL_FILE}`,
          `${REPO_ROOT}${encodeURIComponent(SNAPSHOT_FILE)}`
        ]
      : [
          `${REPO_ROOT}${CANONICAL_FILE}`,
          `${CDN_ROOT}${CANONICAL_FILE}`,
          `./${CANONICAL_FILE}`,
          `${REPO_ROOT}${encodeURIComponent(SNAPSHOT_FILE)}`
        ];

    let lastError = null;
    for (const url of candidates) {
      try {
        const data = await fetchJSON(url);
        state.data = data;
        state.sourceUrl = url;
        state.error = null;
        indexData(data);
        console.info('[INCA CUPOS/FASES V1.016] cargado', {
          url,
          schema: data.schema_version,
          leagues: data.leagues.length,
          updated_at: data.updated_at
        });
        window.dispatchEvent(new CustomEvent('inca:qualification-ready', { detail: { sourceUrl: url, data } }));
        return data;
      } catch (error) {
        lastError = error;
      }
    }

    const discovered = await discoverLatestRootFile();
    if (discovered) {
      try {
        const data = await fetchJSON(discovered);
        state.data = data;
        state.sourceUrl = discovered;
        state.error = null;
        indexData(data);
        console.info('[INCA CUPOS/FASES V1.016] snapshot raíz descubierto', { url: discovered, leagues: data.leagues.length });
        window.dispatchEvent(new CustomEvent('inca:qualification-ready', { detail: { sourceUrl: discovered, data } }));
        return data;
      } catch (error) {
        lastError = error;
      }
    }

    state.error = lastError || new Error('No se encontró INCASTATS_CUPOS_FASES_31 en la raíz del repositorio.');
    throw state.error;
  }

  function ensureReady() {
    if (state.data) return Promise.resolve(state.data);
    if (!state.promise) state.promise = load().catch(error => {
      state.promise = null;
      throw error;
    });
    return state.promise;
  }

  function forCompetitionSeason(compId, seasonId) {
    const c = Number(compId || 0);
    const s = Number(seasonId || 0);
    if (!c) return null;
    if (s && state.byCompetitionSeason.has(`${c}|${s}`)) return state.byCompetitionSeason.get(`${c}|${s}`);
    if (s) return null; // Nunca mezclar cupos de otra temporada histórica.
    return state.byCompetition.get(c)?.[0] || null;
  }

  function tableMatchScore(tableName, phaseKey, phaseLabel) {
    const name = textKey(tableName);
    const key = textKey(phaseKey);
    const label = textKey(phaseLabel);
    let score = 0;

    const hasA = /\b(?:GROUP|GRUPO) A\b/.test(name);
    const hasB = /\b(?:GROUP|GRUPO) B\b/.test(name);

    if (key.includes('APERTURA') && name.includes('APERTURA')) score += 100;
    if (key.includes('CLAUSURA') && name.includes('CLAUSURA')) score += 100;
    if ((key.endsWith(' A') || key.endsWith('_A')) && hasA) score += 80;
    if ((key.endsWith(' B') || key.endsWith('_B')) && hasB) score += 80;
    if (key === 'REGULAR' && (name.includes('OVERALL') || name.includes('ANUAL'))) score += 70;
    if (key === 'REGULAR' && !name.includes('CONFERENCE') && !name.includes('GROUP') && !name.includes('APERTURA') && !name.includes('CLAUSURA')) score += 30;
    if (label && name.includes(label)) score += 40;
    return score;
  }

  function tableForPhase(league, phaseKey = 'REGULAR', phaseLabel = '') {
    const tables = Array.isArray(league?.tables) ? league.tables : [];
    if (!tables.length) return null;
    if (tables.length === 1) return tables[0];

    const ranked = tables
      .map(table => ({ table, score: tableMatchScore(table?.name, phaseKey, phaseLabel) }))
      .sort((a, b) => b.score - a.score || Number(a.table?.table_index || 0) - Number(b.table?.table_index || 0));
    if (ranked[0]?.score > 0) return ranked[0].table;

    const exactSeason = tables.find(t => textKey(t?.name) === textKey(league?.season_name));
    if (exactSeason) return exactSeason;
    return tables.find(t => textKey(t?.name).includes('OVERALL')) || tables[0];
  }

  function context(compId, seasonId, phaseKey = 'REGULAR', phaseLabel = '') {
    const league = forCompetitionSeason(compId, seasonId);
    if (!league) return null;
    const table = tableForPhase(league, phaseKey, phaseLabel);
    return { league, table, phaseKey, phaseLabel };
  }

  function zonesForContext(ctx) {
    if (!ctx) return [];
    const tableZones = Array.isArray(ctx.table?.zones) ? ctx.table.zones : [];
    if (tableZones.length) return tableZones;
    // En ligas con varias tablas (MLS, Argentina, Perú) no se proyectan
    // cupos de una conferencia/grupo sobre una tabla general distinta.
    const tableCount = Array.isArray(ctx.league?.tables) ? ctx.league.tables.length : 0;
    if (tableCount > 1) return [];
    return (ctx.league?.slots_summary || []).map(slot => ({
      raw_label: slot.raw_label,
      code: slot.code,
      positions: slot.positions_by_table?.[0]?.positions || [],
      slots: slot.total_slots
    }));
  }

  function zoneForPosition(ctx, position) {
    const p = Number(position || 0);
    if (!p) return null;
    return zonesForContext(ctx).find(zone => (zone?.positions || []).map(Number).includes(p)) || null;
  }

  function positionsLabel(positions) {
    const vals = [...new Set((positions || []).map(Number).filter(n => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
    if (!vals.length) return '—';
    const groups = [];
    let start = vals[0], prev = vals[0];
    for (let i = 1; i <= vals.length; i++) {
      const cur = vals[i];
      if (cur === prev + 1) { prev = cur; continue; }
      groups.push(start === prev ? `${start}` : `${start}–${prev}`);
      start = prev = cur;
    }
    return groups.join(', ');
  }

  function labelForZone(zone) {
    const code = String(zone?.code || '').toUpperCase();
    const raw = String(zone?.raw_label || '').trim();
    const map = {
      UEFA_CHAMPIONS_LEAGUE: raw.toLowerCase().includes('qualification') ? 'Clasificación Champions' : 'Champions League',
      UEFA_EUROPA_LEAGUE: raw.toLowerCase().includes('qualification') ? 'Clasificación Europa League' : 'Europa League',
      UEFA_CONFERENCE_LEAGUE: 'Conference League',
      CONMEBOL_LIBERTADORES: raw || 'Copa Libertadores',
      CONMEBOL_SUDAMERICANA: 'Copa Sudamericana',
      PROMOTION: 'Ascenso directo',
      PROMOTION_PLAYOFF: 'Playoff de ascenso',
      QUALIFICATION_PLAYOFF: 'Playoff de clasificación',
      QUALIFICATION: 'Ronda de clasificación',
      PLAYOFFS: 'Playoffs',
      CHAMPIONSHIP_ROUND: 'Fase campeonato',
      RELEGATION_PLAYOFF: 'Playoff de permanencia',
      RELEGATION: raw.toLowerCase().includes('round') ? 'Fase descenso' : 'Descenso'
    };
    return map[code] || raw || code.replace(/_/g, ' ');
  }

  function classForZone(zone) {
    const code = String(zone?.code || '').toUpperCase();
    if (code.includes('CHAMPIONS_LEAGUE')) return 'qzone-ucl';
    if (code.includes('EUROPA_LEAGUE')) return 'qzone-uel';
    if (code.includes('CONFERENCE_LEAGUE')) return 'qzone-conf';
    if (code.includes('LIBERTADORES')) return 'qzone-lib';
    if (code.includes('SUDAMERICANA')) return 'qzone-suda';
    if (code === 'PROMOTION') return 'qzone-promotion';
    if (code === 'PROMOTION_PLAYOFF') return 'qzone-promotion-po';
    if (code === 'QUALIFICATION_PLAYOFF' || code === 'QUALIFICATION') return 'qzone-qualification';
    if (code === 'PLAYOFFS') return 'qzone-playoffs';
    if (code === 'CHAMPIONSHIP_ROUND') return 'qzone-championship';
    if (code === 'RELEGATION_PLAYOFF') return 'qzone-relegation-po';
    if (code === 'RELEGATION') return 'qzone-relegation';
    return 'qzone-other';
  }

  function compactLeagueSummary(league) {
    const slots = Array.isArray(league?.slots_summary) ? league.slots_summary : [];
    return slots.map(slot => {
      const entries = Array.isArray(slot?.positions_by_table) ? slot.positions_by_table : [];
      const labels = entries.map(entry => {
        const table = String(entry?.table || '').trim();
        const pos = positionsLabel(entry?.positions || []);
        return entries.length > 1 ? `${table}: ${pos}` : pos;
      }).filter(Boolean);
      const base = { raw_label:slot?.raw_label, code:slot?.code, slots:slot?.total_slots };
      return {
        ...base,
        ui_label: labelForZone(base),
        positions_label: labels.join(' · ') || String(slot?.total_slots || '—'),
        ui_class: classForZone(base)
      };
    });
  }

  function compactZones(ctx) {
    return zonesForContext(ctx).map(zone => ({
      ...zone,
      ui_label: labelForZone(zone),
      positions_label: positionsLabel(zone?.positions || []),
      ui_class: classForZone(zone)
    }));
  }

  window.INCA_QUALIFICATION = Object.freeze({
    ensureReady,
    forCompetitionSeason,
    tableForPhase,
    context,
    zonesForContext,
    compactZones,
    compactLeagueSummary,
    zoneForPosition,
    positionsLabel,
    labelForZone,
    classForZone,
    source: () => state.sourceUrl,
    metadata: () => state.data ? {
      schema_version: state.data.schema_version,
      extractor_version: state.data.extractor_version,
      scope: state.data.scope,
      updated_at: state.data.updated_at,
      leagues: state.data.leagues?.length || 0
    } : null
  });
})();
