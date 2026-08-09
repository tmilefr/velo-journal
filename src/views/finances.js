const { TRIP_TITLE } = require('../config');
const { formatDateShort, formatMonthLabel } = require('../lib/dates');
const { formatEuro } = require('../lib/format');
const { esc } = require('../lib/html');
const {
  EXPENSE_CATEGORIES, EXPENSE_PAYERS, EXPENSE_SUBCATEGORIES,
  EXPENSE_CAT_LABELS, EXPENSE_PAYER_LABELS, EXPENSE_SUBCAT_LABELS,
  expensesByMonth, expensesSummary,
} = require('../services/expenses');
const { CSS, TOGGLE_SCRIPT, renderHeader } = require('./layout');

// ══════════════════════════════════════════════════════════
//  renderFinances — page réservée aux administrateurs
// ══════════════════════════════════════════════════════════

const CAT_COLORS   = { restaurant: '#3a9e72', hebergement: '#2a7a7a', hotel: '#2a7a7a', camping: '#8a6d3b', nourriture: '#e07a3a', divers: '#7ecece' };
const PAYER_COLORS = { julie: '#e07a3a', nico: '#2a7a7a', commun: '#3a9e72' };

// Une ligne de détail dépliée : date, libellé, colonne libre, montant
const detailItem = (it, sideLabel) => `
  <div class="exp-detail-item">
    <span class="exp-detail-date">${formatDateShort(it.date)}</span>
    <span class="exp-detail-lbl">${it.subcategory ? `<span class="exp-detail-subcat">${EXPENSE_SUBCAT_LABELS[it.subcategory]}</span> ` : ''}${esc(it.label || it.postTitle || '—')}</span>
    <span class="exp-detail-payer">${sideLabel}</span>
    <span class="exp-detail-amt">${formatEuro(it.amount)}</span>
  </div>`;

// Lignes « Par catégorie » (dont sous-catégories, ex. hôtel/camping pour l'hébergement)
const renderCatRows = (agg, idPrefix) => EXPENSE_CATEGORIES.filter(c => agg.byCat[c]).map(c => {
  const v = agg.byCat[c];
  const pct = agg.total > 0 ? Math.max(2, Math.round(v / agg.total * 100)) : 0;
  const detailId = `expdetail-${idPrefix}-${c}`;
  const subTotals = agg.byCatSub[c] || {};
  const subRows = (EXPENSE_SUBCATEGORIES[c] || []).filter(sc => subTotals[sc]).map(sc => {
    const sv = subTotals[sc];
    const spct = v > 0 ? Math.max(2, Math.round(sv / v * 100)) : 0;
    return `<div class="exp-subcat-row">
      <span class="exp-subcat-lbl">${EXPENSE_SUBCAT_LABELS[sc]}</span>
      <span class="exp-subcat-track"><span class="exp-subcat-fill" style="width:${spct}%;background:${CAT_COLORS[sc] || 'var(--teal)'}"></span></span>
      <span class="exp-subcat-amt">${formatEuro(sv)}</span>
    </div>`;
  }).join('');
  const itemsHtml = (agg.itemsByCat[c] || []).map(it => detailItem(it, EXPENSE_PAYER_LABELS[it.payer] || '')).join('');
  return `<div class="exp-break-row exp-break-row-toggle" data-target="${detailId}">
    <div class="exp-break-lbl">${EXPENSE_CAT_LABELS[c]} <span class="exp-break-caret">▾</span></div>
    <div class="exp-break-track"><div class="exp-break-fill" style="width:${pct}%;background:${CAT_COLORS[c]}"></div></div>
    <div class="exp-break-val">${formatEuro(v)}</div>
  </div>
  <div class="exp-detail" id="${detailId}">${subRows ? `<div class="exp-detail-subtotals">${subRows}</div>` : ''}${itemsHtml}</div>`;
}).join('');

// Lignes « Par personne » avec la même ergonomie dépliable que « Par catégorie »
const renderPayerRows = (agg, idPrefix) => EXPENSE_PAYERS.filter(pr => agg.byPayer[pr]).map(pr => {
  const v = agg.byPayer[pr];
  const pct = agg.total > 0 ? Math.max(2, Math.round(v / agg.total * 100)) : 0;
  const detailId = `paydetail-${idPrefix}-${pr}`;
  const itemsHtml = (agg.itemsByPayer[pr] || []).map(it => detailItem(it, EXPENSE_CAT_LABELS[it.category] || '')).join('');
  return `<div class="exp-break-row exp-break-row-toggle" data-target="${detailId}">
    <div class="exp-break-lbl">${EXPENSE_PAYER_LABELS[pr]} <span class="exp-break-caret">▾</span></div>
    <div class="exp-break-track"><div class="exp-break-fill" style="width:${pct}%;background:${PAYER_COLORS[pr]}"></div></div>
    <div class="exp-break-val">${formatEuro(v)}</div>
  </div>
  <div class="exp-detail" id="${detailId}">${itemsHtml}</div>`;
}).join('');

const breakdown = (agg, idPrefix) => `
  <div class="exp-break-title">Par catégorie <span style="text-transform:none;font-weight:400">(cliquer pour le détail)</span></div>
  ${renderCatRows(agg, idPrefix)}
  <div class="exp-break-title">Par personne <span style="text-transform:none;font-weight:400">(cliquer pour le détail)</span></div>
  ${renderPayerRows(agg, idPrefix)}`;

// `posts` : toutes les publications, étapes de voyage comme pages de préparation.
function renderFinances(posts) {
  const byMonth   = expensesByMonth(posts);
  const monthKeys = Object.keys(byMonth).sort(); // ordre chronologique
  const global    = expensesSummary(posts);

  const fr0 = n => Math.round(n).toLocaleString('fr-FR');
  const nbItems = Object.values(global.itemsByCat).reduce((n, arr) => n + arr.length, 0);
  const avgMonth = monthKeys.length > 0 ? global.total / monthKeys.length : 0;

  const body = monthKeys.length === 0
    ? `<div class="empty"><div class="empty-icon">💶</div><h3>Aucune dépense enregistrée</h3><p>Les dépenses saisies sur les étapes et les pages de préparation apparaîtront ici.</p></div>`
    : `
      <div class="exp-grand-total">
        <div class="egt-num">${formatEuro(global.total)}</div>
        <div class="egt-lbl">Total dépensé sur le voyage</div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="sc-icon">🗓️</div>
          <div class="sc-num">${formatEuro(avgMonth)}</div>
          <div class="sc-lbl">Moyenne par mois</div>
          <div class="sc-sub">sur ${monthKeys.length} mois avec dépenses</div>
        </div>
        <div class="stat-card">
          <div class="sc-icon">🧾</div>
          <div class="sc-num">${fr0(nbItems)}</div>
          <div class="sc-lbl">Dépense${nbItems > 1 ? 's' : ''} saisie${nbItems > 1 ? 's' : ''}</div>
          <div class="sc-sub">${nbItems > 0 ? `${formatEuro(global.total / nbItems)} en moyenne` : ''}</div>
        </div>
      </div>

      <div class="stats-section-title">💶 Vue d'ensemble</div>
      <div class="exp-month-card">
        <div class="exp-month-head">
          <span class="exp-month-name">Tout le voyage</span>
          <span class="exp-month-total">${formatEuro(global.total)}</span>
        </div>
        ${breakdown(global, 'global')}
      </div>

      <div class="stats-section-title">🗓️ Dépenses par mois</div>
      ${monthKeys.map(key => `
      <div class="exp-month-card">
        <div class="exp-month-head">
          <span class="exp-month-name">${formatMonthLabel(key)}</span>
          <span class="exp-month-total">${formatEuro(byMonth[key].total)}</span>
        </div>
        ${breakdown(byMonth[key], key)}
      </div>`).join('')}

      <div class="stats-note">
        💶 Ces chiffres regroupent les dépenses saisies sur les étapes <strong>et</strong> sur les pages de préparation. Cette page n'est visible que des administrateurs.
      </div>`;

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Finances — ${TRIP_TITLE}</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'finances', isAdmin: true, isStrictAdmin: true, showMap: false })}
    <div class="stats-wrap">
      <div class="stats-hero">
        <h1>💶 Finances du voyage</h1>
        <p>Budget et dépenses — réservé aux administrateurs</p>
      </div>
      ${body}
    </div>
    ${TOGGLE_SCRIPT}
  </body></html>`;
}

module.exports = { renderFinances };
