const multer = require('multer');
const path   = require('path');
const crypto = require('crypto');
const { UPLOADS_DIR } = require('../config');

// ── Multer (photos) ───────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename:    (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = file.mimetype.startsWith('image/')
      || file.mimetype.startsWith('video/')
      || file.originalname.toLowerCase().endsWith('.gpx');
    if (ok) cb(null, true);
    else cb(new Error('Images, vidéos et GPX seulement'));
  }
});

module.exports = { upload };
