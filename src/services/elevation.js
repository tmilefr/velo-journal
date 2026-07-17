// ── Service d'élévation (Open-Meteo) ──────────────────
// Récupère l'altitude d'une liste de points {lat, lon} via l'API publique
// Open-Meteo, par lots de 100 points. Renvoie un tableau d'altitudes
// (mètres) dans le même ordre, ou null en cas d'échec total.
const ELEVATION_API = 'https://api.open-meteo.com/v1/elevation';

async function fetchElevations(points) {
  if (!points || !points.length) return null;
  if (typeof fetch !== 'function') {
    console.warn('[elevation] fetch indisponible (Node < 18) — D+ non calculable via API');
    return null;
  }
  const BATCH = 100; // Open-Meteo : max 100 coordonnées par requête
  const out = [];
  for (let i = 0; i < points.length; i += BATCH) {
    const slice = points.slice(i, i + BATCH);
    const lats = slice.map(p => p.lat.toFixed(6)).join(',');
    const lons = slice.map(p => p.lon.toFixed(6)).join(',');
    const url  = ELEVATION_API + '?latitude=' + lats + '&longitude=' + lons;
    try {
      const ctrl = new AbortController();
      const to   = setTimeout(() => ctrl.abort(), 15000);
      const resp = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl.signal });
      clearTimeout(to);
      if (!resp.ok) { console.warn('[elevation] HTTP ' + resp.status); return null; }
      const data = await resp.json();
      if (!data || !Array.isArray(data.elevation)) { console.warn('[elevation] réponse inattendue'); return null; }
      for (const e of data.elevation) out.push(e);
    } catch(e) {
      console.warn('[elevation] échec lot ' + (i / BATCH) + ' : ' + (e.message || e));
      return null;
    }
  }
  return out.length === points.length ? out : null;
}

// Calcule le D+ cumulé à partir d'une liste d'altitudes (avec petit seuil
// anti-bruit de 1 m pour éviter de gonfler le dénivelé sur données lissées).
function cumulativeDplus(eles, threshold = 1) {
  let dplus = 0;
  for (let i = 1; i < eles.length; i++) {
    const a = eles[i], b = eles[i-1];
    if (!isNaN(a) && !isNaN(b) && a - b > threshold) dplus += a - b;
  }
  return Math.round(dplus);
}

module.exports = { fetchElevations, cumulativeDplus };
