const { formatDate, postEndISO, postDaySpan } = require('../lib/dates');
const { formatEuro, initials } = require('../lib/format');
const { esc, renderBody } = require('../lib/html');
const { isVideoUrl, pickCover } = require('../services/media');
const {
  EXPENSE_CAT_LABELS, EXPENSE_PAYER_LABELS, EXPENSE_SUBCAT_LABELS,
  postExpenseTotal,
} = require('../services/expenses');

// ══════════════════════════════════════════════════════════
//  renderCard — carte de post partagée
// ══════════════════════════════════════════════════════════

function renderCard(p, isAdmin, csrf, isStrictAdmin = false) {
  // Index des légendes aligné sur l'ordre de p.photos
  const captionOf = (ph) => {
    const idx = (p.photos || []).indexOf(ph);
    return (p.captions && p.captions[idx]) ? p.captions[idx] : '';
  };
  const expTotal = postExpenseTotal(p);
  const span     = postDaySpan(p);
  const endShort = span > 1 ? new Date(postEndISO(p)).toLocaleDateString('fr-FR', { timeZone:'Europe/Paris', day:'numeric', month:'long' }) : '';
  const nonRode  = span > 1 ? span - 1 : 0; // jours de l'étape non roulés (repos)
  const d       = new Date(p.date);
  const weekday = d.toLocaleDateString('fr-FR', { timeZone:'Europe/Paris', weekday:'long' });
  const day     = d.toLocaleDateString('fr-FR', { timeZone:'Europe/Paris', day:'numeric' });
  const month   = d.toLocaleDateString('fr-FR', { timeZone:'Europe/Paris', month:'long' });
  const year    = d.getFullYear();
  const time    = d.toLocaleTimeString('fr-FR', { timeZone:'Europe/Paris', hour:'2-digit', minute:'2-digit' });

  return `
  <div class="card" id="post-${p.id}">
    <div class="card-date-header">
      <div class="card-date-block">
        <div class="card-day-num">${day}</div>
        <div class="card-date-text">
          <span class="card-weekday">${weekday}</span>
          <span class="card-month-year">${month} ${year}</span>
          <span class="card-time">⏱ ${time}</span>
        </div>
      </div>
      <div class="card-date-right">
        ${span > 1 ? `<span class="card-multiday">📅 ${span} jours · jusqu'au ${endShort}</span>` : ''}
        ${p.location ? `<span class="card-loc">📍 ${esc(p.location)}</span>` : ''}
      </div>
    </div>
    <div class="card-divider"></div>
    <div class="card-body">
      <h2 class="card-title">${esc(p.title)}</h2>
      <div class="card-badges" style="margin-bottom:${nonRode > 0 ? '8px' : '14px'}">
        <div class="translate-widget" data-postid="${p.id}" data-csrf="${csrf}">
          <select class="translate-select">
            <option value="">🌐 Traduire…</option>
            <option value="en">🇬🇧 English</option>
            <option value="es">🇪🇸 Español</option>
            <option value="de">🇩🇪 Deutsch</option>
            <option value="it">🇮🇹 Italiano</option>
            <option value="fr">🇫🇷 Texte original</option>
          </select>
          <span class="translate-status"></span>
        </div>
        ${p.km    ? `<span class="km-badge">🚴 +${esc(String(p.km))} km</span>` : ''}
        ${p.trainKm ? `<span class="km-badge">🚆 ${esc(String(p.trainKm))} km${p.trainLabel ? ` · ${esc(p.trainLabel)}` : ''}</span>` : ''}
        ${p.dplus ? (p.gpx ? `<button type="button" class="dplus-badge dplus-clickable" data-elev-gpx="${p.gpx}" data-elev-title="${esc(p.title)}" title="Voir le profil de dénivelé">⛰️ ${esc(String(p.dplus))} m D+ 📈</button>` : `<span class="dplus-badge">⛰️ ${esc(String(p.dplus))} m D+</span>`) : ''}
      </div>
      ${(nonRode > 0 && (p.km || p.dplus)) ? `
      <div class="card-restnote" style="margin-bottom:14px">🛌 ${nonRode} jour${nonRode > 1 ? 's' : ''} non roulé${nonRode > 1 ? 's' : ''} (repos) sur cette étape</div>` : ''}
      ${(() => {
        // Une seule image de couverture sur la carte : le clic ouvre la galerie
        // (toutes les photos et vidéos de l'étape) dans la visionneuse.
        const media = (p.photos || []).map(ph => ({
          url: ph, video: isVideoUrl(ph), cap: captionOf(ph),
        }));
        if (!media.length) return '';
        const cover  = pickCover(p.photos, p.cover);
        const start  = Math.max(0, media.findIndex(m => m.url === cover));
        const c      = media[start];
        const nPhoto = media.filter(m => !m.video).length;
        const nVideo = media.length - nPhoto;
        const others = media.length - 1;
        const label  = [
          nPhoto ? `📷 ${nPhoto}` : '',
          nVideo ? `🎬 ${nVideo}` : '',
        ].filter(Boolean).join(' · ');
        return `
      <button type="button" class="card-cover" data-media="${esc(JSON.stringify(media))}" data-start="${start}"
              aria-label="Ouvrir la galerie — ${media.length} média${media.length > 1 ? 's' : ''}">
        ${c.video
          ? `<video class="card-cover-media" src="${c.url}" preload="metadata" muted playsinline></video>
        <span class="card-cover-play">▶</span>`
          : `<img class="card-cover-media" src="${c.url}" alt="${esc(c.cap || p.title)}" loading="lazy">`}
        ${others ? `<span class="card-cover-badge">${label}<b>Voir tout</b></span>` : ''}
        ${c.cap ? `<span class="card-cover-cap">${esc(c.cap)}</span>` : ''}
      </button>`;
      })()}
      <div class="card-text">${renderBody(p.body)}</div>
      ${p.gpx ? `
      <div class="gpx-canvas-wrap">
        <canvas id="gpxcanvas-${p.id}" data-gpx="${p.gpx}" style="display:block;width:100%;height:260px"></canvas>
        <div class="gpx-canvas-footer">
          <span class="gpx-map-lbl">🗺️ Trace GPX · chargement…</span>
          <a class="gpx-link" href="${p.gpx}" download>⬇️ Télécharger</a>
        </div>
      </div>` : ''}
      ${(isStrictAdmin && p.expenses && p.expenses.length) ? `
      <div class="card-expenses">
        <div class="card-exp-head">
          <span>💶 Dépenses</span>
          <span class="card-exp-total">${formatEuro(expTotal)}</span>
        </div>
        ${p.expenses.map(e => `
        <div class="card-exp-item">
          <span class="card-exp-tags">
            <span class="card-exp-cat">${EXPENSE_CAT_LABELS[e.category] || e.category}${e.subcategory ? ' · ' + (EXPENSE_SUBCAT_LABELS[e.subcategory] || e.subcategory) : ''}</span>
            <span class="card-exp-payer">${EXPENSE_PAYER_LABELS[e.payer] || e.payer}</span>
            ${e.label ? `<span style="color:var(--ink-light)">${esc(e.label)}</span>` : ''}
          </span>
          <span class="card-exp-amt">${formatEuro(parseFloat(e.amount) || 0)}</span>
        </div>`).join('')}
      </div>` : ''}
      ${(isStrictAdmin && p.privateNote) ? `
      <div class="card-private">
        <div class="card-private-head">🔒 Note privée — admin uniquement</div>
        <div class="card-private-text">${esc(p.privateNote)}</div>
      </div>` : ''}
      ${isAdmin ? `
      <div class="admin-actions">
        <a href="/edit/${p.id}" class="btn-edit">✏️ Modifier</a>
        ${p.visibility && p.visibility !== 'all' ? `<span style="font-size:11px;padding:4px 10px;border-radius:20px;background:#fef9c3;color:#92400e">⏳ À valider</span>` : ''}
        <form method="POST" action="/delete/${p.id}" style="margin-left:auto" class="form-delete">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button type="submit" class="btn-del">🗑️ Supprimer</button>
        </form>
      </div>` : ''}
    </div>
    <div class="comments">
      ${(p.comments||[]).map(c => `
        <div class="comment">
          <div class="comment-avatar">${esc(initials(c.author))}</div>
          <div class="comment-main">
            <div class="comment-bubble">
              <span class="comment-author">${esc(c.author)}</span>
              <span class="comment-date">${formatDate(c.date)}</span>
              ${isStrictAdmin ? `<form method="POST" action="/comment/${p.id}/delete/${c.id}?_csrf=${csrf}" class="form-comment-del" style="display:inline">
                <input type="hidden" name="_csrf" value="${csrf}">
                <button type="submit" class="comment-del" title="Supprimer ce commentaire">🗑️</button>
              </form>` : ''}
              <p class="comment-text">${esc(c.text)}</p>
            </div>
            <button type="button" class="comment-reply-btn" data-reply-target="reply-${c.id}">↩️ Répondre</button>

            ${(c.replies||[]).map(r => `
              <div class="comment comment-nested">
                <div class="comment-avatar comment-avatar-sm">${esc(initials(r.author))}</div>
                <div class="comment-bubble">
                  <span class="comment-author">${esc(r.author)}</span>
                  <span class="comment-date">${formatDate(r.date)}</span>
                  ${isStrictAdmin ? `<form method="POST" action="/comment/${p.id}/delete/${r.id}?_csrf=${csrf}" class="form-comment-del" style="display:inline">
                    <input type="hidden" name="_csrf" value="${csrf}">
                    <button type="submit" class="comment-del" title="Supprimer cette réponse">🗑️</button>
                  </form>` : ''}
                  <p class="comment-text">${esc(r.text)}</p>
                </div>
              </div>`).join('')}

            <form class="comment-form comment-reply-form" id="reply-${c.id}" action="/comment/${p.id}/reply/${c.id}" method="POST" style="display:none">
              <input type="hidden" name="_csrf" value="${csrf}">
              <input name="author" placeholder="Votre prénom" required maxlength="40">
              <textarea name="text" placeholder="Votre réponse..." required maxlength="300"></textarea>
              <button type="submit">↩️ Répondre</button>
            </form>
          </div>
        </div>`).join('')}
      <form class="comment-form" action="/comment/${p.id}" method="POST">
        <input type="hidden" name="_csrf" value="${csrf}">
        <input name="author" placeholder="Votre prénom" required maxlength="40">
        <textarea name="text" placeholder="Laisser un commentaire..." required maxlength="300"></textarea>
        <button type="submit">💬 Commenter</button>
      </form>
    </div>
  </div>`;
}

module.exports = { renderCard };
