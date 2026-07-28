const { TRIP_TITLE } = require('../config');
const { CSS, renderHeader } = require('./layout');
const {
  LIGHTBOX_JS, LIGHTBOX_HTML, TRANSLATE_JS, VIDEO_CAROUSEL_JS,
  ELEV_MODAL_HTML, ELEV_MODAL_JS, DELETE_CONFIRM_JS, COMMENTS_JS,
} = require('./scripts');
const { renderCard } = require('./card');

// ══════════════════════════════════════════════════════════
//  renderPreparation
// ══════════════════════════════════════════════════════════

function renderPreparation(posts, isAdmin = false, csrf = '', isStrictAdmin = false) {
  const postCards = posts.length === 0
    ? `<div class="empty"><div class="empty-icon">🛠️</div><h3>La préparation n'a pas encore commencé...</h3><p>Les articles de préparation apparaîtront ici !</p></div>`
    : posts.map(p => renderCard(p, isAdmin, csrf, isStrictAdmin)).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Préparation — ${TRIP_TITLE}</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'preparation', isAdmin, isStrictAdmin, showMap: true, csrf })}
    <div style="background:linear-gradient(135deg,var(--emerald) 0%,var(--ocean-mid) 100%);padding:20px 20px 18px;border-bottom:2px solid var(--sand)">
      <div style="max-width:620px;margin:0 auto;display:flex;align-items:center;gap:14px">
        <div style="font-size:36px">🛠️</div>
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:#fff">Préparation du voyage</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:2px">Matériel, itinéraire, entraînement, logistique…</div>
        </div>
        <div style="margin-left:auto;background:rgba(255,255,255,0.15);border-radius:20px;padding:6px 14px;font-size:13px;font-weight:600;color:#fff">${posts.length} article${posts.length > 1 ? 's' : ''}</div>
      </div>
    </div>
    <div class="feed">${postCards}</div>
    ${isAdmin ? '<a class="fab" href="/post?type=preparation" title="Nouvel article de préparation">+</a>' : ''}
    ${LIGHTBOX_HTML}
    ${ELEV_MODAL_HTML}
    ${LIGHTBOX_JS}
    ${VIDEO_CAROUSEL_JS}
    ${TRANSLATE_JS}
    ${ELEV_MODAL_JS}
    ${DELETE_CONFIRM_JS}
    ${COMMENTS_JS}
  </body></html>`;
}

module.exports = { renderPreparation };
