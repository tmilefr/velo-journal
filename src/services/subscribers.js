// ── Abonnés e-mail (fichier JSON) ─────────────────────────
// Double opt-in : un abonné est créé « en attente » puis confirmé
// via le lien reçu par e-mail. Le token sert aussi à se désabonner.
const fs     = require('fs');
const crypto = require('crypto');
const { SUBSCRIBERS } = require('../config');

const MAX_SUBSCRIBERS  = 500;
const PENDING_TTL_MS   = 7 * 24 * 60 * 60 * 1000; // confirmation valable 7 jours

function readSubscribers() {
  if (!fs.existsSync(SUBSCRIBERS)) return [];
  try {
    return JSON.parse(fs.readFileSync(SUBSCRIBERS, 'utf8'));
  } catch (e) {
    console.error('[readSubscribers] subscribers.json corrompu, retour tableau vide :', e.message);
    return [];
  }
}
function writeSubscribers(subs) {
  fs.writeFileSync(SUBSCRIBERS, JSON.stringify(subs, null, 2));
}

// Retire les inscriptions jamais confirmées après 7 jours
function prune(subs) {
  const now = Date.now();
  return subs.filter(s => s.confirmed || (now - new Date(s.createdAt).getTime()) < PENDING_TTL_MS);
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}
function isValidEmail(email) {
  return email.length >= 5 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// Inscrit (ou ré-inscrit) un e-mail.
// Renvoie { status: 'invalid' | 'full' | 'already' | 'pending', sub }
//  - 'already' : déjà confirmé, rien à faire
//  - 'pending' : e-mail de confirmation à (r)envoyer
function subscribe(email) {
  const clean = normalizeEmail(email);
  if (!isValidEmail(clean)) return { status: 'invalid' };

  const subs = prune(readSubscribers());
  const existing = subs.find(s => s.email === clean);
  if (existing && existing.confirmed) {
    writeSubscribers(subs);
    return { status: 'already', sub: existing };
  }
  if (existing) {
    existing.createdAt = new Date().toISOString(); // relance : on repart pour 7 jours
    writeSubscribers(subs);
    return { status: 'pending', sub: existing };
  }
  if (subs.length >= MAX_SUBSCRIBERS) return { status: 'full' };

  const sub = {
    email:       clean,
    token:       crypto.randomBytes(24).toString('hex'),
    confirmed:   false,
    createdAt:   new Date().toISOString(),
    confirmedAt: null,
  };
  subs.push(sub);
  writeSubscribers(subs);
  return { status: 'pending', sub };
}

function findByToken(token) {
  if (!token || !/^[a-f0-9]{48}$/.test(token)) return null;
  return readSubscribers().find(s => s.token === token) || null;
}

// Confirme un abonnement via son token. Renvoie l'abonné ou null.
function confirmByToken(token) {
  const subs = readSubscribers();
  const sub  = subs.find(s => s.token === token && /^[a-f0-9]{48}$/.test(String(token ?? '')));
  if (!sub) return null;
  if (!sub.confirmed) {
    sub.confirmed   = true;
    sub.confirmedAt = new Date().toISOString();
    writeSubscribers(subs);
  }
  return sub;
}

// Confirmation manuelle par l'admin (page Système), quand l'e-mail de
// confirmation n'arrive pas (spam, adresse recopiée à la main…).
// Renvoie l'abonné confirmé, ou null si l'adresse est inconnue.
function confirmByEmail(email) {
  const clean = normalizeEmail(email);
  const subs  = readSubscribers();
  const sub   = subs.find(s => s.email === clean);
  if (!sub) return null;
  if (!sub.confirmed) {
    sub.confirmed   = true;
    sub.confirmedAt = new Date().toISOString();
    writeSubscribers(subs);
  }
  return sub;
}

// Désabonne via token. Renvoie l'e-mail retiré ou null.
function unsubscribeByToken(token) {
  const subs = readSubscribers();
  const sub  = subs.find(s => s.token === token);
  if (!sub) return null;
  writeSubscribers(subs.filter(s => s !== sub));
  return sub.email;
}

// Suppression par l'admin (page Système)
function removeEmail(email) {
  const clean = normalizeEmail(email);
  const subs  = readSubscribers();
  const kept  = subs.filter(s => s.email !== clean);
  if (kept.length !== subs.length) writeSubscribers(kept);
  return kept.length !== subs.length;
}

function confirmedSubscribers() {
  return readSubscribers().filter(s => s.confirmed);
}

module.exports = {
  readSubscribers, subscribe, findByToken,
  confirmByToken, confirmByEmail, unsubscribeByToken, removeEmail,
  confirmedSubscribers,
};
