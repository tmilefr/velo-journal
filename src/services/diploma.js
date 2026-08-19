// ── Diplôme d'un compagnon de route ───────────────────────
// Quelqu'un rejoint le voyage en cours de route (Margot à Nuremberg…) : ses
// chiffres à elle ne sont pas ceux du voyage entier. Ce service retrouve
// l'étape où la personne est montée en selle, puis recalcule les statistiques
// de roulage sur la seule portion parcourue ensemble — et les traduit en
// comparaisons parlantes et en badges, de quoi remplir un diplôme.
const { computeStats, trainStats, travelTotals, distanceByCountry } = require('./stats');
const { flagEmoji } = require('./geo');

// Comparaison de chaînes insensible aux accents et à la casse
const normalize = s => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim();

// Un lieu s'écrit rarement pareil des deux côtés de la frontière : le nom
// français et le nom local désignent la même ville, et l'étape peut porter
// l'un ou l'autre.
const CITY_ALIASES = [
  ['nuremberg', 'nurnberg'],
  ['munich', 'munchen'],
  ['cologne', 'koln'],
  ['vienne', 'wien'],
  ['prague', 'praha'],
  ['venise', 'venezia'],
  ['florence', 'firenze'],
  ['milan', 'milano'],
  ['turin', 'torino'],
  ['genes', 'genova'],
  ['rome', 'roma'],
  ['naples', 'napoli'],
  ['lisbonne', 'lisboa'],
  ['seville', 'sevilla'],
  ['copenhague', 'kobenhavn'],
  ['varsovie', 'warszawa'],
  ['bucarest', 'bucuresti'],
  ['athenes', 'athina'],
];

// Toutes les graphies connues d'un lieu donné (la sienne, plus ses alias)
function placeNeedles(place) {
  const n = normalize(place);
  if (!n) return [];
  const group = CITY_ALIASES.find(g => g.includes(n));
  return group ? group.slice() : [n];
}

// Étapes du voyage (hors préparation), du départ à l'arrivée
function stageList(posts) {
  return posts
    .filter(p => p.type !== 'preparation')
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Le lieu d'une étape, tel qu'on l'écrirait sur un diplôme : le libellé saisi,
// amputé de la région et du pays (« Nuremberg, Bavière, Allemagne »).
function stagePlace(p) {
  const loc = String(p.location || '').split(',')[0].trim();
  return loc || String(p.title || '').trim();
}

// Retrouve l'étape où quelqu'un a rejoint le voyage. On cherche le nom du lieu
// dans ce qui peut le porter — le lieu de l'étape, son titre, le libellé du
// trajet en train qui l'a amenée — et on retient la première qui correspond.
function findJoinStage(posts, place) {
  const needles = placeNeedles(place);
  if (!needles.length) return null;
  return stageList(posts).find(p => {
    const hay = normalize([p.location, p.title, p.trainLabel, p.trainTo, p.trainFrom].filter(Boolean).join(' | '));
    return needles.some(n => hay.includes(n));
  }) || null;
}

// Deux étapes distinctes, et il ne faut pas les confondre :
//   • `join`  — l'étape où la personne a retrouvé le voyage. Ce jour-là, les
//     kilomètres ont été roulés sans elle : ils ne comptent pas pour elle.
//   • `start` — sa première étape à vélo, la première qui entre au compteur.
// L'étape demandée par le formulaire est toujours `start` ; `join` est alors
// celle qui la précède, puisque c'est là qu'on s'est retrouvés.
function resolveStart(posts, { fromId = '', place = '' } = {}) {
  const stages = stageList(posts);
  if (!stages.length) return { start: null, join: null };

  if (fromId) {
    const i = stages.findIndex(p => p.id === fromId);
    if (i >= 0) return { start: stages[i], join: i > 0 ? stages[i - 1] : null };
  }

  const join = findJoinStage(posts, place);
  if (!join) return { start: stages[0], join: null };
  const i = stages.indexOf(join);
  // Retrouvailles le dernier jour du voyage : il n'y a plus rien après, on
  // compte alors cette étape-là plutôt que de rendre un diplôme vide.
  return { start: stages[i + 1] || join, join: stages[i + 1] ? join : null };
}

// ── Comparaisons parlantes ────────────────────────────────
// Des kilomètres et des mètres de dénivelé, ça ne dit pas grand-chose à
// hauteur d'enfant : on les retraduit en tours Eiffel et en boules de glace.
const EIFFEL_M      = 324;    // hauteur de la tour Eiffel, antennes comprises
const MONT_BLANC_M  = 4806;   // sommet du mont Blanc
const MARATHON_KM   = 42.195;
const PEDAL_TURN_M  = 5.5;    // développement d'un tour de pédale, vélo d'enfant
const STADIUM_M     = 400;    // tour de piste
const KCAL_PER_KM   = 25;     // dépense d'un jeune cycliste chargé
const SCOOP_KCAL    = 120;    // une boule de glace
const PARIS_NICE_KM = 930;    // Paris → Nice à vol de guidon

// L'ordre compte : le diplôme n'affiche que les premières comparaisons qui
// tiennent, on met donc devant celles qui font le plus d'effet.
function funFacts({ km, dplus }) {
  return [
    { icon: '🗼', count: dplus / EIFFEL_M,              label: 'fois la tour Eiffel, grimpée à la force des mollets' },
    { icon: '🍦', count: km * KCAL_PER_KM / SCOOP_KCAL, label: 'boules de glace méritées pour l\'énergie dépensée' },
    { icon: '🏃', count: km / MARATHON_KM,              label: 'marathons — mais à vélo, et avec les bagages' },
    { icon: '🔁', count: km * 1000 / PEDAL_TURN_M,      label: 'tours de pédale (à ne surtout pas recompter)' },
    { icon: '🏔️', count: dplus / MONT_BLANC_M,          label: 'fois la montée du mont Blanc, depuis le niveau de la mer' },
    { icon: '🌻', count: km / PARIS_NICE_KM,            label: 'fois la route de Paris à Nice' },
    { icon: '🏟️', count: km * 1000 / STADIUM_M,         label: 'tours de piste autour d\'un stade' },
  ].filter(f => f.count >= 0.9 && isFinite(f.count));
}

// ── Badges ────────────────────────────────────────────────
// Chaque exploit a son échelle : on décerne le plus haut échelon atteint, pour
// qu'il y ait toujours quelque chose à coller sur le diplôme.
const BADGE_LADDERS = [
  { icon: '🛣️', value: s => s.km, tiers: [
    [30,   'Première échappée'], [150, 'Avaleuse de routes'], [400, 'Grande rouleuse'],
    [900,  'Machine à kilomètres'], [2000, 'Légende du guidon'],
  ]},
  { icon: '⛰️', value: s => s.dplus, tiers: [
    [200,  'Chasseuse de bosses'], [1500, 'Grimpeuse'], [4000, 'Chèvre des montagnes'],
    [8848, 'L\'Everest dans les jambes'],
  ]},
  { icon: '🗓️', value: s => s.nDays, tiers: [
    [1, 'Baptême de selle'], [5, 'Une vraie habituée'], [12, 'Endurance à toute épreuve'],
    [25, 'Increvable'],
  ]},
  { icon: '📈', value: s => s.maxKm, tiers: [
    [20, 'Belle journée'], [40, 'Sacrée journée'], [65, 'Journée de championne'], [90, 'Journée de folie'],
  ]},
  { icon: '🌍', value: s => s.countries, tiers: [
    [1, 'Voyageuse'], [2, 'Franchisseuse de frontières'], [3, 'Exploratrice d\'Europe'],
  ]},
];

function badges(metrics) {
  return BADGE_LADDERS.map(l => {
    const v = l.value(metrics) || 0;
    let won = null;
    l.tiers.forEach(([threshold, name]) => { if (v >= threshold) won = name; });
    return won ? { icon: l.icon, name: won } : null;
  }).filter(Boolean);
}

// ── Le diplôme ────────────────────────────────────────────
// Toutes les données de la page : l'étape d'arrivée du compagnon de route, les
// chiffres de sa portion de voyage, ses records, ses comparaisons, ses badges.
function diplomaData(posts, { fromId = '', place = '' } = {}) {
  const stages = stageList(posts);
  const { start, join } = resolveStart(posts, { fromId, place });
  if (!start) return null;

  const startTime = new Date(start.date).getTime();
  const mine = stages.filter(p => new Date(p.date).getTime() >= startTime);

  const s      = computeStats(mine);
  const train  = trainStats(mine);
  const totals = travelTotals(mine);
  const countryList = Object.values(distanceByCountry(mine))
    .sort((a, b) => (b.totalKm + b.trainKm) - (a.totalKm + a.trainKm))
    .map(c => ({ country: c.country, flag: flagEmoji(c.countryCode), km: c.totalKm + c.trainKm }));

  // Les jours roulés, dans l'ordre : de quoi dessiner la frise du bas.
  const days = mine
    .filter(p => (parseFloat(p.km) || 0) > 0)
    .map(p => ({
      date:  p.date,
      km:    parseFloat(p.km) || 0,
      dplus: parseInt(p.dplus, 10) || 0,
      title: p.title || stagePlace(p) || '',
    }));

  const last = mine[mine.length - 1] || start;
  const metrics = { km: s.km, dplus: s.dplus, nDays: s.nDays, maxKm: s.maxKm, countries: countryList.length };

  return {
    stages,                              // toutes les étapes, pour le sélecteur
    start, join, last,
    joinPlace:  join ? stagePlace(join) : '',
    startPlace: stagePlace(start),
    endPlace:   stagePlace(last),
    stats: s,
    train, totals,
    countries: countryList,
    days,
    facts:  funFacts({ km: s.km, dplus: s.dplus }),
    badges: badges(metrics),
  };
}

module.exports = { diplomaData, findJoinStage };
