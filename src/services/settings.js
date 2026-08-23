// ── Réglages modifiables depuis la page Système ───────────
// Ce que l'on règle depuis le site (et non depuis .env) vit dans
// data/settings.json : aujourd'hui les adresses prévenues à chaque
// commentaire déposé sur le carnet.
const fs = require('fs');
const { SETTINGS } = require('../config');

const MAX_COMMENT_EMAILS = 20;

const DEFAULTS = {
  commentEmails: [],   // destinataires des notifications de commentaire
};

function readSettings() {
  if (!fs.existsSync(SETTINGS)) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    return { ...DEFAULTS, ...parsed };
  } catch (e) {
    console.error('[readSettings] settings.json corrompu, valeurs par défaut :', e.message);
    return { ...DEFAULTS };
  }
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2));
}

function isValidEmail(email) {
  return email.length >= 5 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// Découpe une saisie libre (une adresse par ligne, ou séparées par des
// virgules/points-virgules/espaces) en liste d'adresses propres.
// Renvoie { emails, rejected } — `rejected` sert à prévenir l'admin des
// adresses écartées plutôt que de les perdre en silence.
function parseEmailList(raw) {
  const seen  = new Set();
  const emails = [];
  const rejected = [];
  String(raw ?? '').split(/[\s,;]+/).forEach(part => {
    const clean = part.trim().toLowerCase();
    if (!clean) return;
    if (!isValidEmail(clean)) { rejected.push(part.trim()); return; }
    if (seen.has(clean)) return;
    seen.add(clean);
    if (emails.length < MAX_COMMENT_EMAILS) emails.push(clean);
    else rejected.push(clean);
  });
  return { emails, rejected };
}

// Adresses à prévenir quand un commentaire est déposé
function commentEmails() {
  const list = readSettings().commentEmails;
  return Array.isArray(list) ? list.filter(e => typeof e === 'string' && isValidEmail(e)) : [];
}

// Enregistre la liste saisie dans Système → Commentaires.
// Renvoie { emails, rejected } pour l'affichage du bandeau de retour.
function setCommentEmails(raw) {
  const { emails, rejected } = parseEmailList(raw);
  const settings = readSettings();
  settings.commentEmails = emails;
  writeSettings(settings);
  return { emails, rejected };
}

module.exports = {
  MAX_COMMENT_EMAILS,
  readSettings, writeSettings,
  parseEmailList, commentEmails, setCommentEmails,
};
