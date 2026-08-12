(async function INCASTATS_EXTRACTOR_TITAN_V30_MEGA() {
    'use strict';
    const VERSION = '1.0.0_TITAN_ALONSINHO_PRO', APP_ID = 'incaExtractorMetricasV31', API = '/api/v1';
    const DB_NAME = 'incastats_extractor_pro_v10', DB_VERSION = 1; 
    const SEL_KEY = 'incastats_v10_selection', CP_KEY = 'incastats_v10_checkpoint', SET_KEY = 'incastats_v10_settings';

    console.log("%c🚀 INYECTANDO V31 TITAN BY ALONSINHO [SOFASCORE METADATA HARDENED | 2021-2026]...", "color:#00ffaa; font-weight:bold; background:#000; padding:4px;");

    document.querySelectorAll('*').forEach(el => {
        if (el.id && (el.id.includes('incaExtractorMetricas') || el.id.startsWith('v29_') || el.id.startsWith('v28_') || el.id === APP_ID)) el.remove();
    });

    window.LLAVE_MAESTRA = null;
    const fetchOriginal = window.fetch;
    window.fetch = async function (...args) {
        let config = args[1];
        if (config && config.headers) {
            let h = new Headers(config.headers);
            let llaveRobada = h.get('x-requested-with') || (config.headers && config.headers['x-requested-with']);
            if (llaveRobada && llaveRobada.length === 6 && llaveRobada !== window.LLAVE_MAESTRA) {
                window.LLAVE_MAESTRA = llaveRobada;
                console.log(`🔑 Llave Dinámica Capturada: ${window.LLAVE_MAESTRA}`);
            }
        }
        return fetchOriginal.apply(this, args);
    };

    const METRICS = ['Goals', 'Ball possession', 'Expected goals', 'Big chances', 'Total shots', 'Goalkeeper saves', 'Corner kicks', 'Fouls', 'Passes', 'Tackles', 'Free kicks', 'Yellow cards', 'Red cards', 'Shots on target', 'Hit woodwork', 'Shots off target', 'Blocked shots', 'Shots inside box', 'Shots outside box', 'Big chances scored', 'Big chances missed', 'Through balls', 'Touches in penalty area', 'Fouled in final third', 'Offsides', 'Accurate passes', 'Throw-ins', 'Final third entries', 'Final third phase', 'Long balls', 'Crosses', 'Duels', 'Dispossessed', 'Ground duels', 'Aerial duels', 'Dribbles', 'Tackles won', 'Total tackles', 'Interceptions', 'Recoveries', 'Clearances', 'Errors lead to a shot', 'Total saves', 'Goals prevented', 'Big saves', 'High claims', 'Punches', 'Goal kicks'];
    const PORTAL_COLUMNS = ['Event_ID', 'Competition_ID', 'Season_ID', 'Season_Format', 'Competition_Phase', 'Competition_Stage', 'Competition_Type', 'Team_ID', 'Equipo', 'Condicion', 'Tiempo', 'Fecha', 'Jornada', ...METRICS];

    const SPEEDS = {
        fast: { label: 'RÁPIDO', workers: 5, min: 20, max: 80, desc: '5 hilos. Seguro.' },
        turbo: { label: 'TURBO', workers: 10, min: 0, max: 10, desc: '10 hilos en paralelo.' },
        max: { label: 'OBLITERACIÓN', workers: 15, min: 0, max: 0, desc: '15 hilos. Muy Agresivo.' }
    };

    const DEFAULT = { startYear: 2021, endYear: 2026, batchSize: 100, speed: 'max', maxHistoryPages: 160, maxRetries: 3, startTeam: 1, format: 'ALL' };

    const sleep = ms => new Promise(r => setTimeout(r, ms)), rand = (a, b) => a >= b ? a : Math.floor(Math.random() * (b - a + 1)) + a, nowIso = () => new Date().toISOString();
    const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    
    const safe = v => String(v ?? 'team').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9._-]+/gi, '_').slice(0, 90) || 'team';

    function csvCell(v) { if (v === null || v === undefined || v === '') return ''; const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
    const csvLine = a => a.map(csvCell).join(',');
    function num(v) { if (typeof v === 'number' && Number.isFinite(v)) return v; if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v); return null; }
    function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }

    // 🔥 FIX 2: STATUS REAL Y ESTRICTO (PRIORIDAD SOFASCORE Y ENDTIME)
    function getSeasonStatus(sFormat, sYear, eYear, sofaSeason) {
        const rawStatus = norm(sofaSeason?.status ?? sofaSeason?.state ?? '');
        if (/\b(active|current|ongoing|inprogress|in progress)\b/.test(rawStatus)) return 'CURRENT';
        if (/\b(closed|finished|ended|complete|completed)\b/.test(rawStatus)) return 'FINISHED';

        const nowMs = Date.now();
        const toMs = v => {
            const n = Number(v);
            if (!Number.isFinite(n) || n <= 0) return null;
            return n > 1e12 ? n : n * 1000;
        };
        const startMs = toMs(sofaSeason?.startTime ?? sofaSeason?.startTimestamp);
        const endMs = toMs(sofaSeason?.endTime ?? sofaSeason?.endTimestamp);

        if (startMs && startMs > nowMs) return 'UPCOMING';
        if (endMs && nowMs > endMs) return 'FINISHED';

        // Solo inferencias temporales seguras. "Año actual" ya NO significa CURRENT.
        const y = new Date().getFullYear();
        if (eYear && eYear < y) return 'FINISHED';
        if (sYear && sYear > y) return 'UPCOMING';

        return 'UNKNOWN';
    }

    function extractSofaScoreMetadata(e) {
        const t = e.tournament || {};
        const ut = t.uniqueTournament || {};
        const s = e.season || {};
        const r = e.roundInfo || {};
        const c = t.category || {};

        const uniqueNameOriginal = ut.name || '';
        const tournamentNameOriginal = t.name || '';
        const seasonNameOriginal = s.name || s.year || '';
        const roundNameOriginal = r.name || '';

        const compName = norm(uniqueNameOriginal || tournamentNameOriginal);
        const tournamentName = norm(tournamentNameOriginal);
        const seasonName = norm(seasonNameOriginal);
        const catName = norm(c.name || '');

        // FUENTE COMPLETA DE FASE: aquí estaba el fallo fuerte de V30.
        // Antes se priorizaba uniqueTournament.name ("MLS") y se podía perder
        // tournament.name/slug donde SofaScore distingue playoffs.
        const phaseSource = norm([
            uniqueNameOriginal,
            ut.slug,
            tournamentNameOriginal,
            t.slug,
            seasonNameOriginal,
            roundNameOriginal,
            r.slug,
            r.description,
            r.shortName
        ].filter(Boolean).join(' | '));

        const roundType = r.cupRoundType;
        const roundNum = r.round;

        let sYear = null, eYear = null;
        const yearMatch = String(seasonNameOriginal).match(/((?:19|20)\d{2})(?:\/(\d{2,4}))?|(\d{2})\/(\d{2})/);
        if (yearMatch) {
            if (yearMatch[1]) {
                sYear = parseInt(yearMatch[1]);
                if (yearMatch[2]) {
                    let b = yearMatch[2].length === 2
                        ? Math.floor(sYear / 100) * 100 + parseInt(yearMatch[2])
                        : parseInt(yearMatch[2]);
                    if (b < sYear) b += 100;
                    eYear = b;
                } else {
                    eYear = sYear;
                }
            } else if (yearMatch[3]) {
                sYear = (parseInt(yearMatch[3]) >= 70 ? 1900 : 2000) + parseInt(yearMatch[3]);
                let b = Math.floor(sYear / 100) * 100 + parseInt(yearMatch[4]);
                if (b < sYear) b += 100;
                eYear = b;
            }
        }

        if (!sYear) {
            const singleYear = String(seasonNameOriginal).match(/\b(20\d{2})\b/);
            if (singleYear) {
                sYear = parseInt(singleYear[1]);
                eYear = sYear;
            } else if (e.startTimestamp) {
                sYear = new Date(e.startTimestamp * 1000).getFullYear();
                eYear = sYear;
            } else {
                sYear = 0;
                eYear = 0;
            }
        }

        const compSource = norm([uniqueNameOriginal, tournamentNameOriginal, seasonNameOriginal].join(' '));
        let compType = 'LEAGUE';

        if (/\b(super ?cup|recopa|trophy|trofeo|schaal|shield|community shield|supercopa|supercoppa)\b/.test(compSource)) {
            compType = 'SUPER_CUP';
        } else if (/\b(cup|copa|pokal|coupe|taca|taça|coppa)\b/.test(compSource)) {
            compType = 'CUP';
        }

        if (
            catName.includes('international') ||
            /\b(champions league|libertadores|sudamericana|europa league|conference league)\b/.test(compSource)
        ) {
            compType = 'INTERNATIONAL';
        }

        let sFormat = 'NORMAL';
        if (compType === 'SUPER_CUP') {
            sFormat = 'SPECIAL_EVENT';
        } else if (seasonName.includes('apertura') || tournamentName.includes('apertura') || compName.includes('apertura')) {
            sFormat = 'APERTURA';
        } else if (seasonName.includes('clausura') || tournamentName.includes('clausura') || compName.includes('clausura')) {
            sFormat = 'CLAUSURA';
        } else if (seasonName.includes('split')) {
            sFormat = 'SPLIT';
        } else if (sYear && eYear && eYear === sYear + 1) {
            sFormat = 'NORMAL';
        } else if (sYear && eYear && sYear !== eYear) {
            sFormat = 'SPLIT';
        } else if (sYear) {
            sFormat = 'CALENDAR';
        }

        const seasonStatus = getSeasonStatus(sFormat, sYear, eYear, s);

        let cPhase = 'REGULAR';
        let cStage = roundNameOriginal || (roundNum ? `Round ${roundNum}` : 'Regular Season');

        const groupText = /\b(group|groups|grupo|grupos)\b/.test(phaseSource);
        const playoffText = /\b(playoff|playoffs|postseason|knockout|wild card|round one|round 1|first round|conference semifinal|conference semi-final|conference final|quarterfinal|quarter-final|semifinal|semi-final|best of 3|best-of-3)\b/.test(phaseSource);
        const finalText =
            /\b(grand final|championship final|mls cup final|cup final)\b/.test(phaseSource) ||
            (/\bfinal\b/.test(phaseSource) &&
             !/\b(semifinal|semi-final|quarterfinal|quarter-final|conference final)\b/.test(phaseSource));

        const isMLS =
            Number(ut.id) === 242 ||
            /\bmajor league soccer\b/.test(phaseSource) ||
            /(^|[^a-z])mls([^a-z]|$)/.test(phaseSource);

        if (/\b(tabla anual|promedio|promedios|aggregate)\b/.test(phaseSource)) {
            cPhase = 'TABLE';
            cStage = roundNameOriginal || tournamentNameOriginal || 'Aggregate';
        } else if (groupText) {
            cPhase = 'GROUP';
            cStage = roundNameOriginal || tournamentNameOriginal ||
                (roundNum ? `Group Round ${roundNum}` : 'Group Stage');
        } else if (isMLS) {
            // MLS: texto real de SofaScore primero.
            // cupRoundType solo apoya si YA existe evidencia de playoffs.
            if (finalText || (playoffText && Number(roundType) === 1)) {
                cPhase = 'FINAL';
                cStage = roundNameOriginal ||
                    (tournamentNameOriginal && tournamentNameOriginal !== uniqueNameOriginal
                        ? tournamentNameOriginal
                        : 'MLS Cup Final');
            } else if (playoffText || /\bmls cup playoffs?\b/.test(phaseSource)) {
                cPhase = 'PLAYOFF';
                cStage = roundNameOriginal ||
                    (tournamentNameOriginal && tournamentNameOriginal !== uniqueNameOriginal
                        ? tournamentNameOriginal
                        : 'MLS Cup Playoffs');
            } else {
                cPhase = 'REGULAR_SEASON';
                cStage = roundNameOriginal || 'Regular Season';
            }
        } else if (finalText) {
            cPhase = 'FINAL';
            cStage = roundNameOriginal || tournamentNameOriginal || 'Final';
        } else if (playoffText) {
            cPhase = 'PLAYOFF';
            cStage = roundNameOriginal || tournamentNameOriginal || 'Playoff';
        }

        return {
            competition_id: ut.id || t.id || 'UNKNOWN_COMP',
            competition_name: uniqueNameOriginal || tournamentNameOriginal || 'Unknown Comp',
            tournament_name_original: tournamentNameOriginal || null,
            season_id: s.id || 'UNKNOWN_SEASON',
            season_label_original: seasonNameOriginal || 'Unknown Season',
            start_year: sYear,
            end_year: eYear,
            season_status: seasonStatus,
            competition_type: compType.toUpperCase(),
            season_format: sFormat.toUpperCase(),
            competition_phase: cPhase.toUpperCase(),
            competition_stage: cStage
        };
    }

    function isFriendly(e, meta) {
        const s = norm([meta.competition_name, e?.tournament?.name].filter(Boolean).join(' '));
        return /\bfriendly\b|\bfriendlies\b|amistoso|amistosos|pre[ -]?season/.test(s);
    }

    function dmy(ts) { if (!ts) return ''; const d = new Date(ts * 1000); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }
    function scoreFor(e, side, p) { const s = side === 'home' ? e.homeScore : e.awayScore; if (!s) return null; if (p === 'ALL') return s.display ?? s.current ?? s.normaltime ?? null; if (p === '1ST') return s.period1 ?? null; if (p === '2ND') return s.period2 ?? null; return null; }

    const R = { selection: null, checkpoint: null, db: null, running: false, paused: false, stop: false, current: null, requestCount: 0 };
    
    function dataPolicy() { 
        return { 
            start_year: Math.max(1900, Number($('v30_Start').value) || DEFAULT.startYear), 
            end_year: Math.max(1900, Number($('v30_End').value) || DEFAULT.endYear), 
            season_format: $('v30_Format').value || 'ALL',
            exclude_friendlies: true 
        }; 
    }
    
    function fp(sel, pol = dataPolicy()) { 
        const ids = sel.teams.map(t => Number(t.id)).sort((a, b) => a - b); 
        return `v30.0-${fnv(JSON.stringify({ ids, start_year: pol.start_year, end_year: pol.end_year, fmt: pol.season_format }))}-${ids.length}`; 
    }
    
    function newCheckpoint(sel, pol = dataPolicy()) { 
        return { schema_version: 'incastats.checkpoint.v30.0', provider: 'sofascore', extractor_version: VERSION, created_at: nowIso(), updated_at: nowIso(), selection_fingerprint: fp(sel, pol), selected_team_count: sel.teams.length, data_policy: pol, exported_confirmed: [], failed_teams: [], batches_exported: [] }; 
    }
    
    function migrateCp(cp, expectedFingerprint) {
        if(!cp) return null;
        if(!cp.exported_confirmed) cp.exported_confirmed = cp.completed_team_ids || [];
        if(!cp.failed_teams) cp.failed_teams = [];
        if(!cp.batches_exported) cp.batches_exported = [];
        cp.schema_version = 'incastats.checkpoint.v30.0';
        cp.extractor_version = VERSION;
        if (expectedFingerprint) cp.selection_fingerprint = expectedFingerprint;
        return cp;
    }

    function saved() { try { return JSON.parse(localStorage.getItem(SET_KEY) || '{}') } catch { return {} } }
    function persist() { 
        try { 
            if (R.selection) localStorage.setItem(SEL_KEY, JSON.stringify(R.selection)); 
            if (R.checkpoint) { R.checkpoint.updated_at = nowIso(); localStorage.setItem(CP_KEY, JSON.stringify(R.checkpoint)); } 
            localStorage.setItem(SET_KEY, JSON.stringify({ 
                startYear: Number($('v30_Start')?.value) || 2021, 
                endYear: Number($('v30_End')?.value) || 2026, 
                batch: Number($('v30_Batch')?.value) || 100, 
                speed: $('v30_Speed')?.value || 'max', 
                startTeam: Number($('v30_StartTeam')?.value) || 1,
                format: $('v30_Format')?.value || 'ALL'
            })); 
        } catch { } 
    }

    function openDB() { return new Promise((res, rej) => { const q = indexedDB.open(DB_NAME, DB_VERSION); q.onupgradeneeded = () => { const d = q.result; if (!d.objectStoreNames.contains('teams')) d.createObjectStore('teams', { keyPath: 'team_id' }); }; q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
    async function putTeam(x) { const d = R.db || await openDB(); R.db = d; return new Promise((res, rej) => { const t = d.transaction('teams', 'readwrite'), q = t.objectStore('teams').put(x); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }); }
    async function allTeams() { const d = R.db || await openDB(); R.db = d; return new Promise((res, rej) => { const q = d.transaction('teams', 'readonly').objectStore('teams').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); }); }
    async function deleteTeams(ids) { const d = R.db || await openDB(); R.db = d; return new Promise((res, rej) => { const t = d.transaction('teams', 'readwrite'), s = t.objectStore('teams'); for (const id of ids) s.delete(Number(id)); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
    async function clearDB() { const d = R.db || await openDB(); R.db = d; return new Promise((res, rej) => { const t = d.transaction('teams', 'readwrite'); t.objectStore('teams').clear(); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }

    const st = saved();
    const panel = document.createElement('div'); panel.id = APP_ID;
    panel.style.cssText = 'position:fixed;z-index:2147483647;top:10px;left:10px;width:520px;max-height:95vh;overflow:auto;background:#050b14;color:#e2f1f8;border:2px solid #00ffaa;border-radius:12px;padding:15px;font:12px/1.42 Consolas,monospace;box-shadow:0 12px 40px rgba(0,255,170,0.3)';
    panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e3b4a;padding-bottom:10px;margin-bottom:10px;">
        <div><b style="font-size:18px;color:#00ffaa;">TITAN ALONSINHO V1 PRO - SOFASCORE ELITE ENGINE</b><div style="font-size:10px;color:#7dd7ff;">FINAL CLEANUP | NO MICROERRORS</div></div>
        <button id="v30_Close" style="background:#e50914;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-weight:bold;cursor:pointer;">X</button>
    </div>

    <div style="background:#0b1821;padding:10px;border:1px solid #1e3b4a;border-radius:8px;margin-bottom:10px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <label style="background:#1e293b;padding:10px;text-align:center;border-radius:6px;cursor:pointer;border:1px dashed #38bdf8;color:#38bdf8;font-weight:bold;">📁 SUBIR CONFIG<input id="v30_Config" type="file" accept=".json" style="display:none"></label>
            <label style="background:#1e293b;padding:10px;text-align:center;border-radius:6px;cursor:pointer;border:1px dashed #fbbf24;color:#fbbf24;font-weight:bold;">🔄 SUBIR CHECKPOINT<input id="v30_CpFile" type="file" accept=".json" style="display:none"></label>
        </div>
        <div id="v30_Sel" style="margin-top:8px;color:#94a3b8;font-size:11px;">Esperando archivo...</div>
    </div>

    <div style="background:#0b1821;padding:10px;border:1px solid #1e3b4a;border-radius:8px;margin-bottom:10px;">
        <b style="color:#fbbf24; font-size:11px; display:block; margin-bottom:4px;">📅 Rango de Años</b>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
            <label style="color:#aaa;">Desde año:<input id="v30_Start" type="number" value="${st.startYear || 2021}" style="width:100%;box-sizing:border-box;background:#020617;color:#00ffaa;border:1px solid #334155;padding:6px;border-radius:6px;font-weight:bold;text-align:center;"></label>
            <label style="color:#aaa;">Hasta año:<input id="v30_End" type="number" value="${st.endYear || 2026}" style="width:100%;box-sizing:border-box;background:#020617;color:#f43f5e;border:1px solid #334155;padding:6px;border-radius:6px;font-weight:bold;text-align:center;"></label>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1.5fr 1fr;gap:8px; border-top:1px solid #1e3b4a; padding-top:8px;">
            <label style="color:#ffaa00;"><b>Empezar en:</b><input id="v30_StartTeam" type="number" value="${st.startTeam || 1}" min="1" style="width:100%;box-sizing:border-box;background:#020617;color:#ffaa00;border:1px solid #b45309;padding:8px;border-radius:6px;font-weight:bold;text-align:center;"></label>
            <label style="color:#aaa;">Región / Formato:<select id="v30_Format" style="width:100%;box-sizing:border-box;background:#020617;color:#38bdf8;border:1px solid #334155;padding:8px;border-radius:6px;font-weight:bold;text-align:center;">
                    <option value="ALL">🌎 Todos los Formatos</option>
                    <option value="CALENDAR">📅 Sudamérica (Ene-Dic)</option>
                    <option value="CROSS">⚔️ Europa (Ago-May)</option>
                </select>
            </label>
            <label style="color:#aaa;">Lote ZIP:<input id="v30_Batch" type="number" value="${st.batch || 100}" min="1" max="500" style="width:100%;box-sizing:border-box;background:#020617;color:#fff;border:1px solid #334155;padding:8px;border-radius:6px;font-weight:bold;text-align:center;"></label>
        </div>
        
        <div style="display:flex;gap:8px;margin-top:10px;">
            <button id="v30_Run" disabled style="flex:2;background:#10b981;color:#fff;border:none;padding:12px;border-radius:6px;font-weight:900;cursor:pointer;font-size:14px;">▶️ EXTRAER MÉTRICAS</button>
            <button id="v30_Pause" style="flex:1;background:#334155;color:#fff;border:1px solid #475569;border-radius:6px;font-weight:bold;cursor:pointer;">⏸️ PAUSAR</button>
            <select id="v30_Speed" style="flex:1;background:#020617;color:#ff00ff;border:1px solid #334155;padding:8px;border-radius:6px;font-weight:bold;">${Object.entries(SPEEDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
        </div>
    </div>

    <div style="background:#020617;padding:10px;border:1px solid #1e3b4a;border-radius:8px;margin-bottom:10px;">
        <div id="v30_Current" style="color:#38bdf8;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Equipo en curso...</div>
        <div style="height:10px;background:#1e293b;border-radius:5px;margin-top:8px;overflow:hidden;border:1px solid #334155;">
            <div id="v30_Bar" style="width:0%;height:100%;background:linear-gradient(90deg, #00ffaa, #38bdf8);box-shadow:0 0 10px #00ffaa;transition: width 0.2s;"></div>
        </div>
        <div id="v30_Counts" style="margin-top:8px;color:#94a3b8;font-size:11px;">Progreso Global...</div>
    </div>

    <div id="v30_BatchBox" style="display:none;background:#451a03;border:1px solid #b45309;border-radius:8px;padding:10px;margin-bottom:10px;">
        <b style="color:#fbbf24;font-size:14px;">📦 LOTE LISTO PARA EXPORTAR</b>
        <div id="v30_BatchText" style="margin:6px 0;color:#fde68a;font-size:12px;"></div>
        <button id="v30_ZipBtn" style="width:100%;background:#3b82f6;color:#fff;border:none;padding:12px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;box-shadow:0 4px 10px rgba(59, 130, 246, 0.4);">💾 1. GENERAR Y DESCARGAR ZIP</button>
        <button id="v30_Confirm" style="display:none; width:100%;background:#10b981;color:#fff;border:none;padding:12px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px; margin-top:8px; box-shadow:0 4px 10px rgba(16, 185, 129, 0.4);">👉 2. CLIC AQUÍ PARA LIMPIAR Y CONTINUAR</button>
    </div>

    <div style="display:flex;gap:8px;margin-top:10px;">
        <button id="v30_Reset" style="width:100%;background:#7f1d1d;color:#fca5a5;border:1px solid #ef4444;border-radius:4px;cursor:pointer;padding:8px;font-size:11px;">BORRAR TODO Y REINICIAR</button>
    </div>

    <div id="v30_Log" style="margin-top:10px;height:140px;overflow-y:auto;background:#000;border:1px solid #1e293b;border-radius:6px;padding:8px;color:#a7f3d0;font-size:10px;line-height:1.4;"></div>
    `;
    document.body.appendChild(panel);

    const $ = id => document.getElementById(id);
    $('v30_Speed').value = SPEEDS[st.speed] ? st.speed : 'max';
    $('v30_Format').value = st.format || 'ALL';
    if(st.startTeam) $('v30_StartTeam').value = st.startTeam;

    function log(m, c = '#a7f3d0') {
        const d = document.createElement('div');
        d.textContent = '> ' + m; d.style.color = c; d.style.borderBottom = "1px dashed #111"; d.style.paddingBottom = "2px"; d.style.marginBottom = "2px";
        $('v30_Log').appendChild(d);
        $('v30_Log').scrollTop = $('v30_Log').scrollHeight;
        while ($('v30_Log').childNodes.length > 100) $('v30_Log').firstChild.remove();
    }

    $('v30_Start').onchange = persist; $('v30_End').onchange = persist;
    $('v30_Batch').onchange = persist; $('v30_Speed').onchange = persist; $('v30_StartTeam').onchange = persist; $('v30_Format').onchange = persist;
    $('v30_Close').onclick = () => panel.remove();

    function normalizeSelection(raw) {
        let arr = raw?.teams || raw;
        const m = new Map();
        for (const t of arr) {
            const id = Number(t?.id ?? t?.team_id ?? t?.teamId);
            if (Number.isInteger(id) && id > 0) m.set(id, { id, name: t.name ?? t.nombre ?? `Team ${id}`, country: t.country ?? t.pais ?? null, source_memberships: t.source_memberships ?? [] });
        }
        return { schema_version: 'incastats.team_selection.v30.0', provider: 'sofascore', generated_at: nowIso(), start_year: raw?.start_year ?? null, league_configs: raw?.league_configs ?? [], teams: [...m.values()] };
    }

    function installSelection(s) {
        R.selection = s;
        const expected = fp(s);
        if (!R.checkpoint || R.checkpoint.selection_fingerprint !== expected) {
            if (R.checkpoint) R.checkpoint = migrateCp(R.checkpoint, expected);
            else R.checkpoint = newCheckpoint(s);
        }
        persist();
        
        const expCount = (R.checkpoint.exported_confirmed || []).length;
        $('v30_Sel').innerHTML = `<b style="color:#00ffaa">Cargado: ${s.teams.length} equipos</b>. Exportados: ${expCount}`;
        $('v30_Run').disabled = false;
        refreshCounts();
    }

    $('v30_Config').onchange = async e => { const f = e.target.files?.[0]; if (!f) return; try { installSelection(normalizeSelection(JSON.parse(await f.text()))); log(`✅ Config cargado correctamente.`, '#00ffaa'); } catch (err) { alert(err.message || err); } };
    
    $('v30_CpFile').onchange = async e => {
        const f = e.target.files?.[0]; if (!f) return;
        try {
            let cp = JSON.parse(await f.text());
            let currentFp = R.selection ? fp(R.selection, dataPolicy()) : null;
            cp = migrateCp(cp, currentFp);
            
            if (!cp?.schema_version?.includes('incastats.checkpoint')) throw new Error('Archivo Checkpoint inválido.');
            R.checkpoint = cp; persist();
            refreshCounts();
            log(`🔄 Checkpoint restaurado y actualizado: ${(cp.exported_confirmed || []).length} equipos ya exportados.`, '#38bdf8');
        } catch (err) { alert(err.message || err); }
    };

    async function waitPause() { while (R.paused && !R.stop) await sleep(500); if (R.stop) throw new Error('STOP_REQUESTED'); }
    async function gap() { await waitPause(); const p = SPEEDS[$('v30_Speed').value] || SPEEDS.max; if (p.max > 0) await sleep(rand(p.min, p.max)); R.requestCount++; }

    async function apiGet(path, opt = {}, retry = 0) {
        await gap();
        let r;
        try {
            const headers = { accept: 'application/json,text/plain,*/*' };
            if (window.LLAVE_MAESTRA) headers['x-requested-with'] = window.LLAVE_MAESTRA;
            r = await fetchOriginal(`${API}${path}`, { headers, credentials: 'include' });
        } catch (e) {
            if (retry >= DEFAULT.maxRetries) throw e;
            await sleep(800 * (retry + 1));
            return apiGet(path, opt, retry + 1);
        }

        if (r.status === 429) {
            if (retry >= DEFAULT.maxRetries) throw new Error(`429 RATE_LIMIT tras ${retry + 1} intentos: ${path}`);
            log(`⚠️ 429 Límite. Esperando y reintentando (${retry + 1}/${DEFAULT.maxRetries})...`, '#f59e0b');
            await sleep(5000 * Math.pow(1.5, retry));
            return apiGet(path, opt, retry + 1);
        }
        if (r.status === 403) {
            window.LLAVE_MAESTRA = null;
            log(`🔑 403: esperando una nueva llave normal del sitio...`, '#f59e0b');
            for (let i = 0; i < 120 && !window.LLAVE_MAESTRA; i++) {
                await waitPause();
                await sleep(1000);
            }
            if (!window.LLAVE_MAESTRA) throw new Error(`403 sin nueva llave tras 120s: ${path}`);
            return apiGet(path, opt, retry);
        }
        if (opt.allowMissing && [400, 404, 410, 422].includes(r.status)) return { __missing: true, status: r.status };
        if (r.status >= 500 && retry < DEFAULT.maxRetries) { await sleep(1000 * (retry + 1)); return apiGet(path, opt, retry + 1); }
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${path}`);
        return r.json();
    }

    async function discoverEvents(team, pol) {
        const m = new Map();
        for (let page = 0; page < DEFAULT.maxHistoryPages; page++) {
            await waitPause();
            $('v30_Current').textContent = `${team.name} · Buscando historial (Pág ${page + 1})`;
            const d = await apiGet(`/team/${team.id}/events/last/${page}`, { allowMissing: true });
            if (d?.__missing) break;
            const ev = Array.isArray(d?.events) ? d.events : [];
            if (!ev.length) break;

            for (const e of ev) {
                const sMeta = extractSofaScoreMetadata(e);
                const y = sMeta.start_year; 
                const isCross = sMeta.start_year !== sMeta.end_year && sMeta.end_year > 0;
                const has = Number(e.homeTeam?.id) === team.id || Number(e.awayTeam?.id) === team.id;
                
                let formatMatch = false;
                if (y == null || y === 0) {
                    formatMatch = true; 
                } else if (y >= pol.start_year && y <= pol.end_year) {
                    if (pol.season_format === 'ALL') {
                        formatMatch = true;
                    } else if (pol.season_format === 'CALENDAR' && !isCross) {
                        formatMatch = true;
                    } else if (pol.season_format === 'CROSS' && isCross) {
                        formatMatch = true;
                    }
                }

                if (has && formatMatch) {
                    m.set(Number(e.id), e);
                }
            }
            
            const older = ev.every(e => { const y = extractSofaScoreMetadata(e).start_year; return y != null && y !== 0 && y < pol.start_year; });
            const saysNoNext = (Object.prototype.hasOwnProperty.call(d, 'hasNextPage') && d.hasNextPage === false);
            if (older || saysNoNext) break;
        }
        return [...m.values()].sort((a, b) => (a.startTimestamp || 0) - (b.startTimestamp || 0));
    }

    function buildPeriodMapsDual(stats, e) {
        const out = {};
        for (const p of (stats?.statistics || [])) {
            out[p.period] = { home: Object.fromEntries(METRICS.map(x => [x, null])), away: Object.fromEntries(METRICS.map(x => [x, null])) };
            out[p.period].home.Goals = scoreFor(e, 'home', p.period);
            out[p.period].away.Goals = scoreFor(e, 'away', p.period);

            for (const g of (p.groups || [])) {
                for (const it of (g.statisticsItems || [])) {
                    if (METRICS.includes(it?.name)) {
                        out[p.period].home[it.name] = it.home ?? null;
                        out[p.period].away[it.name] = it.away ?? null;
                    }
                }
            }
        }
        return out;
    }

    function cardsFromIncidents(d, e) {
        if (!d || d.__missing || !Array.isArray(d.incidents)) return { available: false, cards: [] };
        
        const dedupeSet = new Set();
        const cards = [];
        
        let seq = 1;
        d.incidents.filter(i => i?.incidentType === 'card').forEach(i => {
            const cls = i.incidentClass || i.cardType || null;
            const pId = i.player?.id ? Number(i.player.id) : 0;
            const min = i.time ?? 0;
            
            const dedupKey = `${e.id}_${pId}_${min}_${cls}_${i.incidentClass}`;
            if(!dedupeSet.has(dedupKey)) {
                dedupeSet.add(dedupKey);
                cards.push({
                    event_id: Number(e.id), sequence: seq++, team_id: i.isHome ? Number(e.homeTeam.id) : Number(e.awayTeam.id),
                    player_id: pId || null, player_name: i.player?.name || null,
                    minute: i.time ?? null, added_time: i.addedTime ?? null,
                    incident_class: cls, card_type: cls === 'yellowRed' ? 'SECOND_YELLOW_RED' : cls === 'red' ? 'DIRECT_RED' : cls === 'yellow' ? 'YELLOW' : String(cls || 'UNKNOWN').toUpperCase(),
                    yellow_event: cls === 'yellow' || cls === 'yellowRed' ? 1 : 0,
                    effective_red: cls === 'yellowRed' || cls === 'red' ? 1 : 0, 
                    direct_red: cls === 'red' ? 1 : 0, second_yellow_red: cls === 'yellowRed' ? 1 : 0,
                    explanation_original: i.reason ?? i.description ?? i.text ?? i.incidentClass ?? null, raw_incident: i
                });
            }
        });
        return { available: true, cards: cards };
    }

    function audit(e, reason, meta) { 
        return { event_id: Number(e.id), date: dmy(e.startTimestamp), reason: reason, status: e.status?.type || 'unknown', competition_phase: meta.competition_phase, competition: { id: meta.competition_id, name: meta.competition_name }, season: { season_id: meta.season_id, season_label_original: meta.season_label_original }, home_team: { id: Number(e.homeTeam?.id) || null, name: e.homeTeam?.name || null }, away_team: { id: Number(e.awayTeam?.id) || null, name: e.awayTeam?.name || null } }; 
    }

    async function processEvent(e, team) {
        const meta = extractSofaScoreMetadata(e);

        if (!e.id) return { kind: 'incomplete', audit: audit(e, 'NO_EVENT', meta) };
        if (!e.homeTeam?.id || !e.awayTeam?.id) return { kind: 'incomplete', audit: audit(e, 'NO_TEAM', meta) };
        if (isFriendly(e, meta)) return { kind: 'friendly', audit: audit(e, 'FRIENDLY_MATCH', meta) };

        const isFinished = e.status?.type === 'finished' || [100, 106, 110, 113, 120].includes(e.status?.code);
        if (!isFinished) {
            let reason = 'NOT_FINISHED';
            if (e.status?.type === 'canceled') reason = 'CANCELLED';
            if (e.status?.type === 'postponed') reason = 'POSTPONED';
            return { kind: 'incomplete', audit: audit(e, reason, meta) };
        }

        const stats = await apiGet(`/event/${e.id}/statistics`, { allowMissing: true });
        if (stats?.__missing) return { kind: 'incomplete', audit: audit(e, 'NO_STATISTICS', meta) };

        const maps = buildPeriodMapsDual(stats, e);
        if (!maps.ALL) return { kind: 'incomplete', audit: { ...audit(e, 'NO_ALL_PERIOD_IN_STATS', meta), available_periods: Object.keys(maps) } };

        let needsIncidents = false;
        const homeY = num(maps.ALL.home['Yellow cards']) || 0;
        const homeR = num(maps.ALL.home['Red cards']) || 0;
        const awayY = num(maps.ALL.away['Yellow cards']) || 0;
        const awayR = num(maps.ALL.away['Red cards']) || 0;
        
        if (homeY > 0 || homeR > 0 || awayY > 0 || awayR > 0) {
            needsIncidents = true;
        }

        let inc = null;
        if (needsIncidents) {
            inc = await apiGet(`/event/${e.id}/incidents`, { allowMissing: true });
        }
        let bundle = cardsFromIncidents(inc, e);
        
        return {
            kind: 'valid',
            item: {
                provider: 'sofascore', event_id: Number(e.id), kickoff_timestamp: e.startTimestamp ?? null, date: dmy(e.startTimestamp),
                match_status: e.status?.type || 'finished', round: e.roundInfo?.round ?? e.roundInfo?.name ?? null,
                metadata: meta,
                home_team: { id: Number(e.homeTeam?.id) || null, name: e.homeTeam?.name || null },
                away_team: { id: Number(e.awayTeam?.id) || null, name: e.awayTeam?.name || null },
                score: { home: scoreFor(e, 'home', 'ALL'), away: scoreFor(e, 'away', 'ALL') },
                periods: maps, 
                cards: bundle.cards
            }
        };
    }

    async function mapPool(items, workers, fn, onDone) { const out = new Array(items.length); let next = 0, done = 0; async function w() { while (true) { const i = next++; if (i >= items.length) return; await waitPause(); out[i] = await fn(items[i], i); done++; onDone?.(done, items.length); } } await Promise.all(Array.from({ length: Math.max(1, workers) }, w)); return out; }


    function seasonKeyFromMeta(meta) {
        return `${meta?.competition_id ?? 'X'}_${meta?.season_id ?? 'X'}`;
    }

    async function discoverNextEvents(team) {
        try {
            const d = await apiGet(`/team/${team.id}/events/next/0`, { allowMissing: true });
            if (d?.__missing) return [];
            return Array.isArray(d?.events) ? d.events : [];
        } catch (err) {
            log(`⚠️ Próximos eventos no disponibles para ${team.name}; fallback conservador.`, '#f59e0b');
            return [];
        }
    }

    function applyOperationalSeasonStatus(matches, nextEvents) {
        const futureKeys = new Set();

        for (const e of (nextEvents || [])) {
            if (e?.status?.type === 'canceled') continue;
            const meta = extractSofaScoreMetadata(e);
            if (meta?.competition_id && meta?.season_id) {
                futureKeys.add(seasonKeyFromMeta(meta));
            }
        }

        const latestBySeason = new Map();
        for (const m of matches) {
            const k = seasonKeyFromMeta(m.metadata);
            const ts = Number(m.kickoff_timestamp) || 0;
            if (ts > (latestBySeason.get(k) || 0)) latestBySeason.set(k, ts);
        }

        const nowSec = Date.now() / 1000;
        const currentYear = new Date().getFullYear();
        const GRACE_DAYS = 35;

        for (const m of matches) {
            const meta = m.metadata;
            const k = seasonKeyFromMeta(meta);

            // Evidencia más fuerte: SofaScore ya tiene un próximo evento de esa season_id.
            if (futureKeys.has(k)) {
                meta.season_status = 'CURRENT';
                meta.season_status_basis = 'SOFASCORE_NEXT_EVENT';
                continue;
            }

            // Respetar finalización explícita / endTime vencido / año ya pasado.
            if (meta.season_status === 'FINISHED' || meta.season_status === 'UPCOMING') {
                meta.season_status_basis = 'SOFASCORE_OR_SAFE_DATE';
                continue;
            }

            const latestTs = latestBySeason.get(k) || 0;
            const ageDays = latestTs ? (nowSec - latestTs) / 86400 : Infinity;
            const sy = Number(meta.start_year) || 0;
            const ey = Number(meta.end_year) || sy;
            const touchesCurrentYear = sy <= currentYear && ey >= currentYear;

            // Fallback con gracia: mantiene CURRENT si hubo actividad muy reciente.
            // Un estadual terminado meses atrás ya cae FINISHED.
            if (touchesCurrentYear && ageDays >= 0 && ageDays <= GRACE_DAYS) {
                meta.season_status = 'CURRENT';
                meta.season_status_basis = 'RECENT_ACTIVITY_GRACE';
            } else {
                meta.season_status = 'FINISHED';
                meta.season_status_basis = 'NO_FUTURE_EVENT_AND_OUTSIDE_GRACE';
            }
        }

        return futureKeys;
    }

    async function processTeam(team, pol) {
        log(`🛡️ EXTRAYENDO EQUIPO: ${team.name}`, '#38bdf8');
        const events = await discoverEvents(team, pol);
        const prof = SPEEDS[$('v30_Speed').value] || SPEEDS.max;

        const results = await mapPool(events, prof.workers, e => processEvent(e, team), (d, t) => {
            $('v30_Current').textContent = `${team.name} · Procesando ${d}/${t}`;
        });

        const matches = [], incomplete = [], friendlies = [];
        for (const r of results) {
            if (!r) continue;
            if (r.kind === 'valid') matches.push(r.item);
            else if (r.kind === 'incomplete') incomplete.push(r.audit);
            else if (r.kind === 'friendly') friendlies.push(r.audit);
        }

        // Una consulta SofaScore extra por equipo, no por partido.
        const nextEvents = await discoverNextEvents(team);
        const futureKeys = applyOperationalSeasonStatus(matches, nextEvents);

        return {
            schema_version: 'incastats.team_package.v30.0',
            provider: 'sofascore',
            extractor_version: VERSION,
            extraction: {
                completed_at: nowIso(),
                data_policy: pol,
                events_discovered: events.length,
                valid_matches: matches.length,
                incomplete_matches: incomplete.length,
                excluded_friendlies: friendlies.length,
                future_season_keys: [...futureKeys],
                atomic_team_complete: true
            },
            team: { id: team.id, name: team.name, country: team.country ?? null },
            matches,
            audit: { incomplete_matches: incomplete, excluded_friendlies: friendlies }
        };
    }

    async function commit(pkg) { await putTeam({ team_id: pkg.team.id, selection_fingerprint: R.checkpoint.selection_fingerprint, completed_at: nowIso(), package: pkg }); persist(); }

    async function ensureZip() { if (window.JSZip) return window.JSZip; await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = res; s.onerror = () => rej(new Error('JSZip falló')); document.head.appendChild(s); }); return window.JSZip; }
    function downloadBlob(b, n) { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = n; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2500); }
    function downloadJson(o, n) { downloadBlob(new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' }), n); }

    async function exportBatch(stagedTeams) {
        log(`📦 Empaquetando ${stagedTeams.length} equipos...`, '#d946ef');

        const JSZip = await ensureZip(), zip = new JSZip();
        const uniqueMatches = new Map(), uniqueCards = new Map();
        const processedPortalEvents = new Set();
        const inc = [], fri = [];
        
        const manifestData = { batch_id: R.checkpoint.batches_exported.length, extraction_date: nowIso(), status: "staged_complete", datasets: [] };
        const portalReadyFolder = zip.folder('portal_ready');
        const teamsCsvFolder = zip.folder('teams_csv');
        const shards = {};

        for (const r of stagedTeams) {
            const p = r.package;
            zip.file(`teams_json/${p.team.id}_${safe(p.team.name)}.json`, JSON.stringify(p, null, 2));

            let teamPartidos = 0;
            let teamCsvRows = [];
            const compDetailsMap = new Map();

            for (const m of p.matches) {
                teamPartidos++;
                const meta = m.metadata;
                
                const eventKey = `${m.provider}_${m.event_id}`;
                if(!uniqueMatches.has(eventKey)) {
                    uniqueMatches.set(eventKey, [m.event_id, m.date, meta.competition_id, meta.competition_name, meta.season_id, meta.season_label_original, meta.start_year, meta.end_year, meta.season_format, meta.competition_phase, meta.competition_stage, meta.competition_type, m.match_status, m.home_team?.id, m.home_team?.name, m.away_team?.id, m.away_team?.name, m.score?.home, m.score?.away]);
                }

                const shardFriendly = `compat_${meta.competition_id}_${meta.season_id}`;

                const cId = meta.competition_id + '_' + meta.season_id + '_' + meta.competition_phase;
                if (!compDetailsMap.has(cId)) {
                    compDetailsMap.set(cId, {
                        competition_id: meta.competition_id,
                        competition_name: meta.competition_name,
                        season_id: meta.season_id,
                        season_label: meta.season_label_original,
                        start_year: meta.start_year,
                        end_year: meta.end_year,
                        season_format: meta.season_format,
                        competition_phase: meta.competition_phase,
                        competition_stage: meta.competition_stage,
                        competition_type: meta.competition_type,
                        season_status: meta.season_status,
                        season_status_basis: meta.season_status_basis || null,
                        titan_pro_validation: true,
                        filename: `${shardFriendly}.csv`,
                        last_update: nowIso()
                    });
                }

                const shardKey = `${meta.competition_id}_${meta.season_id}`;
                
                if(!shards[shardKey]) {
                    shards[shardKey] = {
                        friendlyName: shardFriendly,
                        rows: [],
                        status: meta.season_status,
                        hasCurrentEvidence: false
                    };
                }
                if (meta.season_status === 'CURRENT') {
                    shards[shardKey].hasCurrentEvidence = true;
                    shards[shardKey].status = 'CURRENT';
                } else if (!shards[shardKey].hasCurrentEvidence && meta.season_status === 'FINISHED') {
                    shards[shardKey].status = 'FINISHED';
                }

                const sides = [{ side: 'home', tId: m.home_team?.id, tName: m.home_team?.name }, { side: 'away', tId: m.away_team?.id, tName: m.away_team?.name }];
                
                const isNewPortalEvent = !processedPortalEvents.has(m.event_id);
                if (isNewPortalEvent) processedPortalEvents.add(m.event_id);

                for (const sideData of sides) {
                    if(!sideData.tId) continue;
                    
                    for (const period of ['ALL', '1ST', '2ND']) {
                        const dataMap = m.periods || {};
                        const metrics = dataMap[period] ? dataMap[period][sideData.side] : {};
                        
                        const condition = sideData.side === 'home' ? 'Local' : 'Visita';
                        const row = [m.event_id, meta.competition_id, meta.season_id, meta.season_format, meta.competition_phase, meta.competition_stage, meta.competition_type, sideData.tId, sideData.tName, condition, period, m.date, m.round ?? '', ...METRICS.map(x => metrics?.[x] ?? null)];
                        
                        if (isNewPortalEvent) {
                            shards[shardKey].rows.push(row);
                        }
                        teamCsvRows.push(row); 
                    }
                }

                for (const c of (m.cards || [])) {
                    const cKey = `${m.event_id}_${c.sequence}`;
                    if(!uniqueCards.has(cKey)) {
                        uniqueCards.set(cKey, {
                            csv: [m.event_id, m.date, meta.competition_id, meta.season_id, c.team_id, c.player_id, c.player_name, c.minute, c.added_time, c.incident_class, c.card_type, c.yellow_event, c.effective_red, c.direct_red, c.second_yellow_red, c.explanation_original],
                            raw: c.raw_incident
                        });
                    }
                }
            }

            teamsCsvFolder.file(`${p.team.id}_${safe(p.team.name)}.csv`, '\ufeff' + PORTAL_COLUMNS.join(',') + '\n' + teamCsvRows.map(csvLine).join('\n'));

            manifestData.datasets.push({ 
                team_id: p.team.id, 
                team_name: p.team.name, 
                competition_details: Array.from(compDetailsMap.values()),
                files: [`teams_csv/${p.team.id}_${safe(p.team.name)}.csv`, `teams_json/${p.team.id}_${safe(p.team.name)}.json`],
                valid_matches: teamPartidos,
                incomplete_matches: p.audit.incomplete_matches.length 
            });

            inc.push(...p.audit.incomplete_matches); fri.push(...p.audit.excluded_friendlies);
        }

        zip.file('dataset_manifest.json', JSON.stringify(manifestData, null, 2));

        let cardsRawJsonl = "";
        const cardsCsv = [['event_id','date','competition_id','season_id','team_id','player_id','player_name','minute','added_time','incident_class','card_type','yellow_event','effective_red','direct_red','second_yellow_red','explanation_original']];
        for(const [k, v] of uniqueCards.entries()){ cardsCsv.push(v.csv); cardsRawJsonl += JSON.stringify({event_id: k.split('_')[0], raw: v.raw}) + '\n'; }
        
        const matchesCsv = [['event_id','date','competition_id','competition','season_id','season_label','start_year','end_year','season_format','competition_phase','competition_stage', 'competition_type', 'status','home_team_id','home_team','away_team_id','away_team','home_score','away_score']];
        matchesCsv.push(...Array.from(uniqueMatches.values()));

        for(const [shardKey, data] of Object.entries(shards)){
            const folderName = data.status === 'CURRENT' ? 'current' : 'historical';
            portalReadyFolder.folder(folderName).file(`${data.friendlyName}.csv`, '\ufeff' + PORTAL_COLUMNS.join(',') + '\n' + data.rows.map(csvLine).join('\n'));
        }

        zip.file('csv/matches_index.csv', '\ufeff' + matchesCsv.map(csvLine).join('\n'));
        zip.file('csv/cards_detailed.csv', '\ufeff' + cardsCsv.map(csvLine).join('\n'));
        zip.file('json/cards_raw.jsonl', cardsRawJsonl);
        zip.file('audit/incomplete_matches.json', JSON.stringify(inc, null, 2));
        zip.file('audit/excluded_friendlies.json', JSON.stringify(fri, null, 2));
        zip.file('checkpoint.json', JSON.stringify(R.checkpoint, null, 2)); 
        
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } }, m => $('v30_Current').textContent = `Comprimiendo ZIP... ${m.percent.toFixed(0)}%`);
        downloadBlob(blob, `IncaStats_TITAN_${String(R.checkpoint.batches_exported.length).padStart(3, '0')}_${stagedTeams.length}_equipos.zip`);
        log(`✅ ZIP Construido y descargando.`, '#00ffaa');
    }

    async function refreshCounts() {
        if (!R.selection || !R.checkpoint) return;
        const expConf = R.checkpoint.exported_confirmed || [];
        const staged = (await allTeams()).filter(x => x.selection_fingerprint === R.checkpoint.selection_fingerprint);
        $('v30_Counts').textContent = `Exportados OK: ${expConf.length}/${R.selection.teams.length} · Staged en BD: ${staged.length}`;
        const pct = R.selection.teams.length ? 100 * expConf.length / R.selection.teams.length : 0;
        $('v30_Bar').style.width = `${pct}%`;
        if (staged.length) { $('v30_BatchText').textContent = `Hay ${staged.length} equipos listos en la Base de Datos interna.`; $('v30_BatchBox').style.display='block'; }
    }

    $('v30_Pause').onclick = () => { R.paused = !R.paused; $('v30_Pause').textContent = R.paused ? 'REANUDAR' : 'PAUSAR'; $('v30_Pause').style.background = R.paused ? '#f59e0b' : '#334155'; };

    $('v30_Run').onclick = async () => {
        try {
            if (R.running) return alert("El motor ya está en ejecución.");
            if (!R.selection) return alert("Por favor, sube primero tu archivo JSON de Configuración de Equipos.");
            
            const pol = dataPolicy(), expected = fp(R.selection, pol);
            const expConf = R.checkpoint?.exported_confirmed || [];
            
            if (expConf.length > 0 && R.checkpoint.selection_fingerprint !== expected) return alert('Cambiaste la configuración de rangos. Borra Todo y Reinicia.');
            
            if (!R.checkpoint || R.checkpoint.selection_fingerprint !== expected) R.checkpoint = newCheckpoint(R.selection, pol);
            persist(); 
            
            const exported = new Set(expConf.map(Number)); 
            const batch = Math.max(1, Number($('v30_Batch').value) || 100);
            
            let inputStart = Math.max(0, parseInt($('v30_StartTeam').value) - 1);

            let stagedList = await allTeams();
            let stagedSet = new Set(stagedList.filter(x => x.selection_fingerprint === R.checkpoint.selection_fingerprint).map(x => x.team_id));

            const idsToDelete = [];
            for(let i = inputStart; i < R.selection.teams.length; i++) {
                const tid = R.selection.teams[i].id;
                if (exported.has(tid) || stagedSet.has(tid)) {
                    idsToDelete.push(tid);
                    exported.delete(tid);
                    stagedSet.delete(tid);
                    R.checkpoint.exported_confirmed = R.checkpoint.exported_confirmed.filter(id => id !== tid);
                }
            }
            if (idsToDelete.length > 0) {
                await deleteTeams(idsToDelete);
                persist();
                log(`🧹 Limpiando historial del equipo N° ${inputStart + 1} en adelante...`, '#f43f5e');
            }

            R.running = true; R.stop = false;
            document.getElementById('v30_Run').style.display = "none";
            log(`🚀 Motor V30 encendido. Evaluando a partir del equipo N° ${inputStart + 1}...`, '#10b981');

            if (stagedSet.size >= batch) {
                R.paused = true; $('v30_Pause').textContent = 'REANUDAR';
                log(`🛑 Lote de ${stagedSet.size} alcanzado. Descarga tu archivo antes de continuar.`, '#fbbf24');
                refreshCounts();
            }

            for (let i = inputStart; i < R.selection.teams.length; i++) {
                await waitPause();
                const t = R.selection.teams[i];
                $('v30_StartTeam').value = i + 1;

                if (exported.has(t.id) || stagedSet.has(t.id)) continue; 
                
                if (stagedSet.size >= batch) {
                    R.paused = true; $('v30_Pause').textContent = 'REANUDAR';
                    log(`🛑 Lote de ${stagedSet.size} alcanzado. Pausa para descarga.`, '#fbbf24');
                    await waitPause(); 
                    stagedSet.clear(); 
                }
                
                try {
                    const pkg = await processTeam(t, pol);
                    await commit(pkg);
                    stagedSet.add(t.id); 
                    
                    // 🔥 FIX 3: LIMPIAR FAILED TEAMS
                    if (R.checkpoint.failed_teams && R.checkpoint.failed_teams.some(f => f.team_id === t.id)) {
                        R.checkpoint.failed_teams = R.checkpoint.failed_teams.filter(f => f.team_id !== t.id);
                        persist();
                    }

                    log(`✔️ COMPLETADO [${i + 1}]: ${t.name}`, '#00ffaa');
                } catch (err) {
                    if (err.message === 'STOP_REQUESTED') throw err;
                    R.checkpoint.failed_teams = [...(R.checkpoint.failed_teams||[]).filter(x => x.team_id !== t.id), { team_id: t.id, team_name: t.name, at: nowIso(), error: String(err.message || err) }];
                    persist();
                    log(`❌ Falla en ${t.name}: ${err.message || err}`, '#ef4444');
                }
                await refreshCounts();
            }
        } catch (err) {
            if (err.message !== 'STOP_REQUESTED') { alert("ERROR CRÍTICO: " + (err.message || err)); log(`ERROR FATAL: ${err.message || err}`, '#ef4444'); }
        } finally {
            R.running = false; R.paused = false; $('v30_Pause').textContent = 'PAUSAR';
            document.getElementById('v30_Run').style.display = "block";
            $('v30_Run').innerText = "▶️ EXTRAER MÉTRICAS";
            await refreshCounts();
        }
    };

    $('v30_ZipBtn').onclick = async () => { 
        try { 
            $('v30_ZipBtn').innerText = "⏳ COMPRIMIENDO Y DESCARGANDO...";
            $('v30_ZipBtn').disabled = true;
            
            if (!R.checkpoint) throw new Error('Sin checkpoint en memoria.');
            const staged = (await allTeams()).filter(x => x.selection_fingerprint === R.checkpoint.selection_fingerprint).sort((a, b) => a.team_id - b.team_id);
            if (!staged.length) throw new Error('No hay equipos en la BD para exportar.');

            await exportBatch(staged); 
            
            await sleep(1500); 
            downloadJson(R.checkpoint, `IncaStats_Checkpoint_V30_${R.checkpoint.exported_confirmed.length + staged.length}_staged.json`);
            
            $('v30_ZipBtn').style.display = 'none';
            $('v30_Confirm').style.display = 'block';
            log(`✅ DESCARGA EN PROCESO. Cuando termine de bajar, dale al botón verde para limpiar y continuar.`, '#fbbf24');
        } catch (e) { 
            alert(e.message || e); 
            $('v30_ZipBtn').innerText = "💾 1. GENERAR Y DESCARGAR ZIP";
            $('v30_ZipBtn').disabled = false;
        } 
    };

    $('v30_Confirm').onclick = async () => {
        const staged = (await allTeams()).filter(x => x.selection_fingerprint === R.checkpoint.selection_fingerprint);
        
        const s = new Set((R.checkpoint.exported_confirmed || []).map(Number));
        staged.forEach(x => s.add(x.team_id));
        R.checkpoint.exported_confirmed = [...s].sort((a, b) => a - b);
        
        if(!R.checkpoint.batches_exported) R.checkpoint.batches_exported = [];
        R.checkpoint.batches_exported.push({ batch_number: R.checkpoint.batches_exported.length + 1, confirmed_at: nowIso(), team_count: staged.length, team_ids: staged.map(x => x.team_id) });
        persist();
        
        await deleteTeams(staged.map(x => x.team_id)); 
        $('v30_BatchBox').style.display = 'none';
        $('v30_ZipBtn').style.display = 'block';
        $('v30_ZipBtn').disabled = false;
        $('v30_ZipBtn').innerText = "💾 1. GENERAR Y DESCARGAR ZIP";
        $('v30_Confirm').style.display = 'none';
        
        await refreshCounts();
        $('v30_Run').click();
    };

    $('v30_Reset').onclick = async () => {
        if (R.running) return alert('Detén el motor primero con PAUSAR y luego recarga la página.');
        if (!confirm('🚨 ¿ESTÁS SEGURO? Borrarás TODO el progreso, los checkpoints y la base de datos interna.')) return;
        localStorage.removeItem(SEL_KEY); localStorage.removeItem(CP_KEY); await clearDB();
        
        R.selection = null; R.checkpoint = null;
        $('v30_Sel').textContent = 'Sin config.';
        $('v30_Run').disabled = true; $('v30_BatchBox').style.display = 'none';
        $('v30_Bar').style.width = `0%`;
        $('v30_Counts').textContent = "Progreso Global...";
        log('RESET V30 completado. Sube tu JSON para empezar de cero.', '#f59e0b');
    };

    (async () => {
        try {
            R.db = await openDB();
            const s = JSON.parse(localStorage.getItem(SEL_KEY) || 'null');
            let c = JSON.parse(localStorage.getItem(CP_KEY) || 'null');
            
            if (s?.teams?.length) {
                R.selection = normalizeSelection(s);
                const expectedFp = fp(R.selection, dataPolicy());
                
                c = migrateCp(c, expectedFp); 
                R.checkpoint = c?.schema_version?.includes('incastats.checkpoint') ? c : newCheckpoint(R.selection);
                
                $('v30_Run').disabled = false;
                $('v30_Run').innerText = "▶️ REANUDAR EXTRACCIÓN";
                await refreshCounts();
                log('Sesión y Checkpoint recuperados desde la RAM local. Listo para reanudar.', '#38bdf8');
            }
        } catch(e) {
            log('Iniciando base limpia.', '#fff');
        }
    })();
})();