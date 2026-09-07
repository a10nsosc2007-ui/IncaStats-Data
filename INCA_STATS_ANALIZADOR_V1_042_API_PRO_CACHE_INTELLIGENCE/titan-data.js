(() => {
  'use strict';

  const cfg = window.INCA_ARCH || {};
  const RAW_BASE = String(cfg.titanRawBase || 'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/TITAN_ALONSINHO_V1_GITHUB_READY/').replace(/\/?$/, '/');
  const CDN_BASE = 'https://cdn.jsdelivr.net/gh/a10nsosc2007-ui/IncaStats-Data@main/TITAN_ALONSINHO_V1_GITHUB_READY/';
  const SESSION_FRESH = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const RELEASE_URL = cfg.titanReleaseUrl || 'https://github.com/a10nsosc2007-ui/IncaStats-Data/releases/download/titan-data-v1/TITAN_ALONSINHO_V1_FULL_DATA_RELEASE.zip';
  const LOGO_ROOT_BASE = String(cfg.titanLogoRootBase || 'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/TITAN_LOGOS/').replace(/\/?$/, '/');
  const LOGO_RAW_BASE = String(cfg.titanLogoRawBase || (LOGO_ROOT_BASE + 'logos_png/')).replace(/\/?$/, '/');
  const COMPETITION_LOGO_RAW_BASE = String(cfg.titanCompetitionLogoRawBase || 'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/TITAN_LOGOS_COMP/logos_png/').replace(/\/?$/, '/');
  const FAST_TEAM_LOGO_BASE = './fast-assets/team-logos/';
  const FAST_COMPETITION_LOGO_BASE = './fast-assets/competition-logos/';
  const LOCAL_COMPETITION_PNG_BASE = './TITAN_LOGOS_COMP/logos_png/';

  const LEGACY_COMPETITIONS = Object.freeze({
    Premier: 17,
    Championship: 18,
    LaLiga: 8,
    SerieA: 23,
    Bundesliga: 35,
    Ligue1: 34,
    Brasileirao: 325
  });

  const LEGACY_PLAYER_COMPETITIONS = Object.freeze({
    17: 'Premier',
    18: 'Championship',
    8: 'LaLiga'
  });


  // Catálogo visible del Analizador: 26 ligas europeas + 5 americanas.
  // Los IDs son uniqueTournament IDs de SofaScore. No se muestran copas ni
  // torneos históricos accidentales descubiertos en el historial de un club.
  const CURATED_COMPETITIONS = Object.freeze([
    { id: 17, region: 'EUROPA', country: 'INGLATERRA', name: 'Premier League' },
    { id: 18, region: 'EUROPA', country: 'INGLATERRA', name: 'Championship' },
    { id: 24, region: 'EUROPA', country: 'INGLATERRA', name: 'League One' },
    { id: 25, region: 'EUROPA', country: 'INGLATERRA', name: 'League Two' },
    { id: 8, region: 'EUROPA', country: 'ESPAÑA', name: 'LaLiga EA Sports' },
    { id: 54, region: 'EUROPA', country: 'ESPAÑA', name: 'LaLiga Hypermotion' },
    { id: 23, region: 'EUROPA', country: 'ITALIA', name: 'Serie A' },
    { id: 53, region: 'EUROPA', country: 'ITALIA', name: 'Serie B' },
    { id: 35, region: 'EUROPA', country: 'ALEMANIA', name: 'Bundesliga' },
    { id: 44, region: 'EUROPA', country: 'ALEMANIA', name: '2. Bundesliga' },
    { id: 34, region: 'EUROPA', country: 'FRANCIA', name: 'Ligue 1' },
    { id: 182, region: 'EUROPA', country: 'FRANCIA', name: 'Ligue 2' },
    { id: 238, region: 'EUROPA', country: 'PORTUGAL', name: 'Liga Portugal' },
    { id: 239, region: 'EUROPA', country: 'PORTUGAL', name: 'Liga Portugal 2' },
    { id: 37, region: 'EUROPA', country: 'PAÍSES BAJOS', name: 'Eredivisie' },
    { id: 131, region: 'EUROPA', country: 'PAÍSES BAJOS', name: 'Eerste Divisie' },
    { id: 38, region: 'EUROPA', country: 'BÉLGICA', name: 'Belgian Pro League' },
    { id: 52, region: 'EUROPA', country: 'TURQUÍA', name: 'Süper Lig' },
    { id: 98, region: 'EUROPA', country: 'TURQUÍA', name: '1. Lig' },
    { id: 45, region: 'EUROPA', country: 'AUSTRIA', name: 'Austrian Bundesliga' },
    { id: 215, region: 'EUROPA', country: 'SUIZA', name: 'Swiss Super League' },
    { id: 39, region: 'EUROPA', country: 'DINAMARCA', name: 'Danish Superliga' },
    { id: 40, region: 'EUROPA', country: 'SUECIA', name: 'Allsvenskan' },
    { id: 20, region: 'EUROPA', country: 'NORUEGA', name: 'Eliteserien' },
    { id: 152, region: 'EUROPA', country: 'RUMANÍA', name: 'Liga I' },
    { id: 185, region: 'EUROPA', country: 'GRECIA', name: 'Super League Greece' },

    { id: 325, region: 'AMÉRICA', country: 'BRASIL', name: 'Brasileirão Série A' },
    { id: 390, region: 'AMÉRICA', country: 'BRASIL', name: 'Brasileirão Série B' },
    { id: 155, region: 'AMÉRICA', country: 'ARGENTINA', name: 'Liga Profesional Argentina' },
    { id: 406, region: 'AMÉRICA', country: 'PERÚ', name: 'Liga 1 Perú' },
    { id: 242, region: 'AMÉRICA', country: 'EE. UU. / CANADÁ', name: 'MLS' }
  ]);

  const CURATED_COMPETITION_BY_ID = new Map(CURATED_COMPETITIONS.map(item => [Number(item.id), item]));

  // V61 · Política real de temporada.
  // Estas ligas usan año natural aunque Noruega/Suecia estén en Europa.
  const CALENDAR_COMPETITION_IDS = new Set([20, 40, 155, 242, 325, 390, 406]);

  function isCalendarCompetition(value) {
    return CALENDAR_COMPETITION_IDS.has(Number(value));
  }

  function normalizeSeasonPolicy(season) {
    if (!season) return season;
    const out = { ...season };
    const compId = Number(out.competition_id) || 0;
    if (isCalendarCompetition(compId)) {
      const start = Number(out.start_year) || 0;
      out.season_format = 'CALENDAR';
      if (start) out.end_year = start;
      if (start && (!out.label || /\d{2,4}\s*[\/-]\s*\d{2,4}/.test(String(out.label)))) {
        const leagueName = CURATED_COMPETITION_BY_ID.get(compId)?.name || '';
        out.label = leagueName ? `${leagueName} ${start}` : String(start);
      }
    }
    return out;
  }

  function seasonCycleForCompetition(value) {
    return isCalendarCompetition(value) ? 'CALENDAR' : 'CROSS_YEAR';
  }

  // Filenames físicos VERIFICADOS en GitHub/TITAN_LOGOS_COMP/logos_png.
  // Algunos archivos fueron subidos con mojibake en el nombre; se respeta
  // el filename real del repositorio para que no genere 404.
  const COMPETITION_LOGO_FILES = Object.freeze({
    8: '8_LaLiga EA Sports.png',
    17: '17_Premier League.png',
    18: '18_Championship.png',
    20: '20_Eliteserien.png',
    23: '23_Serie A.png',
    24: '24_League One.png',
    25: '25_League Two.png',
    34: '34_Ligue 1.png',
    35: '35_Bundesliga.png',
    37: '37_Eredivisie.png',
    38: '38_Belgian Pro League.png',
    39: '39_Danish Superliga.png',
    40: '40_Allsvenskan.png',
    44: '44_2. Bundesliga.png',
    45: '45_Austrian Bundesliga.png',
    52: '52_S├╝per Lig.png',
    53: '53_Serie B.png',
    54: '54_LaLiga Hypermotion.png',
    98: '98_1. Lig.png',
    131: '131_Eerste Divisie.png',
    152: '152_Liga I.png',
    155: '155_Liga Profesional Argentina.png',
    182: '182_Ligue 2.png',
    185: '185_Super League Greece.png',
    215: '215_Swiss Super League.png',
    238: '238_Liga Portugal.png',
    239: '239_Liga Portugal 2.png',
    242: '242_MLS.png',
    325: '325_Brasileir├úo S├⌐rie A.png',
    390: '390_Brasileir├úo S├⌐rie B.png',
    406: '406_Liga 1 Per├║.png'
  });


  const state = {
    initPromise: null,
    teamDetailsPromise: null,
    global: null,
    teams: [],
    competitions: [],
    seasons: [],
    teamDetails: [],
    competitionMap: new Map(),
    seasonMap: new Map(),
    seasonsByCompetition: new Map(),
    datasetCache: new Map(),
    teamById: new Map(),
    teamLogoByKey: new Map(),
    filesByCompetitionSeason: new Map(),
    logoFileByTeamId: new Map(),
    logoIndexPromise: null,
    logoIndexReady: false,
    logoIndexSource: '',
    cardsDetailPromise: null,
    secondYellowRedMap: new Map(),
    cardsDetailSource: '',
    cardsDetailAvailable: false,
    teamHistoryCache: new Map(),
    fixtureSeasonSyncAt: 0,
    fastSeasonIndexPromise: null,
    fastSeasonIndexReady: false,
    fastSeasonIndexSource: ''
  };

  const encPath = path => String(path || '').split('/').map(part => encodeURIComponent(part)).join('/');
  function dataRevisionToken() {
    return String(
      state.global?.live_update?.updated_at ||
      state.global?.generated_at ||
      ''
    ).trim();
  }

  function raw(path) {
    const base = RAW_BASE + encPath(path);
    const rev = dataRevisionToken();
    if (!rev || !/\.(?:json|csv)$/i.test(String(path || ''))) return base;
    return `${base}?rev=${encodeURIComponent(rev)}`;
  }

  function cdn(path) {
    const base = CDN_BASE + encPath(path);
    const rev = dataRevisionToken();
    if (!rev || !/\.(?:json|csv)$/i.test(String(path || ''))) return base;
    return `${base}?rev=${encodeURIComponent(rev)}`;
  }

  function withSession(url) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}inca_boot=${encodeURIComponent(SESSION_FRESH)}`;
  }


  function competitionIdFromValue(value) {
    if (Number.isInteger(Number(value)) && Number(value) > 0) return Number(value);
    const s = String(value || '').trim();
    const titan = /^TITAN_C(\d+)$/i.exec(s);
    if (titan) return Number(titan[1]);
    return Number(LEGACY_COMPETITIONS[s] || 0) || null;
  }

  function competitionLogoCandidates(value) {
    const id = competitionIdFromValue(value);
    if (!id) return [];

    // Las 31 ligas principales usan EXCLUSIVAMENTE los PNG propios del repo.
    // Nada de fallback externo que termine en HTTP 403.
    const physical = COMPETITION_LOGO_FILES[Number(id)];
    if (physical) {
            // Si faltara por cualquier motivo, conservamos el PNG remoto como fallback.
      return [
        `${LOCAL_COMPETITION_PNG_BASE}${Number(id)}.png`,
        LOCAL_COMPETITION_PNG_BASE + encodeURIComponent(physical),
        `${FAST_COMPETITION_LOGO_BASE}${Number(id)}.webp`,
        COMPETITION_LOGO_RAW_BASE + encodeURIComponent(physical)
      ];
    }

    // Copas/subtorneos sin PNG propio: se deja icono neutro en la UI.
    return [];
  }

  function competitionLogoUrl(value) {
    return competitionLogoCandidates(value)[0] || '';
  }

  function preloadCompetitionLogos() {
    const run = () => {
      for (const item of CURATED_COMPETITIONS) {
        try {
          const img = new Image();
          img.decoding = 'async';
          img.fetchPriority = 'low';
          img.src = competitionLogoUrl(item.id);
        } catch (_) {}
      }
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3500 });
    else setTimeout(run, 1800);
  }

  const logoKey = value => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' AND ')
    .replace(/\b(?:AFC|FC|CF|SC|AC|CD|UD|RC|FK|SK|BK|SV|AS|US|CA)\b/gi, ' ')
    .replace(/\b(?:FOOTBALL CLUB|FUTBOL CLUB|CLUB DE FUTBOL)\b/gi, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const LOGO_ALIASES = Object.freeze({
    'WOLVES': 'WOLVERHAMPTON WANDERERS',
    'WOLVERHAMPTON': 'WOLVERHAMPTON WANDERERS',
    'BRIGHTON HOVE ALBION': 'BRIGHTON AND HOVE ALBION',
    'NOTTM FOREST': 'NOTTINGHAM FOREST',
    'MAN UTD': 'MANCHESTER UNITED',
    'MAN CITY': 'MANCHESTER CITY',
    'SPURS': 'TOTTENHAM HOTSPUR',
    'NEWCASTLE': 'NEWCASTLE UNITED',
    'WEST HAM': 'WEST HAM UNITED'
  });

  function safeLogoFilename(name) {
    return String(name || 'team')
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 120) || 'team';
  }

  function logoKeys(name) {
    const rawName = String(name || '').trim();
    const base = logoKey(rawName);
    const compact = base.replace(/\s+/g, '');
    const keys = new Set([base, compact]);
    const alias = LOGO_ALIASES[base];
    if (alias) {
      const ak = logoKey(alias);
      keys.add(ak);
      keys.add(ak.replace(/\s+/g, ''));
    }
    return [...keys].filter(Boolean);
  }


  async function ensureLogoIndex() {
    if (state.logoIndexReady) return state.logoFileByTeamId;
    if (state.logoIndexPromise) return state.logoIndexPromise;

    state.logoIndexPromise = (async () => {
      const exact = new Map();

      // 1) Fuente preferida: auditoría del mejorador IA.
      //    Tiene los nombres físicos exactos de los 731 PNG.
      try {
        const audit = await fetch(LOGO_ROOT_BASE + 'AI_ENHANCE_AUDIT.json', { cache: 'force-cache' });
        if (audit.ok) {
          const payload = await audit.json();
          for (const row of (payload?.files || [])) {
            const file = String(row?.file || '').split('/').pop();
            const match = file.match(/^(\d+)_(.+\.png)$/i);
            if (!match) continue;
            exact.set(Number(match[1]), file);
          }
          if (exact.size) state.logoIndexSource = 'AI_ENHANCE_AUDIT.json';
        }
      } catch (_) {}

      // 2) Fallback: manifest del extractor. Usa exactamente el nombre con
      //    el que TITAN creó originalmente cada PNG.
      if (!exact.size) {
        try {
          const response = await fetch(LOGO_ROOT_BASE + 'logos_manifest.json', { cache: 'force-cache' });
          if (response.ok) {
            const payload = await response.json();
            for (const team of (payload?.teams || [])) {
              const id = Number(team?.team_id);
              const name = String(team?.name || '').trim();
              if (!id || !name) continue;
              exact.set(id, `${id}_${safeLogoFilename(name)}.png`);
            }
            if (exact.size) state.logoIndexSource = 'logos_manifest.json';
          }
        } catch (_) {}
      }

      state.logoFileByTeamId = exact;
      state.logoIndexReady = true;

      try {
        window.dispatchEvent(new CustomEvent('inca:titan-logo-index-ready', {
          detail: { count: exact.size, source: state.logoIndexSource }
        }));
      } catch (_) {}

      if (exact.size) {
        console.info(`[INCA TITAN] Logo index exacto: ${exact.size} archivos desde ${state.logoIndexSource}`);
      } else {
        console.warn('[INCA TITAN] No se encontró índice exacto de logos; se usará fallback por nombre.');
      }

      return exact;
    })().finally(() => {
      state.logoIndexPromise = null;
    });

    return state.logoIndexPromise;
  }

  function exactLogoFile(teamId) {
    const id = Number(teamId);
    return id ? (state.logoFileByTeamId.get(id) || '') : '';
  }

  function teamLogoUrl(name, id = null) {
    let team = null;
    const numericId = Number(id);

    if (numericId && state.teamById.has(numericId)) {
      team = state.teamById.get(numericId);
    } else if (numericId) {
      team = { team_id: numericId, name: String(name || '').trim() };
    } else {
      for (const key of logoKeys(name)) {
        const hit = state.teamLogoByKey.get(key);
        if (hit) { team = hit; break; }
      }
    }

    if (!team?.team_id) return '';

        // del Portal. Esto elimina la latencia de GitHub para el uso normal.
    // La numeración es el Team_ID de SofaScore, por lo que no necesitamos
    // resolver el filename pesado del PNG para pintar el escudo.
    if (Number(team.team_id) > 0) {
      return `${FAST_TEAM_LOGO_BASE}${Number(team.team_id)}.webp`;
    }

    // Fallback histórico (solo debería usarse si en el futuro aparece un club
    // fuera del pack FAST y el Portal aún no fue regenerado).
    const exactFile = exactLogoFile(team.team_id);
    if (exactFile) return LOGO_RAW_BASE + encodeURIComponent(exactFile);
    return '';
  }

  async function resolveLogoUrl(name, id = null) {
    await ensureLogoIndex().catch(() => {});
    preloadCompetitionLogos();
    return teamLogoUrl(name, id);
  }

  function preloadTeamLogo(name, id = null) {
    const url = teamLogoUrl(name, id);
    if (!url) return '';
    try {
      const img = new Image();
      img.decoding = 'async';
      img.fetchPriority = 'low';
      img.crossOrigin = 'anonymous';
      img.src = url;
    } catch (_) {}
    return url;
  }


  async function fetchJSON(path, options = {}) {
    const isManifest = /^manifest\//i.test(String(path || ''));
    const isGlobal = /manifest\/manifest_global\.json$/i.test(String(path || ''));
    const forceFresh = isManifest || isGlobal || options.fresh === true;
    const candidates = [raw(path), cdn(path)];
    let lastError = null;

    for (let i = 0; i < candidates.length; i++) {
      const baseUrl = candidates[i];
      const url = forceFresh ? withSession(baseUrl) : baseUrl;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Number(options.timeout || (i === 0 ? 7000 : 9000)));
      try {
        const response = await fetch(url, {
          cache: forceFresh ? 'no-store' : 'default',
          headers: { Accept: 'application/json' },
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`TITAN ${path}: HTTP ${response.status} @ ${new URL(url).hostname}`);
        return await response.json();
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error(`TITAN ${path}: no disponible`);
  }

  async function fetchLocalCore(name) {
    const response = await fetch(`./fast-assets/titan-core/${name}?v=9`, { cache:'default' });
    if (!response.ok) throw new Error(`LOCAL_CORE_${name}: HTTP ${response.status}`);
    return response.json();
  }

  async function ensureFastSeasonIndex() {
    if (state.fastSeasonIndexReady) return state.filesByCompetitionSeason;
    if (state.fastSeasonIndexPromise) return state.fastSeasonIndexPromise;
    state.fastSeasonIndexPromise = (async () => {
      const response = await fetch('./fast-assets/titan-season-files.json?v=9', { cache:'default' });
      if (!response.ok) throw new Error(`FAST_INDEX_HTTP_${response.status}`);
      const payload = await response.json();
      const keys = payload?.keys || {};
      const next = new Map();
      for (const [key, rows] of Object.entries(keys)) {
        const group = new Map();
        for (const item of (Array.isArray(rows) ? rows : [])) {
          if (!item?.file) continue;
          group.set(item.file, { file:item.file, team_id:Number(item.team_id)||0, name:String(item.name||'') });
        }
        if (group.size) next.set(key, group);
      }
      if (next.size) state.filesByCompetitionSeason = next;
      state.fastSeasonIndexReady = next.size > 0;
      state.fastSeasonIndexSource = './fast-assets/titan-season-files.json';
      return state.filesByCompetitionSeason;
    })().catch(error => {
      state.fastSeasonIndexPromise = null;
      console.warn('[INCA TITAN] Índice rápido no disponible; se usará team_details bajo demanda.', error);
      throw error;
    });
    return state.fastSeasonIndexPromise;
  }

  function parseTitanCompetition(value) {
    const match = /^TITAN_C(\d+)$/.exec(String(value || ''));
    return match ? Number(match[1]) : null;
  }

  function parseTitanSeason(value) {
    const match = /^TITAN_S(\d+)$/.exec(String(value || ''));
    return match ? Number(match[1]) : null;
  }

  function seasonLegacyKey(season) {
    if (!season) return '';
    const a = Number(season.start_year);
    const b = Number(season.end_year);
    if (!Number.isFinite(a)) return '';
    if (isCalendarCompetition(Number(season.competition_id))) return String(a);
    const aa = String(a).slice(-2);
    const bb = String(Number.isFinite(b) ? b : a).slice(-2);
    return `${aa}_${bb}`;
  }

  function legacyCompetitionId(value) {
    return LEGACY_COMPETITIONS[String(value || '')] || null;
  }

  function sortCompetitions(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
  }

  function sortSeasons(a, b) {
    const currentA = a.season_status === 'CURRENT' ? 1 : 0;
    const currentB = b.season_status === 'CURRENT' ? 1 : 0;
    if (currentA !== currentB) return currentB - currentA;
    return (Number(b.start_year) || 0) - (Number(a.start_year) || 0)
      || (Number(b.end_year) || 0) - (Number(a.end_year) || 0)
      || (Number(b.season_id) || 0) - (Number(a.season_id) || 0);
  }

  function regionOfCompetition(comp) {
    const regions = Array.isArray(comp?.regions) ? comp.regions : [];
    if (regions.includes('Europe') && regions.includes('America')) return 'MIXTAS / INTERNACIONALES';
    if (regions.includes('America')) return 'AMÉRICA';
    if (regions.includes('Europe')) return 'EUROPA';
    return 'OTRAS';
  }

  function seasonYearsFromFixtureMeta(meta = {}, competitionId = 0) {
    const label = String(meta.season_name || meta.label || '').trim();
    const target = Number(meta.target_start_year) || 0;
    const cycle = isCalendarCompetition(competitionId) ? 'CALENDAR' : String(meta.season_cycle || '').toUpperCase();
    let start = 0, end = 0;
    let m = /(20\d{2})\s*[\/\-]\s*(?:20)?(\d{2,4})/.exec(label);
    if (m) {
      start = Number(m[1]) || 0;
      const rawEnd = String(m[2]);
      end = rawEnd.length === 2 ? 2000 + Number(rawEnd) : Number(rawEnd);
    } else {
      m = /(?:^|\D)(20\d{2})(?:\D|$)/.exec(label);
      if (m) start = end = Number(m[1]) || 0;
    }
    if (!start && target) start = target;
    if (!end && start) end = cycle === 'CALENDAR' ? start : start + 1;
    if (cycle === 'CALENDAR' && start) end = start;
    return { start_year:start || null, end_year:end || null };
  }

  async function mergeCurrentSeasonsFromFixtures({ refreshSelectors = false } = {}) {
    const fx = window.INCA_FIXTURES;
    if (!fx?.ensureReady || !fx?.competitionMeta) return 0;
    try { await fx.ensureReady(); } catch (_) { return 0; }

    let changed = 0;
    for (const item of CURATED_COMPETITIONS) {
      const meta = fx.competitionMeta(Number(item.id));
      const sid = Number(meta?.season_id) || 0;
      if (!sid) continue;

      const years = seasonYearsFromFixtureMeta(meta, item.id);
      const label = String(meta?.season_name || '').trim() ||
        (years.start_year ? (years.start_year === years.end_year ? String(years.start_year) : `${years.start_year}/${years.end_year}`) : `Temporada ${sid}`);

      // La temporada que TITAN FIXTURES usa para la liga es la temporada operativa actual.
      // Si el manifest histórico todavía no la conoce, se crea una entrada virtual.
      for (const season of state.seasons) {
        if (Number(season.competition_id) !== Number(item.id)) continue;
        if (String(season.season_status || '').toUpperCase() === 'CURRENT' && Number(season.season_id) !== sid) {
          season.season_status = 'FINISHED';
          season.season_status_basis = 'SUPERSEDED_BY_TITAN_FIXTURES';
          changed += 1;
        }
      }

      let season = state.seasons.find(x => Number(x.competition_id) === Number(item.id) && Number(x.season_id) === sid);
      if (!season) {
        season = {
          competition_id:Number(item.id),
          season_id:sid,
          label,
          start_year:years.start_year,
          end_year:years.end_year,
          season_format:isCalendarCompetition(item.id) || String(meta?.season_cycle || '').toUpperCase() === 'CALENDAR' ? 'CALENDAR' : 'NORMAL',
          season_status:'CURRENT',
          season_status_basis:'TITAN_FIXTURES_CURRENT_SEASON',
          phases:['REGULAR'],
          stages:[],
          regions:[item.region === 'AMÉRICA' ? 'America' : 'Europe'],
          virtual_from_fixtures:true
        };
        state.seasons.push(season);
        changed += 1;
      } else {
        const before = `${season.season_status}|${season.label}|${season.start_year}|${season.end_year}`;
        season.season_status = 'CURRENT';
        season.season_status_basis = 'TITAN_FIXTURES_CURRENT_SEASON';
        if (label) season.label = label;
        if (years.start_year) season.start_year = years.start_year;
        if (years.end_year) season.end_year = years.end_year;
        if (isCalendarCompetition(item.id)) {
          season.season_format = 'CALENDAR';
          if (season.start_year) season.end_year = season.start_year;
        }
        season.virtual_from_fixtures = Boolean(season.virtual_from_fixtures);
        const after = `${season.season_status}|${season.label}|${season.start_year}|${season.end_year}`;
        if (before !== after) changed += 1;
      }
    }

    if (changed) {
      buildIndexes();
      state.fixtureSeasonSyncAt = Date.now();
      if (refreshSelectors) hydrateSelectors();
      window.dispatchEvent(new CustomEvent('inca:titan-seasons-synced', { detail:{ changed } }));
    }
    return changed;
  }

  function currentSeasonForCompetition(value) {
    const id = parseTitanCompetition(value) || Number(value) || 0;
    return allSeasonsForCompetition(id).find(s => String(s.season_status || '').toUpperCase() === 'CURRENT') || null;
  }

  function buildIndexes() {
    state.competitionMap = new Map(state.competitions.map(c => [Number(c.competition_id), c]));
    state.seasonMap = new Map(state.seasons.map(s => [Number(s.season_id), s]));
    state.seasonsByCompetition = new Map();
    state.teamById = new Map();
    state.teamLogoByKey = new Map();

    for (const team of state.teams) {
      const id = Number(team.team_id);
      if (!id) continue;
      state.teamById.set(id, team);
      for (const key of logoKeys(team.name)) {
        if (!state.teamLogoByKey.has(key)) state.teamLogoByKey.set(key, team);
      }
    }

    for (const season of state.seasons) {
      const id = Number(season.competition_id);
      if (!state.seasonsByCompetition.has(id)) state.seasonsByCompetition.set(id, []);
      state.seasonsByCompetition.get(id).push(season);
    }
    for (const seasons of state.seasonsByCompetition.values()) seasons.sort(sortSeasons);
  }

  function desiredCompetitionId(select) {
    const current = select?.value || '';
    return parseTitanCompetition(current) || legacyCompetitionId(current) || 17;
  }

  function populateCompetitionSelect(select, optimistic = false) {
    if (!select) return;
    const wanted = desiredCompetitionId(select);
    const fragment = document.createDocumentFragment();

    for (const region of ['EUROPA', 'AMÉRICA']) {
      const regionItems = CURATED_COMPETITIONS
        .filter(item => item.region === region)
        .slice()
        .sort((a, b) => String(a.country || '').localeCompare(String(b.country || ''), 'es', { sensitivity: 'base' })
          || String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }));
      if (!regionItems.length) continue;

      for (const item of regionItems) {
        const source = state.competitionMap.get(Number(item.id)) || null;
        const seasons = state.seasonsByCompetition.get(Number(item.id)) || [];
        const available = optimistic || (!!source && seasons.length > 0);
        const option = document.createElement('option');
        option.value = `TITAN_C${item.id}`;
        option.textContent = item.name;
        option.dataset.titan = '1';
        option.dataset.competitionId = String(item.id);
        option.dataset.region = item.region;
        option.dataset.country = item.country;
        option.dataset.displayName = item.name;
        option.dataset.available = available ? '1' : '0';
        option.dataset.competitionType = String(source?.competition_type || 'LEAGUE');
        option.disabled = !available;
        fragment.appendChild(option);
      }
    }

    select.replaceChildren(fragment);
    const desiredValue = `TITAN_C${wanted}`;
    const desiredOption = [...select.options].find(o => o.value === desiredValue && !o.disabled);
    const firstAvailable = [...select.options].find(o => !o.disabled);
    select.value = desiredOption?.value || firstAvailable?.value || '';
    select.dataset.titanCatalog = 'curated31';
    try { window.refrescarSelectCustom?.(select.id); } catch (_) {}
  }

  function allSeasonsForCompetition(compId) {
    const id = Number(compId);
    const merged = [
      ...(state.seasonsByCompetition.get(id) || []),
      ...state.seasons.filter(season => Number(season.competition_id) === id)
    ];
    const byId = new Map();
    for (const season of merged) {
      const sid = Number(season?.season_id);
      if (sid && !byId.has(sid)) byId.set(sid, season);
    }
    return [...byId.values()].sort(sortSeasons);
  }

  function preferredSeasonId(compId, oldValue) {
    const seasons = allSeasonsForCompetition(compId);

    // V59: siempre entrar por la temporada operativa ACTUAL. Esto evita que un
    // select viejo guardado en 25/26 tape una 26/27 que ya apareció tras el BAT.
    const current = seasons.find(s => String(s.season_status || '').toUpperCase() === 'CURRENT');
    if (current) return Number(current.season_id) || null;

    const already = parseTitanSeason(oldValue);
    if (already && seasons.some(s => Number(s.season_id) === already)) return already;

    const legacy = String(oldValue || '').trim();

    if (isCalendarCompetition(compId)) {
      let year = 0;
      if (/^20\d{2}$/.test(legacy)) year = Number(legacy);
      else if (/^\d{2}_\d{2}$/.test(legacy) && legacy.slice(0,2) === legacy.slice(3,5)) {
        year = 2000 + Number(legacy.slice(0,2));
      }
      if (year) {
        const exactCalendar = seasons.find(s => Number(s.start_year) === year);
        if (exactCalendar) return Number(exactCalendar.season_id);
      }
    }

    if (/^\d{2}_\d{2}$/.test(legacy)) {
      const start = 2000 + Number(legacy.slice(0, 2));
      const end = 2000 + Number(legacy.slice(3, 5));
      const exact = seasons.find(s => Number(s.start_year) === start && Number(s.end_year) === end)
        || seasons.find(s => Number(s.start_year) === start);
      if (exact) return Number(exact.season_id);
    }

    return Number(seasons[0]?.season_id) || null;
  }

  function populateSeasonSelect(select, competitionValue, oldValue = null) {
    if (!select) return;
    const compId = parseTitanCompetition(competitionValue);
    if (!compId) return;
    const seasons = allSeasonsForCompetition(compId);
    const wanted = preferredSeasonId(compId, oldValue ?? select.value);
    const fragment = document.createDocumentFragment();

    for (const season of seasons) {
      const option = document.createElement('option');
      option.value = `TITAN_S${season.season_id}`;
      const current = season.season_status === 'CURRENT' ? '  • ACTUAL' : '';
      option.textContent = `${season.label || `${season.start_year}/${season.end_year}`}${current}`;
      option.dataset.titan = '1';
      option.dataset.seasonId = String(season.season_id);
      option.dataset.status = String(season.season_status || 'UNKNOWN');
      option.dataset.statusBasis = String(season.season_status_basis || '');
      fragment.appendChild(option);
    }

    select.replaceChildren(fragment);
    select.dataset.titanSeasonCount = String(seasons.length);
    select.dataset.titanHistoricalSeasonCount = String(seasons.filter(season => season.season_status !== 'CURRENT').length);
    const desiredValue = `TITAN_S${wanted}`;
    select.value = [...select.options].some(o => o.value === desiredValue)
      ? desiredValue
      : (select.options[0]?.value || '');
    select.dataset.titanCatalog = '1';
    try { window.refrescarSelectCustom?.(select.id); } catch (_) {}
  }

  function hydrateSelectors() {
    const pairs = [
      ['selectLiga', 'selectTemporada'],
      ['selectLigaPro', 'selectTemporadaPro']
    ];
    for (const [leagueId, seasonId] of pairs) {
      const league = document.getElementById(leagueId);
      const season = document.getElementById(seasonId);
      if (!league || !season) continue;
      const oldLeague = league.value;
      const oldSeason = season.value;
      populateCompetitionSelect(league);
      const wantedId = legacyCompetitionId(oldLeague);
      if (wantedId) {
        const target = `TITAN_C${wantedId}`;
        if ([...league.options].some(o => o.value === target)) league.value = target;
      }
      populateSeasonSelect(season, league.value, oldSeason);
      try { window.refrescarSelectCustom?.(leagueId); window.refrescarSelectCustom?.(seasonId); } catch (_) {}
    }
  }

  function primeSelectors() {
    const pairs = [
      ['selectLiga', 'selectTemporada'],
      ['selectLigaPro', 'selectTemporadaPro'],
      ['fixtureLeague', 'fixtureSeason'],
      ['compareLeagueA', 'compareSeasonA'],
      ['compareLeagueB', 'compareSeasonB']
    ];
    for (const [leagueId] of pairs) {
      const league = document.getElementById(leagueId);
      if (!league || league.dataset.titanPrimed === '1') continue;
      const current = league.value;
      populateCompetitionSelect(league, true);
      const legacyId = legacyCompetitionId(current);
      const target = legacyId ? `TITAN_C${legacyId}` : current;
      if ([...league.options].some(o => o.value === target)) league.value = target;
      league.dataset.titanPrimed = '1';
    }
  }

  async function init() {
    if (state.initPromise) return state.initPromise;
    state.initPromise = (async () => {
      // V4: primero obtenemos una revisión pequeña. Los demás manifests quedan
      // versionados por esa revisión y el navegador puede reutilizarlos sin
      // descargar 13 MB de team_details en cada arranque.
      state.global = await fetchJSON('manifest/manifest_global.json', { fresh:true, timeout:8000 })
        .catch(async error => {
          console.warn('[INCA TITAN] manifest_global remoto no respondió; usando snapshot local V4.', error);
          return fetchLocalCore('manifest_global.json');
        });
      let [teamsPayload, competitionsPayload, seasonsPayload] = await Promise.all([
        fetchJSON('manifest/teams.json', { timeout:8000 }).catch(() => fetchLocalCore('teams.json')),
        fetchJSON('manifest/competitions.json', { timeout:8000 }).catch(() => fetchLocalCore('competitions.json')),
        fetchJSON('manifest/seasons.json', { timeout:8000 }).catch(() => fetchLocalCore('seasons.json')),
        ensureFastSeasonIndex().catch(() => null)
      ]);

      // V5 · guardia anti-cache inconsistente. GitHub RAW puede servir durante
      // unos minutos manifests de revisiones distintas después de un push.
      // Si los conteos no cuadran con manifest_global, preferimos el snapshot
      // local coherente y seguimos arrancando en vez de dejar el Analizador colgado.
      const expectedTeams = Number(state.global?.coverage?.teams || 0);
      const expectedCompetitions = Number(state.global?.counts?.competitions || 0);
      const expectedSeasons = Number(state.global?.counts?.competition_seasons || 0);
      const remoteTeams = Array.isArray(teamsPayload?.teams) ? teamsPayload.teams.length : 0;
      const remoteCompetitions = Array.isArray(competitionsPayload?.competitions) ? competitionsPayload.competitions.length : 0;
      const remoteSeasons = Array.isArray(seasonsPayload?.seasons) ? seasonsPayload.seasons.length : 0;

      if ((expectedTeams && remoteTeams !== expectedTeams) ||
          (expectedCompetitions && remoteCompetitions !== expectedCompetitions) ||
          (expectedSeasons && remoteSeasons !== expectedSeasons)) {
        console.warn('[INCA TITAN V5] Manifests remotos inconsistentes; usando snapshot local coherente.', {
          expected:{teams:expectedTeams,competitions:expectedCompetitions,seasons:expectedSeasons},
          received:{teams:remoteTeams,competitions:remoteCompetitions,seasons:remoteSeasons}
        });
        const local = await Promise.all([
          fetchLocalCore('teams.json'),
          fetchLocalCore('competitions.json'),
          fetchLocalCore('seasons.json')
        ]);
        const localTeams = local[0]?.teams || [];
        const localCompetitions = local[1]?.competitions || [];
        const localSeasons = local[2]?.seasons || [];
        if ((!expectedTeams || localTeams.length === expectedTeams) &&
            (!expectedCompetitions || localCompetitions.length === expectedCompetitions) &&
            (!expectedSeasons || localSeasons.length === expectedSeasons)) {
          [teamsPayload, competitionsPayload, seasonsPayload] = local;
        }
      }

      state.teams = teamsPayload?.teams || [];
      state.competitions = competitionsPayload?.competitions || [];
      state.seasons = (seasonsPayload?.seasons || []).map(normalizeSeasonPolicy);
      buildIndexes();
      // TITAN FIXTURES manda sobre cuál es la temporada operativa actual.
      await mergeCurrentSeasonsFromFixtures().catch(() => 0);
      buildIndexes();
      hydrateSelectors();
      // team_details (~13 MB) se carga sólo cuando un módulo histórico/Team Intel
      // realmente lo necesita. El Analizador usa el índice rápido local.
      document.documentElement.dataset.titanReady = '1';
      window.dispatchEvent(new CustomEvent('inca:titan-ready', {
        detail: {
          teams: state.teams.length,
          competitions: state.competitions.length,
          seasons: state.seasons.length,
          releaseUrl: RELEASE_URL
        }
      }));
      return state;
    })().catch(error => {
      state.initPromise = null;
      document.documentElement.dataset.titanReady = '0';
      console.error('[INCA TITAN] No se pudo inicializar el catálogo.', error);
      throw error;
    });
    return state.initPromise;
  }

  function buildTeamDetailsFromFastIndex() {
    if (!state.filesByCompetitionSeason?.size) return [];
    const byTeam = new Map();
    for (const [key, group] of state.filesByCompetitionSeason.entries()) {
      const [compRaw, seasonRaw] = String(key).split('|');
      const competition_id = Number(compRaw) || 0;
      const season_id = Number(seasonRaw) || 0;
      if (!competition_id || !season_id) continue;
      for (const item of group.values()) {
        const team_id = Number(item?.team_id) || 0;
        if (!team_id || !item?.file) continue;
        let team = byTeam.get(team_id);
        if (!team) {
          const catalog = state.teamById?.get(team_id) || {};
          team = {
            team_id,
            name: item.name || catalog.name || `Team ${team_id}`,
            country: catalog.country || '',
            region: catalog.region || '',
            file: item.file,
            competition_details: []
          };
          byTeam.set(team_id, team);
        }
        if (!team.competition_details.some(x => Number(x.competition_id) === competition_id && Number(x.season_id) === season_id)) {
          const comp = state.competitionMap?.get(competition_id) || {};
          const season = state.seasonMap?.get(season_id) || {};
          team.competition_details.push({
            competition_id,
            competition_name: comp.name || '',
            competition_type: comp.competition_type || '',
            season_id,
            season_label: season.label || '',
            start_year: Number(season.start_year) || null,
            end_year: Number(season.end_year) || null
          });
        }
      }
    }
    return [...byTeam.values()];
  }

  async function ensureTeamDetails() {
    if (state.teamDetails.length) return state.teamDetails;
    if (!state.teamDetailsPromise) {
      state.teamDetailsPromise = (async () => {
        // V22.3: team_details.json ronda los 14 MB y era el punto único de fallo
        // que dejaba Match Center/Rachas en blanco cuando RAW/CDN tardaban.
        // El índice local titan-season-files ya contiene Team_ID + archivo +
        // competición + temporada, suficiente para cargar el histórico real.
        await ensureFastSeasonIndex().catch(() => null);
        const fast = buildTeamDetailsFromFastIndex();
        if (fast.length) {
          state.teamDetails = fast;
          console.info('[INCA TITAN V22.3] team_details reconstruido desde índice local', { teams:fast.length });
          return state.teamDetails;
        }

        // Fallback remoto sólo si por alguna razón el pack rápido no existe.
        const payload = await fetchJSON('manifest/team_details.json', { timeout:18000 });
        state.teamDetails = payload?.teams || [];
        return state.teamDetails;
      })().catch(error => {
        state.teamDetailsPromise = null;
        throw error;
      });
    }
    return state.teamDetailsPromise;
  }


  function teamsForCompetitionSeason(compId, seasonId) {
    const group = state.filesByCompetitionSeason.get(`${Number(compId)}|${Number(seasonId)}`);
    if (!group) return [];
    return [...group.values()]
      .map(item => ({
        team_id: Number(item.team_id),
        name: item.name,
        file: item.file
      }))
      .filter(item => item.team_id && item.name)
      .sort((a,b) => String(a.name).localeCompare(String(b.name), 'es', { sensitivity:'base' }));
  }

  function teamDetail(teamId) {
    const id = Number(teamId);
    return state.teamDetails.find(team => Number(team.team_id) === id) || null;
  }

  function teamContexts(teamId, anchorSeasonId = null) {
    const team = teamDetail(teamId);
    if (!team) return [];

    let details = Array.isArray(team.competition_details) ? team.competition_details.slice() : [];
    const anchor = anchorSeasonId ? state.seasonMap.get(Number(anchorSeasonId)) : null;

    if (anchor) {
      const a = Number(anchor.start_year);
      const b = Number(anchor.end_year);
      details = details.filter(d =>
        Number(d.start_year) === a &&
        Number(d.end_year) === b
      );
    }

    const seen = new Set();
    const out = [];
    for (const d of details) {
      const compId = Number(d.competition_id);
      const seasonId = Number(d.season_id);
      if (!compId || !seasonId) continue;
      const key = `${compId}|${seasonId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        competition_id: compId,
        competition_name: d.competition_name || state.competitionMap.get(compId)?.name || `Competición ${compId}`,
        season_id: seasonId,
        season_label: d.season_label || state.seasonMap.get(seasonId)?.label || String(seasonId),
        competition_type: d.competition_type || '',
        start_year: Number(d.start_year) || null,
        end_year: Number(d.end_year) || null,
        phase: d.competition_phase || '',
        stage: d.competition_stage || ''
      });
    }

    return out.sort((a,b) => {
      const leagueA = String(a.competition_type).toUpperCase() === 'LEAGUE' ? 0 : 1;
      const leagueB = String(b.competition_type).toUpperCase() === 'LEAGUE' ? 0 : 1;
      return leagueA - leagueB ||
        String(a.competition_name).localeCompare(String(b.competition_name), 'es', { sensitivity:'base' }) ||
        String(a.season_label).localeCompare(String(b.season_label), 'es', { sensitivity:'base' });
    });
  }


  function bookingPointsInca(yellow, red, secondYellowRed = 0) {
    const y = Math.max(0, Number(yellow) || 0);
    const r = Math.max(0, Number(red) || 0);

    // REGLA INCA FINAL V50:
    // - Sin roja: cada amarilla vale 10.
    // - Con roja: todas las amarillas juntas aportan SOLO 10.
    // - Cada roja vale 20.
    // Ej.: 2 amarillas + 1 roja = 30.
    if (r > 0) return r * 20 + (y > 0 ? 10 : 0);
    return y * 10;
  }

  function secondYellowRedFor(eventId, teamId) {
    const e = String(eventId || '').trim();
    const t = String(teamId || '').trim();
    if (!e || !t) return 0;
    return Number(state.secondYellowRedMap.get(`${e}|${t}`) || 0);
  }

  async function parseCsvTextTitan(text) {
    if (window.INCA_DATA_WORKER?.available) {
      try { return await window.INCA_DATA_WORKER.parseCSV(text); } catch (_) {}
    }
    if (typeof Papa === 'undefined') return [];
    const parsed = Papa.parse(text, { header:true, skipEmptyLines:'greedy' });
    return (parsed.data || []).filter(Boolean);
  }

  async function ensureCardDetails() {
    if (state.cardsDetailPromise) return state.cardsDetailPromise;
    state.cardsDetailPromise = (async () => {
      const configured = String(cfg.titanCardsDetailedUrl || '').trim();
      const configuredPath = String(cfg.titanCardsDetailedPath || 'csv/cards_detailed.csv').trim();
      const candidates = [configured, configuredPath ? raw(configuredPath) : '', raw('cards_detailed.csv')].filter(Boolean);
      for (const url of [...new Set(candidates)]) {
        try {
          const response = await fetch(url, { cache:'default', headers:{ Accept:'text/csv,text/plain,*/*' } });
          if (!response.ok) continue;
          const rows = await parseCsvTextTitan(await response.text());
          if (!rows.length) continue;
          const map = new Map();
          for (const row of rows) {
            const eventId = String(row.event_id ?? row.Event_ID ?? '').trim();
            const teamId = String(row.team_id ?? row.Team_ID ?? '').trim();
            if (!eventId || !teamId) continue;
            const explicit = Number(row.second_yellow_red ?? row.Second_Yellow_Red ?? row.Second_Yellow_Reds ?? 0);
            const cardType = String(row.card_type ?? row.Card_Type ?? '').toUpperCase();
            const incidentClass = String(row.incident_class ?? row.Incident_Class ?? '');
            const isSecond = explicit > 0 || cardType === 'SECOND_YELLOW_RED' || incidentClass === 'yellowRed';
            if (!isSecond) continue;
            const key = `${eventId}|${teamId}`;
            map.set(key,(map.get(key)||0)+1);
          }
          state.secondYellowRedMap = map;
          state.cardsDetailAvailable = true;
          state.cardsDetailSource = url;
          console.info('[INCA BOOKING V49] cards_detailed cargado',{source:url,secondYellowRedEvents:map.size});
          return {available:true,source:url,count:map.size};
        } catch(error) {
          console.debug('[INCA BOOKING V49] sidecar no disponible',url,error?.message||error);
        }
      }
      state.cardsDetailAvailable=false;
      state.cardsDetailSource='';
      console.warn('[INCA BOOKING V49] Sin cards_detailed.csv: no se distingue exacto roja directa vs doble amarilla con sólo Yellow/Red agregados.');
      return {available:false,source:'',count:0};
    })();
    return state.cardsDetailPromise;
  }

  function annotateBookingRow(row) {
    if (!row) return row;
    const eventId = row.Event_ID ?? row.ID_Partido ?? row.event_id;
    const teamId = row.Team_ID ?? row.team_id;
    const second = secondYellowRedFor(eventId, teamId);
    return {...row,Second_Yellow_Reds:second,second_yellow_red:second};
  }

  async function loadTeamHistory(teamId) {
    await init();
    await Promise.all([ensureTeamDetails(), ensureCardDetails()]);

    const id = Number(teamId);
    if (!id) throw new Error('Team_ID inválido.');
    if (state.teamHistoryCache.has(id)) return state.teamHistoryCache.get(id);

    const team = teamDetail(id);
    if (!team?.file) throw new Error('No existe archivo histórico para este equipo.');

    const promise = (async () => {
      const rows = await parseCSVFromUrl(team.file);
      const allRows = rows
        .filter(row =>
          ['ALL','1ST','2ND'].includes(String(row.Tiempo || '').toUpperCase()) &&
          String(row.Event_ID || '').trim() &&
          Number(row.Team_ID) > 0
        )
        .map(row => {
          const compId = Number(row.Competition_ID);
          const seasonId = Number(row.Season_ID);
          return annotateBookingRow({
            ...row,
            Tiempo: String(row.Tiempo || '').toUpperCase(),
            Competition_Name: state.competitionMap.get(compId)?.name || '',
            Season_Label: state.seasonMap.get(seasonId)?.label || ''
          });
        });

      const ownRows = allRows.filter(row => Number(row.Team_ID) === id);

      return {
        team: {
          team_id: id,
          name: team.name,
          country: team.country,
          region: team.region
        },
        rows: ownRows,
        allRows,
        contexts: teamContexts(id, null)
      };
    })();

    state.teamHistoryCache.set(id, promise);
    try {
      return await promise;
    } catch (error) {
      state.teamHistoryCache.delete(id);
      throw error;
    }
  }

  function clearTeamHistoryCache() {
    state.teamHistoryCache.clear();
  }

  function filesForCompetitionSeason(compId, seasonId) {
    const group = state.filesByCompetitionSeason.get(`${compId}|${seasonId}`);
    return group ? [...group.values()] : [];
  }

  async function augmentCurrentCalendarFilesFromFixtures(compId, seasonId, files) {
    const base = Array.isArray(files) ? files : [];
    const season = state.seasonMap.get(Number(seasonId)) || {};
    if (String(season.season_status || '').toUpperCase() !== 'CURRENT') {
      return base;
    }

    try {
      await window.INCA_FIXTURES?.ensureReady?.();
      const fixtures = window.INCA_FIXTURES?.forCompetition?.(compId, {
        from: -Infinity,
        to: Infinity,
        includeEnded: true
      }) || [];

      const seasonFixtures = fixtures.filter(f =>
        !Number(f?.season_id) || Number(f.season_id) === Number(seasonId)
      );

      const ids = new Set();
      for (const f of seasonFixtures) {
        if (Number(f?.home_id)) ids.add(Number(f.home_id));
        if (Number(f?.away_id)) ids.add(Number(f.away_id));
      }

      if (!ids.size) return base;

      const merged = new Map(base.map(item => [String(item.file || ''), item]));
      for (const id of ids) {
        const team = state.teamById.get(id);
        if (!team?.file) continue;
        if (!merged.has(team.file)) {
          merged.set(team.file, {
            file: team.file,
            team_id: id,
            name: team.name || `Team ${id}`,
            roster_fallback: true
          });
        }
      }
      return [...merged.values()];
    } catch (error) {
      console.warn('[INCA TITAN] No se pudo ampliar roster de temporada calendario desde fixtures.', error);
      return base;
    }
  }

  async function currentSeasonRosterFromFixtures(compId, seasonId) {
    const season = state.seasonMap.get(Number(seasonId)) || {};
    const current = String(season.season_status || '').toUpperCase() === 'CURRENT';
    const merged = new Map();

    for (const item of teamsForCompetitionSeason(compId, seasonId)) {
      if (!item?.name) continue;
      merged.set(Number(item.team_id) || item.name, { team_id:Number(item.team_id)||0, name:String(item.name), source:'manifest' });
    }
    if (!current) return [...merged.values()].sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));

    try {
      await window.INCA_FIXTURES?.ensureReady?.();
      const fixtures = window.INCA_FIXTURES?.forCompetition?.(compId, {from:-Infinity,to:Infinity,includeEnded:true}) || [];
      const exact = fixtures.filter(f => !Number(f?.season_id) || Number(f.season_id) === Number(seasonId));
      const source = exact.length ? exact : fixtures;
      for (const f of source) {
        if (Number(f?.home_id) && f?.home) merged.set(Number(f.home_id), {team_id:Number(f.home_id),name:String(f.home),source:'fixtures'});
        if (Number(f?.away_id) && f?.away) merged.set(Number(f.away_id), {team_id:Number(f.away_id),name:String(f.away),source:'fixtures'});
      }
    } catch (error) {
      console.warn('[INCA TITAN] No se pudo completar roster CURRENT desde fixtures.', error);
    }
    return [...merged.values()].filter(x=>x.name).sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));
  }

  function enrichTablePhasesWithRoster(phases, rosterTeams) {
    const roster = Array.isArray(rosterTeams) ? rosterTeams : [];
    if (!roster.length) return Array.isArray(phases) ? phases : [];
    const fullRosterKeys = new Set(['REGULAR','APERTURA','CLAUSURA']);
    return (Array.isArray(phases)?phases:[]).map(phase => {
      const key=String(phase?.key||'').toUpperCase();
      if (!fullRosterKeys.has(key)) return phase;
      return {...phase,teamCount:roster.length,
        memberTeamIds:roster.map(t=>Number(t.team_id)||0).filter(Boolean),
        memberTeamNames:roster.map(t=>String(t.name||'')).filter(Boolean)};
    });
  }

  function currentCalendarProgressFromData(data, compId, seasonId) {
    const rows = Array.isArray(data) ? data : [];
    const season = state.seasonMap.get(Number(seasonId)) || {};
    if (String(season.season_status || '').toUpperCase() !== 'CURRENT') return null;

    const events = new Map();
    const teamNames = new Map();

    for (const row of rows) {
      if (String(row?.Tiempo || '').toUpperCase() !== 'ALL') continue;
      const eventId = String(row?.Event_ID || row?.ID_Partido || '').trim();
      const teamId = Number(row?.Team_ID || 0);
      if (!eventId || !teamId) continue;

      if (!events.has(eventId)) {
        events.set(eventId, {
          id: eventId,
          round: tableRoundNumber(row),
          date: tableDateNumber(row),
          teams: new Set()
        });
      }
      events.get(eventId).teams.add(teamId);
      const name = String(row?.Original_Team_Name || row?.Equipo || '').trim();
      if (name) teamNames.set(teamId, name);
    }

    const teamPj = new Map();
    const rounds = new Map();
    for (const ev of events.values()) {
      for (const id of ev.teams) teamPj.set(id, (teamPj.get(id) || 0) + 1);
      if (Number.isFinite(ev.round)) {
        if (!rounds.has(ev.round)) rounds.set(ev.round, new Set());
        rounds.get(ev.round).add(ev.id);
      }
    }

    const pjValues = [...teamPj.values()].sort((a,b)=>a-b);
    const maxPj = pjValues.length ? Math.max(...pjValues) : 0;
    const minPj = pjValues.length ? Math.min(...pjValues) : 0;
    const teamCount = teamPj.size;
    const eventCount = events.size;
    const maxRound = rounds.size ? Math.max(...rounds.keys()) : 0;
    const expectedPerRound = teamCount >= 2 ? teamCount / 2 : 0;
    const equivalentRounds = expectedPerRound ? eventCount / expectedPerRound : 0;

    const missingRounds = [];
    if (maxRound > 1) {
      for (let r = 1; r <= maxRound; r++) if (!rounds.has(r)) missingRounds.push(r);
    }

    const behindTeams = [...teamPj.entries()]
      .filter(([,pj]) => pj < maxPj)
      .map(([id,pj]) => ({ team_id:id, name:teamNames.get(id) || `Team ${id}`, pj }))
      .sort((a,b)=>a.pj-b.pj || a.name.localeCompare(b.name,'es'));

    return {
      competition_id:Number(compId),
      season_id:Number(seasonId),
      teamCount,
      eventCount,
      maxPj,
      minPj,
      equivalentRounds,
      maxRound,
      missingRounds,
      behindTeams,
      roundCounts:Object.fromEntries([...rounds.entries()].map(([round, set]) => [round, set.size]))
    };
  }

  async function enrichCurrentCalendarProgress(progress, compId, seasonId) {
    if (!progress) return null;
    try {
      await window.INCA_FIXTURES?.ensureReady?.();
      const fixtures = window.INCA_FIXTURES?.forCompetition?.(compId, {
        from: -Infinity,
        to: Infinity,
        includeEnded: true
      }) || [];
      const sameSeason = fixtures.filter(f =>
        (!Number(f?.season_id) || Number(f.season_id) === Number(seasonId)) &&
        Number.isFinite(Number(f?.round))
      );

      const futureRoundCounts = new Map();
      for (const f of sameSeason) {
        const round = Number(f.round);
        futureRoundCounts.set(round, (futureRoundCounts.get(round) || 0) + 1);
      }

      const threshold = Math.max(2, Math.ceil((progress.teamCount / 2) * 0.5));
      const standardFutureRounds = [...futureRoundCounts.entries()]
        .filter(([,count]) => count >= threshold)
        .map(([round]) => round)
        .sort((a,b)=>a-b);

      const nextFullRound = standardFutureRounds.find(r => r > Number(progress.maxRound || 0))
        || standardFutureRounds[0]
        || null;

      const pendingPastRounds = [...futureRoundCounts.keys()]
        .filter(r => r <= Number(progress.maxRound || 0))
        .sort((a,b)=>a-b);

      return {
        ...progress,
        nextFullRound,
        pendingPastRounds,
        futureRoundCounts:Object.fromEntries([...futureRoundCounts.entries()])
      };
    } catch (_) {
      return progress;
    }
  }

  async function parseCSVFromUrl(path, filters = null) {
    // V1.016 DATA PRO: cada CSV de equipo contiene varias temporadas.
    // Para Data Histórica no devolvemos miles de filas inútiles al hilo principal:
    // el Worker filtra Competition_ID + Season_ID antes de clonar el resultado.
    const bases = [raw(path), cdn(path)];
    let lastError = null;

    for (let sourceIndex = 0; sourceIndex < bases.length; sourceIndex++) {
      const baseUrl = bases[sourceIndex];
      const controller = new AbortController();
      const timeoutMs = sourceIndex === 0 ? 7500 : 9000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const url = withSession(baseUrl);
        const response = await fetch(url, {
          cache: 'no-store',
          headers: { Accept: 'text/csv,text/plain,*/*' },
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`TITAN ${path}: HTTP ${response.status} @ ${new URL(url).hostname}`);
        const text = await response.text();

        if (window.INCA_DATA_WORKER?.available) {
          try {
            if (filters && window.INCA_DATA_WORKER.parseCSVFiltered) {
              return await window.INCA_DATA_WORKER.parseCSVFiltered(text, {
                competitionId: filters.competitionId,
                seasonId: filters.seasonId,
                times: ['ALL','1ST','2ND']
              });
            }
            return await window.INCA_DATA_WORKER.parseCSV(text);
          } catch (workerError) {
            console.warn('[INCA TITAN V1.016] Worker CSV fallback', path, workerError?.message || workerError);
          }
        }

        if (typeof Papa === 'undefined') throw new Error('Papa Parse no está disponible.');
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: 'greedy' });
        let rows = (parsed.data || []).filter(row => row && Object.values(row).some(v => String(v ?? '').trim() !== ''));
        if (filters) {
          const comp = Number(filters.competitionId || 0);
          const season = Number(filters.seasonId || 0);
          rows = rows.filter(row =>
            (!comp || Number(row.Competition_ID) === comp) &&
            (!season || Number(row.Season_ID) === season) &&
            ['ALL','1ST','2ND'].includes(String(row.Tiempo || '').trim().toUpperCase())
          );
        }
        return rows;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error(`TITAN ${path}: no disponible`);
  }

  function datasetConcurrency() {
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
    const type = String(navigator.connection?.effectiveType || '').toLowerCase();
    if (coarse || /2g/.test(type)) return 2;
    if (/3g/.test(type)) return 3;
    return 4;
  }

  async function mapLimit(items, limit, task) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) break;
        results[index] = await task(items[index], index);
      }
    });
    await Promise.all(workers);
    return results;
  }

  function condKey(value) {
    const v = String(value || '').trim().toUpperCase();
    if (v === 'LOCAL' || v === 'HOME') return 'Local';
    if (v === 'VISITA' || v === 'AWAY' || v === 'VISITANTE') return 'Visita';
    return '';
  }

  function transformRows(rows, compId, seasonId) {
    const dedupe = new Map();

    for (const row of rows.flat()) {
      if (!row) continue;
      if (Number(row.Competition_ID) !== compId || Number(row.Season_ID) !== seasonId) continue;
      const eventId = String(row.Event_ID || '').trim();
      const teamId = String(row.Team_ID || '').trim();
      const time = String(row.Tiempo || '').trim().toUpperCase();
      if (!eventId || !teamId || !['ALL', '1ST', '2ND'].includes(time)) continue;
      const key = `${eventId}|${teamId}|${time}`;
      if (!dedupe.has(key)) dedupe.set(key, { ...row, Tiempo: time });
    }

    const byEvent = new Map();
    for (const row of dedupe.values()) {
      const id = String(row.Event_ID);
      if (!byEvent.has(id)) byEvent.set(id, []);
      byEvent.get(id).push(row);
    }

    const output = [];
    for (const [eventId, eventRows] of byEvent) {
      const allRows = eventRows.filter(r => String(r.Tiempo).toUpperCase() === 'ALL');
      const home = allRows.find(r => condKey(r.Condicion) === 'Local') || eventRows.find(r => condKey(r.Condicion) === 'Local');
      const away = allRows.find(r => condKey(r.Condicion) === 'Visita') || eventRows.find(r => condKey(r.Condicion) === 'Visita');
      const homeName = String(home?.Equipo || '').trim();
      const awayName = String(away?.Equipo || '').trim();
      if (!homeName || !awayName) continue;

      for (const row of eventRows) {
        const cond = condKey(row.Condicion);
        if (!cond) continue;
        output.push(annotateBookingRow({
          ...row,
          Original_Team_Name: String(row.Equipo || '').trim(),
          Equipo: `${cond} - ${homeName} vs ${awayName}`,
          ID_Partido: row.Event_ID,
          Event_ID: row.Event_ID
        }));
      }
    }

    return output;
  }


  // ==========================================================================
    // Separa temporada regular, playoffs, Apertura/Clausura y splits ocultos.
  // No modifica los CSV. Añade Table_Bucket/Table_Bucket_Label a cada fila.
  // ==========================================================================

  const TABLE_SPLIT_RULES = Object.freeze({
    // Liga belga: 30 jornadas base y después grupos con numeración reiniciada.
    38:  { mode:'reset', baseRound:30, resetMax:12 },
    // Dinamarca / Austria: 22 jornadas base + grupos finales.
    39:  { mode:'reset', baseRound:22, resetMax:12 },
    45:  { mode:'reset', baseRound:22, resetMax:12 },
    // Rumanía: 30 jornadas base + championship/relegation groups.
    152: { mode:'reset', baseRound:30, resetMax:12 },
    // Grecia: 26 jornadas base + grupos finales.
    185: { mode:'reset', baseRound:26, resetMax:12 },
    // Suiza desde 23/24: 33 jornadas base + 5 jornadas de split.
    215: { mode:'continuation', baseRound:33, minStartYear:2023 }
  });

  const TABLE_PHASE_LABELS = Object.freeze({
    REGULAR: 'Temporada regular',
    APERTURA: 'Apertura',
    CLAUSURA: 'Clausura',
    APERTURA_A: 'Apertura · Grupo A',
    APERTURA_B: 'Apertura · Grupo B',
    CLAUSURA_A: 'Clausura · Grupo A',
    CLAUSURA_B: 'Clausura · Grupo B',
    PLAYOFFS: 'Playoffs',
    FINAL: 'Final / finales',
    QUALIFICATION: 'Clasificación / promoción',
    CHAMPIONSHIP_GROUP: 'Fase campeonato',
    EUROPE_GROUP: 'Fase europea / Conference',
    RELEGATION_GROUP: 'Fase descenso',
    SPLIT_GROUP: 'Fase final / split',
    EXCLUDED: 'Fuera de tabla'
  });

  const TABLE_PHASE_PRIORITY = Object.freeze({
    REGULAR: 10,
    APERTURA: 12,
    APERTURA_A: 13,
    APERTURA_B: 14,
    CLAUSURA: 15,
    CLAUSURA_A: 16,
    CLAUSURA_B: 17,
    CHAMPIONSHIP_GROUP: 20,
    EUROPE_GROUP: 21,
    RELEGATION_GROUP: 22,
    PLAYOFFS: 30,
    QUALIFICATION: 40,
    FINAL: 50,
    SPLIT_GROUP: 60
  });

  function tableText(value) {
    return String(value ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[_/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function tableValue(row, keys) {
    if (!row) return '';
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
    }
    const wanted = new Set(keys.map(k => tableText(k)));
    for (const [key, value] of Object.entries(row)) {
      if (wanted.has(tableText(key)) && value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  }

  function tableRoundNumber(row) {
    const raw = tableValue(row, [
      'Jornada','Round','Matchweek','Competition_Round','Competition Round',
      'Round_Number','Round Number','Competition_Round_Name'
    ]);
    const match = String(raw || '').match(/(\d{1,3})/);
    return match ? Number(match[1]) : null;
  }

  function tableDateNumber(row) {
    const raw = String(tableValue(row, ['Fecha','Date','Match_Date','Match Date']) || '').trim();
    if (!raw) return 0;

    let m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) {
      const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      return Number.isFinite(d.getTime()) ? d.getTime() : 0;
    }
    m = raw.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Number.isFinite(d.getTime()) ? d.getTime() : 0;
    }

    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function tableGroupCode(text) {
    const raw = tableText(text);
    if (/\b(GROUP|GRUPO|ZONE|ZONA)\s*A\b/.test(raw) || /\bA\s*(GROUP|GRUPO|ZONE|ZONA)\b/.test(raw)) return 'A';
    if (/\b(GROUP|GRUPO|ZONE|ZONA)\s*B\b/.test(raw) || /\bB\s*(GROUP|GRUPO|ZONE|ZONA)\b/.test(raw)) return 'B';
    return '';
  }

  function isNonTableStage(text) {
    const all = tableText(text);
    return (
      all.includes('PLAYOFF') || all.includes('PLAY OFF') || all.includes('PLAY-OFF') ||
      all.includes('POSTSEASON') || all.includes('POST SEASON') ||
      all.includes('ROUND OF 16') || all.includes('OCTAV') ||
      all.includes('QUARTER') || all.includes('CUART') ||
      all.includes('SEMI FINAL') || all.includes('SEMIFINAL') ||
      /\bFINAL\b/.test(all) || all.includes('FINALS') || all.includes('GRAND FINAL') ||
      all.includes('QUALIFICATION') || all.includes('QUALIFY') ||
      all.includes('PROMOTION') || all.includes('PROMOCION')
    );
  }

  function explicitTableBucket(row) {
    const format = tableText(tableValue(row, ['Season_Format','Season Format','Formato_Temporada']));
    const phase = tableText(tableValue(row, ['Competition_Phase','Competition Phase','Phase']));
    const stage = tableText(tableValue(row, ['Competition_Stage','Competition Stage','Stage']));
    const all = `${format} ${phase} ${stage}`;

    // V42: eliminatorias/finales/promoción nunca generan tabla histórica.
    if (isNonTableStage(all)) return 'EXCLUDED';

    // V1.016: los splits domésticos sí son fases analizables en Historic PRO.
    if (all.includes('RELEGATION') || all.includes('DESCENSO')) return 'RELEGATION_GROUP';
    if (
      all.includes('CHAMPIONSHIP GROUP') || all.includes('CHAMPIONSHIP ROUND') ||
      all.includes('CHAMPIONSHIP STAGE')
    ) return 'CHAMPIONSHIP_GROUP';
    if (
      all.includes('CONFERENCE GROUP') || all.includes('EUROPE GROUP') ||
      all.includes('EUROPEAN GROUP') || all.includes('EUROPA GROUP')
    ) return 'EUROPE_GROUP';

    const group = tableGroupCode(`${phase} ${stage}`);
    if (all.includes('APERTURA')) return group ? `APERTURA_${group}` : 'APERTURA';
    if (all.includes('CLAUSURA')) return group ? `CLAUSURA_${group}` : 'CLAUSURA';
    return 'REGULAR';
  }

  function normalizeTeamLabel(value) {
    return tableText(value).replace(/\bCLUB ATLETICO\b/g, '').replace(/\bCA\b/g, '').replace(/\s+/g, ' ').trim();
  }

  function inferBalancedZones(rows, tournamentKey) {
    const allRows = (rows || []).filter(row =>
      String(row?.Tiempo || '').toUpperCase() === 'ALL' &&
      String(row?.Table_Bucket || '') === tournamentKey &&
      Number(row?.Team_ID || 0)
    );

    const byEvent = new Map();
    const teamName = new Map();

    for (const row of allRows) {
      const eventId = String(row.Event_ID || '').trim();
      const teamId = Number(row.Team_ID || 0);
      if (!eventId || !teamId) continue;
      if (!byEvent.has(eventId)) byEvent.set(eventId, new Set());
      byEvent.get(eventId).add(teamId);
      if (!teamName.has(teamId)) teamName.set(teamId, String(row.Original_Team_Name || '').trim());
    }

    const teams = [...teamName.keys()];
    if (teams.length < 20 || teams.length % 2 !== 0) return null;

    const neighbors = new Map(teams.map(id => [id, new Set()]));
    for (const idsSet of byEvent.values()) {
      const ids = [...idsSet];
      if (ids.length < 2) continue;
      const [a,b] = ids;
      neighbors.get(a)?.add(b);
      neighbors.get(b)?.add(a);
    }

    const common = (a,b) => {
      const A = neighbors.get(a) || new Set();
      const B = neighbors.get(b) || new Set();
      let n = 0;
      for (const x of A) if (B.has(x)) n++;
      return n;
    };
    const sim = (a,b) => common(a,b) * 3 + (neighbors.get(a)?.has(b) ? 2 : 0);

    const seedA = teams.slice().sort((a,b) => (neighbors.get(b)?.size || 0) - (neighbors.get(a)?.size || 0) || a-b)[0];
    const seedB = teams.slice().filter(id => id !== seedA).sort((a,b) => sim(seedA,a)-sim(seedA,b) || a-b)[0];
    if (!seedA || !seedB) return null;

    const target = teams.length / 2;
    const ranked = teams.filter(id => id !== seedA && id !== seedB).sort((a,b) => sim(seedA,b)-sim(seedA,a) || a-b);
    let groupA = new Set([seedA, ...ranked.slice(0, target-1)]);
    let groupB = new Set(teams.filter(id => !groupA.has(id)));

    if (groupA.has(seedB)) {
      const movable = [...groupB].sort((a,b) => sim(seedA,b)-sim(seedA,a))[0];
      if (movable) {
        groupA.delete(seedB); groupB.add(seedB);
        groupB.delete(movable); groupA.add(movable);
      }
    }

    const scoreSet = set => {
      const arr = [...set];
      let s = 0;
      for (let i=0;i<arr.length;i++) for (let j=i+1;j<arr.length;j++) s += sim(arr[i],arr[j]);
      return s;
    };

    let guard = 0, improved = true;
    while (improved && guard++ < 80) {
      improved = false;
      const base = scoreSet(groupA) + scoreSet(groupB);
      let best = null, gainBest = 0;

      for (const a of groupA) for (const b of groupB) {
        const A = new Set(groupA), B = new Set(groupB);
        A.delete(a); A.add(b); B.delete(b); B.add(a);
        const gain = scoreSet(A) + scoreSet(B) - base;
        if (gain > gainBest) { gainBest = gain; best = [a,b]; }
      }

      if (best && gainBest > .0001) {
        const [a,b] = best;
        groupA.delete(a); groupA.add(b);
        groupB.delete(b); groupB.add(a);
        improved = true;
      }
    }

    // Only names the inferred clusters; membership comes from the match graph.
    // Boca is Zone A in the 2025/26 tournament format.
    const bocaId = teams.find(id => normalizeTeamLabel(teamName.get(id)).includes('BOCA JUNIORS'));
    if (bocaId && !groupA.has(bocaId)) {
      const tmp = groupA; groupA = groupB; groupB = tmp;
    }

    return { A:groupA, B:groupB };
  }

  function applyArgentinaZones(rows, compId) {
    if (Number(compId) !== 155) return rows;
    let annotated = rows.slice();

    for (const tournament of ['APERTURA','CLAUSURA']) {
      const explicit = annotated.some(row => row.Table_Bucket === `${tournament}_A` || row.Table_Bucket === `${tournament}_B`);
      if (explicit) continue;

      const candidates = annotated.filter(row => row.Table_Bucket === tournament);
      if (!candidates.length) continue;

      const zones = inferBalancedZones(candidates, tournament);
      if (!zones) continue;

      annotated = annotated.map(row => {
        if (row.Table_Bucket !== tournament) return row;
        const id = Number(row.Team_ID || 0);
        const zone = zones.A.has(id) ? 'A' : zones.B.has(id) ? 'B' : '';
        return zone ? { ...row, Table_Bucket:`${tournament}_${zone}` } : row;
      });
    }
    return annotated;
  }


  function eventGoal(row) {
    const value = tableValue(row, ['Goles','Goals','Score']);
    const n = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function eventCondition(row) {
    return condKey(tableValue(row, ['Condicion','Condition','Venue']));
  }

  function buildTableEvents(data) {
    const map = new Map();

    for (const row of data || []) {
      const eventId = String(row?.Event_ID || row?.ID_Partido || '').trim();
      if (!eventId) continue;

      if (!map.has(eventId)) {
        map.set(eventId, {
          id: eventId,
          rows: [],
          allRows: [],
          teamIds: new Set(),
          time: tableDateNumber(row),
          round: tableRoundNumber(row),
          baseKey: explicitTableBucket(row)
        });
      }

      const event = map.get(eventId);
      event.rows.push(row);
      const teamId = Number(row?.Team_ID || 0);
      if (teamId) event.teamIds.add(teamId);

      const tiempo = String(row?.Tiempo || '').toUpperCase();
      if (tiempo === 'ALL') event.allRows.push(row);

      const rowKey = explicitTableBucket(row);
      // Si una fila trae una fase explícita distinta de REGULAR, tiene prioridad.
      if (event.baseKey === 'REGULAR' && rowKey !== 'REGULAR') event.baseKey = rowKey;

      const t = tableDateNumber(row);
      if (t && (!event.time || t < event.time)) event.time = t;
      if (event.round === null) event.round = tableRoundNumber(row);
    }

    return [...map.values()];
  }

  function findHiddenSplitEvents(events, compId, seasonId) {
    const rawRule = TABLE_SPLIT_RULES[Number(compId)];
    if (!rawRule) return new Set();

    const season = state.seasonMap.get(Number(seasonId)) || {};
    if (rawRule.minStartYear && Number(season.start_year || 0) < rawRule.minStartYear) return new Set();

    const candidates = events
      .filter(event => event.baseKey === 'REGULAR' && Number.isFinite(event.round) && event.time > 0)
      .sort((a,b) => a.time - b.time || Number(a.id) - Number(b.id));

    if (!candidates.length) return new Set();

    const hidden = new Set();

    if (rawRule.mode === 'continuation') {
      for (const event of candidates) {
        if (Number(event.round) > Number(rawRule.baseRound)) hidden.add(event.id);
      }
      return hidden;
    }

    let maxRoundSeen = 0;
    let restartTime = 0;

    for (const event of candidates) {
      const round = Number(event.round);
      if (
        !restartTime &&
        maxRoundSeen >= Number(rawRule.baseRound) &&
        round > 0 &&
        round <= Number(rawRule.resetMax || 12)
      ) {
        restartTime = event.time;
        break;
      }
      maxRoundSeen = Math.max(maxRoundSeen, round);
    }

    if (!restartTime) return hidden;

    for (const event of candidates) {
      const round = Number(event.round);
      if (
        event.time >= restartTime &&
        round > 0 &&
        round <= Number(rawRule.resetMax || 12)
      ) hidden.add(event.id);
    }

    return hidden;
  }

  function unionFindComponents(events) {
    const parent = new Map();

    const find = x => {
      if (!parent.has(x)) parent.set(x, x);
      let p = parent.get(x);
      if (p !== x) {
        p = find(p);
        parent.set(x, p);
      }
      return p;
    };

    const union = (a,b) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(rb, ra);
    };

    for (const event of events) {
      const ids = [...event.teamIds].filter(Boolean);
      for (const id of ids) find(id);
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    }

    const groups = new Map();
    for (const id of parent.keys()) {
      const root = find(id);
      if (!groups.has(root)) groups.set(root, new Set());
      groups.get(root).add(id);
    }
    return [...groups.values()];
  }

  function regularRanks(events, hiddenIds) {
    const table = new Map();
    const rowFor = id => {
      if (!table.has(id)) table.set(id, { p:0, pts:0, gf:0, ga:0, gd:0 });
      return table.get(id);
    };

    for (const event of events) {
      if (event.baseKey !== 'REGULAR' || hiddenIds.has(event.id)) continue;
      const rows = event.allRows.length ? event.allRows : event.rows;
      const home = rows.find(r => eventCondition(r) === 'Local');
      const away = rows.find(r => eventCondition(r) === 'Visita');
      if (!home || !away) continue;

      const hId = Number(home.Team_ID || 0);
      const aId = Number(away.Team_ID || 0);
      if (!hId || !aId) continue;

      const hg = eventGoal(home);
      const ag = eventGoal(away);
      const h = rowFor(hId);
      const a = rowFor(aId);
      h.p++; a.p++;
      h.gf += hg; h.ga += ag;
      a.gf += ag; a.ga += hg;

      if (hg > ag) h.pts += 3;
      else if (hg < ag) a.pts += 3;
      else { h.pts++; a.pts++; }
    }

    for (const row of table.values()) row.gd = row.gf - row.ga;

    const ordered = [...table.entries()].sort((a,b) =>
      b[1].pts - a[1].pts ||
      b[1].gd - a[1].gd ||
      b[1].gf - a[1].gf
    );

    const ranks = new Map();
    ordered.forEach(([teamId], index) => ranks.set(teamId, index + 1));
    return ranks;
  }

  function labelHiddenSplitGroups(events, hiddenIds) {
    const hiddenEvents = events.filter(e => hiddenIds.has(e.id));
    if (!hiddenEvents.length) return new Map();

    const components = unionFindComponents(hiddenEvents);
    if (!components.length) return new Map();

    const ranks = regularRanks(events, hiddenIds);
    const scored = components.map((teams, index) => {
      const teamRanks = [...teams].map(id => ranks.get(id)).filter(Number.isFinite);
      const avgRank = teamRanks.length
        ? teamRanks.reduce((a,b) => a + b, 0) / teamRanks.length
        : 1000 + index;
      return { teams, avgRank, index };
    }).sort((a,b) => a.avgRank - b.avgRank);

    const groupKeyByTeam = new Map();

    scored.forEach((group, index) => {
      let key = 'SPLIT_GROUP';
      if (scored.length === 2) {
        key = index === 0 ? 'CHAMPIONSHIP_GROUP' : 'RELEGATION_GROUP';
      } else if (scored.length >= 3) {
        if (index === 0) key = 'CHAMPIONSHIP_GROUP';
        else if (index === scored.length - 1) key = 'RELEGATION_GROUP';
        else if (index === 1) key = 'EUROPE_GROUP';
        else key = `SPLIT_GROUP_${index + 1}`;
      }
      for (const teamId of group.teams) groupKeyByTeam.set(teamId, key);
    });

    const eventKeys = new Map();
    for (const event of hiddenEvents) {
      const keys = [...event.teamIds].map(id => groupKeyByTeam.get(id)).filter(Boolean);
      const key = keys[0] || 'SPLIT_GROUP';
      eventKeys.set(event.id, key);
    }
    return eventKeys;
  }

  function tablePhaseLabel(key) {
    if (TABLE_PHASE_LABELS[key]) return TABLE_PHASE_LABELS[key];
    if (/^SPLIT_GROUP_\d+$/.test(key)) {
      return `Fase final · Grupo ${key.split('_').pop()}`;
    }
    return String(key || 'Fase').replace(/_/g, ' ');
  }

  function tablePhaseType(key) {
    if (['PLAYOFFS','FINAL','QUALIFICATION','EXCLUDED'].includes(key)) return 'ELIMINATION';
    if (
      key === 'REGULAR' || key === 'APERTURA' || key === 'CLAUSURA' ||
      key === 'APERTURA_A' || key === 'APERTURA_B' ||
      key === 'CLAUSURA_A' || key === 'CLAUSURA_B'
    ) return 'REGULAR';
    if (
      key === 'CHAMPIONSHIP_GROUP' || key === 'EUROPE_GROUP' ||
      key === 'RELEGATION_GROUP' || key.startsWith('SPLIT_GROUP')
    ) return 'SPLIT';
    return 'OTHER';
  }

  function analyzeTablePhases(data, compId, seasonId) {
    const events = buildTableEvents(data);
    const hiddenIds = findHiddenSplitEvents(events, compId, seasonId);

    const hiddenPhaseKeys = labelHiddenSplitGroups(events, hiddenIds);
    const bucketByEvent = new Map();
    for (const event of events) {
      let key = event.baseKey || 'REGULAR';
      if (hiddenIds.has(event.id)) key = hiddenPhaseKeys.get(event.id) || 'SPLIT_GROUP';
      bucketByEvent.set(event.id, key);
    }

    let annotated = (data || []).map(row => {
      const eventId = String(row?.Event_ID || row?.ID_Partido || '').trim();
      const key = bucketByEvent.get(eventId) || explicitTableBucket(row) || 'REGULAR';
      return {
        ...row,
        Table_Bucket:key,
        Table_Bucket_Label:tablePhaseLabel(key),
        Table_Bucket_Type:tablePhaseType(key),
        Table_Eligible:key !== 'EXCLUDED'
      };
    });

    annotated = applyArgentinaZones(annotated, compId).map(row => ({
      ...row,
      Table_Bucket_Label:tablePhaseLabel(row.Table_Bucket),
      Table_Bucket_Type:tablePhaseType(row.Table_Bucket),
      Table_Eligible:row.Table_Bucket !== 'EXCLUDED'
    }));

    const allowed = new Set([
      'REGULAR','APERTURA','CLAUSURA','APERTURA_A','APERTURA_B','CLAUSURA_A','CLAUSURA_B',
      'CHAMPIONSHIP_GROUP','EUROPE_GROUP','RELEGATION_GROUP','SPLIT_GROUP'
    ]);
    const stats = new Map();

    for (const row of annotated) {
      const key = String(row.Table_Bucket || '');
      const allowedKey = allowed.has(key) || /^SPLIT_GROUP_\d+$/.test(key);
      if (!allowedKey || row.Table_Eligible === false) continue;
      if (!stats.has(key)) stats.set(key,{key,events:new Set(),teams:new Set(),teamNames:new Map(),rows:0});
      const item = stats.get(key);
      item.rows++;
      const eventId = String(row.Event_ID || row.ID_Partido || '').trim();
      if (eventId) item.events.add(eventId);
      const teamId = Number(row.Team_ID || 0);
      if (teamId) {
        item.teams.add(teamId);
        const name = String(row.Original_Team_Name || '').trim();
        if (name) item.teamNames.set(teamId,name);
      }
    }

    const phases = [...stats.values()].map(item => ({
      key:item.key,
      label:tablePhaseLabel(item.key),
      type:tablePhaseType(item.key),
      eventCount:item.events.size,
      teamCount:item.teams.size,
      rowCount:item.rows,
      priority:TABLE_PHASE_PRIORITY[item.key] ?? 100,
      memberTeamIds:[...item.teams],
      memberTeamNames:[...item.teamNames.values()]
    })).filter(item => item.eventCount > 0)
      .sort((a,b) => a.priority-b.priority || a.label.localeCompare(b.label,'es'));

    const defaultKey =
      phases.find(p => p.key === 'REGULAR')?.key ||
      phases.find(p => p.key === 'APERTURA_A')?.key ||
      phases.find(p => p.key === 'APERTURA')?.key ||
      phases[0]?.key || 'REGULAR';

    return {data:annotated,phases,defaultKey,hasMultiplePhases:phases.length>1,tableOnly:true};
  }


  function filterTablePhase(data, phaseKey) {
    const rows = Array.isArray(data) ? data : [];
    const key = String(phaseKey || '').trim();
    if (!key) return rows.filter(row => row?.Table_Eligible !== false);

    const eventIds = new Set(rows
      .filter(row => row?.Table_Eligible !== false && String(row?.Table_Bucket || '') === key)
      .map(row => String(row?.Event_ID || row?.ID_Partido || '').trim())
      .filter(Boolean));

    // Complete event is required because Argentina inter-zonal matches count in both group tables.
    return rows.filter(row => {
      if (row?.Table_Eligible === false) return false;
      const id = String(row?.Event_ID || row?.ID_Partido || '').trim();
      return eventIds.has(id);
    });
  }


  async function loadCompetitionSeason(competitionValue, seasonValue, progress = null) {
    await init();
    // El escáner ya no queda bloqueado por team_details.json (~13 MB).
    // El índice local pesa ~300 KB; team_details queda para módulos históricos.
    if (!state.fastSeasonIndexReady && !state.filesByCompetitionSeason.size) {
      await ensureFastSeasonIndex().catch(() => ensureTeamDetails());
    }
    const cardsPromise = ensureCardDetails().catch(() => ({available:false}));

    const compId = parseTitanCompetition(competitionValue);
    const seasonId = parseTitanSeason(seasonValue);
    if (!compId || !seasonId) throw new Error('Contexto TITAN inválido.');

    const revision = dataRevisionToken() || 'no-rev';
    const cacheKey = `${compId}|${seasonId}|${revision}`;
    if (state.datasetCache.has(cacheKey)) return state.datasetCache.get(cacheKey);

    const comp = state.competitionMap.get(compId);
    const season = state.seasonMap.get(seasonId);
    const rosterTeams = await currentSeasonRosterFromFixtures(compId, seasonId);
    let files = filesForCompetitionSeason(compId, seasonId);
    files = await augmentCurrentCalendarFilesFromFixtures(compId, seasonId, files);
    if (!files.length) {
      // V59: temporada actual conocida por FIXTURES pero todavía sin partidos
      // estadísticos. Se devuelve un dataset vacío válido, no un error y no se
      // reutiliza la temporada anterior.
      const empty = {
        data: [], competition: comp, season, files: 0,
        label: `${comp?.name || compId} · ${season?.label || seasonId}`,
        rosterTeams,
        tablePhases: [{ key:'REGULAR', label:'Temporada regular', type:'REGULAR', teamCount:rosterTeams.length, eventCount:0, memberTeamIds:rosterTeams.map(t=>Number(t.team_id)||0).filter(Boolean), memberTeamNames:rosterTeams.map(t=>String(t.name||'')).filter(Boolean) }],
        defaultTablePhase:'REGULAR', hasMultipleTablePhases:false,
        empty:true, emptyReason:'CURRENT_SEASON_WITHOUT_STATS'
      };
      state.datasetCache.set(cacheKey, Promise.resolve(empty));
      return empty;
    }

    let completed = 0;
    const promise = (async () => {
      const parts = await mapLimit(files, datasetConcurrency(), async item => {
        try {
          const rows = await parseCSVFromUrl(item.file, { competitionId: compId, seasonId });
          completed += 1;
          progress?.({ completed, total: files.length, team: item.name });
          return rows;
        } catch (error) {
          completed += 1;
          progress?.({ completed, total: files.length, team: item.name, error: error.message });
          console.warn('[INCA TITAN] Archivo omitido', item.file, error);
          return [];
        }
      });

      await cardsPromise;
      const transformed = transformRows(parts, compId, seasonId);
      if (!transformed.length) {
        return {
          data: [], competition: comp, season, files: files.length,
          label: `${comp?.name || compId} · ${season?.label || seasonId}`,
          rosterTeams,
          tablePhases: [{ key:'REGULAR', label:'Temporada regular', type:'REGULAR', teamCount:rosterTeams.length, eventCount:0, memberTeamIds:rosterTeams.map(t=>Number(t.team_id)||0).filter(Boolean), memberTeamNames:rosterTeams.map(t=>String(t.name||'')).filter(Boolean) }],
          defaultTablePhase:'REGULAR', hasMultipleTablePhases:false,
          empty:true, emptyReason:'CURRENT_SEASON_WITHOUT_STATS'
        };
      }

      const tablePhaseAnalysis = analyzeTablePhases(transformed, compId, seasonId);
      tablePhaseAnalysis.phases = enrichTablePhasesWithRoster(tablePhaseAnalysis.phases, rosterTeams);
      let seasonProgress = await enrichCurrentCalendarProgress(
        currentCalendarProgressFromData(tablePhaseAnalysis.data, compId, seasonId),
        compId,
        seasonId
      );
      if (seasonProgress && rosterTeams.length) {
        const played = new Set((tablePhaseAnalysis.data||[]).filter(r=>String(r?.Tiempo||'').toUpperCase()==='ALL').map(r=>Number(r?.Team_ID)||0).filter(Boolean));
        const missing = rosterTeams.filter(t=>Number(t.team_id)&&!played.has(Number(t.team_id)));
        seasonProgress={...seasonProgress,teamCount:rosterTeams.length,minPj:missing.length?0:seasonProgress.minPj,rosterMissingTeams:missing.map(t=>({team_id:t.team_id,name:t.name,pj:0}))};
      }

      return {
        data: tablePhaseAnalysis.data,
        competition: comp,
        season,
        rosterTeams,
        files: files.length,
        label: `${comp?.name || compId} · ${season?.label || seasonId}`,
        seasonProgress,
        tablePhases: tablePhaseAnalysis.phases,
        defaultTablePhase: tablePhaseAnalysis.defaultKey,
        hasMultipleTablePhases: tablePhaseAnalysis.hasMultiplePhases
      };
    })();

    state.datasetCache.set(cacheKey, promise);
    try {
      return await promise;
    } catch (error) {
      state.datasetCache.delete(cacheKey);
      throw error;
    }
  }

  function updateSeasonSelector(modulo = 'escaner') {
    const leagueId = modulo === 'pro' ? 'selectLigaPro' : 'selectLiga';
    const seasonId = modulo === 'pro' ? 'selectTemporadaPro' : 'selectTemporada';
    const league = document.getElementById(leagueId);
    const season = document.getElementById(seasonId);
    if (!league || !season || !parseTitanCompetition(league.value)) return false;
    const previous = season.value;
    populateSeasonSelect(season, league.value, previous);
    return true;
  }

  function legacyPlayerContext(competitionValue, seasonValue) {
    const compId = parseTitanCompetition(competitionValue);
    const seasonId = parseTitanSeason(seasonValue);
    if (!compId || !seasonId) return null;
    const league = LEGACY_PLAYER_COMPETITIONS[compId];
    const season = state.seasonMap.get(seasonId);
    if (!league || !season) return null;
    return { liga: league, temporada: seasonLegacyKey(season) };
  }

  window.INCA_TITAN = Object.freeze({
    CURATED_COMPETITIONS,
    enabled: true,
    rawBase: RAW_BASE,
    releaseUrl: RELEASE_URL,
    logoRootBase: LOGO_ROOT_BASE,
    logoRawBase: LOGO_RAW_BASE,
    fastTeamLogoBase: FAST_TEAM_LOGO_BASE,
    competitionLogoRawBase: COMPETITION_LOGO_RAW_BASE,
    fastCompetitionLogoBase: FAST_COMPETITION_LOGO_BASE,
    competitionLogoUrl,
    competitionLogoCandidates,
    ensureLogoIndex,
    logoUrl: teamLogoUrl,
    resolveLogoUrl,
    preloadLogo: preloadTeamLogo,
    init,
    ensureReady: init,
    ensureTeamDetails,
    updateSeasonSelector,
    teamsForCompetitionSeason,
    teamContexts,
    loadTeamHistory,
    clearTeamHistoryCache,
    loadCompetitionSeason,
    analyzeTablePhases,
    filterTablePhase,
    isTitanLeague: value => Boolean(parseTitanCompetition(value)),
    isTitanSeason: value => Boolean(parseTitanSeason(value)),
    competitionId: parseTitanCompetition,
    seasonId: parseTitanSeason,
    ensureCardDetails,
    ensureFastSeasonIndex,
    secondYellowRedFor,
    bookingPointsInca,
    cardsDetailStatus: () => ({available:state.cardsDetailAvailable,source:state.cardsDetailSource,count:state.secondYellowRedMap.size}),
    mergeCurrentSeasonsFromFixtures,
    currentSeasonForCompetition,
    isCalendarCompetition,
    seasonCycleForCompetition,
    dataRevisionToken,
    seasonsForCompetition: value => {
      const id = parseTitanCompetition(value) || Number(value) || 0;
      return allSeasonsForCompetition(id).map(season => ({ ...season }));
    },
    legacyPlayerContext,
    getCatalog: () => ({
      global: state.global,
      teams: state.teams.slice(),
      competitions: state.competitions.slice(),
      seasons: state.seasons.slice()
    })
  });

  window.addEventListener('inca:fixtures-ready', () => {
    if (!state.initPromise) return;
    void mergeCurrentSeasonsFromFixtures({ refreshSelectors:true }).catch(() => {});
  });

    // Una vez Supabase autoriza la sesión, arrancamos el catálogo y selectores.
  let authBooted = false;
  const bootTitanFast = () => {
    if (authBooted) return;
    authBooted = true;
    try { primeSelectors(); } catch (_) {}
    const kick = () => init().catch(() => {});
    if ('requestIdleCallback' in window) requestIdleCallback(kick, { timeout: 900 });
    else setTimeout(kick, 0);
  };

  window.addEventListener('inca:auth-ready', bootTitanFast, { once: true });
  if (document.documentElement.classList.contains('inca-authenticated')) bootTitanFast();

})();
