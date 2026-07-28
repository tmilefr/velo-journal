// ── Gestion des étapes : création, édition, suppression, recalculs ──
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const { AUTHORS, PUBLIC_DIR } = require('../config');
const { parisLocalToISO, isoToDatetimeLocal, parseEndDate } = require('../lib/dates');
const { sanitizeHtml } = require('../lib/html');
const { readPosts, writePosts } = require('../services/posts');
const { parseExpenses } = require('../services/expenses');
const { parseGpxStats } = require('../services/gpx');
const { resizeUploadedImages, deletePostFiles, pickCover } = require('../services/media');
const { maybeNotifyNewPost, siteBaseUrl } = require('../services/mailer');
const { upload } = require('../middleware/upload');
const { csrfToken, requireCsrf } = require('../middleware/csrf');
const { requireAuth } = require('../middleware/auth');
const { renderPostForm } = require('../views/postForm');
const { renderEditForm } = require('../views/editForm');

const router = express.Router();

router.get('/post', requireAuth, (req, res) => {
  const posts = readPosts().sort((a, b) => new Date(b.date) - new Date(a.date));
  const lastLocation = posts.length > 0 ? (posts[0].location || '') : '';
  const token = csrfToken(req);
  req.session.save(() => res.send(renderPostForm(null, lastLocation, !!req.session.margot, token, req.query.type || '')));
});

router.post('/post', requireAuth, requireCsrf, upload.fields([{name:'photos', maxCount:10},{name:'gpx', maxCount:1}]), async (req, res) => {
  const { title, body, location, lat, lon, km, dplus, author, visibility, postDate, endDate, type, privateNote } = req.body;
  if (!title?.trim() || !body?.trim()) {
    return res.send(renderPostForm('Titre et texte obligatoires.', '', !!req.session.margot, csrfToken(req)));
  }
  await resizeUploadedImages(req.files?.photos || []);
  const photos  = (req.files?.photos || []).map(f => '/uploads/' + f.filename);
  const gpxFile = req.files?.gpx?.[0] ? '/uploads/' + req.files.gpx[0].filename : null;

  let finalDate = new Date().toISOString();
  if (postDate) { const parsed = parisLocalToISO(postDate); if (parsed) finalDate = parsed; }

  // Étape sur plusieurs jours : on ne retient la date de fin que si elle est
  // postérieure au jour de début (sinon c'est une étape d'un seul jour).
  const finalEndDate = parseEndDate(endDate, finalDate);

  let finalLat = parseFloat(lat) || null;
  let finalLon = parseFloat(lon) || null;
  let finalKm  = parseFloat(km) || 0;
  let finalDp  = parseInt(dplus) || 0;
  if (gpxFile) {
    const stats = await parseGpxStats(path.join(PUBLIC_DIR, gpxFile), true);
    if (stats) {
      // On ne dérive lat/lon du GPX que si aucun point n'a été fixé manuellement côté client.
      if (finalLat === null || finalLon === null) { finalLat = stats.lat; finalLon = stats.lon; }
      if (!finalKm) finalKm = stats.km;
      if (!finalDp) finalDp = stats.dplus;
    }
  }

  const expenses = parseExpenses(req.body);
  const captions = (req.files?.photos || []).map((_, i) => (req.body['caption_new_' + i] || '').toString().trim().substring(0, 200));

  const posts    = readPosts();
  const validViz = ['all', 'margot', 'admin'];
  const forcedViz = req.session.margot ? 'margot' : (validViz.includes(visibility) ? visibility : 'all');
  const newId    = crypto.randomBytes(8).toString('hex');
  posts.push({
    id:         newId,
    date:       finalDate,
    endDate:    finalEndDate,
    title:      title.trim(),
    body:       sanitizeHtml(body),
    location:   location?.trim() || '',
    lat:        finalLat,
    lon:        finalLon,
    km:         finalKm,
    dplus:      finalDp,
    author:     AUTHORS.includes(author) ? author : AUTHORS[0],
    visibility: forcedViz,
    type:       (type === 'preparation') ? 'preparation' : 'etape',
    photos,
    captions,
    cover:      pickCover(photos, photos[parseInt(req.body.cover_new, 10)]),
    gpx:        gpxFile,
    expenses,
    privateNote: (privateNote || '').toString().trim().substring(0, 2000),
    comments:   []
  });
  writePosts(posts);
  maybeNotifyNewPost(newId, siteBaseUrl(req));
  res.redirect(type === 'preparation' ? '/preparation' : '/');
});

router.post('/delete/:id', requireAuth, requireCsrf, (req, res) => {
  const posts = readPosts();
  const post  = posts.find(p => p.id === req.params.id);
  if (post) deletePostFiles(post);
  writePosts(posts.filter(p => p.id !== req.params.id));
  res.redirect('/');
});

router.get('/edit/:id', requireAuth, (req, res) => {
  const posts = readPosts();
  const post  = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).send('Étape introuvable');
  const token = csrfToken(req);
  req.session.save(() => res.send(renderEditForm(post, null, !!req.session.margot, token)));
});

router.post('/edit/:id', requireAuth, requireCsrf, upload.fields([{name:'photos', maxCount:10},{name:'gpx', maxCount:1}]), async (req, res) => {
  const posts = readPosts();
  const idx   = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).send('Étape introuvable');
  const { title, body, location, lat, lon, km, dplus, visibility, postDate, endDate, privateNote } = req.body;
  if (!title?.trim() || !body?.trim()) {
    return res.send(renderEditForm(posts[idx], 'Titre et texte obligatoires.', !!req.session.margot, csrfToken(req)));
  }
  const existing = posts[idx];

  let finalDate = existing.date;
  // On ne met à jour la date que si l'utilisateur a réellement modifié le champ affiché.
  // (Le champ est pré-rempli en heure de Paris ; on compare à cette même représentation
  //  pour éviter toute dérive de fuseau horaire lors d'une simple ré-sauvegarde.)
  if (postDate && postDate !== isoToDatetimeLocal(existing.date)) {
    const parsed = parisLocalToISO(postDate);
    if (parsed) finalDate = parsed;
  }

  // Étape sur plusieurs jours : recalcule la date de fin par rapport à la date de début.
  const finalEndDate = parseEndDate(endDate, finalDate);

  await resizeUploadedImages(req.files?.photos || []);
  const newPhotos  = (req.files?.photos || []).map(f => '/uploads/' + f.filename);
  const keepPhotos = req.body.keepPhotos ? (Array.isArray(req.body.keepPhotos) ? req.body.keepPhotos : [req.body.keepPhotos]) : [];

  // Ordre des photos : photoOrder est une liste d'URLs (existantes conservées) dans l'ordre voulu.
  // Les nouvelles photos (non connues du client) sont ajoutées à la fin.
  let orderedKept = keepPhotos;
  if (req.body.photoOrder) {
    const order = Array.isArray(req.body.photoOrder) ? req.body.photoOrder : [req.body.photoOrder];
    orderedKept = order.filter(u => keepPhotos.includes(u));
    // sécurité : ré-ajoute toute photo conservée oubliée par l'ordre
    for (const u of keepPhotos) if (!orderedKept.includes(u)) orderedKept.push(u);
  }
  const photos = [...orderedKept, ...newPhotos];

  // Légendes : pour chaque photo conservée (caption_keep_<url>) puis chaque nouvelle (caption_new_<i>)
  const keepCaptions = orderedKept.map(url => (req.body['caption_keep_' + url] || '').toString().trim().substring(0, 200));
  const newCaptions  = (req.files?.photos || []).map((_, i) => (req.body['caption_new_' + i] || '').toString().trim().substring(0, 200));
  const captions = [...keepCaptions, ...newCaptions];

  for (const old of (existing.photos || [])) {
    if (!keepPhotos.includes(old)) {
      const abs = path.join(PUBLIC_DIR, old);
      if (fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch(e){} }
    }
  }

  const gpxFile = req.files?.gpx?.[0] ? '/uploads/' + req.files.gpx[0].filename : (req.body.keepGpx ? existing.gpx : null);
  if (req.files?.gpx?.[0] && existing.gpx && existing.gpx !== gpxFile) {
    const abs = path.join(PUBLIC_DIR, existing.gpx);
    if (fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch(e){} }
  }

  let finalLat = parseFloat(lat) || null;
  let finalLon = parseFloat(lon) || null;
  let finalKm  = parseFloat(km) || 0;
  let finalDp  = parseInt(dplus) || 0;
  // Si un NOUVEAU GPX est fourni, on relit toutes ses stats côté serveur (fiable)
  if (req.files?.gpx?.[0] && gpxFile) {
    const stats = await parseGpxStats(path.join(PUBLIC_DIR, gpxFile), true);
    if (stats) {
      // On ne dérive lat/lon du GPX que si aucun point n'a été fixé manuellement côté client.
      if (finalLat === null || finalLon === null) { finalLat = stats.lat; finalLon = stats.lon; }
      finalKm  = stats.km;
      finalDp  = stats.dplus;
    }
  }

  const newTitle = title.trim();
  const newBody  = sanitizeHtml(body);
  const validViz = ['all', 'margot', 'admin'];
  posts[idx] = {
    ...existing,
    date:       finalDate,
    endDate:    finalEndDate,
    title:      newTitle,
    body:       newBody,
    location:   location?.trim() || '',
    lat:        finalLat,
    lon:        finalLon,
    km:         finalKm,
    dplus:      finalDp,
    visibility: validViz.includes(visibility) ? visibility : (existing.visibility || 'all'),
    photos,
    captions,
    // Couverture : le choix de l'auteur, ou un repli automatique si le média
    // retenu vient d'être supprimé de l'étape.
    cover:      pickCover(photos, req.body.cover),
    gpx:        gpxFile,
    expenses:    parseExpenses(req.body),
    privateNote: (privateNote || '').toString().trim().substring(0, 2000),
    translations: (newTitle === existing.title && newBody === existing.body)
      ? (existing.translations || {})
      : {},
  };
  writePosts(posts);
  // Un post qui devient public à l'occasion de cette édition (ex. brouillon en
  // visibilité admin qu'on « valide ») déclenche la notification des abonnés —
  // une seule fois : maybeNotifyNewPost ignore les posts déjà notifiés.
  const wasPublic = !existing.visibility || existing.visibility === 'all';
  const isPublic  = !posts[idx].visibility || posts[idx].visibility === 'all';
  if (!wasPublic && isPublic) maybeNotifyNewPost(req.params.id, siteBaseUrl(req));
  res.redirect('/#post-' + req.params.id);
});

// ── Admin : recalculer le D+ d'une étape via l'API d'élévation ──
// Pour les GPX sans balises <ele> : relit la trace et interroge Open-Meteo.
router.post('/recalc-elevation/:id', requireAuth, requireCsrf, async (req, res) => {
  const posts = readPosts();
  const idx   = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).send('Étape introuvable');
  const post = posts[idx];
  if (!post.gpx) return res.status(400).send("Cette étape n'a pas de trace GPX.");

  const stats = await parseGpxStats(path.join(PUBLIC_DIR, post.gpx), true);
  if (!stats) return res.status(502).send('Impossible de lire la trace GPX.');

  if (stats.dplusSource === 'none') {
    return res.status(502).send("Le service d'élévation n'a pas répondu. Réessayez dans un instant.");
  }

  posts[idx] = { ...post, dplus: stats.dplus, km: post.km || stats.km };
  writePosts(posts);
  res.redirect('/edit/' + req.params.id);
});

// ── Admin : recalculer les distances (km) de toutes les étapes ──
// Relit chaque trace GPX présente et met à jour le km à partir des
// points de la trace (calcul Haversine, sans appel à l'API d'élévation).
router.post('/recalc-distances', requireAuth, requireCsrf, async (req, res) => {
  const posts = readPosts();
  let scanned = 0;   // étapes possédant une trace GPX
  let updated = 0;   // étapes dont le km a changé
  let errors  = 0;   // traces illisibles ou manquantes
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    if (!post.gpx) continue;
    scanned++;
    const abs = path.join(PUBLIC_DIR, post.gpx);
    if (!fs.existsSync(abs)) { errors++; continue; }
    const stats = await parseGpxStats(abs, false); // distance seule, pas d'API élévation
    if (!stats) { errors++; continue; }
    if (post.km !== stats.km) {
      posts[i] = { ...post, km: stats.km };
      updated++;
    }
  }
  writePosts(posts);
  res.redirect(`/settings?recalc=${updated}&scanned=${scanned}&errors=${errors}`);
});

module.exports = router;
