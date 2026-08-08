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
  const typed = Math.max(0, parseFloat(manualKm) || 0);
  if (typed > 0) return { km: typed, source: 'manual', from: null };
  if (!isTransfer) return { km: 0, source: '', from: null };

  if (gpxKm > 0) return { km: Math.round(gpxKm * 10) / 10, source: 'gpx', from: null };

  const from = previousLocatedPost(posts, dateISO, excludeId);
  if (from && lat != null && lon != null) {
    const km = haversineKm(from.lat, from.lon, lat, lon);
    if (km > 0) return { km: Math.round(km * 10) / 10, source: 'points', from };
  }
  return { km: 0, source: '', from: null };
}

// Libellé « Départ → Arrivée » déduit des lieux, quand l'auteur n'en donne pas.
function autoTrainLabel(from, location) {
  const start = (from && (from.location || from.title) || '').trim();
  const end   = (location || '').trim();
  if (!start || !end) return '';
  // On ne garde que la ville (« Turin, Piémont, Italie » → « Turin »).
  const city = s => s.split(',')[0].trim();
  return `${city(start)} → ${city(end)}`.substring(0, 120);
}

module.exports = { previousLocatedPost, computeTrainTrip, autoTrainLabel };
