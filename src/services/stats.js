// ── Statistiques de roulage ───────────────────────────────

function totalKm(posts) {
  return posts.reduce((s, p) => s + (parseFloat(p.km) || 0), 0);
}
function totalDPlus(posts) {
  return posts.reduce((s, p) => s + (parseInt(p.dplus) || 0), 0);
}

// Synthèse des dépenses regroupées par mois (YYYY-MM en Europe/Paris)
function distanceByMonth(posts) {
  const map = {};
  posts.forEach(p => {
    if (p.type === 'preparation') return;
    const km = parseFloat(p.km) || 0;
    if (km <= 0) return;
    const d = new Date(p.date);
    const key = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).format(d);
    if (!map[key]) map[key] = { totalKm: 0, totalDplus: 0, days: [] };
    map[key].totalKm += km;
    map[key].totalDplus += (parseInt(p.dplus) || 0);
    map[key].days.push({ date: p.date, km, dplus: parseInt(p.dplus) || 0, title: p.title || p.location || '' });
  });
  Object.values(map).forEach(m => m.days.sort((a, b) => new Date(a.date) - new Date(b.date)));
  return map;
}

// Calcule les statistiques de roulage.
// On exclut le départ et les jours sans kilométrage :
// seuls les jours avec km > 0 comptent comme "jours roulés".
function computeStats(posts) {
  const etapes = posts.filter(p => p.type !== 'preparation');
  // jours réellement roulés (km > 0) — exclut le départ « jour 0 » et les jours de repos/sans distance
  const ridingDays = etapes
    .filter(p => (parseFloat(p.km) || 0) > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const km    = ridingDays.reduce((s, p) => s + (parseFloat(p.km) || 0), 0);
  const dplus = ridingDays.reduce((s, p) => s + (parseInt(p.dplus) || 0), 0);
  const nDays = ridingDays.length;

  const kmValues = ridingDays.map(p => parseFloat(p.km) || 0);
  const maxKm    = kmValues.length ? Math.max(...kmValues) : 0;
  const minKm    = kmValues.length ? Math.min(...kmValues) : 0;
  const maxKmDay = ridingDays.find(p => (parseFloat(p.km) || 0) === maxKm) || null;

  const dplusValues = ridingDays.map(p => parseInt(p.dplus) || 0);
  const maxDplus    = dplusValues.length ? Math.max(...dplusValues) : 0;
  const maxDplusDay = ridingDays.find(p => (parseInt(p.dplus) || 0) === maxDplus) || null;

  // durée calendaire (du 1er au dernier jour roulé, bornes incluses)
  let spanDays = nDays;
  let restDays = 0;
  if (nDays >= 2) {
    const first = new Date(ridingDays[0].date);
    const last  = new Date(ridingDays[nDays - 1].date);
    const dayMs = 24 * 60 * 60 * 1000;
    const d0 = Date.UTC(first.getFullYear(), first.getMonth(), first.getDate());
    const d1 = Date.UTC(last.getFullYear(),  last.getMonth(),  last.getDate());
    spanDays = Math.round((d1 - d0) / dayMs) + 1;
    restDays = Math.max(0, spanDays - nDays);
  }

  return {
    nDays,
    spanDays,
    restDays,
    km,
    dplus,
    avgKm:    nDays ? km / nDays : 0,
    avgDplus: nDays ? dplus / nDays : 0,
    maxKm,
    minKm,
    maxKmDay,
    maxDplus,
    maxDplusDay,
    nExcluded: etapes.length - nDays, // étapes ignorées (départ, repos, km nuls)
  };
}

module.exports = { totalKm, totalDPlus, distanceByMonth, computeStats };
