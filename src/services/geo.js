// ── Pays & régions d'une étape ────────────────────────────
// Chaque étape porte un pays et une région (champs `country` / `region`,
// plus `countryCode` en ISO 3166-1 alpha-2 pour le drapeau). Ces champs sont
// renseignés dans trois cas, du plus fiable au plus approximatif :
//   1. l'auteur choisit un lieu dans l'autocomplétion (Nominatim côté client)
//   2. le serveur géocode à l'envers les coordonnées de l'étape
//   3. à défaut, on découpe le libellé du lieu (« Ville, Région, Pays »)
const path = require('path');
const { PUBLIC_DIR } = require('../config');
const { readPosts, writePosts } = require('./posts');
const { parseGpxTrack } = require('./gpx');

const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
// Nominatim impose un User-Agent identifiant l'application et 1 requête/seconde max.
const USER_AGENT = 'velo-journal/1.0 (journal de voyage auto-hébergé)';
const MIN_INTERVAL_MS = 1100;

const UNKNOWN_COUNTRY = 'Pays inconnu';
const UNKNOWN_REGION  = 'Région inconnue';

// ── File d'attente Nominatim ──────────────────────────────
// Toutes les requêtes de l'application passent par ici : elles sont mises à la
// queue leu leu et espacées d'au moins une seconde, quel que soit l'appelant
// (enregistrement d'une étape, découpage d'une trace, recalcul global).
let chain = Promise.resolve();
let lastCall = 0;
function scheduleLookup(fn) {
  const run = chain.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastCall));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  // La file ne doit jamais se rompre sur une erreur d'un appel.
  chain = run.then(() => {}, () => {});
  return run;
}

// Cache des points déjà résolus, arrondis à ~2 km : un voyage à vélo repasse
// sans cesse dans la même zone, inutile de la redemander.
const geoCache = new Map();
const CACHE_MAX = 4000;
function cacheKey(lat, lon) {
  return `${(Math.round(lat / 0.02) * 0.02).toFixed(2)},${(Math.round(lon / 0.02) * 0.02).toFixed(2)}`;
}

// Géocodage inverse d'un point → { country, countryCode, region }, ou null si échec.
async function reverseGeocode(lat, lon) {
  if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return null;
  if (typeof fetch !== 'function') {
    console.warn('[geo] fetch indisponible (Node < 18) — pays/région non résolus');
    return null;
  }
  const key = cacheKey(Number(lat), Number(lon));
  if (geoCache.has(key)) return geoCache.get(key);

  const url = `${NOMINATIM_REVERSE}?lat=${Number(lat).toFixed(6)}&lon=${Number(lon).toFixed(6)}`
    + '&format=jsonv2&zoom=10&addressdetails=1&accept-language=fr';
  const result = await scheduleLookup(async () => {
    try {
      const ctrl = new AbortController();
      const to   = setTimeout(() => ctrl.abort(), 10000);
      const resp = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT },
        signal: ctrl.signal,
      });
      clearTimeout(to);
      if (!resp.ok) { console.warn('[geo] HTTP ' + resp.status); return null; }
      const data = await resp.json();
      const a = (data && data.address) || {};
      const country = (a.country || '').trim();
      if (!country) return null;
      // `state` couvre la plupart des pays ; les petits pays et certains territoires
      // n'exposent qu'un county / une région / une province.
      const region = (a.state || a.region || a.province || a.county || a.state_district || '').trim();
      return {
        country,
        countryCode: (a.country_code || '').trim().toLowerCase(),
        region,
      };
    } catch(e) {
      console.warn('[geo] échec du géocodage inverse : ' + (e.message || e));
      return null;
    }
  });

  // On ne mémorise que les succès : un échec réseau ne doit pas condamner la zone.
  if (result && geoCache.size < CACHE_MAX) geoCache.set(key, result);
  return result;
}

// Repli sans réseau : « Ville, Région, Pays » → { country, region }.
// C'est le format produit par l'autocomplétion de lieu, donc fiable pour les
// étapes déjà saisies. Renvoie null si le libellé n'est pas décomposable.
function geoFromLocation(location) {
  const parts = String(location || '').split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return {
    country: parts[parts.length - 1],
    countryCode: '',
    region: parts.length >= 3 ? parts[parts.length - 2] : '',
  };
}

// Pays / région d'une étape déjà enregistrée, avec repli sur le libellé du lieu.
// Ne fait jamais d'appel réseau : utilisable dans les vues.
function postGeo(p) {
  const stored   = { country: (p.country || '').trim(), region: (p.region || '').trim(), countryCode: (p.countryCode || '').trim().toLowerCase() };
  const fallback = stored.country && stored.region ? null : geoFromLocation(p.location);
  return {
    country:     stored.country || (fallback && fallback.country) || UNKNOWN_COUNTRY,
    region:      stored.region  || (fallback && fallback.region)  || UNKNOWN_REGION,
    countryCode: stored.countryCode,
  };
}

// Valeur immédiate du pays / de la région à l'enregistrement d'une étape, sans
// appel réseau : correction saisie à la main, sinon libellé du lieu. La vraie
// localisation (trace GPX, coordonnées) est calculée juste après, en tâche de
// fond, par enrichPostGeo — la publication n'attend jamais Nominatim.
function initialPostGeo({ country, region, countryCode, location, manual }) {
  const typedCountry = (country || '').toString().trim().substring(0, 80);
  const typedRegion  = (region  || '').toString().trim().substring(0, 80);
  const typedCode    = (countryCode || '').toString().trim().toLowerCase().substring(0, 2);
  if (typedCountry) {
    return {
      country: typedCountry,
      region: typedRegion,
      countryCode: /^[a-z]{2}$/.test(typedCode) ? typedCode : '',
      // « manual » verrouille la valeur : la détection automatique ne l'écrasera pas.
      geoSource: manual ? 'manual' : 'pending',
    };
  }
  const parsed = geoFromLocation(location);
  if (parsed) return { country: parsed.country, region: typedRegion || parsed.region, countryCode: '', geoSource: 'location' };
  return { country: '', region: typedRegion, countryCode: '', geoSource: '' };
}

// ── Découpage d'une trace GPX par pays / région ───────────
// On ne géocode pas tous les points de la trace : on résout ses deux extrémités,
// et si elles ne sont pas dans la même région on cherche le franchissement par
// dichotomie. Une étape entièrement dans une région coûte 2 requêtes, chaque
// frontière traversée en coûte ~6 de plus (trace échantillonnée à 64 points).
const MAX_LOOKUPS_PER_TRACK = 16;

function geoKey(g) {
  return g ? `${g.country}|${g.region}` : '';
}

// Cumule des tronçons { country, region, countryCode, km } en fusionnant les
// passages successifs dans une même région.
function addSegment(segments, geo, km) {
  if (!geo || !(km > 0)) return;
  const key  = geoKey(geo);
  const seen = segments.find(s => geoKey(s) === key);
  if (seen) { seen.km += km; return; }
  segments.push({ country: geo.country, region: geo.region, countryCode: geo.countryCode, km });
}

async function splitTrackByGeo(points, cumKm, { maxLookups = MAX_LOOKUPS_PER_TRACK } = {}) {
  if (!points || points.length < 2) return null;
  const resolved = new Map();
  let lookups = 0;

  // undefined = budget de requêtes épuisé ; null = point non localisable.
  const at = async (i) => {
    if (resolved.has(i)) return resolved.get(i);
    if (lookups >= maxLookups) return undefined;
    lookups++;
    const g = await reverseGeocode(points[i].lat, points[i].lon);
    resolved.set(i, g);
    return g;
  };

  const segments = [];
  const walk = async (i, j, gi, gj) => {
    const km = cumKm[j] - cumKm[i];
    if (!(km > 0)) return;
    const same = gi && gj && geoKey(gi) === geoKey(gj);
    if (same || !gi || !gj || j - i <= 1) {
      // Même région, extrémité non localisée, ou plus rien à subdiviser :
      // deux régions encadrant un tronçon indivisible se le partagent.
      if (gi && gj && !same) { addSegment(segments, gi, km / 2); addSegment(segments, gj, km / 2); }
      else addSegment(segments, gi || gj, km);
      return;
    }
    const m  = Math.floor((i + j) / 2);
    const gm = await at(m);
    if (gm === undefined) { addSegment(segments, gi, km / 2); addSegment(segments, gj, km / 2); return; }
    await walk(i, m, gi, gm);
    await walk(m, j, gm, gj);
  };

  const first = await at(0);
  const last  = await at(points.length - 1);
  if (!first && !last) return null;
  await walk(0, points.length - 1, first || null, last || null);
  return segments.length ? segments : null;
}

// ── Localisation complète d'une étape ─────────────────────
// Renvoie { country, region, countryCode, geoSource, geoBreakdown } ou null.
// `geoBreakdown` répartit la distance de l'étape entre les régions traversées :
// depuis la trace GPX quand elle existe, sinon un seul tronçon sur le point
// d'arrivée. Les kilomètres de train y sont comptés séparément des kilomètres
// de vélo, pour que les statistiques puissent distinguer les deux.
async function computePostGeo(post) {
  const bikeKm  = parseFloat(post.km) || 0;
  const trainKm = parseFloat(post.trainKm) || 0;
  const isTrain = !!post.trainTransfer;

  let segments = null;
  let source   = '';

  if (post.gpx) {
    const track = parseGpxTrack(path.join(PUBLIC_DIR, post.gpx));
    if (track) {
      segments = await splitTrackByGeo(track.points, track.cumKm);
      if (segments) source = 'gpx';
    }
  }
  if (!segments && post.lat != null && post.lon != null) {
    const g = await reverseGeocode(post.lat, post.lon);
    if (g) { segments = [{ ...g, km: 1 }]; source = 'point'; }
  }
  if (!segments) {
    const g = geoFromLocation(post.location);
    if (g) { segments = [{ ...g, km: 1 }]; source = 'location'; }
  }
  if (!segments || !segments.length) return null;

  // La trace peut différer du kilométrage retenu pour l'étape (valeur saisie,
  // trace partielle…) : on répartit la distance réelle au prorata des tronçons.
  // Sur un transfert, la trace est celle du train : ce sont les kilomètres de
  // train qui la suivent, et inversement. Les deux compteurs coexistent — un
  // jour de train peut aussi avoir été roulé (rejoindre la gare, en repartir).
  const trackKm = segments.reduce((s, seg) => s + seg.km, 0) || 1;
  const breakdown = segments.map(seg => {
    const share = seg.km / trackKm;
    return {
      country:     seg.country,
      region:      seg.region || UNKNOWN_REGION,
      countryCode: seg.countryCode || '',
      km:      isTrain ? 0 : Math.round(bikeKm  * share * 10) / 10,
      trainKm: isTrain ? Math.round(trainKm * share * 10) / 10 : 0,
    };
  });
  // Ce que la trace ne mesure pas est rattaché à l'arrivée : le train pris en
  // cours d'étape, ou les kilomètres roulés autour d'un transfert.
  const arrival = breakdown[breakdown.length - 1];
  if (isTrain && bikeKm  > 0) arrival.km      += bikeKm;
  if (!isTrain && trainKm > 0) arrival.trainKm += trainKm;

  const main = breakdown.reduce((a, b) => ((b.km + b.trainKm) > (a.km + a.trainKm) ? b : a));
  return {
    country:     main.country,
    region:      main.region,
    countryCode: main.countryCode,
    geoSource:   source,
    geoBreakdown: breakdown,
  };
}

// Localise une étape et enregistre le résultat. Appelée en tâche de fond après
// la publication d'une étape : la réponse HTTP n'attend pas Nominatim.
// Les pays saisis à la main (geoSource = 'manual') ne sont jamais écrasés.
async function enrichPostGeo(postId) {
  try {
    const post = readPosts().find(p => p.id === postId);
    if (!post || post.type === 'preparation') return null;
    const manual = post.geoSource === 'manual';
    const geo = await computePostGeo(post);
    if (!geo) return null;

    // Relecture juste avant écriture : l'étape a pu être modifiée entre-temps.
    const posts = readPosts();
    const idx   = posts.findIndex(p => p.id === postId);
    if (idx === -1) return null;
    posts[idx] = {
      ...posts[idx],
      country:     manual ? posts[idx].country     : geo.country,
      region:      manual ? posts[idx].region      : geo.region,
      countryCode: manual ? posts[idx].countryCode : geo.countryCode,
      geoSource:   manual ? 'manual'               : geo.geoSource,
      geoBreakdown: geo.geoBreakdown,
    };
    writePosts(posts);
    return posts[idx];
  } catch(e) {
    console.warn('[geo] enrichissement de l\'étape ' + postId + ' impossible : ' + (e.message || e));
    return null;
  }
}

// ── Rattrapage global (page Système) ──────────────────────
// Localiser tout un carnet demande une requête par extrémité de trace, espacées
// d'une seconde : bien trop long pour une requête HTTP. Le travail tourne donc
// en tâche de fond et la page Système en affiche l'avancement.
let job = { running: false, total: 0, done: 0, updated: 0, errors: 0, startedAt: null, finishedAt: null };

function geoJobStatus() { return { ...job }; }

function hasGeo(p) {
  return !!(p.country || '').trim() && Array.isArray(p.geoBreakdown) && p.geoBreakdown.length > 0;
}

// force = true : recalcule aussi les étapes déjà localisées automatiquement
// (utile après l'ajout de traces GPX). Les saisies manuelles restent intactes.
function startGeoBackfill({ force = false } = {}) {
  if (job.running) return { ...job, alreadyRunning: true };
  const todo = readPosts().filter(p =>
    p.type !== 'preparation'
    && p.geoSource !== 'manual'
    && (force || !hasGeo(p))
    && (p.gpx || (p.lat != null && p.lon != null) || p.location));
  job = { running: todo.length > 0, total: todo.length, done: 0, updated: 0, errors: 0, startedAt: Date.now(), finishedAt: null };
  if (!todo.length) { job.finishedAt = Date.now(); return { ...job }; }

  (async () => {
    for (const p of todo) {
      const res = await enrichPostGeo(p.id);
      if (res) job.updated++; else job.errors++;
      job.done++;
    }
    job.running = false;
    job.finishedAt = Date.now();
  })();
  return { ...job };
}

// Répartition par région d'une étape : le découpage de la trace s'il a été
// calculé, sinon un tronçon unique sur le point d'arrivée.
function postBreakdown(p) {
  const stored = Array.isArray(p.geoBreakdown) ? p.geoBreakdown.filter(b => b && b.country) : [];
  if (stored.length) return stored;
  const g = postGeo(p);
  return [{ ...g, km: parseFloat(p.km) || 0, trainKm: parseFloat(p.trainKm) || 0 }];
}

// Drapeau emoji à partir du code ISO 3166-1 alpha-2 (indicateurs régionaux).
function flagEmoji(code) {
  const c = (code || '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(c)) return '🌍';
  return String.fromCodePoint(...[...c].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 97));
}

module.exports = {
  reverseGeocode, geoFromLocation, postGeo, initialPostGeo, flagEmoji,
  splitTrackByGeo, computePostGeo, enrichPostGeo, postBreakdown,
  startGeoBackfill, geoJobStatus,
  UNKNOWN_COUNTRY, UNKNOWN_REGION,
};
