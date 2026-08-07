const { TRIP_TITLE } = require('../config');
const { formatDateShort, formatMonthLabel } = require('../lib/dates');
const { formatEuro } = require('../lib/format');
const { esc } = require('../lib/html');
const { totalKm, distanceByMonth, computeStats, trainStats, travelTotals, distanceByCountry } = require('../services/stats');
const { flagEmoji } = require('../services/geo');
const {
  EXPENSE_CATEGORIES, EXPENSE_PAYERS, EXPENSE_SUBCATEGORIES,
  EXPENSE_CAT_LABELS, EXPENSE_PAYER_LABELS, EXPENSE_SUBCAT_LABELS,
  expensesByMonth, expensesSummary,
} = require('../services/expenses');
const { CSS, renderHeader } = require('./layout');

// ══════════════════════════════════════════════════════════
//  renderStats
// ══════════════════════════════════════════════════════════

// Dépliage des lignes de détail (dépenses, mois, régions) — partagé par toutes
// les sections de la page, donc rendu une seule fois en bas de page.
const TOGGLE_SCRIPT = `<script>
  document.querySelectorAll('.exp-break-row-toggle').forEach(function(row) {
    row.addEventListener('click', function() {
      var detail = document.getElementById(row.dataset.target);
      if (!detail) return;
      var open = detail.classList.toggle('open');
      row.classList.toggle('open', open);
    });
  });
</script>`;

function renderStats(posts, isAdmin = false, allPosts = null) {
  const s = computeStats(posts);

  const fr1 = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fr0 = n => Math.round(n).toLocaleString('fr-FR');

  // ── Synthèse des dépenses par mois (toutes publications, étapes + préparation) ──
  const expSource = allPosts || posts;
  const byMonth = expensesByMonth(expSource);
  const monthKeys = Object.keys(byMonth).sort(); // ordre chronologique
  const globalExp = expensesSummary(expSource);

  const catColors = { restaurant: '#3a9e72', hebergement: '#2a7a7a', hotel: '#2a7a7a', camping: '#8a6d3b', nourriture: '#e07a3a', divers: '#7ecece' };
  const payerColors = { julie: '#e07a3a', nico: '#2a7a7a', commun: '#3a9e72' };

  // Lignes « Par catégorie » (dont sous-catégories, ex. hôtel/camping pour l'hébergement) avec détail dépliable
  const renderCatRows = (agg, idPrefix) => EXPENSE_CATEGORIES.filter(c => agg.byCat[c]).map(c => {
    const v = agg.byCat[c];
    const pct = agg.total > 0 ? Math.max(2, Math.round(v / agg.total * 100)) : 0;
    const items = (agg.itemsByCat[c] || []);
    const detailId = `expdetail-${idPrefix}-${c}`;
    const subs = EXPENSE_SUBCATEGORIES[c] || [];
    const subTotals = agg.byCatSub[c] || {};
    const subRows = subs.filter(sc => subTotals[sc]).map(sc => {
      const sv = subTotals[sc];
      const spct = v > 0 ? Math.max(2, Math.round(sv / v * 100)) : 0;
      return `<div class="exp-subcat-row">
        <span class="exp-subcat-lbl">${EXPENSE_SUBCAT_LABELS[sc]}</span>
        <span class="exp-subcat-track"><span class="exp-subcat-fill" style="width:${spct}%;background:${catColors[sc] || 'var(--teal)'}"></span></span>
        <span class="exp-subcat-amt">${formatEuro(sv)}</span>
      </div>`;
    }).join('');
    const itemsHtml = items.map(it => `
      <div class="exp-detail-item">
        <span class="exp-detail-date">${formatDateShort(it.date)}</span>
        <span class="exp-detail-lbl">${it.subcategory ? `<span class="exp-detail-subcat">${EXPENSE_SUBCAT_LABELS[it.subcategory]}</span> ` : ''}${esc(it.label || it.postTitle || '—')}</span>
        <span class="exp-detail-payer">${EXPENSE_PAYER_LABELS[it.payer] || ''}</span>
        <span class="exp-detail-amt">${formatEuro(it.amount)}</span>
      </div>`).join('');
    return `<div class="exp-break-row exp-break-row-toggle" data-target="${detailId}">
      <div class="exp-break-lbl">${EXPENSE_CAT_LABELS[c]} <span class="exp-break-caret">▾</span></div>
      <div class="exp-break-track"><div class="exp-break-fill" style="width:${pct}%;background:${catColors[c]}"></div></div>
      <div class="exp-break-val">${formatEuro(v)}</div>
    </div>
    <div class="exp-detail" id="${detailId}">${subRows ? `<div class="exp-detail-subtotals">${subRows}</div>` : ''}${itemsHtml}</div>`;
  }).join('');

  // Lignes « Par personne » avec la même ergonomie dépliable que « Par catégorie »
  const renderPayerRows = (agg, idPrefix) => EXPENSE_PAYERS.filter(pr => agg.byPayer[pr]).map(pr => {
    const v = agg.byPayer[pr];
    const pct = agg.total > 0 ? Math.max(2, Math.round(v / agg.total * 100)) : 0;
    const items = (agg.itemsByPayer[pr] || []);
    const detailId = `paydetail-${idPrefix}-${pr}`;
    const itemsHtml = items.map(it => `
      <div class="exp-detail-item">
        <span class="exp-detail-date">${formatDateShort(it.date)}</span>
        <span class="exp-detail-lbl">${it.subcategory ? `<span class="exp-detail-subcat">${EXPENSE_SUBCAT_LABELS[it.subcategory]}</span> ` : ''}${esc(it.label || it.postTitle || '—')}</span>
        <span class="exp-detail-payer">${EXPENSE_CAT_LABELS[it.category] || ''}</span>
        <span class="exp-detail-amt">${formatEuro(it.amount)}</span>
      </div>`).join('');
    return `<div class="exp-break-row exp-break-row-toggle" data-target="${detailId}">
      <div class="exp-break-lbl">${EXPENSE_PAYER_LABELS[pr]} <span class="exp-break-caret">▾</span></div>
      <div class="exp-break-track"><div class="exp-break-fill" style="width:${pct}%;background:${payerColors[pr]}"></div></div>
      <div class="exp-break-val">${formatEuro(v)}</div>
    </div>
    <div class="exp-detail" id="${detailId}">${itemsHtml}</div>`;
  }).join('');

  const expensesHtml = monthKeys.length === 0 ? '' : `
      <div class="stats-section-title">💶 Dépenses du voyage</div>
      <div class="exp-grand-total">
        <div class="egt-num">${formatEuro(globalExp.total)}</div>
        <div class="egt-lbl">Total dépensé sur le voyage</div>
      </div>
      <div class="exp-month-card">
        <div class="exp-month-head">
          <span class="exp-month-name">Vue d'ensemble</span>
          <span class="exp-month-total">${formatEuro(globalExp.total)}</span>
        </div>
        <div class="exp-break-title">Par catégorie <span style="text-transform:none;font-weight:400">(cliquer pour le détail)</span></div>
        ${renderCatRows(globalExp, 'global')}
        <div class="exp-break-title">Par personne <span style="text-transform:none;font-weight:400">(cliquer pour le détail)</span></div>
        ${renderPayerRows(globalExp, 'global')}
      </div>

      <div class="stats-section-title">🗓️ Dépenses par mois</div>
      ${monthKeys.map(key => {
        const m = byMonth[key];
        return `
      <div class="exp-month-card">
        <div class="exp-month-head">
          <span class="exp-month-name">${formatMonthLabel(key)}</span>
          <span class="exp-month-total">${formatEuro(m.total)}</span>
        </div>
        <div class="exp-break-title">Par catégorie <span style="text-transform:none;font-weight:400">(cliquer pour le détail)</span></div>
        ${renderCatRows(m, key)}
        <div class="exp-break-title">Par personne <span style="text-transform:none;font-weight:400">(cliquer pour le détail)</span></div>
        ${renderPayerRows(m, key)}
      </div>`;
      }).join('')}`;

  // ── Déplacements en train ────────────────────────────────
  const train  = trainStats(posts);
  const totals = travelTotals(posts);

  const trainHtml = train.count === 0 ? '' : `
      <div class="stats-section-title">🚆 Déplacements en train</div>
      <div class="exp-month-card">
        <div class="exp-month-head">
          <span class="exp-month-name">${train.count} trajet${train.count > 1 ? 's' : ''} en train</span>
          <span class="exp-month-total">${fr0(train.km)} km</span>
        </div>
        ${train.trips.map(t => {
          const pct = Math.max(4, Math.round(t.km / (train.maxKm || 1) * 100));
          return `<div class="train-row">
            <span class="train-row-date">${formatDateShort(t.date)}</span>
            <span class="train-row-lbl" title="${esc(t.label || t.title)}">${esc(t.label || t.title || '—')}</span>
            <span class="train-row-track"><span class="train-row-fill" style="width:${pct}%"></span></span>
            <span class="train-row-km">${fr1(t.km)} km</span>
          </div>`;
        }).join('')}
        <div class="geo-sub" style="margin:10px 0 0">🚆 Ces kilomètres ne comptent pas comme jours roulés : ils s'ajoutent seulement au trajet total parcouru.</div>
      </div>`;

  // ── Kilométrage par pays, puis par région ────────────────
  const byCountry    = distanceByCountry(posts);
  const countryList  = Object.values(byCountry).sort((a, b) => (b.totalKm + b.trainKm) - (a.totalKm + a.trainKm));
  const maxCountryKm = countryList.reduce((m, c) => Math.max(m, c.totalKm + c.trainKm), 1);
  const regionCount  = countryList.reduce((n, c) => n + Object.keys(c.regions).length, 0);

  const countryHtml = countryList.length === 0 ? '' : `
      <div class="stats-section-title">🌍 Distance par pays et par région</div>
      ${countryList.map((c, ci) => {
        const regions   = Object.values(c.regions).sort((a, b) => (b.totalKm + b.trainKm) - (a.totalKm + a.trainKm));
        const maxRegion = regions.reduce((m, r) => Math.max(m, r.totalKm + r.trainKm), 1);
        const pctCountry = Math.max(2, Math.round((c.totalKm + c.trainKm) / maxCountryKm * 100));
        const subParts = [
          `🚴 ${fr0(c.totalKm)} km à vélo`,
          c.trainKm > 0 ? `🚆 ${fr0(c.trainKm)} km en train` : '',
          `${c.ridingDays} jour${c.ridingDays > 1 ? 's' : ''} roulé${c.ridingDays > 1 ? 's' : ''}`,
          c.totalDplus > 0 ? `⛰️ ${fr0(c.totalDplus)} m D+` : '',
        ].filter(Boolean);
        const regionRows = regions.map((r, ri) => {
          const detailId = `geodetail-${ci}-${ri}`;
          const pct = Math.max(2, Math.round((r.totalKm + r.trainKm) / maxRegion * 100));
          const stagesHtml = r.stages.map(st => `
            <div class="exp-detail-item">
              <span class="exp-detail-date">${formatDateShort(st.date)}</span>
              <span class="exp-detail-lbl">${esc(st.title || '—')}</span>
              <span class="exp-detail-payer">${st.trainKm > 0 ? `🚆 ${fr1(st.trainKm)} km` : (st.dplus > 0 ? `⛰️ ${fr0(st.dplus)} m` : '')}</span>
              <span class="exp-detail-amt">${st.km > 0 ? `${fr1(st.km)} km` : '—'}</span>
            </div>`).join('');
          return `<div class="exp-break-row exp-break-row-toggle" data-target="${detailId}">
            <div class="exp-break-lbl">${esc(r.region)} <span class="exp-break-caret">▾</span></div>
            <div class="exp-break-track"><div class="exp-break-fill" style="width:${pct}%;background:var(--teal)"></div></div>
            <div class="exp-break-val">${fr0(r.totalKm + r.trainKm)} km</div>
          </div>
          <div class="exp-detail" id="${detailId}">${stagesHtml}</div>`;
        }).join('');
        return `<div class="exp-month-card">
          <div class="exp-month-head">
            <span class="exp-month-name"><span class="geo-flag">${flagEmoji(c.countryCode)}</span>${esc(c.country)}</span>
            <span class="exp-month-total">${fr0(c.totalKm + c.trainKm)} km</span>
          </div>
          <div class="geo-sub">${subParts.join(' · ')}</div>
          <div class="exp-break-row" style="cursor:default">
            <div class="exp-break-lbl">Part du voyage</div>
            <div class="exp-break-track"><div class="exp-break-fill" style="width:${pctCountry}%;background:var(--ocean)"></div></div>
            <div class="exp-break-val">${totals.totalKm > 0 ? Math.round((c.totalKm + c.trainKm) / totals.totalKm * 100) : 0} %</div>
          </div>
          <div class="exp-break-title">Par région <span style="text-transform:none;font-weight:400">(cliquer pour le détail des étapes)</span></div>
          ${regionRows}
        </div>`;
      }).join('')}
      <div class="stats-note">
        🌍 Les kilomètres d'une étape sont attribués au pays et à la région de son <strong>point d'arrivée</strong>. Le pays et la région se corrigent à la main dans le formulaire d'édition de l'étape ; la page <strong>Système</strong> permet de compléter les étapes qui n'en ont pas encore.
      </div>`;

  if (s.nDays === 0) {
    return `<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Statistiques — ${TRIP_TITLE}</title><style>${CSS}</style>
    </head><body>
      ${renderHeader({ activePage: 'stats', isAdmin, isStrictAdmin: true, showMap: false })}
      <div class="stats-wrap">
        ${monthKeys.length === 0 && train.count === 0 && countryList.length === 0
          ? `<div class="empty"><div class="empty-icon">📊</div><h3>Pas encore de jour roulé</h3><p>Les statistiques apparaîtront dès la première étape avec des kilomètres.</p></div>`
          : `${train.count > 0 ? `
      <div class="stats-grid">
        <div class="stat-card feature">
          <div class="sc-icon">🧭</div>
          <div class="sc-num">${fr0(totals.totalKm)} km</div>
          <div class="sc-lbl">Trajet parcouru</div>
          <div class="sc-sub">${fr0(totals.trainKm)} km en train sur ${totals.trainCount} trajet${totals.trainCount > 1 ? 's' : ''}</div>
        </div>
      </div>` : ''}${trainHtml}${countryHtml}${expensesHtml}`}
      </div>
      ${TOGGLE_SCRIPT}
    </body></html>`;
  }

  // Synthèse km par mois
  const kmByMonth = distanceByMonth(posts);
  const kmMonthKeys = Object.keys(kmByMonth).sort();
  const maxMonthKm = kmMonthKeys.reduce((m, k) => Math.max(m, kmByMonth[k].totalKm), 1);

  const kmMonthHtml = kmMonthKeys.length === 0 ? '' : `
    <div class="stats-section-title">🗓️ Distance par mois</div>
    ${kmMonthKeys.map(key => {
      const m = kmByMonth[key];
      const pctMonth = Math.max(2, Math.round(m.totalKm / maxMonthKm * 100));
      const maxDayKm = m.days.reduce((mx, d) => Math.max(mx, d.km), 1);
      const detailId = `kmdetail-${key}`;
      const daysHtml = m.days.map(d => {
        const pct = Math.max(2, Math.round(d.km / maxDayKm * 100));
        return `<div class="exp-detail-item sbar-detail-item">
          <span class="exp-detail-date">${formatDateShort(d.date)}</span>
          <span class="sbar-detail-track"><span class="sbar-detail-fill" style="width:${pct}%"></span></span>
          <span class="exp-detail-amt">${fr1(d.km)} km</span>
          <span class="sbar-dplus">${d.dplus > 0 ? `⛰️ ${fr0(d.dplus)} m` : ''}</span>
        </div>`;
      }).join('');
      return `<div class="exp-month-card">
        <div class="exp-month-head exp-break-row-toggle" data-target="${detailId}">
          <span class="exp-month-name">${formatMonthLabel(key)} <span class="exp-break-caret">▾</span></span>
          <span class="exp-month-total">${fr0(m.totalKm)} km</span>
        </div>
        <div class="exp-break-row" style="cursor:default">
          <div class="exp-break-lbl">${m.days.length} jour${m.days.length > 1 ? 's' : ''} roulé${m.days.length > 1 ? 's' : ''}</div>
          <div class="exp-break-track"><div class="exp-break-fill" style="width:${pctMonth}%;background:var(--ocean)"></div></div>
          <div class="exp-break-val">${m.totalDplus > 0 ? `⛰️ ${fr0(m.totalDplus)} m` : ''}</div>
        </div>
        <div class="exp-detail" id="${detailId}">${daysHtml}</div>
      </div>`;
    }).join('')}`;

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Statistiques — ${TRIP_TITLE}</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'stats', isAdmin, isStrictAdmin: true, showMap: false })}
    <div class="stats-wrap">
      <div class="stats-hero">
        <h1>📊 Statistiques du voyage</h1>
        <p>Moyennes calculées sur les jours réellement roulés</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card feature">
          <div class="sc-icon">🧭</div>
          <div class="sc-num">${fr0(totals.totalKm)} km</div>
          <div class="sc-lbl">Trajet parcouru</div>
          <div class="sc-sub">${fr0(totals.bikeKm)} km à vélo${totals.trainKm > 0
            ? ` · 🚆 ${fr0(totals.trainKm)} km en train (${totals.trainCount} trajet${totals.trainCount > 1 ? 's' : ''})`
            : ' · aucun déplacement en train'}</div>
        </div>

        <div class="stat-card feature">
          <div class="sc-icon">🚴</div>
          <div class="sc-num">${fr1(s.avgKm)} km</div>
          <div class="sc-lbl">Moyenne par jour roulé</div>
          <div class="sc-sub">sur ${s.nDays} jour${s.nDays > 1 ? 's' : ''} de vélo · ${fr0(s.km)} km au total</div>
        </div>

        <div class="stat-card">
          <div class="sc-icon">⛰️</div>
          <div class="sc-num">${fr0(s.avgDplus)}</div>
          <div class="sc-lbl">m D+ / jour</div>
          <div class="sc-sub">${fr0(s.dplus)} m au total</div>
        </div>

        <div class="stat-card">
          <div class="sc-icon">📈</div>
          <div class="sc-num">${fr1(s.maxKm)} km</div>
          <div class="sc-lbl">Plus longue étape</div>
          <div class="sc-sub">${s.maxKmDay ? formatDateShort(s.maxKmDay.date) : ''}</div>
        </div>

        <div class="stat-card">
          <div class="sc-icon">📉</div>
          <div class="sc-num">${fr1(s.minKm)} km</div>
          <div class="sc-lbl">Plus courte étape</div>
          <div class="sc-sub">jours roulés uniquement</div>
        </div>

        <div class="stat-card">
          <div class="sc-icon">🏔️</div>
          <div class="sc-num">${fr0(s.maxDplus)} m</div>
          <div class="sc-lbl">D+ max du jour</div>
          <div class="sc-sub">${s.maxDplusDay ? formatDateShort(s.maxDplusDay.date) : ''}</div>
        </div>

        <div class="stat-card">
          <div class="sc-icon">🗓️</div>
          <div class="sc-num">${s.nDays}</div>
          <div class="sc-lbl">Jours roulés</div>
          <div class="sc-sub">${s.restDays > 0 ? `+ ${s.restDays} jour${s.restDays > 1 ? 's' : ''} de pause` : 'aucune pause'}</div>
        </div>

        <div class="stat-card">
          <div class="sc-icon">🛣️</div>
          <div class="sc-num">${fr0(s.km)}</div>
          <div class="sc-lbl">km parcourus</div>
          <div class="sc-sub">${s.spanDays} jour${s.spanDays > 1 ? 's' : ''} depuis le départ</div>
        </div>

        <div class="stat-card">
          <div class="sc-icon">🚆</div>
          <div class="sc-num">${fr0(totals.trainKm)}</div>
          <div class="sc-lbl">km en train</div>
          <div class="sc-sub">${train.count > 0
            ? `${train.count} trajet${train.count > 1 ? 's' : ''}${train.longest ? ` · plus long ${fr0(train.maxKm)} km` : ''}`
            : 'aucun trajet enregistré'}</div>
        </div>

        <div class="stat-card">
          <div class="sc-icon">🌍</div>
          <div class="sc-num">${countryList.length}</div>
          <div class="sc-lbl">Pays traversé${countryList.length > 1 ? 's' : ''}</div>
          <div class="sc-sub">${regionCount} région${regionCount > 1 ? 's' : ''} au total</div>
        </div>
      </div>

      <div class="stats-note">
        🚩 Le jour de départ et les jours sans kilométrage (repos, transferts) sont exclus du calcul des moyennes.${s.nExcluded > 0 ? ` ${s.nExcluded} étape${s.nExcluded > 1 ? 's' : ''} non comptée${s.nExcluded > 1 ? 's' : ''}.` : ''}
      </div>

      ${kmMonthHtml}

      ${trainHtml}

      ${countryHtml}

      ${expensesHtml}
    </div>
    ${TOGGLE_SCRIPT}
  </body></html>`;
}

module.exports = { renderStats };
