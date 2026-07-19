const { TRIP_TITLE, TRIP_START, TRIP_END } = require('../config');
const { esc } = require('../lib/html');
const { CSS } = require('./layout');
const { renderSubscribeWidget } = require('./subscribeWidget');

// ══════════════════════════════════════════════════════════
//  renderLogin
// ══════════════════════════════════════════════════════════

function renderLogin(error, next = '/', csrf = '') {
  const subscribeWidget = renderSubscribeWidget(csrf);
  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${TRIP_TITLE} — Accès</title>
    <style>${CSS} body{min-height:100vh;display:flex;flex-direction:column;justify-content:center;background:var(--warm-white);}</style>
  </head><body>
    <div class="login-hero">
      <div style="display:flex;justify-content:center;margin-bottom:8px">
        <img src="/public/logo_nijumatim.png" alt="Nijumatim" style="height:70px;width:auto;background:#fff;border-radius:12px;padding:6px 14px;">
      </div>
      <p>${TRIP_START && TRIP_END ? esc(TRIP_START) + ' → ' + esc(TRIP_END) : 'Journal de voyage privé'}</p>
    </div>
    <div class="form-wrap" style="max-width:420px;padding-top:28px">
      <div class="form-card">
        ${error ? '<div class="error-msg">Mot de passe incorrect. Demandez-le à votre aventurier !</div>' : ''}
        <h2 style="text-align:center;margin-bottom:6px">Bienvenue !</h2>
        <p style="text-align:center;font-size:13px;color:var(--ink-light);margin-bottom:20px">Entrez votre mot de passe pour accéder au journal.</p>
        <form method="POST" action="/login">
          <input type="hidden" name="next" value="${esc(next)}">
          <div class="field">
            <label>Mot de passe</label>
            <input type="password" name="password" autofocus required style="text-align:center;font-size:18px;letter-spacing:.1em">
          </div>
          <button class="btn-submit" type="submit">Accéder au journal 🚴</button>
        </form>
      </div>
      ${subscribeWidget ? `<p style="text-align:center;font-size:12px;color:var(--ink-light);margin:18px 0 -8px">Pas besoin de mot de passe pour suivre le voyage par e-mail :</p>${subscribeWidget}` : ''}
    </div>
  </body></html>`;
}

module.exports = { renderLogin };
