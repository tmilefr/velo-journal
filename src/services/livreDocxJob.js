// ── Lance la composition du livre Word dans un processus fils ──
const os   = require('os');
const path = require('path');
const { fork } = require('child_process');

const MAX_HEAP_MB = 768;   // plafond du fils : au-delà, il s'arrête seul au lieu d'étouffer le serveur

// Résout avec le chemin d'un fichier .docx temporaire (à supprimer après envoi)
function composeLivreDocx(stages, maxPhotos) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'livreDocxWorker.js'), [], {
      execArgv: [`--max-old-space-size=${MAX_HEAP_MB}`],
      env: { ...process.env, MALLOC_ARENA_MAX: '2' },   // limite la fragmentation mémoire de libvips
    });
    try { os.setPriority(child.pid, 10); } catch(e) { /* priorité basse : facultatif */ }
    let done = false;
    const finish = (fn, v) => { if (!done) { done = true; fn(v); } };
    child.once('message', m => m.file ? finish(resolve, m.file) : finish(reject, new Error(m.error || 'échec')));
    child.once('error', e => finish(reject, e));
    child.once('exit', code => finish(reject, new Error(`processus de composition arrêté (code ${code}) — mémoire insuffisante ?`)));
    child.send({ stages, maxPhotos });
  });
}

module.exports = { composeLivreDocx };
