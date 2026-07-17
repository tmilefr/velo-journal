// ── Point d'entrée : prépare les dossiers et lance le serveur ──
const fs   = require('fs');
const path = require('path');
const {
  PORT, DATA, UPLOADS_DIR,
  ADMIN_PASSWORD, FAMILY_PASSWORD, MARGOT_PASSWORD,
} = require('./src/config');
const app = require('./src/app');

fs.mkdirSync(path.dirname(DATA), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.listen(PORT, () => {
  console.log(`\n🚴 Velo Journal démarré sur http://localhost:${PORT}`);
  console.log(`   Mot de passe famille : ${FAMILY_PASSWORD}`);
  console.log(`   Mot de passe admin   : ${ADMIN_PASSWORD}`);
  if (MARGOT_PASSWORD) console.log(`   Mot de passe Margot  : ${MARGOT_PASSWORD}`);
  console.log(`   Page famille         : http://localhost:${PORT}/`);
  console.log(`   Poster une étape     : http://localhost:${PORT}/post\n`);
});
