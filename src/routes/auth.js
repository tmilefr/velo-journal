// ── Connexion / déconnexion ───────────────────────────────
const express = require('express');
const rateLimit = require('express-rate-limit');
const { ADMIN_PASSWORD, FAMILY_PASSWORD, MARGOT_PASSWORD } = require('../config');
const { renderLogin } = require('../views/login');

const router = express.Router();

// ── Rate limiting ─────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/login', (req, res) => {
  if (req.session.auth || req.session.family || req.session.margot) return res.redirect('/');
  res.send(renderLogin(false, req.query.next || '/'));
});

router.post('/login', loginLimiter, (req, res) => {
  const next = req.body.next || '/';
  const pw   = req.body.password;
  if (pw === ADMIN_PASSWORD) { req.session.auth = true; return res.redirect(next !== '/' ? next : '/'); }
  if (MARGOT_PASSWORD && pw === MARGOT_PASSWORD) { req.session.margot = true; return res.redirect(next); }
  if (pw === FAMILY_PASSWORD) { req.session.family = true; return res.redirect(next); }
  res.send(renderLogin(true, next));
});

router.get('/family-login', (req, res) => res.redirect('/login' + (req.query.next ? '?next=' + encodeURIComponent(req.query.next) : '')));

router.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

module.exports = router;
