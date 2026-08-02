// ── Couchage : lieu où l'on dort à l'étape + commentaire ──

const SLEEP_LABEL_MAX   = 120;
const SLEEP_COMMENT_MAX = 800;

// Reconstruit l'objet couchage depuis le corps de formulaire.
// Champs attendus : sleepLocation, sleepLat, sleepLon, sleepComment.
// Renvoie null si ni lieu ni commentaire n'ont été saisis (pas de couchage
// renseigné pour cette étape).
function parseSleep(body) {
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
