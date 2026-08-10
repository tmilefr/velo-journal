// ── Abonnement e-mail : inscription, confirmation, désinscription ──
const express   = require('express');
const rateLimit = require('express-rate-limit');
const { MAIL_ENABLED } = require('../config');
const { subscribe, findByToken, confirmByToken, confirmByEmail, unsubscribeByToken, removeEmail } = require('../services/subscribers');
const { sendConfirmationEmail, siteBaseUrl } = require('../services/mailer');
const { requireFamily, requireAuth } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const {
  renderConfirmSuccess, renderConfirmInvalid,
  renderUnsubscribeAsk, renderUnsubscribeDone,
} = require('../views/subscribe');

const router = express.Router();

const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  message: { ok: false, message: 'Trop de tentatives. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Inscription (bandeau du journal, visible une fois connecté) ──
// L'abonnement lui-même n'est pas rattaché au compte (le mot de passe
// famille est générique) : seule l'adresse e-mail est stockée, validée
// par double opt-in. Mais le formulaire n'est proposé qu'aux personnes
// connectées, pour ne rien exposer du site sans mot de passe.
router.post('/subscribe', requireFamily, subscribeLimiter, requireCsrf, async (req, res) => {
  if (!MAIL_ENABLED) {
    return res.status(503).json({ ok: false, message: "L'envoi d'e-mails n'est pas configuré sur ce serveur." });
  }
  const { status, sub } = subscribe(req.body.email);
  if (status === 'invalid') return res.status(400).json({ ok: false, message: 'Adresse e-mail invalide.' });
  if (status === 'full')    return res.status(400).json({ ok: false, message: "Le nombre maximum d'abonnés est atteint." });
  if (status === 'already') return res.json({ ok: true, already: true, message: 'Cette adresse est déjà abonnée ✔' });

  try {
    await sendConfirmationEmail(sub, siteBaseUrl(req));
  } catch (e) {
    console.error('[subscribe] envoi de confirmation impossible :', e.message);
    return res.status(502).json({ ok: false, message: "Impossible d'envoyer l'e-mail de confirmation. Réessayez plus tard." });
  }
  res.json({ ok: true, message: '📬 C\'est presque fini ! Ouvrez l\'e-mail reçu et cliquez sur le lien de confirmation.' });
});

// ── Confirmation (lien reçu par e-mail, sans connexion) ───
router.get('/subscribe/confirm/:token', (req, res) => {
  const sub = confirmByToken(req.params.token);
  if (!sub) return res.status(404).send(renderConfirmInvalid());
  res.send(renderConfirmSuccess(sub.email));
});

// ── Désinscription (lien présent dans chaque e-mail) ──────
// GET : page de confirmation avec bouton (un préchargement du lien
// par la messagerie ne doit pas désabonner quelqu'un tout seul).
router.get('/subscribe/stop/:token', (req, res) => {
  const sub = findByToken(req.params.token);
  if (!sub) return res.status(404).send(renderConfirmInvalid());
  res.send(renderUnsubscribeAsk(sub));
});
router.post('/subscribe/stop/:token', (req, res) => {
  const email = unsubscribeByToken(req.params.token);
  if (!email) return res.status(404).send(renderConfirmInvalid());
  res.send(renderUnsubscribeDone(email));
});

// ── Admin : valider un abonné à la main depuis la page Système ──
// Dépannage quand l'e-mail de confirmation n'arrive jamais (spam, faute
// de frappe corrigée de vive voix…) : l'admin confirme l'abonnement
// lui-même, sans passer par le lien du double opt-in.
router.post('/subscribe/validate', requireAuth, requireCsrf, (req, res) => {
  confirmByEmail(req.body.email);
  res.redirect('/settings/subscribers');
});

// ── Admin : retirer un abonné depuis la page Système ──────
router.post('/subscribe/remove', requireAuth, requireCsrf, (req, res) => {
  removeEmail(req.body.email);
  res.redirect('/settings/subscribers');
});

module.exports = router;
