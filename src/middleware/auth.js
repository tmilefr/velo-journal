// ── Auth middleware ───────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.auth || req.session.margot) return next();
  res.redirect('/login');
}
function requireAdmin(req, res, next) {
  if (req.session.auth) return next();
  res.redirect('/login');
}
function requireFamily(req, res, next) {
  if (req.session.auth || req.session.family || req.session.margot) return next();
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}
function filterPostsByRole(posts, req) {
  if (req.session.auth || req.session.margot) return posts;
  return posts.filter(p => !p.visibility || p.visibility === 'all');
}

module.exports = { requireAuth, requireAdmin, requireFamily, filterPostsByRole };
