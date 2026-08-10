// ── Relief : grille d'altitudes pour l'ombrage de l'affiche ──
// L'affiche dessine le relief à partir d'une grille régulière d'altitudes
// échantillonnée sur l'emprise de la carte. Les altitudes viennent d'Open-Meteo
// (même source que le D+ des étapes) : une grille coûte quelques dizaines
// d'appels, on la met donc en cache sur le disque — l'affiche est regénérée
// souvent, l'emprise change rarement.
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { ROOT } = require('../config');
const { fetchElevations } = require('./elevation');

const CACHE_DIR  = path.join(ROOT, 'tmp', 'relief');
const BATCH      = 100;  // Open-Meteo : 100 coordonnées par requête
const CONCURRENT = 5;    // requêtes en parallèle (≈ 20 s pour 18 000 points)

const MIN_SIDE  = 16;
const MAX_SIDE  = 220;
const MAX_CELLS = 20000;

// ── Mercator (identique à la projection de l'affiche) ──────
// Les lignes de la grille sont réparties uniformément en y Mercator, pas en
// latitude : l'image obtenue se pose alors exactement sur la carte, sans
// déformation, quelle que soit l'étendue nord-sud du voyage.
const mercY    = lat => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360));
const invMercY = y   => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;

function clampInt(v, lo, hi, fallback) {
  const n = parseInt(v, 10);
  if (!isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function clampNum(v, lo, hi) {
  const n = parseFloat(v);
  if (!isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, n));
}

// Emprise + dimensions demandées → paramètres validés, ou null si incohérents.
function normalizeQuery(q) {
  const south = clampNum(q.s, -85, 85);
  const north = clampNum(q.n, -85, 85);
  const west  = clampNum(q.w, -180, 180);
  const east  = clampNum(q.e, -180, 180);
  if (south == null || north == null || west == null || east == null) return null;
  if (north <= south || east <= west) return null;

  let cols = clampInt(q.cols, MIN_SIDE, MAX_SIDE, 90);
  let rows = clampInt(q.rows, MIN_SIDE, MAX_SIDE, 90);
  // Garde-fou : une grille trop dense multiplierait les appels à Open-Meteo.
  if (cols * rows > MAX_CELLS) {
    const k = Math.sqrt(MAX_CELLS / (cols * rows));
    cols = Math.max(MIN_SIDE, Math.floor(cols * k));
    rows = Math.max(MIN_SIDE, Math.floor(rows * k));
  }
  const r4 = v => Math.round(v * 1e4) / 1e4;
  return { south: r4(south), north: r4(north), west: r4(west), east: r4(east), cols, rows };
}

// Latitudes des lignes de la grille (centres de cellule), du nord vers le sud.
function rowLats({ south, north, rows }) {
  const y0 = mercY(north), y1 = mercY(south);
  const lats = [];
  for (let r = 0; r < rows; r++) lats.push(invMercY(y0 + (y1 - y0) * ((r + 0.5) / rows)));
  return lats;
}

function gridPoints(spec, lats) {
  const { west, east, cols } = spec;
  const pts = [];
  for (const lat of lats) {
    for (let c = 0; c < cols; c++) {
      pts.push({ lat, lon: west + (east - west) * ((c + 0.5) / cols) });
    }
  }
  return pts;
}

// Les points sont demandés par lots de 100, plusieurs lots à la fois : une
// grille de 9 000 points tient en une quinzaine de secondes au lieu d'une minute.
async function sampleElevations(points) {
  const batches = [];
  for (let i = 0; i < points.length; i += BATCH) batches.push(points.slice(i, i + BATCH));
  const results = new Array(batches.length);
  let next = 0, failed = false;

  async function worker() {
    while (!failed) {
      const i = next++;
      if (i >= batches.length) return;
      const eles = await fetchElevations(batches[i]);
      if (!eles) { failed = true; return; }
      results[i] = eles;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENT, batches.length) }, worker));
  if (failed) return null;

  const out = [];
  for (const r of results) for (const e of r) out.push(Math.round(e));
  return out;
}

// ── Cache disque ──────────────────────────────────────────
function cacheFile(spec) {
  const key = crypto.createHash('sha1')
    .update([spec.south, spec.north, spec.west, spec.east, spec.cols, spec.rows].join(':'))
    .digest('hex').slice(0, 16);
  return path.join(CACHE_DIR, `${key}.json`);
}

function readCache(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data.ele) && data.ele.length === data.cols * data.rows ? data : null;
  } catch(e) { return null; }
}

function writeCache(file, data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
  } catch(e) { console.warn('[relief] cache non écrit : ' + (e.message || e)); }
}

// Deux onglets qui demandent la même grille ne doivent pas doubler les appels.
const inflight = new Map();

// Grille d'altitudes de l'emprise demandée, ou null si Open-Meteo est
// injoignable (l'affiche se dessine alors sans ombrage).
async function reliefGrid(query) {
  const spec = normalizeQuery(query);
  if (!spec) return null;

  const file   = cacheFile(spec);
  const cached = readCache(file);
  if (cached) return cached;
  if (inflight.has(file)) return inflight.get(file);

  const job = (async () => {
    const lats = rowLats(spec);
    const ele  = await sampleElevations(gridPoints(spec, lats));
    if (!ele) return null;
    let min = Infinity, max = -Infinity;
    for (const e of ele) { if (e < min) min = e; if (e > max) max = e; }
    const data = {
      cols: spec.cols, rows: spec.rows,
      south: spec.south, north: spec.north, west: spec.west, east: spec.east,
      lats: lats.map(l => Math.round(l * 1e5) / 1e5),
      min: isFinite(min) ? min : 0,
      max: isFinite(max) ? max : 0,
      ele,
    };
    writeCache(file, data);
    return data;
  })().finally(() => inflight.delete(file));

  inflight.set(file, job);
  return job;
}

module.exports = { reliefGrid, normalizeQuery, MAX_CELLS };
