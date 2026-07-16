// ── Configuration centrale ────────────────────────────────
// Charge le fichier .env, expose les constantes d'environnement
// et les chemins absolus du projet (racine, données, uploads…).
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// Racine du projet (dossier parent de src/)
const ROOT = path.join(__dirname, '..');

// Lecture du fichier .env (pas de dépendance externe)
try {
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
      const clean = line.trim();
      if (!clean || clean.startsWith('#')) return;
      const eq = clean.indexOf('=');
      if (eq === -1) return;
      const key = clean.substring(0, eq).trim();
      const val = clean.substring(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    });
  }
} catch(e) { /* silencieux */ }

const PORT = process.env.PORT || 3000;

// ── Chemins ───────────────────────────────────────────────
const DATA        = path.join(ROOT, 'data', 'posts.json');
const PUBLIC_DIR  = path.join(ROOT, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const LOG_FILE    = path.join(ROOT, 'application.log');

// ── Config ────────────────────────────────────────────────
const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD  || 'velo2024';
const FAMILY_PASSWORD = process.env.FAMILY_PASSWORD || 'famille2024';
const MARGOT_PASSWORD = process.env.MARGOT_PASSWORD || '';
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL || ''; // optionnel : fait passer le quota gratuit de 5 000 à 50 000 caractères/jour
const SESSION_SECRET  = process.env.SESSION_SECRET  || crypto.randomBytes(32).toString('hex');
const TRIP_TITLE      = process.env.TRIP_TITLE      || 'Nijumatim, carnet de voyage à vélo';
const TRIP_START      = process.env.TRIP_START      || '';
const TRIP_END        = process.env.TRIP_END        || '';

if (ADMIN_PASSWORD === 'velo2024')     console.warn('⚠️  ADMIN_PASSWORD est la valeur par défaut — changez-la dans .env !');
if (FAMILY_PASSWORD === 'famille2024') console.warn('⚠️  FAMILY_PASSWORD est la valeur par défaut — changez-la dans .env !');
if (!process.env.SESSION_SECRET)       console.warn('⚠️  SESSION_SECRET non défini — les sessions seront invalidées à chaque redémarrage !');
if (!MYMEMORY_EMAIL)                   console.warn('ℹ️  MYMEMORY_EMAIL non défini — quota de traduction limité à 5 000 caractères/jour (50 000 avec un email renseigné dans .env).');

const AUTHORS = ['NiJuMaTim'];

module.exports = {
  ROOT, PORT,
  DATA, PUBLIC_DIR, UPLOADS_DIR, LOG_FILE,
  ADMIN_PASSWORD, FAMILY_PASSWORD, MARGOT_PASSWORD,
  MYMEMORY_EMAIL, SESSION_SECRET,
  TRIP_TITLE, TRIP_START, TRIP_END,
  AUTHORS,
};
