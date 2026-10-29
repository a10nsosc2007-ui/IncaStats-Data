// INCASTATS V3 — motor de cuotas privadas en localhost.
// Node.js 20+, sin paquetes, sin BAT, sin solicitudes desde los clics de usuarios.
// Uso local: node INCASTATS_V3_LOCAL_BACKEND/server.mjs
// Este es el servicio de datos, NO una app V3 completa.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOME = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(HOME, ".env.local");
function loadEnv() {
  let raw = "";
  try { raw = fs.readFileSync(envPath, "utf8"); }
  catch { return {}; }
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const pos = trimmed.indexOf("=");
    if (pos < 1) continue;
    const key = trimmed.slice(0, pos).trim();
    let value = trimmed.slice(pos + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}
const E = loadEnv();
const asInt = (x, fallback, min, max) => {
  const n = Number(x);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
const sports = (E.INCA_SPORTS ||
  "soccer_uefa_champs_league,soccer_uefa_europa_league,soccer_uefa_europa_conference_league,soccer_conmebol_copa_libertadores")
  .split(",").map(v => v.trim()).filter(v => /^soccer_[a-z0-9_]+$/i.test(v)).slice(0, 32);
const keys = (E.ODDS_API_KEYS || E.ODDS_API_KEY || "")
  .split(",").map(v => v.trim()).filter(Boolean).slice(0, 9);
const selected = asInt(E.INCA_ACTIVE_KEY_INDEX, 1, 1, 9) - 1;
const apiKey = keys[selected] || "";
const apiHost = "https://api.the-odds-api.com/v4";
const region = E.INCA_REGIONS || "eu";
const propMarkets = (E.INCA_PROP_MARKETS || "player_shots,player_shots_on_target")
  .split(",").map(v => v.trim()).filter(v => /^[a-z_]+$/i.test(v)).slice(0, 4).join(",");
const port = asInt(E.INCA_PORT, 8787, 1024, 65535);
const refreshMs = asInt(E.INCA_REFRESH_HOURS, 12, 6, 72) * 3600_000;
const maxReq = asInt(E.INCA_MAX_REQUESTS_PER_SYNC, 12, 1, 60);
const maxPropEvents = asInt(E.INCA_PROP_EVENTS_PER_SYNC, 4, 0, 20);
const cacheDir = path.join(HOME, "runtime");
const cachePath = path.join(cacheDir, "cache.json");
let syncBusy = false;
let cache = { schema: "inca.v3.local.odds.v1", updated_at: null, sports: {},
  errors: [], billing: { requests_used: 0, remaining: null, last: null } };
try {
  const previous = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  if (previous?.schema === cache.schema) cache = previous;
} catch {}
function save() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const temp = cachePath + ".new";
  fs.writeFileSync(temp, JSON.stringify(cache, null, 2));
  fs.renameSync(temp, cachePath);
}
function httpError(message, status = 500) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}
let budgetLeft = 0;
async function upstream(sport, suffix, markets) {
  if (!apiKey) throw httpError("No se configuró ODDS_API_KEYS en .env.local", 503);
  if (budgetLeft <= 0) throw httpError("Tope local de solicitudes alcanzado", 429);
  budgetLeft--;
  const u = new URL(apiHost + "/sports/" + encodeURIComponent(sport) + suffix);
  u.searchParams.set("apiKey", apiKey);
  u.searchParams.set("regions", region);
  u.searchParams.set("markets", markets);
  u.searchParams.set("oddsFormat", "decimal");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 16_000);
  try {
    const r = await fetch(u, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    // Nunca registrar la URL, que contiene la clave.
    const remaining = r.headers.get("x-requests-remaining");
    const last = r.headers.get("x-requests-last");
    const used = r.headers.get("x-requests-used");
    if (remaining !== null) cache.billing.remaining = Number(remaining);
    if (last !== null) cache.billing.last = Number(last);
    if (used !== null) cache.billing.requests_used = Number(used);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw httpError(
      "Proveedor devolvió HTTP " + r.status +
      (typeof json.message === "string" ? ": " + json.message.slice(0, 180) : ""),
      r.status);
    if (!Array.isArray(json)) throw httpError("Respuesta inesperada del proveedor", 502);
    return json;
  } finally { clearTimeout(timer); }
}
function normalize(events, sport) {
  const out = [];
  for (const e of events) {
    if (!e?.id || !e?.commence_time) continue;
    const prices = [];
    for (const bk of Array.isArray(e.bookmakers) ? e.bookmakers : []) {
      for (const mk of Array.isArray(bk.markets) ? bk.markets : []) {
        for (const o of Array.isArray(mk.outcomes) ? mk.outcomes : []) {
          const n = Number(o.price);
          if (!(n > 1) || !Number.isFinite(n)) continue;
          prices.push({
            bookmaker: String(bk.key || ""), market: String(mk.key || ""),
            outcome: String(o.name || ""), description: String(o.description || ""),
            point: o.point == null ? null : Number(o.point), price: n,
            last_update: mk.last_update || bk.last_update || null
          });
        }
      }
    }
    out.push({
      source: "the-odds-api-v4", event_id: String(e.id),
      sport_key: sport, start_time: e.commence_time,
      home_team: e.home_team || "", away_team: e.away_team || "",
      prices
    });
  }
  return out;
}
async function sync() {
  if (syncBusy) return;
  if (!apiKey || !sports.length) return;
  const last = Date.parse(cache.updated_at || "");
  if (Number.isFinite(last) && Date.now() - last < refreshMs) return;
  syncBusy = true;
  budgetLeft = maxReq;
  const errors = [];
  let completed = 0;
  try {
    for (const sport of sports) {
      if (budgetLeft <= 0) break;
      try {
        const h2h = await upstream(sport, "/odds", "h2h");
        let events = normalize(h2h, sport);
        // Solo prepartido; respeta fechas reales, no fabrica eventos.
        const now = Date.now();
        events = events.filter(e => Date.parse(e.start_time) > now);
        const chosen = events.slice().sort((a, b) =>
          Date.parse(a.start_time) - Date.parse(b.start_time)).slice(0, maxPropEvents);
        const propEvents = [];
        for (const e of chosen) {
          if (!propMarkets || budgetLeft <= 0) break;
          try {
            const details = await upstream(sport,
              "/events/" + encodeURIComponent(e.event_id) + "/odds", propMarkets);
            propEvents.push(...normalize(details, sport));
          } catch (err) {
            errors.push({sport, event_id:e.event_id, stage:"props", message:err.message});
            if (err.statusCode === 401 || err.statusCode === 429) break;
          }
        }
        cache.sports[sport] = {
          fetched_at: new Date().toISOString(), h2h:events, props:propEvents
        };
        completed++;
      } catch (err) {
        errors.push({sport,stage:"h2h",message:err.message});
        if (err.statusCode === 401 || err.statusCode === 429) break;
      }
    }
    cache.errors = errors.slice(-50);
    // Fecha de control de ventana solo cuando alguna competición se actualizó.
    if (completed) cache.updated_at = new Date().toISOString();
    save();
    console.log("[INCA LOCAL] sync",
      { sports_ok:completed, sports_errors:errors.length,
        quota_remaining:cache.billing.remaining, next_sync_hours:refreshMs/3600_000 });
  } finally { syncBusy = false; }
}
function safeJson(res, status, payload) {
  const bytes = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control":"no-store",
    "Access-Control-Allow-Origin": "http://localhost:5500",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(bytes);
}
function flattened(type) {
  return sports.flatMap(s => Array.isArray(cache.sports[s]?.[type])
    ? cache.sports[s][type] : []);
}
const server = http.createServer((req, res) => {
  let u;
  try { u = new URL(req.url, "http://127.0.0.1:" + port); }
  catch { return safeJson(res, 400, { error:"Ruta inválida" }); }
  if (req.method !== "GET") return safeJson(res, 405, {error:"Solo lectura"});
  if (u.pathname === "/api/status") return safeJson(res, 200, {
    service: "inca-v3-local", configured_keys: keys.length,
    active_key_index: keys.length ? selected + 1 : null,
    active_key_valid: Boolean(apiKey),
    sports_configured:sports, cached_at:cache.updated_at,
    cached_sports:Object.keys(cache.sports),
    sync_busy:syncBusy, quota:cache.billing,
    errors:cache.errors
  });
  if (u.pathname === "/api/fixtures") return safeJson(res, 200, {
    source:"the-odds-api-v4", cached_at:cache.updated_at,
    events:flattened("h2h").map(e => ({
      event_id:e.event_id,sport_key:e.sport_key,start_time:e.start_time,
      home_team:e.home_team,away_team:e.away_team
    }))
  });
  if (u.pathname === "/api/odds") return safeJson(res, 200, {
    source:"the-odds-api-v4", cached_at:cache.updated_at,
    events:flattened("h2h")
  });
  if (u.pathname === "/api/props") return safeJson(res, 200, {
    source:"the-odds-api-v4", cached_at:cache.updated_at,
    events:flattened("props")
  });
  return safeJson(res, 404, {error:"Endpoint inexistente"});
});
server.listen(port, "127.0.0.1", () => {
  console.log("[INCA LOCAL] http://127.0.0.1:" + port + "/api/status");
  console.log("[INCA LOCAL] claves configuradas:", keys.length,
    "| clave activa:", keys.length ? selected+1 : "ninguna");
  if (!keys.length) console.warn("[INCA LOCAL] Falta .env.local; no habrá cuotas.");
  // Nunca se gastan créditos en clics de usuarios: solo al refrescar cache.
  sync().catch(err => console.error("[INCA LOCAL] error de sync:",err.message));
  setInterval(() => {
    sync().catch(err => console.error("[INCA LOCAL] error:",err.message));
  }, 60 * 60_000).unref();
});
