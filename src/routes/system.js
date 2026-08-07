// ── Système : sauvegardes, restauration, réglages ─────────
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { DATA, UPLOADS_DIR } = require('../config');
const { buildZip } = require('../lib/zip');
const { readPosts, writePosts } = require('../services/posts');
const { readSubscribers } = require('../services/subscribers');
const { isVideoUrl, pickCover } = require('../services/media');
const { upload } = require('../middleware/upload');
const { csrfToken, requireCsrf } = require('../middleware/csrf');
const { requireAuth } = require('../middleware/auth');
const { renderSettings } = require('../views/settings');
const { renderPanorama } = require('../views/panorama');

const router = express.Router();

router.get('/backup', requireAuth, (req, res) => {
  if (!fs.existsSync(DATA)) return res.status(404).send('Aucune donnée à sauvegarder.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  res.setHeader('Content-Disposition', `attachment; filename="velo-backup-${stamp}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(fs.readFileSync(DATA, 'utf8'));
});

// ── Sauvegarde complète : ZIP avec posts.json + tous les médias ──
router.get('/backup-full', requireAuth, (req, res) => {
  if (!fs.existsSync(DATA)) return res.status(404).send('Aucune donnée à sauvegarder.');
  try {
    const entries = [];
    // 1. Les données
    entries.push({ name: 'posts.json', data: fs.readFileSync(DATA) });
    // 2. Tous les médias présents dans public/uploads
    const upDir = UPLOADS_DIR;
    if (fs.existsSync(upDir)) {
      for (const file of fs.readdirSync(upDir)) {
        const abs = path.join(upDir, file);
        try {
          const st = fs.statSync(abs);
          if (st.isFile()) entries.push({ name: 'uploads/' + file, data: fs.readFileSync(abs) });
        } catch(e) { /* ignore fichier illisible */ }
      }
    }
    const zip = buildZip(entries);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Disposition', `attachment; filename="velo-backup-complet-${stamp}.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', zip.length);
    res.send(zip);
  } catch(e) {
    console.error('[backup-full] erreur :', e.message);
    res.status(500).send('Erreur lors de la création de l\'archive : ' + e.message);
  }
});

router.get('/settings', requireAuth, (req, res) => {
  const token = csrfToken(req);
  const recalc = req.query.recalc != null
    ? {
        updated: parseInt(req.query.recalc, 10) || 0,
        scanned: parseInt(req.query.scanned, 10) || 0,
        errors:  parseInt(req.query.errors, 10) || 0,
      }
    : null;
  const geo = req.query.geo != null
    ? {
        updated: parseInt(req.query.geo, 10) || 0,
        scanned: parseInt(req.query.geoScanned, 10) || 0,
        errors:  parseInt(req.query.geoErrors, 10) || 0,
      }
    : null;
  req.session.save(() => res.send(renderSettings(token, req.query.restored === '1', recalc, readSubscribers(), geo)));
});

// ── Panorama : profils de dénivelé de toutes les étapes mis bout à bout ──
// Génère (côté client, sur canvas) une série de pages A4 avec la coupe
// altimétrique continue du voyage, un trait en biais vers chaque point
// d'arrivée de GPX, et la photo favorite de chaque étape reliée à sa trace.
router.get('/panorama', requireAuth, (req, res) => {
  const stages = readPosts()
    .filter(p => p.gpx && p.type !== 'preparation')
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .map(p => {
      // Photo mise en avant par l'auteur (⭐) ; on ignore les vidéos, non
      // dessinables sur un canvas, en retombant sur la première image.
      const cover  = pickCover(p.photos, p.cover);
      const photos = p.photos || [];
      return {
        gpx:   p.gpx,
        title: p.title || p.location || '',
        date:  p.date || '',
        km:    parseInt(p.km) || 0,
        photo: (cover && !isVideoUrl(cover))
          ? cover
          : (photos.find(ph => !isVideoUrl(ph)) || null),
      };
    });
  res.send(renderPanorama(stages));
});

router.post('/restore', requireAuth, requireCsrf, upload.single('backup'), (req, res) => {
  if (!req.file) return res.status(400).send('Aucun fichier reçu.');
  const tmpPath = req.file.path;
  try {
    const raw = fs.readFileSync(tmpPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Format invalide — tableau attendu.');
    writePosts(parsed);
    res.redirect('/settings?restored=1');
  } catch(e) {
    res.status(400).send('Fichier invalide : ' + e.message);
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

module.exports = router;
