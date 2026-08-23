// ── Commentaires : lecture transversale de toutes les étapes ──
// Les commentaires vivent dans posts.json, imbriqués sous chaque étape
// (et les réponses sous chaque commentaire). Pour la page « 💬 Commentaires »
// on les remet à plat, du plus récent au plus ancien.

// Un commentaire (ou une réponse) accompagné de son étape d'origine.
function entry(post, c, parent = null) {
  return {
    id:       c.id,
    author:   c.author || '',
    text:     c.text || '',
    date:     c.date || '',
    isReply:  !!parent,
    replyTo:  parent ? (parent.author || '') : '',
    postId:   post.id,
    postTitle: post.title || '',
    postType:  post.type || '',
    postDate:  post.date || '',
    // Les articles de préparation ont leur propre page
    postUrl:  (post.type === 'preparation' ? '/preparation' : '/') + '#post-' + post.id,
  };
}

// Tous les commentaires des étapes fournies, à plat.
// `order` : 'recent' (défaut) du plus récent au plus ancien, 'ancien' l'inverse.
function flattenComments(posts, { author = '', order = 'recent' } = {}) {
  const needle = String(author ?? '').trim().toLowerCase();
  const out = [];
  (posts || []).forEach(post => {
    (post.comments || []).forEach(c => {
      out.push(entry(post, c));
      (c.replies || []).forEach(r => out.push(entry(post, r, c)));
    });
  });
  const filtered = needle
    ? out.filter(c => c.author.toLowerCase().includes(needle))
    : out;
  filtered.sort((a, b) => order === 'ancien'
    ? String(a.date).localeCompare(String(b.date))
    : String(b.date).localeCompare(String(a.date)));
  return filtered;
}

// Les prénoms rencontrés, avec le nombre de messages de chacun.
// Sert à proposer un filtre en un clic plutôt qu'une saisie à l'aveugle.
// « Papi » et « papi » comptent pour la même personne : le filtre ignore la
// casse, et la pastille affiche l'orthographe avec une majuscule si elle existe.
function commentAuthors(posts) {
  const groups = new Map();  // prénom en minuscules → { name, count }
  flattenComments(posts).forEach(c => {
    const key = c.author.trim();
    if (!key) return;
    const slug = key.toLowerCase();
    const group = groups.get(slug) || { name: key, count: 0 };
    group.count++;
    // On retient la graphie capitalisée plutôt qu'une saisie tout en minuscules
    if (/^[a-zà-öø-ÿ]/.test(group.name) && !/^[a-zà-öø-ÿ]/.test(key)) group.name = key;
    groups.set(slug, group);
  });
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'));
}

module.exports = { flattenComments, commentAuthors };
