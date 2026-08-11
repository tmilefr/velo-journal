// ── Déplacements en train ─────────────────────────────────
// Une étape peut être un transfert ferroviaire (case « déplacement en train »).
// Sa distance n'a pas à être saisie : elle se déduit de la trace GPX si elle
// existe, sinon des deux gares du trajet, sinon du saut entre la dernière
// position connue et celle de l'étape.
const { haversineKm } = require('../lib/distance');

// Sinuosité ferroviaire : une voie ferrée ne va jamais tout droit (vallées,
// gares intermédiaires, contournements des massifs). Sur les grands trajets
// européens, la longueur réelle vaut environ 1,2 fois la distance à vol
// d'oiseau. Sans cette correction, une distance estimée est systématiquement
// trop courte d'un bon cinquième — 230 km annoncés pour un Lyon → Turin qui
// en fait 310 par le rail.
const RAIL_DETOUR = 1.2;

// Coordonnées exploitables, ou null. Sert aussi bien aux champs du formulaire
// (chaînes) qu'aux étapes déjà enregistrées (nombres).
function toPoint(lat, lon) {
  const la = parseFloat(lat), lo = parseFloat(lon);
  if (!isFinite(la) || !isFinite(lo)) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { lat: la, lon: lo };
}

// Longueur estimée d'un trajet ferroviaire entre deux points, arrondie à
// 100 m. Renvoie 0 si l'un des deux points manque.
function railKmBetween(a, b) {
  if (!a || !b) return 0;
  const km = haversineKm(a.lat, a.lon, b.lat, b.lon) * RAIL_DETOUR;
  return Math.round(km * 10) / 10;
}

// Dernière étape localisée avant une date donnée (l'étape elle-même exclue).
function previousLocatedPost(posts, dateISO, excludeId) {
  const when = new Date(dateISO).getTime();
  return posts
    .filter(p => p.id !== excludeId && p.type !== 'preparation'
      && p.lat != null && p.lon != null && new Date(p.date).getTime() < when)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
}

// Distance d'un transfert ferroviaire, de la source la plus fiable à la plus
// approximative :
//  'manual'   → valeur saisie (elle prime toujours)
//  'gpx'      → longueur de la trace jointe à l'étape
//  'stations' → estimation entre les deux gares choisies dans l'autocomplétion
//  'points'   → estimation entre la position précédente et l'arrivée
// Les deux estimations mesurent un trajet ferroviaire, pas une ligne droite :
// elles passent par railKmBetween (voir RAIL_DETOUR).
// Renvoie { km, source, from } — `from` est l'étape de départ retenue, pour
// pouvoir nommer le trajet.
function computeTrainTrip({ isTransfer, manualKm, gpxKm, posts, dateISO, lat, lon, excludeId, stops }) {
  // La case fait foi : les champs du bloc replié (kilométrage, gares) ne
  // comptent pas, sinon une saisie abandonnée créerait un trajet fantôme.
  if (!isTransfer) return { km: 0, source: '', from: null };

  const typed = Math.max(0, parseFloat(manualKm) || 0);
  if (typed > 0) return { km: typed, source: 'manual', from: null };

  if (gpxKm > 0) return { km: Math.round(gpxKm * 10) / 10, source: 'gpx', from: null };

  // Gares saisies : le trajet se mesure de quai à quai. C'est la seule mesure
  // juste dès que l'étape ne commence pas là où le train est pris (on a roulé
  // jusqu'à la gare) ou ne finit pas là où il est quitté (on a roulé, ou
  // dormi, loin de la gare d'arrivée).
  const board  = stops ? toPoint(stops.fromLat, stops.fromLon) : null;
  const alight = (stops ? toPoint(stops.toLat, stops.toLon) : null) || toPoint(lat, lon);

  if (board && alight) {
    const km = railKmBetween(board, alight);
    if (km > 0) return { km, source: 'stations', from: null };
  }

  // Sinon on retombe sur les positions connues : dernière étape localisée →
  // gare d'arrivée si elle est renseignée, à défaut point de l'étape.
  const from = previousLocatedPost(posts, dateISO, excludeId);
  if (from && alight) {
    const km = railKmBetween(toPoint(from.lat, from.lon), alight);
    if (km > 0) return { km, source: 'points', from };
  }
  return { km: 0, source: '', from: null };
}

// On ne garde que la ville (« Turin, Piémont, Italie » → « Turin »).
const cityOf = s => String(s || '').split(',')[0].trim();

// Libellé « Départ → Arrivée ». Les deux gares sont saisies par l'auteur ; on
// se rabat sur les lieux connus (étape précédente, lieu d'arrivée) pour celle
// qui reste vide, et on n'affiche rien tant qu'il manque un bout du trajet.
function trainLabelFromStops(from, to) {
  const start = cityOf(from);
  const end   = cityOf(to);
  if (!start || !end) return '';
  return `${start} → ${end}`.substring(0, 120);
}

// Lieu d'une étape, tel qu'on l'utilise comme gare de départ par défaut.
function postPlace(post) {
  return (post && (post.location || post.title) || '').trim();
}

// Gares saisies dans le bloc « déplacement en train », avec les coordonnées
// posées par l'autocomplétion. Case décochée, le bloc est replié : ce qui y
// traîne encore n'est pas repris. Une coordonnée sans nom de gare est ignorée :
// elle ne peut venir que d'un champ vidé à la main.
function parseTrainStops(body, isTransfer) {
  const empty = { from: '', to: '', fromLat: null, fromLon: null, toLat: null, toLon: null };
  if (!isTransfer) return empty;
  const from = (body.trainFrom || '').toString().trim().substring(0, 120);
  const to   = (body.trainTo   || '').toString().trim().substring(0, 120);
  const a = from ? toPoint(body.trainFromLat, body.trainFromLon) : null;
  const b = to   ? toPoint(body.trainToLat,   body.trainToLon)   : null;
  return {
    from, to,
    fromLat: a ? a.lat : null, fromLon: a ? a.lon : null,
    toLat:   b ? b.lat : null, toLon:   b ? b.lon : null,
  };
}

// Ancien format : le trajet était saisi d'un seul tenant (« Lyon → Turin »).
// Sert à pré-remplir les champs départ / arrivée des étapes déjà publiées.
function splitTrainLabel(label) {
  const parts = String(label || '').split('→');
  return { from: (parts[0] || '').trim(), to: (parts[1] || '').trim() };
}

module.exports = {
  RAIL_DETOUR, railKmBetween, previousLocatedPost, computeTrainTrip,
  trainLabelFromStops, parseTrainStops, postPlace, splitTrainLabel,
};
