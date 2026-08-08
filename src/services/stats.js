// ── Statistiques de roulage ───────────────────────────────
const { parisDayNumber, postEndISO } = require('../lib/dates');
const { postGeo } = require('./geo');

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

  // durée calendaire (du 1er jour roulé au dernier jour couvert, bornes incluses).
  // Une étape peut s'étaler sur plusieurs jours (date de fin) : ses jours
  // supplémentaires ne sont pas roulés et gonflent donc la période et les jours
  // de repos, mais pas le nombre de jours roulés (nDays).
  let spanDays = nDays;
  let restDays = 0;
  if (nDays >= 1) {
    const firstDay = Math.min(...ridingDays.map(p => parisDayNumber(p.date)));
    const lastDay  = Math.max(...ridingDays.map(p => parisDayNumber(postEndISO(p))));
    spanDays = lastDay - firstDay + 1;
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

// ── Déplacements en train ─────────────────────────────────
// Les kilomètres de train (champ `trainKm`) sont comptés à part : ils ne
// gonflent ni les km roulés, ni les moyennes, ni les jours roulés. Ils ne
// comptent que dans le « trajet parcouru » total du voyage.
function trainStats(posts) {
  const trips = posts
    .filter(p => p.type !== 'preparation' && (parseFloat(p.trainKm) || 0) > 0)
    .map(p => ({
      date:  p.date,
      km:    parseFloat(p.trainKm) || 0,
      label: (p.trainLabel || '').trim(),
      title: p.title || p.location || '',
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const km      = trips.reduce((s, t) => s + t.km, 0);
  const maxKm   = trips.length ? Math.max(...trips.map(t => t.km)) : 0;
  const longest = trips.find(t => t.km === maxKm) || null;
  return { trips, km, count: trips.length, maxKm, longest };
}

// Distance totale du voyage : vélo + train.
function travelTotals(posts) {
  const bikeKm  = totalKm(posts.filter(p => p.type !== 'preparation'));
  const train   = trainStats(posts);
  return { bikeKm, trainKm: train.km, totalKm: bikeKm + train.km, trainCount: train.count };
}

// ── Kilométrage par pays, puis par région ─────────────────
// Le kilométrage d'une étape est attribué au pays / à la région de son point
// d'arrivée : une étape à cheval sur une frontière compte donc entièrement
// pour le pays où elle se termine.
function distanceByCountry(posts) {
  const map = {};
  posts.forEach(p => {
    if (p.type === 'preparation') return;
    const km      = parseFloat(p.km) || 0;
    const trainKm = parseFloat(p.trainKm) || 0;
    const dplus   = parseInt(p.dplus) || 0;
    if (km <= 0 && trainKm <= 0) return;

    const { country, region, countryCode } = postGeo(p);
    if (!map[country]) {
      map[country] = { country, countryCode, totalKm: 0, trainKm: 0, totalDplus: 0, ridingDays: 0, regions: {} };
    }
    const c = map[country];
    if (!c.countryCode && countryCode) c.countryCode = countryCode;
    c.totalKm    += km;
    c.trainKm    += trainKm;
    c.totalDplus += dplus;
    if (km > 0) c.ridingDays++;

    if (!c.regions[region]) c.regions[region] = { region, totalKm: 0, trainKm: 0, totalDplus: 0, ridingDays: 0, stages: [] };
    const r = c.regions[region];
    r.totalKm    += km;
    r.trainKm    += trainKm;
    r.totalDplus += dplus;
    if (km > 0) r.ridingDays++;
    r.stages.push({ date: p.date, km, trainKm, dplus, title: p.title || p.location || '' });
  });

  Object.values(map).forEach(c => {
    Object.values(c.regions).forEach(r => r.stages.sort((a, b) => new Date(a.date) - new Date(b.date)));
  });
  return map;
}

module.exports = {
  totalKm, totalDPlus, distanceByMonth, computeStats,
  trainStats, travelTotals, distanceByCountry,
};
