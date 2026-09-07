
// V4.25.6: si un nombre antiguo construyó una URL aproximada antes de que
// cargara el índice exacto, reintenta usando el filename físico por Team_ID.
document.addEventListener('error', async (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (!img.classList.contains('inca-match-logo')) return;
    if (img.dataset.titanExactRetry === '1') return;

    img.dataset.titanExactRetry = '1';
    const row = img.closest('tr');
    const teamName =
        img.getAttribute('data-team') ||
        row?.querySelector('[data-team-name]')?.getAttribute('data-team-name') ||
        img.alt || '';

    try {
        const exact = await window.INCA_TITAN?.resolveLogoUrl?.(teamName);
        if (exact && exact !== img.src) img.src = exact;
    } catch (_) {}
}, true);


// ==========================================================================
// 0. UTILIDADES DE RENDIMIENTO Y RED
// ==========================================================================
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

const INCA_CONFIG = Object.freeze({
    CACHE_TTL_MS: 10 * 60 * 1000,
    PLAYER_CACHE_TTL_MS: 15 * 60 * 1000,
    FETCH_TIMEOUT_MS: 25000,
    MAX_SEARCH_RESULTS: 80
});

const promesasCSVEnCurso = new Map();
const promesasTextoEnCurso = new Map();
const memoriaTexto = new Map();
const memoriaCSV = new Map();

function normalizarTexto(valor) {
    return String(valor ?? '')
        .replace(/\s+/g, ' ')
        .trim();
}

function claveTexto(valor) {
    return normalizarTexto(valor)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
}

function escaparHTML(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escaparAtributo(valor) {
    return escaparHTML(valor).replace(/`/g, '&#096;');
}

function aNumero(valor, fallback = 0) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : fallback;
    if (valor === null || valor === undefined) return fallback;

    let texto = String(valor).trim();
    if (!texto || texto === '-' || texto.toLowerCase() === 'n/a') return fallback;

    texto = texto
        .replace(/[€$£\s]/g, '')
        .replace(/[^0-9,.-]/g, '');

    if (texto.includes(',') && texto.includes('.')) {
        if (texto.lastIndexOf(',') > texto.lastIndexOf('.')) {
            texto = texto.replace(/\./g, '').replace(',', '.');
        } else {
            texto = texto.replace(/,/g, '');
        }
    } else if (texto.includes(',')) {
        texto = texto.replace(',', '.');
    }

    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : fallback;
}

function primerNumero(fila, columnas, fallback = 0) {
    for (const columna of columnas) {
        if (!Object.prototype.hasOwnProperty.call(fila, columna)) continue;
        const valor = fila[columna];
        if (valor === '' || valor === null || valor === undefined) continue;
        const numero = aNumero(valor, Number.NaN);
        if (Number.isFinite(numero)) return numero;
    }
    return fallback;
}

function obtenerValor(fila, columnas, fallback = '') {
    for (const columna of columnas) {
        const valor = fila?.[columna];
        if (valor !== undefined && valor !== null && String(valor).trim() !== '') return valor;
    }
    return fallback;
}

function leerStorage(storage, clave, fallback = null) {
    try {
        const valor = storage.getItem(clave);
        return valor === null ? fallback : valor;
    } catch (error) {
        return fallback;
    }
}

function escribirStorage(storage, clave, valor) {
    try {
        storage.setItem(clave, valor);
        return true;
    } catch (error) {
        return false;
    }
}

function normalizarTiempo(valor) {
    const tiempo = claveTexto(valor).replace(/\s/g, '');
    const mapa = {
        ALL: 'ALL', FT: 'ALL', FULLTIME: 'ALL', PARTIDOCOMPLETO: 'ALL',
        '1ST': '1ST', '1H': '1ST', HT: '1ST', FIRSTHALF: '1ST', PRIMERTIEMPO: '1ST',
        '2ND': '2ND', '2H': '2ND', SH: '2ND', SECONDHALF: '2ND', SEGUNDOTIEMPO: '2ND'
    };
    return mapa[tiempo] || null;
}

function normalizarCondicion(valor) {
    const condicion = claveTexto(valor);
    if (['LOCAL', 'HOME', 'H'].includes(condicion)) return 'LOCAL';
    if (['VISITA', 'VISITANTE', 'AWAY', 'A'].includes(condicion)) return 'VISITA';
    if (['NEUTRO', 'NEUTRAL', 'N'].includes(condicion)) return 'NEUTRO';
    return null;
}

function separarPartido(valor) {
    const texto = normalizarTexto(valor);
    const partes = texto.split(/\s+(?:vs\.?|v)\s+/i);
    if (partes.length < 2) return null;
    const local = normalizarTexto(partes.shift());
    const visita = normalizarTexto(partes.join(' vs '));
    return local && visita ? { local, visita } : null;
}

function limpiarNombreClub(valor) {
    return claveTexto(valor)
        .replace(/[^A-Z0-9 ]/g, ' ')
        .replace(/\b(FC|CF|SC|AFC|CLUB|CD|AC|AS)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function equiposEquivalentes(a, b) {
    const claveA = claveTexto(a);
    const claveB = claveTexto(b);
    if (!claveA || !claveB) return false;
    if (claveA === claveB) return true;
    const limpioA = limpiarNombreClub(a);
    const limpioB = limpiarNombreClub(b);
    return Boolean(limpioA && limpioB && limpioA === limpioB);
}

function normalizarCabeceraPartidos(header) {
    const h = claveTexto(header).toLowerCase();
    const aliases = {
        date: 'Fecha', fecha: 'Fecha',
        jornada: 'Jornada', matchweek: 'Jornada', round: 'Jornada', week: 'Jornada', gw: 'Jornada',
        goals: 'Goles', goles: 'Goles', score: 'Goles', 'goals scored': 'Goles',
        'total shots': 'Tiros Totales', hs: 'Tiros Totales', tiros: 'Tiros Totales',
        'shots on target': 'Tiros a Puerta', hst: 'Tiros a Puerta',
        offsides: 'Fueras de Juego', 'fueras de juego': 'Fueras de Juego',
        fouls: 'Faltas', hf: 'Faltas', faltas: 'Faltas',
        'yellow cards': 'Tarjetas Amarillas', hy: 'Tarjetas Amarillas', ay: 'Tarjetas Amarillas',
        'red cards': 'Tarjetas Rojas', hr: 'Tarjetas Rojas', ar: 'Tarjetas Rojas',
        'corner kicks': 'Córners', hc: 'Córners', corners: 'Córners',
        'goal kicks': 'Saques de Meta',
        'throw-ins': 'Saques de Banda', 'throw ins': 'Saques de Banda',
        passes: 'Pases', 'total passes': 'Pases', 'pases': 'Pases',
        'total tackles': 'Entradas', tackles: 'Entradas'
    };
    return aliases[h] || normalizarTexto(header);
}

function validarColumnas(filas, obligatorias, etiqueta) {
    if (!Array.isArray(filas) || filas.length === 0) {
        throw new Error(`${etiqueta}: el archivo no contiene filas válidas.`);
    }
    const disponibles = new Set(Object.keys(filas.find(f => f && typeof f === 'object') || {}));
    const faltantes = obligatorias.filter(col => !disponibles.has(col));
    if (faltantes.length) {
        throw new Error(`${etiqueta}: faltan columnas obligatorias: ${faltantes.join(', ')}.`);
    }
}

function normalizarUrlDescarga(url) {
    return String(url || '')
        .replace(/([?&])v=\d+(&|$)/, '$1')
        .replace(/[?&]$/, '');
}

async function descargarTexto(urlOriginal, opciones = {}) {
    const url = normalizarUrlDescarga(urlOriginal);
    if (!url) throw new Error('URL de descarga vacía.');

    const memoriaKey = `${url}|${opciones.accept || 'text/plain,*/*'}`;
    if (memoriaTexto.has(memoriaKey)) return memoriaTexto.get(memoriaKey);
    if (promesasTextoEnCurso.has(memoriaKey)) return promesasTextoEnCurso.get(memoriaKey);

    const promesa = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), opciones.timeout || INCA_CONFIG.FETCH_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                cache: opciones.cache || 'default',
                headers: { Accept: opciones.accept || 'text/plain,*/*' }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status} al descargar ${url}`);

            const texto = await response.text();
            memoriaTexto.set(memoriaKey, texto);
            return texto;
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new Error(`Tiempo de espera agotado al descargar ${url}`);
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    })();

    promesasTextoEnCurso.set(memoriaKey, promesa);
    try {
        return await promesa;
    } finally {
        promesasTextoEnCurso.delete(memoriaKey);
    }
}

function parsearCSVTexto(texto, opciones = {}) {
    if (typeof Papa === 'undefined') throw new Error('Papa Parse no está disponible.');
    const resultado = Papa.parse(texto, {
        header: true,
        skipEmptyLines: 'greedy',
        quoteChar: '"',
        escapeChar: '"',
        transformHeader: opciones.transformHeader
    });
    const erroresGraves = (resultado.errors || []).filter(e => e.type === 'Quotes' || e.code === 'MissingQuotes');
    if (erroresGraves.length && (!resultado.data || resultado.data.length === 0)) {
        throw new Error(`CSV inválido: ${erroresGraves[0].message}`);
    }
    return (resultado.data || []).filter(fila => fila && Object.values(fila).some(v => String(v ?? '').trim() !== ''));
}

async function obtenerCSVRemoto(urlOriginal, opciones = {}) {
    const url = normalizarUrlDescarga(urlOriginal);
    const cacheKey = opciones.cacheKey || `csv_${url}`;
    const ttl = opciones.ttl || INCA_CONFIG.CACHE_TTL_MS;
    const ahora = Date.now();
    const memoriaKey = `${cacheKey}|${opciones.transformHeader ? 'transformado' : 'directo'}`;

    if (memoriaCSV.has(memoriaKey)) return memoriaCSV.get(memoriaKey);

    const cacheGuardada = leerStorage(sessionStorage, cacheKey, null);
    if (cacheGuardada) {
        try {
            const cache = JSON.parse(cacheGuardada);
            if (cache && Array.isArray(cache.data) && ahora - cache.timestamp < ttl) {
                memoriaCSV.set(memoriaKey, cache.data);
                return cache.data;
            }
        } catch (error) {
            // Caché antigua o dañada: se ignora y se vuelve a descargar.
        }
    }

    if (promesasCSVEnCurso.has(memoriaKey)) return promesasCSVEnCurso.get(memoriaKey);

    const promesa = (async () => {
        const texto = await descargarTexto(url, {
            accept: 'text/csv,text/plain,*/*',
            cache: opciones.cache || 'default',
            timeout: opciones.timeout
        });
        const data = (!opciones.transformHeader && window.INCA_DATA_WORKER?.available)
            ? await window.INCA_DATA_WORKER.parseCSV(texto)
            : parsearCSVTexto(texto, opciones);
        memoriaCSV.set(memoriaKey, data);

        try {
            const serializado = JSON.stringify({ timestamp: ahora, data });
            if (serializado.length <= 3_500_000) escribirStorage(sessionStorage, cacheKey, serializado);
        } catch (error) {
            // La aplicación continúa con la caché de memoria aunque el navegador bloquee storage.
        }

        return data;
    })();

    promesasCSVEnCurso.set(memoriaKey, promesa);
    try {
        return await promesa;
    } finally {
        promesasCSVEnCurso.delete(memoriaKey);
    }
}


function formatearNumero(valor, decimalesMaximos = 2) {
    const numero = Number(valor);

    if (!Number.isFinite(numero)) {
        return '0';
    }

    return numero.toLocaleString('es-PE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimalesMaximos
    });
}

function formatearValorMercado(valor) {
    if (valor === null || valor === undefined || String(valor).trim() === '') return '--';
    const original = String(valor).trim().toUpperCase();
    let numero = aNumero(original, Number.NaN);
    if (!Number.isFinite(numero) || numero <= 0) return '--';

    if (original.includes('B')) numero *= 1000;
    else if (original.includes('K')) numero /= 1000;
    else if (!original.includes('M') && numero >= 1_000_000) numero /= 1_000_000;

    const mostrado = numero.toLocaleString('es-PE', { maximumFractionDigits: 2 });
    return `€${mostrado}M`;
}

function clasificarPosicion(posicion) {
    const pos = claveTexto(posicion);
    if (!pos) return 'DESCONOCIDA';
    if (/^(G|GK|POR|ARQ)$/.test(pos) || /\b(ARQUERO|PORTERO|GOALKEEPER)\b/.test(pos)) return 'ARQUERO';
    if (/^(D|DEF)$/.test(pos) || /\b(DEFENSA|DEFENSOR|DEFENDER|CENTRAL|LATERAL|CB|LB|RB)\b/.test(pos)) return 'DEFENSOR';
    if (/^(M|MID)$/.test(pos) || /\b(MEDIO|MEDIOCENTRO|VOLANTE|MIDFIELDER|CENTROCAMPISTA|CM|DM|AM)\b/.test(pos)) return 'MEDIOCENTRO';
    if (/^(F|FWD|A|ATT)$/.test(pos) || /\b(DELANTERO|ATACANTE|EXTREMO|FORWARD|STRIKER|WINGER|ST|FW|LW|RW)\b/.test(pos)) return 'DELANTERO';
    return 'DESCONOCIDA';
}

function rellenarSelectSeguro(select, opciones, valorSeleccionado = null) {
    if (!select) return;
    const fragment = document.createDocumentFragment();
    opciones.forEach(opcion => {
        const option = document.createElement('option');
        option.value = String(opcion.value ?? '');
        option.textContent = String(opcion.label ?? opcion.value ?? '');
        fragment.appendChild(option);
    });
    select.replaceChildren(fragment);
    if (valorSeleccionado !== null && Array.from(select.options).some(o => o.value === String(valorSeleccionado))) {
        select.value = String(valorSeleccionado);
    }
}

// ==========================================================================
// INCA STATS PRO - LOGIC ENGINE VIP EDITION · REFACTORIZADO V7
// ==========================================================================

const CONFIG_ENLACES = {
    "Premier": {
        "25_26": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Premier_25_26.csv",
        "24_25": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Premier_24_25.csv",
        "23_24": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Premier_23_24.csv",
        "22_23": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Premier_22_23.csv",
        "21_22": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Premier_21_22.csv"
    },
    "Championship": {
        "25_26": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Championship_25_26.csv",
        "24_25": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Championship_24_25.csv",
        "23_24": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Championship_23_24.csv",
        "22_23": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Championship_22_23.csv",
        "21_22": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Championship_21_22.csv"
    },
    "LaLiga": {
        "25_26": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Laliga_25_26.csv",
        "24_25": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Laliga_24_25.csv",
        "23_24": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Laliga_23_24.csv",
        "22_23": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Laliga_22_23.csv",
        "21_22": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Laliga_21_22.csv"
    },
    "SerieA": {
        "25_26": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Serie-a_25_26.csv",
        "24_25": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Serie-a_24_25.csv",
        "23_24": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Serie-a_23_24.csv",
        "22_23": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Serie-a_22_23.csv",
        "21_22": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Serie-a_21_22.csv"
    },
    "Bundesliga": {
        "25_26": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Bundesliga_25_26.csv",
        "24_25": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Bundesliga_24_25.csv",
        "23_24": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Bundesliga_23_24.csv",
        "22_23": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Bundesliga_22_23.csv",
        "21_22": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Bundesliga_21_22.csv"
    },
    "Ligue1": {
        "25_26": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Ligue-1_25_26.csv",
        "24_25": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Ligue-1_24_25.csv",
        "23_24": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Ligue-1_23_24.csv",
        "22_23": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Ligue-1_22_23.csv",
        "21_22": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Ligue-1_21_22.csv"
    },
    "Brasileirao": {
        "25_26": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Brasileirao-serie-a_2025.csv",
        "24_25": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Brasileirao-serie-a_2024.csv",
        "23_24": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Brasileirao-serie-a_2023.csv",
        "22_23": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Brasileirao-serie-a_2022.csv",
        "21_22": "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/Brasileirao-serie-a_2021.csv"
    }
};

const RUTA_BASE_JUGADORES = "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/EXCEL%20JUGADORES%20POR%20EQUIPO%20HISTORICO";

const CONFIG_ENLACES_JUGADORES = {
    Premier: {
        "25_26": `${RUTA_BASE_JUGADORES}/INGLATERRA/Premier-league_25_26.csv`,
        "24_25": `${RUTA_BASE_JUGADORES}/INGLATERRA/Premier-league_24_25.csv`,
        "23_24": `${RUTA_BASE_JUGADORES}/INGLATERRA/Premier-league_23_24.csv`,
        "22_23": `${RUTA_BASE_JUGADORES}/INGLATERRA/Premier-league_22_23.csv`,
        "21_22": `${RUTA_BASE_JUGADORES}/INGLATERRA/Premier-league_21_22.csv`
    },
    Championship: {
        "25_26": `${RUTA_BASE_JUGADORES}/INGLATERRA%202/Championship_25_26.csv`,
        "24_25": `${RUTA_BASE_JUGADORES}/INGLATERRA%202/Championship_24_25.csv`,
        "23_24": `${RUTA_BASE_JUGADORES}/INGLATERRA%202/Championship_23_24.csv`,
        "22_23": `${RUTA_BASE_JUGADORES}/INGLATERRA%202/Championship_22_23.csv`,
        "21_22": `${RUTA_BASE_JUGADORES}/INGLATERRA%202/Championship_21_22.csv`
    },
    LaLiga: {
        "25_26": `${RUTA_BASE_JUGADORES}/ESPANA/Laliga_25_26.csv`,
        "24_25": `${RUTA_BASE_JUGADORES}/ESPANA/Laliga_24_25.csv`,
        "23_24": `${RUTA_BASE_JUGADORES}/ESPANA/Laliga_23_24.csv`,
        "22_23": `${RUTA_BASE_JUGADORES}/ESPANA/Laliga_22_23.csv`,
        "21_22": `${RUTA_BASE_JUGADORES}/ESPANA/Laliga_21_22.csv`
    },
    SerieA: {
        "25_26": `${RUTA_BASE_JUGADORES}/ITALIA/Serie-a_25_26.csv`,
        "24_25": `${RUTA_BASE_JUGADORES}/ITALIA/Serie-a_24_25.csv`,
        "23_24": `${RUTA_BASE_JUGADORES}/ITALIA/Serie-a_23_24.csv`,
        "22_23": `${RUTA_BASE_JUGADORES}/ITALIA/Serie-a_22_23.csv`,
        "21_22": `${RUTA_BASE_JUGADORES}/ITALIA/Serie-a_21_22.csv`
    },
    Bundesliga: {
        "25_26": `${RUTA_BASE_JUGADORES}/ALEMANIA/Bundesliga_25_26.csv`,
        "24_25": `${RUTA_BASE_JUGADORES}/ALEMANIA/Bundesliga_24_25.csv`,
        "23_24": `${RUTA_BASE_JUGADORES}/ALEMANIA/Bundesliga_23_24.csv`,
        "22_23": `${RUTA_BASE_JUGADORES}/ALEMANIA/Bundesliga_22_23.csv`,
        "21_22": `${RUTA_BASE_JUGADORES}/ALEMANIA/Bundesliga_21_22.csv`
    },
    Ligue1: {
        "25_26": `${RUTA_BASE_JUGADORES}/FRANCIA/Ligue-1_25_26.csv`,
        "24_25": `${RUTA_BASE_JUGADORES}/FRANCIA/Ligue-1_24_25.csv`,
        "23_24": `${RUTA_BASE_JUGADORES}/FRANCIA/Ligue-1_23_24.csv`,
        "22_23": `${RUTA_BASE_JUGADORES}/FRANCIA/Ligue-1_22_23.csv`,
        "21_22": `${RUTA_BASE_JUGADORES}/FRANCIA/Ligue-1_21_22.csv`
    },
    LigaPortugal: {
        "25_26": `${RUTA_BASE_JUGADORES}/PORTUGAL/Liga-portugal-betclic_25_26.csv`,
        "24_25": `${RUTA_BASE_JUGADORES}/PORTUGAL/Liga-portugal-betclic_24_25.csv`,
        "23_24": `${RUTA_BASE_JUGADORES}/PORTUGAL/Liga-portugal-betclic_23_24.csv`,
        "22_23": `${RUTA_BASE_JUGADORES}/PORTUGAL/Liga-portugal-betclic_22_23.csv`,
        "21_22": `${RUTA_BASE_JUGADORES}/PORTUGAL/Liga-portugal-betclic_21_22.csv`
    },
    Eredivisie: {
        "25_26": `${RUTA_BASE_JUGADORES}/HOLANDA/Eredivisie_25_26.csv`,
        "24_25": `${RUTA_BASE_JUGADORES}/HOLANDA/Eredivisie_24_25.csv`,
        "23_24": `${RUTA_BASE_JUGADORES}/HOLANDA/Eredivisie_23_24.csv`,
        "22_23": `${RUTA_BASE_JUGADORES}/HOLANDA/Eredivisie_22_23.csv`,
        "21_22": `${RUTA_BASE_JUGADORES}/HOLANDA/Eredivisie_21_22.csv`
    },
    Brasileirao: {
        "2025": `${RUTA_BASE_JUGADORES}/BRASIL/Brasileirao-serie-a_2025.csv`,
        "2024": `${RUTA_BASE_JUGADORES}/BRASIL/Brasileirao-serie-a_2024.csv`,
        "2023": `${RUTA_BASE_JUGADORES}/BRASIL/Brasileirao-serie-a_2023.csv`,
        "2022": `${RUTA_BASE_JUGADORES}/BRASIL/Brasileirao-serie-a_2022.csv`,
        "2021": `${RUTA_BASE_JUGADORES}/BRASIL/Brasileirao-serie-a_2021.csv`
    },
    Argentina: {
        // 2025_2 es Clausura en la carpeta histórica: se integra dentro del MISMO año 2025.
        "2025": [
            `${RUTA_BASE_JUGADORES}/ARGENTINA/Liga-profesional-de-futbol_2025.csv`,
            `${RUTA_BASE_JUGADORES}/ARGENTINA/Liga-profesional-de-futbol_2025_2.csv`
        ],
        "2024": `${RUTA_BASE_JUGADORES}/ARGENTINA/Liga-profesional-de-futbol_2024.csv`,
        "2023": `${RUTA_BASE_JUGADORES}/ARGENTINA/Liga-profesional-de-futbol_2023.csv`,
        "2022": `${RUTA_BASE_JUGADORES}/ARGENTINA/Liga-profesional-de-futbol_2022.csv`,
        "2021": `${RUTA_BASE_JUGADORES}/ARGENTINA/Liga-profesional-de-futbol_2021.csv`
    },
    MLS: {
        "2025": `${RUTA_BASE_JUGADORES}/ESTADOS%20UNIDOS/Mls_2025.csv`,
        "2024": `${RUTA_BASE_JUGADORES}/ESTADOS%20UNIDOS/Mls_2024.csv`,
        "2023": `${RUTA_BASE_JUGADORES}/ESTADOS%20UNIDOS/Mls_2023.csv`,
        "2022": `${RUTA_BASE_JUGADORES}/ESTADOS%20UNIDOS/Mls_2022.csv`,
        "2021": `${RUTA_BASE_JUGADORES}/ESTADOS%20UNIDOS/Mls_2021.csv`
    }
};

async function cargarDatasetJugadoresRanking(urlSpec, cacheBase = 'inca_rankings') {
    const urls = Array.isArray(urlSpec) ? urlSpec.filter(Boolean) : [urlSpec].filter(Boolean);
    if (!urls.length) return [];
    const bloques = await Promise.all(urls.map((url, indice) =>
        obtenerCSVRemoto(url, {
            cacheKey: `${cacheBase}_${indice}`,
            ttl: INCA_CONFIG.PLAYER_CACHE_TTL_MS
        })
    ));
    return bloques.flatMap(bloque => Array.isArray(bloque) ? bloque : []);
}


const ETIQUETAS_TEMPORADAS = Object.freeze({
    europeo: {
        "25_26": "2025 / 2026",
        "24_25": "2024 / 2025",
        "23_24": "2023 / 2024",
        "22_23": "2022 / 2023",
        "21_22": "2021 / 2022"
    },
    brasil: {
        "25_26": "2025",
        "24_25": "2024",
        "23_24": "2023",
        "22_23": "2022",
        "21_22": "2021"
    }
});

function actualizarEtiquetasTemporadaPorLiga(modulo = 'escaner') {
    const ligaId = modulo === 'pro' ? 'selectLigaPro' : 'selectLiga';
    const temporadaId = modulo === 'pro' ? 'selectTemporadaPro' : 'selectTemporada';

    const liga = document.getElementById(ligaId);
    const temporada = document.getElementById(temporadaId);
    if (!liga || !temporada) return;

    if (window.INCA_TITAN?.isTitanLeague?.(liga.value)) {
        window.INCA_TITAN.updateSeasonSelector(modulo);
        return;
    }

    const etiquetas = liga.value === 'Brasileirao'
        ? ETIQUETAS_TEMPORADAS.brasil
        : ETIQUETAS_TEMPORADAS.europeo;

    Array.from(temporada.options).forEach(option => {
        if (etiquetas[option.value]) option.textContent = etiquetas[option.value];
    });
}

async function cambiarLigaInca(modulo = 'escaner') {
    if (modulo === 'pro') {
        await cambiarLigaHistoricaV46();
        return;
    }
    if (window.INCA_TITAN?.enabled) {
        try {
            await window.INCA_TITAN.ensureReady();
            if (window.INCA_TITAN.updateSeasonSelector(modulo)) {
                if (modulo === 'pro') {
                    refrescarSelectCustom('selectTemporadaPro');
                    sincronizarSelectorLigaDataPro();
                }
                await cargarBaseDeDatos(modulo);
                return;
            }
        } catch (error) {
            console.warn('[INCA TITAN] Se mantiene el flujo legacy por fallo de catálogo.', error);
        }
    }
    actualizarEtiquetasTemporadaPorLiga(modulo);
    await cargarBaseDeDatos(modulo);
}

const LIMITES_MERCADO = {
    "Goles": { "Total Partido": { min: 0.5, max: 8.5, step: 1.0 }, "Total Equipo": { min: 0.5, max: 5.5, step: 1.0 }, "Cada Equipo (Ambos)": { min: 0.5, max: 3.5, step: 1.0 } },
    "Goles 1er Tiempo": { "Total Partido": { min: 0.5, max: 4.5, step: 1.0 }, "Total Equipo": { min: 0.5, max: 2.5, step: 1.0 } },
    "Goles 2do Tiempo": { "Total Partido": { min: 0.5, max: 4.5, step: 1.0 }, "Total Equipo": { min: 0.5, max: 2.5, step: 1.0 } },
    "Tiros Totales": { "Total Partido": { min: 21.5, max: 31.5, step: 1.0 }, "Total Equipo": { min: 7.5, max: 22.5, step: 1.0 } },
    "Tiros a Puerta": { "Total Partido": { min: 4.5, max: 12.5, step: 1.0 }, "Total Equipo": { min: 1.5, max: 8.5, step: 1.0 }, "Cada Equipo (Ambos)": { min: 1.5, max: 6.5, step: 1.0 } },
    "Fueras de Juego": { "Total Partido": { min: 0.5, max: 6.5, step: 1.0 }, "Total Equipo": { min: 0.5, max: 4.5, step: 1.0 }, "Cada Equipo (Ambos)": { min: 0.5, max: 4.5, step: 1.0 } },
    "Faltas": { "Total Partido": { min: 18.5, max: 34.5, step: 1.0 }, "Total Equipo": { min: 6.5, max: 17.5, step: 1.0 } },
    "Tarjetas": { "Total Partido": { min: 1.5, max: 7.5, step: 1.0 }, "Total Equipo": { min: 0.5, max: 1.5, step: 1.0 }, "Cada Equipo (Ambos)": { min: 0.5, max: 1.5, step: 1.0 } },
    "Puntos por Tarjetas": { "Total Partido": { min: 10, max: 100, step: 10 }, "Total Equipo": { min: 10, max: 60, step: 10 } },
    "Córners": { "Total Partido": { min: 6.5, max: 16.5, step: 1.0 }, "Total Equipo": { min: 2.5, max: 9.5, step: 1.0 }, "Cada Equipo (Ambos)": { min: 1.5, max: 5.5, step: 1.0 } },
    "Córners Handicap": { "Hándicap Equipo": { min: -4.5, max: 4.5, step: 1.0 } },
    "Saques de Meta": { "Total Partido": { min: 10.5, max: 20.5, step: 1.0 }, "Total Equipo": { min: 3.5, max: 10.5, step: 1.0 } },
    "Saques de Banda": { "Total Partido": { min: 25.5, max: 43.5, step: 1.0 }, "Total Equipo": { min: 10.5, max: 22.5, step: 1.0 } },
    "Pases": {
        "Total Partido": { kind:"manual", min:0, max:2500, step:0.5, default:799.5, placeholder:"Ej. 799.5" },
        "Total Equipo": { kind:"manual", min:0, max:1500, step:0.5, default:399.5, placeholder:"Ej. 399.5" },
        "Total Rival": { kind:"manual", min:0, max:1500, step:0.5, default:399.5, placeholder:"Ej. 399.5" }
    },
    "Tiros a Puerta Handicap": {
        "Hándicap Equipo": { kind:"enum", options:[
            {value:-5.5,label:"-5.5"},{value:-4.5,label:"-4.5"},{value:-3.5,label:"-3.5"},
            {value:-2.5,label:"-2.5"},{value:-1.5,label:"-1.5"},{value:-0.5,label:"-0.5"},
            {value:0.5,label:"+0.5"},{value:1.5,label:"+1.5"},{value:2.5,label:"+2.5"},
            {value:3.5,label:"+3.5"},{value:4.5,label:"+4.5"},{value:5.5,label:"+5.5"}
        ]}
    },
    "Entradas": { "Total Partido": { min: 20.5, max: 45.5, step: 1.0 }, "Total Equipo": { min: 8.5, max: 25.5, step: 1.0 } },
    "Resultado FT": { "Resultado Equipo": { kind:"enum", options:[
        { value:"WIN", label:"GANA" }, { value:"DRAW", label:"EMPATA" }, { value:"LOSS", label:"PIERDE" }
    ]}},
    "Resultado HT": { "Resultado Equipo": { kind:"enum", options:[
        { value:"WIN", label:"GANA AL DESCANSO" }, { value:"DRAW", label:"EMPATA AL DESCANSO" }, { value:"LOSS", label:"PIERDE AL DESCANSO" }
    ]}}
};


const LIMITES_MERCADO_PERIODO = Object.freeze({
    "Tiros Totales": {
        "1ST": {
            "Total Partido": { min:5.5, max:17.5, step:1.0 },
            "Total Equipo": { min:1.5, max:9.5, step:1.0 },
            "Total Rival": { min:1.5, max:9.5, step:1.0 }
        }
    },
    "Tiros a Puerta": {
        "1ST": {
            "Total Partido": { min:0.5, max:7.5, step:1.0 },
            "Total Equipo": { min:0.5, max:4.5, step:1.0 },
            "Total Rival": { min:0.5, max:4.5, step:1.0 },
            "Cada Equipo (Ambos)": { min:0.5, max:3.5, step:1.0 }
        }
    }
});

const MERCADOS_RESULTADO_ESCANER = new Set(["Resultado FT","Resultado HT"]);
const MERCADOS_PERIODO_COMPLETO = new Set(["Córners","Goles","Tarjetas"]);
const MERCADOS_PERIODO_FT_HT = new Set(["Tiros Totales","Tiros a Puerta"]);

function esMercadoResultadoEscaner(mercado = estadoApp.mercadoSeleccionado) {
    return MERCADOS_RESULTADO_ESCANER.has(String(mercado || ''));
}
function periodoForzadoResultado(mercado = estadoApp.mercadoSeleccionado) {
    return mercado === "Resultado HT" ? "1ST" : mercado === "Resultado FT" ? "ALL" : "";
}
function obtenerPeriodoEscanerActivo(mercado = estadoApp.mercadoSeleccionado) {
    const forced = periodoForzadoResultado(mercado);
    if (forced) return forced;
    const block = document.getElementById('bloquePeriodo');
    return block?.style.display !== 'none' ? (document.getElementById('selectTiempo')?.value || 'ALL') : 'ALL';
}
function obtenerLimitesMercadoActual() {
    const m = estadoApp.mercadoSeleccionado;
    const s = estadoApp.subMercadoSeleccionado;
    const p = obtenerPeriodoEscanerActivo(m);
    return LIMITES_MERCADO_PERIODO?.[m]?.[p]?.[s] || LIMITES_MERCADO?.[m]?.[s] || null;
}
function configurarSelectorPeriodoMercado(mercado) {
    const block = document.getElementById('bloquePeriodo');
    const select = document.getElementById('selectTiempo');
    if (!block || !select) return;
    const prev = select.value || 'ALL';

    if (MERCADOS_PERIODO_FT_HT.has(mercado)) {
        block.style.display = 'flex';
        rellenarSelectSeguro(select, [
            {value:'ALL',label:'FT (PARTIDO COMPLETO)'},
            {value:'1ST',label:'HT (PRIMER TIEMPO)'}
        ], ['ALL','1ST'].includes(prev) ? prev : 'ALL');
        refrescarSelectCustom('selectTiempo');
        return;
    }
    if (MERCADOS_PERIODO_COMPLETO.has(mercado)) {
        block.style.display = 'flex';
        rellenarSelectSeguro(select, [
            {value:'ALL',label:'FT (PARTIDO COMPLETO)'},
            {value:'1ST',label:'HT (PRIMER TIEMPO)'},
            {value:'2ND',label:'SH (SEGUNDO TIEMPO)'}
        ], ['ALL','1ST','2ND'].includes(prev) ? prev : 'ALL');
        refrescarSelectCustom('selectTiempo');
        return;
    }

    block.style.display = 'none';
    select.value = periodoForzadoResultado(mercado) || 'ALL';
    refrescarSelectCustom('selectTiempo');
}
function cambiarPeriodoEscaner() {
    actualizarDropdownLinea();
    actualizarEscaner();
}
function etiquetaSeleccionResultado(value) {
    return ({WIN:'GANA',DRAW:'EMPATA',LOSS:'PIERDE'})[String(value||'').toUpperCase()] || String(value||'');
}

// Total Rival usa exactamente los mismos rangos que Total Equipo en cada métrica.
Object.values(LIMITES_MERCADO).forEach((configuracion) => {
    if (configuracion?.["Total Equipo"] && !configuracion["Total Rival"]) {
        configuracion["Total Rival"] = { ...configuracion["Total Equipo"] };
    }
});

const NOMBRES_COLUMNAS = { "Resultado FT":"MARCADOR FT", "Resultado HT":"MARCADOR HT", "Goles": "GOLES", "Goles 1er Tiempo": "GOLES HT", "Goles 2do Tiempo": "GOLES 2T", "Tiros Totales": "TIROS", "Tiros a Puerta": "TIROS AL ARCO", "Tiros a Puerta Handicap": "HCP SOT", "Fueras de Juego": "OFFSIDES", "Faltas": "FALTAS", "Tarjetas": "TARJETAS", "Puntos por Tarjetas": "PUNTOS", "Córners": "CÓRNERS", "Córners Handicap": "HANDICAP", "Saques de Meta": "SAQ. META", "Saques de Banda": "LATERALES", "Pases": "PASES", "Entradas": "TACKLES" };

const DB_DICTIONARY = {
    "Goles": { match: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5], for: [0.5, 1.5, 2.5, 3.5], against: [0.5, 1.5, 2.5, 3.5] },
    "Córners": { match: [3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5], for: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5], against: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5] },
    "Tarjetas": { match: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5], for: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5], against: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5] },
    "Tiros Totales": { match: [10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5, 22.5, 23.5, 24.5, 25.5, 26.5, 27.5, 28.5, 29.5, 30.5, 31.5, 32.5, 33.5, 34.5, 35.5], for: [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5, 22.5, 23.5, 24.5, 25.5], against: [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5, 22.5, 23.5, 24.5, 25.5] },
    "Tiros a Puerta": { match: [3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5], for: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5], against: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5] },
    "Faltas": { match: [15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5, 22.5, 23.5, 24.5, 25.5, 26.5, 27.5, 28.5, 29.5, 30.5, 31.5, 32.5, 33.5, 34.5], for: [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5], against: [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5] },
    "Fueras de Juego": { match: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5], for: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5], against: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5] },
    "Saques de Meta": { match: [8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5, 22.5], for: [2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5], against: [2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5] },
    "Saques de Banda": { match: [25.5, 26.5, 27.5, 28.5, 29.5, 30.5, 31.5, 32.5, 33.5, 34.5, 35.5, 36.5, 37.5, 38.5, 39.5, 40.5, 41.5, 42.5, 43.5], for: [10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5, 22.5], against: [10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5, 22.5] },
    "Pases": { match: [], for: [], against: [] },
    "Entradas": { match: [20.5, 21.5, 22.5, 23.5, 24.5, 25.5, 26.5, 27.5, 28.5, 29.5, 30.5, 31.5, 32.5, 33.5, 34.5, 35.5, 36.5, 37.5, 38.5, 39.5, 40.5, 41.5, 42.5, 43.5, 44.5, 45.5], for: [8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5, 22.5, 23.5, 24.5, 25.5], against: [8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5, 22.5, 23.5, 24.5, 25.5] }
};

const MERCADOS_COMPLETOS_PRO = {
    "Match Result": { "nombre_es": "Resultado Final", "icon": "fa-gavel", "base": "Goles", "options": [{ "id": "Win", "label": "Gana Partido" }, { "id": "Unbeaten", "label": "Invicto (Gana o Empata)" }, { "id": "1st Half Result", "label": "Gana 1er Tiempo" }, { "id": "2nd Half Result", "label": "Gana 2do Tiempo" }] },
    "Both Teams To Score": { "nombre_es": "Ambos Anotan (BTTS)", "icon": "fa-retweet", "base": "Goles", "options": [{ "id": "BTTS Yes", "label": "Ambos Anotan: Sí" }, { "id": "BTTS 1st Half", "label": "Ambos Anotan: 1er Tiempo" }, { "id": "BTTS 2nd Half", "label": "Ambos Anotan: 2do Tiempo" }, { "id": "BTTS Both Halves", "label": "Ambos Anotan: Ambos Tiempos" }] },
    "Total Match Goals": { "nombre_es": "Goles Totales", "icon": "fa-futbol", "base": "Goles", "options": [{ "id": "Over 1.5 Match Goals", "label": "Más de 1.5 Goles" }, { "id": "Over 2.5 Match Goals", "label": "Más de 2.5 Goles" }, { "id": "Over 3.5 Match Goals", "label": "Más de 3.5 Goles" }, { "id": "2 or 3 Total Goals", "label": "2 o 3 Goles Totales" }] },
    "Team Goals For": { "nombre_es": "Goles a Favor", "icon": "fa-arrow-up-right-dots", "base": "Goles", "options": [{ "id": "Over 0.5 Goals For", "label": "Más de 0.5 a Favor" }, { "id": "Over 1.5 Goals For", "label": "Más de 1.5 a Favor" }, { "id": "Over 2.5 Goals For", "label": "Más de 2.5 a Favor" }] },
    "Team Goals Against": { "nombre_es": "Goles en Contra", "icon": "fa-shield-halved", "base": "Goles", "options": [{ "id": "Over 0.5 Goals Ag", "label": "Más de 0.5 en Contra" }, { "id": "Over 1.5 Goals Ag", "label": "Más de 1.5 en Contra" }, { "id": "Over 2.5 Goals Ag", "label": "Más de 2.5 en Contra" }] },
    "First Half Goals": { "nombre_es": "Goles 1er Tiempo", "icon": "fa-clock", "base": "Goles 1er Tiempo", "options": [{ "id": "Over 0.5 Goals 1H For", "label": "Más de 0.5 a Favor (1er Tiempo)" }, { "id": "Over 1.5 Goals 1H For", "label": "Más de 1.5 a Favor (1er Tiempo)" }, { "id": "Over 0.5 Goals 1H Ag", "label": "Más de 0.5 en Contra (1er Tiempo)" }, { "id": "Over 1.5 Goals 1H Ag", "label": "Más de 1.5 en Contra (1er Tiempo)" }, { "id": "Over 0.5 Goals 1H Total", "label": "Más de 0.5 Totales (1er Tiempo)" }, { "id": "Over 1.5 Goals 1H Total", "label": "Más de 1.5 Totales (1er Tiempo)" }] },
    "Second Half Goals": { "nombre_es": "Goles 2do Tiempo", "icon": "fa-clock", "base": "Goles 2do Tiempo", "options": [{ "id": "Over 0.5 Goals 2H For", "label": "Más de 0.5 a Favor (2do Tiempo)" }, { "id": "Over 1.5 Goals 2H For", "label": "Más de 1.5 a Favor (2do Tiempo)" }, { "id": "Over 0.5 Goals 2H Ag", "label": "Más de 0.5 en Contra (2do Tiempo)" }, { "id": "Over 1.5 Goals 2H Ag", "label": "Más de 1.5 en Contra (2do Tiempo)" }, { "id": "Over 0.5 Goals 2H Total", "label": "Más de 0.5 Totales (2do Tiempo)" }, { "id": "Over 1.5 Goals 2H Total", "label": "Más de 1.5 Totales (2do Tiempo)" }] },
    "Both Half Goals": { "nombre_es": "Goles Ambos Tiempos", "icon": "fa-futbol", "base": "Goles", "options": [{ "id": "Goal in Both Halves (total)", "label": "Gol en Ambos Tiempos" }, { "id": "Score Both Halves", "label": "Anota en Ambos Tiempos" }, { "id": "Concede Both Halves", "label": "Recibe en Ambos Tiempos" }] },
    "Total Match Corners": { "nombre_es": "Córners Totales", "icon": "fa-chess-board", "base": "Córners", "options": [{ "id": "Over 6.5 Total Corners", "label": "Más de 6.5 Córners" }, { "id": "Over 7.5 Total Corners", "label": "Más de 7.5 Córners" }, { "id": "Over 8.5 Total Corners", "label": "Más de 8.5 Córners" }, { "id": "Over 9.5 Total Corners", "label": "Más de 9.5 Córners" }, { "id": "Over 10.5 Total Corners", "label": "Más de 10.5 Córners" }, { "id": "Over 11.5 Total Corners", "label": "Más de 11.5 Córners" }, { "id": "Over 12.5 Total Corners", "label": "Más de 12.5 Córners" }] },
    "Team Corners For": { "nombre_es": "Córners a Favor", "icon": "fa-turn-up", "base": "Córners", "options": [{ "id": "Over 2.5 Corners For", "label": "Más de 2.5 a Favor" }, { "id": "Over 3.5 Corners For", "label": "Más de 3.5 a Favor" }, { "id": "Over 4.5 Corners For", "label": "Más de 4.5 a Favor" }, { "id": "Over 5.5 Corners For", "label": "Más de 5.5 a Favor" }, { "id": "Over 6.5 Corners For", "label": "Más de 6.5 a Favor" }] },
    "Team Corners Against": { "nombre_es": "Córners en Contra", "icon": "fa-turn-down", "base": "Córners", "options": [{ "id": "Over 2.5 Corners Ag", "label": "Más de 2.5 en Contra" }, { "id": "Over 3.5 Corners Ag", "label": "Más de 3.5 en Contra" }, { "id": "Over 4.5 Corners Ag", "label": "Más de 4.5 en Contra" }, { "id": "Over 5.5 Corners Ag", "label": "Más de 5.5 en Contra" }, { "id": "Over 6.5 Corners Ag", "label": "Más de 6.5 en Contra" }] },
    "Corners Handicap": { "nombre_es": "Hándicap Córners", "icon": "fa-scale-balanced", "base": "Córners", "options": [{ "id": "Most Corners (0)", "label": "Más Córners Ganados" }, { "id": "Corners Handicap +1", "label": "Hándicap Córners +1" }, { "id": "Corners Handicap +2", "label": "Hándicap Córners +2" }, { "id": "Corners Handicap -1", "label": "Hándicap Córners -1" }, { "id": "Corners Handicap -2", "label": "Hándicap Córners -2" }] },
    "First Half Corners": { "nombre_es": "Córners 1er Tiempo", "icon": "fa-clock", "base": "Córners", "options": [{ "id": "Over 2.5 Corners", "label": "Más de 2.5 Córners (1er Tiempo)" }, { "id": "Over 3.5 Corners", "label": "Más de 3.5 Córners (1er Tiempo)" }, { "id": "Over 4.5 Corners", "label": "Más de 4.5 Córners (1er Tiempo)" }, { "id": "Over 5.5 Corners", "label": "Más de 5.5 Córners (1er Tiempo)" }, { "id": "Over 6.5 Corners", "label": "Más de 6.5 Córners (1er Tiempo)" }, { "id": "Over 1.5 Corners For", "label": "Más de 1.5 a Favor (1er Tiempo)" }, { "id": "Over 2.5 Corners For", "label": "Más de 2.5 a Favor (1er Tiempo)" }, { "id": "Over 3.5 Corners For", "label": "Más de 3.5 a Favor (1er Tiempo)" }, { "id": "Over 1.5 Corners Ag", "label": "Más de 1.5 en Contra (1er Tiempo)" }, { "id": "Over 2.5 Corners Ag", "label": "Más de 2.5 en Contra (1er Tiempo)" }, { "id": "Over 3.5 Corners Ag", "label": "Más de 3.5 en Contra (1er Tiempo)" }] },
    "Second Half Corners": { "nombre_es": "Córners 2do Tiempo", "icon": "fa-clock", "base": "Córners", "options": [{ "id": "Over 3.5 Corners", "label": "Más de 3.5 Córners (2do Tiempo)" }, { "id": "Over 4.5 Corners", "label": "Más de 4.5 Córners (2do Tiempo)" }, { "id": "Over 5.5 Corners", "label": "Más de 5.5 Córners (2do Tiempo)" }, { "id": "Over 6.5 Corners", "label": "Más de 6.5 Córners (2do Tiempo)" }, { "id": "Over 1.5 Corners For", "label": "Más de 1.5 a Favor (2do Tiempo)" }, { "id": "Over 2.5 Corners For", "label": "Más de 2.5 a Favor (2do Tiempo)" }, { "id": "Over 3.5 Corners For", "label": "Más de 3.5 a Favor (2do Tiempo)" }, { "id": "Over 1.5 Corners Ag", "label": "Más de 1.5 en Contra (2do Tiempo)" }, { "id": "Over 2.5 Corners Ag", "label": "Más de 2.5 en Contra (2do Tiempo)" }, { "id": "Over 3.5 Corners Ag", "label": "Más de 3.5 en Contra (2do Tiempo)" }] },
    "Total Cards": { "nombre_es": "Tarjetas Totales", "icon": "fa-clone", "base": "Tarjetas", "options": [{ "id": "Over 1.5 Cards", "label": "Más de 1.5 Tarjetas" }, { "id": "Over 2.5 Cards", "label": "Más de 2.5 Tarjetas" }, { "id": "Over 3.5 Cards", "label": "Más de 3.5 Tarjetas" }, { "id": "Over 4.5 Cards", "label": "Más de 4.5 Tarjetas" }, { "id": "Over 5.5 Cards", "label": "Más de 5.5 Tarjetas" }, { "id": "Over 6.5 Cards", "label": "Más de 6.5 Tarjetas" }] },
    "Team Cards For": { "nombre_es": "Tarjetas a Favor", "icon": "fa-clone", "base": "Tarjetas", "options": [{ "id": "Over 0.5 Cards", "label": "Más de 0.5 Tarjetas" }, { "id": "Over 1.5 Cards", "label": "Más de 1.5 Tarjetas" }, { "id": "Over 2.5 Cards", "label": "Más de 2.5 Tarjetas" }, { "id": "Over 3.5 Cards", "label": "Más de 3.5 Tarjetas" }] },
    "Team Cards Against": { "nombre_es": "Tarjetas en Contra", "icon": "fa-clone", "base": "Tarjetas", "options": [{ "id": "Over 0.5 Cards", "label": "Más de 0.5 Tarjetas" }, { "id": "Over 1.5 Cards", "label": "Más de 1.5 Tarjetas" }, { "id": "Over 2.5 Tarjetas", "label": "Más de 2.5 Tarjetas" }, { "id": "Over 3.5 Cards", "label": "Más de 3.5 Tarjetas" }] },
    "Most Cards": { "nombre_es": "Más Tarjetas", "icon": "fa-clone", "base": "Tarjetas", "options": [{ "id": "Most Cards", "label": "Más Tarjetas" }] },
    "Each Team Cards": { "nombre_es": "Tarjetas Cada Equipo", "icon": "fa-clone", "base": "Tarjetas", "options": [{ "id": "Over 0.5 Cards", "label": "Más de 0.5 Tarjetas" }, { "id": "Over 1.5 Cards", "label": "Más de 1.5 Tarjetas" }, { "id": "Over 2.5 Cards", "label": "Más de 2.5 Tarjetas" }, { "id": "Over 3.5 Cards", "label": "Más de 3.5 Tarjetas" }] },
    "Total Booking Points": { "nombre_es": "Puntos por Tarjetas", "icon": "fa-coins", "base": "Puntos por Tarjetas", "options": [{ "id": "Over 15 Booking Points", "label": "Más de 15 Puntos" }, { "id": "Over 25 Booking Points", "label": "Más de 25 Puntos" }, { "id": "Over 35 Booking Points", "label": "Más de 35 Puntos" }, { "id": "Over 45 Booking Points", "label": "Más de 45 Puntos" }, { "id": "Over 55 Booking Points", "label": "Más de 55 Puntos" }, { "id": "Over 65 Booking Points", "label": "Más de 65 Puntos" }] },
    "Team Booking Points For": { "nombre_es": "Puntos Tarjetas a Favor", "icon": "fa-coins", "base": "Puntos por Tarjetas", "options": [{ "id": "Over 5 Booking Points", "label": "Más de 5 Puntos" }, { "id": "Over 15 Booking Points", "label": "Más de 15 Puntos" }, { "id": "Over 25 Booking Points", "label": "Más de 25 Puntos" }, { "id": "Over 35 Booking Points", "label": "Más de 35 Puntos" }] },
    "Team Booking Points Against": { "nombre_es": "Puntos Tarjetas en Contra", "icon": "fa-coins", "base": "Puntos por Tarjetas", "options": [{ "id": "Over 5 Booking Points", "label": "Más de 5 Puntos" }, { "id": "Over 15 Booking Points", "label": "Más de 15 Puntos" }, { "id": "Over 25 Booking Points", "label": "Más de 25 Puntos" }, { "id": "Over 35 Booking Points", "label": "Más de 35 Puntos" }] },
    "Each Team Booking Points": { "nombre_es": "Puntos Tarjetas Cada Equipo", "icon": "fa-coins", "base": "Puntos por Tarjetas", "options": [{ "id": "Over 5 Booking Points", "label": "Más de 5 Puntos Cada Equipo" }, { "id": "Over 15 Booking Points", "label": "Más de 15 Puntos Cada Equipo" }, { "id": "Over 25 Booking Points", "label": "Más de 25 Puntos Cada Equipo" }] },
    "Total Match Shots": { "nombre_es": "Tiros Totales", "icon": "fa-bullseye", "base": "Tiros Totales", "options": [{ "id": "Over 10.5 Shots", "label": "Más de 10.5 Tiros" }, { "id": "Over 11.5 Shots", "label": "Más de 11.5 Tiros" }, { "id": "Over 12.5 Shots", "label": "Más de 12.5 Tiros" }, { "id": "Over 13.5 Shots", "label": "Más de 13.5 Tiros" }, { "id": "Over 14.5 Shots", "label": "Más de 14.5 Tiros" }, { "id": "Over 15.5 Shots", "label": "Más de 15.5 Tiros" }, { "id": "Over 16.5 Shots", "label": "Más de 16.5 Tiros" }, { "id": "Over 17.5 Shots", "label": "Más de 17.5 Tiros" }, { "id": "Over 18.5 Shots", "label": "Más de 18.5 Tiros" }, { "id": "Over 19.5 Shots", "label": "Más de 19.5 Tiros" }, { "id": "Over 20.5 Shots", "label": "Más de 20.5 Tiros" }, { "id": "Over 21.5 Shots", "label": "Más de 21.5 Tiros" }, { "id": "Over 22.5 Shots", "label": "Más de 22.5 Tiros" }, { "id": "Over 23.5 Shots", "label": "Más de 23.5 Tiros" }, { "id": "Over 24.5 Shots", "label": "Más de 24.5 Tiros" }, { "id": "Over 25.5 Shots", "label": "Más de 25.5 Tiros" }, { "id": "Over 26.5 Shots", "label": "Más de 26.5 Tiros" }, { "id": "Over 27.5 Shots", "label": "Más de 27.5 Tiros" }, { "id": "Over 28.5 Shots", "label": "Más de 28.5 Tiros" }, { "id": "Over 29.5 Shots", "label": "Más de 29.5 Tiros" }, { "id": "Over 30.5 Shots", "label": "Más de 30.5 Tiros" }] },
    "Team Total Shots For": { "nombre_es": "Tiros a Favor", "icon": "fa-bullseye", "base": "Tiros Totales", "options": [{ "id": "Over 5.5 Shots", "label": "Más de 5.5 Tiros" }, { "id": "Over 6.5 Shots", "label": "Más de 6.5 Tiros" }, { "id": "Over 7.5 Shots", "label": "Más de 7.5 Tiros" }, { "id": "Over 8.5 Shots", "label": "Más de 8.5 Tiros" }, { "id": "Over 9.5 Shots", "label": "Más de 9.5 Tiros" }, { "id": "Over 10.5 Shots", "label": "Más de 10.5 Tiros" }, { "id": "Over 11.5 Shots", "label": "Más de 11.5 Tiros" }, { "id": "Over 12.5 Shots", "label": "Más de 12.5 Tiros" }, { "id": "Over 13.5 Shots", "label": "Más de 13.5 Tiros" }, { "id": "Over 14.5 Shots", "label": "Más de 14.5 Tiros" }, { "id": "Over 15.5 Shots", "label": "Más de 15.5 Tiros" }, { "id": "Over 16.5 Shots", "label": "Más de 16.5 Tiros" }, { "id": "Over 17.5 Shots", "label": "Más de 17.5 Tiros" }, { "id": "Over 18.5 Shots", "label": "Más de 18.5 Tiros" }, { "id": "Over 19.5 Shots", "label": "Más de 19.5 Tiros" }, { "id": "Over 20.5 Shots", "label": "Más de 20.5 Tiros" }] },
    "Team Total Shots Ag": { "nombre_es": "Tiros en Contra", "icon": "fa-bullseye", "base": "Tiros Totales", "options": [{ "id": "Over 5.5 Shots", "label": "Más de 5.5 Tiros" }, { "id": "Over 6.5 Shots", "label": "Más de 6.5 Tiros" }, { "id": "Over 7.5 Shots", "label": "Más de 7.5 Tiros" }, { "id": "Over 8.5 Shots", "label": "Más de 8.5 Tiros" }, { "id": "Over 9.5 Shots", "label": "Más de 9.5 Tiros" }, { "id": "Over 10.5 Shots", "label": "Más de 10.5 Tiros" }, { "id": "Over 11.5 Shots", "label": "Más de 11.5 Tiros" }, { "id": "Over 12.5 Shots", "label": "Más de 12.5 Tiros" }, { "id": "Over 13.5 Shots", "label": "Más de 13.5 Tiros" }, { "id": "Over 14.5 Shots", "label": "Más de 14.5 Tiros" }, { "id": "Over 15.5 Shots", "label": "Más de 15.5 Tiros" }, { "id": "Over 16.5 Shots", "label": "Más de 16.5 Tiros" }, { "id": "Over 17.5 Shots", "label": "Más de 17.5 Tiros" }, { "id": "Over 18.5 Shots", "label": "Más de 18.5 Tiros" }, { "id": "Over 19.5 Shots", "label": "Más de 19.5 Tiros" }, { "id": "Over 20.5 Shots", "label": "Más de 20.5 Tiros" }] },
    "Match Shots On Target": { "nombre_es": "Tiros al Arco Totales", "icon": "fa-crosshairs", "base": "Tiros a Puerta", "options": [{ "id": "Over 3.5 Shots on target", "label": "Más de 3.5 al Arco" }, { "id": "Over 4.5 Shots on target", "label": "Más de 4.5 al Arco" }, { "id": "Over 5.5 Shots on target", "label": "Más de 5.5 al Arco" }, { "id": "Over 6.5 Shots on target", "label": "Más de 6.5 al Arco" }, { "id": "Over 7.5 Shots on target", "label": "Más de 7.5 al Arco" }, { "id": "Over 8.5 Shots on target", "label": "Más de 8.5 al Arco" }, { "id": "Over 9.5 Shots on target", "label": "Más de 9.5 al Arco" }, { "id": "Over 10.5 Shots on target", "label": "Más de 10.5 al Arco" }, { "id": "Over 11.5 Shots on target", "label": "Más de 11.5 al Arco" }, { "id": "Over 12.5 Shots on target", "label": "Más de 12.5 al Arco" }, { "id": "Over 13.5 Shots on target", "label": "Más de 13.5 al Arco" }, { "id": "Over 14.5 Shots on target", "label": "Más de 14.5 al Arco" }, { "id": "Over 15.5 Shots on target", "label": "Más de 15.5 al Arco" }] },
    "Shots On Target For": { "nombre_es": "Tiros al Arco a Favor", "icon": "fa-crosshairs", "base": "Tiros a Puerta", "options": [{ "id": "Over 0.5 Shots on target", "label": "Más de 0.5 al Arco" }, { "id": "Over 1.5 Shots on target", "label": "Más de 1.5 al Arco" }, { "id": "Over 2.5 Shots on target", "label": "Más de 2.5 al Arco" }, { "id": "Over 3.5 Shots on target", "label": "Más de 3.5 al Arco" }, { "id": "Over 4.5 Shots on target", "label": "Más de 4.5 al Arco" }, { "id": "Over 5.5 Shots on target", "label": "Más de 5.5 al Arco" }, { "id": "Over 6.5 Shots on target", "label": "Más de 6.5 al Arco" }, { "id": "Over 7.5 Shots on target", "label": "Más de 7.5 al Arco" }, { "id": "Over 8.5 Shots on target", "label": "Más de 8.5 al Arco" }, { "id": "Over 9.5 Shots on target", "label": "Más de 9.5 al Arco" }, { "id": "Over 10.5 Shots on target", "label": "Más de 10.5 al Arco" }] },
    "Shots On Target Ag": { "nombre_es": "Tiros al Arco en Contra", "icon": "fa-crosshairs", "base": "Tiros a Puerta", "options": [{ "id": "Over 0.5 Shots on target", "label": "Más de 0.5 al Arco" }, { "id": "Over 1.5 Shots on target", "label": "Más de 1.5 al Arco" }, { "id": "Over 2.5 Shots on target", "label": "Más de 2.5 al Arco" }, { "id": "Over 3.5 Shots on target", "label": "Más de 3.5 al Arco" }, { "id": "Over 4.5 Shots on target", "label": "Más de 4.5 al Arco" }, { "id": "Over 5.5 Shots on target", "label": "Más de 5.5 al Arco" }, { "id": "Over 6.5 Shots on target", "label": "Más de 6.5 al Arco" }, { "id": "Over 7.5 Shots on target", "label": "Más de 7.5 al Arco" }, { "id": "Over 8.5 Shots on target", "label": "Más de 8.5 al Arco" }, { "id": "Over 9.5 Shots on target", "label": "Más de 9.5 al Arco" }, { "id": "Over 10.5 Shots on target", "label": "Más de 10.5 al Arco" }] },
    "Shots On Target Each Team": { "nombre_es": "Tiros al Arco Cada Equipo", "icon": "fa-crosshairs", "base": "Tiros a Puerta", "options": [{ "id": "Over 0.5 Shots on target", "label": "Más de 0.5 al Arco" }, { "id": "Over 1.5 Shots on target", "label": "Más de 1.5 al Arco" }, { "id": "Over 2.5 Shots on target", "label": "Más de 2.5 al Arco" }, { "id": "Over 3.5 Shots on target", "label": "Más de 3.5 al Arco" }, { "id": "Over 4.5 Shots on target", "label": "Más de 4.5 al Arco" }, { "id": "Over 5.5 Shots on target", "label": "Más de 5.5 al Arco" }, { "id": "Over 6.5 Shots on target", "label": "Más de 6.5 al Arco" }, { "id": "Over 7.5 Shots on target", "label": "Más de 7.5 al Arco" }] },
    "Match Total Fouls": { "nombre_es": "Faltas Totales", "icon": "fa-gavel", "base": "Faltas", "options": [{ "id": "Over 20.5 Fouls", "label": "Más de 20.5 Faltas" }, { "id": "Over 21.5 Fouls", "label": "Más de 21.5 Faltas" }, { "id": "Over 22.5 Fouls", "label": "Más de 22.5 Faltas" }, { "id": "Over 23.5 Fouls", "label": "Más de 23.5 Faltas" }, { "id": "Over 24.5 Fouls", "label": "Más de 24.5 Faltas" }, { "id": "Over 25.5 Fouls", "label": "Más de 25.5 Faltas" }, { "id": "Over 26.5 Fouls", "label": "Más de 26.5 Faltas" }, { "id": "Over 27.5 Fouls", "label": "Más de 27.5 Faltas" }, { "id": "Over 28.5 Fouls", "label": "Más de 28.5 Faltas" }, { "id": "Over 29.5 Fouls", "label": "Más de 29.5 Faltas" }, { "id": "Over 30.5 Fouls", "label": "Más de 30.5 Faltas" }] },
    "Fouls For": { "nombre_es": "Faltas a Favor", "icon": "fa-gavel", "base": "Faltas", "options": [{ "id": "Over 10.5 Fouls", "label": "Más de 10.5 Faltas" }, { "id": "Over 11.5 Fouls", "label": "Más de 11.5 Faltas" }, { "id": "Over 12.5 Fouls", "label": "Más de 12.5 Faltas" }, { "id": "Over 13.5 Fouls", "label": "Más de 13.5 Faltas" }, { "id": "Over 14.5 Fouls", "label": "Más de 14.5 Faltas" }, { "id": "Over 15.5 Fouls", "label": "Más de 15.5 Faltas" }, { "id": "Over 16.5 Fouls", "label": "Más de 16.5 Faltas" }, { "id": "Over 17.5 Fouls", "label": "Más de 17.5 Faltas" }, { "id": "Over 18.5 Fouls", "label": "Más de 18.5 Faltas" }, { "id": "Over 19.5 Fouls", "label": "Más de 19.5 Faltas" }, { "id": "Over 20.5 Fouls", "label": "Más de 20.5 Faltas" }] },
    "Fouls Against": { "nombre_es": "Faltas en Contra", "icon": "fa-gavel", "base": "Faltas", "options": [{ "id": "Over 10.5 Fouls", "label": "Más de 10.5 Faltas" }, { "id": "Over 11.5 Fouls", "label": "Más de 11.5 Faltas" }, { "id": "Over 12.5 Fouls", "label": "Más de 12.5 Faltas" }, { "id": "Over 13.5 Fouls", "label": "Más de 13.5 Faltas" }, { "id": "Over 14.5 Fouls", "label": "Más de 14.5 Faltas" }, { "id": "Over 15.5 Fouls", "label": "Más de 15.5 Faltas" }, { "id": "Over 16.5 Fouls", "label": "Más de 16.5 Faltas" }, { "id": "Over 17.5 Fouls", "label": "Más de 17.5 Faltas" }, { "id": "Over 18.5 Fouls", "label": "Más de 18.5 Faltas" }, { "id": "Over 19.5 Fouls", "label": "Más de 19.5 Faltas" }, { "id": "Over 20.5 Fouls", "label": "Más de 20.5 Faltas" }] },
    "Match Offsides": { "nombre_es": "Fueras de Juego", "icon": "fa-flag", "base": "Fueras de Juego", "options": [{ "id": "Over 1.5 Offsides", "label": "Más de 1.5 Fueras de Juego" }, { "id": "Over 2.5 Offsides", "label": "Más de 2.5 Fueras de Juego" }, { "id": "Over 3.5 Offsides", "label": "Más de 3.5 Fueras de Juego" }, { "id": "Over 4.5 Offsides", "label": "Más de 4.5 Fueras de Juego" }, { "id": "Over 5.5 Offsides", "label": "Más de 5.5 Fueras de Juego" }, { "id": "Over 6.5 Offsides", "label": "Más de 6.5 Fueras de Juego" }] },
    "Offsides For": { "nombre_es": "F. de Juego a Favor", "icon": "fa-flag", "base": "Fueras de Juego", "options": [{ "id": "Over 0.5 Offsides", "label": "Más de 0.5 Fueras de Juego" }, { "id": "Over 1.5 Offsides", "label": "Más de 1.5 Fueras de Juego" }, { "id": "Over 2.5 Offsides", "label": "Más de 2.5 Fueras de Juego" }] },
    "Offsides Against": { "nombre_es": "F. de J. en Contra", "icon": "fa-flag", "base": "Fueras de Juego", "options": [{ "id": "Over 0.5 Offsides", "label": "Más de 0.5 Fueras de Juego" }, { "id": "Over 1.5 Offsides", "label": "Más de 1.5 Fueras de Juego" }, { "id": "Over 2.5 Offsides", "label": "Más de 2.5 Fueras de Juego" }] },
    "Match Goal Kicks": { "nombre_es": "Saques de Meta", "icon": "fa-shoe-prints", "base": "Saques de Meta", "options": [{ "id": "Over 8.5 Goal Kicks", "label": "Más de 8.5 Saques de Meta" }, { "id": "Over 9.5 Goal Kicks", "label": "Más de 9.5 Saques de Meta" }, { "id": "Over 10.5 Goal Kicks", "label": "Más de 10.5 Saques de Meta" }, { "id": "Over 11.5 Goal Kicks", "label": "Más de 11.5 Saques de Meta" }, { "id": "Over 12.5 Goal Kicks", "label": "Más de 12.5 Saques de Meta" }, { "id": "Over 13.5 Goal Kicks", "label": "Más de 13.5 Saques de Meta" }, { "id": "Over 14.5 Goal Kicks", "label": "Más de 14.5 Saques de Meta" }, { "id": "Over 15.5 Goal Kicks", "label": "Más de 15.5 Saques de Meta" }, { "id": "Over 16.5 Goal Kicks", "label": "Más de 16.5 Saques de Meta" }, { "id": "Over 17.5 Goal Kicks", "label": "Más de 17.5 Goal Kicks" }, { "id": "Over 18.5 Goal Kicks", "label": "Más de 18.5 Saques de Meta" }, { "id": "Over 19.5 Goal Kicks", "label": "Más de 19.5 Saques de Meta" }] },
    "Goal Kicks For": { "nombre_es": "Saq. de Meta a Favor", "icon": "fa-shoe-prints", "base": "Saques de Meta", "options": [{ "id": "Over 3.5 Goal Kicks", "label": "Más de 3.5 Saques de Meta" }, { "id": "Over 4.5 Goal Kicks", "label": "Más de 4.5 Saques de Meta" }, { "id": "Over 5.5 Goal Kicks", "label": "Más de 5.5 Saques de Meta" }, { "id": "Over 6.5 Goal Kicks", "label": "Más de 6.5 Saques de Meta" }, { "id": "Over 7.5 Goal Kicks", "label": "Más de 7.5 Saques de Meta" }, { "id": "Over 8.5 Goal Kicks", "label": "Más de 8.5 Saques de Meta" }] },
    "Goal Kicks Against": { "nombre_es": "Saq. Meta en Contra", "icon": "fa-shoe-prints", "base": "Saques de Meta", "options": [{ "id": "Over 3.5 Goal Kicks", "label": "Más de 3.5 Saques de Meta" }, { "id": "Over 4.5 Goal Kicks", "label": "Más de 4.5 Saques de Meta" }, { "id": "Over 5.5 Goal Kicks", "label": "Más de 5.5 Saques de Meta" }, { "id": "Over 6.5 Goal Kicks", "label": "Más de 6.5 Saques de Meta" }, { "id": "Over 7.5 Goal Kicks", "label": "Más de 7.5 Saques de Meta" }, { "id": "Over 8.5 Goal Kicks", "label": "Más de 8.5 Saques de Meta" }] },
    "Match Throw Ins": { "nombre_es": "Saques de Banda", "icon": "fa-hands", "base": "Saques de Banda", "options": [{ "id": "Over 22.5 Throw Ins", "label": "Más de 22.5 Saques de Banda" }, { "id": "Over 23.5 Throw Ins", "label": "Más de 23.5 Saques de Banda" }, { "id": "Over 24.5 Throw Ins", "label": "Más de 24.5 Saques de Banda" }, { "id": "Over 25.5 Throw Ins", "label": "Más de 25.5 Saques de Banda" }, { "id": "Over 26.5 Throw Ins", "label": "Más de 26.5 Saques de Banda" }, { "id": "Over 27.5 Throw Ins", "label": "Más de 27.5 Saques de Banda" }, { "id": "Over 28.5 Throw Ins", "label": "Más de 28.5 Saques de Banda" }, { "id": "Over 29.5 Throw Ins", "label": "Más de 29.5 Saques de Banda" }, { "id": "Over 30.5 Throw Ins", "label": "Más de 30.5 Saques de Banda" }, { "id": "Over 31.5 Throw Ins", "label": "Más de 31.5 Saques de Banda" }, { "id": "Over 32.5 Throw Ins", "label": "Más de 32.5 Saques de Banda" }, { "id": "Over 33.5 Throw Ins", "label": "Más de 33.5 Saques de Banda" }, { "id": "Over 34.5 Throw Ins", "label": "Más de 34.5 Saques de Banda" }, { "id": "Over 35.5 Throw Ins", "label": "Más de 35.5 Saques de Banda" }, { "id": "Over 36.5 Throw Ins", "label": "Más de 36.5 Saques de Banda" }, { "id": "Over 37.5 Throw Ins", "label": "Más de 37.5 Saques de Banda" }, { "id": "Over 38.5 Throw Ins", "label": "Más de 38.5 Saques de Banda" }, { "id": "Over 39.5 Throw Ins", "label": "Más de 39.5 Saques de Banda" }] },
    "Throw Ins For": { "nombre_es": "Saq. Banda a Favor", "icon": "fa-hands", "base": "Saques de Banda", "options": [{ "id": "Over 7.5 Throw Ins", "label": "Más de 7.5 Saques de Banda" }, { "id": "Over 8.5 Throw Ins", "label": "Más de 8.5 Saques de Banda" }, { "id": "Over 9.5 Throw Ins", "label": "Más de 9.5 Saques de Banda" }, { "id": "Over 10.5 Throw Ins", "label": "Más de 10.5 Saques de Banda" }, { "id": "Over 11.5 Throw Ins", "label": "Más de 11.5 Saques de Banda" }, { "id": "Over 12.5 Throw Ins", "label": "Más de 12.5 Saques de Banda" }, { "id": "Over 13.5 Throw Ins", "label": "Más de 13.5 Saques de Banda" }, { "id": "Over 14.5 Throw Ins", "label": "Más de 14.5 Saques de Banda" }, { "id": "Over 15.5 Throw Ins", "label": "Más de 15.5 Saques de Banda" }, { "id": "Over 16.5 Throw Ins", "label": "Más de 16.5 Saques de Banda" }, { "id": "Over 17.5 Throw Ins", "label": "Más de 17.5 Saques de Banda" }, { "id": "Over 18.5 Throw Ins", "label": "Más de 18.5 Saques de Banda" }, { "id": "Over 19.5 Throw Ins", "label": "Más de 19.5 Saques de Banda" }, { "id": "Over 20.5 Throw Ins", "label": "Más de 20.5 Saques de Banda" }, { "id": "Over 21.5 Throw Ins", "label": "Más de 21.5 Saques de Banda" }, { "id": "Over 22.5 Throw Ins", "label": "Más de 22.5 Saques de Banda" }] },
    "Throw Ins Against": { "nombre_es": "Saq. Banda en Contra", "icon": "fa-hands", "base": "Saques de Banda", "options": [{ "id": "Over 7.5 Throw Ins", "label": "Más de 7.5 Saques de Banda" }, { "id": "Over 8.5 Throw Ins", "label": "Más de 8.5 Saques de Banda" }, { "id": "Over 9.5 Throw Ins", "label": "Más de 9.5 Saques de Banda" }, { "id": "Over 10.5 Throw Ins", "label": "Más de 10.5 Saques de Banda" }, { "id": "Over 11.5 Throw Ins", "label": "Más de 11.5 Saques de Banda" }, { "id": "Over 12.5 Throw Ins", "label": "Más de 12.5 Saques de Banda" }, { "id": "Over 13.5 Throw Ins", "label": "Más de 13.5 Saques de Banda" }, { "id": "Over 14.5 Throw Ins", "label": "Más de 14.5 Saques de Banda" }, { "id": "Over 15.5 Throw Ins", "label": "Más de 15.5 Saques de Banda" }, { "id": "Over 16.5 Throw Ins", "label": "Más de 16.5 Saques de Banda" }, { "id": "Over 17.5 Throw Ins", "label": "Más de 17.5 Saques de Banda" }, { "id": "Over 18.5 Throw Ins", "label": "Más de 18.5 Saques de Banda" }, { "id": "Over 19.5 Throw Ins", "label": "Más de 19.5 Saques de Banda" }, { "id": "Over 20.5 Throw Ins", "label": "Más de 20.5 Saques de Banda" }, { "id": "Over 21.5 Throw Ins", "label": "Más de 21.5 Saques de Banda" }, { "id": "Over 22.5 Throw Ins", "label": "Más de 22.5 Saques de Banda" }] },
    "Match Tackles": { "nombre_es": "Entradas Totales", "icon": "fa-user-ninja", "base": "Entradas", "options": [{ "id": "Over 22.5 Tackles", "label": "Más de 22.5 Entradas" }, { "id": "Over 23.5 Tackles", "label": "Más de 23.5 Entradas" }, { "id": "Over 24.5 Tackles", "label": "Más de 24.5 Entradas" }, { "id": "Over 25.5 Tackles", "label": "Más de 25.5 Entradas" }, { "id": "Over 26.5 Tackles", "label": "Más de 26.5 Entradas" }, { "id": "Over 27.5 Tackles", "label": "Más de 27.5 Entradas" }, { "id": "Over 28.5 Tackles", "label": "Más de 28.5 Entradas" }, { "id": "Over 29.5 Tackles", "label": "Más de 29.5 Entradas" }, { "id": "Over 30.5 Tackles", "label": "Más de 30.5 Entradas" }, { "id": "Over 31.5 Tackles", "label": "Más de 31.5 Entradas" }, { "id": "Over 32.5 Tackles", "label": "Más de 32.5 Entradas" }, { "id": "Over 33.5 Tackles", "label": "Más de 33.5 Entradas" }, { "id": "Over 34.5 Tackles", "label": "Más de 34.5 Entradas" }, { "id": "Over 35.5 Tackles", "label": "Más de 35.5 Entradas" }, { "id": "Over 36.5 Tackles", "label": "Más de 36.5 Entradas" }, { "id": "Over 37.5 Tackles", "label": "Más de 37.5 Entradas" }, { "id": "Over 38.5 Tackles", "label": "Más de 38.5 Entradas" }, { "id": "Over 39.5 Tackles", "label": "Más de 39.5 Entradas" }] },
    "Tackles For": { "nombre_es": "Entradas a Favor", "icon": "fa-user-ninja", "base": "Entradas", "options": [{ "id": "Over 7.5 Tackles", "label": "Más de 7.5 Entradas" }, { "id": "Over 8.5 Tackles", "label": "Más de 8.5 Entradas" }, { "id": "Over 9.5 Tackles", "label": "Más de 9.5 Entradas" }, { "id": "Over 10.5 Tackles", "label": "Más de 10.5 Entradas" }, { "id": "Over 11.5 Tackles", "label": "Más de 11.5 Entradas" }, { "id": "Over 12.5 Tackles", "label": "Más de 12.5 Entradas" }, { "id": "Over 13.5 Tackles", "label": "Más de 13.5 Entradas" }, { "id": "Over 14.5 Tackles", "label": "Más de 14.5 Entradas" }, { "id": "Over 15.5 Tackles", "label": "Más de 15.5 Entradas" }, { "id": "Over 16.5 Tackles", "label": "Más de 16.5 Entradas" }, { "id": "Over 17.5 Tackles", "label": "Más de 17.5 Entradas" }, { "id": "Over 18.5 Tackles", "label": "Más de 18.5 Entradas" }, { "id": "Over 19.5 Tackles", "label": "Más de 19.5 Entradas" }, { "id": "Over 20.5 Tackles", "label": "Más de 20.5 Entradas" }, { "id": "Over 21.5 Tackles", "label": "Más de 21.5 Entradas" }, { "id": "Over 22.5 Tackles", "label": "Más de 22.5 Entradas" }] },
    "Tackles Against": { "nombre_es": "Entradas en Contra", "icon": "fa-user-ninja", "base": "Entradas", "options": [{ "id": "Over 7.5 Tackles", "label": "Más de 7.5 Entradas" }, { "id": "Over 8.5 Tackles", "label": "Más de 8.5 Entradas" }, { "id": "Over 9.5 Tackles", "label": "Más de 9.5 Entradas" }, { "id": "Over 10.5 Tackles", "label": "Más de 10.5 Entradas" }, { "id": "Over 11.5 Tackles", "label": "Más de 11.5 Entradas" }, { "id": "Over 12.5 Tackles", "label": "Más de 12.5 Entradas" }, { "id": "Over 13.5 Tackles", "label": "Más de 13.5 Entradas" }, { "id": "Over 14.5 Tackles", "label": "Más de 14.5 Entradas" }, { "id": "Over 15.5 Tackles", "label": "Más de 15.5 Entradas" }, { "id": "Over 16.5 Tackles", "label": "Más de 16.5 Entradas" }, { "id": "Over 17.5 Tackles", "label": "Más de 17.5 Entradas" }, { "id": "Over 18.5 Tackles", "label": "Más de 18.5 Entradas" }, { "id": "Over 19.5 Tackles", "label": "Más de 19.5 Entradas" }, { "id": "Over 20.5 Tackles", "label": "Más de 20.5 Entradas" }, { "id": "Over 21.5 Tackles", "label": "Más de 21.5 Entradas" }, { "id": "Over 22.5 Tackles", "label": "Más de 22.5 Entradas" }] }
};


function opcionesOverPro(min,max,token,label) {
    const out=[];
    for(let x=min;x<=max+1e-9;x+=1){
        const n=Number(x.toFixed(1));
        out.push({id:`Over ${n} ${token}`,label:`Más de ${n} ${label}`});
    }
    return out;
}

function opcionesBookingPointsPro(min,max,step=10,label='Puntos') {
    const out=[];
    for(let value=min;value<=max;value+=step){
        out.push({id:`Over ${value} Booking Points`,label:`Más de ${value} ${label}`});
    }
    return out;
}
function opcionesHandicapSOTPro() {
    return [-5.5,-4.5,-3.5,-2.5,-1.5,-0.5,0.5,1.5,2.5,3.5,4.5,5.5]
        .map(h=>({id:`Shots On Target Handicap ${h>0?'+':''}${h}`,label:`Hándicap Tiros a Puerta ${h>0?'+':''}${h}`}));
}

MERCADOS_COMPLETOS_PRO["Total Booking Points"].options = opcionesBookingPointsPro(10,100,10,"Puntos");
MERCADOS_COMPLETOS_PRO["Team Booking Points For"].options = opcionesBookingPointsPro(10,60,10,"Puntos");
MERCADOS_COMPLETOS_PRO["Team Booking Points Against"].options = opcionesBookingPointsPro(10,60,10,"Puntos");
MERCADOS_COMPLETOS_PRO["Each Team Booking Points"].options = opcionesBookingPointsPro(10,50,10,"Puntos Cada Equipo");

MERCADOS_COMPLETOS_PRO["Shots On Target Handicap"] = {
    nombre_es:"Hándicap Tiros a Puerta",
    icon:"fa-scale-balanced",
    base:"Tiros a Puerta",
    options:opcionesHandicapSOTPro()
};

MERCADOS_COMPLETOS_PRO["Passes Total"] = {
    nombre_es:"Pases · Total Partido",
    icon:"fa-arrows-left-right",
    base:"Pases",
    manualLine:true,
    passMode:"total",
    options:[{id:"Manual Passes Total",label:"Línea manual Betano · Total Partido"}]
};
MERCADOS_COMPLETOS_PRO["Passes For"] = {
    nombre_es:"Pases · Equipo",
    icon:"fa-arrows-left-right",
    base:"Pases",
    manualLine:true,
    passMode:"for",
    options:[{id:"Manual Passes For",label:"Línea manual Betano · Equipo"}]
};
MERCADOS_COMPLETOS_PRO["Passes Against"] = {
    nombre_es:"Pases · Rival",
    icon:"fa-arrows-left-right",
    base:"Pases",
    manualLine:true,
    passMode:"against",
    options:[{id:"Manual Passes Against",label:"Línea manual Betano · Rival"}]
};

MERCADOS_COMPLETOS_PRO["Match Total Fouls"].options = opcionesOverPro(20.5,34.5,"Fouls","Faltas");
MERCADOS_COMPLETOS_PRO["Fouls For"].options = opcionesOverPro(10.5,17.5,"Fouls","Faltas");
MERCADOS_COMPLETOS_PRO["Fouls Against"].options = opcionesOverPro(10.5,17.5,"Fouls","Faltas");
MERCADOS_COMPLETOS_PRO["Match Throw Ins"].options = opcionesOverPro(22.5,43.5,"Throw Ins","Saques de Banda");
MERCADOS_COMPLETOS_PRO["Throw Ins For"].options = opcionesOverPro(7.5,22.5,"Throw Ins","Saques de Banda");
MERCADOS_COMPLETOS_PRO["Throw Ins Against"].options = opcionesOverPro(7.5,22.5,"Throw Ins","Saques de Banda");

MERCADOS_COMPLETOS_PRO["Match Result"].nombre_es="Resultado FT / HT";
MERCADOS_COMPLETOS_PRO["Match Result"].options=[
 {id:"FT Win",label:"FT · Gana"},{id:"FT Draw",label:"FT · Empata"},{id:"FT Loss",label:"FT · Pierde"},
 {id:"HT Win",label:"HT · Gana al descanso"},{id:"HT Draw",label:"HT · Empata al descanso"},{id:"HT Loss",label:"HT · Pierde al descanso"}
];
MERCADOS_COMPLETOS_PRO["First Half Total Shots"]={nombre_es:"Tiros Totales · HT",icon:"fa-clock",base:"Tiros Totales",options:opcionesOverPro(5.5,17.5,"Shots 1H","Tiros · HT")};
MERCADOS_COMPLETOS_PRO["First Half Team Shots For"]={nombre_es:"Tiros Equipo · HT",icon:"fa-clock",base:"Tiros Totales",options:opcionesOverPro(1.5,9.5,"Shots For 1H","Tiros Equipo · HT")};
MERCADOS_COMPLETOS_PRO["First Half Team Shots Against"]={nombre_es:"Tiros Rival · HT",icon:"fa-clock",base:"Tiros Totales",options:opcionesOverPro(1.5,9.5,"Shots Against 1H","Tiros Rival · HT")};
MERCADOS_COMPLETOS_PRO["First Half Shots On Target"]={nombre_es:"Tiros a Puerta · HT",icon:"fa-clock",base:"Tiros a Puerta",options:opcionesOverPro(0.5,7.5,"Shots on target 1H","a Puerta · HT")};
MERCADOS_COMPLETOS_PRO["First Half Team Shots On Target"]={nombre_es:"Tiros a Puerta Equipo · HT",icon:"fa-clock",base:"Tiros a Puerta",options:opcionesOverPro(0.5,4.5,"Shots on target For 1H","a Puerta Equipo · HT")};
MERCADOS_COMPLETOS_PRO["First Half Rival Shots On Target"]={nombre_es:"Tiros a Puerta Rival · HT",icon:"fa-clock",base:"Tiros a Puerta",options:opcionesOverPro(0.5,4.5,"Shots on target Against 1H","a Puerta Rival · HT")};

let estadoApp = {
    vistaActiva: 'escaner', 
    mercadoSeleccionado: "Goles",
    subMercadoSeleccionado: "Total Partido",
    memoriaLineas: {}, 
    logosDict: {},
    diccionarioCaras: new Map(),
    carasMapCargado: false,
    promesaCarasMap: null,
    promesaCargaJugadores: null,
    
    escaner: { matrizCrudaCSV: [], datosProcesados: {}, datosPartidosFull: [], diagnostico: {} },
    pro: { matrizCrudaCSV: [], datosProcesados: {}, datosPartidosFull: [], diagnostico: {}, datasetCompleto: [], tablePhases: [], phaseContextKey: '' },
    solicitudes: { escaner: 0, pro: 0, jugadores: 0, rankings: 0 },
    
    jugadores: { 
        matrizCrudaCSV: [], 
        datosAgrupados: {}, 
        bioData: {},
        periodos: {},
        playerMeta: {},
        listaNombres: [], 
        listaNombresFiltrada: [], 
        cargado: false, 
        modoPj: 'resumen',
        seleccionado: null,
        categoriaActiva: 'TODOS',
        ultimoPjTorneos: null
    },

    rankings: {
        matrizCrudaCSV: [],
        filasPreparadas: [],
        ligaActual: null,
        temporadaActual: null,
        diccionarioActual: [],
        ultimoCalculo: null,
        renderToken: 0
    },

    carasRemotas: {
        cache: new Map(),
        promesas: new Map(),
        cola: [],
        activas: 0,
        maxConcurrentes: 3
    },

    dbState: {
        split: 'ALL', tab: 'Resumen', matrizMetric: 'Goles',
        selectedCategory: null, selectedSubId: null, openCategories: [], phaseKey: '',
        manualPassLine: 399.5,
        passLines: { match: 799.5, for: 399.5, against: 399.5 }
    } 
};

// ==========================================================================
// 1. FUNCIONES GLOBALES Y MANEJO DE UI
// ==========================================================================

const CONFIG_CARAS = Object.freeze({
    MAPAS: [
        // GitHub Raw primero: refleja los cambios del repositorio más rápido.
        'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/IncaStats_Caras/rutas_imagenes.json',
        'https://cdn.jsdelivr.net/gh/a10nsosc2007-ui/IncaStats-Data@main/IncaStats_Caras/rutas_imagenes.json',
        'IncaStats_Caras/rutas_imagenes.json',
        'rutas_imagenes.json'
    ],
    CDN_BASE: 'https://cdn.jsdelivr.net/gh/a10nsosc2007-ui/IncaStats-Data@main/',
    RAW_BASE: 'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/',
    // V1.041 · paquete HD actualizado por BAT. Se prueba antes del mapa legacy.
    CURRENT_FACES_BASE: 'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/TITAN_PLAYERS_FACES_CURRENT/web_1024/',
    CURRENT_FACES_REV: String(Math.floor(Date.now()/300000)),
    TOTAL_ESPERADO: 13251,
    CACHE_KEY: 'inca_caras_mapa_v14',
    CACHE_TTL_MS: 24 * 60 * 60 * 1000,
    IDS_MAPAS: [
        'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/IncaStats_Caras/jugadores_ids_9514.json',
        'https://cdn.jsdelivr.net/gh/a10nsosc2007-ui/IncaStats-Data@main/IncaStats_Caras/jugadores_ids_9514.json',
        'jugadores_ids.json'
    ],
    IDS_CACHE_KEY: 'inca_caras_ids_v14'
});

const COLUMNAS_ID_JUGADOR = Object.freeze([
    'ID_Jugador', 'ID Jugador', 'Id_Jugador', 'Id Jugador',
    'Jugador_ID', 'Jugador ID', 'jugador_id', 'jugadorId',
    'Player_ID', 'Player ID', 'player_id', 'playerId', 'PlayerId',
    'Sofascore_ID', 'Sofascore ID', 'SofaScore_ID', 'SofaScore ID',
    'ID_Sofascore', 'ID SofaScore', 'Sofa_ID', 'Sofa ID',
    'Athlete_ID', 'Athlete ID', 'ID_Atleta', 'ID Atleta',
    'Id', 'ID', 'id'
]);

function extraerIdDesdeTexto(valor) {
    const texto = normalizarTexto(valor);
    if (!texto) return '';
    const patrones = [
        /(?:player|jugador|athlete)[\/_-]?(?:id)?[\/:=-]?(\d{2,})/i,
        /\/(\d{2,})\.(?:png|jpe?g|webp)(?:\?|$)/i,
        /(?:^|[^\d])(\d{2,})(?:\.0+)?(?:$|[^\d])/i
    ];
    for (const patron of patrones) {
        const match = texto.match(patron);
        if (match?.[1]) return normalizarIdJugador(match[1]);
    }
    return '';
}

function obtenerIdJugadorFila(fila = {}, fallback = '') {
    const directo = normalizarIdJugador(obtenerValor(
        fila,
        COLUMNAS_ID_JUGADOR,
        fila?.idJugador ?? fila?.playerId ?? fila?.player_id ?? fallback
    ));
    if (directo) return directo;

    // Detecta encabezados no previstos como player.id, id_player, sofaPlayerId, etc.
    for (const [clave, valor] of Object.entries(fila || {})) {
        const cabecera = claveTexto(clave).replace(/\s+/g, '_');
        const pareceIdJugador = cabecera === 'ID' ||
            /(?:ID.*(?:JUGADOR|PLAYER|ATHLETE|SOFA)|(?:JUGADOR|PLAYER|ATHLETE|SOFA).*ID)/.test(cabecera);
        if (!pareceIdJugador) continue;
        const id = normalizarIdJugador(valor);
        if (id) return id;
    }

    // Último respaldo: extraer el ID de una URL de foto o perfil.
    for (const clave of ['Foto_URL', 'Foto', 'Imagen_URL', 'Photo_URL', 'Photo', 'URL', 'Perfil_URL']) {
        const id = extraerIdDesdeTexto(fila?.[clave]);
        if (id) return id;
    }
    return '';
}

function registrarIndiceJugador(fila = {}) {
    const id = obtenerIdJugadorFila(fila);
    const nombre = normalizarTexto(obtenerValor(fila, ['Jugador', 'Nombre', 'Player'], ''));
    const equipo = normalizarTexto(obtenerValor(fila, ['Equipo', 'Club', 'Team'], ''));
    if (!id || !nombre) return;

    if (!(estadoApp.indiceIdsPorNombre instanceof Map)) estadoApp.indiceIdsPorNombre = new Map();
    const clave = claveTexto(nombre);
    if (!estadoApp.indiceIdsPorNombre.has(clave)) estadoApp.indiceIdsPorNombre.set(clave, []);
    const lista = estadoApp.indiceIdsPorNombre.get(clave);
    if (!lista.some(item => item.id === id && equiposEquivalentes(item.equipo, equipo))) lista.push({ id, equipo });
}


function incorporarIndiceIdsGlobal(payload) {
    const jugadores = payload?.jugadores && typeof payload.jugadores === 'object'
        ? payload.jugadores
        : payload;

    if (!(estadoApp.aliasCompactoIds instanceof Map)) estadoApp.aliasCompactoIds = new Map();
    if (!(estadoApp.aliasTokensIds instanceof Map)) estadoApp.aliasTokensIds = new Map();

    const aliasCompacto = payload?.alias_compacto && typeof payload.alias_compacto === 'object'
        ? payload.alias_compacto
        : {};
    for (const [alias, idOriginal] of Object.entries(aliasCompacto)) {
        const id = normalizarIdJugador(idOriginal);
        if (alias && id) estadoApp.aliasCompactoIds.set(String(alias), id);
    }

    const aliasTokens = payload?.alias_tokens && typeof payload.alias_tokens === 'object'
        ? payload.alias_tokens
        : {};
    for (const [firma, idOriginal] of Object.entries(aliasTokens)) {
        const id = normalizarIdJugador(idOriginal);
        if (firma && id) estadoApp.aliasTokensIds.set(String(firma), id);
    }

    if (!jugadores || typeof jugadores !== 'object') return 0;
    if (!(estadoApp.indiceIdsPorNombre instanceof Map)) estadoApp.indiceIdsPorNombre = new Map();

    let agregados = 0;
    for (const [nombreClaveOriginal, infoOriginal] of Object.entries(jugadores)) {
        const nombreClave = claveTexto(nombreClaveOriginal);
        if (!nombreClave) continue;

        const info = infoOriginal && typeof infoOriginal === 'object'
            ? infoOriginal
            : { ids: [infoOriginal], preferido: infoOriginal };

        const ids = Array.isArray(info.ids)
            ? info.ids
            : [info.preferido || info.id || infoOriginal];

        const preferido = normalizarIdJugador(info.preferido || info.id || ids[0] || '');
        if (!estadoApp.indiceIdsPorNombre.has(nombreClave)) {
            estadoApp.indiceIdsPorNombre.set(nombreClave, []);
        }

        const lista = estadoApp.indiceIdsPorNombre.get(nombreClave);
        for (const idOriginal of ids) {
            const id = normalizarIdJugador(idOriginal);
            if (!id) continue;
            if (!lista.some(item => item.id === id)) {
                lista.push({ id, equipo: '', preferido: id === preferido });
                agregados++;
            }
        }

        if (preferido) {
            lista.sort((a, b) => Number(Boolean(b.preferido)) - Number(Boolean(a.preferido)));
        }
    }
    return agregados;
}

function leerIndiceIdsCache() {
    try {
        const raw = localStorage.getItem(CONFIG_CARAS.IDS_CACHE_KEY);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        if (!cache?.payload || Date.now() - Number(cache.guardado || 0) > CONFIG_CARAS.CACHE_TTL_MS) {
            return null;
        }
        return cache.payload;
    } catch (_) {
        return null;
    }
}

async function cargarIndiceIdsGlobal() {
    if (estadoApp.indiceIdsGlobalCargado) return estadoApp.indiceIdsPorNombre;
    if (estadoApp.promesaIndiceIdsGlobal) return estadoApp.promesaIndiceIdsGlobal;

    estadoApp.promesaIndiceIdsGlobal = (async () => {
        const cache = leerIndiceIdsCache();
        if (cache) {
            const n = incorporarIndiceIdsGlobal(cache);
            if (n > 0) {
                estadoApp.indiceIdsGlobalCargado = true;
                console.info(`[INCA IDS] ${n} relaciones cargadas desde caché.`);
                return estadoApp.indiceIdsPorNombre;
            }
        }

        let ultimoError = null;
        for (const url of CONFIG_CARAS.IDS_MAPAS) {
            try {
                const response = await fetch(url, {
                    cache: 'no-cache',
                    headers: { Accept: 'application/json' }
                });
                if (!response.ok) throw new Error(`HTTP ${response.status} al descargar ${url}`);
                const payload = await response.json();
                const n = incorporarIndiceIdsGlobal(payload);
                if (!n) throw new Error('El índice de nombres no produjo relaciones válidas.');
                try {
                    localStorage.setItem(
                        CONFIG_CARAS.IDS_CACHE_KEY,
                        JSON.stringify({ guardado: Date.now(), payload })
                    );
                } catch (_) {}
                estadoApp.indiceIdsGlobalCargado = true;
                console.info(`[INCA IDS] ${n} relaciones cargadas desde ${url}`);
                return estadoApp.indiceIdsPorNombre;
            } catch (error) {
                ultimoError = error;
                console.warn(`[INCA IDS] Falló ${url}`, error);
            }
        }

        estadoApp.indiceIdsGlobalCargado = false;
        throw ultimoError || new Error('No se pudo cargar jugadores_ids.json.');
    })();

    try {
        return await estadoApp.promesaIndiceIdsGlobal;
    } catch (error) {
        console.error('[INCA IDS] No se pudo inicializar el índice global.', error);
        return estadoApp.indiceIdsPorNombre;
    } finally {
        estadoApp.promesaIndiceIdsGlobal = null;
    }
}


function generarClavesAlternativasJugador(nombre) {
    const base = claveTexto(nombre);
    if (!base) return [];

    const reemplazos = [
        base,
        base.replace(/\bWORD\b/g, 'WARD'),
        base.replace(/\bPROUSE\b/g, 'PROWSE'),
        base.replace(/\bHEUNGMIN\b/g, 'HEUNG MIN'),
        base.replace(/\bSONNY\b/g, 'SON HEUNG MIN')
    ];

    const salida = new Set();
    for (const variante of reemplazos) {
        const limpia = variante.replace(/\s+/g, ' ').trim();
        if (!limpia) continue;
        salida.add(limpia);
        const partes = limpia.split(' ').filter(Boolean);
        if (partes.length > 1) {
            salida.add([...partes].reverse().join(' '));
            salida.add([...partes.slice(1), partes[0]].join(' '));
            salida.add([partes[partes.length - 1], ...partes.slice(0, -1)].join(' '));
        }
    }
    return [...salida];
}

function resolverIdDesdeMaestro(nombre) {
    const claves = generarClavesAlternativasJugador(nombre);
    const nombreClave = claves[0] || '';
    if (!nombreClave) return '';

    for (const clave of claves) {
        const candidatos = estadoApp.indiceIdsPorNombre instanceof Map
            ? estadoApp.indiceIdsPorNombre.get(clave) || []
            : [];

        const preferido = candidatos.find(item => item.preferido && item.id);
        if (preferido) return preferido.id;
        if (candidatos.length) return candidatos[0].id;

        const compacto = clave.replace(/\s+/g, '');
        if (estadoApp.aliasCompactoIds instanceof Map) {
            const porCompacto = estadoApp.aliasCompactoIds.get(compacto) || '';
            if (porCompacto) return porCompacto;
        }

        const firmaTokens = clave
            .split(/\s+/)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b))
            .join('|');

        if (estadoApp.aliasTokensIds instanceof Map) {
            const porTokens = estadoApp.aliasTokensIds.get(firmaTokens) || '';
            if (porTokens) return porTokens;
        }
    }

    return '';
}

function inferirIdJugador(nombre, equipo = '') {
    const nombreClave = claveTexto(nombre);
    const idMaestro = resolverIdDesdeMaestro(nombre);
    if (idMaestro) return idMaestro;
    if (!nombreClave) return '';
    const candidatos = [];
    const vistos = new Set();
    const agregar = (id, eq = '') => {
        const limpio = normalizarIdJugador(id);
        if (!limpio || vistos.has(limpio)) return;
        vistos.add(limpio);
        candidatos.push({ id: limpio, equipo: normalizarTexto(eq) });
    };

    const indice = estadoApp.indiceIdsPorNombre instanceof Map
        ? estadoApp.indiceIdsPorNombre.get(nombreClave) || [] : [];
    indice.forEach(item => agregar(item.id, item.equipo));
    Object.values(estadoApp.jugadores?.playerMeta || {}).forEach(meta => {
        if (meta?.nombreNormalizado === nombreClave) agregar(meta.id, meta.equipo);
    });

    const porEquipo = candidatos.find(item => item.equipo && equiposEquivalentes(item.equipo, equipo));
    if (porEquipo) return porEquipo.id;

    const indiceOriginal = estadoApp.indiceIdsPorNombre instanceof Map
        ? estadoApp.indiceIdsPorNombre.get(nombreClave) || []
        : [];
    const preferido = indiceOriginal.find(item => item.preferido && item.id);
    if (preferido) return preferido.id;

    return candidatos.length === 1 ? candidatos[0].id : '';
}


function obtenerMetaGlobalJugador(nombre, equipo = '') {
    const nombreClave = claveTexto(nombre);
    const equipoTexto = normalizarTexto(equipo);
    if (!nombreClave) return { id: '', fotoUrl: '', equipo: equipoTexto, posicion: '' };

    const metas = Object.values(estadoApp.jugadores?.playerMeta || {})
        .filter(meta => meta?.nombreNormalizado === nombreClave);

    let meta = metas.find(item => item?.equipo && equiposEquivalentes(item.equipo, equipoTexto));
    if (!meta && metas.length === 1) meta = metas[0];

    const id = normalizarIdJugador(meta?.id || inferirIdJugador(nombre, equipoTexto));
    const claveMeta = meta?.key || (id ? `ID:${id}` : '');
    let bio = claveMeta ? (estadoApp.jugadores?.bioData?.[claveMeta] || {}) : {};

    if ((!bio || !Object.keys(bio).length) && id) {
        const claveId = `ID:${id}`;
        bio = estadoApp.jugadores?.bioData?.[claveId] || {};
    }

    const fotoUrl = normalizarTexto(obtenerValor(
        bio,
        ['Foto_URL', 'Foto', 'Imagen_URL', 'Photo_URL', 'Photo'],
        ''
    ));

    return {
        id,
        fotoUrl,
        equipo: normalizarTexto(meta?.equipo || obtenerValor(bio, ['Equipo', 'Club', 'Team'], equipoTexto)),
        posicion: normalizarTexto(meta?.posicion || obtenerValor(bio, ['Posicion', 'Posición', 'Position'], ''))
    };
}

function guardarMapaCarasCache(mapa) {
    try { localStorage.setItem(CONFIG_CARAS.CACHE_KEY, JSON.stringify({ guardado: Date.now(), mapa })); } catch (_) {}
}
function leerMapaCarasCache() {
    try {
        const raw = localStorage.getItem(CONFIG_CARAS.CACHE_KEY);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        if (!cache?.mapa || Date.now() - Number(cache.guardado || 0) > CONFIG_CARAS.CACHE_TTL_MS) return null;
        return cache.mapa;
    } catch (_) { return null; }
}

function incorporarMapaCaras(mapa) {
    if (!mapa || typeof mapa !== 'object') throw new Error('El mapeo de caras no tiene el formato esperado.');
    if (!(estadoApp.diccionarioCaras instanceof Map)) estadoApp.diccionarioCaras = new Map();
    let agregadas = 0;
    const registrar = (idOriginal, rutaOriginal) => {
        const id = normalizarIdJugador(idOriginal);
        const ruta = normalizarTexto(rutaOriginal).replace(/^\.\//, '').replace(/^\/+/, '');
        if (!id || !ruta) return;
        const url = /^(?:https?:|data:|blob:)/i.test(ruta) ? ruta : `${CONFIG_CARAS.RAW_BASE}${ruta}`;
        estadoApp.diccionarioCaras.set(id, url);
        agregadas++;
    };
    if (Array.isArray(mapa)) {
        mapa.forEach(item => registrar(
            item?.id ?? item?.ID ?? String(item?.archivo || '').replace(/\.png$/i, ''),
            item?.ruta ?? item?.path ?? item?.url
        ));
    } else Object.entries(mapa).forEach(([id, ruta]) => registrar(id, ruta));
    return agregadas;
}

async function cargarMapaCaras() {
    if (estadoApp.carasMapCargado && estadoApp.diccionarioCaras instanceof Map && estadoApp.diccionarioCaras.size > 0) return estadoApp.diccionarioCaras;
    if (estadoApp.promesaCarasMap) return estadoApp.promesaCarasMap;

    estadoApp.promesaCarasMap = (async () => {
        const cache = leerMapaCarasCache();
        if (cache) {
            const n = incorporarMapaCaras(cache);
            if (n > 0) {
                estadoApp.carasMapCargado = true;
                console.info(`[INCA CARAS] ${n} rutas cargadas desde caché.`);
                await cargarIndiceIdsGlobal();
                return estadoApp.diccionarioCaras;
            }
        }

        let ultimoError = null;
        for (const url of CONFIG_CARAS.MAPAS) {
            try {
                const response = await fetch(url, { cache: 'no-cache', headers: { Accept: 'application/json' } });
                if (!response.ok) throw new Error(`HTTP ${response.status} al descargar ${url}`);
                const mapa = await response.json();
                const n = incorporarMapaCaras(mapa);
                if (!n) throw new Error('El mapa no produjo rutas válidas.');
                guardarMapaCarasCache(mapa);
                estadoApp.carasMapCargado = true;
                console.info(`[INCA CARAS] ${n} rutas cargadas desde ${url}`);
                await cargarIndiceIdsGlobal();
                return estadoApp.diccionarioCaras;
            } catch (error) {
                ultimoError = error;
                console.warn(`[INCA CARAS] Falló ${url}`, error);
            }
        }
        estadoApp.carasMapCargado = false;
        throw ultimoError || new Error('No se pudo cargar el mapa de caras.');
    })();

    try { return await estadoApp.promesaCarasMap; }
    catch (error) {
        console.error('[INCA CARAS] No se pudo inicializar el mapa.', error);
        return estadoApp.diccionarioCaras;
    } finally { estadoApp.promesaCarasMap = null; }
}

function convertirCaraRawACdn(url) {
    const texto = normalizarTexto(url);
    if (!texto.startsWith(CONFIG_CARAS.RAW_BASE)) return '';
    return `${CONFIG_CARAS.CDN_BASE}${texto.slice(CONFIG_CARAS.RAW_BASE.length)}`;
}
function convertirCaraCdnARaw(url) {
    const texto = normalizarTexto(url);
    if (!texto.startsWith(CONFIG_CARAS.CDN_BASE)) return '';
    return `${CONFIG_CARAS.RAW_BASE}${texto.slice(CONFIG_CARAS.CDN_BASE.length)}`;
}
function obtenerRutaCaraPro(idJugador) {
    const id = normalizarIdJugador(idJugador);
    if (!id) return '';
    const ruta = estadoApp.diccionarioCaras instanceof Map
        ? estadoApp.diccionarioCaras.get(id) || ''
        : estadoApp.diccionarioCaras?.[id] || '';
    return normalizarTexto(ruta);
}


function leerCacheIdRemoto(nombre, equipo = '') {
    const clave = `${claveTexto(nombre)}|${claveTexto(equipo)}`;
    if (estadoApp.carasRemotas.cache.has(clave)) return estadoApp.carasRemotas.cache.get(clave);
    try {
        const raw = localStorage.getItem(`inca_id_remoto_v10_${clave}`);
        if (!raw) return '';
        const dato = JSON.parse(raw);
        if (!dato?.id || Date.now() - Number(dato.guardado || 0) > 30 * 24 * 60 * 60 * 1000) return '';
        const id = normalizarIdJugador(dato.id);
        if (id) estadoApp.carasRemotas.cache.set(clave, id);
        return id;
    } catch (_) { return ''; }
}

function guardarCacheIdRemoto(nombre, equipo, id) {
    const limpio = normalizarIdJugador(id);
    if (!limpio) return;
    const clave = `${claveTexto(nombre)}|${claveTexto(equipo)}`;
    estadoApp.carasRemotas.cache.set(clave, limpio);
    try {
        localStorage.setItem(`inca_id_remoto_v10_${clave}`, JSON.stringify({ id: limpio, guardado: Date.now() }));
    } catch (_) {}
}

function extraerJugadoresBusquedaSofa(payload) {
    const candidatos = [];
    const visitar = valor => {
        if (!valor) return;
        if (Array.isArray(valor)) { valor.forEach(visitar); return; }
        if (typeof valor !== 'object') return;

        const entidad = valor.entity || valor.player || valor.item || valor;
        const tipo = claveTexto(valor.type || valor.entityType || entidad.type || '');
        const id = normalizarIdJugador(entidad.id || entidad.playerId || valor.id);
        const nombre = normalizarTexto(entidad.name || entidad.fullName || entidad.slug || valor.name);
        const equipo = normalizarTexto(
            entidad.team?.name || entidad.currentTeam?.name || valor.team?.name || valor.currentTeam?.name || ''
        );
        if (id && nombre && (!tipo || tipo.includes('PLAYER') || valor.player || entidad.position)) {
            candidatos.push({ id, nombre, equipo });
        }

        for (const clave of ['results','items','data','entities','players']) {
            if (valor[clave] && valor[clave] !== valor) visitar(valor[clave]);
        }
    };
    visitar(payload);
    return candidatos;
}

function puntuarCoincidenciaJugador(candidato, nombre, equipo) {
    const objetivo = claveTexto(nombre);
    const recibido = claveTexto(candidato.nombre);
    let puntos = 0;
    if (recibido === objetivo) puntos += 100;
    else if (recibido.includes(objetivo) || objetivo.includes(recibido)) puntos += 55;

    const tokensObjetivo = new Set(objetivo.split(' ').filter(t => t.length > 1));
    const tokensRecibido = new Set(recibido.split(' ').filter(t => t.length > 1));
    const comunes = [...tokensObjetivo].filter(t => tokensRecibido.has(t)).length;
    puntos += comunes * 12;

    if (equipo && candidato.equipo && equiposEquivalentes(equipo, candidato.equipo)) puntos += 80;
    return puntos;
}

async function buscarIdJugadorRemoto(nombre, equipo = '') {
    const ya = leerCacheIdRemoto(nombre, equipo);
    if (ya) return ya;

    // V4.27.38: no hacer búsquedas automáticas a SofaScore desde el portal.
    // El índice local/IndexedDB sigue resolviendo IDs y caras disponibles.
    // Así evitamos los 403 /api/v1/search/all que ensuciaban la consola.
    return '';
}

function procesarColaCarasRemotas() {
    const estado = estadoApp.carasRemotas;
    while (estado.activas < estado.maxConcurrentes && estado.cola.length) {
        const tarea = estado.cola.shift();
        estado.activas++;
        (async () => {
            let mejorId = '';
            try {
                const consulta = encodeURIComponent(tarea.nombre);
                const fuentes = [
                    `https://www.sofascore.com/api/v1/search/all?q=${consulta}`,
                    `https://api.sofascore.com/api/v1/search/all?q=${consulta}`
                ];
                let candidatos = [];
                for (const url of fuentes) {
                    try {
                        const r = await fetch(url, { cache: 'force-cache', headers: { Accept: 'application/json' } });
                        if (!r.ok) continue;
                        candidatos = extraerJugadoresBusquedaSofa(await r.json());
                        if (candidatos.length) break;
                    } catch (_) {}
                }
                candidatos.sort((a,b) => puntuarCoincidenciaJugador(b, tarea.nombre, tarea.equipo) - puntuarCoincidenciaJugador(a, tarea.nombre, tarea.equipo));
                const mejor = candidatos[0];
                if (mejor && puntuarCoincidenciaJugador(mejor, tarea.nombre, tarea.equipo) >= 75) {
                    mejorId = mejor.id;
                    guardarCacheIdRemoto(tarea.nombre, tarea.equipo, mejorId);
                    registrarIndiceJugador({ ID_Jugador: mejorId, Jugador: tarea.nombre, Equipo: tarea.equipo });
                    // La imagen oficial de Sofascore es un respaldo incluso cuando el ID no está dentro del pack local.
                    if (!estadoApp.diccionarioCaras.has(mejorId)) {
                        estadoApp.diccionarioCaras.set(mejorId, `https://api.sofascore.com/api/v1/player/${mejorId}/image`);
                    }
                }
            } finally {
                tarea.resolve(mejorId);
                estado.activas--;
                procesarColaCarasRemotas();
            }
        })();
    }
}

let observadorCarasRanking = null;
function observarCaraRanking(imagen, datosJugador) {
    if (!imagen) return;
    imagen._incaDatosJugador = datosJugador;
    if (datosJugador.prioridad || typeof IntersectionObserver === 'undefined') {
        resolverCaraJugador(imagen, datosJugador);
        return;
    }
    if (!observadorCarasRanking) {
        observadorCarasRanking = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const img = entry.target;
                observadorCarasRanking.unobserve(img);
                resolverCaraJugador(img, img._incaDatosJugador || {});
            });
        }, { rootMargin: '500px 0px', threshold: 0.01 });
    }
    observadorCarasRanking.observe(imagen);
}


async function asegurarMapasCarasListos() {
    await Promise.allSettled([cargarMapaCaras(), cargarIndiceIdsGlobal()]);
    return Boolean(estadoApp.carasMapCargado || estadoApp.indiceIdsGlobalCargado);
}

async function reintentarCaraConMapeo(elementoImagen, datosJugador = {}, elementoPlaceholder = null, tokenOriginal = '') {
    await asegurarMapasCarasListos();
    if (!elementoImagen || (tokenOriginal && elementoImagen.dataset.tokenCarga !== tokenOriginal)) return '';

    const nombre = normalizarTexto(datosJugador.nombre || datosJugador.jugador || '');
    const equipo = normalizarTexto(datosJugador.equipo || '');
    const id = resolverIdDesdeMaestro(nombre) || inferirIdJugador(nombre, equipo);
    const ruta = obtenerRutaCaraPro(id);
    if (!id || !ruta) return '';

    const actual = normalizarIdJugador(elementoImagen.dataset.idJugador || '');
    if (actual === id && elementoImagen.src && !elementoImagen.src.includes('ui-avatars.com')) return ruta;

    return resolverCaraJugador(elementoImagen, { ...datosJugador, idJugador: id, prioridad: datosJugador.prioridad }, elementoPlaceholder, true);
}

function resolverCaraJugador(elementoImagen, datosJugador = {}, elementoPlaceholder = null, reintentoInterno = false) {
    if (!elementoImagen || String(elementoImagen.tagName).toUpperCase() !== 'IMG') return '';

    const nombre = normalizarTexto(datosJugador.nombre || datosJugador.jugador || 'JUGADOR');
    const equipo = normalizarTexto(datosJugador.equipo || '');
    let idJugador = normalizarIdJugador(datosJugador.idJugador ?? datosJugador.id ?? '');
    const metaGlobal = obtenerMetaGlobalJugador(nombre, equipo);
    if (!idJugador) idJugador = metaGlobal.id || inferirIdJugador(nombre, equipo);

    // FACE CURRENT superpone a la cara vieja. Si todavía no existe en GitHub, onerror continúa con el mapa legacy.
    const rutaCurrent = idJugador ? `${CONFIG_CARAS.CURRENT_FACES_BASE}${idJugador}.webp?faces=${CONFIG_CARAS.CURRENT_FACES_REV}` : '';
    const rutaPrincipal = obtenerRutaCaraPro(idJugador);
    const rutaCdn = convertirCaraRawACdn(rutaPrincipal);
    const rutaRaw = convertirCaraCdnARaw(rutaPrincipal);
    const fotoCSV = normalizarTexto(datosJugador.fotoUrl || datosJugador.foto || metaGlobal.fotoUrl || '');
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=0f172a&color=f8fafc&bold=true&rounded=true&size=256`;

    const mapasListos = Boolean(estadoApp.carasMapCargado && estadoApp.indiceIdsGlobalCargado);
    const candidatos = [rutaCurrent, rutaPrincipal, rutaCdn, rutaRaw, fotoCSV, ...(mapasListos ? [avatar] : [])]
        .map(normalizarTexto)
        .filter((url, indice, lista) => url && lista.indexOf(url) === indice);

    const token = `${Date.now()}-${Math.random()}`;
    let indiceCandidato = 0;
    elementoImagen.dataset.tokenCarga = token;
    elementoImagen.dataset.idJugador = idJugador;
    elementoImagen.alt = `Foto de ${nombre}`;
    elementoImagen.referrerPolicy = 'no-referrer';
    elementoImagen.decoding = 'async';

    // IMPORTANTE: una imagen lazy nunca debe quedar en display:none antes de cargar,
    // porque el navegador puede no iniciar jamás la descarga. Se mantiene en el layout
    // y se oculta únicamente mediante opacidad.
    elementoImagen.loading = datosJugador.prioridad ? 'eager' : 'lazy';
    try { elementoImagen.fetchPriority = datosJugador.prioridad ? 'high' : 'low'; } catch (_) {}
    elementoImagen.style.display = 'block';
    elementoImagen.classList.add('is-loading');
    elementoImagen.style.opacity = '0';
    elementoImagen.style.visibility = 'visible';
    elementoImagen.style.transition = 'opacity .15s ease';

    if (elementoPlaceholder) elementoPlaceholder.style.display = 'none';

    const cargarSiguiente = () => {
        if (elementoImagen.dataset.tokenCarga !== token) return;

        if (indiceCandidato >= candidatos.length) {
            if (!reintentoInterno && !elementoImagen.dataset.reintentoMapeo) {
                elementoImagen.dataset.reintentoMapeo = '1';
                reintentarCaraConMapeo(elementoImagen, datosJugador, elementoPlaceholder, token)
                    .then(ruta => {
                        if (!ruta && elementoImagen.dataset.tokenCarga === token) {
                            elementoImagen.style.opacity = '0';
                            if (elementoPlaceholder) elementoPlaceholder.style.display = 'flex';
                        }
                    })
                    .catch(() => {
                        if (elementoImagen.dataset.tokenCarga === token && elementoPlaceholder) elementoPlaceholder.style.display = 'flex';
                    });
                return;
            }
            elementoImagen.style.opacity = '0';
            if (elementoPlaceholder) elementoPlaceholder.style.display = 'flex';
            return;
        }

        const nuevaUrl = candidatos[indiceCandidato++];
        // Limpiar src antes de cambiar evita estados atascados de imágenes fallidas.
        elementoImagen.removeAttribute('src');
        elementoImagen.src = nuevaUrl;
    };

    elementoImagen.onload = () => {
        if (elementoImagen.dataset.tokenCarga !== token) return;
        elementoImagen.style.display = 'block';
        elementoImagen.style.opacity = '1';
        elementoImagen.classList.remove('is-loading');
        if (elementoPlaceholder) elementoPlaceholder.style.display = 'none';
    };

    elementoImagen.onerror = () => {
        if (elementoImagen.dataset.tokenCarga !== token) return;
        cargarSiguiente();
    };

    cargarSiguiente();

    // Cuando ninguna base local conoce el ID, resolverlo una sola vez en segundo plano.
    // Esto permite completar jugadores nuevos sin bloquear el Leaderboard.
    if (!idJugador && nombre) {
        buscarIdJugadorRemoto(nombre, equipo).then(idRemoto => {
            if (!idRemoto || elementoImagen.dataset.tokenCarga !== token) return;
            const rutaPack = obtenerRutaCaraPro(idRemoto);
            const rutaOficial = `https://api.sofascore.com/api/v1/player/${idRemoto}/image`;
            const nuevas = [rutaPack, convertirCaraRawACdn(rutaPack), rutaOficial]
                .map(normalizarTexto).filter(Boolean);
            if (!nuevas.length) return;
            elementoImagen.dataset.idJugador = idRemoto;
            indiceCandidato = 0;
            candidatos.splice(0, candidatos.length, ...nuevas, fotoCSV, avatar);
            elementoImagen.style.opacity = '0';
            cargarSiguiente();
        }).catch(() => {});
    }

    return candidatos[0] || '';
}

function registrarCaraJugadorEnDiccionario(fila = {}) {
    registrarIndiceJugador(fila);
    const id = obtenerIdJugadorFila(fila);
    const foto = normalizarTexto(obtenerValor(fila, ['Foto_URL', 'Foto', 'Imagen_URL', 'Photo_URL', 'Photo'], ''));
    if (!id || !foto) return;
    if (!(estadoApp.diccionarioCaras instanceof Map)) estadoApp.diccionarioCaras = new Map();
    if (!estadoApp.diccionarioCaras.has(id)) estadoApp.diccionarioCaras.set(id, foto);
}

window.INCA_CARAS_DIAGNOSTICO = async function(nombre = '', equipo = '') {
    let id = inferirIdJugador(nombre, equipo);
    let origen = id ? 'LOCAL' : 'SIN MAPEO';
    if (!id) {
        id = await buscarIdJugadorRemoto(nombre, equipo);
        if (id) origen = 'BÚSQUEDA REMOTA';
    }
    const ruta = obtenerRutaCaraPro(id) || (id ? `https://api.sofascore.com/api/v1/player/${id}/image` : '');
    return {
        mapaCargado: estadoApp.carasMapCargado,
        indiceIdsCargado: Boolean(estadoApp.indiceIdsGlobalCargado),
        aliasCompactos: estadoApp.aliasCompactoIds instanceof Map ? estadoApp.aliasCompactoIds.size : 0,
        aliasPorTokens: estadoApp.aliasTokensIds instanceof Map ? estadoApp.aliasTokensIds.size : 0,
        rutas: estadoApp.diccionarioCaras instanceof Map ? estadoApp.diccionarioCaras.size : 0,
        nombresIndexados: estadoApp.indiceIdsPorNombre instanceof Map ? estadoApp.indiceIdsPorNombre.size : 0,
        nombre, equipo, origen, idInferido: id, ruta
    };
};

function aplicarTemaPosicion(posicion) {
    const body = document.body;
    if (!body) return;
    body.classList.remove('theme-default', 'theme-arquero', 'theme-defensor', 'theme-mediocentro', 'theme-delantero');

    const categoria = clasificarPosicion(posicion);
    const mapa = {
        ARQUERO: 'theme-arquero',
        DEFENSOR: 'theme-defensor',
        MEDIOCENTRO: 'theme-mediocentro',
        DELANTERO: 'theme-delantero'
    };
    body.classList.add(mapa[categoria] || 'theme-default');
}

function toggleDarkMode() {
    const body = document.body;
    if (!body) return;
    body.classList.toggle('dark-mode');

    const oscuro = body.classList.contains('dark-mode');
    escribirStorage(localStorage, 'theme', oscuro ? 'dark' : 'light');
    document.querySelectorAll('.theme-toggle-btn i').forEach(icono => {
        icono.classList.toggle('fa-sun', oscuro);
        icono.classList.toggle('fa-moon', !oscuro);
    });
}

function guardarFiltros() {
    const filtros = {
        prefLiga: document.getElementById('selectLiga')?.value,
        prefTemporada: document.getElementById('selectTemporada')?.value,
        prefEquipo: document.getElementById('selectEquipo')?.value,
        prefCondicion: document.getElementById('selectCondicion')?.value,
        prefMercado: estadoApp.mercadoSeleccionado,
        prefSubMercado: estadoApp.subMercadoSeleccionado
    };

    Object.entries(filtros).forEach(([clave, valor]) => {
        if (valor !== undefined && valor !== null && valor !== '') escribirStorage(localStorage, clave, valor);
    });
}

function cargarFiltrosPersistentes() {
    const asignarValor = (id, clave) => {
        const select = document.getElementById(id);
        const preferencia = leerStorage(localStorage, clave, null);
        if (select && preferencia && Array.from(select.options).some(o => o.value === preferencia)) select.value = preferencia;
    };

    asignarValor('selectLiga', 'prefLiga');
    asignarValor('selectTemporada', 'prefTemporada');
    asignarValor('selectCondicion', 'prefCondicion');

    const prefMercado = leerStorage(localStorage, 'prefMercado', null);
    if (!prefMercado) return;

    document.querySelectorAll('.menu-option').forEach(opcion => {
        const accion = opcion.getAttribute('onclick') || '';
        if (!accion.includes(`'${prefMercado}'`)) return;
        const cabecera = opcion.closest('.accordion-item')?.querySelector('.accordion-header');
        if (cabecera && !cabecera.classList.contains('active')) toggleAccordion(cabecera);
        seleccionarMercado(prefMercado, opcion);
    });
}

function refrescarSelectCustom(idSelect) {
    const select = document.getElementById(idSelect);
    if (!select || !select.parentElement) return;

    // V44: league-logo-selects.js owns every league selector.
    const esSelectorLigaVisual = ['selectLiga','selectLigaPro','fixtureLeague','compareLeagueA','compareLeagueB','rankingsSelectLiga'].includes(idSelect);
    if (esSelectorLigaVisual) {
        const outer = select.closest('.custom-select-wrapper') || select.parentElement;
        outer?.querySelectorAll(':scope > .custom-display, :scope > .custom-list').forEach(node => node.remove());

        if (select.dataset.leagueLogoEnhanced === '1') {
            select.classList.add('league-logo-select__native');
            ['display','width','pointer-events','cursor','visibility','opacity'].forEach(prop => select.style.removeProperty(prop));
            return;
        }

        select.classList.remove('hidden-native-select');
        select.style.display = '';
        select.style.width = '100%';
        select.style.pointerEvents = 'auto';
        select.style.cursor = 'pointer';
        return;
    }

    if (idSelect.startsWith('rankingsSelect')) {
        const outer = select.closest('.custom-select-wrapper') || select.parentElement;
        outer?.querySelectorAll(':scope > .custom-display, :scope > .custom-list').forEach(node => node.remove());
        select.classList.remove('hidden-native-select');
        select.style.display = '';
        select.style.width = '100%';
        select.style.pointerEvents = 'auto';
        select.style.cursor = 'pointer';
        return;
    }

    if (idSelect === 'rankingsSelectLimite') {
        const wrapper = select.parentElement;
        wrapper.querySelector('.custom-display')?.remove();
        wrapper.querySelector('.custom-list')?.remove();
        select.classList.remove('hidden-native-select');
        select.style.display = '';
        select.style.width = '100%';
        select.style.cursor = 'pointer';
        return;
    }

    select.classList.add('hidden-native-select');
    const wrapper = select.parentElement;
    wrapper.querySelector('.custom-display')?.remove();
    wrapper.querySelector('.custom-list')?.remove();
    wrapper.querySelector('.inca-scroll-rail')?.remove();

    const esNumerico = select.classList.contains('numeric-input');
    const deshabilitado = Boolean(select.disabled);
    wrapper.classList.toggle('is-disabled', deshabilitado);
    wrapper.setAttribute('aria-disabled', String(deshabilitado));

    const display = document.createElement('div');
    display.className = `custom-display${esNumerico ? ' numeric-input' : ''}`;
    display.tabIndex = deshabilitado ? -1 : 0;
    display.setAttribute('role', 'combobox');
    display.setAttribute('aria-haspopup', 'listbox');
    display.setAttribute('aria-expanded', 'false');
    display.setAttribute('aria-disabled', String(deshabilitado));
    display.setAttribute('aria-label', select.getAttribute('aria-label') || select.name || idSelect);

    const spanText = document.createElement('span');
    const opcionInicial = select.options?.[select.selectedIndex >= 0 ? select.selectedIndex : 0];
    spanText.textContent = opcionInicial?.text || 'SELECCIONAR';

    const icon = document.createElement('i');
    icon.className = deshabilitado ? 'fa-solid fa-lock' : 'fa-solid fa-chevron-down';
    icon.style.color = 'var(--text-muted)';
    icon.style.fontSize = '10px';
    icon.style.transition = '0.3s';
    display.append(spanText, icon);

    const list = document.createElement('div');
    list.id = `${idSelect}-custom-list`;
    list.className = `custom-list${esNumerico ? ' numeric-input' : ''}`;
    list.setAttribute('role', 'listbox');
    display.setAttribute('aria-controls', list.id);

    // V45: long line ladders must scroll inside themselves, never the page behind.
    list.addEventListener('wheel', event => {
        event.stopPropagation();
    }, { passive: true });
    list.addEventListener('touchmove', event => {
        event.stopPropagation();
    }, { passive: true });

    // V52: floating scroll rail for long numeric ladders.
    // The native scrollbar is hidden because it was visually glued to the border.
    let scrollRail = null;
    let scrollThumb = null;

    const syncFloatingRail = () => {
        if (!esNumerico || !scrollRail || !scrollThumb) return;

        const scrollable = list.scrollHeight > list.clientHeight + 1;
        scrollRail.classList.toggle('is-visible', scrollable && list.classList.contains('show'));
        if (!scrollable) return;

        const verticalInset = 16;
        const railHeight = Math.max(44, list.clientHeight - verticalInset * 2);
        const maxScroll = Math.max(1, list.scrollHeight - list.clientHeight);
        const ratio = Math.min(1, list.clientHeight / list.scrollHeight);
        const thumbHeight = Math.max(28, Math.round(railHeight * ratio));
        const travel = Math.max(0, railHeight - thumbHeight);
        const top = travel * (list.scrollTop / maxScroll);

        scrollRail.style.height = `${railHeight}px`;
        scrollRail.style.top = `${list.offsetTop + verticalInset}px`;
        scrollThumb.style.height = `${thumbHeight}px`;
        scrollThumb.style.transform = `translateY(${top}px)`;
    };

    if (esNumerico) {
        scrollRail = document.createElement('div');
        scrollRail.className = 'inca-scroll-rail';
        scrollRail.setAttribute('aria-hidden', 'true');

        const railTrack = document.createElement('div');
        railTrack.className = 'inca-scroll-rail__track';

        scrollThumb = document.createElement('div');
        scrollThumb.className = 'inca-scroll-rail__thumb';

        railTrack.appendChild(scrollThumb);
        scrollRail.appendChild(railTrack);

        list.addEventListener('wheel', event => {
            if (list.scrollHeight <= list.clientHeight) return;
            event.preventDefault();
            event.stopPropagation();
            list.scrollTop += event.deltaY;
            syncFloatingRail();
        }, { passive: false });

        list.addEventListener('scroll', syncFloatingRail, { passive: true });

        railTrack.addEventListener('pointerdown', event => {
            event.preventDefault();
            event.stopPropagation();
            if (event.target === scrollThumb) return;

            const rect = railTrack.getBoundingClientRect();
            const clickY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
            const thumbH = scrollThumb.getBoundingClientRect().height || 38;
            const travel = Math.max(1, rect.height - thumbH);
            const ratio = Math.max(0, Math.min(1, (clickY - thumbH / 2) / travel));
            list.scrollTop = ratio * (list.scrollHeight - list.clientHeight);
            syncFloatingRail();
        });

        scrollThumb.addEventListener('pointerdown', event => {
            event.preventDefault();
            event.stopPropagation();

            const pointerId = event.pointerId;
            const startY = event.clientY;
            const startScroll = list.scrollTop;
            const railRect = railTrack.getBoundingClientRect();
            const thumbRect = scrollThumb.getBoundingClientRect();
            const travel = Math.max(1, railRect.height - thumbRect.height);
            const maxScroll = Math.max(1, list.scrollHeight - list.clientHeight);

            scrollThumb.setPointerCapture?.(pointerId);
            scrollRail.classList.add('is-dragging');

            const onMove = moveEvent => {
                if (moveEvent.pointerId !== pointerId) return;
                moveEvent.preventDefault();
                const delta = moveEvent.clientY - startY;
                list.scrollTop = Math.max(
                    0,
                    Math.min(maxScroll, startScroll + (delta / travel) * maxScroll)
                );
                syncFloatingRail();
            };

            const onUp = upEvent => {
                if (upEvent.pointerId !== pointerId) return;
                scrollRail.classList.remove('is-dragging');
                scrollThumb.releasePointerCapture?.(pointerId);
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onUp);
            };

            window.addEventListener('pointermove', onMove, { passive: false });
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
        });
    }

    const seleccionarItem = (opt, item) => {
        if (deshabilitado || opt.disabled) return;
        
        const valorCambio = select.value !== opt.value;
        if (!valorCambio) {
            cerrarTodosDropdowns();
            return;
        }

        select.value = opt.value;
        spanText.textContent = opt.text;
        list.querySelectorAll('.custom-item').forEach(i => {
            i.classList.remove('selected');
            i.setAttribute('aria-selected', 'false');
        });
        item.classList.add('selected');
        item.setAttribute('aria-selected', 'true');
        cerrarTodosDropdowns();
        
        select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const crearItem = (opt, esSubItem) => {
        const item = document.createElement('div');
        item.className = `custom-item${opt.selected ? ' selected' : ''}${esSubItem ? ' sub-item' : ''}${opt.disabled ? ' disabled' : ''}`;
        item.textContent = opt.text;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(opt.selected));
        item.setAttribute('aria-disabled', String(Boolean(opt.disabled)));
        item.tabIndex = -1;
        
        item.addEventListener('pointerdown', event => {
            event.stopPropagation();
        });
        item.addEventListener('mousedown', event => {
            event.stopPropagation();
        });
        item.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            seleccionarItem(opt, item);
        });
        return item;
    };

    Array.from(select.children).forEach(child => {
        if (child.tagName === 'OPTGROUP') {
            const groupLabel = document.createElement('div');
            groupLabel.className = 'custom-optgroup';
            groupLabel.textContent = child.label;
            list.appendChild(groupLabel);
            Array.from(child.children)
                .filter(opt => !opt.hidden)
                .forEach(opt => list.appendChild(crearItem(opt, true)));
        } else if (child.tagName === 'OPTION' && !child.hidden) {
            list.appendChild(crearItem(child, false));
        }
    });

    const abrirCerrar = () => {
        if (deshabilitado) return;
        if (window.INCA_MOBILE_SELECT?.shouldUse?.()) {
            window.INCA_MOBILE_SELECT.open(select);
            return;
        }
        const estabaAbierto = list.classList.contains('show');
        cerrarTodosDropdowns();
        if (!estabaAbierto) {
            list.classList.add('show');
            wrapper.classList.add('focused');
            display.setAttribute('aria-expanded', 'true');
            icon.style.transform = 'rotate(180deg)';

            requestAnimationFrame(() => {
                const selectedItem = list.querySelector('.custom-item.selected');
                if (selectedItem) selectedItem.scrollIntoView({ block: 'nearest' });
                syncFloatingRail();

                if (idSelect === 'selectEquipoPro') {
                    console.info('[INCA DATA PRO V47] Selector equipos abierto', {
                        opciones: select.options.length,
                        items: list.querySelectorAll('.custom-item').length,
                        scrollHeight: list.scrollHeight,
                        clientHeight: list.clientHeight
                    });
                }
            });
        }
    };

    display.addEventListener('click', event => {
        event.stopPropagation();
        abrirCerrar();
    });

    display.addEventListener('keydown', event => {
        if (deshabilitado) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            abrirCerrar();
        } else if (event.key === 'Escape') {
            cerrarTodosDropdowns();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const items = Array.from(list.querySelectorAll('.custom-item:not(.disabled)'));
            if (!items.length) return;
            const actual = items.findIndex(i => i.classList.contains('selected'));
            const siguiente = event.key === 'ArrowDown'
                ? Math.min(Math.max(actual, -1) + 1, items.length - 1)
                : Math.max(actual <= 0 ? 0 : actual - 1, 0);
            const item = items[siguiente];
            const opcion = Array.from(select.options).find(opt => opt.text === item?.textContent && !opt.disabled);
            if (opcion && item) seleccionarItem(opcion, item);
        }
    });

    if (scrollRail) wrapper.append(display, list, scrollRail);
    else wrapper.append(display, list);
}

function cerrarTodosDropdowns() {
    document.querySelectorAll('.custom-list.show').forEach(lista => lista.classList.remove('show'));
    document.querySelectorAll('.inca-scroll-rail.is-visible').forEach(rail => rail.classList.remove('is-visible'));
    document.querySelectorAll('.custom-select-wrapper.focused').forEach(wrapper => wrapper.classList.remove('focused'));
    document.querySelectorAll('.custom-display').forEach(display => {
        display.setAttribute('aria-expanded', 'false');
        const icono = display.querySelector('i');
        if (icono) icono.style.transform = 'rotate(0deg)';
    });
}
document.addEventListener('click', event => {
    if (event.target?.closest?.('.custom-select-wrapper')) return;
    cerrarTodosDropdowns();
});

function asegurarBackdropMobileInca() {
    let backdrop = document.getElementById('incaMobileBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('button');
        backdrop.type = 'button';
        backdrop.id = 'incaMobileBackdrop';
        backdrop.className = 'inca-mobile-backdrop';
        backdrop.setAttribute('aria-label','Cerrar menú');
        backdrop.addEventListener('click', () => toggleMobileMenu(false));
    }

    // V1.016: el backdrop debe compartir el MISMO stacking-context que el sidebar.
    // Cuando vivía en <body>, podía quedar por encima de #scannerView y capturar todos
    // los taps aunque visualmente el drawer estuviera abierto.
    const host = document.getElementById('scannerView') || document.body;
    if (backdrop.parentElement !== host) {
        host.insertBefore(backdrop, host.firstChild || null);
    }
    return backdrop;
}

function repararCapasMenuMobile(sidebar, backdrop) {
    if (!sidebar || !backdrop || window.innerWidth > 1100) return;
    sidebar.style.pointerEvents = 'auto';
    sidebar.style.zIndex = '30020';
    backdrop.style.zIndex = '30000';

    // Los controles del drawer siempre deben recibir interacción táctil.
    sidebar.querySelectorAll('button,[role="button"],select,input,.custom-display,.accordion-header,.menu-option,.db-pro-btn,.scanner-return')
      .forEach(el => { el.style.pointerEvents = 'auto'; });

    // Guardia de hit-test: si por una regla legacy el backdrop termina interceptando
    // el centro del drawer, lo enviamos inmediatamente por debajo.
    requestAnimationFrame(() => {
        if (!sidebar.classList.contains('open') && !sidebar.classList.contains('mobile-open')) return;
        const r = sidebar.getBoundingClientRect();
        if (r.width < 20 || r.height < 20) return;
        const x = Math.min(window.innerWidth - 2, Math.max(2, r.left + Math.min(120, r.width * .45)));
        const y = Math.min(window.innerHeight - 2, Math.max(2, r.top + Math.min(220, r.height * .35)));
        const hit = document.elementFromPoint(x, y);
        if (hit === backdrop || backdrop.contains(hit)) {
            backdrop.style.zIndex = '29990';
            sidebar.style.zIndex = '30020';
        }
    });
}

function toggleMobileMenu(force = null) {
    const sidebar = document.getElementById('sidebarMenu');
    if (!sidebar) return false;
    const mobile = window.innerWidth <= 1100;
    const current = sidebar.classList.contains('open') || sidebar.classList.contains('mobile-open');
    const abierto = mobile ? (typeof force === 'boolean' ? force : !current) : false;
    const backdrop = asegurarBackdropMobileInca();

    sidebar.classList.toggle('open', abierto);
    sidebar.classList.toggle('mobile-open', abierto);
    sidebar.setAttribute('aria-hidden', String(mobile && !abierto));
    document.body.classList.toggle('inca-mobile-menu-open', abierto);
    backdrop.classList.toggle('show', abierto);
    backdrop.setAttribute('aria-hidden', String(!abierto));
    document.querySelectorAll('.mobile-menu-btn,.mobile-close-btn,#incaAnalyzerMobileTrigger')
      .forEach(btn => btn.setAttribute('aria-expanded', String(abierto)));

    if (abierto) repararCapasMenuMobile(sidebar, backdrop);
    return abierto;
}

window.addEventListener('resize', () => {
    if (window.innerWidth > 1100) toggleMobileMenu(false);
}, { passive:true });
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('inca-mobile-menu-open')) toggleMobileMenu(false);
});

function toggleAccordion(btn, event) {
    if(event) event.preventDefault(); 
    
    let content = btn.nextElementSibling;
    let isActive = btn.classList.contains("active");
    
    document.querySelectorAll('.accordion-header').forEach(h => { 
        h.classList.remove('active'); 
        if(h.nextElementSibling) {
            h.nextElementSibling.style.display = "none"; 
        }
    });
    
    if (!isActive) { 
        btn.classList.add("active"); 
        if(content) content.style.display = "block"; 
    }
}


const INCA_PRELOAD = {
    iniciado: false,
    carasCalentadas: new Set(),
    maxCarasInicio: 12,
    concurrencia: 2
};

function ejecutarEnReposo(callback, timeout = 1800) {
    if ('requestIdleCallback' in window) {
        return requestIdleCallback(callback, { timeout });
    }
    return setTimeout(() => callback({ timeRemaining: () => 8, didTimeout: true }), 120);
}

async function precargarImagenURL(url) {
    const limpia = normalizarTexto(url);
    if (!limpia || INCA_PRELOAD.carasCalentadas.has(limpia)) return false;
    INCA_PRELOAD.carasCalentadas.add(limpia);

    return new Promise(resolve => {
        const imagen = new Image();
        imagen.decoding = 'async';
        imagen.fetchPriority = 'low';
        imagen.onload = () => resolve(true);
        imagen.onerror = () => resolve(false);
        imagen.src = limpia;
    });
}

async function precalentarCarasVisibles(limite = INCA_PRELOAD.maxCarasInicio) {
    await cargarMapaCaras();
    const urls = [];
    const vistos = new Set();

    const agregar = idOriginal => {
        const id = normalizarIdJugador(idOriginal);
        const ruta = obtenerRutaCaraPro(id);
        if (!ruta || vistos.has(ruta)) return;
        vistos.add(ruta);
        urls.push(ruta);
    };

    const ranking = Array.isArray(estadoApp.rankings?.ultimoResultado)
        ? estadoApp.rankings.ultimoResultado
        : [];
    ranking.slice(0, limite).forEach(jugador => agregar(jugador?.id || jugador?.idJugador));

    const nombres = Array.isArray(estadoApp.jugadores?.listaNombres)
        ? estadoApp.jugadores.listaNombres
        : [];
    nombres.slice(0, limite).forEach(jugador => agregar(jugador?.id || jugador?.idJugador));

    if (urls.length < limite && estadoApp.diccionarioCaras instanceof Map) {
        for (const ruta of estadoApp.diccionarioCaras.values()) {
            if (!vistos.has(ruta)) {
                vistos.add(ruta);
                urls.push(ruta);
            }
            if (urls.length >= limite) break;
        }
    }

    let cursor = 0;
    const trabajadores = Array.from(
        { length: Math.min(INCA_PRELOAD.concurrencia, urls.length) },
        async () => {
            while (cursor < urls.length) {
                const indice = cursor++;
                await precargarImagenURL(urls[indice]);
            }
        }
    );

    await Promise.allSettled(trabajadores);
    return urls.length;
}

async function precargarRankingSeleccionadoSilencioso() {
    const liga = document.getElementById('selectLigaPro')?.value;
    const temporada = document.getElementById('selectTemporadaPro')?.value;
    if (!liga || !temporada) return;

    const contextoJugador = window.INCA_TITAN?.legacyPlayerContext?.(liga, temporada);
    const ligaJugadores = contextoJugador?.liga || liga;
    const temporadaJugadores = contextoJugador?.temporada || temporada;
    const urlCSV = CONFIG_ENLACES_JUGADORES?.[ligaJugadores]?.[temporadaJugadores] || '';
    if (!urlCSV) return;

    if (
        estadoApp.rankings?.ligaActual === liga &&
        estadoApp.rankings?.temporadaActual === temporada &&
        estadoApp.rankings?.matrizCrudaCSV?.length
    ) return;

    try {
        const data = await cargarDatasetJugadoresRanking(
            urlCSV,
            `inca_rankings_v29_silent_${liga}_${temporada}`
        );

        if (!Array.isArray(data) || !data.length) return;
        data.forEach(fila => {
            registrarIndiceJugador(fila);
            registrarCaraJugadorEnDiccionario(fila);
        });

        estadoApp.rankings.matrizCrudaCSV = data;
        estadoApp.rankings.filasPreparadas = prepararFilasRankings(data);
        estadoApp.rankings.ultimoCalculo = null;
        estadoApp.rankings.ligaActual = liga;
        estadoApp.rankings.temporadaActual = temporada;
    } catch (error) {
        console.warn('[INCA PRELOAD] No se pudo precargar el ranking.', error);
    }
}

const INCA_BACKGROUND_QUEUE = {
    running: false,
    tasks: [],
    completed: new Set()
};

function encolarTareaFondo(nombre, tarea) {
    if (!nombre || typeof tarea !== 'function') return;
    if (INCA_BACKGROUND_QUEUE.completed.has(nombre)) return;
    if (INCA_BACKGROUND_QUEUE.tasks.some(item => item.nombre === nombre)) return;
    INCA_BACKGROUND_QUEUE.tasks.push({ nombre, tarea });
    ejecutarColaFondo();
}

function ejecutarColaFondo() {
    if (INCA_BACKGROUND_QUEUE.running || !INCA_BACKGROUND_QUEUE.tasks.length) return;
    INCA_BACKGROUND_QUEUE.running = true;

    ejecutarEnReposo(async () => {
        const siguiente = INCA_BACKGROUND_QUEUE.tasks.shift();
        if (!siguiente) {
            INCA_BACKGROUND_QUEUE.running = false;
            return;
        }

        try {
            await siguiente.tarea();
            INCA_BACKGROUND_QUEUE.completed.add(siguiente.nombre);
        } catch (error) {
            console.warn(`[INCA FONDO] Falló ${siguiente.nombre}.`, error);
        } finally {
            INCA_BACKGROUND_QUEUE.running = false;
            setTimeout(ejecutarColaFondo, 80);
        }
    }, 2200);
}

function puedeDesplazarseVerticalmente(elemento, deltaY) {
    if (!(elemento instanceof HTMLElement)) return false;
    const estilo = getComputedStyle(elemento);
    const overflowY = estilo.overflowY;
    if (!['auto', 'scroll', 'overlay'].includes(overflowY)) return false;
    if (elemento.scrollHeight <= elemento.clientHeight + 2) return false;
    if (deltaY < 0) return elemento.scrollTop > 0;
    return elemento.scrollTop + elemento.clientHeight < elemento.scrollHeight - 1;
}

function configurarRuedaGlobalPC() {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (document.documentElement.dataset.incaWheelReady === 'true') return;
    document.documentElement.dataset.incaWheelReady = 'true';

    window.addEventListener('wheel', event => {
        if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) < 1) return;

        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        // Selects, modales y listas con scroll propio conservan su desplazamiento.
        const modal = target.closest('.pro-modal-content--player, .custom-list, .pro-search-results, .sidebar-scroll-area');
        if (modal && puedeDesplazarseVerticalmente(modal, event.deltaY)) return;

        let actual = target;
        while (actual && actual !== document.body) {
            if (actual.id !== 'mainContent' && puedeDesplazarseVerticalmente(actual, event.deltaY)) return;
            actual = actual.parentElement;
        }

        const main = document.getElementById('mainContent');
        if (!main || main.scrollHeight <= main.clientHeight + 2) return;

        event.preventDefault();
        const factor = event.deltaMode === 1 ? 28 : event.deltaMode === 2 ? main.clientHeight : 1;
        const desplazamiento = Math.max(-180, Math.min(180, event.deltaY * factor));
        main.scrollTop += desplazamiento;
    }, { passive: false, capture: true });
}

async function precargarModulosIniciales() {
    // V17.3: no se precargan bases pesadas durante el inicio.
    configurarRuedaGlobalPC();
    configurarEstadoScrollLigero();
}

function configurarEstadoScrollLigero() {
    const main = document.getElementById('mainContent');
    if (!main || main.dataset.scrollStateReady === 'true') return;
    main.dataset.scrollStateReady = 'true';
    let timer = 0;
    main.addEventListener('scroll', () => {
        main.classList.add('is-scrolling');
        clearTimeout(timer);
        timer = setTimeout(() => main.classList.remove('is-scrolling'), 110);
    }, { passive: true });
}


/* =========================================================
   INCA STATS V15.7 — ARRANQUE NO BLOQUEANTE
   ========================================================= */

const INCA_STARTUP_FAST = {
    interfazLista: false,
    mapasProgramados: false,
    playerVipCargado: false,
    leaderboardCargado: false,
    precargaCancelada: false
};

function incaSiguienteFrame() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function incaEnReposo(callback, timeout = 2500) {
    if ('requestIdleCallback' in window) {
        return requestIdleCallback(callback, { timeout });
    }
    return setTimeout(() => callback({
        didTimeout: true,
        timeRemaining: () => 6
    }), 180);
}

async function incaCederAlNavegador() {
    await incaSiguienteFrame();
    await new Promise(resolve => setTimeout(resolve, 0));
}

function incaProgramarMapasLigeros() {
    if (INCA_STARTUP_FAST.mapasProgramados) return;
    INCA_STARTUP_FAST.mapasProgramados = true;

    incaEnReposo(async () => {
        if (INCA_STARTUP_FAST.precargaCancelada) return;

        try {
            await cargarMapaCaras();
            await incaCederAlNavegador();
            await cargarIndiceIdsGlobal();
        } catch (error) {
            console.warn('[INCA FAST START] Mapas diferidos no disponibles.', error);
        }
    }, 3200);
}

async function incaAsegurarPlayerVip() {
    if (INCA_STARTUP_FAST.playerVipCargado) return;
    INCA_STARTUP_FAST.playerVipCargado = true;
    await incaCederAlNavegador();
    await cargarBaseDatosJugadores();
}

async function incaAsegurarLeaderboard() {
    if (INCA_STARTUP_FAST.leaderboardCargado) return;
    INCA_STARTUP_FAST.leaderboardCargado = true;
    await incaCederAlNavegador();

    if (typeof precargarRankingSeleccionadoSilencioso === 'function') {
        await precargarRankingSeleccionadoSilencioso();
    }
}

function incaMarcarInterfazLista() {
    INCA_STARTUP_FAST.interfazLista = true;
    document.documentElement.classList.add('inca-app-ready');
    document.documentElement.classList.remove('inca-app-booting');
}


/* =========================================================
   INCA STATS V15.8 — SPLASH + PRECARGA DEL NÚCLEO
   ========================================================= */


/* =========================================================
   INCA STATS V15.9 — LOGOS ROBUSTOS + ARRANQUE FLASH
   ========================================================= */

const INCA_LOGOS = {
    promesa: null,
    cargados: false,
    indiceFlexible: new Map()
};

function normalizarNombreEquipoLogo(nombre) {
    return claveTexto(nombre)
        .replace(/\b(?:AFC|FC|CF|SC|AC|CD|UD|RC|FK|SK|BK|SV|AS|US|CA)\b/g, ' ')
        .replace(/\b(?:FOOTBALL CLUB|FUTBOL CLUB|CLUB DE FUTBOL)\b/g, ' ')
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function variantesNombreEquipoLogo(nombre) {
    const base = normalizarNombreEquipoLogo(nombre);
    const tokens = base.split(' ').filter(Boolean);
    const variantes = new Set([
        claveTexto(nombre),
        base,
        base.replace(/\s+/g, '')
    ]);

    if (tokens.length > 1) {
        variantes.add(tokens.join(''));
        variantes.add(tokens.slice(0, -1).join(' '));
    }

    const alias = {
        'WOLVERHAMPTON WANDERERS': 'WOLVERHAMPTON',
        'WOLVES': 'WOLVERHAMPTON',
        'BRIGHTON AND HOVE ALBION': 'BRIGHTON HOVE ALBION',
        'BRIGHTON HOVE ALBION': 'BRIGHTON HOVE ALBION',
        'NOTTM FOREST': 'NOTTINGHAM FOREST',
        'MAN UTD': 'MANCHESTER UNITED',
        'MAN CITY': 'MANCHESTER CITY',
        'SPURS': 'TOTTENHAM HOTSPUR',
        'NEWCASTLE': 'NEWCASTLE UNITED',
        'WEST HAM': 'WEST HAM UNITED',
        'ASTON VILLA FC': 'ASTON VILLA',
        'LIVERPOOL': 'LIVERPOOL FC'
    };

    for (const variante of [...variantes]) {
        if (alias[variante]) variantes.add(alias[variante]);
    }

    return [...variantes].filter(Boolean);
}

function aplanarLogos(payload) {
    const salida = {};

    const recorrer = valor => {
        if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return;

        for (const [clave, contenido] of Object.entries(valor)) {
            if (typeof contenido === 'string' && /^https?:\/\//i.test(contenido.trim())) {
                salida[clave] = contenido.trim();
            } else if (contenido && typeof contenido === 'object') {
                recorrer(contenido);
            }
        }
    };

    recorrer(payload);
    return salida;
}

function construirIndiceFlexibleLogos(diccionario) {
    INCA_LOGOS.indiceFlexible.clear();

    for (const [equipo, url] of Object.entries(diccionario || {})) {
        for (const variante of variantesNombreEquipoLogo(equipo)) {
            if (!INCA_LOGOS.indiceFlexible.has(variante)) {
                INCA_LOGOS.indiceFlexible.set(variante, url);
            }
        }
    }
}

async function cargarLogos() {
    if (INCA_LOGOS.cargados && Object.keys(estadoApp.logosDict || {}).length) {
        return estadoApp.logosDict;
    }
    if (INCA_LOGOS.promesa) return INCA_LOGOS.promesa;

    INCA_LOGOS.promesa = (async () => {
        try {
            await window.INCA_TITAN?.ensureReady?.();
            const catalogo = window.INCA_TITAN?.getCatalog?.();
            const equipos = catalogo?.teams || [];
            const planos = {};

            for (const team of equipos) {
                const url = window.INCA_TITAN?.logoUrl?.(team.name, team.team_id) || '';
                if (url) planos[team.name] = url;
            }

            estadoApp.logosDict = planos;
            construirIndiceFlexibleLogos(planos);
            INCA_LOGOS.cargados = true;
            console.info(`[INCA LOGOS FAST] ${Object.keys(planos).length} escudos WebP locales indexados`);
            return planos;
        } catch (error) {
            console.warn('[INCA LOGOS] No se pudo construir el índice TITAN de logos.', error);
            estadoApp.logosDict = {};
            construirIndiceFlexibleLogos({});
            return estadoApp.logosDict;
        }
    })();

    try {
        return await INCA_LOGOS.promesa;
    } finally {
        INCA_LOGOS.promesa = null;
    }
}

function obtenerEscudoEquipo(nombreEquipo) {
    const nombre = normalizarTexto(nombreEquipo);
    if (!nombre) return '';
    const titanDirecto = window.INCA_TITAN?.logoUrl?.(nombre);
    if (titanDirecto) return titanDirecto;

    for (const variante of variantesNombreEquipoLogo(nombre)) {
        const encontrada = INCA_LOGOS.indiceFlexible.get(variante);
        if (encontrada) return encontrada;
    }

    // V4.25: no hacemos coincidencias parciales/fuzzy para escudos.
    // Si no hay match normalizado real, se deja sin logo para evitar asignar un club equivocado.
    return '';
}

function crearAvatarEquipoFallback(nombreEquipo) {
    // V4.25: no inventar escudos. Si no existe logo real, la UI deja el espacio vacío.
    return '';
}

function refrescarEscudosVisibles() {
    document.querySelectorAll(
        'img[data-equipo-logo], img[data-team], img[data-equipo], img.inca-match-logo, #visualTeamLogo'
    ).forEach(img => {
        const equipo =
            img.dataset.equipoLogo ||
            img.dataset.team ||
            img.dataset.equipo ||
            img.dataset.nombreEquipo ||
            img.alt?.replace(/^Escudo de\s+/i, '') ||
            '';

        if (!equipo) return;
        const ruta = obtenerEscudoEquipo(equipo);
        if (!ruta) {
            img.removeAttribute('src');
            img.style.display = 'none';
            return;
        }
        img.style.display = '';
        img.onerror = () => {
            img.onerror = null;
            img.removeAttribute('src');
            img.style.display = 'none';
        };
        img.src = ruta;
    });
}

function incaDespuesDePintar(callback) {
    requestAnimationFrame(() => {
        setTimeout(callback, 0);
    });
}

async function inicializarApp() {
    document.documentElement.classList.add('inca-flash-start');

    // La interfaz queda disponible en el primer frame.
    requestAnimationFrame(() => {
        actualizarEtiquetasTemporadaPorLiga('escaner');
        actualizarEtiquetasTemporadaPorLiga('pro');
        document.documentElement.classList.add('inca-app-ready');
        document.documentElement.classList.remove('inca-flash-start');
        setTimeout(() => activarPrimerMenuAutomatico(), 0);
    });

    // Solo se carga lo indispensable para el Escáner inicial.
    // Player VIP, Leaderboard, caras e IDs se cargan cuando se abre cada módulo.
    const tareasIniciales = [];

    if (typeof cargarLogos === 'function') {
        tareasIniciales.push(
            cargarLogos().catch(error => console.warn('[INCA START] Logos', error))
        );
    }

    if (typeof cargarBaseDeDatos === 'function') {
        tareasIniciales.push(
            new Promise(resolve => requestAnimationFrame(resolve))
                .then(() => cargarBaseDeDatos('escaner'))
                .catch(error => console.warn('[INCA START] Escáner', error))
        );
    }

    Promise.allSettled(tareasIniciales).then(() => {
        refrescarEscudosVisibles();
        activarPrimerMenuAutomatico();
    });

    // Service Worker: registro único centralizado en app.js.
}



function sincronizarSelectorLigaDataPro() {
    const select = document.getElementById('selectLigaPro');
    const wrap = document.getElementById('dataProCompetitionWrap');
    if (!select || !wrap) return;

    if (select.dataset.leagueLogoEnhanced === '1') {
        wrap.classList.add('is-custom-league-active');
        wrap.classList.remove('has-data-pro-logo');
        wrap.style.removeProperty('--data-pro-comp-logo');
        return;
    }

    const compId = Number(window.INCA_TITAN?.competitionId?.(select.value) || 0);
    if (compId) {
        wrap.classList.add('has-data-pro-logo');
        wrap.style.setProperty('--data-pro-comp-logo', `url("./TITAN_LOGOS_COMP/logos_png/${compId}.png")`);
    } else {
        wrap.classList.remove('has-data-pro-logo');
        wrap.style.setProperty('--data-pro-comp-logo', 'none');
    }
}

function nombresPermitidosFaseDataPro() {
    const phase = obtenerFaseDataProActual();
    return new Set((phase?.memberTeamNames || []).map(nombre => claveTexto(nombre)).filter(Boolean));
}

function obtenerFaseDataProActual() {
    const phases = Array.isArray(estadoApp.pro.tablePhases) ? estadoApp.pro.tablePhases : [];
    const key = estadoApp.dbState.phaseKey || document.getElementById('selectFasePro')?.value || '';
    return phases.find(p => p.key === key) || phases[0] || null;
}

function contextoCuposFasesDataProActual() {
    if (!window.INCA_QUALIFICATION || !window.INCA_TITAN) return null;
    const liga = document.getElementById('selectLigaPro');
    const temporada = document.getElementById('selectTemporadaPro');
    const compId = Number(window.INCA_TITAN.competitionId?.(liga?.value) || 0);
    const seasonId = Number(window.INCA_TITAN.seasonId?.(temporada?.value) || 0);
    if (!compId || !seasonId) return null;
    const phase = obtenerFaseDataProActual();
    return window.INCA_QUALIFICATION.context?.(compId, seasonId, phase?.key || 'REGULAR', phase?.label || '') || null;
}

function renderizarCuposFasesDataPro() {
    const box = document.getElementById('dbQualificationContext');
    const title = document.getElementById('dbQualificationTitle');
    const meta = document.getElementById('dbQualificationMeta');
    const zonesBox = document.getElementById('dbQualificationZones');
    if (!box || !zonesBox) return;

    const ctx = contextoCuposFasesDataProActual();
    if (!ctx) {
        box.hidden = true;
        zonesBox.replaceChildren();
        return;
    }

    const tableZones = window.INCA_QUALIFICATION?.compactZones?.(ctx) || [];
    const zones = tableZones.length ? tableZones : (window.INCA_QUALIFICATION?.compactLeagueSummary?.(ctx.league) || []);
    if (!zones.length) {
        box.hidden = true;
        zonesBox.replaceChildren();
        return;
    }

    box.hidden = false;
    if (title) title.textContent = String(ctx.table?.name || ctx.league?.season_name || 'Estructura de la competición');
    if (meta) {
        const tables = Array.isArray(ctx.league?.tables) ? ctx.league.tables.length : 0;
        const sourceMeta = window.INCA_QUALIFICATION?.metadata?.();
        meta.textContent = `${ctx.league?.competition_name || 'Competición'} · ${zones.length} cupos/fases${tables > 1 ? ` · ${tables} tablas oficiales` : ''}${sourceMeta?.updated_at ? ` · actualizado ${String(sourceMeta.updated_at).slice(0,10)}` : ''}`;
    }

    zonesBox.innerHTML = zones.map(zone => `
        <span class="db-qzone ${escaparHTML(zone.ui_class || 'qzone-other')}" title="${escaparHTML(zone.raw_label || zone.ui_label || '')}">
            <b>${escaparHTML(zone.positions_label || '—')}</b>
            <em>${escaparHTML(zone.ui_label || zone.raw_label || zone.code || 'Fase')}</em>
        </span>
    `).join('');
}

async function asegurarCuposFasesDataPro() {
    if (!window.INCA_QUALIFICATION?.ensureReady) return;
    try {
        await window.INCA_QUALIFICATION.ensureReady();
        renderizarCuposFasesDataPro();
    } catch (error) {
        console.warn('[INCA DATA PRO] Cupos/fases no disponibles.', error?.message || error);
        const box = document.getElementById('dbQualificationContext');
        if (box) box.hidden = true;
    }
}

function actualizarContextoFaseDataPro() {
    const phase = obtenerFaseDataProActual();
    const group = document.getElementById('faseTablaProGroup');
    const meta = document.getElementById('faseTablaProMeta');
    const context = document.getElementById('dbPhaseContext');
    const contextLabel = document.getElementById('dbPhaseContextLabel');
    const contextMeta = document.getElementById('dbPhaseContextMeta');

    if (!phase) {
        if (group) group.hidden = true;
        if (context) context.hidden = true;
        return;
    }

    const showSelector = (estadoApp.pro.tablePhases || []).length > 1;
    if (group) group.hidden = !showSelector;

    const progress = estadoApp.pro.seasonProgress || null;
    const phaseIsSplit = String(phase?.type || '').toUpperCase() === 'SPLIT';
    const eventCount = phaseIsSplit ? (phase.eventCount || 0) : (progress?.eventCount || phase.eventCount || 0);
    const teamCount = phaseIsSplit ? (phase.teamCount || 0) : (progress?.teamCount || phase.teamCount || 0);
    const resumen = `${teamCount} equipos · ${eventCount} partidos`;
    if (meta) meta.textContent = resumen;

    if (context) context.hidden = false;
    if (contextLabel) contextLabel.textContent = phase.label || phase.key;
    if (contextMeta) {
        const parts = [resumen];

        if (!phaseIsSplit && progress?.maxPj) {
            const behind = Array.isArray(progress.behindTeams) ? progress.behindTeams : [];
            if (behind.length) {
                parts.push(`jornada ${progress.maxPj} en curso · ${behind.length} equipo${behind.length === 1 ? '' : 's'} con partido pendiente`);
            } else {
                parts.push(`${progress.maxPj} jornadas disputadas`);
            }
        }

        if (!phaseIsSplit && progress?.maxRound && progress.maxRound !== progress.maxPj) {
            parts.push(`ronda calendario ${progress.maxRound}`);
        }

        const pendingRounds = !phaseIsSplit && Array.isArray(progress?.pendingPastRounds) ? progress.pendingPastRounds : [];
        if (pendingRounds.length) {
            parts.push(`ronda${pendingRounds.length === 1 ? '' : 's'} ${pendingRounds.join(', ')} reprogramada${pendingRounds.length === 1 ? '' : 's'}`);
        } else if (!phaseIsSplit && Array.isArray(progress?.missingRounds) && progress.missingRounds.length) {
            parts.push(`ronda${progress.missingRounds.length === 1 ? '' : 's'} ${progress.missingRounds.join(', ')} sin completar`);
        }

        parts.push('solo liga · eliminatorias excluidas');
        contextMeta.textContent = parts.join(' · ');
    }

    renderizarCuposFasesDataPro();
    if (!contextoCuposFasesDataProActual()) void asegurarCuposFasesDataPro();
}

function configurarFasesDataPro(result, contextKey) {
    const phases = Array.isArray(result?.tablePhases) && result.tablePhases.length
        ? result.tablePhases
        : [{ key:'REGULAR', label:'Temporada regular', type:'REGULAR', teamCount:0, eventCount:0 }];

    estadoApp.pro.datasetCompleto = Array.isArray(result?.data) ? result.data : [];
    estadoApp.pro.tablePhases = phases;
    estadoApp.pro.seasonProgress = result?.seasonProgress || null;
    estadoApp.pro.seasonRoster = Array.isArray(result?.rosterTeams) ? result.rosterTeams.slice() : (estadoApp.pro.seasonRoster || []);

    const sameContext = estadoApp.pro.phaseContextKey === contextKey;
    const previous = sameContext ? estadoApp.dbState.phaseKey : '';
    const validPrevious = previous && phases.some(p => p.key === previous);
    const nextKey = validPrevious
        ? previous
        : (result?.defaultTablePhase && phases.some(p => p.key === result.defaultTablePhase)
            ? result.defaultTablePhase
            : (phases.find(p => p.key === 'REGULAR')?.key || phases[0]?.key || 'REGULAR'));

    estadoApp.pro.phaseContextKey = contextKey;
    estadoApp.dbState.phaseKey = nextKey;

    const select = document.getElementById('selectFasePro');
    if (select) {
        select.innerHTML = phases.map(phase =>
            `<option value="${escaparHTML(phase.key)}">${escaparHTML(phase.label)}</option>`
        ).join('');
        select.value = nextKey;
    }

    actualizarContextoFaseDataPro();
}

function dataFaseProActual() {
    const full = Array.isArray(estadoApp.pro.datasetCompleto) ? estadoApp.pro.datasetCompleto : [];
    const key = estadoApp.dbState.phaseKey || '';
    if (!key) return full.slice();
    if (window.INCA_TITAN?.filterTablePhase) return window.INCA_TITAN.filterTablePhase(full, key);
    return full.filter(row => String(row?.Table_Bucket || 'REGULAR') === key);
}

function cambiarFaseDataPro() {
    const select = document.getElementById('selectFasePro');
    if (!select) return;

    estadoApp.dbState.phaseKey = select.value || '';
    const data = dataFaseProActual();

    if (!data.length) {
        console.warn('[INCA DATA PRO] La fase seleccionada no contiene filas.', estadoApp.dbState.phaseKey);
        return;
    }

    const status = document.getElementById('statusCargaPro');
    if (status) {
        const phase = obtenerFaseDataProActual();
        status.className = 'status-dot ready';
        status.title = `${phase?.label || 'Fase'} · ${phase?.eventCount || 0} partidos`;
    }

    procesarMatriz('pro', data);
    sincronizarSelectorLigaDataPro();
    actualizarContextoFaseDataPro();
    renderizarDatabase();
}

window.addEventListener('inca:qualification-ready', () => {
    renderizarCuposFasesDataPro();
    if (estadoApp?.vistaActiva === 'database') {
        try { renderizarDatabase(); } catch (error) { console.warn('[INCA DATA PRO] Re-render de cupos/fases', error); }
    }
});

async function cargarBaseDeDatos(modulo) {
    if (!['escaner', 'pro'].includes(modulo)) return;

    const idLiga = modulo === 'pro' ? 'selectLigaPro' : 'selectLiga';
    const idTemp = modulo === 'pro' ? 'selectTemporadaPro' : 'selectTemporada';
    const idStatus = modulo === 'pro' ? 'statusCargaPro' : 'statusCarga';
    const selectLiga = document.getElementById(idLiga);
    const selectTemporada = document.getElementById(idTemp);
    const statusBox = document.getElementById(idStatus);
    if (!selectLiga || !selectTemporada) return;

    // TITAN es la fuente primaria. Si el catálogo no responde, el flujo V4_22
    // original queda disponible como fallback sin borrar sus enlaces.
    if (window.INCA_TITAN?.enabled) {
        try {
            await window.INCA_TITAN.ensureReady();
            if (!window.INCA_TITAN.isTitanLeague(selectLiga.value)) {
                // El init convierte automáticamente las selecciones legacy
                // conocidas a su Competition_ID TITAN equivalente.
            } else if (!window.INCA_TITAN.isTitanSeason(selectTemporada.value)) {
                window.INCA_TITAN.updateSeasonSelector(modulo);
            }

            if (window.INCA_TITAN.isTitanLeague(selectLiga.value) && window.INCA_TITAN.isTitanSeason(selectTemporada.value)) {
                const liga = selectLiga.value;
                const temporada = selectTemporada.value;
                const solicitudId = ++estadoApp.solicitudes[modulo];

                if (statusBox) {
                    statusBox.className = 'status-dot loading';
                    statusBox.title = 'Sincronizando TITAN...';
                }

                if (modulo === 'escaner') {
                    const skeleton = `<tr><td colspan="4" style="padding:15px;"><div class="skeleton-box" style="height:35px;width:100%;border-radius:6px;"></div></td></tr>`.repeat(4);
                    const home = document.getElementById('tablaResultadosHome');
                    const away = document.getElementById('tablaResultadosAway');
                    if (home) home.innerHTML = skeleton;
                    if (away) away.innerHTML = skeleton;
                }

                const result = await window.INCA_TITAN.loadCompetitionSeason(
                    liga,
                    temporada,
                    progress => {
                        if (!statusBox || solicitudId !== estadoApp.solicitudes[modulo]) return;
                        statusBox.title = `TITAN: ${progress.completed}/${progress.total} equipos${progress.team ? ` · ${progress.team}` : ''}`;
                    }
                );

                if (solicitudId !== estadoApp.solicitudes[modulo]) return;

                const targetState = modulo === 'pro' ? estadoApp.pro : estadoApp.escaner;
                targetState.seasonRoster = Array.isArray(result?.rosterTeams) ? result.rosterTeams.slice() : [];

                if (!Array.isArray(result.data) || result.data.length === 0) {
                    // V64F: current season remains current. Never borrow old campaign data.
                    if (modulo === 'pro') {
                        const contextKey = `${liga}|${temporada}`;
                        configurarFasesDataPro(result, contextKey);
                        procesarMatriz('pro', []);
                        sincronizarSelectorLigaDataPro();
                        actualizarContextoFaseDataPro();

                        estadoApp.pro.v64fCurrentEmpty = esTemporadaActualDataProV64F();
                        if (estadoApp.pro.v64fCurrentEmpty) {
                            await prepararEquiposDataProActualV64F(liga,temporada);
                            await renderDataProActualVacioV64F();
                        }
                    } else {
                        procesarMatriz('escaner', []);
                    }
                    if (statusBox) {
                        statusBox.className = 'status-dot ready';
                        statusBox.title = `${result.label} · temporada actual sin partidos todavía`;
                    }
                    return;
                }

                validarColumnas(result.data, ['Equipo', 'Tiempo'], result.label);
                if (modulo === 'pro') estadoApp.pro.v64fCurrentEmpty = false;

                if (modulo === 'pro') {
                    const contextKey = `${liga}|${temporada}`;
                    configurarFasesDataPro(result, contextKey);
                    procesarMatriz('pro', dataFaseProActual());
                    sincronizarSelectorLigaDataPro();
                    actualizarContextoFaseDataPro();
                } else {
                    procesarMatriz(modulo, result.data);
                }

                if (statusBox) {
                    const phase = modulo === 'pro' ? obtenerFaseDataProActual() : null;
                    const progress = modulo === 'pro' ? result?.seasonProgress : null;
                    const suspiciousCalendar = Boolean(
                        progress &&
                        progress.teamCount >= 14 &&
                        progress.maxPj > 0 &&
                        progress.eventCount < Math.max(40, progress.teamCount * 4)
                    );

                    // V4: una temporada en curso con pocas jornadas NO está "cargando".
                    // Antes se dejaba la clase loading y el toast quedaba abierto para siempre.
                    statusBox.className = suspiciousCalendar ? 'status-dot ready partial' : 'status-dot ready';
                    statusBox.title = suspiciousCalendar
                        ? `${result.label} · temporada en curso (${progress.eventCount} partidos disponibles)`
                        : phase
                            ? `${result.label} · ${phase.label} · ${progress?.eventCount || phase.eventCount} partidos`
                            : `${result.label} · ${result.files} archivos de equipo`;
                }
                return;
            }
        } catch (error) {
            console.error('[INCA TITAN] Error al cargar dataset. Se intentará fallback V4_22 cuando exista.', error);
            // Solo se continúa al fallback si la selección todavía es legacy.
            if (window.INCA_TITAN?.isTitanLeague?.(selectLiga.value)) {
                if (statusBox) {
                    statusBox.className = 'status-dot error';
                    statusBox.title = 'Error cargando TITAN';
                }
                if (modulo === 'escaner') {
                    const mensaje = escaparHTML(error.message || 'No se pudieron sincronizar los datos TITAN.');
                    const fila = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--bar-red);"><i class="fa-solid fa-triangle-exclamation"></i> ${mensaje}</td></tr>`;
                    const home = document.getElementById('tablaResultadosHome');
                    const away = document.getElementById('tablaResultadosAway');
                    if (home) home.innerHTML = fila;
                    if (away) away.innerHTML = fila;
                }
                return;
            }
        }
    }

    // -------------------- FLUJO V4_22 ORIGINAL (FALLBACK) --------------------
    const liga = selectLiga.value;
    const temporada = selectTemporada.value;
    const url = CONFIG_ENLACES?.[liga]?.[temporada] || '';
    const solicitudId = ++estadoApp.solicitudes[modulo];

    if (!url) {
        if (statusBox) {
            statusBox.className = 'status-dot error';
            statusBox.title = 'Sin datos configurados';
        }
        return;
    }

    if (statusBox) {
        statusBox.className = 'status-dot loading';
        statusBox.title = 'Sincronizando...';
    }

    if (modulo === 'escaner') {
        const skeleton = `<tr><td colspan="4" style="padding:15px;"><div class="skeleton-box" style="height:35px;width:100%;border-radius:6px;"></div></td></tr>`.repeat(4);
        const home = document.getElementById('tablaResultadosHome');
        const away = document.getElementById('tablaResultadosAway');
        if (home) home.innerHTML = skeleton;
        if (away) away.innerHTML = skeleton;
    }

    try {
        const data = await obtenerCSVRemoto(url, {
            cacheKey: `inca_partidos_v4_${liga}_${temporada}`,
            ttl: INCA_CONFIG.CACHE_TTL_MS,
            transformHeader: normalizarCabeceraPartidos
        });

        if (solicitudId !== estadoApp.solicitudes[modulo]) return;
        validarColumnas(data, ['Equipo', 'Tiempo'], `${liga} ${temporada}`);
        if (modulo === 'pro') {
            estadoApp.pro.datasetCompleto = data;
            estadoApp.pro.tablePhases = [{ key:'REGULAR', label:'Temporada regular', type:'REGULAR', eventCount:0, teamCount:0 }];
            estadoApp.dbState.phaseKey = 'REGULAR';
            estadoApp.pro.phaseContextKey = `${liga}|${temporada}`;
            actualizarContextoFaseDataPro();
        }
        procesarMatriz(modulo, data);

        if (statusBox) {
            statusBox.className = 'status-dot ready';
            statusBox.title = 'Datos sincronizados';
        }
    } catch (error) {
        if (solicitudId !== estadoApp.solicitudes[modulo]) return;
        if (statusBox) {
            statusBox.className = 'status-dot error';
            statusBox.title = 'Error de conexión o formato';
        }
        console.error(`Error al cargar ${modulo}:`, error);

        if (modulo === 'escaner') {
            const mensaje = escaparHTML(error.message || 'No se pudieron sincronizar los datos.');
            const fila = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--bar-red);"><i class="fa-solid fa-triangle-exclamation"></i> ${mensaje}</td></tr>`;
            const home = document.getElementById('tablaResultadosHome');
            const away = document.getElementById('tablaResultadosAway');
            if (home) home.innerHTML = fila;
            if (away) away.innerHTML = fila;
        }
    }
}

function procesarMatriz(modulo, dataRaw) {
    const state = modulo === 'pro' ? estadoApp.pro : estadoApp.escaner;
    state.matrizCrudaCSV = Array.isArray(dataRaw) ? dataRaw : [];
    state.datosProcesados = {};
    state.datosPartidosFull = [];

    const equipos = new Set();
    const partidos = new Map();
    const diagnostico = { filasTotales: state.matrizCrudaCSV.length, filasValidas: 0, filasOmitidas: 0, tiemposInvalidos: 0, condicionesInvalidas: 0 };

    state.matrizCrudaCSV.forEach((row, indice) => {
        const equipoCompuesto = normalizarTexto(row?.Equipo);
        const tiempo = normalizarTiempo(row?.Tiempo);
        if (!equipoCompuesto || !tiempo) {
            diagnostico.filasOmitidas++;
            if (equipoCompuesto && !tiempo) diagnostico.tiemposInvalidos++;
            return;
        }

        const separador = equipoCompuesto.indexOf(' - ');
        if (separador < 0) {
            diagnostico.filasOmitidas++;
            return;
        }

        const condicion = normalizarCondicion(equipoCompuesto.slice(0, separador));
        const partido = separarPartido(equipoCompuesto.slice(separador + 3));
        if (!condicion || condicion === 'NEUTRO' || !partido) {
            diagnostico.filasOmitidas++;
            if (!condicion) diagnostico.condicionesInvalidas++;
            return;
        }

        const { local, visita } = partido;
        equipos.add(local);
        equipos.add(visita);

        const fecha = normalizarTexto(obtenerValor(row, ['Fecha', 'Date'], 'N/A')) || 'N/A';
        const jornada = normalizarTexto(obtenerValor(row, ['Jornada', 'Matchweek', 'Round'], ''));
        const idExterno = normalizarTexto(obtenerValor(row, ['ID_Partido', 'Partido_ID', 'Event_ID', 'ID_Evento'], ''));
        const clavePartido = idExterno
            ? `ID:${idExterno}`
            : `${claveTexto(fecha)}||${claveTexto(jornada)}||${claveTexto(local)}||${claveTexto(visita)}`;

        if (!partidos.has(clavePartido)) {
            const fechaObj = parseDate(fecha);
            partidos.set(clavePartido, {
                id: clavePartido,
                local,
                visita,
                fecha,
                jornada,
                orden: indice,
                sortTime: Number.isFinite(fechaObj.getTime()) ? fechaObj.getTime() : 0,
                ALL: { sLocal: {}, sVisita: {} },
                '1ST': { sLocal: {}, sVisita: {} },
                '2ND': { sLocal: {}, sVisita: {} }
            });
        }

        const match = partidos.get(clavePartido);
        const objStats = condicion === 'LOCAL' ? match[tiempo].sLocal : match[tiempo].sVisita;
        const amarillas = primerNumero(row, ['Tarjetas Amarillas', 'Yellow cards', 'HY', 'AY'], 0);
        const rojas = primerNumero(row, ['Tarjetas Rojas', 'Red cards', 'HR', 'AR'], 0);
        const segundasAmarillasRojas = primerNumero(row, ['Second_Yellow_Reds','second_yellow_red','Second Yellow Reds','Yellow-red cards'], 0);
        const bookingPoints = window.INCA_TITAN?.bookingPointsInca
            ? window.INCA_TITAN.bookingPointsInca(amarillas, rojas, segundasAmarillasRojas)
            : (rojas > 0 ? rojas*20 + (amarillas > 0 ? 10 : 0) : amarillas*10);

        Object.assign(objStats, {
            'Goles': primerNumero(row, ['Goles', 'Goals', 'Score'], 0),
            'Tiros Totales': primerNumero(row, ['Tiros Totales', 'Total shots', 'HS'], 0),
            'Tiros a Puerta': primerNumero(row, ['Tiros a Puerta', 'Shots on target', 'HST'], 0),
            'Fueras de Juego': primerNumero(row, ['Fueras de Juego', 'Offsides'], 0),
            'Faltas': primerNumero(row, ['Faltas', 'Fouls', 'HF'], 0),
            'Tarjetas': amarillas + rojas,
            // V49: la segunda amarilla que produce roja no suma otros 10 puntos.
            'Puntos por Tarjetas': bookingPoints,
            'Tarjetas Rojas': rojas,
            'Segunda Amarilla Roja': segundasAmarillasRojas,
            'Córners': primerNumero(row, ['Córners', 'Corner kicks', 'HC'], 0),
            'Córners Handicap': 0,
            'Saques de Meta': primerNumero(row, ['Saques de Meta', 'Goal kicks'], 0),
            'Saques de Banda': primerNumero(row, ['Saques de Banda', 'Throw-ins', 'Throw ins'], 0),
            'Pases': primerNumero(row, ['Pases', 'Passes', 'Total passes', 'Total Passes'], 0),
            'Entradas': primerNumero(row, ['Entradas', 'Total tackles', 'Tackles'], 0)
        });
        diagnostico.filasValidas++;
    });

    const partidosOrdenados = Array.from(partidos.values()).sort((a, b) => a.sortTime - b.sortTime || a.orden - b.orden);
    partidosOrdenados.forEach(match => {
        match.ALL.sLocal['Goles 1er Tiempo'] = aNumero(match['1ST'].sLocal.Goles, 0);
        match.ALL.sLocal['Goles 2do Tiempo'] = aNumero(match['2ND'].sLocal.Goles, 0);
        match.ALL.sVisita['Goles 1er Tiempo'] = aNumero(match['1ST'].sVisita.Goles, 0);
        match.ALL.sVisita['Goles 2do Tiempo'] = aNumero(match['2ND'].sVisita.Goles, 0);

        ['ALL', '1ST', '2ND'].forEach(tiempo => {
            state.datosProcesados[`${match.id}||${tiempo}`] = {
                id: match.id,
                tiempo,
                local: match.local,
                visita: match.visita,
                fecha: match.fecha,
                jornada: match.jornada,
                sortTime: match.sortTime,
                orden: match.orden,
                sLocal: match[tiempo].sLocal,
                sVisita: match[tiempo].sVisita
            };
        });

        state.datosPartidosFull.push({
            id: match.id,
            local: match.local,
            visita: match.visita,
            fecha: match.fecha,
            jornada: match.jornada,
            sortTime: match.sortTime,
            orden: match.orden,
            sLocal: match.ALL.sLocal,
            sVisita: match.ALL.sVisita,
            sLocal1T: match['1ST'].sLocal,
            sVisita1T: match['1ST'].sVisita,
            sLocal2T: match['2ND'].sLocal,
            sVisita2T: match['2ND'].sVisita
        });
    });

    state.diagnostico = diagnostico;

    // Puente de datos para el portal. Expone únicamente lecturas derivadas de la
    // temporada cargada; no permite mutar el estado interno del analizador.
    window.INCA_DATA_BRIDGE = Object.freeze({
        getMatches: () => estadoApp.escaner.datosPartidosFull.map(match => ({
            ...match,
            sLocal: { ...match.sLocal },
            sVisita: { ...match.sVisita },
            sLocal1T: { ...match.sLocal1T },
            sVisita1T: { ...match.sVisita1T },
            sLocal2T: { ...match.sLocal2T },
            sVisita2T: { ...match.sVisita2T }
        })),
        getTeams: () => Array.from(new Set(estadoApp.escaner.datosPartidosFull.flatMap(match => [match.local, match.visita]))).sort((a,b)=>a.localeCompare(b,'es')),
        getLeague: () => document.getElementById('selectLiga')?.value || '',
        getSeason: () => document.getElementById('selectTemporada')?.value || '',
        getSelectedTeam: () => document.getElementById('selectEquipo')?.value || '',
        getStatus: () => ({
            matches: estadoApp.escaner.datosPartidosFull.length,
            rows: estadoApp.escaner.matrizCrudaCSV.length,
            diagnostic: { ...estadoApp.escaner.diagnostico }
        })
    });
    window.dispatchEvent(new CustomEvent('inca:data-ready', { detail: window.INCA_DATA_BRIDGE.getStatus() }));

    if (diagnostico.filasOmitidas > 0) console.warn(`[${modulo}] Filas omitidas durante el procesamiento:`, diagnostico);

    const rosterActual = Array.isArray(state.seasonRoster) ? state.seasonRoster : [];
    rosterActual.forEach(team => { const name=String(team?.name||'').trim(); if(name)equipos.add(name); });

    const idSelect = modulo === 'pro' ? 'selectEquipoPro' : 'selectEquipo';
    const select = document.getElementById(idSelect);
    if (select) {
        let listaEquipos = Array.from(equipos);

        if (modulo === 'pro') {
            const permitidos = nombresPermitidosFaseDataPro();
            if (permitidos.size) listaEquipos = listaEquipos.filter(nombre => permitidos.has(claveTexto(nombre)));
        }

        const opciones = listaEquipos
            .sort((a, b) => a.localeCompare(b, 'es'))
            .map(equipo => ({ value: equipo, label: equipo.toUpperCase() }));
        const preferido = modulo === 'escaner' ? leerStorage(localStorage, 'prefEquipo', null) : select.value;
        rellenarSelectSeguro(select, opciones, preferido);
        refrescarSelectCustom(idSelect);
    }

    if (modulo === 'escaner' && estadoApp.vistaActiva === 'escaner') actualizarEscaner();
    if (modulo === 'pro' && estadoApp.vistaActiva === 'database') renderizarDatabase();
}

function actualizarAvatar(nombre, modulo) {
    if (!nombre) return;
    const logoUrl = obtenerEscudoEquipo(nombre);
    const aplicar = img => {
        if (!img) return;
        if (!logoUrl) {
            img.removeAttribute('src');
            img.style.display = 'none';
            return;
        }
        img.style.display = 'block';
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onerror = () => {
            img.onerror = null;
            img.removeAttribute('src');
            img.style.display = 'none';
        };
        img.src = logoUrl;
    };

    if (modulo === 'escaner') {
        aplicar(document.getElementById('logoEquipoMain'));
    } else {
        aplicar(document.getElementById('logoEquipoProMain'));
        aplicar(document.getElementById('dbTeamLogo'));
    }
}

// ==========================================================================
// 2. MÓDULO 1: ESCÁNER LIVE (CONTROLADOR + VISTA DEBOUNCED)
// ==========================================================================

function seleccionarMercado(mercado, elemento) {
    if (estadoApp.vistaActiva !== 'escaner') volverAlEscanerOriginal();

    document.querySelectorAll('.menu-option').forEach(opt => opt.classList.remove('active'));
    elemento?.classList.add('active');

    estadoApp.mercadoSeleccionado = mercado;
    document.getElementById('tituloMercado').innerText = mercado.toUpperCase();

    configurarSelectorPeriodoMercado(mercado);

    const labelSub = document.getElementById('labelSubMercadoEscaner');
    const labelLinea = document.getElementById('labelLineaEscaner');
    if (labelSub) labelSub.textContent = esMercadoResultadoEscaner(mercado) ? 'TIPO DE RESULTADO' : 'TIPO DE ESTADÍSTICA';
    if (labelLinea) labelLinea.textContent = esMercadoResultadoEscaner(mercado) ? 'SELECCIÓN' : 'LÍNEA / OVER';

    actualizarDropdownSubMercado();
    actualizarEscaner();
    if (window.innerWidth <= 1100) toggleMobileMenu(false);
}

function actualizarDropdownSubMercado() {
    const select = document.getElementById('selectSubMercado');
    const limites = LIMITES_MERCADO[estadoApp.mercadoSeleccionado];
    if (!select || !limites) return;

    const subMercados = Object.keys(limites);
    const preferido = leerStorage(localStorage, 'prefSubMercado', null);
    if (preferido && subMercados.includes(preferido)) estadoApp.subMercadoSeleccionado = preferido;
    else if (!subMercados.includes(estadoApp.subMercadoSeleccionado)) estadoApp.subMercadoSeleccionado = subMercados[0];

    rellenarSelectSeguro(select, subMercados.map(sub => ({ value: sub, label: sub.toUpperCase() })), estadoApp.subMercadoSeleccionado);
    refrescarSelectCustom('selectSubMercado');
    actualizarDropdownLinea();
}

function cambiarSubMercado() {
    let select = document.getElementById('selectSubMercado');
    if(select) estadoApp.subMercadoSeleccionado = select.value;
    actualizarDropdownLinea();
    actualizarEscaner();
}


function esLineaManualMercadoActual() {
    return obtenerLimitesMercadoActual()?.kind === 'manual';
}

function valorLineaEscanerActual() {
    if (esLineaManualMercadoActual()) {
        const manual = document.getElementById('inputLineaManual');
        const value = Number(String(manual?.value || '').replace(',','.'));
        return Number.isFinite(value) ? value : null;
    }

    const select = document.getElementById('inputLinea');
    if (!select || !String(select.value || '').trim()) return null;
    return esMercadoResultadoEscaner()
        ? String(select.value).toUpperCase()
        : Number(select.value);
}

function cambiarLineaManualEscaner() {
    const value = valorLineaEscanerActual();
    if (Number.isFinite(value)) {
        const p = obtenerPeriodoEscanerActivo();
        estadoApp.memoriaLineas[`${estadoApp.mercadoSeleccionado}_${estadoApp.subMercadoSeleccionado}_${p}`] = value;
    }
    actualizarEscaner();
}

function actualizarDropdownLinea() {
    const select = document.getElementById('inputLinea');
    const selectWrap = document.getElementById('lineaSelectWrap');
    const manual = document.getElementById('inputLineaManual');
    const labelLinea = document.getElementById('labelLineaEscaner');

    const mercado = estadoApp.mercadoSeleccionado;
    const subMercado = estadoApp.subMercadoSeleccionado;
    const limites = obtenerLimitesMercadoActual();
    if (!select || !limites) return;

    const periodo = obtenerPeriodoEscanerActivo(mercado);
    const memoriaKey = `${mercado}_${subMercado}_${periodo}`;

    if (limites.kind === 'manual') {
        // En PASES no existe catálogo de líneas: solo campo manual.
        // Limpiamos y deshabilitamos el select legacy para que ningún enhancer móvil
        // pueda reabrir opciones antiguas (+5.5, +4.5, etc.).
        select.innerHTML = '';
        select.disabled = true;
        select.setAttribute('aria-hidden','true');
        if (selectWrap) selectWrap.style.display = 'none';
        if (manual) {
            manual.hidden = false;
            manual.style.display = 'block';
            manual.min = String(limites.min ?? 0);
            manual.max = String(limites.max ?? 2500);
            manual.step = String(limites.step ?? 0.5);
            manual.placeholder = limites.placeholder || 'Ej. 399.5';

            const remembered = Number(estadoApp.memoriaLineas[memoriaKey]);
            const next = Number.isFinite(remembered) ? remembered : Number(limites.default ?? 399.5);
            manual.value = String(next);
            estadoApp.memoriaLineas[memoriaKey] = next;
        }
        if (labelLinea) labelLinea.textContent = mercado === 'Pases' ? 'LÍNEA DE PASES · MANUAL' : 'LÍNEA BETANO · MANUAL';
        return;
    }

    select.disabled = false;
    select.removeAttribute('aria-hidden');
    if (manual) {
        manual.hidden = true;
        manual.style.display = 'none';
    }
    if (selectWrap) selectWrap.style.display = '';
    if (labelLinea) {
        labelLinea.textContent = esMercadoResultadoEscaner(mercado)
            ? 'SELECCIÓN'
            : mercado.includes('Handicap')
                ? 'HÁNDICAP'
                : 'LÍNEA / OVER';
    }

    let opciones = [];
    if (limites.kind === 'enum') {
        opciones = (limites.options || []).map(opt => ({value:opt.value,label:opt.label}));
    } else {
        const cantidad = Math.floor((limites.max - limites.min) / limites.step + 0.000001);
        for (let n=0;n<=cantidad;n++) {
            const valor = Number((limites.min + n*limites.step).toFixed(2));
            opciones.push({
                value:valor,
                label:valor > 0 && (subMercado.includes('Handicap') || subMercado.includes('Hándicap') || mercado.includes('Handicap'))
                    ? `+${valor}`
                    : String(valor)
            });
        }
    }

    const recordada = estadoApp.memoriaLineas[memoriaKey];
    rellenarSelectSeguro(select, opciones, recordada ?? opciones[0]?.value);
    estadoApp.memoriaLineas[memoriaKey] = select.value;
    refrescarSelectCustom('inputLinea');
}

const actualizarEscaner = debounce(function() {
    const equipo = document.getElementById('selectEquipo')?.value;
    if (!equipo) return;

    const linea = valorLineaEscanerActual();
    if (linea === null || linea === undefined || linea === '') return;
    if (!esMercadoResultadoEscaner() && !Number.isFinite(Number(linea))) return;

    renderizarEscanerDOM(calcularDatosEscaner(equipo, linea));
}, 150);

function calcularDatosEscaner(equipo, linea) {
    const condicionFiltro = document.getElementById('selectCondicion')?.value || 'General';
    const mercadoActual = estadoApp.mercadoSeleccionado;
    const subMercadoActual = estadoApp.subMercadoSeleccionado;
    const tiempoFiltro = obtenerPeriodoEscanerActivo(mercadoActual);

    guardarFiltros();
    estadoApp.memoriaLineas[`${mercadoActual}_${subMercadoActual}_${tiempoFiltro}`] = linea;

    const stats = { totalJuegosGlobales: 0, aciertosGlobales: 0, totalHome: 0, aciertosHome: 0, totalAway: 0, aciertosAway: 0, rachas: [] };
    const filasHome = [];
    const filasAway = [];
    const partidos = Object.values(estadoApp.escaner.datosProcesados)
        .sort((a, b) => b.sortTime - a.sortTime || b.orden - a.orden);

    for (const match of partidos) {
        if (match.tiempo !== normalizarTiempo(tiempoFiltro)) continue;

        const esLocal = equiposEquivalentes(match.local, equipo);
        const esVisita = equiposEquivalentes(match.visita, equipo);
        if (!esLocal && !esVisita) continue;

        let validoGlobal = true;
        if (condicionFiltro === 'Local' && !esLocal) validoGlobal = false;
        if (condicionFiltro === 'Visita' && !esVisita) validoGlobal = false;

        const statsPropio = esLocal ? match.sLocal : match.sVisita;
        const statsRival = esLocal ? match.sVisita : match.sLocal;
        const oponente = esLocal ? match.visita : match.local;
        const esResultado = esMercadoResultadoEscaner(mercadoActual);
        const esHandicap = !esResultado && mercadoActual.includes('Handicap');

        const metricSource = mercadoActual === 'Córners Handicap'
            ? 'Córners'
            : mercadoActual === 'Tiros a Puerta Handicap'
                ? 'Tiros a Puerta'
                : mercadoActual;

        let vPropio = esResultado ? aNumero(statsPropio?.Goles,0) : aNumero(statsPropio?.[metricSource],0);
        let vRival = esResultado ? aNumero(statsRival?.Goles,0) : aNumero(statsRival?.[metricSource],0);

        const sumTotal = vPropio + vRival;
        let isHit = false;
        let resultadoEquipo = '';

        if (esResultado) {
            resultadoEquipo = vPropio > vRival ? 'WIN' : vPropio === vRival ? 'DRAW' : 'LOSS';
            isHit = resultadoEquipo === String(linea || '').toUpperCase();
        } else if (esHandicap) {
            // Hándicap estándar: valor del equipo + handicap > valor del rival.
            // Ejemplo -2.5: el equipo debe ganar el conteo por 3 o más.
            isHit = (vPropio + Number(linea)) > vRival;
        } else if (subMercadoActual === 'Total Partido') isHit = sumTotal > linea;
        else if (subMercadoActual === 'Total Equipo') isHit = vPropio > linea;
        else if (subMercadoActual === 'Total Rival') isHit = vRival > linea;
        else if (subMercadoActual === 'Cada Equipo (Ambos)') isHit = vPropio > linea && vRival > linea;

        if (validoGlobal) {
            stats.totalJuegosGlobales++;
            if (isHit) stats.aciertosGlobales++;
            if (stats.rachas.length < 5) stats.rachas.push(isHit);
        }
        if (esLocal) {
            stats.totalHome++;
            if (isHit) stats.aciertosHome++;
        }
        if (esVisita) {
            stats.totalAway++;
            if (isHit) stats.aciertosAway++;
        }

        const fila = {
            oponente,
            equipoAnalizado: equipo,
            local: match.local,
            visita: match.visita,
            fecha: match.fecha,
            jornada: match.jornada,
            esLocal,
            isHit,
            vPropio,
            vRival,
            valorLocal: esLocal ? vPropio : vRival,
            valorVisita: esLocal ? vRival : vPropio,
            sumTotal,
            resultadoEquipo,
            isCardsMarket: mercadoActual === 'Tarjetas' || mercadoActual === 'Puntos por Tarjetas',
            redsPropio: aNumero(statsPropio?.['Tarjetas Rojas'], 0),
            redsRival: aNumero(statsRival?.['Tarjetas Rojas'], 0),
            rojaLocal: esLocal ? aNumero(statsPropio?.['Tarjetas Rojas'], 0) : aNumero(statsRival?.['Tarjetas Rojas'], 0),
            rojaVisita: esLocal ? aNumero(statsRival?.['Tarjetas Rojas'], 0) : aNumero(statsPropio?.['Tarjetas Rojas'], 0)
        };
        if (esLocal) filasHome.push(fila);
        if (esVisita) filasAway.push(fila);
    }

    return { equipo, condicionFiltro, mercadoActual, subMercadoActual, linea, stats, filasHome, filasAway };
}

function renderizarEscanerDOM(data) {
    actualizarAvatar(data.equipo, 'escaner');
    
    let nombreCorto = NOMBRES_COLUMNAS[data.mercadoActual] || "STATS";
    if (document.getElementById('thPropioHome')) document.getElementById('thPropioHome').innerText = nombreCorto;
    if (document.getElementById('thPropioAway')) document.getElementById('thPropioAway').innerText = nombreCorto;
    if (document.getElementById('thRivalHome')) document.getElementById('thRivalHome').innerText = 'VISITANTE';
    if (document.getElementById('thRivalAway')) document.getElementById('thRivalAway').innerText = 'VISITANTE';

    const logoPrincipal = document.getElementById('visualTeamLogo');
    if (logoPrincipal) {
        const logoReal = obtenerEscudoEquipo(data.equipo);
        logoPrincipal.alt = logoReal ? `Escudo de ${data.equipo}` : '';
        if (logoReal) {
            logoPrincipal.style.display = '';
            logoPrincipal.src = logoReal;
            logoPrincipal.onerror = () => {
                logoPrincipal.onerror = null;
                logoPrincipal.removeAttribute('src');
                logoPrincipal.style.display = 'none';
            };
        } else {
            logoPrincipal.removeAttribute('src');
            logoPrincipal.style.display = 'none';
        }
    }

    const homeTitle = document.getElementById('visualHomeTitle');
    const awayTitle = document.getElementById('visualAwayTitle');
    const homeSubtitle = document.getElementById('visualHomeSubtitle');
    const awaySubtitle = document.getElementById('visualAwaySubtitle');
    const homeCount = document.getElementById('visualHomeCount');
    const awayCount = document.getElementById('visualAwayCount');

    const esResultado = esMercadoResultadoEscaner(data.mercadoActual);
    const seleccionVisible = esResultado ? etiquetaSeleccionResultado(data.linea) : data.subMercadoActual.toUpperCase();
    if (homeTitle) homeTitle.textContent = `HOME · ${seleccionVisible}`;
    if (awayTitle) awayTitle.textContent = `AWAY · ${seleccionVisible}`;
    if (homeSubtitle) homeSubtitle.textContent = `${data.equipo} jugando como local`;
    if (awaySubtitle) awaySubtitle.textContent = `${data.equipo} jugando como visitante`;
    if (homeCount) homeCount.textContent = data.filasHome.length;
    if (awayCount) awayCount.textContent = data.filasAway.length;
    
    let subtitulo = document.getElementById('subtituloFiltros');
    if (subtitulo) {
        const p = obtenerPeriodoEscanerActivo(data.mercadoActual);
        const pLabel = p === '1ST' ? 'HT' : p === '2ND' ? 'SH' : 'FT';
        const isHandicap = data.mercadoActual.includes('Handicap');
        subtitulo.innerText = esResultado
            ? `${data.equipo.toUpperCase()} | ${etiquetaSeleccionResultado(data.linea)} | ${data.mercadoActual.toUpperCase()}`
            : isHandicap
                ? `${data.equipo.toUpperCase()} | HÁNDICAP ${Number(data.linea)>0?'+':''}${data.linea} | ${pLabel}`
                : `${data.equipo.toUpperCase()} | OVER ${data.linea} | ${data.subMercadoActual.toUpperCase()} | ${pLabel}`;
    }

    let trendContainer = document.getElementById('hud-trend-container');
    if (trendContainer) {
        if (data.stats.rachas.length > 0) {
            let htmlRacha = "";
            data.stats.rachas.forEach(hit => {
                htmlRacha += hit ? `<span class="trend-hit" style="color:var(--bar-green);"><i class="fa-solid fa-circle-check"></i></span>` 
                                 : `<span class="trend-miss" style="color:var(--bar-red);"><i class="fa-solid fa-circle-xmark"></i></span>`;
            });
            trendContainer.innerHTML = `<span style="font-size: 10px; font-weight: 800; color: var(--text-muted); letter-spacing: 0.05em; margin-right: 5px;">ÚLTIMOS ${data.stats.rachas.length}:</span>` + htmlRacha;
            trendContainer.style.display = 'flex';
        } else {
            trendContainer.style.display = 'none';
        }
    }

    const crearIndicadorRoja = (cantidad, mercado) => {
        const n = Math.max(0, Number(cantidad) || 0);
        if (!n) return '';
        const puntos = mercado === 'Puntos por Tarjetas' ? n * 20 : n;
        const detalle = mercado === 'Puntos por Tarjetas'
            ? `${n} tarjeta${n === 1 ? '' : 's'} roja${n === 1 ? '' : 's'} incluida${n === 1 ? '' : 's'}: ${puntos} puntos`
            : `${n} tarjeta${n === 1 ? '' : 's'} roja${n === 1 ? '' : 's'}`;
        return `<span class="inca-red-card-badge" title="${detalle}" aria-label="${detalle}"><i></i>${n > 1 ? `<b>×${n}</b>` : ''}</span>`;
    };
    
    const crearCeldaEquipo = (nombre, lado) => {
        const logo = obtenerEscudoEquipo(nombre);
        const tieneLogo = Boolean(logo);
        const escudo = tieneLogo
            ? `<img class="inca-match-logo" src="${escaparAtributo(logo)}" alt="" loading="lazy" decoding="async" crossorigin="anonymous" referrerpolicy="no-referrer" onerror="const p=this.closest('.inca-match-team');if(p){p.classList.remove('has-logo');p.classList.add('no-logo')}this.remove()">`
            : '';
        return `
            <div class="inca-match-team inca-match-team--${lado} ${tieneLogo ? 'has-logo' : 'no-logo'}">
                ${escudo}
                <span title="${escaparAtributo(nombre)}">${escaparHTML(nombre)}</span>
            </div>
        `;
    };


    const crearFragmento = (filas) => {
        const fragment = document.createDocumentFragment();

        filas.forEach((f, indice) => {
            const tr = document.createElement('tr');
            tr.className = `${f.isHit ? "row-hit" : "row-miss"} inca-visual-match-row`;
            tr.style.setProperty('--row-delay', `${Math.min(indice * 12, 180)}ms`);

            const rojaLocal = crearIndicadorRoja(f.rojaLocal, data.mercadoActual);
            const rojaVisita = crearIndicadorRoja(f.rojaVisita, data.mercadoActual);

            tr.innerHTML = `
                <td class="inca-date-cell">
                    <span class="inca-date-main">${escaparHTML(f.fecha || '—')}</span>
                </td>
                <td class="inca-team-cell">
                    ${crearCeldaEquipo(f.local, 'home')}
                </td>
                <td class="inca-score-cell">
                    <div class="inca-score-layout" aria-label="${formatearNumero(f.valorLocal)} a ${formatearNumero(f.valorVisita)}">
                        <span class="inca-red-slot inca-red-slot--home">${rojaLocal}</span>
                        <div class="inca-stat-score">
                            <span class="inca-side-score"><span class="inca-score-number">${formatearNumero(f.valorLocal)}</span></span>
                            <b class="inca-score-separator">–</b>
                            <span class="inca-side-score"><span class="inca-score-number">${formatearNumero(f.valorVisita)}</span></span>
                        </div>
                        <span class="inca-red-slot inca-red-slot--away">${rojaVisita}</span>
                    </div>
                </td>
                <td class="inca-team-cell">
                    ${crearCeldaEquipo(f.visita, 'away')}
                </td>
            `;
            fragment.appendChild(tr);
        });

        return fragment;
    };


    const tablaHome = document.getElementById('tablaResultadosHome');
    const tablaAway = document.getElementById('tablaResultadosAway');
    
    tablaHome.innerHTML = ''; tablaAway.innerHTML = '';

    if (data.filasHome.length > 0) tablaHome.appendChild(crearFragmento(data.filasHome));
    else tablaHome.innerHTML = `<tr><td colspan="4" class="inca-empty-row" style="text-align:center; padding: 40px; color: var(--text-muted); font-weight: 800; letter-spacing: 0.1em;">SIN REGISTROS DE LOCAL</td></tr>`;

    if (data.filasAway.length > 0) tablaAway.appendChild(crearFragmento(data.filasAway));
    else tablaAway.innerHTML = `<tr><td colspan="4" class="inca-empty-row" style="text-align:center; padding: 40px; color: var(--text-muted); font-weight: 800; letter-spacing: 0.1em;">SIN REGISTROS DE VISITA</td></tr>`;

    let splitContainer = document.getElementById('splitTablesContainer');
    let homeWrapper = document.getElementById('homeTableWrapper');
    let awayWrapper = document.getElementById('awayTableWrapper');

    if (data.condicionFiltro === "Local") {
        homeWrapper.style.display = "block"; awayWrapper.style.display = "none"; splitContainer.classList.add('single-column'); 
    } else if (data.condicionFiltro === "Visita") {
        homeWrapper.style.display = "none"; awayWrapper.style.display = "block"; splitContainer.classList.add('single-column'); 
    } else { 
        homeWrapper.style.display = "block"; awayWrapper.style.display = "block"; splitContainer.classList.remove('single-column'); 
    }

    actualizarPanelCumplimiento(data);

    actualizarIndicadorValueBet(data.stats.aciertosGlobales, data.stats.totalJuegosGlobales, {
        equipo: data.equipo,
        mercado: data.mercadoActual,
        subMercado: data.subMercadoActual,
        linea: data.linea,
        condicion: data.condicionFiltro
    });
}

function actualizarPanelCumplimiento(data) {
    const pct = (hits,total) => total > 0 ? (hits/total)*100 : 0;
    const formatPct = n => Number.isFinite(n) ? `${n.toFixed(1)}%` : '—';
    const applyRate = (prefix,hits,total) => {
        const p = pct(hits,total);
        const text = document.getElementById(`incaHit${prefix}`);
        const meta = document.getElementById(`incaHit${prefix}Meta`);
        const bar = document.getElementById(`incaHit${prefix}Bar`);
        if (text) text.textContent = total ? formatPct(p) : '—';
        if (meta) meta.textContent = `${hits || 0} / ${total || 0} partidos`;
        if (bar) {
            bar.style.width = `${Math.max(0,Math.min(100,p))}%`;
            bar.dataset.band = p >= 80 ? 'elite' : p >= 65 ? 'strong' : p >= 50 ? 'neutral' : 'weak';
        }
    };

    const label = document.getElementById('incaSignalLabel');
    const sample = document.getElementById('incaSignalSample');
    const headerRate = document.getElementById('incaHeaderHitRate');
    const headerMeta = document.getElementById('incaHeaderHitMeta');
    if (label) label.textContent = esMercadoResultadoEscaner(data.mercadoActual)
        ? `${data.equipo} · ${data.mercadoActual} · ${etiquetaSeleccionResultado(data.linea)}`
        : data.mercadoActual.includes('Handicap')
            ? `${data.equipo} · ${data.mercadoActual} · ${Number(data.linea)>0?'+':''}${data.linea}`
            : `${data.equipo} · ${data.subMercadoActual} · línea ${data.linea}`;
    if (sample) sample.textContent = String(data.stats.totalJuegosGlobales || 0);

    const globalPct = pct(data.stats.aciertosGlobales, data.stats.totalJuegosGlobales);
    if (headerRate) headerRate.textContent = data.stats.totalJuegosGlobales ? formatPct(globalPct) : '—';
    if (headerMeta) headerMeta.textContent = `${data.stats.aciertosGlobales || 0} / ${data.stats.totalJuegosGlobales || 0} partidos`;

    applyRate('Global', data.stats.aciertosGlobales, data.stats.totalJuegosGlobales);
    applyRate('Home', data.stats.aciertosHome, data.stats.totalHome);
    applyRate('Away', data.stats.aciertosAway, data.stats.totalAway);

    const cardHome = document.querySelector('#incaSignalBoard .inca-rate-card--home');
    const cardAway = document.querySelector('#incaSignalBoard .inca-rate-card--away');
    const grid = document.querySelector('#incaSignalBoard .inca-signal-grid');
    const condicion = String(data.condicionFiltro || 'General').toLowerCase();
    const soloHome = condicion === 'local';
    const soloAway = condicion === 'visita';
    if (cardHome) cardHome.style.display = soloAway ? 'none' : '';
    if (cardAway) cardAway.style.display = soloHome ? 'none' : '';
    if (grid) grid.classList.toggle('is-single', soloHome || soloAway);
}

function actualizarIndicadorValueBet(hits, total, contexto = {}) {
    const mainPanel = document.getElementById('mainHudPanel');
    const badge = document.getElementById('valueBetBadge');
    const porcentaje = total > 0 ? (hits / total) * 100 : 0;
    // Expone exactamente el hit-rate del filtro visible para el módulo de cuotas.
    // No lo convierte silenciosamente en una predicción calibrada.
    window.INCA_LAST_SIGNAL = Object.freeze({
        probability: Number((porcentaje / 100).toFixed(4)),
        percentage: Number(porcentaje.toFixed(2)),
        hits: Number(hits) || 0,
        sample: Number(total) || 0,
        equipo: contexto.equipo || '',
        mercado: contexto.mercado || '',
        subMercado: contexto.subMercado || '',
        linea: Number.isFinite(Number(contexto.linea)) ? Number(contexto.linea) : String(contexto.linea || ''),
        condicion: contexto.condicion || 'General',
        liga: document.getElementById('selectLiga')?.value || '',
        updatedAt: new Date().toISOString()
    });
    window.dispatchEvent(new CustomEvent('inca:signal-updated', { detail: window.INCA_LAST_SIGNAL }));
    const activo = porcentaje >= 80;

    if (mainPanel) mainPanel.classList.toggle('value-bet-active', activo);
    if (badge) badge.style.display = activo ? 'inline-flex' : 'none';
}

// ==========================================================================
// 3. MÓDULO 2: BASE DE DATOS PRO (TABLAS ADAM CHOI)
// ==========================================================================

function normalizarTemporadaHistoricaV46(season) {
    return {
        competition_id: Number(season?.competition_id) || 0,
        season_id: Number(season?.season_id) || 0,
        label: String(season?.label || '').trim(),
        start_year: Number(season?.start_year) || 0,
        end_year: Number(season?.end_year) || 0,
        season_status: String(season?.season_status || 'UNKNOWN').toUpperCase()
    };
}

function ordenarTemporadasHistoricasV46(a, b) {
    const currentA = a.season_status === 'CURRENT' ? 1 : 0;
    const currentB = b.season_status === 'CURRENT' ? 1 : 0;
    if (currentA !== currentB) return currentB - currentA;
    return (b.start_year - a.start_year)
        || (b.end_year - a.end_year)
        || (b.season_id - a.season_id);
}

function etiquetaTemporadaHistoricaV46(season) {
    const base = season.label || (
        season.start_year && season.end_year
            ? `${season.start_year} / ${season.end_year}`
            : String(season.season_id)
    );
    return season.season_status === 'CURRENT' ? `${base} · ACTUAL` : base;
}

function reconstruirMenuVisualTemporadasV46(select) {
    if (!select) return 0;

    // First use the existing shared visual builder.
    refrescarSelectCustom('selectTemporadaPro');

    // Verify that the visual list really contains every native option.
    const wrapper = select.parentElement;
    const expected = [...select.options].filter(option => !option.hidden).length;
    let visible = wrapper?.querySelectorAll(':scope > .custom-list .custom-item')?.length || 0;

    // Some browsers can paint the old custom list during the same task.
    // Rebuild once more on the next frame, then re-check.
    if (visible !== expected) {
        wrapper?.querySelector(':scope > .custom-display')?.remove();
        wrapper?.querySelector(':scope > .custom-list')?.remove();
        refrescarSelectCustom('selectTemporadaPro');
        visible = wrapper?.querySelectorAll(':scope > .custom-list .custom-item')?.length || 0;
    }

    select.dataset.visualSeasonCount = String(visible);
    select.dataset.visualSeasonExpected = String(expected);
    return visible;
}

async function asegurarTemporadasHistoricasDataProV46({ preserveSelection = true } = {}) {
    const liga = document.getElementById('selectLigaPro');
    const temporada = document.getElementById('selectTemporadaPro');
    if (!liga || !temporada || !window.INCA_TITAN?.enabled) return 0;

    await window.INCA_TITAN.ensureReady();

    const compId = Number(window.INCA_TITAN.competitionId?.(liga.value) || 0);
    if (!compId) {
        console.warn('[INCA DATA PRO V46] Competición TITAN inválida.', liga.value);
        return 0;
    }

    const previousValue = preserveSelection ? String(temporada.value || '') : '';
    const previousSeasonId = Number(window.INCA_TITAN.seasonId?.(previousValue) || 0);

    const raw = window.INCA_TITAN.seasonsForCompetition?.(compId) || [];
    const seasons = raw
        .map(normalizarTemporadaHistoricaV46)
        .filter(season => season.season_id && season.competition_id === compId)
        .sort(ordenarTemporadasHistoricasV46);

    // Deduplicate by season_id defensively.
    const unique = [];
    const seen = new Set();
    for (const season of seasons) {
        if (seen.has(season.season_id)) continue;
        seen.add(season.season_id);
        unique.push(season);
    }

    if (!unique.length) {
        console.warn('[INCA DATA PRO V46] TITAN no devolvió temporadas para Competition_ID', compId);
        return 0;
    }

    const fragment = document.createDocumentFragment();
    for (const season of unique) {
        const option = document.createElement('option');
        option.value = `TITAN_S${season.season_id}`;
        option.textContent = etiquetaTemporadaHistoricaV46(season);
        option.dataset.titan = '1';
        option.dataset.seasonId = String(season.season_id);
        option.dataset.status = season.season_status;
        option.dataset.startYear = String(season.start_year || '');
        option.dataset.endYear = String(season.end_year || '');
        fragment.appendChild(option);
    }

    temporada.replaceChildren(fragment);

    const previousStillExists = previousSeasonId &&
        unique.some(season => season.season_id === previousSeasonId);
    const currentSeason = unique.find(season => season.season_status === 'CURRENT') || unique[0];
    const userPickedHistorical = preserveSelection && temporada.dataset.userSeasonPicked === '1';

    const preferred = userPickedHistorical && previousStillExists
        ? `TITAN_S${previousSeasonId}`
        : `TITAN_S${currentSeason.season_id}`;

    temporada.value = preferred;
    temporada.dataset.titanCatalog = '1';
    temporada.dataset.titanSeasonCount = String(unique.length);
    temporada.dataset.titanHistoricalSeasonCount = String(
        unique.filter(season => season.season_status !== 'CURRENT').length
    );
    temporada.dataset.catalogVerified = unique.length > 1 ? '1' : '0';

    const visualCount = reconstruirMenuVisualTemporadasV46(temporada);

    console.info('[INCA DATA PRO V46] CATÁLOGO HISTÓRICO OK', {
        competitionId: compId,
        leagueValue: liga.value,
        nativeOptions: unique.length,
        visualOptions: visualCount,
        selected: temporada.value,
        seasons: unique.map(season => ({
            id: season.season_id,
            label: etiquetaTemporadaHistoricaV46(season)
        }))
    });

    // One last next-frame visual verification, useful after Live Server / Edge.
    requestAnimationFrame(() => {
        const wrapper = temporada.parentElement;
        const items = wrapper?.querySelectorAll(':scope > .custom-list .custom-item')?.length || 0;
        if (items !== unique.length) {
            console.warn('[INCA DATA PRO V46] Re-render visual de temporadas.', {
                expected: unique.length,
                visible: items
            });
            reconstruirMenuVisualTemporadasV46(temporada);
        }
    });

    return unique.length;
}

let DATA_PRO_CHANGE_SEQ_V1010 = 0;

async function cambiarLigaHistoricaV46() {
    const seq = ++DATA_PRO_CHANGE_SEQ_V1010;
    // Agrupa cambios rápidos de liga antes de tocar TITAN/CSV. En móvil evita
    // que dos cargas históricas completas compitan por el mismo DOM.
    await new Promise(resolve => setTimeout(resolve, 70));
    if (seq !== DATA_PRO_CHANGE_SEQ_V1010) return;

    const temporada = document.getElementById('selectTemporadaPro');
    if (temporada) temporada.dataset.userSeasonPicked = '0';
    sincronizarSelectorLigaDataPro();

    try {
        const count = await asegurarTemporadasHistoricasDataProV46({ preserveSelection: false });
        if (!count || seq !== DATA_PRO_CHANGE_SEQ_V1010) return;

        // Only the latest interaction is allowed to launch the heavy data load.
        await cargarBaseDeDatos('pro');
    } catch (error) {
        if (seq === DATA_PRO_CHANGE_SEQ_V1010) {
            console.error('[INCA DATA PRO V1.016] Error cambiando liga histórica.', error);
        }
    }
}

async function cambiarTemporadaHistoricaV46() {
    const seq = ++DATA_PRO_CHANGE_SEQ_V1010;
    await new Promise(resolve => setTimeout(resolve, 45));
    if (seq !== DATA_PRO_CHANGE_SEQ_V1010) return;

    const temporada = document.getElementById('selectTemporadaPro');
    if (!temporada?.value) return;
    temporada.dataset.userSeasonPicked = '1';

    reconstruirMenuVisualTemporadasV46(temporada);
    if (seq !== DATA_PRO_CHANGE_SEQ_V1010) return;
    await cargarBaseDeDatos('pro');
}


window.addEventListener('inca:titan-ready', () => {
    const temporada = document.getElementById('selectTemporadaPro');
    if (!temporada) return;

    void asegurarTemporadasHistoricasDataProV46({ preserveSelection: true })
        .catch(error => console.warn('[INCA DATA PRO V46] Hook titan-ready', error));
});

function abrirVistaDatabase() {
    estadoApp.vistaActiva = 'database';
    document.body.classList.add('pro-mode');
    aplicarTemaPosicion(null);

    if(document.getElementById('topBarScanner')) document.getElementById('topBarScanner').style.display = 'none';
    if(document.getElementById('topBarJugadores')) document.getElementById('topBarJugadores').style.display = 'none';
    if(document.getElementById('topBarPro')) document.getElementById('topBarPro').style.display = 'flex';

    document.getElementById('vista-escaner').style.display = 'none';
    document.getElementById('vista-jugadores').style.display = 'none';
    document.getElementById('vista-rankings').style.display = 'none';
    document.getElementById('vista-database').style.display = 'block';

    document.querySelectorAll('.menu-option').forEach(opt => opt.classList.remove('active'));

    void (async () => {
        const temporada=document.getElementById('selectTemporadaPro');
        if(temporada)temporada.dataset.userSeasonPicked='0';
        await asegurarTemporadasHistoricasDataProV46({ preserveSelection: false });
        sincronizarSelectorLigaDataPro();

        await cargarBaseDeDatos('pro');
        renderizarDatabase();
    })();
}

function volverAlEscanerOriginal() {
    estadoApp.vistaActiva = 'escaner';
    document.body.classList.remove('pro-mode'); 
    aplicarTemaPosicion(null); 
    
    document.getElementById('vista-database').style.display = 'none';
    document.getElementById('vista-jugadores').style.display = 'none';
    document.getElementById('vista-rankings').style.display = 'none';
    document.getElementById('vista-escaner').style.display = 'flex';
    
    if(document.getElementById('topBarPro')) document.getElementById('topBarPro').style.display = 'none';
    if(document.getElementById('topBarJugadores')) document.getElementById('topBarJugadores').style.display = 'none';
    if(document.getElementById('topBarScanner')) document.getElementById('topBarScanner').style.display = 'flex';
    
    let mercadoActual = estadoApp.mercadoSeleccionado;
    document.querySelectorAll('.menu-option').forEach(opt => {
        if(opt.getAttribute('onclick') && opt.getAttribute('onclick').includes(`'${mercadoActual}'`)) {
            opt.classList.add('active');
        }
    });

    actualizarEscaner();
}

function setDbSplit(split, btn) {
    document.querySelectorAll('.db-split-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');
    estadoApp.dbState.split = split; renderizarDatabase();
}

function setDbTab(tab, btn) {
    if(btn) {
        document.querySelectorAll('.db-market-btn').forEach(b => b.classList.remove('active')); 
        btn.classList.add('active');
    }
    estadoApp.dbState.tab = tab; 
    renderizarDatabase();
}

function sincronizarLineaManualPasesPro() {
    const row = document.getElementById('dbManualPassLineRow');
    const input = document.getElementById('dbManualPassLine');
    const config = MERCADOS_COMPLETOS_PRO[estadoApp.dbState.selectedCategory];
    const active = Boolean(config?.manualLine);

    if (row) row.style.display = active ? 'flex' : 'none';
    if (input && active) {
        input.value = String(Number(estadoApp.dbState.manualPassLine) || 399.5);
    }
}

function cambiarLineaPasesPro() {
    const input = document.getElementById('dbManualPassLine');
    const value = Number(String(input?.value || '').replace(',','.'));
    if (!Number.isFinite(value) || value < 0) return;
    estadoApp.dbState.manualPassLine = value;
    renderizarDatabase();
}

function cambiarCategoriaPro() {
    let cat = document.getElementById('dbCategorySelect').value;
    estadoApp.dbState.selectedCategory = cat;
    estadoApp.dbState.selectedSubId = MERCADOS_COMPLETOS_PRO[cat].options[0].id;
    estadoApp.dbState.matrizMetric = MERCADOS_COMPLETOS_PRO[cat].base;
    llenarSelectSubMercadosPro();
    sincronizarLineaManualPasesPro();
    renderizarDatabase();
}

function cambiarSubMercadoPro() {
    estadoApp.dbState.selectedSubId = document.getElementById('dbSubMarketSelect').value;
    sincronizarLineaManualPasesPro();
    renderizarDatabase();
}

function llenarSelectCategoriasPro() {
    let sel = document.getElementById('dbCategorySelect');
    if(!sel) return;
    let html = '';
    for(let cat in MERCADOS_COMPLETOS_PRO) {
        html += `<option value="${cat}">${MERCADOS_COMPLETOS_PRO[cat].nombre_es}</option>`;
    }
    sel.innerHTML = html;
    
    if(estadoApp.dbState.selectedCategory) {
        sel.value = estadoApp.dbState.selectedCategory;
    } else {
        estadoApp.dbState.selectedCategory = Object.keys(MERCADOS_COMPLETOS_PRO)[0];
        sel.value = estadoApp.dbState.selectedCategory;
        estadoApp.dbState.selectedSubId = MERCADOS_COMPLETOS_PRO[estadoApp.dbState.selectedCategory].options[0].id;
        estadoApp.dbState.matrizMetric = MERCADOS_COMPLETOS_PRO[estadoApp.dbState.selectedCategory].base;
    }
    refrescarSelectCustom('dbCategorySelect');
}

function llenarSelectSubMercadosPro() {
    let sel = document.getElementById('dbSubMarketSelect');
    let cat = estadoApp.dbState.selectedCategory;
    if(!sel || !cat) return;
    
    let html = '';
    MERCADOS_COMPLETOS_PRO[cat].options.forEach(opt => {
        html += `<option value="${opt.id}">${opt.label}</option>`;
    });
    sel.innerHTML = html;
    
    if(estadoApp.dbState.selectedSubId) {
        sel.value = estadoApp.dbState.selectedSubId;
    } else {
        sel.selectedIndex = 0;
        estadoApp.dbState.selectedSubId = sel.value;
    }
    refrescarSelectCustom('dbSubMarketSelect');
    sincronizarLineaManualPasesPro();
}

function evaluarMercadoPro(match, isHomeForSelected, category = '', subId = '', baseMetric = 'Goles') {
    if (!match) return false;
    const categoria = String(category || '');
    const identificador = String(subId || '');
    let sL = match.sLocal || {};
    let sV = match.sVisita || {};

    if (
        categoria.includes('First Half') ||
        identificador.includes('1H') ||
        identificador.includes('1st Half') ||
        /^HT\b/i.test(identificador)
    ) {
        sL = match.sLocal1T || {};
        sV = match.sVisita1T || {};
    } else if (categoria.includes('Second Half') || identificador.includes('2H') || identificador.includes('2nd Half')) {
        sL = match.sLocal2T || {};
        sV = match.sVisita2T || {};
    }

    let metricName = baseMetric;
    if (metricName === 'Goles 1er Tiempo' || metricName === 'Goles 2do Tiempo') metricName = 'Goles';

    const valFor = isHomeForSelected ? aNumero(sL[metricName], 0) : aNumero(sV[metricName], 0);
    const valAg = isHomeForSelected ? aNumero(sV[metricName], 0) : aNumero(sL[metricName], 0);
    const valTotal = valFor + valAg;
    const sId = identificador.toLowerCase();

    if (['win','1st half result','2nd half result','ft win','ht win'].includes(sId)) return valFor > valAg;
    if (['ft draw','ht draw'].includes(sId)) return valFor === valAg;
    if (['ft loss','ht loss'].includes(sId)) return valFor < valAg;
    if (sId === 'unbeaten') return valFor >= valAg;

    if (sId === 'btts both halves') {
        const htL = aNumero(match.sLocal1T?.Goles, 0);
        const htV = aNumero(match.sVisita1T?.Goles, 0);
        const stL = aNumero(match.sLocal2T?.Goles, 0);
        const stV = aNumero(match.sVisita2T?.Goles, 0);
        return htL > 0 && htV > 0 && stL > 0 && stV > 0;
    }
    if (sId.includes('btts yes') || sId.includes('btts 1st half') || sId.includes('btts 2nd half')) return valFor > 0 && valAg > 0;

    if (sId === '2 or 3 total goals') return valTotal === 2 || valTotal === 3;
    if (sId === 'most corners (0)' || sId === 'most cards') return valFor > valAg;
    if (sId === 'corners handicap +1') return valFor + 1 > valAg;
    if (sId === 'corners handicap +2') return valFor + 2 > valAg;
    if (sId === 'corners handicap -1') return valFor - 1 > valAg;
    if (sId === 'corners handicap -2') return valFor - 2 > valAg;

    const sotHandicap = sId.match(/shots on target handicap ([+-]?\d+(?:\.\d+)?)/);
    if (sotHandicap) {
        const handicap = Number(sotHandicap[1]);
        return (valFor + handicap) > valAg;
    }

    if (sId.startsWith('manual passes ')) {
        const line = Number(estadoApp.dbState.manualPassLine);
        if (!Number.isFinite(line)) return false;
        if (sId.includes(' total')) return valTotal > line;
        if (sId.includes(' against')) return valAg > line;
        return valFor > line;
    }

    if (sId === 'goal in both halves (total)') {
        const primerTiempo = aNumero(match.sLocal1T?.Goles, 0) + aNumero(match.sVisita1T?.Goles, 0);
        const segundoTiempo = aNumero(match.sLocal2T?.Goles, 0) + aNumero(match.sVisita2T?.Goles, 0);
        return primerTiempo > 0 && segundoTiempo > 0;
    }

    if (sId === 'score both halves') {
        const htFor = isHomeForSelected ? aNumero(match.sLocal1T?.Goles, 0) : aNumero(match.sVisita1T?.Goles, 0);
        const stFor = isHomeForSelected ? aNumero(match.sLocal2T?.Goles, 0) : aNumero(match.sVisita2T?.Goles, 0);
        return htFor > 0 && stFor > 0;
    }

    if (sId === 'concede both halves') {
        const htAg = isHomeForSelected ? aNumero(match.sVisita1T?.Goles, 0) : aNumero(match.sLocal1T?.Goles, 0);
        const stAg = isHomeForSelected ? aNumero(match.sVisita2T?.Goles, 0) : aNumero(match.sLocal2T?.Goles, 0);
        return htAg > 0 && stAg > 0;
    }

    const matchOver = sId.match(/over (\d+(?:\.\d+)?)/);
    if (matchOver) {
        const threshold = Number(matchOver[1]);
        if (sId.includes(' for') || categoria.includes(' For') || (categoria.includes('Each Team') && !sId.includes(' ag'))) {
            if (categoria.includes('Each Team')) return valFor > threshold && valAg > threshold;
            return valFor > threshold;
        }
        if (sId.includes(' ag') || categoria.includes(' Against')) return valAg > threshold;
        return valTotal > threshold;
    }

    return valFor > valAg;
}

function construirTablaMaestraRécord(equipo, metrica) {
    let standings = {};
    let uniqueTeams = new Set();

    const phaseMetaInicial = obtenerFaseDataProActual();
    const fullRosterPhaseKeys = new Set(['REGULAR','APERTURA','CLAUSURA']);
    const phaseKeyInicial = String(phaseMetaInicial?.key || 'REGULAR').toUpperCase();
    const rosterActual = Array.isArray(estadoApp.pro.seasonRoster) ? estadoApp.pro.seasonRoster : [];

    estadoApp.pro.datosPartidosFull.forEach(m => {
        uniqueTeams.add(m.local);
        uniqueTeams.add(m.visita);
    });
    if (fullRosterPhaseKeys.has(phaseKeyInicial)) {
        rosterActual.forEach(team => { const name=String(team?.name||'').trim(); if(name)uniqueTeams.add(name); });
    }

    Array.from(uniqueTeams).forEach(eq => {
        standings[eq] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
    });

    estadoApp.pro.datosPartidosFull.forEach(m => {
        let eqL = m.local, eqV = m.visita;
        let golesL = parseFloat(m.sLocal["Goles"]) || 0;
        let golesV = parseFloat(m.sVisita["Goles"]) || 0;
        
        standings[eqL].p++; standings[eqL].gf += golesL; standings[eqL].ga += golesV;
        standings[eqV].p++; standings[eqV].gf += golesV; standings[eqV].ga += golesL;
        
        if (golesL > golesV) {
            standings[eqL].w++; standings[eqL].pts += 3;
            standings[eqV].l++;
        } else if (golesL < golesV) {
            standings[eqV].w++; standings[eqV].pts += 3;
            standings[eqL].l++;
        } else {
            standings[eqL].d++; standings[eqL].pts += 1;
            standings[eqV].d++; standings[eqV].pts += 1;
        }
    });

    for (let eq in standings) { standings[eq].gd = standings[eq].gf - standings[eq].ga; }
    let sortedTeams = Object.keys(standings).sort((a, b) => {
        if (standings[b].pts !== standings[a].pts) return standings[b].pts - standings[a].pts;
        if (standings[b].gd !== standings[a].gd) return standings[b].gd - standings[a].gd;
        return standings[b].gf - standings[a].gf;
    });

    const phaseMeta = obtenerFaseDataProActual();
    const phaseKey = phaseMeta?.key || 'REGULAR';
    const permitidosFase = new Set((phaseMeta?.memberTeamNames || []).map(nombre => claveTexto(nombre)).filter(Boolean));
    const usaRosterCompleto = fullRosterPhaseKeys.has(String(phaseKey).toUpperCase());
    if (permitidosFase.size && !usaRosterCompleto) sortedTeams = sortedTeams.filter(nombre => permitidosFase.has(claveTexto(nombre)));
    const compId = Number(window.INCA_TITAN?.competitionId?.(document.getElementById('selectLigaPro')?.value) || 0);
    const seasonId = Number(window.INCA_TITAN?.seasonId?.(document.getElementById('selectTemporadaPro')?.value) || 0);
    const compInfo = (window.INCA_TITAN?.CURATED_COMPETITIONS || []).find(c => Number(c.id) === compId);
    const cuposCtx = window.INCA_QUALIFICATION?.context?.(compId, seasonId, phaseMeta?.key || 'REGULAR', phaseMeta?.label || '') || null;
    const cuposZones = cuposCtx ? (window.INCA_QUALIFICATION?.compactZones?.(cuposCtx) || []) : [];
    const showOfficialZones = Boolean(cuposCtx && cuposZones.length);
    const showClassicZones = !showOfficialZones && phaseKey === 'REGULAR' && String(compInfo?.region || '').toUpperCase() === 'EUROPA';
    let tbodyHTML = "";
    sortedTeams.forEach((t, index) => {
        let stats = standings[t];
        let isSelected = t.toUpperCase() === equipo.toUpperCase();
        let rowClass = isSelected ? "league-row-selected" : "";

        let zoneClass = "";
        let officialZone = null;
        let totalTeams = sortedTeams.length;
        if (showOfficialZones) {
            officialZone = window.INCA_QUALIFICATION?.zoneForPosition?.(cuposCtx, index + 1) || null;
            if (officialZone) zoneClass = window.INCA_QUALIFICATION?.classForZone?.(officialZone) || "qzone-other";
        } else if (showClassicZones) {
            if (index < 4) zoneClass = "zone-ucl";
            else if (index === 4) zoneClass = "zone-uel";
            else if (index === 5) zoneClass = "zone-conf";
            else if (index >= totalTeams - 3) zoneClass = "zone-rel";
        }
        if (officialZone) rowClass += ` inca-qzone-row ${zoneClass}`;
        else if (showClassicZones && zoneClass) rowClass += ` inca-qzone-row inca-classic-zone-row ${zoneClass}`;

        let homeMatch = estadoApp.pro.datosPartidosFull.find(m => m.local.toUpperCase() === equipo.toUpperCase() && m.visita.toUpperCase() === t.toUpperCase());
        let awayMatch = estadoApp.pro.datosPartidosFull.find(m => m.local.toUpperCase() === t.toUpperCase() && m.visita.toUpperCase() === equipo.toUpperCase());

        let buildResultBox = (match, isHomeForSelected) => {
            if (!match) return `<td><div class="matrix-empty"></div></td>`; 
            
            let sL_display = match.sLocal, sV_display = match.sVisita;
            let displayCat = estadoApp.dbState.selectedCategory || "Total Match Goals";
            if (displayCat.includes("First Half")) { sL_display = match.sLocal1T; sV_display = match.sVisita1T; }
            else if (displayCat.includes("Second Half")) { sL_display = match.sLocal2T; sV_display = match.sVisita2T; }

            let mName = metrica;
            if (mName === "Goles 1er Tiempo" || mName === "Goles 2do Tiempo") mName = "Goles";

            let valPropio = isHomeForSelected ? (parseFloat(sL_display[mName]) || 0) : (parseFloat(sV_display[mName]) || 0);
            let valRival = isHomeForSelected ? (parseFloat(sV_display[mName]) || 0) : (parseFloat(sL_display[mName]) || 0);
            
            let isHit = evaluarMercadoPro(match, isHomeForSelected, displayCat, estadoApp.dbState.selectedSubId, metrica);
            let resultClass = isHit ? "res-win" : "res-loss";
            
            let isCardsMarket = metrica === 'Tarjetas' || metrica === 'Puntos por Tarjetas';
            let redsPropio = isHomeForSelected ? (parseFloat(sL_display["Tarjetas Rojas"]) || 0) : (parseFloat(sV_display["Tarjetas Rojas"]) || 0);
            let redsRival = isHomeForSelected ? (parseFloat(sV_display["Tarjetas Rojas"]) || 0) : (parseFloat(sL_display["Tarjetas Rojas"]) || 0);

            let iconRedCard = `<div style="display:inline-block; width:10px; height:14px; background-color:#ef4444; border-radius:2px; margin:0 6px; vertical-align:middle; box-shadow: 0 1px 3px rgba(0,0,0,0.3);" title="Tarjeta Roja"></div>`;

            let textPropio = valPropio + (isCardsMarket && redsPropio > 0 ? iconRedCard : '');
            let textRival = (isCardsMarket && redsRival > 0 ? iconRedCard : '') + valRival;

            let scoreText = `<span style="display:flex; align-items:center; justify-content:center;">${textPropio} - ${textRival}</span>`;
            
            let fechaText = match.fecha && match.fecha !== "N/A" ? match.fecha : "Sin Fecha";
            let jornadaText = match.jornada && match.jornada.toString().trim() !== "" ? ` | JOR. ${match.jornada}` : "";
            
            return `<td>
                <div class="matrix-res-box ${resultClass}">
                    ${scoreText}
                    <div class="custom-tooltip">
                        <span style="color:#f8fafc; font-size: 11px; font-weight: 800; letter-spacing: 0.05em;">
                            <i class="fa-regular fa-calendar" style="color: var(--brand-accent);"></i> ${fechaText}${jornadaText}
                        </span>
                    </div>
                </div>
            </td>`;
        };

        let homeBoxHTML = isSelected ? `<td class="matrix-self"><i class="fa-solid fa-minus" style="color:var(--text-muted);"></i></td>` : buildResultBox(homeMatch, true);
        let awayBoxHTML = isSelected ? `<td class="matrix-self"><i class="fa-solid fa-minus" style="color:var(--text-muted);"></i></td>` : buildResultBox(awayMatch, false);
        let teamLogo = obtenerEscudoEquipo(t);

        tbodyHTML += `
            <tr class="${rowClass}">
                <td class="col-rank ${zoneClass}"${officialZone ? ` title="${escaparHTML(window.INCA_QUALIFICATION?.labelForZone?.(officialZone) || officialZone.raw_label || '')}"` : ''}>${index + 1}</td>
                <td style="text-align: left; vertical-align: middle;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${teamLogo}" alt="" style="width: 24px; height: 24px; object-fit: contain;">
                        <span class="tm-team-copy">
                            <b>${t.toUpperCase()}</b>

                        </span>
                    </div>
                </td>
                <td>${stats.p}</td>
                <td style="color: var(--bar-green); font-weight: 800;">${stats.w}</td>
                <td style="color: var(--bar-yellow); font-weight: 800;">${stats.d}</td>
                <td style="color: var(--bar-red); font-weight: 800;">${stats.l}</td>
                <td>${stats.gf}</td>
                <td>${stats.ga}</td>
                <td>${stats.gd > 0 ? '+'+stats.gd : stats.gd}</td>
                <td class="col-pts">${stats.pts}</td>
                ${homeBoxHTML}
                ${awayBoxHTML}
            </tr>
        `;
    });

    let subLabelText = metrica.toUpperCase();
    if (estadoApp.dbState.selectedCategory && MERCADOS_COMPLETOS_PRO[estadoApp.dbState.selectedCategory]) {
        let found = MERCADOS_COMPLETOS_PRO[estadoApp.dbState.selectedCategory].options.find(o => o.id === estadoApp.dbState.selectedSubId);
        if (found) {
            subLabelText = found.label.toUpperCase();
            if (MERCADOS_COMPLETOS_PRO[estadoApp.dbState.selectedCategory]?.manualLine) {
                subLabelText += ` · LÍNEA ${estadoApp.dbState.manualPassLine}`;
            }
        }
    }

    return `
    <div class="table-maestra-container">
        <div class="table-maestra-header inca-phase-table-head">
            <div class="inca-phase-table-head__main">
                <span><i class="fa-solid fa-ranking-star"></i> TABLA 100% DINÁMICA DE: <b>${subLabelText}</b></span>
                <small>${phaseMeta?.label || 'Temporada regular'} · ${phaseMeta?.teamCount || sortedTeams.length} equipos · ${phaseMeta?.eventCount || estadoApp.pro.datosPartidosFull.length} partidos</small>
            </div>
            <div class="inca-phase-table-head__side">
                <span class="inca-phase-chip">${phaseMeta?.label || 'Temporada regular'}</span>
                <strong>${equipo.toUpperCase()}</strong>
            </div>
        </div>
        <div style="overflow-x: auto; background: var(--bg-panel); padding-bottom: 30px;">
            <table class="tm-table league-matrix-table">
                <thead>
                    <tr>
                        <th style="width: 5%;">#</th>
                        <th style="text-align: left; width: 25%;">EQUIPO</th>
                        <th style="width: 4%;">PJ</th>
                        <th style="width: 4%; color: var(--bar-green);">G</th>
                        <th style="width: 4%; color: var(--bar-yellow);">E</th>
                        <th style="width: 4%; color: var(--bar-red);">P</th>
                        <th style="width: 4%;">GF</th>
                        <th style="width: 4%;">GC</th>
                        <th style="width: 4%;">DIF</th>
                        <th style="width: 4%;">PTS</th>
                        <th style="width: 19%;">DE LOCAL VS RIVAL</th>
                        <th style="width: 19%;">DE VISITA VS RIVAL</th>
                    </tr>
                </thead>
                <tbody>
                    ${tbodyHTML}
                </tbody>
            </table>
        </div>
    </div>
    `;
}


function actualizarLineaPasesHistorico(kind, rawValue) {
    if (!['match','for','against'].includes(kind)) return;
    const value = Number(String(rawValue || '').replace(',','.'));
    if (!Number.isFinite(value) || value < 0) return;

    if (!estadoApp.dbState.passLines) {
        estadoApp.dbState.passLines = {match:799.5,for:399.5,against:399.5};
    }
    estadoApp.dbState.passLines[kind] = value;
    renderizarDatabase();
}


function esTemporadaActualDataProV64F() {
    const select=document.getElementById('selectTemporadaPro');
    const option=select?.options?.[select.selectedIndex];
    return String(option?.dataset?.status||'').toUpperCase()==='CURRENT';
}

function etiquetaTemporadaCompletaDataProV64F() {
    const select=document.getElementById('selectTemporadaPro');
    const option=select?.options?.[select.selectedIndex];
    return String(option?.textContent||'TEMPORADA ACTUAL').trim();
}

async function equiposDataProActualDesdeCatalogoV64F(ligaValue,temporadaValue) {
    const compId=Number(window.INCA_TITAN?.competitionId?.(ligaValue)||0);
    const seasonId=Number(window.INCA_TITAN?.seasonId?.(temporadaValue)||0);
    const teams=new Map();
    if(!compId)return [];

    try{
        await window.INCA_TITAN?.ensureReady?.();
        await window.INCA_TITAN?.ensureTeamDetails?.();
        for(const team of (window.INCA_TITAN?.teamsForCompetitionSeason?.(compId,seasonId)||[])){
            if(team?.name)teams.set(Number(team.team_id)||team.name,{id:Number(team.team_id)||0,name:String(team.name)});
        }
    }catch(error){
        console.warn('[V64F DATA PRO] Catálogo de equipos no disponible.',error);
    }

    try{
        await window.INCA_FIXTURES?.ensureReady?.();
        const all=window.INCA_FIXTURES?.forCompetition?.(compId,{from:-Infinity,to:Infinity,includeEnded:true})||[];
        const exact=seasonId?all.filter(f=>!Number(f.season_id)||Number(f.season_id)===seasonId):all;
        const source=exact.length?exact:all;
        for(const f of source){
            if(f.home)teams.set(Number(f.home_id)||f.home,{id:Number(f.home_id)||0,name:String(f.home)});
            if(f.away)teams.set(Number(f.away_id)||f.away,{id:Number(f.away_id)||0,name:String(f.away)});
        }
    }catch(error){
        console.warn('[V64F DATA PRO] Fixtures no disponibles.',error);
    }

    return [...teams.values()].sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));
}

async function prepararEquiposDataProActualV64F(ligaValue,temporadaValue) {
    const select=document.getElementById('selectEquipoPro');
    if(!select)return [];
    const previous=String(select.value||'');
    const teams=await equiposDataProActualDesdeCatalogoV64F(ligaValue,temporadaValue);
    const options=teams.map(team=>({value:team.name,label:team.name.toUpperCase()}));
    rellenarSelectSeguro(select,options,previous);
    refrescarSelectCustom('selectEquipoPro');
    if(select.value)actualizarAvatar(select.value,'pro');
    return teams;
}

function fechaPeruDataProV64F(iso) {
    const d=new Date(iso);
    if(Number.isNaN(d.getTime()))return {date:'FECHA POR DEFINIR',time:'—'};
    const date=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'short',day:'2-digit',month:'short'}).format(d).replace('.','').toUpperCase();
    const time=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit',hour12:true}).format(d).toUpperCase();
    return {date,time};
}

async function proximoPartidoDataProV64F(equipo) {
    if(!equipo)return null;
    const liga=document.getElementById('selectLigaPro')?.value||'';
    const temporada=document.getElementById('selectTemporadaPro')?.value||'';
    const compId=Number(window.INCA_TITAN?.competitionId?.(liga)||0);
    const seasonId=Number(window.INCA_TITAN?.seasonId?.(temporada)||0);
    if(!compId)return null;

    try{
        await window.INCA_FIXTURES?.ensureReady?.();
        const rows=window.INCA_FIXTURES?.upcoming?.({from:Date.now()-3600000,competitionId:compId})||[];
        const exact=rows.filter(f=>
            (!seasonId||!Number(f.season_id)||Number(f.season_id)===seasonId) &&
            (claveTexto(f.home)===claveTexto(equipo)||claveTexto(f.away)===claveTexto(equipo))
        );
        return exact[0]||null;
    }catch{
        return null;
    }
}

async function renderDataProActualVacioV64F() {
    const area=document.getElementById('db-content-area');
    if(!area)return;

    const equipo=String(document.getElementById('selectEquipoPro')?.value||'').trim();
    const seasonLabel=etiquetaTemporadaCompletaDataProV64F();
    const liga=document.getElementById('selectLigaPro')?.value||'';
    const compId=Number(window.INCA_TITAN?.competitionId?.(liga)||0);
    const seasonId=Number(window.INCA_TITAN?.seasonId?.(document.getElementById('selectTemporadaPro')?.value)||0);
    const teams=await equiposDataProActualDesdeCatalogoV64F(liga,document.getElementById('selectTemporadaPro')?.value||'');
    const next=await proximoPartidoDataProV64F(equipo);

    if(equipo){
        const name=document.getElementById('dbTeamName');
        if(name)name.textContent=equipo.toUpperCase();
        actualizarAvatar(equipo,'pro');
    }

    const teamLogo=equipo?obtenerEscudoEquipo(equipo):'';
    let nextHtml='';
    if(next){
        const p=fechaPeruDataProV64F(next.kickoff_utc);
        const rival=claveTexto(next.home)===claveTexto(equipo)?next.away:next.home;
        nextHtml=`<div class="inca-historic-current-empty__next">
          <i class="fa-regular fa-calendar-check" aria-hidden="true"></i>
          <div><small>PRÓXIMO PARTIDO DE LIGA</small><strong>${escaparHTML(equipo)} vs ${escaparHTML(rival)}</strong></div>
          <time>${escaparHTML(p.date)} · ${escaparHTML(p.time)}</time>
        </div>`;
    }else{
        nextHtml=`<div class="inca-historic-current-empty__next">
          <i class="fa-regular fa-calendar" aria-hidden="true"></i>
          <div><small>AGENDA ACTUAL</small><strong>${equipo?escaparHTML(equipo):'Selecciona un equipo para ver su contexto actual'}</strong></div>
          <time>LISTA</time>
        </div>`;
    }

    area.innerHTML=`<section class="inca-historic-current-empty" aria-label="Estado de la temporada actual">
      <div class="inca-historic-current-empty__hero">
        <div class="inca-historic-current-empty__logo">
          ${teamLogo?`<img src="${escaparAtributo(teamLogo)}" alt="Escudo de ${escaparAtributo(equipo)}">`:`<i class="fa-solid fa-shield-halved" aria-hidden="true"></i>`}
        </div>
        <div class="inca-historic-current-empty__copy">
          <small>HISTÓRICO PRO · CAMPAÑA ACTUAL</small>
          <h3>${equipo?escaparHTML(equipo):'Temporada preparada'}</h3>
          <p>No se reutiliza la campaña anterior. Los equipos y el calendario de la temporada actual ya están disponibles; las tablas estadísticas se activan cuando existan partidos finalizados con datos.</p>
        </div>
        <div class="inca-historic-current-empty__season">
          <span>TEMPORADA</span>
          <strong>${escaparHTML(seasonLabel)}</strong>
        </div>
      </div>
      <div class="inca-historic-current-empty__status">
        <article><i class="fa-solid fa-users" aria-hidden="true"></i><strong>${teams.length} EQUIPOS DISPONIBLES</strong><span>Selector preparado para la campaña actual.</span></article>
        <article><i class="fa-regular fa-calendar-check" aria-hidden="true"></i><strong>CALENDARIO ACTUAL</strong><span>Los próximos encuentros provienen de la agenda de liga.</span></article>
        <article><i class="fa-solid fa-chart-line" aria-hidden="true"></i><strong>ESTADÍSTICAS EN ESPERA</strong><span>0 heredado de temporadas anteriores. Sin números inventados.</span></article>
      </div>
      ${nextHtml}
    </section>`;

    const phase=document.getElementById('dbPhaseContext');
    const phaseLabel=document.getElementById('dbPhaseContextLabel');
    const phaseMeta=document.getElementById('dbPhaseContextMeta');
    if(phase)phase.hidden=false;
    if(phaseLabel)phaseLabel.textContent=`${seasonLabel} · CAMPAÑA ACTUAL`;
    if(phaseMeta)phaseMeta.textContent=`${teams.length} equipos disponibles · las métricas se activarán con los primeros partidos finalizados`;
}

function renderizarDatabase() {
    let equipoDom = document.getElementById('selectEquipoPro');
    if(!equipoDom) return;
    let equipo = equipoDom.value;

    if (estadoApp.pro?.v64fCurrentEmpty && esTemporadaActualDataProV64F()) {
        void renderDataProActualVacioV64F();
        return;
    }

    if(!equipo) return;
    actualizarAvatar(equipo, 'pro');

    let dbTeamName = document.getElementById('dbTeamName');
    if(dbTeamName) dbTeamName.innerText = equipo.toUpperCase();
    
    let dbArea = document.getElementById('db-content-area');
    if(!dbArea) return;
    
    let tabActual = estadoApp.dbState.tab;
    let split = estadoApp.dbState.split; 
    let hashes = Object.keys(estadoApp.pro.datosProcesados);
    
    let splitFilters = document.getElementById('dbSplitFilters');
    let proControls = document.getElementById('pro-controls-container');

    if (tabActual === 'Resumen') {
        if(splitFilters) splitFilters.style.display = 'none';
        if(proControls) {
            proControls.style.display = 'block';
            if (!document.getElementById('dbCategorySelect').options.length) {
                llenarSelectCategoriasPro();
                llenarSelectSubMercadosPro();
            }
        }

        if (!estadoApp.dbState.selectedSubId) {
            estadoApp.dbState.selectedCategory = "Total Match Goals";
            estadoApp.dbState.selectedSubId = "Over 2.5 Match Goals"; 
            estadoApp.dbState.matrizMetric = "Goles";
        }
        
        let metricaActiva = estadoApp.dbState.matrizMetric || 'Goles';
        let tableHTML = construirTablaMaestraRécord(equipo, metricaActiva);

        dbArea.innerHTML = `<div class="db-split-layout"><div class="db-table-container-wrap" style="width:100%;">${tableHTML}</div></div>`;
        return; 
    }

    if(splitFilters) splitFilters.style.display = 'flex';
    if(proControls) proControls.style.display = 'none';

    let conf = DB_DICTIONARY[tabActual];
    if(!conf) return;

    let partidosEvaluados = [];
    let sumMatch = 0, sumFor = 0, sumAgainst = 0;

    hashes.forEach(hash => {
        let match = estadoApp.pro.datosProcesados[hash];
        if (match.tiempo !== "ALL") return; 

        let esLocal = match.local.toUpperCase() === equipo.toUpperCase();
        let esVisita = match.visita.toUpperCase() === equipo.toUpperCase();
        
        if (!esLocal && !esVisita) return;
        if (split === 'HOME' && !esLocal) return;
        if (split === 'AWAY' && !esVisita) return;

        let statsPropio = esLocal ? match.sLocal : match.sVisita;
        let statsRival = esLocal ? match.sVisita : match.sLocal;

        let vFor = statsPropio[tabActual] || 0;
        let vAgainst = statsRival[tabActual] || 0;
        
        partidosEvaluados.push({ match: vFor + vAgainst, for: vFor, against: vAgainst });
        sumMatch += (vFor + vAgainst); sumFor += vFor; sumAgainst += vAgainst;
    });

    let totalP = partidosEvaluados.length;
    if(totalP === 0) {
        dbArea.innerHTML = `<div class="editor-panel-style" style="padding:40px; text-align:center; color:var(--text-muted); font-weight:800;">SIN REGISTROS DE TEMPORADA</div>`; return;
    }

    let avgMatch = (sumMatch/totalP).toFixed(2); let avgFor = (sumFor/totalP).toFixed(2); let avgAgainst = (sumAgainst/totalP).toFixed(2);
    let htmlAverages = `
    <div class="ac-table-wrapper">
        <div class="ac-table-header">PROMEDIOS DE TEMPORADA - ${tabActual} (${split === 'ALL' ? 'TODOS' : split === 'HOME' ? 'LOCAL' : 'VISITA'})</div>
        <table class="ac-table">
            <thead><tr><th>Partidos</th><th>Métrica</th><th>Promedio</th></tr></thead>
            <tbody>
                <tr><td>${totalP}</td><td>Partido Completo (Total)</td><td style="font-weight:900; color:var(--text-primary);">${avgMatch}</td></tr>
                <tr><td>${totalP}</td><td>A Favor (Del Equipo)</td><td style="font-weight:900; color:var(--text-primary);">${avgFor}</td></tr>
                <tr><td>${totalP}</td><td>En Contra (Del Rival)</td><td style="font-weight:900; color:var(--text-primary);">${avgAgainst}</td></tr>
            </tbody>
        </table>
    </div>
    `;

    function buildFreqTable(title, valArray, linesArray, labelStr) {
        if(!linesArray) return "";
        let rows = "";
        linesArray.forEach(line => {
            let hits = valArray.filter(v => v > line).length;
            let pct = totalP > 0 ? ((hits/totalP)*100).toFixed(0) : 0;
            let lowClass = pct < 50 ? 'low' : '';
            rows += `
                <tr>
                    <td style="width:10%;">${totalP}</td>
                    <td style="width:40%;">
                        <div class="ac-bar-bg ${lowClass}">
                            <div class="ac-bar-fill" style="width: ${pct}%;">${pct}%</div>
                        </div>
                    </td>
                    <td style="width:20%; font-family:'Montserrat'; font-weight:800; color:#64748b;">${hits} / ${totalP}</td>
                    <td style="width:30%; color:#475569;">Más de ${line} ${labelStr}</td>
                </tr>
            `;
        });
        return `<div class="ac-table-wrapper"><div class="ac-table-header">${title}</div><table class="ac-table"><thead><tr><th>Partidos</th><th>% de Acierto (Hit Rate)</th><th>Ratio</th><th>Mercado</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }

    let arrMatch = partidosEvaluados.map(p => p.match); 
    let arrFor = partidosEvaluados.map(p => p.for); 
    let arrAgainst = partidosEvaluados.map(p => p.against);

    let htmlManualPasses = '';
    let matchLines = conf.match;
    let forLines = conf.for;
    let againstLines = conf.against;

    if (tabActual === 'Pases') {
        const saved = estadoApp.dbState.passLines || (estadoApp.dbState.passLines = {match:799.5,for:399.5,against:399.5});
        matchLines = [Number(saved.match) || 799.5];
        forLines = [Number(saved.for) || 399.5];
        againstLines = [Number(saved.against) || 399.5];

        htmlManualPasses = `
          <div class="inca-pass-lines-pro">
            <div class="inca-pass-lines-pro__head">
              <span><i class="fa-solid fa-arrows-left-right"></i></span>
              <div><b>LÍNEAS BETANO · PASES</b><small>Escribe exactamente la línea publicada por la casa.</small></div>
            </div>
            <label>TOTAL PARTIDO
              <input type="number" min="0" max="2500" step="0.5" value="${matchLines[0]}"
                     oninput="actualizarLineaPasesHistorico('match',this.value)">
            </label>
            <label>EQUIPO
              <input type="number" min="0" max="1500" step="0.5" value="${forLines[0]}"
                     oninput="actualizarLineaPasesHistorico('for',this.value)">
            </label>
            <label>RIVAL
              <input type="number" min="0" max="1500" step="0.5" value="${againstLines[0]}"
                     oninput="actualizarLineaPasesHistorico('against',this.value)">
            </label>
          </div>`;
    }

    let htmlMatchFreq = buildFreqTable(`Totales del Partido - ${tabActual}`, arrMatch, matchLines, `Totales`);
    let htmlForFreq = buildFreqTable(`A Favor del Equipo - ${tabActual}`, arrFor, forLines, `A Favor`);
    let htmlAgainstFreq = buildFreqTable(`En Contra del Equipo - ${tabActual}`, arrAgainst, againstLines, `En Contra`);

    dbArea.innerHTML = htmlAverages + htmlManualPasses + htmlMatchFreq + htmlForFreq + htmlAgainstFreq;
}

// ==========================================================================
// 4. MÓDULO 3: PLAYER PROPS VIP
// ==========================================================================

function abrirVistaJugadores() {
    if (window.INCA_PLAYER_PROPS?.open) return window.INCA_PLAYER_PROPS.open();
    estadoApp.vistaActiva = 'jugadores';
    document.body.classList.add('pro-mode'); 
    
    if(document.getElementById('topBarScanner')) document.getElementById('topBarScanner').style.display = 'none';
    if(document.getElementById('topBarPro')) document.getElementById('topBarPro').style.display = 'none';
    
    let topBarPj = document.getElementById('topBarJugadores');
    if(topBarPj) topBarPj.style.display = 'flex';
    
    document.getElementById('vista-escaner').style.display = 'none';
    document.getElementById('vista-database').style.display = 'none';
    document.getElementById('vista-rankings').style.display = 'none';
    document.getElementById('vista-jugadores').style.display = 'block';
    
    document.querySelectorAll('.menu-option').forEach(opt => opt.classList.remove('active'));

    mostrarCargaPlayerVip(true, 'PREPARANDO PLAYER VIP...');

    const cargarRostrosDespues = () => {
        const ejecutar = async () => {
            await Promise.allSettled([
                cargarMapaCaras(),
                cargarIndiceIdsGlobal()
            ]);

            if (estadoApp.vistaActiva === 'jugadores') {
                actualizarVistaJugador();
            }
        };

        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => ejecutar(), { timeout: 3500 });
        } else {
            setTimeout(ejecutar, 350);
        }
    };

    if (!estadoApp.jugadores.cargado) {
        cargarBaseDatosJugadores()
            .then(() => {
                if (estadoApp.vistaActiva === 'jugadores') {
                    actualizarVistaJugador();
                    mostrarCargaPlayerVip(false);
                }
                cargarRostrosDespues();
            })
            .catch(() => mostrarCargaPlayerVip(false));
    } else {
        actualizarVistaJugador();
        mostrarCargaPlayerVip(false);
        cargarRostrosDespues();
    }
}


const PLAYER_VIP_CACHE = Object.freeze({
    key: 'player-vip-processed-v64-unified',
    version: 6,
    ttl: 1000 * 60 * 60 * 24 * 7
});

function mostrarCargaPlayerVip(mostrar, texto = 'CARGANDO...') {
    const vista = document.getElementById('vista-jugadores');
    if (!vista) return;

    let capa = document.getElementById('playerVipFastLoader');

    if (mostrar) {
        if (!capa) {
            capa = document.createElement('div');
            capa.id = 'playerVipFastLoader';
            capa.className = 'player-vip-fast-loader';
            capa.innerHTML = `
                <div class="player-vip-fast-loader__card">
                    <span class="player-vip-fast-loader__spinner" aria-hidden="true"></span>
                    <strong></strong>
                    <small>La interfaz permanece disponible</small>
                </div>
            `;
            vista.prepend(capa);
        }

        const titulo = capa.querySelector('strong');
        if (titulo) titulo.textContent = texto;
        capa.hidden = false;
    } else if (capa) {
        capa.hidden = true;
    }
}

function construirSnapshotPlayerVip() {
    return {
        version: PLAYER_VIP_CACHE.version,
        timestamp: Date.now(),
        datosAgrupados: estadoApp.jugadores.datosAgrupados,
        bioData: estadoApp.jugadores.bioData,
        periodos: estadoApp.jugadores.periodos,
        playerMeta: estadoApp.jugadores.playerMeta,
        listaNombres: estadoApp.jugadores.listaNombres,
        playerDataRevision: window.INCA_PLAYERS?.info?.()?.currentRevision || '',
        playerDataSource: 'INCA_PLAYERS_UNIFIED_V1'
    };
}

async function guardarSnapshotPlayerVip() {
    if (!window.INCA_DB || !estadoApp.jugadores.cargado) return;

    try {
        await window.INCA_DB.set(
            'player-index',
            PLAYER_VIP_CACHE.key,
            construirSnapshotPlayerVip()
        );
    } catch (error) {
        console.warn('[PLAYER VIP CACHE] No se pudo guardar.', error);
    }
}

async function restaurarSnapshotPlayerVip(expectedRevision = '') {
    if (!window.INCA_DB) return false;

    try {
        const snapshot = await window.INCA_DB.get(
            'player-index',
            PLAYER_VIP_CACHE.key
        );

        if (
            !snapshot ||
            snapshot.version !== PLAYER_VIP_CACHE.version ||
            Date.now() - snapshot.timestamp > PLAYER_VIP_CACHE.ttl ||
            !snapshot.datosAgrupados ||
            !snapshot.playerMeta ||
            !Array.isArray(snapshot.listaNombres) ||
            snapshot.playerDataSource !== 'INCA_PLAYERS_UNIFIED_V1' ||
            String(snapshot.playerDataRevision || '') !== String(expectedRevision || '')
        ) {
            return false;
        }

        estadoApp.jugadores.matrizCrudaCSV = [];
        estadoApp.jugadores.datosAgrupados = snapshot.datosAgrupados;
        estadoApp.jugadores.bioData = snapshot.bioData || {};
        estadoApp.jugadores.periodos = snapshot.periodos || {};
        estadoApp.jugadores.playerMeta = snapshot.playerMeta;
        estadoApp.jugadores.listaNombres = snapshot.listaNombres;
        estadoApp.jugadores.listaNombresFiltrada = [...snapshot.listaNombres];
        estadoApp.jugadores.cargado = true;

        const primera = estadoApp.jugadores.seleccionado &&
            estadoApp.jugadores.playerMeta[estadoApp.jugadores.seleccionado]
                ? estadoApp.jugadores.seleccionado
                : snapshot.listaNombres[0];

        if (primera) {
            estadoApp.jugadores.seleccionado = primera;
            const meta = estadoApp.jugadores.playerMeta[primera] || {};
            const input = document.getElementById('inputBusquedaJugador');
            if (input) input.value = meta.label || meta.nombre || '';
        }

        configurarBuscadorPro();
        ['selectCondicionPj', 'selectRangoPj', 'pjSelectMercado']
            .forEach(refrescarSelectCustom);

        console.info(
            `[PLAYER VIP CACHE] ${snapshot.listaNombres.length} jugadores restaurados desde IndexedDB`
        );
        return true;
    } catch (error) {
        console.warn('[PLAYER VIP CACHE] No se pudo restaurar.', error);
        return false;
    }
}

async function cargarBaseDatosJugadores() {
    if (estadoApp.jugadores.cargado) return estadoApp.jugadores;
    if (estadoApp.promesaCargaJugadores) return estadoApp.promesaCargaJugadores;

    estadoApp.promesaCargaJugadores = cargarBaseDatosJugadoresInterna();
    try {
        return await estadoApp.promesaCargaJugadores;
    } finally {
        estadoApp.promesaCargaJugadores = null;
    }
}

async function cargarBaseDatosJugadoresInterna() {
    const statusBox = document.getElementById('statusCargaJugadores');

    mostrarCargaPlayerVip(true, 'CONECTANDO BASE UNIFICADA DE JUGADORES...');

    let playerUnifiedReady = false;
    let playerRevision = '';
    try {
        await window.INCA_PLAYERS?.ensureReady?.();
        playerUnifiedReady = Boolean(window.INCA_PLAYERS?.allRows?.().length);
        playerRevision = window.INCA_PLAYERS?.info?.()?.currentRevision || '';
    } catch (error) {
        console.warn('[PLAYER VIP] Base unificada no disponible; se mantiene fallback legacy.', error);
    }

    mostrarCargaPlayerVip(true, 'BUSCANDO DATOS GUARDADOS...');

    if (playerUnifiedReady && await restaurarSnapshotPlayerVip(playerRevision)) {
        if (statusBox) {
            statusBox.className = 'status-dot ready';
            statusBox.title = `Data restaurada: ${estadoApp.jugadores.listaNombres.length} jugadores`;
        }

        mostrarCargaPlayerVip(false);
        actualizarVistaJugador();
        return estadoApp.jugadores;
    }

    mostrarCargaPlayerVip(true, 'PROCESANDO BASE POR PRIMERA VEZ...');
    const solicitudId = ++estadoApp.solicitudes.jugadores;
    if (statusBox) {
        statusBox.className = 'status-dot loading';
        statusBox.title = 'Conectando base de jugadores...';
    }

    const base = 'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/';
    const urlStatsLegacy = `${base}IncaStats_Final_V3.csv`;
    const urlBio = `${base}IncaStats_Data_V5.csv`;
    const urlPeriodos = `${base}IncaStats_Periodos_Club_ALFABETICO.csv`;

    try {
        const [dataBio, resultadoPeriodos] = await Promise.all([
            obtenerCSVRemoto(urlBio, { cacheKey: 'inca_players_bio_v5', ttl: INCA_CONFIG.PLAYER_CACHE_TTL_MS }),
            obtenerCSVRemoto(urlPeriodos, { cacheKey: 'inca_players_periodos_v5', ttl: INCA_CONFIG.PLAYER_CACHE_TTL_MS })
                .then(data => ({ data, error: null }))
                .catch(error => ({ data: [], error }))
        ]);

        let dataStats = playerUnifiedReady ? (window.INCA_PLAYERS?.allRows?.() || []) : [];
        if (!dataStats.length) {
            dataStats = await obtenerCSVRemoto(urlStatsLegacy, { cacheKey: 'inca_players_stats_v5', ttl: INCA_CONFIG.PLAYER_CACHE_TTL_MS });
        }

        if (solicitudId !== estadoApp.solicitudes.jugadores) return;
        validarColumnas(dataStats, ['Jugador'], 'Estadísticas de jugadores');
        validarColumnas(dataBio, ['Jugador'], 'Biografía de jugadores');
        if (resultadoPeriodos.error) console.warn('La base de periodos no estuvo disponible; se usará la condición original del partido.', resultadoPeriodos.error);

        // Las caras se resuelven después de mostrar datos y estadísticas.
        procesarDataAmbosArchivos(dataStats, dataBio, resultadoPeriodos.data);
        estadoApp.jugadores.cargado = true;
        await guardarSnapshotPlayerVip();
        if (statusBox) {
            statusBox.className = 'status-dot ready';
            statusBox.title = `Data unificada lista: ${estadoApp.jugadores.listaNombres.length} jugadores`;
        }
        mostrarCargaPlayerVip(false);
    } catch (error) {
        if (solicitudId !== estadoApp.solicitudes.jugadores) return;
        estadoApp.jugadores.cargado = false;
        if (statusBox) {
            statusBox.className = 'status-dot error';
            statusBox.title = 'Error de red o formato';
        }
        const resultados = document.getElementById('resultadosBusquedaJugador');
        if (resultados) resultados.innerHTML = `<div class="pro-search-item" style="color:var(--bar-red);">${escaparHTML(error.message)}</div>`;
        mostrarCargaPlayerVip(false);
        console.error('Error cargando CSV de jugadores:', error);
        throw error;
    }
}

function procesarDataAmbosArchivos(dataStats, dataBio, dataPeriodos) {
    const dictJugadores = {};
    const dictBio = {};
    const dictPeriodos = {};
    const playerMeta = {};
    const bioPorId = new Map();
    const bioPorNombre = new Map();
    const idsPorNombre = new Map();

    const registrarIdNombre = (nombre, id) => {
        if (!nombre || !id) return;
        if (!idsPorNombre.has(nombre)) idsPorNombre.set(nombre, new Set());
        idsPorNombre.get(nombre).add(id);
    };

    (dataBio || []).forEach(row => {
        const nombreNormalizado = claveTexto(row?.Jugador);
        if (!nombreNormalizado) return;
        const id = obtenerIdJugadorFila(row);
        if (id) {
            bioPorId.set(id, row);
            registrarIdNombre(nombreNormalizado, id);
        }
        if (!bioPorNombre.has(nombreNormalizado)) bioPorNombre.set(nombreNormalizado, []);
        bioPorNombre.get(nombreNormalizado).push(row);
    });

    (dataStats || []).forEach(row => {
        const nombreNormalizado = claveTexto(row?.Jugador);
        const id = obtenerIdJugadorFila(row);
        registrarIdNombre(nombreNormalizado, id);
    });

    const resolverClave = row => {
        const nombre = claveTexto(row?.Jugador);
        const idDirecto = obtenerIdJugadorFila(row);
        const ids = idsPorNombre.get(nombre);
        const idInferido = !idDirecto && ids?.size === 1 ? Array.from(ids)[0] : '';
        const id = idDirecto || idInferido;
        return id ? `ID:${id}` : `NOMBRE:${nombre}`;
    };

    const datosUnicos = [];
    const deduplicador = new Set();

    (dataStats || []).forEach(row => {
        const nombreOriginal = normalizarTexto(row?.Jugador);
        const nombreNormalizado = claveTexto(nombreOriginal);
        if (!nombreNormalizado) return;

        const clave = resolverClave(row);
        const id = clave.startsWith('ID:') ? clave.slice(3) : '';
        const fecha = normalizarTexto(row?.Fecha);
        const partido = claveTexto(row?.Partido);
        const torneo = claveTexto(obtenerValor(row, ['Torneo', 'Competicion', 'Liga', 'Competition'], ''));
        const hash = `${clave}|${fecha}|${partido}|${torneo}`;
        if (deduplicador.has(hash)) return;
        deduplicador.add(hash);
        datosUnicos.push(row);

        if (!dictJugadores[clave]) dictJugadores[clave] = [];
        dictJugadores[clave].push(row);

        const bio = (id && bioPorId.get(id)) || bioPorNombre.get(nombreNormalizado)?.[0] || {};
        dictBio[clave] = bio;

        const fechaObj = parseDate(fecha);
        const fechaTime = Number.isFinite(fechaObj.getTime()) ? fechaObj.getTime() : 0;
        const equipoFila = normalizarTexto(obtenerValor(row, ['Equipo', 'Club'], ''));
        const posicion = normalizarTexto(obtenerValor(bio, ['Posicion', 'Posición'], obtenerValor(row, ['Posicion', 'Posición'], '')));

        if (!playerMeta[clave]) {
            playerMeta[clave] = {
                key: clave,
                id,
                nombre: nombreOriginal,
                nombreNormalizado,
                equipo: equipoFila,
                posicion,
                fechaUltima: fechaTime,
                label: nombreOriginal
            };
        } else if (fechaTime >= playerMeta[clave].fechaUltima) {
            if (equipoFila) playerMeta[clave].equipo = equipoFila;
            if (posicion) playerMeta[clave].posicion = posicion;
            playerMeta[clave].fechaUltima = fechaTime;
        }
    });

    const clavesPorNombre = new Map();
    Object.values(playerMeta).forEach(meta => {
        if (!clavesPorNombre.has(meta.nombreNormalizado)) clavesPorNombre.set(meta.nombreNormalizado, []);
        clavesPorNombre.get(meta.nombreNormalizado).push(meta.key);
    });

    (dataPeriodos || []).forEach(row => {
        const nombre = claveTexto(row?.Jugador);
        if (!nombre) return;
        const id = obtenerIdJugadorFila(row);
        const candidatas = id && playerMeta[`ID:${id}`] ? [`ID:${id}`] : (clavesPorNombre.get(nombre) || []);
        if (!candidatas.length) return;

        const desde = parseDate(obtenerValor(row, ['Desde'], '1900-01-01'));
        const hastaRaw = obtenerValor(row, ['Hasta'], '2100-01-01');
        const hasta = parseDate(hastaRaw);
        if (Number.isFinite(hasta.getTime())) hasta.setHours(23, 59, 59, 999);
        const club = claveTexto(obtenerValor(row, ['Club', 'Equipo'], ''));

        candidatas.forEach(clave => {
            if (!dictPeriodos[clave]) dictPeriodos[clave] = [];
            dictPeriodos[clave].push({ club, desde, hasta });
        });
    });

    Object.values(dictPeriodos).forEach(periodos => periodos.sort((a, b) => a.desde - b.desde));

    clavesPorNombre.forEach(claves => {
        if (claves.length <= 1) return;
        claves.forEach(clave => {
            const meta = playerMeta[clave];
            const detalle = meta.equipo || (meta.id ? `ID ${meta.id}` : 'JUGADOR');
            meta.label = `${meta.nombre} · ${detalle}`;
        });
    });

    estadoApp.jugadores.matrizCrudaCSV = datosUnicos;
    estadoApp.jugadores.datosAgrupados = dictJugadores;
    estadoApp.jugadores.bioData = dictBio;
    estadoApp.jugadores.periodos = dictPeriodos;
    estadoApp.jugadores.playerMeta = playerMeta;
    estadoApp.jugadores.listaNombres = Object.keys(dictJugadores).sort((a, b) => {
        const ma = playerMeta[a];
        const mb = playerMeta[b];
        return ma.nombre.localeCompare(mb.nombre, 'es') || ma.equipo.localeCompare(mb.equipo, 'es');
    });
    estadoApp.jugadores.listaNombresFiltrada = [...estadoApp.jugadores.listaNombres];

    if (estadoApp.jugadores.listaNombresFiltrada.length > 0) {
        const primera = estadoApp.jugadores.listaNombresFiltrada[0];
        estadoApp.jugadores.seleccionado = primera;
        const input = document.getElementById('inputBusquedaJugador');
        if (input) input.value = playerMeta[primera]?.label || playerMeta[primera]?.nombre || '';
    }

    configurarBuscadorPro();
    ['selectCondicionPj', 'selectRangoPj', 'pjSelectMercado'].forEach(refrescarSelectCustom);
    actualizarVistaJugador();
}

function setCategoriaPj(categoria, btn) {
    document.querySelectorAll('.category-btn').forEach(boton => boton.classList.remove('active'));
    if (btn) btn.classList.add('active');
    estadoApp.jugadores.categoriaActiva = categoria;

    const input = document.getElementById('inputBusquedaJugador');
    if (input) input.value = '';

    if (categoria === 'TODOS') {
        estadoApp.jugadores.listaNombresFiltrada = [...estadoApp.jugadores.listaNombres];
        aplicarTemaPosicion(null);
    } else {
        estadoApp.jugadores.listaNombresFiltrada = estadoApp.jugadores.listaNombres.filter(clave => {
            const bio = estadoApp.jugadores.bioData[clave] || {};
            const meta = estadoApp.jugadores.playerMeta[clave] || {};
            const posicion = obtenerValor(bio, ['Posicion', 'Posición'], meta.posicion || '');
            return clasificarPosicion(posicion) === categoria;
        });
        aplicarTemaPosicion(categoria);
    }

    document.getElementById('resultadosBusquedaJugador')?.parentElement?.classList.remove('focused');
    const primera = estadoApp.jugadores.listaNombresFiltrada[0];
    if (primera) {
        estadoApp.jugadores.seleccionado = primera;
        const meta = estadoApp.jugadores.playerMeta[primera];
        if (input) input.value = meta?.label || meta?.nombre || '';
        actualizarVistaJugador();
    }
}


const PLAYER_VIP_FILTERS = Object.freeze({
    storageKey: 'inca-player-vip-filters-v17-6'
});

function capturarFiltrosPlayerVip() {
    const leer = id => document.getElementById(id)?.value ?? '';
    const filtros = {
        categoria: estadoApp.jugadores.categoriaActiva || 'TODOS',
        modo: estadoApp.jugadores.modoPj || 'promedios',
        torneo: leer('selectTorneoPj') || 'ALL',
        rango: leer('selectRangoPj') || 'ALL',
        condicion: leer('selectCondicionPj') || 'ALL',
        mercado: leer('pjSelectMercado') || 'TODO',
        linea: leer('pjSelectLinea') || ''
    };

    try {
        localStorage.setItem(PLAYER_VIP_FILTERS.storageKey, JSON.stringify(filtros));
    } catch {}

    return filtros;
}

function leerFiltrosPlayerVip() {
    try {
        const guardados = JSON.parse(localStorage.getItem(PLAYER_VIP_FILTERS.storageKey) || 'null');
        return guardados && typeof guardados === 'object'
            ? guardados
            : capturarFiltrosPlayerVip();
    } catch {
        return capturarFiltrosPlayerVip();
    }
}

function aplicarValorSelectSiExiste(id, valor, fallback = null) {
    const select = document.getElementById(id);
    if (!select) return;

    const existe = Array.from(select.options).some(option => option.value === valor);
    if (existe) {
        select.value = valor;
    } else if (fallback !== null) {
        const existeFallback = Array.from(select.options).some(option => option.value === fallback);
        if (existeFallback) select.value = fallback;
    }

    refrescarSelectCustom(id);
}

function restaurarFiltrosPlayerVip(filtros = leerFiltrosPlayerVip()) {
    aplicarValorSelectSiExiste('selectCondicionPj', filtros.condicion, 'ALL');
    aplicarValorSelectSiExiste('selectRangoPj', filtros.rango, 'ALL');
    aplicarValorSelectSiExiste('selectTorneoPj', filtros.torneo, 'ALL');
    aplicarValorSelectSiExiste('pjSelectMercado', filtros.mercado, 'TODO');
    aplicarValorSelectSiExiste('pjSelectLinea', filtros.linea, null);

    estadoApp.jugadores.modoPj = filtros.modo || estadoApp.jugadores.modoPj || 'promedios';
}

function configurarBuscadorPro() {
    const input = document.getElementById('inputBusquedaJugador');
    const resultados = document.getElementById('resultadosBusquedaJugador');
    if (!input || !resultados || !input.parentElement) return;
    const cajaBusqueda = input.parentElement;

    const renderizarLista = (filtroTexto = '') => {
        resultados.replaceChildren();
        const filtro = claveTexto(filtroTexto);
        let claves = estadoApp.jugadores.listaNombresFiltrada.filter(clave => {
            const meta = estadoApp.jugadores.playerMeta[clave] || {};
            const buscable = claveTexto(`${meta.nombre || ''} ${meta.equipo || ''} ${meta.id || ''}`);
            return !filtro || buscable.includes(filtro);
        });

        const total = claves.length;
        claves = claves.slice(0, INCA_CONFIG.MAX_SEARCH_RESULTS);
        if (!claves.length) {
            const vacio = document.createElement('div');
            vacio.className = 'pro-search-item';
            vacio.style.color = 'var(--bar-red)';
            vacio.textContent = 'SIN RESULTADOS';
            resultados.appendChild(vacio);
            return;
        }

        const fragment = document.createDocumentFragment();
        claves.forEach(clave => {
            const meta = estadoApp.jugadores.playerMeta[clave] || {};
            const item = document.createElement('div');
            item.className = 'pro-search-item';
            item.setAttribute('role', 'option');

            const icono = document.createElement('i');
            icono.className = 'fa-solid fa-user-astronaut';
            const texto = document.createElement('span');
            texto.textContent = meta.label || meta.nombre || clave;
            item.append(icono, texto);

            item.addEventListener('mousedown', event => {
                event.preventDefault();
                const filtrosPrevios = capturarFiltrosPlayerVip();
                estadoApp.jugadores.seleccionado = clave;
                input.value = meta.label || meta.nombre || '';
                cajaBusqueda.classList.remove('focused');
                resultados.replaceChildren();
                actualizarVistaJugador();
                restaurarFiltrosPlayerVip(filtrosPrevios);
                actualizarVistaJugador();
            });
            fragment.appendChild(item);
        });

        if (total > claves.length) {
            const nota = document.createElement('div');
            nota.className = 'pro-search-item';
            nota.style.color = 'var(--text-muted)';
            nota.textContent = `ESCRIBE MÁS PARA FILTRAR (${total} COINCIDENCIAS)`;
            fragment.appendChild(nota);
        }
        resultados.appendChild(fragment);
    };

    input._renderPlayerSearch = renderizarLista;
    if (input.dataset.buscadorConfigurado === 'true') return;
    input.dataset.buscadorConfigurado = 'true';

    input.addEventListener('focus', () => {
        cajaBusqueda.classList.add('focused');
        input._renderPlayerSearch?.(input.value);
    });
    input.addEventListener('input', debounce(event => {
        cajaBusqueda.classList.add('focused');
        input._renderPlayerSearch?.(event.target.value);
    }, 180));
    input.addEventListener('blur', () => {
        cajaBusqueda.classList.remove('focused');
        if (!input.value.trim() && estadoApp.jugadores.seleccionado) {
            const meta = estadoApp.jugadores.playerMeta[estadoApp.jugadores.seleccionado];
            input.value = meta?.label || meta?.nombre || '';
        }
    });
    input.addEventListener('keydown', event => {
        if (event.key === 'Escape') cajaBusqueda.classList.remove('focused');
    });
}

function setTabPj(tab, btn) {
    document.querySelectorAll('#vista-jugadores .db-market-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    estadoApp.jugadores.modoPj = tab;
    
    let controls = document.getElementById('pjOddsControls');
    let grid = document.getElementById('pjStatsGrid');
    
    if(tab === 'odds') {
        controls.style.display = 'flex';
        grid.style.display = 'none';
        cargarLineasMercadoPj(true); 
    } else {
        controls.style.display = 'none';
        grid.style.display = 'grid';
        actualizarVistaJugador();
    }
}

function cargarLineasMercadoPj(reconstruirMercados = false, preventUpdate = false) {
    let nombrePj = estadoApp.jugadores.seleccionado;
    if (!nombrePj) return;
    
    let bioPj = estadoApp.jugadores.bioData[nombrePj] || {};
    let posDeclarada = bioPj["Posicion"] ? bioPj["Posicion"].trim().toUpperCase() : "";

    let posCat = "DEFENSA"; 
    if (posDeclarada.includes('ARQUERO') || posDeclarada.includes('PORTERO')) posCat = "ARQUERO";
    else if (posDeclarada.includes('MEDIO') || posDeclarada.includes('CENTRO')) posCat = "MEDIO";
    else if (posDeclarada.includes('DELANTERO') || posDeclarada.includes('ATACANTE') || posDeclarada.includes('EXTREMO')) posCat = "DELANTERO";

    const LIMITES_PROPS_POSICION = {
        "ARQUERO": { "Pases_Totales": { label: "Pases Totales", min: 9.5, max: 49.5, step: 5.0, isPass: true }, "Atajadas": { label: "Atajadas", min: 0.5, max: 6.5, step: 1.0 } },
        "DEFENSA": { "Tiros_Totales": { label: "Tiros Totales", min: 0.5, max: 2.5, step: 1.0 }, "Tiros_Al_Arco": { label: "Tiros Al Arco", min: 0.5, max: 1.5, step: 1.0 }, "Asistencias": { label: "Asistencias", min: 0.5, max: 1.5, step: 1.0 }, "Pases_Totales": { label: "Pases Totales", min: 19.5, max: 119.5, step: 5.0, isPass: true }, "Entradas(Tackles)": { label: "Tackles (Entradas)", min: 0.5, max: 4.5, step: 1.0 }, "Faltas_Cometidas": { label: "Faltas Cometidas", min: 0.5, max: 3.5, step: 1.0 }, "Faltas_Recibidas": { label: "Faltas Ganadas (Recibidas)", min: 0.5, max: 2.5, step: 1.0 }, "Tarjetas_Generales": { label: "Tarjetas en General", min: 0.5, max: 2.5, step: 1.0 } },
        "MEDIO": { "Tiros_Totales": { label: "Tiros Totales", min: 0.5, max: 3.5, step: 1.0 }, "Tiros_Al_Arco": { label: "Tiros Al Arco", min: 0.5, max: 2.5, step: 1.0 }, "Asistencias": { label: "Asistencias", min: 0.5, max: 1.5, step: 1.0 }, "Pases_Totales": { label: "Pases Totales", min: 19.5, max: 119.5, step: 5.0, isPass: true }, "Entradas(Tackles)": { label: "Tackles (Entradas)", min: 0.5, max: 4.5, step: 1.0 }, "Faltas_Cometidas": { label: "Faltas Cometidas", min: 0.5, max: 3.5, step: 1.0 }, "Faltas_Recibidas": { label: "Faltas Ganadas (Recibidas)", min: 0.5, max: 2.5, step: 1.0 }, "Tarjetas_Generales": { label: "Tarjetas en General", min: 0.5, max: 2.5, step: 1.0 } },
        "DELANTERO": { "Tiros_Totales": { label: "Tiros Totales", min: 0.5, max: 5.5, step: 1.0 }, "Tiros_Al_Arco": { label: "Tiros Al Arco", min: 0.5, max: 3.5, step: 1.0 }, "Asistencias": { label: "Asistencias", min: 0.5, max: 1.5, step: 1.0 }, "Pases_Totales": { label: "Pases Totales", min: 9.5, max: 49.5, step: 5.0, isPass: true }, "Entradas(Tackles)": { label: "Tackles (Entradas)", min: 0.5, max: 4.5, step: 1.0 }, "Faltas_Cometidas": { label: "Faltas Cometidas", min: 0.5, max: 3.5, step: 1.0 }, "Faltas_Recibidas": { label: "Faltas Ganadas (Recibidas)", min: 0.5, max: 2.5, step: 1.0 }, "Tarjetas_Generales": { label: "Tarjetas en General", min: 0.5, max: 2.5, step: 1.0 }, "Offsides": { label: "Fueras de Juego", min: 0.5, max: 1.5, step: 1.0 } }
    };

    let mercadoSelect = document.getElementById('pjSelectMercado');
    let selectLinea = document.getElementById('pjSelectLinea');
    if(!mercadoSelect || !selectLinea) return;

    let mercadosDisponibles = LIMITES_PROPS_POSICION[posCat];
    let currentMercado = mercadoSelect.value;

    if (reconstruirMercados) {
        let htmlMercados = `<option value="TODO">TODO · TODAS LAS MÉTRICAS</option>`;
        let foundCurrent = currentMercado === 'TODO';
        for(let key in mercadosDisponibles) {
            htmlMercados += `<option value="${key}">${mercadosDisponibles[key].label}</option>`;
            if (key === currentMercado) foundCurrent = true;
        }
        mercadoSelect.innerHTML = htmlMercados;
        if (!foundCurrent) mercadoSelect.selectedIndex = 0; else mercadoSelect.value = currentMercado;
        refrescarSelectCustom('pjSelectMercado');
        currentMercado = mercadoSelect.value;
    }

    if (currentMercado === 'TODO') {
        selectLinea.innerHTML = `<option value="">NO APLICA</option>`;
        selectLinea.disabled = true;
        refrescarSelectCustom('pjSelectLinea');

        const contenedorLinea = selectLinea.closest('.filter-group, .pj-odds-control, div');
        if (contenedorLinea) contenedorLinea.classList.add('pj-line-disabled');

        if (!preventUpdate && !window.isUpdatingOdds) actualizarVistaJugador();
        return;
    }

    selectLinea.disabled = false;
    const contenedorLinea = selectLinea.closest('.filter-group, .pj-odds-control, div');
    if (contenedorLinea) contenedorLinea.classList.remove('pj-line-disabled');

    let limites = mercadosDisponibles[currentMercado] || { min: 0.5, max: 1.5, step: 1.0 };
    let currentLinea = parseFloat(selectLinea.value);
    let htmlLineas = "";
    let firstLinea = null;
    let foundCurrentLinea = false;

    for(let i = limites.min; i <= limites.max; i += limites.step) {
        let label = limites.isPass ? `+${Math.ceil(i)}` : i;
        htmlLineas += `<option value="${i}">${label}</option>`;
        if (firstLinea === null) firstLinea = i;
        if (i === currentLinea) foundCurrentLinea = true;
    }

    selectLinea.innerHTML = htmlLineas;
    if (foundCurrentLinea) selectLinea.value = currentLinea; else selectLinea.value = firstLinea;
    refrescarSelectCustom('pjSelectLinea');

    if (!preventUpdate && !window.isUpdatingOdds) actualizarVistaJugador();
}

function crearTarjetaPj(titulo, promedio, imgName, colorClass = "#ffffff", isActive = false) {
    const activeClass = isActive ? 'pj-card-active' : '';
    return `
        <article class="pj-stat-card pj-super-card ${activeClass}" style="background-image:url('img/cards/${imgName}.webp'); --pj-accent:${colorClass};">
            <div class="pj-stat-overlay"></div>
            <div class="pj-stat-content">
                <span class="pj-stat-title">${escaparHTML(titulo)}</span>
                <strong class="pj-stat-avg">${escaparHTML(promedio)}</strong>
                <span class="pj-stat-label">POR PARTIDO</span>
            </div>
        </article>
    `;
}

function parseDate(dateStr) {
    if (dateStr instanceof Date) return new Date(dateStr.getTime());
    const texto = normalizarTexto(dateStr);
    if (!texto || texto === '-') return new Date(Number.NaN);

    let match = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (match) {
        const fecha = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
        return Number.isFinite(fecha.getTime()) ? fecha : new Date(Number.NaN);
    }

    match = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
        const fecha = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return Number.isFinite(fecha.getTime()) ? fecha : new Date(Number.NaN);
    }

    const fecha = new Date(texto);
    return Number.isFinite(fecha.getTime()) ? fecha : new Date(Number.NaN);
}


function resumirTorneoJugador(nombreOriginal) {
    const nombre = normalizarTexto(nombreOriginal).toUpperCase();
    if (!nombre || nombre === '-') return '—';

    const reglas = [
        [/UEFA CHAMPIONS LEAGUE|CHAMPIONS LEAGUE/, 'UCL'],
        [/UEFA EUROPA LEAGUE|EUROPA LEAGUE/, 'UEL'],
        [/UEFA CONFERENCE LEAGUE|CONFERENCE LEAGUE/, 'UECL'],
        [/CLUB FRIENDLY|FRIENDLY|AMISTOSO/, 'AMISTOSO'],
        [/EREDIVISIE/, 'EREDIVISIE'],
        [/EERSTE DIVISIE/, 'EERSTE DIV.'],
        [/KNVB BEKER/, 'KNVB CUP'],
        [/PREMIER LEAGUE/, 'PREMIER'],
        [/LA ?LIGA/, 'LALIGA'],
        [/SERIE A/, 'SERIE A'],
        [/BUNDESLIGA/, 'BUNDESLIGA'],
        [/LIGUE 1/, 'LIGUE 1'],
        [/COPA DEL REY/, 'COPA REY'],
        [/FA CUP/, 'FA CUP'],
        [/EFL CUP|CARABAO/, 'EFL CUP'],
        [/PLAYOFF/, 'PLAYOFF']
    ];

    for (const [patron, corto] of reglas) {
        if (patron.test(nombre)) return corto;
    }

    const palabras = nombre
        .replace(/[^A-Z0-9ÁÉÍÓÚÜÑ ]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

    if (palabras.length <= 2) return palabras.join(' ').slice(0, 15);
    return palabras.slice(0, 3).map(p => p.length <= 3 ? p : p.slice(0, 5)).join(' ');
}

function formatearPartidoJugador(partidoOriginal) {
    const partido = normalizarTexto(partidoOriginal);
    const partes = partido.split(/\s+VS\s+/i);

    if (partes.length !== 2) {
        return `<div class="pj-match-pair"><strong>${escaparHTML(partido || '—')}</strong></div>`;
    }

    return `
        <div class="pj-match-pair">
            <strong title="${escaparAtributo(partes[0])}">${escaparHTML(partes[0])}</strong>
            <span class="pj-match-versus">VS</span>
            <strong title="${escaparAtributo(partes[1])}">${escaparHTML(partes[1])}</strong>
        </div>
    `;
}


/* =========================================================
   V17.2 — COLUMNAS CONTEXTUALES EN EVALUADOR DE ODDS
   ========================================================= */

const PJ_COLUMNAS_METRICAS = [
    '.col-goles',
    '.col-asistencias',
    '.col-tiros',
    '.col-tiros-arco',
    '.col-pases',
    '.col-tackles',
    '.col-faltas-c',
    '.col-faltas-r',
    '.col-atajadas',
    '.col-amarillas',
    '.col-rojas',
    '.col-offsides'
];

function obtenerColumnasExtraOddsPj(mercado) {
    if (mercado === 'TODO') {
        return [
            '.col-tiros',
            '.col-tiros-arco',
            '.col-tackles',
            '.col-faltas-c',
            '.col-faltas-r',
            '.col-atajadas',
            '.col-amarillas',
            '.col-rojas',
            '.col-offsides'
        ];
    }

    const mapa = {
        'Tiros_Totales': ['.col-tiros', '.col-tiros-arco'],
        'Tiros_Al_Arco': ['.col-tiros', '.col-tiros-arco'],
        'Entradas(Tackles)': ['.col-tackles'],
        'Faltas_Cometidas': ['.col-faltas-c', '.col-faltas-r'],
        'Faltas_Recibidas': ['.col-faltas-c', '.col-faltas-r'],
        'Tarjetas_Generales': ['.col-amarillas', '.col-rojas'],
        'Offsides': ['.col-offsides'],
        'Atajadas': ['.col-atajadas'],
        'Atajadas(Portero)': ['.col-atajadas'],
        'Pases_Totales': [],
        'Asistencias': []
    };

    return mapa[mercado] || [];
}

function configurarColumnasHistorialPj(modoVista, mercadoOdd, esArquero) {
    const tabla = document.querySelector('#vista-jugadores .player-log-table');
    if (!tabla) return;

    let visibles;

    if (modoVista === 'odds') {
        // Estas cuatro métricas siempre se conservan en ODDS.
        visibles = new Set([
            '.col-goles',
            '.col-asistencias',
            '.col-pases',
            ...obtenerColumnasExtraOddsPj(mercadoOdd)
        ]);
        tabla.classList.add('pj-odds-focused');
    } else {
        tabla.classList.remove('pj-odds-focused');

        // En resumen se mantiene el comportamiento completo por posición.
        visibles = esArquero
            ? new Set(['.col-pases', '.col-atajadas', '.col-amarillas', '.col-rojas'])
            : new Set([
                '.col-goles',
                '.col-asistencias',
                '.col-tiros',
                '.col-tiros-arco',
                '.col-pases',
                '.col-tackles',
                '.col-faltas-c',
                '.col-faltas-r',
                '.col-amarillas',
                '.col-rojas',
                '.col-offsides'
            ]);
    }

    for (const selector of PJ_COLUMNAS_METRICAS) {
        const mostrar = visibles.has(selector);
        document
            .querySelectorAll(`#pjTablaHistorial ${selector}, .player-log-table thead ${selector}`)
            .forEach(elemento => {
                elemento.style.display = mostrar ? 'table-cell' : 'none';
            });
    }

    tabla.dataset.mercadoOdds = mercadoOdd || '';
}

function activarPrimerMenuAutomatico() {
    if (window.__incaPrimerMenuActivado) return;

    const preferencia = leerStorage(localStorage, 'prefMercado', '');
    const opciones = [...document.querySelectorAll('#sidebarMenu .menu-option, .menu-option')];

    let opcion = opciones.find(elemento => {
        const accion = elemento.getAttribute('onclick') || '';
        return preferencia && accion.includes(`'${preferencia}'`);
    });

    if (!opcion) opcion = opciones[0];
    if (!opcion) return;

    const accion = opcion.getAttribute('onclick') || '';
    const coincidencia = accion.match(/seleccionarMercado\(\s*['"]([^'"]+)['"]/);
    if (!coincidencia) return;

    const cabecera = opcion.closest('.accordion-item')?.querySelector('.accordion-header');
    if (cabecera && !cabecera.classList.contains('active')) {
        toggleAccordion(cabecera);
    }

    window.__incaPrimerMenuActivado = true;
    seleccionarMercado(coincidencia[1], opcion);
}

function actualizarVistaJugador() {
    const clavePj = estadoApp.jugadores.seleccionado;
    if (!clavePj) return;
    const metaPj = estadoApp.jugadores.playerMeta[clavePj] || { nombre: clavePj, label: clavePj };
    const nombrePj = metaPj.nombre || clavePj;

    const partidosPj = estadoApp.jugadores.datosAgrupados[clavePj] || [];
    const bioPj = estadoApp.jugadores.bioData[clavePj] || {};
    const periodosPj = estadoApp.jugadores.periodos[clavePj] || [];
    
    let posDeclarada = claveTexto(obtenerValor(bioPj, ["Posicion", "Posición"], metaPj.posicion || "")) || null;
    
    if (estadoApp.jugadores.categoriaActiva !== 'TODOS') aplicarTemaPosicion(posDeclarada);

    let torneoDom = document.getElementById('selectTorneoPj');
    let currentTorneoVal = torneoDom ? torneoDom.value : "ALL";

    if (estadoApp.jugadores.ultimoPjTorneos !== clavePj) {
        let playerTorneos = new Set();
        partidosPj.forEach(p => {
            let t = p["Torneo"] || p["Competicion"] || p["Liga"] || p["Competition"];
            if (t && t.trim() !== "") playerTorneos.add(t.trim().toUpperCase());
        });
        
        if (torneoDom) {
            const opcionesTorneos = [{ value: 'ALL', label: 'TODOS LOS TORNEOS' }];
            Array.from(playerTorneos).sort().forEach(t => opcionesTorneos.push({ value: t, label: t }));
            rellenarSelectSeguro(torneoDom, opcionesTorneos, 'ALL');
            refrescarSelectCustom('selectTorneoPj');
        }
        estadoApp.jugadores.ultimoPjTorneos = clavePj;

        const filtrosGuardados = leerFiltrosPlayerVip();
        const torneoDeseado = currentTorneoVal || filtrosGuardados.torneo || 'ALL';
        aplicarValorSelectSiExiste('selectTorneoPj', torneoDeseado, 'ALL');
        currentTorneoVal = document.getElementById('selectTorneoPj')?.value || 'ALL';
    }

    let condicionDom = document.getElementById('selectCondicionPj');
    let rangoDom = document.getElementById('selectRangoPj');
    let condicionFiltro = condicionDom ? condicionDom.value : "ALL";
    let limitePartidos = rangoDom ? rangoDom.value : "ALL";
    let torneoFiltro = currentTorneoVal;
    let modoVista = estadoApp.jugadores.modoPj;

    if (modoVista === 'odds' && !window.isUpdatingOdds) {
        window.isUpdatingOdds = true;
        cargarLineasMercadoPj(true, true);
        window.isUpdatingOdds = false;
    }

    let nameDisplay = document.getElementById('pjNameDisplay');
    if(nameDisplay) nameDisplay.innerText = nombrePj;
    let labelPos = document.getElementById('pjPositionDisplay');
    if(labelPos) labelPos.innerText = posDeclarada || "POSICIÓN PENDIENTE";

    const displayFoto = document.getElementById('pjFotoDisplay');
    const placeholderFoto = document.getElementById('pjFotoPlaceholder');
    if (displayFoto) {
        const fotoUrl = obtenerValor(bioPj, ['Foto_URL', 'Foto', 'Imagen_URL'], '');
        const idJugador = obtenerIdJugadorFila(
            bioPj,
            partidosPj.length > 0 ? obtenerIdJugadorFila(partidosPj[0]) : (metaPj.id || '')
        ) || inferirIdJugador(nombrePj, metaPj.equipo || obtenerValor(bioPj, ['Equipo', 'Club'], ''));
        resolverCaraJugador(displayFoto, {
            idJugador,
            fotoUrl,
            nombre: nombrePj,
            equipo: metaPj.equipo || obtenerValor(bioPj, ['Equipo', 'Club'], ''),
            prioridad: true
        }, placeholderFoto);
    }

    let valAltura = bioPj["Altura_cm"];
    if(valAltura && !isNaN(valAltura)) valAltura = parseFloat(valAltura); 
    let heightDisplay = document.getElementById('pjHeightDisplay');
    if(heightDisplay) heightDisplay.innerHTML = `<i class="fa-solid fa-ruler-vertical"></i> ${valAltura ? valAltura + ' cm' : '-- cm'}`;
    
    let valPie = bioPj["Pie_Preferido"];
    let footDisplay = document.getElementById('pjFootDisplay');
    if(footDisplay) footDisplay.innerHTML = `<i class="fa-solid fa-shoe-prints"></i> PIE: ${valPie ? escaparHTML(String(valPie).toUpperCase()) : '--'}`;
    
    const valMercado = bioPj["Valor_Mercado"];
    const valueDisplay = document.getElementById('pjValueDisplay');
    if(valueDisplay) valueDisplay.innerHTML = `<i class="fa-solid fa-sack-dollar"></i> VALOR: ${formatearValorMercado(valMercado)}`;

    let valDorsal = bioPj["Dorsal"];
    let dorsalDisplay = document.getElementById('pjDorsalDisplay');
    if(dorsalDisplay) {
        let dNum = (valDorsal && !isNaN(valDorsal)) ? parseInt(valDorsal) : '--';
        dorsalDisplay.innerHTML = `<i class="fa-solid fa-hashtag"></i> DORSAL: ${dNum}`;
    }

    let valBirth = bioPj["Fecha_Nacimiento"];
    let birthDisplay = document.getElementById('pjBirthDisplay');
    if(birthDisplay) {
        birthDisplay.innerHTML = `<i class="fa-solid fa-cake-candles"></i> NAC: ${valBirth ? escaparHTML(valBirth) : '--'}`;
    }

    let partidosConDataExtra = partidosPj.map(p => {
        let clon = { ...p }; 
        let dPartido = parseDate(clon["Fecha"]);
        
        let clubEnFecha = "";
        for (let i = 0; i < periodosPj.length; i++) {
            if (dPartido >= periodosPj[i].desde && dPartido <= periodosPj[i].hasta) {
                clubEnFecha = periodosPj[i].club;
                break;
            }
        }
        
        let condFinal = "NEUTRO";
        let partidoTexto = clon["Partido"] ? clon["Partido"].toUpperCase() : "";
        
        if (partidoTexto.includes(" VS ")) {
            let partes = partidoTexto.split(" VS ");
            let local = partes[0].trim();
            let visita = partes[1].trim();
            
            if (clubEnFecha !== "") {
                if (equiposEquivalentes(local, clubEnFecha)) condFinal = "LOCAL";
                else if (equiposEquivalentes(visita, clubEnFecha)) condFinal = "VISITA";
            }
        }
        
        if (condFinal === "NEUTRO" && clon["Condicion"]) {
            condFinal = clon["Condicion"].trim().toUpperCase();
            if (condFinal === "VISITANTE") condFinal = "VISITA";
        }
        
        clon["Condicion_Calculada"] = condFinal;
        return clon;
    });

    let partidosFiltrados = partidosConDataExtra.filter(p => {
        let t = p["Torneo"] || p["Competicion"] || p["Liga"] || p["Competition"] || "";
        if (torneoFiltro !== "ALL" && t.trim().toUpperCase() !== torneoFiltro) return false;

        if (condicionFiltro !== "ALL") {
            let c = p["Condicion_Calculada"];
            if (condicionFiltro === "Local" && c !== "LOCAL") return false;
            if (condicionFiltro === "Visitante" && c !== "VISITA") return false;
            if (condicionFiltro === "Neutro" && c !== "NEUTRO") return false;
        }
        return true;
    });
    
    partidosFiltrados.sort((a, b) => parseDate(b["Fecha"]) - parseDate(a["Fecha"]));
    if (limitePartidos !== "ALL") partidosFiltrados = partidosFiltrados.slice(0, parseInt(limitePartidos));

    let htmlFilas = "";
    let statsAcumuladas = { mins: 0, goles: 0, asis: 0, tiros: 0, tirosArco: 0, pases: 0, faltasC: 0, faltasR: 0, tackles: 0, atajadas: 0, tarjetasA: 0, tarjetasR: 0, offsides: 0 };
    
    let mercadoOddDom = document.getElementById('pjSelectMercado');
    let lineaOddDom = document.getElementById('pjSelectLinea');
    let mercadoOdd = mercadoOddDom ? mercadoOddDom.value : '';
    let lineaOdd = lineaOddDom ? parseFloat(lineaOddDom.value) : 0.5;
    let hitsOdds = 0;

    const v = (val) => val !== undefined && val !== null && !isNaN(val) ? val : '-';

    partidosFiltrados.forEach(p => {
        let min = parseInt(p["Minutos_Jugados"]) || 0;
        let gol = parseInt(p["Goles"]); let asi = parseInt(p["Asistencias"]);
        let tir = parseInt(p["Tiros_Totales"]); let tar = parseInt(p["Tiros_Al_Arco"]);
        let pas = parseInt(p["Pases_Totales"]); let fltC = parseInt(p["Faltas_Cometidas"]);
        let fltR = parseInt(p["Faltas_Recibidas"]); let tck = parseInt(p["Entradas(Tackles)"]);
        let atj = primerNumero(p, ['Atajadas(Portero)', 'Atajadas', 'Saves', 'Total Saves', 'Paradas'], 0); let trjA = parseInt(p["Tarjetas_Amarillas"]) || parseInt(p["Tarjetas"]); 
        let trjR = parseInt(p["Tarjetas_Rojas"]); let off = parseInt(p["Offsides"]);
        
        statsAcumuladas.mins += min; statsAcumuladas.goles += (gol || 0); statsAcumuladas.asis += (asi || 0);
        statsAcumuladas.tiros += (tir || 0); statsAcumuladas.tirosArco += (tar || 0); statsAcumuladas.pases += (pas || 0); 
        statsAcumuladas.faltasC += (fltC || 0); statsAcumuladas.faltasR += (fltR || 0); statsAcumuladas.tackles += (tck || 0);
        statsAcumuladas.atajadas += (atj || 0); statsAcumuladas.tarjetasA += (trjA || 0); statsAcumuladas.tarjetasR += (trjR || 0); statsAcumuladas.offsides += (off || 0);

        let partidoTexto = p["Partido"] ? p["Partido"].toUpperCase() : "-";
        let torneoTexto = p["Torneo"] || p["Competicion"] || p["Liga"] || p["Competition"] || "-";
        
        let txtCondicion = p["Condicion_Calculada"];
        let iconCondicionHTML = '';
        if (txtCondicion === 'LOCAL') iconCondicionHTML = `<td title="Local" style="text-align:center;"><i class="fa-solid fa-house cond-icon cond-local"></i></td>`;
        else if (txtCondicion === 'VISITA') iconCondicionHTML = `<td title="Visita" style="text-align:center;"><i class="fa-solid fa-plane cond-icon cond-visita"></i></td>`;
        else iconCondicionHTML = `<td title="Neutro" style="text-align:center;"><span class="cond-icon cond-neutro">N</span></td>`;

        let rowClass = "";
        if (modoVista === 'odds' && mercadoOdd !== 'TODO') {
            let valorMercado = 0;
            if (mercadoOdd === "Tarjetas_Generales") {
                let amarillas = parseFloat(p["Tarjetas_Amarillas"]) || parseFloat(p["Tarjetas"]) || 0;
                let rojas = parseFloat(p["Tarjetas_Rojas"]) || 0;
                valorMercado = amarillas + (rojas * 2); 
            } else if (mercadoOdd === 'Atajadas' || mercadoOdd === 'Atajadas(Portero)') {
                valorMercado = primerNumero(p, ['Atajadas(Portero)', 'Atajadas', 'Saves', 'Total Saves', 'Paradas'], 0);
            } else {
                valorMercado = parseFloat(p[mercadoOdd]) || 0;
            }

            if (valorMercado > lineaOdd) { rowClass = "row-hit"; hitsOdds++; } 
            else { rowClass = "row-miss"; }
        }

        htmlFilas += `
            <tr class="${rowClass}">
                <td style="text-align: left; font-weight:800;">${escaparHTML(p["Fecha"] || '-')}</td>
                <td class="pj-tournament-cell" style="text-align:left;">
                    <span class="pj-tournament-full" title="${escaparAtributo(torneoTexto.toUpperCase())}">
                        ${escaparHTML(torneoTexto.toUpperCase())}
                    </span>
                </td>
                <td class="pj-match-cell" style="text-align:left;">
                    ${formatearPartidoJugador(partidoTexto)}
                </td>
                ${iconCondicionHTML}
                <td style="font-weight:900; color:var(--text-muted);">${v(min)}'</td>
                <td class="col-goles" style="font-weight:900; color:var(--brand-accent);">${v(gol)}</td>
                <td class="col-asistencias" style="font-weight:900; color:var(--brand-accent);">${v(asi)}</td>
                <td class="col-tiros" style="font-weight:900;">${v(tir)}</td>
                <td class="col-tiros-arco" style="font-weight:900; color:var(--brand-accent);">${v(tar)}</td>
                <td class="col-pases" style="font-weight:900;">${v(pas)}</td>
                <td class="col-tackles" style="font-weight:900; color:var(--gold-accent);">${v(tck)}</td>
                <td class="col-faltas-c" style="font-weight:900; color:var(--bar-red);">${v(fltC)}</td>
                <td class="col-faltas-r" style="font-weight:900; color:var(--bar-yellow);">${v(fltR)}</td>
                <td class="col-atajadas" style="font-weight:900; color:var(--brand-accent);">${v(atj)}</td>
                <td class="col-amarillas" style="font-weight:900; color:var(--bar-yellow);">${v(trjA)}</td>
                <td class="col-rojas" style="font-weight:900; color:var(--bar-red);">${v(trjR)}</td>
                <td class="col-offsides" style="font-weight:900; color:var(--text-muted);">${v(off)}</td>
            </tr>
        `;
    });

    let tbody = document.getElementById('pjTablaHistorial');
    if(tbody) {
        if (partidosFiltrados.length === 0) tbody.innerHTML = `<tr><td colspan="17" style="text-align:center; padding: 30px; color: var(--text-muted); font-weight:800;">SIN REGISTROS EN ESTA CONDICIÓN</td></tr>`;
        else tbody.innerHTML = htmlFilas;
    }
    
    let isArquero = clasificarPosicion(posDeclarada) === 'ARQUERO';
    configurarColumnasHistorialPj(modoVista, mercadoOdd, isArquero);

    let countDisplay = document.getElementById('pjPartidosCount');
    if(countDisplay) countDisplay.innerText = `${partidosFiltrados.length} PARTIDOS`;

    if (modoVista === 'odds') {
        let pct = partidosFiltrados.length > 0 ? ((hitsOdds / partidosFiltrados.length) * 100).toFixed(0) : 0;
        let lblHit = document.getElementById('pjLblHit');
        let barHit = document.getElementById('pjBarHit');
        let fraction = document.getElementById('pjOddsFraction');
        let containerHit = document.getElementById('oddsHitRateContainer');
        
        if(lblHit) lblHit.innerText = `${pct}%`;
        if(barHit) barHit.style.width = `${pct}%`;
        if(fraction) fraction.innerText = `${hitsOdds} DE ${partidosFiltrados.length} ACIERTOS`;

        if (containerHit) {
            if (pct >= 50) {
                containerHit.style.backgroundColor = 'rgba(16, 185, 129, 0.12)'; 
                containerHit.style.borderColor = 'rgba(16, 185, 129, 0.5)'; 
                lblHit.style.color = 'var(--bar-green)';
            } else {
                containerHit.style.backgroundColor = 'rgba(239, 68, 68, 0.12)'; 
                containerHit.style.borderColor = 'rgba(239, 68, 68, 0.5)'; 
                lblHit.style.color = 'var(--bar-red)';
            }
        }
    }

    let gridCards = document.getElementById('pjStatsGrid');
    if(!gridCards) return;
    let tP = partidosFiltrados.length;
    
    if(tP > 0 && modoVista === 'resumen') {
        let htmlCards = "";
        let pm = (val) => (val/tP).toFixed(2);
        
        const tarjetaActivaResumen = false;

        if(isArquero) {
            htmlCards += crearTarjetaPj("MINUTOS", (statsAcumuladas.mins/tP).toFixed(0), "MINUTOS", "var(--brand-accent)", false);
            htmlCards += crearTarjetaPj("PASES", pm(statsAcumuladas.pases), "PASES", "var(--brand-accent)", tarjetaActivaResumen);
            htmlCards += crearTarjetaPj("ATAJADAS", pm(statsAcumuladas.atajadas), "ATAJADA", "var(--brand-accent)", tarjetaActivaResumen);
            htmlCards += crearTarjetaPj("AMARILLAS", pm(statsAcumuladas.tarjetasA), "AMARILLA", "var(--bar-yellow)", tarjetaActivaResumen);
            htmlCards += crearTarjetaPj("ROJAS", pm(statsAcumuladas.tarjetasR), "ROJA", "var(--bar-red)", false);
        } else {
            htmlCards += crearTarjetaPj("MINUTOS", (statsAcumuladas.mins/tP).toFixed(0), "MINUTOS", "var(--brand-accent)", false);
            htmlCards += crearTarjetaPj("GOLES", pm(statsAcumuladas.goles), "GOL", "var(--brand-accent)", tarjetaActivaResumen);
            htmlCards += crearTarjetaPj("ASISTENCIAS", pm(statsAcumuladas.asis), "ASISTENCIA", "var(--brand-accent)", tarjetaActivaResumen);
            htmlCards += crearTarjetaPj("TIROS", pm(statsAcumuladas.tiros), "TIRO", "var(--brand-accent)", tarjetaActivaResumen);
            htmlCards += crearTarjetaPj("A PUERTA", pm(statsAcumuladas.tirosArco), "TIRO A PUERTA", "var(--brand-accent)", tarjetaActivaResumen);
            htmlCards += crearTarjetaPj("PASES", pm(statsAcumuladas.pases), "PASES", "var(--brand-accent)", tarjetaActivaResumen);
            htmlCards += crearTarjetaPj("TACKLES", pm(statsAcumuladas.tackles), "TACKLE", "var(--gold-accent)", tarjetaActivaResumen);
            htmlCards += crearTarjetaPj("FALTAS COM.", pm(statsAcumuladas.faltasC), "FALTA COMETIDA", "var(--bar-red)", tarjetaActivaResumen);
            htmlCards += crearTarjetaPj("FALTAS REC.", pm(statsAcumuladas.faltasR), "FALTA RECIBIDA", "var(--bar-yellow)", tarjetaActivaResumen);
            htmlCards += crearTarjetaPj("AMARILLAS", pm(statsAcumuladas.tarjetasA), "AMARILLA", "var(--bar-yellow)", tarjetaActivaResumen);
            htmlCards += crearTarjetaPj("ROJAS", pm(statsAcumuladas.tarjetasR), "ROJA", "var(--bar-red)", false);
            htmlCards += crearTarjetaPj("OFFSIDES", pm(statsAcumuladas.offsides), "OFFSIDE", "#ffffff", tarjetaActivaResumen);
        }
        gridCards.innerHTML = htmlCards;

    } else if(modoVista === 'resumen') {
        gridCards.innerHTML = "";
    }
}

// ==========================================================================
// 5. MÓDULO 4: LEADERBOARDS VIP (MOTOR DE RANKINGS)
// ==========================================================================

const OPCIONES_LIMITE_RANKING = Object.freeze([3, 5, 10, 25, 50]);
const COLUMNAS_ATAJADAS = Object.freeze(['Atajadas(Portero)', 'Atajadas', 'Saves', 'Total Saves', 'Paradas']);

function esMetricaAtajadas(metrica) {
    const clave = claveTexto(metrica).replace(/[^A-Z]/g, '');
    return ['ATAJADAS', 'ATAJADASPORTERO', 'SAVES', 'TOTALSAVES', 'PARADAS'].includes(clave);
}

function obtenerConfigMetricaRanking(metrica) {
    const configuraciones = {
        Goles: { label: 'GOLES', icon: 'fa-futbol', color: '#10b981', columnas: ['Goles', 'Goals'] },
        Asistencias: { label: 'ASISTENCIAS', icon: 'fa-handshake-angle', color: '#14b8a6', columnas: ['Asistencias', 'Assists'] },
        Tiros_Totales: { label: 'TIROS TOTALES', icon: 'fa-crosshairs', color: '#3b82f6', columnas: ['Tiros_Totales', 'Tiros Totales', 'Total Shots', 'Shots'] },
        Tiros_Al_Arco: { label: 'TIROS A PUERTA', icon: 'fa-bullseye', color: '#2563eb', columnas: ['Tiros_Al_Arco', 'Tiros a Puerta', 'Shots on Target', 'Shots on target'] },
        Pases_Totales: { label: 'PASES COMPLETADOS', icon: 'fa-arrows-left-right-to-line', color: '#8b5cf6', columnas: ['Pases_Totales', 'Pases Totales', 'Total Passes', 'Passes'] },
        'Entradas(Tackles)': { label: 'ENTRADAS / TACKLES', icon: 'fa-shield-halved', color: '#f59e0b', columnas: ['Entradas(Tackles)', 'Entradas', 'Tackles', 'Total Tackles'] },
        Faltas_Cometidas: { label: 'FALTAS COMETIDAS', icon: 'fa-gavel', color: '#ef4444', columnas: ['Faltas_Cometidas', 'Faltas Cometidas', 'Fouls Committed'] },
        Faltas_Recibidas: { label: 'FALTAS RECIBIDAS', icon: 'fa-person-falling', color: '#f97316', columnas: ['Faltas_Recibidas', 'Faltas Recibidas', 'Fouls Drawn'] },
        Tarjetas_Generales: { label: 'TARJETAS GENERALES', icon: 'fa-clone', color: '#dc2626', columnas: [] },
        Atajadas: { label: 'ATAJADAS', icon: 'fa-hands', color: '#0ea5e9', columnas: COLUMNAS_ATAJADAS },
        Minutos_Jugados: { label: 'MINUTOS JUGADOS', icon: 'fa-clock', color: '#64748b', columnas: ['Minutos_Jugados', 'Minutos Jugados', 'Minutes'] }
    };
    return configuraciones[metrica] || {
        label: normalizarTexto(metrica).replace(/_/g, ' ').toUpperCase(),
        icon: 'fa-chart-column',
        color: '#d97706',
        columnas: [metrica, String(metrica || '').replace(/_/g, ' ')]
    };
}

function asegurarOpcionesLimiteRankings() {
    const selectLimite = document.getElementById('rankingsSelectLimite');
    const selectPosicion = document.getElementById('rankingsSelectPosicion');
    if (!selectLimite || !selectPosicion) return;

    const posicionSeleccionada = selectPosicion.value;
    let opcionesPermitidas = [10, 25, 50, 100];
    let valorDefecto = 25;

    if (posicionSeleccionada !== 'ALL') {
        opcionesPermitidas = [5, 10, 25, 50];
        valorDefecto = 10;
    }

    const valorActual = Number(selectLimite.value || selectLimite.dataset.valorReal);
    const valorSeguro = opcionesPermitidas.includes(valorActual) ? valorActual : valorDefecto;
    const actuales = Array.from(selectLimite.options).map(opcion => Number(opcion.value));
    const sonFijas = actuales.length === opcionesPermitidas.length && actuales.every((valor, indice) => valor === opcionesPermitidas[indice]);

    if (!sonFijas) {
        rellenarSelectSeguro(selectLimite, opcionesPermitidas.map(valor => ({ value: valor, label: `TOP ${valor}` })), valorSeguro);
        selectLimite.value = String(valorSeguro);
        selectLimite.dataset.valorReal = String(valorSeguro);
        refrescarSelectCustom('rankingsSelectLimite');
    }
}

function sincronizarMetricasPorPosicionRanking() {
    const selectPosicion = document.getElementById('rankingsSelectPosicion');
    const selectMetrica = document.getElementById('rankingsSelectMetrica');
    if (!selectPosicion || !selectMetrica) return;

    const esAtajadas = esMetricaAtajadas(selectMetrica.value);
    let cambio = false;

    Array.from(selectPosicion.options).forEach(opt => {
        if (opt.value === 'ARQUERO') {
            opt.disabled = !esAtajadas;
            opt.hidden = !esAtajadas;
        }
    });

    if (esAtajadas) {
        if (selectPosicion.value !== 'ARQUERO') { selectPosicion.value = 'ARQUERO'; cambio = true; }
        selectPosicion.disabled = true; 
    } else {
        if (selectPosicion.value === 'ARQUERO') { selectPosicion.value = 'ALL'; cambio = true; }
        selectPosicion.disabled = false;
    }

    if (cambio || !selectPosicion.parentElement?.querySelector('.custom-display')) {
        refrescarSelectCustom('rankingsSelectPosicion');
    }
}

function actualizarHeroRankings(metrica, modo) {
    const config = obtenerConfigMetricaRanking(metrica);
    const esPromedio = modo === 'promedio';
    const titulo = document.getElementById('rankingsHeroTitle');
    const descripcion = document.getElementById('rankingsHeroDescription');
    const modoEtiqueta = document.getElementById('rankingsHeroMode');
    const icono = document.getElementById('rankingsHeroIcon');

    if (titulo) titulo.textContent = `${config.label} · ${esPromedio ? 'PROMEDIO POR PARTIDO' : 'ACUMULADO TOTAL'}`;
    if (descripcion) {
        descripcion.textContent = esPromedio
            ? `Jugadores ordenados por su producción media de ${config.label.toLowerCase()} en cada partido disputado.`
            : `Jugadores ordenados por su producción acumulada de ${config.label.toLowerCase()} durante la temporada.`;
    }
    if (modoEtiqueta) modoEtiqueta.textContent = esPromedio ? 'PROMEDIO POR PARTIDO' : 'ACUMULADO TOTAL';
    const helpTitle = document.getElementById('rankingsModeHelpTitle');
    const helpText = document.getElementById('rankingsModeHelpText');
    if (helpTitle) helpTitle.textContent = esPromedio ? 'PROMEDIO POR PARTIDO' : 'ACUMULADO TOTAL';
    if (helpText) helpText.textContent = esPromedio
        ? 'Divide la producción total entre los partidos disputados para comparar ritmo y regularidad.'
        : 'Suma toda la producción del jugador en la temporada seleccionada; premia volumen y continuidad.';
    if (icono) icono.className = `fa-solid ${config.icon}`;
}

function configurarBuscadorRankingsVIP() {
    const input = document.getElementById('rankingsSearchInput');
    const resultados = document.getElementById('resultadosBusquedaRanking');
    if (!input || !resultados || !input.parentElement) return;
    const cajaBusqueda = input.parentElement;

    const renderizarLista = (filtroTexto = '') => {
        resultados.replaceChildren();
        const filtro = claveTexto(filtroTexto);
        if (!filtro) return;

        const jugadoresMap = new Map();
        estadoApp.rankings.matrizCrudaCSV.forEach(row => {
            const nombre = normalizarTexto(row?.Jugador);
            const equipo = normalizarTexto(row?.Equipo);
            const metaGlobal = obtenerMetaGlobalJugador(nombre, equipo);
            const id = obtenerIdJugadorFila(row) || metaGlobal.id;
            const fotoUrl = normalizarTexto(obtenerValor(row, ['Foto_URL', 'Foto', 'Imagen_URL'], metaGlobal.fotoUrl));
            const equipoFinal = equipo || metaGlobal.equipo;
            const buscable = claveTexto(`${nombre} ${equipoFinal}`);
            
            if (buscable.includes(filtro) && !jugadoresMap.has(`${claveTexto(nombre)}|${claveTexto(equipoFinal)}`)) {
                jugadoresMap.set(`${claveTexto(nombre)}|${claveTexto(equipoFinal)}`, { nombre, equipo: equipoFinal, id, fotoUrl });
            }
        });

        let claves = Array.from(jugadoresMap.values());
        const total = claves.length;
        claves = claves.slice(0, 30);

        if (!claves.length) {
            const vacio = document.createElement('div');
            vacio.className = 'pro-search-item';
            vacio.style.color = 'var(--bar-red)';
            vacio.textContent = 'SIN RESULTADOS';
            resultados.appendChild(vacio);
            return;
        }

        const fragment = document.createDocumentFragment();
        claves.forEach(jug => {
            const item = document.createElement('div');
            item.className = 'pro-search-item';
            item.setAttribute('role', 'option');
            item.innerHTML = `<i class="fa-solid fa-user-astronaut"></i> <span>${jug.nombre} · ${jug.equipo}</span>`;

            item.addEventListener('mousedown', event => {
                event.preventDefault();
                input.value = '';
                cajaBusqueda.classList.remove('focused');
                resultados.replaceChildren();
                abrirModalJugador(jug.nombre, jug.equipo, jug.fotoUrl, jug.id);
            });
            fragment.appendChild(item);
        });

        if (total > claves.length) {
            const nota = document.createElement('div');
            nota.className = 'pro-search-item';
            nota.style.color = 'var(--text-muted)';
            nota.textContent = `ESCRIBE MÁS PARA FILTRAR (${total} COINCIDENCIAS)`;
            fragment.appendChild(nota);
        }
        resultados.appendChild(fragment);
    };

    input._renderSearch = renderizarLista;
    if (input.dataset.buscadorConfigurado === 'true') return;
    input.dataset.buscadorConfigurado = 'true';

    input.addEventListener('focus', () => { if (input.value.trim()) { cajaBusqueda.classList.add('focused'); input._renderSearch?.(input.value); } });
    input.addEventListener('input', debounce(event => { const val = event.target.value.trim(); if (val) { cajaBusqueda.classList.add('focused'); input._renderSearch?.(val); } else { cajaBusqueda.classList.remove('focused'); resultados.replaceChildren(); } }, 180));
    input.addEventListener('blur', () => cajaBusqueda.classList.remove('focused'));
    input.addEventListener('keydown', event => { if (event.key === 'Escape') { cajaBusqueda.classList.remove('focused'); input.blur(); } });
}


const LEADERBOARD_CACHE = Object.freeze({
    version: 9,
    ttl: 1000 * 60 * 60 * 24 * 7
});

function claveCacheLeaderboard(liga, temporada) {
    return `leaderboard:${LEADERBOARD_CACHE.version}:${liga}:${temporada}`;
}

function mostrarCargaLeaderboardRapida(texto = 'PREPARANDO LEADERBOARD...') {
    const tbody = document.getElementById('tablaBodyRankings');
    const overlay = document.getElementById('rankingsProLoader');
    const titulo = document.getElementById('rankingsProLoaderTitle');
    const detalle = document.getElementById('rankingsProLoaderText');
    const logo = document.getElementById('rankingsProLoaderLogo');
    const liga = document.getElementById('rankingsSelectLiga')?.value || 'TITAN_C17';
    const temporada = document.getElementById('rankingsSelectTemporada')?.value || 'CURRENT';
    const info = rankingInfo(liga);
    const logoUrl = rankingCompetitionLogo(liga);

    if (titulo) titulo.textContent = `Cargando ${info.label}`;
    if (detalle) detalle.textContent = `${texto.replace(/\.+$/,'')} · ${etiquetaTemporadaRanking(temporada, liga)}`;
    if (logo) {
        logo.style.display = logoUrl ? '' : 'none';
        if (logoUrl) logo.src = logoUrl;
    }
    if (overlay) {
        clearTimeout(window.__incaRankingLoaderFailsafe);
        overlay.hidden = false;
        overlay.classList.add('is-visible');
        overlay.setAttribute('aria-busy', 'true');

        // Failsafe: el loader jamás puede dejar Leaderboards "muerto".
        window.__incaRankingLoaderFailsafe = setTimeout(() => {
            ocultarCargaLeaderboardRapida();
        }, 12000);
    }

    if (tbody) {
        tbody.innerHTML = `
            <tr class="rk-status-row">
                <td colspan="6">
                    <div class="rk-status-message rk-status-message--fast">
                        <span class="status-dot loading"></span>
                        <strong>${escaparHTML(texto)}</strong>
                        <small>Preparando datos de la competición</small>
                    </div>
                </td>
            </tr>
        `;
    }
}

function ocultarCargaLeaderboardRapida() {
    const overlay = document.getElementById('rankingsProLoader');
    clearTimeout(window.__incaRankingLoaderFailsafe);
    if (!overlay) return;
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-busy', 'false');
    setTimeout(() => {
        if (!overlay.classList.contains('is-visible')) overlay.hidden = true;
    }, 160);
}

function cederPintadoLeaderboard() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function guardarSnapshotLeaderboard(liga, temporada) {
    if (!window.INCA_DB || !estadoApp.rankings?.filasPreparadas?.length) return;

    const snapshot = {
        version: LEADERBOARD_CACHE.version,
        timestamp: Date.now(),
        liga,
        temporada,
        filasPreparadas: estadoApp.rankings.filasPreparadas
    };

    try {
        await window.INCA_DB.set(
            'datasets',
            claveCacheLeaderboard(liga, temporada),
            snapshot
        );
    } catch (error) {
        console.warn('[LEADERBOARD CACHE] No se pudo guardar.', error);
    }
}

async function restaurarSnapshotLeaderboard(liga, temporada) {
    if (!window.INCA_DB) return false;

    try {
        const snapshot = await window.INCA_DB.get(
            'datasets',
            claveCacheLeaderboard(liga, temporada)
        );

        if (
            !snapshot ||
            snapshot.version !== LEADERBOARD_CACHE.version ||
            snapshot.liga !== liga ||
            snapshot.temporada !== temporada ||
            Date.now() - snapshot.timestamp > LEADERBOARD_CACHE.ttl ||
            !Array.isArray(snapshot.filasPreparadas) ||
            !snapshot.filasPreparadas.length
        ) {
            return false;
        }

        estadoApp.rankings.matrizCrudaCSV = [];
        estadoApp.rankings.filasPreparadas = snapshot.filasPreparadas;
        estadoApp.rankings.ultimoCalculo = null;
        estadoApp.rankings.ligaActual = liga;
        estadoApp.rankings.temporadaActual = temporada;

        await guardarSnapshotLeaderboard(liga, temporada);

        const equipos = new Set();
        snapshot.filasPreparadas.forEach(fila => {
            const equipo = normalizarTexto(fila?.equipo);
            if (equipo) equipos.add(equipo);
        });

        const opciones = [{ value: 'ALL', label: 'TODOS LOS EQUIPOS' }];
        Array.from(equipos)
            .sort((a, b) => a.localeCompare(b, 'es'))
            .forEach(equipo => opciones.push({ value: equipo, label: equipo }));

        rellenarSelectSeguro(
            document.getElementById('rankingsSelectEquipo'),
            opciones,
            'ALL'
        );
        refrescarSelectCustom('rankingsSelectEquipo');

        console.info(
            `[LEADERBOARD CACHE] ${snapshot.filasPreparadas.length} filas restauradas desde IndexedDB`
        );

        return true;
    } catch (error) {
        console.warn('[LEADERBOARD CACHE] No se pudo restaurar.', error);
        return false;
    }
}

const RANKING_LIGAS_HISTORICAS = Object.freeze({
    Premier:      { label:'Premier League', competitionId:17, tipo:'europea' },
    Championship: { label:'Championship', competitionId:18, tipo:'europea' },
    LaLiga:       { label:'LaLiga EA Sports', competitionId:8, tipo:'europea' },
    SerieA:       { label:'Serie A', competitionId:23, tipo:'europea' },
    Bundesliga:   { label:'Bundesliga', competitionId:35, tipo:'europea' },
    Ligue1:       { label:'Ligue 1', competitionId:34, tipo:'europea' },
    LigaPortugal: { label:'Liga Portugal', competitionId:238, tipo:'europea' },
    Eredivisie:   { label:'Eredivisie', competitionId:37, tipo:'europea' },
    Brasileirao:  { label:'Brasileirão Série A', competitionId:325, tipo:'anual' },
    Argentina:    { label:'Liga Profesional Argentina', competitionId:155, tipo:'anual' },
    MLS:          { label:'MLS', competitionId:242, tipo:'anual' }
});

const RANKING_HISTORICO_POR_COMPETICION = Object.freeze(
    Object.fromEntries(Object.entries(RANKING_LIGAS_HISTORICAS).map(([key,val])=>[Number(val.competitionId),key]))
);

function rankingSeasonSortValue(valor) {
    const texto = String(valor || '');
    if (/^\d{4}$/.test(texto)) return Number(texto);
    const m = /^(\d{2})_(\d{2})$/.exec(texto);
    if (m) return 2000 + Number(m[1]);
    return 0;
}

function rankingCompetitionId(liga) {
    const titan=Number(window.INCA_TITAN?.competitionId?.(liga)||0);
    if(titan)return titan;
    return Number(RANKING_LIGAS_HISTORICAS?.[liga]?.competitionId||0);
}
function rankingLegacyKey(liga) {
    return RANKING_HISTORICO_POR_COMPETICION[rankingCompetitionId(liga)] || null;
}
function rankingInfo(liga) {
    const id=rankingCompetitionId(liga);
    const curated=(window.INCA_TITAN?.CURATED_COMPETITIONS||[]).find(c=>Number(c.id)===id);
    const legacy=RANKING_LIGAS_HISTORICAS?.[liga] || RANKING_LIGAS_HISTORICAS?.[rankingLegacyKey(liga)] || {};
    return {
        competitionId:id,
        label:curated?.name || legacy.label || String(liga||'Liga'),
        region:curated?.region || '',
        country:curated?.country || '',
        tipo:window.INCA_TITAN?.isCalendarCompetition?.(id)?'anual':(legacy.tipo||'europea')
    };
}
function temporadasDisponiblesRanking(liga) {
    const legacy=rankingLegacyKey(liga);
    const hist=legacy
        ? Object.keys(CONFIG_ENLACES_JUGADORES?.[legacy] || {}).sort((a,b)=>rankingSeasonSortValue(b)-rankingSeasonSortValue(a))
        : [];
    return ['CURRENT',...hist];
}
function etiquetaTemporadaRanking(valor, liga='') {
    if(String(valor)==='CURRENT'){
        const info=rankingInfo(liga);
        const playerLabel=window.INCA_PLAYERS?.currentSeasonLabelForLeague?.(info.competitionId);
        const season=window.INCA_TITAN?.currentSeasonForCompetition?.(info.competitionId);
        return `${String(playerLabel || season?.label || (info.tipo==='anual'?'2026':'2026 / 2027'))} · ACTUAL`;
    }
    const info=rankingInfo(liga);
    if(info.tipo==='anual'||/^\d{4}$/.test(String(valor||'')))return String(valor||'');
    return ETIQUETAS_TEMPORADAS.europeo?.[valor] || String(valor||'').replace('_',' / ');
}
function rankingCompetitionLogo(liga) {
    const id=rankingCompetitionId(liga);
    if(!id)return '';
    const candidates=window.INCA_TITAN?.competitionLogoCandidates?.(id)||[];
    return candidates[0] || `./fast-assets/competition-logos/${id}.webp`;
}
async function asegurarCatalogoRanking31(preferredCompetitionId=0) {
    const select=document.getElementById('rankingsSelectLiga');
    if(!select || !window.INCA_TITAN?.enabled)return;
    await window.INCA_TITAN.ensureReady();
    const comps=[...(window.INCA_TITAN.CURATED_COMPETITIONS||[])];
    const currentId=Number(preferredCompetitionId)||rankingCompetitionId(select.value)||17;
    select.innerHTML=comps.map(comp =>
        `<option value="TITAN_C${Number(comp.id)}" data-competition-id="${Number(comp.id)}">${escaparHTML(comp.name)}</option>`
    ).join('');
    const wanted=`TITAN_C${currentId}`;
    select.value=[...select.options].some(o=>o.value===wanted)?wanted:(select.options[0]?.value||'');
    select.dataset.titanCatalog='31';
    refrescarSelectCustom('rankingsSelectLiga');
}
function actualizarContextoVisualRanking() {
    const liga=document.getElementById('rankingsSelectLiga')?.value || 'TITAN_C17';
    const temporada=document.getElementById('rankingsSelectTemporada')?.value || 'CURRENT';
    const info=rankingInfo(liga);
    const contexto=document.getElementById('rankingsLeagueContext');
    if(contexto)contexto.textContent=`${info.label} · ${etiquetaTemporadaRanking(temporada,liga)}`;
    const url=rankingCompetitionLogo(liga);
    for(const id of ['rankingsLeagueLogo','rankingsLeagueSelectLogo']){
        const logo=document.getElementById(id); if(!logo)continue;
        if(url){
            logo.style.display='';logo.src=url;
            logo.onload=()=>{logo.style.display='';logo.closest('.rk-native-league-logo')?.classList.add('has-logo');};
            logo.onerror=()=>{logo.onerror=null;logo.removeAttribute('src');logo.style.display='none';logo.closest('.rk-native-league-logo')?.classList.remove('has-logo');};
        } else { logo.removeAttribute('src');logo.style.display='none'; }
    }
}
async function cargarLeaderboardDesdeSelectorVIP() {
    const liga=document.getElementById('rankingsSelectLiga')?.value || 'TITAN_C17';
    const temporada=document.getElementById('rankingsSelectTemporada')?.value || 'CURRENT';
    const legacy=rankingLegacyKey(liga);
    const disponible=temporada==='CURRENT' || Boolean(legacy && CONFIG_ENLACES_JUGADORES?.[legacy]?.[temporada]);
    if(!disponible){
        const tbody=document.getElementById('tablaBodyRankings');
        if(tbody)tbody.innerHTML=`<tr class="rk-status-row"><td colspan="6"><div class="rk-empty-state"><strong>HISTÓRICO NO DISPONIBLE</strong><span>Esta liga dispone de Leaderboard VIP para la campaña actual.</span></div></td></tr>`;
        ocultarCargaLeaderboardRapida();return;
    }
    actualizarContextoVisualRanking(); estadoApp.rankings.ultimoCalculo=null;
    mostrarCargaLeaderboardRapida(temporada==='CURRENT'?'CARGANDO TEMPORADA ACTUAL...':'CARGANDO TEMPORADA...');
    await cederPintadoLeaderboard();
    const yaCargado=estadoApp.rankings.ligaActual===liga && estadoApp.rankings.temporadaActual===temporada && Array.isArray(estadoApp.rankings.filasPreparadas) && estadoApp.rankings.filasPreparadas.length>0;
    if(yaCargado){actualizarRankingsDOM();return;}
    const restaurado=await restaurarSnapshotLeaderboard(liga,temporada);
    if(restaurado)actualizarRankingsDOM(); else await cargarBaseDatosRankingsEspecial(liga,temporada);
}
function sincronizarLogoLigaLeaderboard() {
    const select=document.getElementById('rankingsSelectLiga'),logo=document.getElementById('rankingsSelectLeagueLogo');
    if(!select||!logo)return;
    if(select.dataset.leagueLogoEnhanced==='1'){logo.classList.remove('has-image');logo.removeAttribute('src');logo.style.display='none';return;}
    const id=rankingCompetitionId(select.value);logo.classList.remove('has-image');logo.removeAttribute('src');if(!id)return;
    logo.onload=()=>logo.classList.add('has-image');logo.onerror=()=>{logo.classList.remove('has-image');logo.removeAttribute('src');};
    logo.src=`./TITAN_LOGOS_COMP/logos_png/${id}.png`;
}
function asegurarControlesLeaderboardInteractivos() {
    const view=document.getElementById('vista-rankings');if(!view)return;
    view.querySelectorAll('.custom-display, .custom-list, .rk38-league-menu, .rk38-league-button').forEach(node=>node.remove());
    view.querySelectorAll('select').forEach(select=>{
        select.disabled=false;
        if(select.id==='rankingsSelectLiga'&&select.dataset.leagueLogoEnhanced==='1'){
            select.classList.add('league-logo-select__native');['pointer-events','visibility','opacity','display','width'].forEach(prop=>select.style.removeProperty(prop));return;
        }
        select.classList.remove('hidden-native-select','rk38-league-native');select.style.pointerEvents='auto';select.style.visibility='visible';select.style.opacity='1';
    });
    sincronizarLogoLigaLeaderboard();
}
async function cambiarLigaRankingVIP() {
    asegurarControlesLeaderboardInteractivos();
    const liga=document.getElementById('rankingsSelectLiga')?.value || 'TITAN_C17';
    const selectTemp=document.getElementById('rankingsSelectTemporada');
    const disponibles=temporadasDisponiblesRanking(liga);
    if(selectTemp){
        const actual=disponibles.includes(selectTemp.value)?selectTemp.value:'CURRENT';
        rellenarSelectSeguro(selectTemp,disponibles.map(v=>({value:v,label:etiquetaTemporadaRanking(v,liga)})),actual);
        selectTemp.value=actual;refrescarSelectCustom('rankingsSelectTemporada');
    }
    await cargarLeaderboardDesdeSelectorVIP();
}
async function cambiarTemporadaRankingVIP(){asegurarControlesLeaderboardInteractivos();await cargarLeaderboardDesdeSelectorVIP();}

async function abrirVistaRankings() {
    estadoApp.vistaActiva='rankings';document.body.classList.remove('player-picks-mode');document.body.classList.add('pro-mode','leaderboards-mode');
    if(document.getElementById('topBarScanner'))document.getElementById('topBarScanner').style.display='none';
    if(document.getElementById('topBarPro'))document.getElementById('topBarPro').style.display='none';
    if(document.getElementById('topBarJugadores'))document.getElementById('topBarJugadores').style.display='none';
    document.getElementById('vista-escaner').style.display='none';document.getElementById('vista-database').style.display='none';document.getElementById('vista-jugadores').style.display='none';document.getElementById('vista-rankings').style.display='flex';

    const selectedComp=Number(window.INCA_TITAN?.competitionId?.(document.getElementById('selectLigaPro')?.value)||17);
    await asegurarCatalogoRanking31(selectedComp);
    const selectLiga=document.getElementById('rankingsSelectLiga'),selectTemp=document.getElementById('rankingsSelectTemporada');
    const liga=selectLiga?.value || `TITAN_C${selectedComp}`;
    const temporadas=temporadasDisponiblesRanking(liga);
    if(selectTemp){rellenarSelectSeguro(selectTemp,temporadas.map(v=>({value:v,label:etiquetaTemporadaRanking(v,liga)})),'CURRENT');selectTemp.value='CURRENT';}
    asegurarOpcionesLimiteRankings();
    ['rankingsSelectLiga','rankingsSelectTemporada','rankingsSelectMetrica','rankingsSelectModo','rankingsSelectEquipo','rankingsSelectPosicion','rankingsSelectLimite','rankingsSelectCondicion'].forEach(refrescarSelectCustom);
    asegurarControlesLeaderboardInteractivos();actualizarContextoVisualRanking();
    mostrarCargaLeaderboardRapida('CARGANDO TEMPORADA ACTUAL...');await cederPintadoLeaderboard();
    const yaCargado=estadoApp.rankings.ligaActual===liga && estadoApp.rankings.temporadaActual==='CURRENT' && Array.isArray(estadoApp.rankings.filasPreparadas) && estadoApp.rankings.filasPreparadas.length>0;
    if(yaCargado)actualizarRankingsDOM();
    else { const restored=await restaurarSnapshotLeaderboard(liga,'CURRENT'); if(restored)actualizarRankingsDOM(); else await cargarBaseDatosRankingsEspecial(liga,'CURRENT'); }

    const enriquecerDespues=async()=>{await Promise.allSettled([cargarMapaCaras(),cargarIndiceIdsGlobal(),cargarBaseDatosJugadores()]);estadoApp.rankings.ultimoCalculo=null;if(estadoApp.vistaActiva==='rankings')actualizarRankingsDOM();};
    if('requestIdleCallback'in window)requestIdleCallback(()=>enriquecerDespues(),{timeout:4500});else setTimeout(enriquecerDespues,500);
}

async function cargarBaseDatosRankingsEspecial(liga, temporada) {
    const tbody=document.getElementById('tablaBodyRankings');if(!tbody){console.error("No se encontró 'tablaBodyRankings'.");return;}
    mostrarCargaLeaderboardRapida(temporada==='CURRENT'?'PROCESANDO TEMPORADA ACTUAL...':'PROCESANDO RANKING...');
    const solicitudId=++estadoApp.solicitudes.rankings;
    try{
        let data=[];
        if(temporada==='CURRENT'){
            // V1.016: la campaña vigente sale EXCLUSIVAMENTE del master que actualiza DELTA/SYNC/BAT.
            // No se reutiliza player-props histórico para construir el leaderboard actual.
            await Promise.all([
                window.INCA_PLAYERS?.ensureCurrentReady?.(),
                window.INCA_TITAN?.ensureReady?.()
            ]);
            // Si GitHub tiene un BAT más reciente que el snapshot local, intentamos refrescarlo
            // sin dejar la pantalla bloqueada cuando no hay red.
            try { await window.INCA_PLAYERS?.refreshCurrentReady?.({timeoutMs:4500}); } catch (_) {}
            const compId=rankingCompetitionId(liga);
            const seasonId=Number(window.INCA_PLAYERS?.currentSeasonIdForLeague?.(compId)) || Number(window.INCA_TITAN?.currentSeasonForCompetition?.(compId)?.season_id) || 0;
            data=window.INCA_PLAYERS?.currentRowsForLeague?.(compId,seasonId)||[];
            if(!data.length && seasonId){
                // Un manifest TITAN local puede ir una temporada por detrás. En ese caso usamos
                // todas las filas CURRENT de esa competición, que siguen siendo solo campaña actual.
                data=window.INCA_PLAYERS?.currentRowsForLeague?.(compId)||[];
            }
            if(!data.length){
                estadoApp.rankings.matrizCrudaCSV=[];estadoApp.rankings.filasPreparadas=[];estadoApp.rankings.ultimoCalculo=null;estadoApp.rankings.ligaActual=liga;estadoApp.rankings.temporadaActual=temporada;
                rellenarSelectSeguro(document.getElementById('rankingsSelectEquipo'),[{value:'ALL',label:'TODOS LOS EQUIPOS'}],'ALL');refrescarSelectCustom('rankingsSelectEquipo');
                tbody.innerHTML=`<tr class="rk-status-row"><td colspan="6"><div class="rk-empty-state rk-empty-state--current"><i class="fa-regular fa-calendar-check"></i><strong>TEMPORADA ACTUAL PREPARADA</strong><span>${escaparHTML(rankingInfo(liga).label)} todavía no tiene estadísticas de jugadores cargadas para esta campaña. No se reutiliza la temporada anterior.</span></div></td></tr>`;
                actualizarContextoVisualRanking();ocultarCargaLeaderboardRapida();return;
            }
        }else{
            const legacy=rankingLegacyKey(liga);const urlCSV=legacy?(CONFIG_ENLACES_JUGADORES?.[legacy]?.[temporada]||''):'';
            if(!urlCSV){tbody.innerHTML=`<tr class="rk-status-row"><td colspan="6"><div class="rk-empty-state"><strong>HISTÓRICO NO DISPONIBLE</strong><span>Esta liga solo tiene Leaderboard VIP de la campaña actual.</span></div></td></tr>`;ocultarCargaLeaderboardRapida();return;}
            data=await cargarDatasetJugadoresRanking(urlCSV,`inca_rankings_v64g_${legacy}_${temporada}`);
        }
        if(solicitudId!==estadoApp.solicitudes.rankings)return;
        validarColumnas(data,['Jugador'],`Rankings ${rankingInfo(liga).label} ${temporada}`);
        data.forEach(fila=>{registrarIndiceJugador(fila);registrarCaraJugadorEnDiccionario(fila);});
        estadoApp.rankings.matrizCrudaCSV=data;estadoApp.rankings.filasPreparadas=prepararFilasRankings(data);estadoApp.rankings.ultimoCalculo=null;estadoApp.rankings.ligaActual=liga;estadoApp.rankings.temporadaActual=temporada;
        const equipos=new Set();data.forEach(row=>{const eq=normalizarTexto(row?.Equipo);if(eq)equipos.add(eq);});
        const opciones=[{value:'ALL',label:'TODOS LOS EQUIPOS'}];[...equipos].sort((a,b)=>a.localeCompare(b,'es')).forEach(eq=>opciones.push({value:eq,label:eq}));
        rellenarSelectSeguro(document.getElementById('rankingsSelectEquipo'),opciones,'ALL');refrescarSelectCustom('rankingsSelectEquipo');
        actualizarContextoVisualRanking();await guardarSnapshotLeaderboard(liga,temporada);actualizarRankingsDOM();
    }catch(error){
        if(solicitudId!==estadoApp.solicitudes.rankings)return;
        tbody.innerHTML=`<tr class="rk-status-row"><td colspan="6"><div class="rk-empty-state rk-empty-state--error"><i class="fa-solid fa-cloud-arrow-down"></i><strong>NO SE PUDO CARGAR EL LEADERBOARD</strong><span>${escaparHTML(error.message||'ERROR DE CONEXIÓN')}</span></div></td></tr>`;ocultarCargaLeaderboardRapida();console.error('Error de rankings:',error);
    }
}

function normalizarIdJugador(valor) {
    if (valor === null || valor === undefined) return '';
    const texto = String(valor).trim();
    if (!texto) return '';

    const numero = Number(texto.replace(',', '.'));
    if (Number.isFinite(numero)) return String(Math.trunc(numero));
    const coincidencia = texto.match(/\d+/);
    return coincidencia ? coincidencia[0] : '';
}

function crearIdentidadPartidoRanking(row, indice) {
    const idPartido = claveTexto(obtenerValor(row, ['ID_Partido', 'Partido_ID', 'Match_ID', 'Event_ID', 'Evento_ID'], ''));
    const fecha = claveTexto(row?.Fecha);
    const partido = claveTexto(row?.Partido);
    const torneo = claveTexto(obtenerValor(row, ['Torneo', 'Competicion', 'Liga', 'Competition'], ''));
    const jornada = claveTexto(obtenerValor(row, ['Jornada', 'Round', 'Fecha_Jornada'], ''));
    const rival = claveTexto(obtenerValor(row, ['Rival', 'Oponente', 'Opponent'], ''));
    const condicion = claveTexto(obtenerValor(row, ['Condicion', 'Condición', 'Localia', 'Localía'], ''));
    const identidad = `${idPartido}|${fecha}|${partido}|${torneo}|${jornada}|${rival}|${condicion}`;
    if (identidad.replace(/\|/g, '')) return identidad;

    const huella = Object.entries(row || {})
        .filter(([clave]) => !['Jugador', 'Foto_URL', 'Foto', 'Imagen_URL'].includes(clave))
        .sort(([a], [b]) => a.localeCompare(b, 'es'))
        .map(([clave, valor]) => `${claveTexto(clave)}:${claveTexto(valor)}`)
        .join('|');
    return huella ? `RAW:${huella}` : `FILA:${indice}`;
}


function prepararFilasRankings(data) {
    const idsUnicosNombre = new Map();
    for (const row of data) {
        const nombreClave = claveTexto(row?.Jugador);
        const id = obtenerIdJugadorFila(row);
        if (!nombreClave || !id) continue;
        if (!idsUnicosNombre.has(nombreClave)) idsUnicosNombre.set(nombreClave, new Set());
        idsUnicosNombre.get(nombreClave).add(id);
    }

    const vistas = [];
    const vistos = new Set();
    data.forEach((row, indice) => {
        const nombre = normalizarTexto(row?.Jugador);
        if (!nombre) return;
        const nombreClave = claveTexto(nombre);
        let id = obtenerIdJugadorFila(row);
        if (!id) {
            const ids = idsUnicosNombre.get(nombreClave);
            if (ids?.size === 1) id = [...ids][0];
            if (!id) id = inferirIdJugador(nombre, row?.Equipo);
        }
        const equipo = normalizarTexto(row?.Equipo);
        const partido = separarPartido(row?.Partido);
        let condicion = normalizarCondicion(row?.Condicion) || 'NEUTRO';
        if (partido && equipo) {
            if (equiposEquivalentes(partido.local, equipo)) condicion = 'LOCAL';
            else if (equiposEquivalentes(partido.visita, equipo)) condicion = 'VISITA';
        }
        const identidad = `${id || nombreClave}|${crearIdentidadPartidoRanking(row, indice)}`;
        if (vistos.has(identidad)) return;
        vistos.add(identidad);
        const meta = obtenerMetaGlobalJugador(nombre, equipo);
        vistas.push({
            raw: row,
            nombre,
            nombreClave,
            id: id || meta.id,
            equipo: equipo || meta.equipo || 'Desconocido',
            posicion: normalizarTexto(obtenerValor(row, ['Posicion','Posición','Position'], meta.posicion || '')),
            fotoUrl: normalizarTexto(obtenerValor(row, ['Foto_URL','Foto','Imagen_URL','Photo_URL','Photo'], meta.fotoUrl || '')),
            condicion,
            minutos: Math.max(0, Math.trunc(primerNumero(row, ['Minutos_Jugados','Minutos Jugados','Minutes'], 0)))
        });
    });
    return vistas;
}

function calcularDataRanking(metrica, modo, isPortero = esMetricaAtajadas(metrica)) {
    const filas = Array.isArray(estadoApp.rankings.filasPreparadas) && estadoApp.rankings.filasPreparadas.length
        ? estadoApp.rankings.filasPreparadas
        : prepararFilasRankings(estadoApp.rankings.matrizCrudaCSV || []);
    const config = obtenerConfigMetricaRanking(metrica);
    const equipoFiltro = document.getElementById('rankingsSelectEquipo')?.value || 'ALL';
    const posicionSeleccionada = document.getElementById('rankingsSelectPosicion')?.value || 'ALL';
    const condicionFiltro = document.getElementById('rankingsSelectCondicion')?.value || 'ALL';
    const posFiltro = isPortero ? 'ARQUERO' : posicionSeleccionada;
    const limiteSelect = document.getElementById('rankingsSelectLimite');
    const limiteFiltro = Math.max(1, Number(limiteSelect?.value || limiteSelect?.dataset?.valorReal) || 25);

    const cache = estadoApp.rankings.ultimoCalculo;
    if (cache && cache.metrica === metrica && cache.modo === modo && cache.equipoFiltro === equipoFiltro &&
        cache.posFiltro === posFiltro && cache.condicionFiltro === condicionFiltro && cache.resultadoCompleto) {
        return cache.resultadoCompleto.slice(0, limiteFiltro);
    }

    const jugadores = new Map();
    for (const fila of filas) {
        if (condicionFiltro !== 'ALL' && fila.condicion !== condicionFiltro) continue;
        if (equipoFiltro !== 'ALL' && !equiposEquivalentes(fila.equipo, equipoFiltro)) continue;
        if (posFiltro !== 'ALL' && clasificarPosicion(fila.posicion) !== posFiltro) continue;
        if (fila.minutos < 45) continue;

        const key = fila.id ? `ID:${fila.id}` : `NOMBRE:${fila.nombreClave}|EQUIPO:${claveTexto(fila.equipo)}`;
        if (!jugadores.has(key)) jugadores.set(key, {
            key, jugador: fila.nombre, equipo: fila.equipo, posicion: fila.posicion,
            id: fila.id, fotoUrl: fila.fotoUrl, partidos: 0, minutos: 0, valorTotal: 0
        });
        const j = jugadores.get(key);
        if (!j.id && fila.id) j.id = fila.id;
        if (!j.fotoUrl && fila.fotoUrl) j.fotoUrl = fila.fotoUrl;
        j.partidos++;
        j.minutos += fila.minutos;
        const row = fila.raw;
        let valor = 0;
        if (metrica === 'Tarjetas_Generales') {
            valor = primerNumero(row, ['Tarjetas_Amarillas','Tarjetas','Yellow Cards'], 0) + primerNumero(row, ['Tarjetas_Rojas','Red Cards'], 0) * 2;
        } else if (metrica === 'Minutos_Jugados') valor = fila.minutos;
        else valor = primerNumero(row, config.columnas, 0);
        j.valorTotal += valor;
    }

    const ranking = Array.from(jugadores.values()).map(j => ({
        ...j,
        valorPromedio: j.partidos ? j.valorTotal / j.partidos : 0,
        valorSort: modo === 'promedio' ? (j.partidos ? j.valorTotal / j.partidos : 0) : j.valorTotal
    })).sort((a,b) => b.valorSort - a.valorSort || b.valorTotal - a.valorTotal || b.minutos - a.minutos || a.jugador.localeCompare(b.jugador,'es'));

    estadoApp.rankings.ultimoCalculo = { metrica, modo, equipoFiltro, posFiltro, condicionFiltro, resultadoCompleto: ranking };
    estadoApp.rankings.diccionarioActual = ranking;
    return ranking.slice(0, limiteFiltro);
}

function formatearNumeroRanking(valor, decimales = 2) {
    const numero = aNumero(valor, 0);
    return numero.toLocaleString('es-PE', {
        minimumFractionDigits: Number.isInteger(numero) ? 0 : Math.min(1, decimales),
        maximumFractionDigits: decimales
    });
}

function aplicarEscudoSeguro(imagen, equipo) {
    if (!imagen) return;
    const nombre = normalizarTexto(equipo);
    const logo = obtenerEscudoEquipo(nombre);
    imagen.alt = logo ? `Escudo de ${nombre}` : '';
    if (!logo) {
        imagen.removeAttribute('src');
        imagen.style.display = 'none';
        return;
    }
    imagen.style.display = '';
    imagen.crossOrigin = 'anonymous';
    imagen.decoding = 'async';
    imagen.onerror = () => {
        imagen.onerror = null;
        imagen.removeAttribute('src');
        imagen.style.display = 'none';
    };
    imagen.src = logo;
}

function obtenerRutaCaraSegura(jugador) {
    let idJugador = normalizarIdJugador(jugador.id);
    const nombre = normalizarTexto(jugador.jugador);

    if (!idJugador && nombre && estadoApp.jugadores?.playerMeta) {
        const nombreNorm = claveTexto(nombre);
        const metaInfo = Object.values(estadoApp.jugadores.playerMeta).find(m => m.nombreNormalizado === nombreNorm);
        if (metaInfo && metaInfo.id) {
            idJugador = metaInfo.id;
        }
    }

    let rutaDiccionario = '';
    if (idJugador) {
        if (estadoApp.diccionarioCaras instanceof Map) {
            rutaDiccionario = estadoApp.diccionarioCaras.get(idJugador) || '';
        } else if (estadoApp.diccionarioCaras && typeof estadoApp.diccionarioCaras === 'object') {
            rutaDiccionario = estadoApp.diccionarioCaras[idJugador] || '';
        }
    }

    const fotoCSV = normalizarTexto(jugador.fotoUrl);
    
    if (rutaDiccionario && /^(?:https?:|data:)/i.test(rutaDiccionario)) return rutaDiccionario;
    if (fotoCSV && /^(?:https?:|data:)/i.test(fotoCSV)) return fotoCSV;
    
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=0f172a&color=f8fafc&bold=true&rounded=true&size=256`;
}

window.debouncedRankingsSearch = debounce(actualizarRankingsDOM, 90);


function crearFilaRankingOptimizada(jugador, indice) {
    const fila = document.createElement('tr');
    fila.className = 'rk-player-row';
    fila.tabIndex = 0;
    fila.setAttribute('role', 'button');
    fila.setAttribute('aria-label', `Abrir perfil de ${jugador.jugador}`);
    fila.innerHTML = `
        <td><div class="rk-number-box">${indice + 1}</div></td>
        <td><div class="rk-player-info"><div class="rk-avatar"><img class="rk-avatar-img" alt="" width="58" height="58" decoding="async" referrerpolicy="no-referrer"/></div><div class="rk-player-text"><span class="rk-name">${escaparHTML(jugador.jugador)}</span><span class="rk-team"><img class="rk-team-logo" alt="" decoding="async" loading="lazy" referrerpolicy="no-referrer"/><span class="rk-team-name">${escaparHTML(jugador.equipo)}</span><span class="rk-position">${escaparHTML(jugador.posicion || 'POSICIÓN N/D')}</span></span></div></div></td>
        <td class="rk-stat-normal">${jugador.partidos}</td><td class="rk-stat-muted">${jugador.minutos}'</td>
        <td><div class="rk-number-box-total">${formatearNumeroRanking(jugador.valorTotal, 1)}</div></td>
        <td><div class="rk-badge-promedio"><i aria-hidden="true" class="fa-solid fa-bolt"></i>${formatearNumeroRanking(jugador.valorPromedio, 2)}</div></td>`;
    const abrir = () => abrirModalJugador(jugador.jugador, jugador.equipo, jugador.fotoUrl, jugador.id);
    fila.addEventListener('click', abrir);
    fila.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); abrir(); } });
    observarCaraRanking(fila.querySelector('.rk-avatar-img'), { idJugador: jugador.id, fotoUrl: jugador.fotoUrl, nombre: jugador.jugador, equipo: jugador.equipo, prioridad: indice < 18 });
    aplicarEscudoSeguro(fila.querySelector('.rk-team-logo'), jugador.equipo);
    return fila;
}

function actualizarRankingsDOM() {
    asegurarOpcionesLimiteRankings();
    const metricaDom = document.getElementById('rankingsSelectMetrica');
    const modoDom = document.getElementById('rankingsSelectModo');
    const tbody = document.getElementById('tablaBodyRankings');
    if (!metricaDom || !modoDom || !tbody) { ocultarCargaLeaderboardRapida(); return; }

    sincronizarMetricasPorPosicionRanking();

    const metrica = metricaDom.value;
    const modo = modoDom.value;
    const isPortero = document.getElementById('rankingsSelectPosicion')?.value === 'ARQUERO';
    aplicarTemaCamaleonRankings(metrica);
    actualizarHeroRankings(metrica, modo);

    const thTotal = document.getElementById('thRankTotal');
    const thProm = document.getElementById('thRankProm');
    if (thTotal) {
        thTotal.textContent = 'TOTAL';
        thTotal.classList.toggle('is-active', modo === 'total');
        thTotal.setAttribute('aria-sort', modo === 'total' ? 'descending' : 'none');
    }
    if (thProm) {
        thProm.textContent = 'POR PARTIDO';
        thProm.classList.toggle('is-active', modo === 'promedio');
        thProm.setAttribute('aria-sort', modo === 'promedio' ? 'descending' : 'none');
    }

    const ranking = calcularDataRanking(metrica, modo, isPortero);
    const tablaScroll = tbody.closest('.rk-table-scroll');
    tbody.replaceChildren();
    tbody.dataset.renderedCount = String(ranking.length);

    const contadorHero = document.getElementById('rankingsHeroCount');
    if (contadorHero) {
        contadorHero.textContent = `MOSTRANDO ${ranking.length} JUGADOR${ranking.length === 1 ? '' : 'ES'}`;
    }

    if (!ranking.length) {
        tbody.innerHTML = `<tr class="rk-status-row"><td colspan="6"><div class="rk-empty-state"><i class="fa-solid fa-magnifying-glass-chart"></i><strong>SIN JUGADORES PARA MOSTRAR</strong><span>No hay resultados con estos filtros y el mínimo de 45 minutos.</span></div></td></tr>`;
        ocultarCargaLeaderboardRapida();
        return;
    }

    if (window.INCA_VIRTUAL_TABLE && tablaScroll) {
        window.INCA_VIRTUAL_TABLE.mount({
            container: tablaScroll,
            tbody,
            items: ranking,
            rowHeight: 72,
            overscan: 6,
            renderRow: crearFilaRankingOptimizada
        });
    } else {
        const fragment = document.createDocumentFragment();
        ranking.forEach((jugador, indice) => fragment.appendChild(crearFilaRankingOptimizada(jugador, indice)));
        tbody.appendChild(fragment);
    }

    ocultarCargaLeaderboardRapida();
}

function aplicarTemaCamaleonRankings(metrica) {
    const root = document.getElementById('vista-rankings');
    if (!root) return;
    const config = obtenerConfigMetricaRanking(metrica);
    root.style.setProperty('--rk-theme', config.color);

    const modal = document.getElementById('modalJugadorVIP');
    const modalHeader = document.getElementById('modalHeaderTheme');
    if (modal) modal.style.setProperty('--rk-theme', config.color);
    if (modalHeader) modalHeader.style.setProperty('--rk-theme', config.color);
}

function obtenerFilasUnicasModalJugador(nombre, equipo, idJugador) {
    const dataCruda = Array.isArray(estadoApp.rankings.matrizCrudaCSV) ? estadoApp.rankings.matrizCrudaCSV : [];
    const dataPreparada = Array.isArray(estadoApp.rankings.filasPreparadas)
        ? estadoApp.rankings.filasPreparadas.map(fila => fila?.raw || fila).filter(Boolean)
        : [];
    const data = dataCruda.length ? dataCruda : dataPreparada;
    const idNormalizado = normalizarIdJugador(idJugador);
    const nombreNormalizado = claveTexto(nombre);
    const idsDelNombre = new Set();

    data.forEach(row => {
        if (claveTexto(row?.Jugador) !== nombreNormalizado) return;
        const rowId = obtenerIdJugadorFila(row);
        if (rowId) idsDelNombre.add(rowId);
    });

    const vistas = [];
    const vistos = new Set();
    data.forEach((row, indice) => {
        const rowId = obtenerIdJugadorFila(row);
        const mismoNombre = claveTexto(row?.Jugador) === nombreNormalizado;
        const mismoEquipo = !equipo || equiposEquivalentes(row?.Equipo, equipo);
        const idInferible = !rowId && mismoNombre && idsDelNombre.size === 1 && idsDelNombre.has(idNormalizado);
        const csvSinIdsParaNombre = !rowId && mismoNombre && idsDelNombre.size === 0 && mismoEquipo;
        const coincide = idNormalizado
            ? rowId === idNormalizado || idInferible || csvSinIdsParaNombre
            : (mismoNombre && mismoEquipo);
        if (!coincide) return;

        const clave = crearIdentidadPartidoRanking(row, indice);
        if (vistos.has(clave)) return;
        vistos.add(clave);
        vistas.push(row);
    });
    return vistas;
}

function abrirModalJugador(nombre, equipo, fotoUrl, idJugador = '') {
    const modal = document.getElementById('modalJugadorVIP');
    if (!modal) return;

    const metaGlobal = obtenerMetaGlobalJugador(nombre, equipo);
    const idFinal = normalizarIdJugador(idJugador) || metaGlobal.id;
    const fotoFinal = normalizarTexto(fotoUrl || metaGlobal.fotoUrl);
    const equipoFinal = normalizarTexto(equipo || metaGlobal.equipo);

    const filas = obtenerFilasUnicasModalJugador(nombre, equipoFinal, idFinal);
    const filasOrdenadas = [...filas].sort((a, b) => {
        const fechaA = parseDate(a?.Fecha).getTime();
        const fechaB = parseDate(b?.Fecha).getTime();
        return (Number.isFinite(fechaB) ? fechaB : 0) - (Number.isFinite(fechaA) ? fechaA : 0);
    });
    const ultimaFila = filasOrdenadas[0] || {};
    const posicion = normalizarTexto(obtenerValor(ultimaFila, ['Posicion', 'Posición', 'Position'], metaGlobal.posicion || 'POSICIÓN N/D'));
    const fotoCSV = normalizarTexto(fotoFinal || obtenerValor(ultimaFila, ['Foto_URL', 'Foto', 'Imagen_URL'], metaGlobal.fotoUrl));

    const asignarTexto = (id, valor) => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = String(valor ?? '');
    };
    asignarTexto('modalNombrePj', nombre);
    asignarTexto('modalNombreEq', equipoFinal || equipo || metaGlobal.equipo || '');
    asignarTexto('modalPosicionPj', posicion || 'POSICIÓN N/D');

    const modalEyebrow = modal?.querySelector('.modal-section-eyebrow');
    if (modalEyebrow) {
        const ligaActual = document.getElementById('rankingsSelectLiga')?.value || '';
        const temporadaActual = document.getElementById('rankingsSelectTemporada')?.value || '';
        modalEyebrow.textContent = `TEMPORADA ${etiquetaTemporadaRanking(temporadaActual, ligaActual)}`;
    }

    resolverCaraJugador(document.getElementById('modalFotoPj'), {
        idJugador: idFinal,
        fotoUrl: fotoCSV,
        nombre,
        equipo: equipoFinal,
        prioridad: true
    }, modal.querySelector('.modal-avatar-placeholder'));
    aplicarEscudoSeguro(document.getElementById('modalEscudoEq'), equipo);

    const acumulado = { partidos: 0, mins: 0, goles: 0, asis: 0, tiros: 0, puerta: 0, tackles: 0, tarjetas: 0, atajadas: 0 };
    filas.forEach(row => {
        acumulado.partidos += 1;
        acumulado.mins += primerNumero(row, ['Minutos_Jugados', 'Minutos Jugados', 'Minutes'], 0);
        acumulado.goles += primerNumero(row, ['Goles', 'Goals'], 0);
        acumulado.asis += primerNumero(row, ['Asistencias', 'Assists'], 0);
        acumulado.tiros += primerNumero(row, ['Tiros_Totales', 'Tiros Totales', 'Total Shots'], 0);
        acumulado.puerta += primerNumero(row, ['Tiros_Al_Arco', 'Tiros a Puerta', 'Shots on Target'], 0);
        acumulado.tackles += primerNumero(row, ['Entradas(Tackles)', 'Entradas', 'Tackles'], 0);
        acumulado.tarjetas += primerNumero(row, ['Tarjetas_Amarillas', 'Tarjetas', 'Yellow Cards'], 0)
            + primerNumero(row, ['Tarjetas_Rojas', 'Red Cards'], 0);
        acumulado.atajadas += primerNumero(row, COLUMNAS_ATAJADAS, 0);
    });

    asignarTexto('mPj', acumulado.partidos);
    asignarTexto('mMins', acumulado.mins);
    asignarTexto('mGol', acumulado.goles);
    asignarTexto('mAsi', acumulado.asis);
    asignarTexto('mTir', acumulado.tiros);
    asignarTexto('mPue', acumulado.puerta);
    asignarTexto('mTck', acumulado.tackles);
    asignarTexto('mTar', acumulado.tarjetas);
    asignarTexto('mAtj', acumulado.atajadas);

    const cajaAtajadas = document.getElementById('modalAtajadasBox');
    if (cajaAtajadas) cajaAtajadas.style.display = clasificarPosicion(posicion) === 'ARQUERO' || acumulado.atajadas > 0 ? 'flex' : 'none';

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}

function cerrarModalJugador() {
    const modal = document.getElementById('modalJugadorVIP');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

// V4.27.18 FAST: no consumimos TITAN ni jugadores antes del login.
// El motor arranca cuando Supabase autoriza la sesión. Si por alguna razón
// el evento ocurrió antes de cargar este archivo, detectamos la clase auth.
let __incaAppStartProgramado = false;
function programarInicioIncaAutenticado() {
    if (__incaAppStartProgramado) return;
    __incaAppStartProgramado = true;
    const arrancar = () => inicializarApp().catch?.(error => console.warn('[INCA START AUTH]', error));
    if (document.readyState === 'complete') arrancar();
    else window.addEventListener('load', arrancar, { once: true });
}
window.addEventListener('inca:auth-ready', programarInicioIncaAutenticado, { once: true });
if (document.documentElement.classList.contains('inca-authenticated')) {
    programarInicioIncaAutenticado();
}

document.addEventListener('DOMContentLoaded', () => {
    const limite = document.getElementById('rankingsSelectLimite');
    if (!limite || limite.dataset.listenerTopActivo === '1') return;

    limite.dataset.listenerTopActivo = '1';
    limite.classList.remove('hidden-native-select');
    limite.dataset.valorReal = limite.value || '25';
    limite.addEventListener('change', () => {
        limite.dataset.valorReal = limite.value;
        if (estadoApp?.rankings) estadoApp.rankings.limiteActual = Number(limite.value) || 25;
    });
});

// V4.27.18 FAST: los mapas de caras/IDs se precalientan DESPUÉS del login
// desde fast-v1.js. Evitamos bajar ~5 MB mientras el usuario aún está en Auth.



document.addEventListener('click', event => {
    const objetivo = event.target.closest(
        '[data-view], [data-section], .nav-item, .sidebar-item, button, a'
    );
    if (!objetivo) return;

    const texto = [
        objetivo.dataset?.view,
        objetivo.dataset?.section,
        objetivo.id,
        objetivo.getAttribute('href'),
        objetivo.textContent
    ].filter(Boolean).join(' ').toUpperCase();

    if (texto.includes('PLAYER') || texto.includes('JUGADOR') || texto.includes('VIP')) {
        incaAsegurarPlayerVip().catch(error => {
            console.warn('[INCA FAST START] Player VIP no pudo cargarse.', error);
        });
    }

    if (texto.includes('LEADER') || texto.includes('RANKING')) {
        incaAsegurarLeaderboard().catch(error => {
            console.warn('[INCA FAST START] Leaderboard no pudo cargarse.', error);
        });
    }
}, { passive: true });





document.addEventListener('change', event => {
    if (
        event.target?.matches?.(
            '#selectTorneoPj, #selectRangoPj, #selectCondicionPj, #pjSelectMercado, #pjSelectLinea'
        )
    ) {
        capturarFiltrosPlayerVip();
    }
}, { passive: true });


// ==========================================================================
// V4.27.15 — MATCH CENTER PLAYER BRIDGE
// Reutiliza Player Props histórico; NO representa alineaciones confirmadas.
// ==========================================================================
window.INCA_PLAYER_BRIDGE = Object.freeze({
    ensureReady: () => cargarBaseDatosJugadores(),
    async playersForTeam(teamName = '') {
        await cargarBaseDatosJugadores();
        const objetivo = claveTexto(teamName);
        const metas = Object.values(estadoApp.jugadores?.playerMeta || {});
        if (!objetivo) return [];

        const exactos = metas.filter(meta => claveTexto(meta?.equipo || '') === objetivo);
        const flexibles = exactos.length ? exactos : metas.filter(meta => {
            const club = claveTexto(meta?.equipo || '');
            return club && (club.includes(objetivo) || objetivo.includes(club));
        });

        return flexibles
            .sort((a,b) =>
                String(a.posicion || '').localeCompare(String(b.posicion || ''), 'es', { sensitivity:'base' }) ||
                String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity:'base' })
            )
            .map(meta => ({
                id: meta.id || '',
                nombre: meta.nombre || '',
                equipo: meta.equipo || '',
                posicion: meta.posicion || ''
            }));
    }
});
