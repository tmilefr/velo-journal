const fs = require('fs');
const { fetchElevations, cumulativeDplus } = require('./elevation');

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
      const R = 6371000;
      const dLat = (pts[i].lat - pts[i-1].lat) * Math.PI / 180;
      const dLon = (pts[i].lon - pts[i-1].lon) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2
        + Math.cos(pts[i-1].lat*Math.PI/180) * Math.cos(pts[i].lat*Math.PI/180) * Math.sin(dLon/2)**2;
      dist += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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

module.exports = { parseGpxStats };
