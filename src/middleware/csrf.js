const crypto = require('crypto');

// ── CSRF ──────────────────────────────────────────────────
function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  return req.session.csrf;
}
function requireCsrf(req, res, next) {
  const token = req.body._csrf || req.query._csrf || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrf) return res.status(403).send('Token CSRF invalide ou manquant.');
  next();
}

module.exports = { csrfToken, requireCsrf };
