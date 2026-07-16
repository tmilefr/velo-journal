const { TRIP_TITLE } = require('../config');
const { CSS, renderHeader } = require('./layout');

// ══════════════════════════════════════════════════════════
//  renderSettings
// ══════════════════════════════════════════════════════════

function renderSettings(csrf = '', restored = false, recalc = null) {
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
    </script>
  </body></html>`;
}

module.exports = { renderSettings };
