// ── Déplacements en train ─────────────────────────────────
// Une étape peut être un transfert ferroviaire (case « déplacement en train »).
// Sa distance n'a pas à être saisie : elle se déduit de la trace GPX si elle
// existe, sinon des deux gares du trajet, sinon du saut entre la dernière
// position connue et celle de l'étape.
const { haversineKm } = require('../lib/distance');
const { findCity } = require('./cities');

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

// Position d'une gare : celle posée par l'autocomplétion si l'auteur a cliqué
// une suggestion, sinon celle de la ville du même nom. Taper « Halle » doit
// suffire — exiger un clic dans une liste, c'est renvoyer silencieusement le
// calcul sur les positions des étapes, qui ne sont pas les gares.
function stationPoint(name, lat, lon, near) {
  const picked = toPoint(lat, lon);
  if (picked) return picked;
  const city = findCity(name, near);
  return city ? { lat: city.lat, lon: city.lon } : null;
}

// La trace jointe à un transfert est-elle celle du train ? Sur un carnet de
// vélo, une trace enregistrée un jour de train est le plus souvent le trajet
// roulé jusqu'à la gare : le GPS reste dans la poche pendant le train. On ne
// la prend donc pour le trajet ferroviaire que si elle relie effectivement les
// deux gares — un bout près de l'une, l'autre bout près de l'autre.
function traceLinksStations(track, board, alight) {
  const pts = (track && track.points) || [];
  if (pts.length < 2 || !board || !alight) return false;
  const first = pts[0], last = pts[pts.length - 1];
  // Tolérance : de quoi couvrir l'écart entre la gare et le centre-ville,
  // proportionnée à la longueur du trajet.
  const near = Math.max(5, haversineKm(board.lat, board.lon, alight.lat, alight.lon) * 0.15);
  return haversineKm(first.lat, first.lon, board.lat,  board.lon)  <= near
      && haversineKm(last.lat,  last.lon,  alight.lat, alight.lon) <= near;
}

// Distance d'un transfert ferroviaire, de la source la plus fiable à la plus
// approximative :
//  'manual'   → valeur saisie (elle prime toujours)
//  'gpx'      → longueur de la trace, quand elle relie bien les deux gares
//  'stations' → estimation entre les deux gares du trajet
//  'points'   → estimation entre la position précédente et l'arrivée
// Les deux estimations mesurent un trajet ferroviaire, pas une ligne droite :
// elles passent par railKmBetween (voir RAIL_DETOUR).
// Renvoie { km, source, from, traceIsRide } — `from` est l'étape de départ
// retenue, pour pouvoir nommer le trajet ; `traceIsRide` dit que la trace
// jointe mesure du vélo et non le train, et doit donc compter comme des
// kilomètres roulés.
function computeTrainTrip({ isTransfer, manualKm, gpxTrack, posts, dateISO, lat, lon, excludeId, stops }) {
  const none = { km: 0, source: '', from: null, traceIsRide: false };
  // La case fait foi : les champs du bloc replié (kilométrage, gares) ne
  // comptent pas, sinon une saisie abandonnée créerait un trajet fantôme.
  if (!isTransfer) return none;

  const gpxKm = gpxTrack ? gpxTrack.totalKm : 0;
  const typed = Math.max(0, parseFloat(manualKm) || 0);

  // Gares du trajet : le train se mesure de quai à quai. C'est la seule mesure
  // juste dès que l'étape ne commence pas là où le train est pris (on a roulé
  // jusqu'à la gare) ou ne finit pas là où il est quitté (on a roulé, ou
  // dormi, loin de la gare d'arrivée). Le point de l'étape sert de repère pour
  // départager les homonymes, et de gare d'arrivée par défaut.
  const here   = toPoint(lat, lon);
  const board  = stops ? stationPoint(stops.from, stops.fromLat, stops.fromLon, here) : null;
  const alight = (stops ? stationPoint(stops.to, stops.toLat, stops.toLon, here) : null) || here;

  // Une trace qui relie les deux gares est le trajet lui-même : rien ne le
  // mesure mieux. Sans gare de départ connue, on n'a rien pour en juger et on
  // s'en remet à elle comme avant.
  const traceIsTrip = gpxKm > 0 && (!board || traceLinksStations(gpxTrack, board, alight));
  const traceIsRide = gpxKm > 0 && !traceIsTrip;

  if (typed > 0)    return { km: typed, source: 'manual', from: null, traceIsRide };
  if (traceIsTrip)  return { km: Math.round(gpxKm * 10) / 10, source: 'gpx', from: null, traceIsRide: false };

  if (board && alight) {
    const km = railKmBetween(board, alight);
    if (km > 0) return { km, source: 'stations', from: null, traceIsRide };
  }

  // Sinon on retombe sur les positions connues : dernière étape localisée →
  // gare d'arrivée si elle est renseignée, à défaut point de l'étape.
  const from = previousLocatedPost(posts, dateISO, excludeId);
  if (from && alight) {
    const km = railKmBetween(toPoint(from.lat, from.lon), alight);
    if (km > 0) return { km, source: 'points', from, traceIsRide };
  }
  return { ...none, traceIsRide };
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
