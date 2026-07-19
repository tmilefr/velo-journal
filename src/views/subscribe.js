// ── Pages abonnement : confirmation et désinscription ─────
// Pages publiques minimalistes (accessibles depuis un lien e-mail,
// sans être connecté à la page famille).
const { TRIP_TITLE } = require('../config');
const { esc } = require('../lib/html');
const { CSS } = require('./layout');

function renderSubscribePage({ icon, title, message, extraHtml = '' }) {
  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(title)} — ${esc(TRIP_TITLE)}</title><style>${CSS}</style>
  </head><body>
    <div class="login-hero">
      <h2>${esc(TRIP_TITLE)}</h2>
      <p>Notifications par e-mail</p>
    </div>
    <div class="form-wrap">
      <div class="form-card" style="text-align:center">
        <div style="font-size:44px;margin-bottom:10px">${icon}</div>
        <h2 style="margin-bottom:10px">${esc(title)}</h2>
        <p style="font-size:14px;color:var(--ink-light);line-height:1.6;margin-bottom:6px">${message}</p>
        ${extraHtml}
        <a href="/" class="loc-search-btn" style="display:inline-block;margin-top:18px">📖 Aller au journal</a>
      </div>
    </div>
  </body></html>`;
}

function renderConfirmSuccess(email) {
  return renderSubscribePage({
    icon: '🎉',
    title: 'Abonnement confirmé !',
    message: `C'est tout bon : <strong>${esc(email)}</strong> recevra désormais un e-mail à chaque nouvelle étape publiée.`,
  });
}

function renderConfirmInvalid() {
  return renderSubscribePage({
    icon: '🤔',
    title: 'Lien invalide ou expiré',
    message: `Ce lien de confirmation n'est plus valable (il expire après 7 jours).<br>Retournez sur le journal pour vous réinscrire.`,
  });
}

// Page intermédiaire avec bouton : évite qu'un simple préchargement
// du lien par la messagerie ne désabonne quelqu'un par accident.
function renderUnsubscribeAsk(sub) {
  return renderSubscribePage({
    icon: '👋',
    title: 'Se désabonner ?',
    message: `<strong>${esc(sub.email)}</strong> ne recevra plus les nouvelles étapes du voyage.`,
    extraHtml: `<form method="POST" action="/subscribe/stop/${esc(sub.token)}" style="margin-top:14px">
      <button class="btn-submit" type="submit" style="background:linear-gradient(135deg,#dc2626,#b91c1c)">Oui, me désabonner</button>
    </form>`,
  });
}

function renderUnsubscribeDone(email) {
  return renderSubscribePage({
    icon: '✅',
    title: 'Désabonnement effectué',
    message: `<strong>${esc(email)}</strong> ne recevra plus d'e-mails.<br>Vous pourrez vous réabonner à tout moment depuis le journal.`,
  });
}

module.exports = {
  renderConfirmSuccess, renderConfirmInvalid,
  renderUnsubscribeAsk, renderUnsubscribeDone,
};
