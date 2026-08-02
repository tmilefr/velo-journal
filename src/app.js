// ── Assemblage de l'application Express ───────────────────
const express = require('express');
const helmet  = require('helmet');
const session = require('express-session');
const path    = require('path');
const { SESSION_SECRET, PUBLIC_DIR } = require('./config');
const { setupLogging } = require('./lib/logger');
const { requireFamily } = require('./middleware/auth');

setupLogging();

const app = express();

// ── Middleware ────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: 'auto',
    sameSite: 'lax'
  }
}));

// ── Helmet ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "unpkg.com"],
      styleSrc:   ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "unpkg.com"],
      fontSrc:    ["'self'", "fonts.gstatic.com"],
      // blob: → aperçus locaux (URL.createObjectURL) des photos/vidéos avant envoi
      imgSrc:     ["'self'", "data:", "blob:", "*.tile.openstreetmap.org", "nominatim.openstreetmap.org"],
      mediaSrc:   ["'self'", "blob:"],
      connectSrc: ["'self'", "nominatim.openstreetmap.org", "unpkg.com"],
    }
  },
  crossOriginEmbedderPolicy: false,
}));

// ── Fichiers statiques ────────────────────────────────────
app.use('/uploads', requireFamily, express.static(path.join(PUBLIC_DIR, 'uploads')));
app.use('/public', express.static(PUBLIC_DIR));

// ── Routes ────────────────────────────────────────────────
app.use(require('./routes/pages'));
app.use(require('./routes/comments'));
app.use(require('./routes/translate'));
app.use(require('./routes/auth'));
app.use(require('./routes/subscribe'));
app.use(require('./routes/posts'));
app.use(require('./routes/system'));

module.exports = app;
