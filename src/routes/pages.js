// ── Pages publiques : journal, timeline, carte, stats, préparation, RSS ──
const express = require('express');
const { readPosts } = require('../services/posts');
const { csrfToken } = require('../middleware/csrf');
const { requireAdmin, requireFamily, filterPostsByRole } = require('../middleware/auth');
const { renderCard } = require('../views/card');
const { renderPublic } = require('../views/journal');
const { renderPreparation } = require('../views/preparation');
const { renderTimeline } = require('../views/timeline');
const { renderStats } = require('../views/stats');
const { renderMap } = require('../views/map');
const { renderRSS } = require('../views/rss');

const router = express.Router();

router.get('/', requireFamily, (req, res) => {
  const posts = filterPostsByRole(
    readPosts().filter(p => p.type !== 'preparation').sort((a, b) => new Date(b.date) - new Date(a.date)),
    req
  );
  const token = csrfToken(req);
  req.session.save(() => res.send(renderPublic(posts, !!req.session.auth || !!req.session.margot, token, !!req.session.auth)));
});

// Pagination du feed (lazy-load) : renvoie les cartes HTML à partir d'un offset
router.get('/api/posts', requireFamily, (req, res) => {
  const PAGE = 5;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const posts = filterPostsByRole(
    readPosts().filter(p => p.type !== 'preparation').sort((a, b) => new Date(b.date) - new Date(a.date)),
    req
  );
  const isAdmin = !!req.session.auth || !!req.session.margot;
  const isStrictAdmin = !!req.session.auth;
  const token   = csrfToken(req);
  const slice   = posts.slice(offset, offset + PAGE);
  const html    = slice.map(p => renderCard(p, isAdmin, token, isStrictAdmin)).join('');
  req.session.save(() => res.json({
    html,
    count:   slice.length,
    hasMore: offset + PAGE < posts.length
  }));
});

router.get('/timeline', requireFamily, (req, res) => {
  const posts = filterPostsByRole(readPosts().filter(p => p.type !== 'preparation').sort((a, b) => new Date(a.date) - new Date(b.date)), req);
  const token = csrfToken(req);
  req.session.save(() => res.send(renderTimeline(posts, !!req.session.auth || !!req.session.margot, !!req.session.auth, token)));
});

router.get('/map', requireFamily, (req, res) => {
  const posts = filterPostsByRole(readPosts().filter(p => p.type !== 'preparation').sort((a, b) => new Date(a.date) - new Date(b.date)), req);
  const token = csrfToken(req);
  req.session.save(() => res.send(renderMap(posts, !!req.session.auth || !!req.session.margot, !!req.session.auth, token)));
});

router.get('/stats', requireAdmin, (req, res) => {
  const allPosts = readPosts();
  const posts = allPosts.filter(p => p.type !== 'preparation');
  res.send(renderStats(posts, true, allPosts));
});

router.get('/preparation', requireFamily, (req, res) => {
  const posts = filterPostsByRole(
    readPosts().filter(p => p.type === 'preparation').sort((a, b) => new Date(b.date) - new Date(a.date)),
    req
  );
  const token = csrfToken(req);
  req.session.save(() => res.send(renderPreparation(posts, !!req.session.auth || !!req.session.margot, token, !!req.session.auth)));
});

router.get('/rss', requireFamily, (req, res) => {
  const posts = filterPostsByRole(readPosts().sort((a, b) => new Date(b.date) - new Date(a.date)), req);
  res.type('application/rss+xml');
  res.send(renderRSS(posts));
});

module.exports = router;
