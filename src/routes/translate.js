// ── Traduction automatique d'un post ──────────────────────
const express = require('express');
const { esc } = require('../lib/html');
const { readPosts, writePosts } = require('../services/posts');
const { TRANSLATE_LANGS, htmlToPlainText, plainTextToHtml, translateLongText } = require('../services/translation');
const { requireCsrf } = require('../middleware/csrf');
const { requireFamily } = require('../middleware/auth');

const router = express.Router();

router.post('/translate/:id', requireFamily, requireCsrf, async (req, res) => {
  try {
    const lang = req.body?.lang;
    if (!TRANSLATE_LANGS[lang]) return res.status(400).json({ error: 'Langue non supportée.' });

    const posts = readPosts();
    const idx   = posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Étape introuvable.' });
    const post = posts[idx];

    if (!post.translations) post.translations = {};
    const cached = post.translations[lang];
    if (cached) return res.json({ title: cached.title, body: cached.body, cached: true });

    const plainBody = htmlToPlainText(post.body || '');
    const [trTitle, trBody] = await Promise.all([
      translateLongText(post.title || '', lang),
      translateLongText(plainBody, lang)
    ]);

    const cleanTitle = esc(trTitle.trim());
    const cleanBody  = plainTextToHtml(trBody);

    post.translations[lang] = { title: cleanTitle, body: cleanBody };
    posts[idx] = post;
    writePosts(posts);

    res.json({ title: cleanTitle, body: cleanBody, cached: false });
  } catch (e) {
    console.error('[translate]', e.message);
    res.status(502).json({ error: 'Service de traduction indisponible pour le moment. Réessayez plus tard.' });
  }
});

module.exports = router;
