// ── Villes de référence ───────────────────────────────────
// public/geo/cities.json embarque 9 648 villes (nom, latitude, longitude,
// milliers d'habitants, capitale), triées de la plus peuplée à la moins
// peuplée. L'affiche s'en sert pour étiqueter la carte ; on s'en sert ici pour
// situer un lieu écrit à la main — typiquement une gare saisie sans passer par
// l'autocomplétion. Aucun appel réseau, aucune attente : le fichier est lu une
// fois puis gardé en mémoire.
const fs   = require('fs');
const path = require('path');
const { PUBLIC_DIR } = require('../config');
const { haversineKm } = require('../lib/distance');

const CITIES_FILE = path.join(PUBLIC_DIR, 'geo', 'cities.json');

// Comparaison des noms : sans accents, sans casse, sans ponctuation. Les noms
// de GeoNames sont dans la langue du pays et portent parfois une précision
// entre parenthèses — « Halle (Saale) » devient « halle saale », qu'on
// retrouve donc en tapant simplement « Halle ».
function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

let cities = null;
function load() {
  if (cities) return cities;
  try {
    const rows = JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
    cities = rows.map(r => ({ name: r[0], n: normalize(r[0]), lat: r[1], lon: r[2] }));
  } catch(e) {
    console.warn('[cities] liste des villes illisible : ' + (e.message || e));
    cities = [];
  }
  return cities;
}

// Position d'un lieu écrit à la main, ou null.
//   « Berlin »                        → Berlin
//   « Halle »                         → Halle (Saale)
//   « Halle (Saale), Allemagne »      → Halle (Saale)
//   « Paris Gare de Lyon »            → Paris (et non Lyon : seul un nom de
//                                       ville en tête de saisie est retenu)
// `near` (optionnel) départage les homonymes : la plus proche de ce point
// l'emporte, à défaut la plus peuplée (la liste est déjà dans cet ordre).
function findCity(name, near) {
  // L'autocomplétion écrit « Ville, Région, Pays » : seul le premier morceau
  // nomme la ville.
  const q = normalize(String(name || '').split(',')[0]);
  if (q.length < 3) return null;

  const rows = load();
  // Un nom exact ne se discute pas : « Berlin » est Berlin, pas Berlin Köpenick.
  let found = rows.filter(c => c.n === q);
  if (!found.length) {
    // Sinon on accepte qu'il manque ou qu'il traîne une précision, à condition
    // qu'elle suive le nom de la ville : « halle » ↔ « halle saale ».
    found = rows.filter(c => c.n.startsWith(q + ' ') || q.startsWith(c.n + ' '));
  }
  if (!found.length) return null;

  const best = (near && found.length > 1)
    ? found.slice().sort((a, b) =>
        haversineKm(near.lat, near.lon, a.lat, a.lon) - haversineKm(near.lat, near.lon, b.lat, b.lon))[0]
    : found[0];
  return { name: best.name, lat: best.lat, lon: best.lon };
}

module.exports = { findCity, normalize };
