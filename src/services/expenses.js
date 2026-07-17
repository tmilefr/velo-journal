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

function expensesByMonth(posts) {
  const map = {};
  posts.forEach(p => {
    if (!p.expenses || !p.expenses.length) return;
    const d = new Date(p.date);
    const key = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).format(d); // YYYY-MM
    if (!map[key]) map[key] = { total: 0, byCat: {}, byPayer: {}, itemsByCat: {} };
    p.expenses.forEach(e => {
      const amt = parseFloat(e.amount) || 0;
      map[key].total += amt;
      map[key].byCat[e.category]   = (map[key].byCat[e.category]   || 0) + amt;
      map[key].byPayer[e.payer]    = (map[key].byPayer[e.payer]    || 0) + amt;
      if (!map[key].itemsByCat[e.category]) map[key].itemsByCat[e.category] = [];
      map[key].itemsByCat[e.category].push({
        amount:    amt,
        payer:     e.payer,
        label:     e.label || '',
        subcategory: e.subcategory || null,
        date:      p.date,
        postId:   p.id,
        postTitle: p.title || p.location || ''
      });
    });
  });
  Object.values(map).forEach(m => {
    Object.values(m.itemsByCat).forEach(arr => arr.sort((a, b) => new Date(a.date) - new Date(b.date)));
  });
  return map;
}

module.exports = {
  EXPENSE_CATEGORIES, EXPENSE_PAYERS,
  EXPENSE_CAT_LABELS, EXPENSE_PAYER_LABELS,
  EXPENSE_SUBCATEGORIES, EXPENSE_SUBCAT_LABELS,
  parseExpenses, postExpenseTotal, expensesByMonth,
};
