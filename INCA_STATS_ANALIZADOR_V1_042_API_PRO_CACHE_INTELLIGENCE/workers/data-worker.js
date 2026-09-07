/* INCA STATS data worker */
'use strict';

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else {
      if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  while (rows.length && rows[0].every(v => !String(v).trim())) rows.shift();
  if (!rows.length) return [];
  const headers = rows.shift().map(v => String(v).trim());
  return rows.filter(r => r.some(v => String(v).trim())).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
    return obj;
  });
}


function parseCSVFiltered(text, filters={}) {
  const wantedComp = String(filters.competitionId ?? '').trim();
  const wantedSeason = String(filters.seasonId ?? '').trim();
  const wantedTimes = new Set((filters.times || ['ALL','1ST','2ND']).map(v => String(v).toUpperCase()));
  let headers = null;
  let compIndex = -1, seasonIndex = -1, timeIndex = -1;
  const out = [];
  let row = [], field = '', quoted = false;

  const finishRow = () => {
    row.push(field.replace(/\r$/, ''));
    field = '';
    if (!headers) {
      headers = row.map(v => String(v).trim());
      compIndex = headers.indexOf('Competition_ID');
      seasonIndex = headers.indexOf('Season_ID');
      timeIndex = headers.indexOf('Tiempo');
    } else if (row.some(v => String(v).trim())) {
      const compOk = compIndex < 0 || !wantedComp || String(row[compIndex] ?? '').trim() === wantedComp;
      const seasonOk = seasonIndex < 0 || !wantedSeason || String(row[seasonIndex] ?? '').trim() === wantedSeason;
      const timeValue = timeIndex < 0 ? 'ALL' : String(row[timeIndex] ?? '').trim().toUpperCase();
      if (compOk && seasonOk && wantedTimes.has(timeValue)) {
        const obj = {};
        for (let i = 0; i < headers.length; i++) obj[headers[i]] = row[i] ?? '';
        out.push(obj);
      }
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else {
      if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') finishRow();
      else field += ch;
    }
  }
  if (field.length || row.length) finishRow();
  return out;
}

function normalize(v) {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function buildSearchIndex(items, nameField='Jugador', max=20000) {
  const index = Object.create(null);
  items.slice(0,max).forEach((item, position) => {
    const value = normalize(item?.[nameField]);
    const tokens = new Set(value.split(/\s+/).filter(t => t.length >= 2));
    tokens.add(value);
    for (const token of tokens) {
      if (!index[token]) index[token] = [];
      if (index[token].length < 100) index[token].push(position);
    }
  });
  return index;
}

self.onmessage = event => {
  const { id, type, payload } = event.data || {};
  try {
    let result;
    if (type === 'PARSE_CSV') result = parseCSV(payload.text || '');
    else if (type === 'PARSE_CSV_FILTERED') result = parseCSVFiltered(payload.text || '', payload.filters || {});
    else if (type === 'BUILD_SEARCH_INDEX') result = buildSearchIndex(payload.items || [], payload.nameField);
    else if (type === 'PING') result = { ok: true };
    else throw new Error(`Tarea desconocida: ${type}`);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
};
