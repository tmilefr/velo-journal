// ── Page « 💬 Commentaires » : tous les messages, du plus récent au plus ancien ──
// Les commentaires sont dispersés dans les étapes ; cette page les rassemble
// sur une seule liste, avec un filtre par prénom (saisie libre ou pastille).
const { TRIP_TITLE } = require('../config');
const { formatDate } = require('../lib/dates');
const { esc } = require('../lib/html');
const { initials } = require('../lib/format');
const { CSS, renderHeader } = require('./layout');

function renderComments(comments, authors, {
  author = '', order = 'recent', total = 0,
  isAdmin = false, isStrictAdmin = false, csrf = '',
} = {}) {
  const filtering = !!author.trim();
  const link = (name, ord) => {
    const qs = [];
    if (name) qs.push('auteur=' + encodeURIComponent(name));
    if (ord === 'ancien') qs.push('ordre=ancien');
    return '/commentaires' + (qs.length ? '?' + qs.join('&') : '');
  };

  // Pastilles : « tous », puis un prénom par auteur avec son nombre de messages
  const chips = [
    `<a href="${link('', order)}" class="cmt-chip${filtering ? '' : ' active'}">Tous<span class="cmt-chip-count">${total}</span></a>`,
    ...authors.map(a => `<a href="${esc(link(a.name, order))}" class="cmt-chip${a.name.toLowerCase() === author.trim().toLowerCase() ? ' active' : ''}">${esc(a.name)}<span class="cmt-chip-count">${a.count}</span></a>`),
  ].join('');

  const list = comments.length === 0
    ? `<div class="empty">
         <div class="empty-icon">💬</div>
         <h3>${filtering ? `Aucun commentaire de « ${esc(author)} »` : 'Aucun commentaire pour l\'instant'}</h3>
         ${filtering ? `<p style="font-size:13px"><a href="/commentaires" style="color:var(--ocean-mid)">Voir tous les commentaires</a></p>` : ''}
       </div>`
    : comments.map(c => `
      <div class="cmt-item">
        <div class="comment-avatar">${esc(initials(c.author))}</div>
        <div class="cmt-item-main">
          <div class="cmt-item-head">
            <span class="cmt-author">${esc(c.author)}</span>
            <span class="cmt-date">${esc(formatDate(c.date))}</span>
            ${c.isReply ? `<span class="cmt-reply-tag">↩️ réponse à ${esc(c.replyTo)}</span>` : ''}
          </div>
          <p class="cmt-text">${esc(c.text)}</p>
          <a href="${esc(c.postUrl)}" class="cmt-post">${c.postType === 'preparation' ? '🛠️' : '📖'} ${esc(c.postTitle)} ›</a>
        </div>
        ${isStrictAdmin ? `
        <div class="cmt-item-actions">
          <form method="POST" action="/comment/${esc(c.postId)}/delete/${esc(c.id)}?_csrf=${esc(csrf)}" class="form-comment-del" style="margin:0">
            <input type="hidden" name="_csrf" value="${esc(csrf)}">
            <input type="hidden" name="retour" value="commentaires">
            <button type="submit" class="comment-del" title="Supprimer ce commentaire">🗑️</button>
          </form>
        </div>` : ''}
      </div>`).join('');

  const countLine = comments.length
    ? `<div class="cmt-count">${comments.length} message${comments.length > 1 ? 's' : ''}${filtering ? ` de « ${esc(author)} »` : ''} · ${order === 'ancien' ? 'du plus ancien au plus récent' : 'du plus récent au plus ancien'} — <a href="${esc(link(author, order === 'ancien' ? 'recent' : 'ancien'))}" style="color:var(--ocean-mid)">${order === 'ancien' ? '↓ voir les plus récents d\'abord' : '↑ voir les plus anciens d\'abord'}</a></div>`
    : '';

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Commentaires — ${TRIP_TITLE}</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'comments', isAdmin, isStrictAdmin, showMap: true, csrf })}
    <div class="cmt-wrap">
      <div class="cmt-head">
        <h1>💬 Commentaires</h1>
        <p>Tous les messages laissés sur le carnet, étape par étape, dans l'ordre.</p>
      </div>
      <form class="cmt-filter" method="GET" action="/commentaires">
        <div class="cmt-filter-row">
          <input name="auteur" value="${esc(author)}" placeholder="Filtrer par prénom…" maxlength="40" list="cmt-authors" autocomplete="off">
          ${order === 'ancien' ? `<input type="hidden" name="ordre" value="ancien">` : ''}
          <button type="submit">🔍 Filtrer</button>
        </div>
        <datalist id="cmt-authors">${authors.map(a => `<option value="${esc(a.name)}">`).join('')}</datalist>
        <div class="cmt-chips">${chips}</div>
      </form>
      ${countLine}
      ${list}
    </div>
    <script>
      document.querySelectorAll('.form-comment-del').forEach(function(f) {
        f.addEventListener('submit', function(e) {
          if (!window.confirm('Supprimer ce commentaire ?')) e.preventDefault();
        });
      });
    </script>
  </body></html>`;
}

module.exports = { renderComments };
