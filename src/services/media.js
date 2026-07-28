// ── Médias uploadés (redimensionnement, suppression) ──────
const fs   = require('fs');
const path = require('path');
const { PUBLIC_DIR } = require('../config');
let sharp; try { sharp = require('sharp'); } catch(e) { sharp = null; }

// Type de média d'une URL d'upload
function isVideoUrl(u) {
  return /\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(u || '');
}

// Média mis en avant sur la carte du post.
// On respecte le choix de l'auteur tant que ce média est toujours présent ;
// sinon on retombe sur la première photo (à défaut, le premier média).
function pickCover(photos, requested) {
  const list = photos || [];
  if (!list.length) return null;
  if (requested && list.includes(requested)) return requested;
  return list.find(u => !isVideoUrl(u)) || list[0];
}

async function resizeUploadedImages(files) {
  if (!sharp || !files || !files.length) return;
  for (const file of files) {
    if (!file.mimetype.startsWith('image/')) continue;
    const tmpPath = file.path + '.tmp';
    try {
      await sharp(file.path)
        .rotate()
        .resize(1800, 1800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, progressive: true })
        .toFile(tmpPath);
      fs.renameSync(tmpPath, file.path);
      if (!file.path.endsWith('.jpg') && !file.path.endsWith('.jpeg')) {
        const newPath = file.path.replace(/\.[^.]+$/, '.jpg');
        fs.renameSync(file.path, newPath);
        file.path     = newPath;
        file.filename = path.basename(newPath);
      }
    } catch(e) {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  }
}

function deletePostFiles(post) {
  for (const photo of (post.photos || [])) {
    const abs = path.join(PUBLIC_DIR, photo);
    if (fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch(e){} }
  }
  if (post.gpx) {
    const abs = path.join(PUBLIC_DIR, post.gpx);
    if (fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch(e){} }
  }
}

module.exports = { isVideoUrl, pickCover, resizeUploadedImages, deletePostFiles };
