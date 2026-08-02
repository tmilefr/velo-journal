const { TRIP_TITLE, MAIL_ENABLED } = require('../config');
const { esc } = require('../lib/html');
const { formatDateShort } = require('../lib/dates');
const { CSS, renderHeader } = require('./layout');

// ══════════════════════════════════════════════════════════
//  renderSettings
// ══════════════════════════════════════════════════════════

function renderSubscribersCard(csrf, subscribers) {
  const rows = subscribers.map(s => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px dashed var(--sand);font-size:13px">
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--ink)">${esc(s.email)}</span>
      ${s.confirmed
        ? `<span style="font-size:11px;background:var(--sage);color:var(--emerald);padding:2px 8px;border-radius:20px;font-weight:600;white-space:nowrap">✔ confirmé</span>`
        : `<span style="font-size:11px;background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:20px;font-weight:600;white-space:nowrap">⏳ en attente</span>
           <form method="POST" action="/subscribe/validate" class="form-sub-validate" style="margin:0">
             <input type="hidden" name="_csrf" value="${csrf}">
             <input type="hidden" name="email" value="${esc(s.email)}">
             <button type="submit" class="sub-validate" title="Valider cette inscription à la main">✔ valider</button>
           </form>`}
      <span style="font-size:11px;color:var(--ink-light);white-space:nowrap">${esc(formatDateShort(s.confirmedAt || s.createdAt))}</span>
      <form method="POST" action="/subscribe/remove" class="form-sub-remove" style="margin:0">
        <input type="hidden" name="_csrf" value="${csrf}">
        <input type="hidden" name="email" value="${esc(s.email)}">
        <button type="submit" class="comment-del" title="Retirer cet abonné">✕</button>
      </form>
    </div>`).join('');

  const pending = subscribers.filter(s => !s.confirmed).length;
  const pendingNote = pending
    ? ` ${pending} en attente — si l'e-mail de confirmation n'arrive jamais (spam, adresse dictée de vive voix…), le bouton « ✔ valider » confirme l'inscription à la main.`
    : '';

  const body = !MAIL_ENABLED
    ? `<p style="font-size:14px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;line-height:1.6">⚠️ L'envoi d'e-mails n'est pas configuré : renseignez <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> (et <code>MAIL_FROM</code>) dans <code>.env</code> pour activer les abonnements.</p>`
    : subscribers.length === 0
      ? `<p style="font-size:14px;color:var(--ink-light);line-height:1.6">Personne n'est encore abonné. Le bandeau « 🔔 » en haut du journal permet à vos proches de laisser leur e-mail : ils recevront un message à chaque nouvelle étape publiée.</p>`
      : `<p style="font-size:14px;color:var(--ink-light);margin-bottom:10px;line-height:1.6">${subscribers.filter(s => s.confirmed).length} abonné(s) confirmé(s) — prévenus une seule fois par étape, à sa première publication.${pendingNote}</p>${rows}`;

  return `<div class="form-card" style="margin-top:16px" id="subscribers">
      <h2>🔔 Abonnés aux notifications</h2>
      ${body}
    </div>`;
}

function renderSettings(csrf = '', restored = false, recalc = null, subscribers = []) {
  let recalcBanner = '';
  if (recalc) {
    if (recalc.scanned === 0) {
      recalcBanner = `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:14px;color:#92400e;font-weight:500">ℹ️ Aucune étape ne possède de trace GPX — rien à recalculer.</div>`;
    } else {
      const errPart = recalc.errors ? ` · ⚠️ ${recalc.errors} trace(s) illisible(s)` : '';
      recalcBanner = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:14px;color:#166534;font-weight:500">✅ Distances recalculées : ${recalc.updated} étape(s) mise(s) à jour sur ${recalc.scanned} avec trace GPX${errPart}.</div>`;
    }
  }
  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Système — ${TRIP_TITLE}</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'settings', isAdmin: true, showMap: false })}
    <div class="form-wrap">
      ${restored ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:14px;color:#166534;font-weight:500">✅ Données restaurées avec succès.</div>` : ''}
      ${recalcBanner}
      <div class="form-card" style="margin-bottom:16px">
        <h2>⬇️ Sauvegarder</h2>
        <p style="font-size:14px;color:var(--ink-light);margin-bottom:18px;line-height:1.6"><strong>Sauvegarde complète (recommandée)</strong> : une archive ZIP contenant les étapes <em>et</em> toutes les photos/vidéos. C'est la sauvegarde à conserver.</p>
        <a href="/backup-full" class="btn-submit" style="display:block;text-align:center;text-decoration:none">📦 Télécharger la sauvegarde complète (ZIP)</a>
        <p style="font-size:13px;color:var(--ink-light);margin:16px 0 10px;line-height:1.6">Sauvegarde légère : uniquement les textes des étapes au format <code>.json</code>, sans les médias.</p>
        <a href="/backup" class="loc-search-btn" style="display:block;text-align:center;text-decoration:none;margin:0">⬇️ Télécharger les données seules (JSON)</a>
      </div>
      <div class="form-card">
        <h2>⬆️ Restaurer</h2>
        <p style="font-size:14px;color:var(--ink-light);margin-bottom:18px;line-height:1.6">Importe un fichier de sauvegarde JSON. <strong style="color:#dc2626">Les étapes actuelles seront remplacées</strong> par celles du fichier.</p>
        <form method="POST" action="/restore" enctype="multipart/form-data" class="form-restore">
          <input type="hidden" name="_csrf" value="${csrf}">
          <div class="field">
            <label>Fichier de sauvegarde (.json)</label>
            <input type="file" name="backup" accept=".json,application/json" required style="padding:8px;background:#fff">
          </div>
          <button class="btn-submit" type="submit" style="background:linear-gradient(135deg,#dc2626,#b91c1c)">⬆️ Restaurer les données</button>
        </form>
      </div>
      <div class="form-card" style="margin-top:16px">
        <h2>📐 Recalcul des distances</h2>
        <p style="font-size:14px;color:var(--ink-light);margin-bottom:18px;line-height:1.6">Recalcule la distance (km) de <strong>toutes les étapes possédant une trace GPX</strong>, à partir des points de la trace. Les étapes sans GPX ne sont pas modifiées. Utile après un import ou pour corriger d'anciennes valeurs saisies à la main.</p>
        <form method="POST" action="/recalc-distances" class="form-recalc">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button class="btn-submit" type="submit" style="background:linear-gradient(135deg,var(--ocean),var(--teal))">📐 Recalculer toutes les distances</button>
        </form>
      </div>
      <div class="form-card" style="margin-top:16px">
        <h2>🏔️ Panorama du voyage</h2>
        <p style="font-size:14px;color:var(--ink-light);margin-bottom:18px;line-height:1.6">Génère une grande image blanche avec <strong>tous les profils de dénivelé mis bout à bout</strong>. Un trait en biais relie chaque <strong>point d'arrivée de GPX</strong> à la photo de l'étape correspondante. Idéal à imprimer ou partager.</p>
        <a href="/panorama" class="btn-submit" style="display:block;text-align:center;text-decoration:none;background:linear-gradient(135deg,var(--emerald),var(--emerald-mid))">🏔️ Générer le panorama</a>
      </div>
      ${renderSubscribersCard(csrf, subscribers)}
    </div>
    <script>
      document.querySelectorAll('.form-restore').forEach(function(f) {
        f.addEventListener('submit', function(e) {
          if (!window.confirm('Restaurer ces données ? Les étapes actuelles seront remplacées.')) e.preventDefault();
        });
      });
      document.querySelectorAll('.form-recalc').forEach(function(f) {
        f.addEventListener('submit', function(e) {
          if (!window.confirm('Recalculer les distances de toutes les étapes avec une trace GPX ? Les valeurs de km actuelles seront remplacées.')) e.preventDefault();
        });
      });
      document.querySelectorAll('.form-sub-validate').forEach(function(f) {
        f.addEventListener('submit', function(e) {
          var email = f.querySelector('input[name=email]').value;
          if (!window.confirm('Valider l\'inscription de ' + email + ' à la main ? Cette personne recevra les prochaines étapes sans avoir cliqué sur le lien de confirmation.')) e.preventDefault();
        });
      });
      document.querySelectorAll('.form-sub-remove').forEach(function(f) {
        f.addEventListener('submit', function(e) {
          var email = f.querySelector('input[name=email]').value;
          if (!window.confirm('Retirer ' + email + ' des abonnés ?')) e.preventDefault();
        });
      });
    </script>
  </body></html>`;
}

module.exports = { renderSettings };
