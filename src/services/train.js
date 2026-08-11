// ── Déplacements en train ─────────────────────────────────
// Une étape peut être un transfert ferroviaire (case « déplacement en train »).
// Sa distance n'a pas à être saisie : elle se déduit de la trace GPX si elle
// existe, sinon du saut entre la dernière position connue et celle de l'étape.
const { haversineKm } = require('../lib/distance');

// Dernière étape localisée avant une date donnée (l'étape elle-même exclue).
function previousLocatedPost(posts, dateISO, excludeId) {
  const when = new Date(dateISO).getTime();
  return posts
    .filter(p => p.id !== excludeId && p.type !== 'preparation'
      && p.lat != null && p.lon != null && new Date(p.date).getTime() < when)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
}

// Distance d'un transfert ferroviaire.
//  'manual' → valeur saisie (elle prime toujours)
//  'gpx'    → longueur de la trace jointe à l'étape
//  'points' → distance à vol d'oiseau entre la position précédente et l'arrivée
// Renvoie { km, source, from } — `from` est l'étape de départ retenue, pour
// pouvoir nommer le trajet.
function computeTrainTrip({ isTransfer, manualKm, gpxKm, posts, dateISO, lat, lon, excludeId }) {
  // La case fait foi : les champs du bloc replié (kilométrage, gares) ne
  // comptent pas, sinon une saisie abandonnée créerait un trajet fantôme.
  if (!isTransfer) return { km: 0, source: '', from: null };

  const typed = Math.max(0, parseFloat(manualKm) || 0);
  if (typed > 0) return { km: typed, source: 'manual', from: null };

  if (gpxKm > 0) return { km: Math.round(gpxKm * 10) / 10, source: 'gpx', from: null };

  const from = previousLocatedPost(posts, dateISO, excludeId);
  if (from && lat != null && lon != null) {
    const km = haversineKm(from.lat, from.lon, lat, lon);
    if (km > 0) return { km: Math.round(km * 10) / 10, source: 'points', from };
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

// Gares saisies dans le bloc « déplacement en train ». Case décochée, le bloc
// est replié : ce qui y traîne encore n'est pas repris.
function parseTrainStops(body, isTransfer) {
  if (!isTransfer) return { from: '', to: '' };
  return {
    from: (body.trainFrom || '').toString().trim().substring(0, 120),
    to:   (body.trainTo   || '').toString().trim().substring(0, 120),
  };
}

// Ancien format : le trajet était saisi d'un seul tenant (« Lyon → Turin »).
// Sert à pré-remplir les champs départ / arrivée des étapes déjà publiées.
function splitTrainLabel(label) {
  const parts = String(label || '').split('→');
  return { from: (parts[0] || '').trim(), to: (parts[1] || '').trim() };
}

module.exports = { previousLocatedPost, computeTrainTrip, trainLabelFromStops, parseTrainStops, postPlace, splitTrainLabel };
