// ── Système : sauvegardes, restauration, réglages ─────────
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { DATA, UPLOADS_DIR } = require('../config');
const { buildZip } = require('../lib/zip');
const { readPosts, writePosts } = require('../services/posts');
const { readSubscribers } = require('../services/subscribers');
const { isVideoUrl, pickCover } = require('../services/media');
const { geoJobStatus } = require('../services/geo');
const { uploadBackup } = require('../middleware/upload');
const { csrfToken, requireCsrf } = require('../middleware/csrf');
const { requireAuth } = require('../middleware/auth');
const { renderSystemHome, renderBackup, renderRecalc, renderSubscribers } = require('../views/settings');
const { renderAffiche } = require('../views/affiche');
const { reliefGrid } = require('../services/relief');

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

// ── Système : un sommaire, puis une page par section ──────
router.get('/settings', requireAuth, (req, res) => {
  res.send(renderSystemHome(!!req.session.auth, geoJobStatus()));
});

router.get('/settings/backup', requireAuth, (req, res) => {
  const token = csrfToken(req);
  req.session.save(() => res.send(
    renderBackup(token, req.query.restored === '1', !!req.session.auth)
  ));
});

router.get('/settings/recalc', requireAuth, (req, res) => {
  const token = csrfToken(req);
  const recalc = req.query.recalc != null
    ? {
        updated: parseInt(req.query.recalc, 10) || 0,
        scanned: parseInt(req.query.scanned, 10) || 0,
        errors:  parseInt(req.query.errors, 10) || 0,
      }
    : null;
  const train = req.query.train != null
    ? {
        updated: parseInt(req.query.train, 10) || 0,
        scanned: parseInt(req.query.trainScanned, 10) || 0,
        errors:  parseInt(req.query.trainErrors, 10) || 0,
      }
    : null;
  // Détection des pays : 'started' / 'running' au retour du POST, et l'état du
  // traitement de fond (avancement ou bilan de la dernière exécution).
  const geo = ['started', 'running'].includes(req.query.geo) ? req.query.geo : null;
  req.session.save(() => res.send(
    renderRecalc(token, recalc, geo, geoJobStatus(), !!req.session.auth, train)
  ));
});

router.get('/settings/subscribers', requireAuth, (req, res) => {
  const token = csrfToken(req);
  req.session.save(() => res.send(
    renderSubscribers(token, readSubscribers(), !!req.session.auth)
  ));
});

// ── Affiche : la carte du voyage en A3, photos autour ────
// Génère (côté client, sur canvas) une affiche A3 : les traces GPX sur un fond
// épuré (frontières, littoraux, relief ombré) et la photo favorite des étapes
// disposée en cadre, chacune reliée par un fil à son point d'arrivée.
router.get('/affiche', requireAuth, (req, res) => {
  const stages = readPosts()
    .filter(p => p.type !== 'preparation' && (p.gpx || (p.lat != null && p.lon != null)))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .map(p => {
      // Photo mise en avant par l'auteur (⭐) ; on ignore les vidéos, non
      // dessinables sur un canvas, en retombant sur la première image.
      const cover  = pickCover(p.photos, p.cover);
      const photos = p.photos || [];
      return {
        gpx:      p.gpx || null,
        title:    p.title || '',
        location: p.location || '',
        date:     p.date || '',
        km:       parseFloat(p.km) || 0,
        dplus:    parseInt(p.dplus, 10) || 0,
        lat:      p.lat != null ? Number(p.lat) : null,
        lon:      p.lon != null ? Number(p.lon) : null,
        photo: (cover && !isVideoUrl(cover))
          ? cover
          : (photos.find(ph => !isVideoUrl(ph)) || null),
      };
    });
  res.send(renderAffiche(stages, !!req.session.auth));
});

// Grille d'altitudes de l'emprise de l'affiche, pour l'ombrage du relief.
// Le calcul interroge Open-Meteo (quelques dizaines d'appels) puis reste en
// cache sur le disque : seule la première composition d'une emprise attend.
router.get('/api/affiche/relief', requireAuth, async (req, res) => {
  try {
    const grid = await reliefGrid(req.query);
    if (!grid) return res.status(503).json({ error: 'Relief indisponible' });
    res.json(grid);
  } catch(e) {
    console.warn('[relief] échec du calcul :', e.message || e);
    res.status(503).json({ error: 'Relief indisponible' });
  }
});

// Un fichier refusé par le filtre (autre chose qu'un .json) doit répondre un
// message clair, pas la page d'erreur par défaut d'Express.
const acceptBackup = (req, res, next) =>
  uploadBackup.single('backup')(req, res, err =>
    err ? res.status(400).send('Fichier refusé : ' + err.message) : next());

router.post('/restore', requireAuth, requireCsrf, acceptBackup, (req, res) => {
  if (!req.file) return res.status(400).send('Aucun fichier reçu.');
  const tmpPath = req.file.path;
  try {
    const raw = fs.readFileSync(tmpPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Format invalide — tableau attendu.');
    writePosts(parsed);
    res.redirect('/settings/backup?restored=1');
  } catch(e) {
    res.status(400).send('Fichier invalide : ' + e.message);
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

module.exports = router;
