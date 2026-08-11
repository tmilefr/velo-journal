// ── Couchage : lieu où l'on dort à l'étape + commentaire ──

const SLEEP_LABEL_MAX   = 120;
const SLEEP_COMMENT_MAX = 800;

// Une case à cocher a-t-elle été envoyée cochée ?
function checked(v) {
  const val = Array.isArray(v) ? v[v.length - 1] : v;
  return val === '1' || val === 'on' || val === 'true' || val === true;
}

// Reconstruit l'objet couchage depuis le corps de formulaire.
// Champs attendus : sleepSet (case à cocher), sleepLocation, sleepLat,
// sleepLon, sleepComment. Le formulaire envoie toujours sleepForm=1 : sur ces
// envois, la case fait foi — décochée, le couchage est retiré même si les
// champs cachés du bloc replié sont restés remplis. Sans ce marqueur (envoi
// hors formulaire), on retombe sur l'ancien comportement : le couchage existe
// dès qu'un lieu ou un commentaire est fourni.
function parseSleep(body) {
  if (checked(body.sleepForm) && !checked(body.sleepSet)) return null;

  const label   = (body.sleepLocation || '').toString().trim().substring(0, SLEEP_LABEL_MAX);
  const comment = (body.sleepComment  || '').toString().trim().substring(0, SLEEP_COMMENT_MAX);
  if (!label && !comment) return null;

  const lat = parseFloat(body.sleepLat);
  const lon = parseFloat(body.sleepLon);
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

  return {
    label,
    comment,
    lat: hasPoint ? lat : null,
    lon: hasPoint ? lon : null,
  };
}

// Le couchage a-t-il quelque chose à afficher ?
function hasSleep(p) {
  return !!(p && p.sleep && (p.sleep.label || p.sleep.comment));
}

module.exports = { parseSleep, hasSleep, SLEEP_LABEL_MAX, SLEEP_COMMENT_MAX };
