// ── Pays & régions d'une étape ────────────────────────────
// Chaque étape porte un pays et une région (champs `country` / `region`,
// plus `countryCode` en ISO 3166-1 alpha-2 pour le drapeau). Ces champs sont
// renseignés dans trois cas, du plus fiable au plus approximatif :
//   1. l'auteur choisit un lieu dans l'autocomplétion (Nominatim côté client)
//   2. le serveur géocode à l'envers les coordonnées de l'étape
//   3. à défaut, on découpe le libellé du lieu (« Ville, Région, Pays »)
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
// Nominatim impose un User-Agent identifiant l'application et 1 requête/seconde max.
const USER_AGENT = 'velo-journal/1.0 (journal de voyage auto-hébergé)';

const UNKNOWN_COUNTRY = 'Pays inconnu';
const UNKNOWN_REGION  = 'Région inconnue';

// Géocodage inverse d'un point → { country, countryCode, region }, ou null si échec.
async function reverseGeocode(lat, lon) {
  if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return null;
  if (typeof fetch !== 'function') {
    console.warn('[geo] fetch indisponible (Node < 18) — pays/région non résolus');
    return null;
  }
  const url = `${NOMINATIM_REVERSE}?lat=${Number(lat).toFixed(6)}&lon=${Number(lon).toFixed(6)}`
    + '&format=jsonv2&zoom=10&addressdetails=1&accept-language=fr';
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

// Résout le pays / la région à l'enregistrement d'une étape :
// valeurs saisies → géocodage inverse des coordonnées → libellé du lieu.
async function resolvePostGeo({ country, region, countryCode, lat, lon, location }) {
  const typedCountry = (country || '').toString().trim().substring(0, 80);
  const typedRegion  = (region  || '').toString().trim().substring(0, 80);
  const typedCode    = (countryCode || '').toString().trim().toLowerCase().substring(0, 2);
  if (typedCountry) {
    return { country: typedCountry, region: typedRegion, countryCode: /^[a-z]{2}$/.test(typedCode) ? typedCode : '' };
  }
  const geocoded = await reverseGeocode(lat, lon);
  if (geocoded) return { country: geocoded.country, region: typedRegion || geocoded.region, countryCode: geocoded.countryCode };
  const parsed = geoFromLocation(location);
  if (parsed) return { country: parsed.country, region: typedRegion || parsed.region, countryCode: '' };
  return { country: '', region: typedRegion, countryCode: '' };
}

// Drapeau emoji à partir du code ISO 3166-1 alpha-2 (indicateurs régionaux).
function flagEmoji(code) {
  const c = (code || '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(c)) return '🌍';
  return String.fromCodePoint(...[...c].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 97));
}

module.exports = {
  reverseGeocode, geoFromLocation, postGeo, resolvePostGeo, flagEmoji,
  UNKNOWN_COUNTRY, UNKNOWN_REGION,
};
