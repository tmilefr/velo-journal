// ── Processus fils : compose le livre Word hors du serveur ─
// Lancé par livreDocxJob. La composition consomme beaucoup de mémoire : dans
// un processus à part, elle est limitée, mise en basse priorité, et rendue
// intégralement au système à la fin — le site ne peut pas en tomber.
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { buildLivreDocx } = require('./livreDocx');

process.once('message', async ({ stages, maxPhotos }) => {
  try {
    const buf = await buildLivreDocx(stages, { maxPhotos });
    const file = path.join(os.tmpdir(), `livre-photo-${process.pid}-${Date.now()}.docx`);
    fs.writeFileSync(file, buf);
    process.send({ file });
  } catch(e) {
    process.send({ error: String((e && e.message) || e) });
  }
  process.exit(0);
});
