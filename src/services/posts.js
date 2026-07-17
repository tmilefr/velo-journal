// ── Stockage des posts (fichier JSON) ─────────────────────
const fs = require('fs');
const { DATA } = require('../config');

function readPosts() {
  if (!fs.existsSync(DATA)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch (e) {
    console.error('[readPosts] posts.json corrompu, retour tableau vide :', e.message);
    return [];
  }
}
function writePosts(posts) {
  fs.writeFileSync(DATA, JSON.stringify(posts, null, 2));
}

module.exports = { readPosts, writePosts };
