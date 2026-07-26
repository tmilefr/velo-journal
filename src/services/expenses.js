// ── Dépenses ──────────────────────────────────────────────

// Catégories et payeurs autorisés pour les dépenses
const EXPENSE_CATEGORIES = ['restaurant', 'hebergement', 'nourriture', 'divers'];
const EXPENSE_PAYERS     = ['julie', 'nico', 'commun'];
const EXPENSE_CAT_LABELS = { restaurant: '\ud83c\udf7d\ufe0f Restaurant', hebergement: '\ud83c\udfe8 H\u00e9bergement', nourriture: '\ud83d\uded2 Nourriture', divers: '\ud83e\uddf3 Divers' };
const EXPENSE_PAYER_LABELS = { julie: '\ud83d\udc69 Julie', nico: '\ud83e\uddd4 Nico', commun: '\ud83d\udc6b Commun' };
// Sous-catégories disponibles pour certaines catégories (clé = catégorie parente)
const EXPENSE_SUBCATEGORIES = { hebergement: ['hotel', 'camping'] };
const EXPENSE_SUBCAT_LABELS = { hotel: '\ud83c\udfe8 H\u00f4tel', camping: '\u26fa Camping' };

// Reconstruit le tableau de dépenses depuis le corps de formulaire
// Champs attendus : exp_cat[], exp_subcat[], exp_payer[], exp_amount[], exp_label[]
function parseExpenses(body) {
  const toArr = v => v === undefined ? [] : (Array.isArray(v) ? v : [v]);
  const cats    = toArr(body.exp_cat);
  const subcats = toArr(body.exp_subcat);
  const payers  = toArr(body.exp_payer);
  const amounts = toArr(body.exp_amount);
  const labels  = toArr(body.exp_label);
  const out = [];
  for (let i = 0; i < amounts.length; i++) {
    const amt = parseFloat(String(amounts[i]).replace(',', '.'));
    if (!amt || amt <= 0) continue;
    const category = EXPENSE_CATEGORIES.includes(cats[i]) ? cats[i] : 'divers';
    const allowedSubs = EXPENSE_SUBCATEGORIES[category] || [];
    const subcategory = allowedSubs.includes(subcats[i]) ? subcats[i] : null;
    out.push({
      category,
      subcategory,
      payer:    EXPENSE_PAYERS.includes(payers[i]) ? payers[i] : 'commun',
      amount:   Math.round(amt * 100) / 100,
      label:    (labels[i] || '').toString().trim().substring(0, 80)
    });
  }
  return out;
}

// Somme totale des dépenses d'un post
function postExpenseTotal(p) {
  return (p.expenses || []).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
}

// Aplatit les dépenses de plusieurs publications en une seule liste de lignes
function flattenExpenses(posts) {
  const items = [];
  posts.forEach(p => {
    (p.expenses || []).forEach(e => {
      items.push({
        amount:      parseFloat(e.amount) || 0,
        payer:       e.payer,
        category:    e.category,
        subcategory: e.subcategory || null,
        label:       e.label || '',
        date:        p.date,
        postId:      p.id,
        postTitle:   p.title || p.location || ''
      });
    });
  });
  return items;
}

// Agrège une liste de lignes de dépenses : total, répartition par catégorie
// (+ sous-catégorie), par payeur, et détail des lignes pour chaque regroupement
function aggregateExpenses(items) {
  const agg = { total: 0, byCat: {}, byCatSub: {}, byPayer: {}, itemsByCat: {}, itemsByPayer: {} };
  items.forEach(it => {
    agg.total += it.amount;
    agg.byCat[it.category] = (agg.byCat[it.category] || 0) + it.amount;
    agg.byPayer[it.payer]  = (agg.byPayer[it.payer]  || 0) + it.amount;
    if (it.subcategory) {
      if (!agg.byCatSub[it.category]) agg.byCatSub[it.category] = {};
      agg.byCatSub[it.category][it.subcategory] = (agg.byCatSub[it.category][it.subcategory] || 0) + it.amount;
    }
    if (!agg.itemsByCat[it.category]) agg.itemsByCat[it.category] = [];
    agg.itemsByCat[it.category].push(it);
    if (!agg.itemsByPayer[it.payer]) agg.itemsByPayer[it.payer] = [];
    agg.itemsByPayer[it.payer].push(it);
  });
  Object.values(agg.itemsByCat).forEach(arr => arr.sort((a, b) => new Date(a.date) - new Date(b.date)));
  Object.values(agg.itemsByPayer).forEach(arr => arr.sort((a, b) => new Date(a.date) - new Date(b.date)));
  return agg;
}

// Synthèse des dépenses regroupées par mois (YYYY-MM en Europe/Paris)
function expensesByMonth(posts) {
  const itemsByMonth = {};
  posts.forEach(p => {
    if (!p.expenses || !p.expenses.length) return;
    const d = new Date(p.date);
    const key = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).format(d); // YYYY-MM
    if (!itemsByMonth[key]) itemsByMonth[key] = [];
    itemsByMonth[key].push(...flattenExpenses([p]));
  });
  const map = {};
  Object.keys(itemsByMonth).forEach(key => { map[key] = aggregateExpenses(itemsByMonth[key]); });
  return map;
}

// Synthèse globale des dépenses, toutes publications confondues
function expensesSummary(posts) {
  return aggregateExpenses(flattenExpenses(posts));
}

module.exports = {
  EXPENSE_CATEGORIES, EXPENSE_PAYERS,
  EXPENSE_CAT_LABELS, EXPENSE_PAYER_LABELS,
  EXPENSE_SUBCATEGORIES, EXPENSE_SUBCAT_LABELS,
  parseExpenses, postExpenseTotal, expensesByMonth, expensesSummary,
};
