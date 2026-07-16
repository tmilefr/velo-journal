// ── Dates & fuseaux horaires ──────────────────────────────
// Helpers de conversion et de formatage (Europe/Paris).

// Convertit une valeur "datetime-local" (YYYY-MM-DDTHH:MM, saisie en heure de Paris)
// en ISO UTC correct. `new Date('YYYY-MM-DDTHH:MM')` interprète la chaîne comme UTC,
// d'où le décalage de 1 ou 2 h selon l'heure d'été/hiver de Paris.
function parisLocalToISO(local) {
  if (!local) return null;
  const m = String(local).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) {
    const d = new Date(local);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [, y, mo, da, h, mi] = m.map(Number);
  // On suppose d'abord que la saisie est en UTC, puis on calcule le décalage
  // réel de Paris à cet instant et on le retranche.
  const guessUTC = Date.UTC(y, mo - 1, da, h, mi);
  // Décalage de Paris (en minutes) à cet instant approximatif
  const offsetMin = parisOffsetMinutes(new Date(guessUTC));
  return new Date(guessUTC - offsetMin * 60000).toISOString();
}

// Décalage UTC de l'Europe/Paris (en minutes) pour une date donnée (+60 ou +120)
function parisOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date);
  const p = {};
  parts.forEach(x => { p[x.type] = x.value; });
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  });
}
function formatDateShort(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric', month: 'long', year: 'numeric'
  });
}
function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d);
  const p = {};
  parts.forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function nowDatetimeLocal() {
  return isoToDatetimeLocal(new Date().toISOString());
}
function formatMonthLabel(key) { // 'YYYY-MM' -> 'septembre 2025'
  const [y, m] = key.split('-');
  const d = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, 1));
  return d.toLocaleDateString('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
}

module.exports = {
  parisLocalToISO, parisOffsetMinutes,
  formatDate, formatDateShort, formatMonthLabel,
  isoToDatetimeLocal, nowDatetimeLocal,
};
