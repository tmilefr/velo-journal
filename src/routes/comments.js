// ── Commentaires : liste, ajout, réponse, suppression (admin) ──
const express = require('express');
const crypto  = require('crypto');
const { readPosts, writePosts } = require('../services/posts');
const { flattenComments, commentAuthors } = require('../services/comments');
const { notifyNewComment, siteBaseUrl } = require('../services/mailer');
const { csrfToken, requireCsrf } = require('../middleware/csrf');
const { requireAuth, requireFamily, filterPostsByRole } = require('../middleware/auth');
const { renderComments } = require('../views/comments');

const router = express.Router();

// ── Page « 💬 Commentaires » : tous les messages du carnet ──
// Les étapes non publiées restent masquées aux lecteurs (filterPostsByRole),
// leurs commentaires aussi. Le filtre par prénom voyage dans l'URL, ce qui rend
// « les commentaires de Mamie » partageable et rechargeable tel quel.
router.get('/commentaires', requireFamily, (req, res) => {
  const posts  = filterPostsByRole(readPosts(), req);
  const author = String(req.query.auteur || '').trim().substring(0, 40);
  const order  = req.query.ordre === 'ancien' ? 'ancien' : 'recent';
  const token  = csrfToken(req);
  req.session.save(() => res.send(renderComments(
    flattenComments(posts, { author, order }),
    commentAuthors(posts),
    {
      author, order,
      total:         flattenComments(posts).length,
      isAdmin:       !!req.session.auth || !!req.session.margot,
      isStrictAdmin: !!req.session.auth,
      csrf:          token,
    }
  )));
});

router.post('/comment/:id', requireFamily, requireCsrf, (req, res) => {
  const posts = readPosts();
  const post  = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).send('Étape introuvable');
  if (!post.comments) post.comments = [];
  const { author, text } = req.body;
  if (!author?.trim() || !text?.trim()) return res.redirect('/#' + req.params.id);
  const comment = {
    id:     crypto.randomBytes(6).toString('hex'),
    author: author.trim().substring(0, 40),
    text:   text.trim().substring(0, 300),
    date:   new Date().toISOString()
  };
  post.comments.push(comment);
  writePosts(posts);
  // Prévient les adresses réglées dans Système (envoi en arrière-plan)
  notifyNewComment(post, comment, siteBaseUrl(req));
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
  const reply = {
    id:     crypto.randomBytes(6).toString('hex'),
    author: author.trim().substring(0, 40),
    text:   text.trim().substring(0, 300),
    date:   new Date().toISOString()
  };
  parent.replies.push(reply);
  writePosts(posts);
  notifyNewComment(post, reply, siteBaseUrl(req), parent);
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
  // Suppression déclenchée depuis la page « 💬 Commentaires » : on y revient,
  // filtre et ordre compris, plutôt que de renvoyer au journal.
  if (req.body.retour === 'commentaires') return res.redirect('/commentaires');
  res.redirect('/#post-' + req.params.postId);
});

module.exports = router;
