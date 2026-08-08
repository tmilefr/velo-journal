const fs = require('fs');
const { fetchElevations, cumulativeDplus } = require('./elevation');
const { haversineMeters } = require('../lib/distance');

// Points d'une trace GPX, dans l'ordre. Renvoie [] si le fichier est illisible.
function readTrackPoints(gpxAbsPath) {
  try {
    const txt = fs.readFileSync(gpxAbsPath, 'utf8');
    return [...txt.matchAll(/<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g)]
      .map(m => ({ lat: parseFloat(m[1]), lon: parseFloat(m[2]) }))
      .filter(p => !isNaN(p.lat) && !isNaN(p.lon));
  } catch(e) { return []; }
}

// Trace échantillonnée + distance cumulée, pour situer un point de la trace
// dans le voyage (découpage par pays). `maxPoints` borne la résolution : la
// distance cumulée reste celle de la trace complète, seuls les points
// intermédiaires sont éclaircis.
function parseGpxTrack(gpxAbsPath, maxPoints = 64) {
  const pts = readTrackPoints(gpxAbsPath);
  if (pts.length < 2) return null;

  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(pts[i-1].lat, pts[i-1].lon, pts[i].lat, pts[i].lon) / 1000);
  }

  const step = Math.max(1, Math.ceil(pts.length / maxPoints));
  const idx  = [];
  for (let i = 0; i < pts.length; i += step) idx.push(i);
  if (idx[idx.length - 1] !== pts.length - 1) idx.push(pts.length - 1);

  return {
    points:  idx.map(i => pts[i]),
    cumKm:   idx.map(i => cum[i]),
    totalKm: cum[cum.length - 1],
  };
}

// ── Parsing GPX côté serveur ──────────────────────────────
// Async : si le GPX ne contient pas de balises <ele> et useElevationApi=true,
// interroge Open-Meteo pour obtenir le D+. Renvoie aussi dplusSource :
//  'gpx'  → altitude présente dans le fichier
//  'api'  → altitude récupérée via Open-Meteo
//  'none' → aucune altitude disponible (dplus = 0)
async function parseGpxStats(gpxAbsPath, useElevationApi = false) {
  try {
    const txt = fs.readFileSync(gpxAbsPath, 'utf8');
    const pts = [...txt.matchAll(/<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g)]
      .map(m => ({ lat: parseFloat(m[1]), lon: parseFloat(m[2]) }))
      .filter(p => !isNaN(p.lat) && !isNaN(p.lon));
    if (pts.length < 1) return null;

    // élévations présentes dans le fichier (dans l'ordre, peuvent être absentes)
    const eles = [...txt.matchAll(/<ele>([^<]+)<\/ele>/g)].map(m => parseFloat(m[1]));

    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      dist += haversineMeters(pts[i-1].lat, pts[i-1].lon, pts[i].lat, pts[i].lon);
    }

    let dplus = 0;
    let dplusSource = 'none';

    if (eles.length >= 2 && eles.filter(v => !isNaN(v)).length >= 2) {
      // Cas normal : altitude dans le GPX
      dplus = cumulativeDplus(eles, 0);
      dplusSource = 'gpx';
    } else if (useElevationApi && pts.length >= 2) {
      // Fallback : pas d'altitude dans le fichier → on interroge Open-Meteo.
      // Sous-échantillonnage à ~200 points max pour limiter le nb de requêtes
      // et le bruit (l'API renvoie des altitudes lissées au pas du MNT).
      const MAX = 200;
      const sample = pts.length > MAX
        ? pts.filter((_, i) => i % Math.ceil(pts.length / MAX) === 0)
        : pts.slice();
      if (sample[sample.length - 1] !== pts[pts.length - 1]) sample.push(pts[pts.length - 1]);
      const apiEles = await fetchElevations(sample);
      if (apiEles) {
        dplus = cumulativeDplus(apiEles, 1);
        dplusSource = 'api';
      }
    }

    const last = pts[pts.length - 1];
    return {
      km: Math.round((dist / 1000) * 10) / 10,
      dplus,
      dplusSource,
      lat: last.lat,
      lon: last.lon,
    };
  } catch(e) { return null; }
}

module.exports = { parseGpxStats, parseGpxTrack, readTrackPoints };
