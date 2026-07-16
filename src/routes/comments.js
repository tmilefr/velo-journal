// ── Commentaires : ajout, réponse, suppression (admin) ────
const express = require('express');
const crypto  = require('crypto');
const { readPosts, writePosts } = require('../services/posts');
const { requireCsrf } = require('../middleware/csrf');
const { requireAuth, requireFamily } = require('../middleware/auth');

const router = express.Router();

router.post('/comment/:id', requireFamily, requireCsrf, (req, res) => {
  const posts = readPosts();
  const post  = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).send('Étape introuvable');
  if (!post.comments) post.comments = [];
  const { author, text } = req.body;
  if (!author?.trim() || !text?.trim()) return res.redirect('/#' + req.params.id);
  post.comments.push({
    id:     crypto.randomBytes(6).toString('hex'),
    author: author.trim().substring(0, 40),
    text:   text.trim().substring(0, 300),
    date:   new Date().toISOString()
  });
  writePosts(posts);
  res.redirect('/#post-' + req.params.id);
});

// ── Répondre à un commentaire ─────────────────────────────
router.post('/comment/:postId/reply/:commentId', requireFamily, requireCsrf, (req, res) => {
  const posts = readPosts();
  const post  = posts.find(p => p.id === req.params.postId);
  if (!post) return res.status(404).send('Étape introuvable');
  const parent = (post.comments || []).find(c => c.id === req.params.commentId);
  if (!parent) return res.status(404).send('Commentaire introuvable');
  const { author, text } = req.body;
  if (!author?.trim() || !text?.trim()) return res.redirect('/#post-' + req.params.postId);
  if (!parent.replies) parent.replies = [];
  parent.replies.push({
    id:     crypto.randomBytes(6).toString('hex'),
    author: author.trim().substring(0, 40),
    text:   text.trim().substring(0, 300),
    date:   new Date().toISOString()
  });
  writePosts(posts);
  res.redirect('/#post-' + req.params.postId);
});

// ── Admin : supprimer un commentaire ──────────────────────
router.post('/comment/:postId/delete/:commentId', requireAuth, requireCsrf, (req, res) => {
  const posts = readPosts();
  const post  = posts.find(p => p.id === req.params.postId);
  if (!post) return res.status(404).send('\u00c9tape introuvable');
  // Supprime soit un commentaire racine, soit une réponse imbriquée
  post.comments = (post.comments || []).filter(c => c.id !== req.params.commentId);
  post.comments.forEach(c => {
    if (c.replies) c.replies = c.replies.filter(r => r.id !== req.params.commentId);
  });
  writePosts(posts);
  res.redirect('/#post-' + req.params.postId);
});

module.exports = router;
