const { TRIP_TITLE } = require('../config');
const { formatDateShort, formatMonthLabel } = require('../lib/dates');
const { esc } = require('../lib/html');
const { totalKm, distanceByMonth, computeStats, trainStats, travelTotals, distanceByCountry } = require('../services/stats');
const { flagEmoji } = require('../services/geo');
const { CSS, TOGGLE_SCRIPT, renderHeader } = require('./layout');

// ══════════════════════════════════════════════════════════
//  renderStats — distances, dénivelé, train, pays.
//  Les chiffres financiers vivent à part, dans views/finances.js
// ══════════════════════════════════════════════════════════

// Comment la distance d'un trajet en train a été obtenue.
const TRAIN_SOURCE_TAG = {
  gpx:    ' <span class="geo-tag" title="Mesuré sur la trace GPX du trajet">trace</span>',
  points: ' <span class="geo-tag" title="Distance à vol d\'oiseau entre le départ et l\'arrivée">↗ à vol d\'oiseau</span>',
  manual: ' <span class="geo-tag" title="Distance saisie à la main">saisi</span>',
};

function renderStats(posts, isAdmin = false) {
  const s = computeStats(posts);

  const fr1 = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fr0 = n => Math.round(n).toLocaleString('fr-FR');

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
            <span class="train-row-lbl" title="${esc(t.label || t.title)}">${esc(t.label || t.title || '—')}${TRAIN_SOURCE_TAG[t.source] || ''}</span>
            <span class="train-row-track"><span class="train-row-fill" style="width:${pct}%"></span></span>
            <span class="train-row-km">${fr1(t.km)} km</span>
          </div>`;
        }).join('')}
        <div class="geo-sub" style="margin:10px 0 0">🚆 Distances mesurées sur la trace GPX du trajet, ou à vol d'oiseau (↗) entre les positions de départ et d'arrivée. Elles ne comptent pas comme jours roulés : elles s'ajoutent seulement au trajet total parcouru.</div>
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
          c.totalKm > 0 ? `🚴 ${fr0(c.totalKm)} km à vélo` : '',
          c.trainKm > 0 ? `🚆 ${fr0(c.trainKm)} km en train` : '',
          // Une étape à cheval sur deux régions n'est comptée comme journée
          // roulée que du côté où l'on a fait le plus de kilomètres.
          c.ridingDays > 0 ? `${c.ridingDays} jour${c.ridingDays > 1 ? 's' : ''} roulé${c.ridingDays > 1 ? 's' : ''}` : '',
          c.totalDplus > 0 ? `⛰️ ${fr0(c.totalDplus)} m D+` : '',
        ].filter(Boolean);
        const regionRows = regions.map((r, ri) => {
          const detailId = `geodetail-${ci}-${ri}`;
          const pct = Math.max(2, Math.round((r.totalKm + r.trainKm) / maxRegion * 100));
          const stagesHtml = r.stages.map(st => `
            <div class="exp-detail-item">
              <span class="exp-detail-date">${formatDateShort(st.date)}</span>
              <span class="exp-detail-lbl">${esc(st.title || '—')}${st.partial ? ' <span class="geo-tag" title="Étape partagée avec une autre région : seule la part parcourue ici est comptée">part de l\'étape</span>' : ''}</span>
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
        🌍 Rien à saisir : les étapes avec une <strong>trace GPX</strong> sont découpées le long du parcours, et leurs kilomètres répartis entre les régions réellement traversées. Les autres sont rattachées à leur <strong>point d'arrivée</strong>. La page <strong>Système</strong> relance la détection sur d'anciennes étapes ; le formulaire d'édition permet de forcer une valeur.
      </div>`;

  if (s.nDays === 0) {
    return `<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Statistiques — ${TRIP_TITLE}</title><style>${CSS}</style>
    </head><body>
      ${renderHeader({ activePage: 'stats', isAdmin, isStrictAdmin: true, showMap: false })}
      <div class="stats-wrap">
        ${train.count === 0 && countryList.length === 0
          ? `<div class="empty"><div class="empty-icon">📊</div><h3>Pas encore de jour roulé</h3><p>Les statistiques apparaîtront dès la première étape avec des kilomètres.</p></div>`
          : `${train.count > 0 ? `
      <div class="stats-grid">
        <div class="stat-card feature">
          <div class="sc-icon">🧭</div>
          <div class="sc-num">${fr0(totals.totalKm)} km</div>
          <div class="sc-lbl">Trajet parcouru</div>
          <div class="sc-sub">${fr0(totals.trainKm)} km en train sur ${totals.trainCount} trajet${totals.trainCount > 1 ? 's' : ''}</div>
        </div>
      </div>` : ''}${trainHtml}${countryHtml}`}
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
    </div>
    ${TOGGLE_SCRIPT}
  </body></html>`;
}

module.exports = { renderStats };
