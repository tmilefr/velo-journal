// ── Debug log ─────────────────────────────────────────────
// Journalise dans application.log et duplique les sorties console.
const fs = require('fs');
const { LOG_FILE } = require('../config');

function logDebug(msg) {
  const line = new Date().toISOString() + ' ' + msg + '\n';
  fs.appendFileSync(LOG_FILE, line);
}

// Redirige console.log/warn/error vers le fichier de log et
// capture les erreurs non gérées. À appeler une seule fois au démarrage.
function setupLogging() {
  const _origLog   = console.log.bind(console);
  const _origWarn  = console.warn.bind(console);
  const _origError = console.error.bind(console);
  console.log   = (...a) => { _origLog(...a);   logDebug('[LOG]   ' + a.join(' ')); };
  console.warn  = (...a) => { _origWarn(...a);  logDebug('[WARN]  ' + a.join(' ')); };
  console.error = (...a) => { _origError(...a); logDebug('[ERROR] ' + a.join(' ')); };
  process.on('uncaughtException',  e => logDebug('[UNCAUGHT] ' + e.stack || e.message));
  process.on('unhandledRejection', e => logDebug('[UNHANDLED] ' + (e?.stack || e)));
}

module.exports = { logDebug, setupLogging };
