const express   = require('express');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const multer    = require('multer');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const session = require('express-session');
let sharp; try { sharp = require('sharp'); } catch(e) { sharp = null; }

// Lecture du fichier .env (pas de dépendance externe)
try {
  const envFile = path.join(__dirname, '.env');
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

const app  = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data', 'posts.json');

// ── Config ────────────────────────────────────────────────
const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD  || 'velo2024';
const FAMILY_PASSWORD = process.env.FAMILY_PASSWORD || 'famille2024';
const MARGOT_PASSWORD = process.env.MARGOT_PASSWORD || '';
const SESSION_SECRET  = process.env.SESSION_SECRET  || crypto.randomBytes(32).toString('hex');
const TRIP_TITLE      = process.env.TRIP_TITLE      || 'Nijumatim, carnet de voyage à vélo';
const TRIP_START      = process.env.TRIP_START      || '';
const TRIP_END        = process.env.TRIP_END        || '';

// Avertissement si mots de passe par défaut encore actifs
if (ADMIN_PASSWORD === 'velo2024')     console.warn('⚠️  ADMIN_PASSWORD est la valeur par défaut — changez-la dans .env !');
if (FAMILY_PASSWORD === 'famille2024') console.warn('⚠️  FAMILY_PASSWORD est la valeur par défaut — changez-la dans .env !');
if (!process.env.SESSION_SECRET)       console.warn('⚠️  SESSION_SECRET non défini — les sessions seront invalidées à chaque redémarrage !');

const AUTHORS = ['NiJuMaTim'];

// ── Helpers ───────────────────────────────────────────────
function readPosts() {
  if (!fs.existsSync(DATA)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch (e) {
    console.error('[readPosts] posts.json corrompu, retour tableau vide :', e.message);
    return [];
  }
}
function writePosts(posts) {
  fs.writeFileSync(DATA, JSON.stringify(posts, null, 2));
}
function totalKm(posts) {
  return posts.reduce((s, p) => s + (parseFloat(p.km) || 0), 0);
}
function totalDPlus(posts) {
  return posts.reduce((s, p) => s + (parseInt(p.dplus) || 0), 0);
}

// ── Middleware ────────────────────────────────────────────
// Plesk et la plupart des hébergeurs proxifient les requêtes — requis pour
// que les cookies secure et les sessions fonctionnent correctement derrière un reverse proxy
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
    // 'auto' : secure uniquement si la requête arrive en HTTPS (détecté via X-Forwarded-Proto)
    secure: 'auto',
    sameSite: 'lax'
  }
}));


// ── Debug CSRF log ────────────────────────────────────────
const LOG_FILE = path.join(__dirname, 'csrf-debug.log');

function logDebug(msg) {
  const line = new Date().toISOString() + ' ' + msg + '\n';
  fs.appendFileSync(LOG_FILE, line);
}

// ── Redirection console vers fichier ─────────────────────
const _origLog   = console.log.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);

console.log   = (...a) => { _origLog(...a);   logDebug('[LOG]   ' + a.join(' ')); };
console.warn  = (...a) => { _origWarn(...a);  logDebug('[WARN]  ' + a.join(' ')); };
console.error = (...a) => { _origError(...a); logDebug('[ERROR] ' + a.join(' ')); };

// Erreurs non catchées
process.on('uncaughtException',  e => logDebug('[UNCAUGHT] ' + e.stack || e.message));
process.on('unhandledRejection', e => logDebug('[UNHANDLED] ' + (e?.stack || e)));

// ── Helmet — headers de sécurité HTTP ────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "unpkg.com"],
      styleSrc:   ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "unpkg.com"],
      fontSrc:    ["'self'", "fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "*.tile.openstreetmap.org", "nominatim.openstreetmap.org"],
      connectSrc: ["'self'", "nominatim.openstreetmap.org"],
    }
  },
  crossOriginEmbedderPolicy: false,
}));

// ── Rate limiting ─────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/uploads', requireFamily, express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// ── Multer (photos) ───────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename:    (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = file.mimetype.startsWith('image/') || file.originalname.endsWith('.gpx');
    if (ok) cb(null, true);
    else cb(new Error('Images et GPX seulement'));
  }
});

// Resize uploaded images in place (max 1800px, JPEG 85%)
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

// Delete physical files for a post
function deletePostFiles(post) {
  for (const photo of (post.photos || [])) {
    const abs = path.join(__dirname, 'public', photo);
    if (fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch(e){} }
  }
  if (post.gpx) {
    const abs = path.join(__dirname, 'public', post.gpx);
    if (fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch(e){} }
  }
}

// ── CSRF ──────────────────────────────────────────────────
function csrfToken(req) {
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrf;
}

function requireCsrf(req, res, next) {
  const token = req.body._csrf
    || req.query._csrf                    // ← AJOUT : fallback query string
    || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrf) {
    return res.status(403).send('Token CSRF invalide ou manquant.');
  }
  next();
}

// ── Auth middleware ───────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.auth || req.session.margot) return next();
  res.redirect('/login');
}
function requireFamily(req, res, next) {
  if (req.session.auth || req.session.family || req.session.margot) return next();
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

// Filtre les posts selon le rôle de la session
function filterPostsByRole(posts, req) {
  if (req.session.auth || req.session.margot) return posts;
  return posts.filter(p => !p.visibility || p.visibility === 'all');
}

// ── Routes publiques ──────────────────────────────────────
app.get('/', requireFamily, (req, res) => {
  const posts = filterPostsByRole(
    readPosts()
      .filter(p => p.type !== 'preparation')
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    req
  );
  const token = csrfToken(req);
  req.session.save(() => {               // ← AJOUT
    res.send(renderPublic(posts, !!req.session.auth || !!req.session.margot, token));
  });
});

app.get('/timeline', requireFamily, (req, res) => {
  const posts = filterPostsByRole(readPosts().sort((a, b) => new Date(a.date) - new Date(b.date)), req);
  res.send(renderTimeline(posts, !!req.session.auth || !!req.session.margot));
});

app.get('/map', requireFamily, (req, res) => {
  const posts = filterPostsByRole(readPosts().sort((a, b) => new Date(a.date) - new Date(b.date)), req);
  res.send(renderMap(posts, !!req.session.auth || !!req.session.margot));
});


app.get('/preparation', requireFamily, (req, res) => {
  const posts = filterPostsByRole(
    readPosts()
      .filter(p => p.type === 'preparation')
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    req
  );
  const token = csrfToken(req);
  req.session.save(() => {
    res.send(renderPreparation(posts, !!req.session.auth || !!req.session.margot, token));
  });
});

app.get('/rss', requireFamily, (req, res) => {
  const posts = filterPostsByRole(readPosts().sort((a, b) => new Date(b.date) - new Date(a.date)), req);
  res.type('application/rss+xml');
  res.send(renderRSS(posts));
});

// ── Commentaires ──────────────────────────────────────────
app.post('/comment/:id', requireFamily, requireCsrf, (req, res) => {
  const posts = readPosts();
  const post  = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).send('Étape introuvable');
  if (!post.comments) post.comments = [];
  const { author, text } = req.body;
  if (!author?.trim() || !text?.trim()) return res.redirect('/#' + req.params.id);
  post.comments.push({
    id:     crypto.randomBytes(6).toString('hex'),
    author: author.trim().substring(0, 40),
    text:   text.trim().substring(0, 300),
    date:   new Date().toISOString()
  });
  writePosts(posts);
  res.redirect('/#post-' + req.params.id);
});

// ── Auth — page unique ────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session.auth || req.session.family || req.session.margot) return res.redirect('/');
  res.send(renderLogin(false, req.query.next || '/'));
});

app.post('/login', loginLimiter, (req, res) => {
  const next = req.body.next || '/';
  const pw   = req.body.password;
  if (pw === ADMIN_PASSWORD) {
    req.session.auth = true;
    return res.redirect(next !== '/' ? next : '/');
  }
  if (MARGOT_PASSWORD && pw === MARGOT_PASSWORD) {
    req.session.margot = true;
    return res.redirect(next);
  }
  if (pw === FAMILY_PASSWORD) {
    req.session.family = true;
    return res.redirect(next);
  }
  res.send(renderLogin(true, next));
});

app.get('/family-login', (req, res) => res.redirect('/login' + (req.query.next ? '?next=' + encodeURIComponent(req.query.next) : '')));

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ── Admin : poster ────────────────────────────────────────
app.get('/post', requireAuth, (req, res) => {
  const posts = readPosts().sort((a, b) => new Date(b.date) - new Date(a.date));
  const lastLocation = posts.length > 0 ? (posts[0].location || '') : '';
  const token = csrfToken(req);
  req.session.save(() => {               // ← AJOUT
    res.send(renderPostForm(null, lastLocation, !!req.session.margot, token, req.query.type || ''));
  });
});

app.post('/post', requireAuth, requireCsrf, upload.fields([{name:'photos', maxCount:10},{name:'gpx', maxCount:1}]), async (req, res) => {
  const { title, body, location, lat, lon, km, dplus, author, visibility, postDate, type } = req.body;
  if (!title?.trim() || !body?.trim()) {
    return res.send(renderPostForm('Titre et texte obligatoires.', '', !!req.session.margot, csrfToken(req)));
  }
  await resizeUploadedImages(req.files?.photos || []);
  const photos  = (req.files?.photos || []).map(f => '/uploads/' + f.filename);
  const gpxFile = req.files?.gpx?.[0] ? '/uploads/' + req.files.gpx[0].filename : null;

  // Déterminer la date du post
  let finalDate = new Date().toISOString();
  if (postDate) {
    const parsed = new Date(postDate);
    if (!isNaN(parsed.getTime())) finalDate = parsed.toISOString();
  }

  // Extract last point from GPX as arrival coordinates
  let finalLat = parseFloat(lat) || null;
  let finalLon = parseFloat(lon) || null;
  if (gpxFile) {
    try {
      const gpxPath = path.join(__dirname, 'public', gpxFile);
      const gpxText = fs.readFileSync(gpxPath, 'utf8');
      const trkptMatches = [...gpxText.matchAll(/<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g)];
      if (trkptMatches.length > 0) {
        const last = trkptMatches[trkptMatches.length - 1];
        finalLat = parseFloat(last[1]);
        finalLon = parseFloat(last[2]);
      }
    } catch(e) { /* keep manual coords on error */ }
  }

  const posts   = readPosts();
  const validViz = ['all', 'margot', 'admin'];
  const forcedViz = req.session.margot ? 'margot' : (validViz.includes(visibility) ? visibility : 'all');
  posts.push({
    id:         crypto.randomBytes(8).toString('hex'),
    date:       finalDate,
    title:      title.trim(),
    body:       body.trim(),
    location:   location?.trim() || '',
    lat:        finalLat,
    lon:        finalLon,
    km:         parseFloat(km)   || 0,
    dplus:      parseInt(dplus)  || 0,
    author:     AUTHORS.includes(author) ? author : AUTHORS[0],
    visibility: forcedViz,
    type:       (type === 'preparation') ? 'preparation' : 'etape',
    photos,
    gpx:        gpxFile,
    comments:   []
  });
  writePosts(posts);
  res.redirect(type === 'preparation' ? '/preparation' : '/');
});

// ── Admin : supprimer ─────────────────────────────────────
app.post('/delete/:id', requireAuth, requireCsrf, (req, res) => {
  const posts    = readPosts();
  const post     = posts.find(p => p.id === req.params.id);
  if (post) deletePostFiles(post);
  const filtered = posts.filter(p => p.id !== req.params.id);
  writePosts(filtered);
  res.redirect('/');
});

// ── Admin : modifier ──────────────────────────────────────
app.get('/edit/:id', requireAuth, (req, res) => {
  const posts = readPosts();
  const post  = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).send('Étape introuvable');
  const token = csrfToken(req);
  req.session.save(() => {               // ← AJOUT
    res.send(renderEditForm(post, null, !!req.session.margot, token));
  });
});

app.post('/edit/:id', requireAuth, requireCsrf, upload.fields([{name:'photos', maxCount:10},{name:'gpx', maxCount:1}]), async (req, res) => {
  const posts = readPosts();
  const idx   = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).send('Étape introuvable');
  const { title, body, location, lat, lon, km, dplus, visibility, postDate } = req.body;
  if (!title?.trim() || !body?.trim()) {
    return res.send(renderEditForm(posts[idx], 'Titre et texte obligatoires.', !!req.session.margot, csrfToken(req)));
  }
  const existing = posts[idx];

  // Date du post
  let finalDate = existing.date;
  if (postDate) {
    const parsed = new Date(postDate);
    if (!isNaN(parsed.getTime())) finalDate = parsed.toISOString();
  }

  await resizeUploadedImages(req.files?.photos || []);
  const newPhotos  = (req.files?.photos || []).map(f => '/uploads/' + f.filename);
  const keepPhotos = req.body.keepPhotos ? (Array.isArray(req.body.keepPhotos) ? req.body.keepPhotos : [req.body.keepPhotos]) : [];
  const photos = [...keepPhotos, ...newPhotos];

  // Delete photos that were unchecked
  for (const old of (existing.photos || [])) {
    if (!keepPhotos.includes(old)) {
      const abs = path.join(__dirname, 'public', old);
      if (fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch(e){} }
    }
  }

  const gpxFile = req.files?.gpx?.[0] ? '/uploads/' + req.files.gpx[0].filename : (req.body.keepGpx ? existing.gpx : null);

  if (req.files?.gpx?.[0] && existing.gpx && existing.gpx !== gpxFile) {
    const abs = path.join(__dirname, 'public', existing.gpx);
    if (fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch(e){} }
  }

  let finalLat = parseFloat(lat) || null;
  let finalLon = parseFloat(lon) || null;
  if (gpxFile) {
    try {
      const gpxPath = path.join(__dirname, 'public', gpxFile);
      const gpxText = fs.readFileSync(gpxPath, 'utf8');
      const trkptMatches = [...gpxText.matchAll(/<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g)];
      if (trkptMatches.length > 0) {
        const last = trkptMatches[trkptMatches.length - 1];
        finalLat = parseFloat(last[1]);
        finalLon = parseFloat(last[2]);
      }
    } catch(e) { /* keep manual coords on error */ }
  }

  const validViz = ['all', 'margot', 'admin'];
  posts[idx] = {
    ...existing,
    date:       finalDate,
    title:      title.trim(),
    body:       body.trim(),
    location:   location?.trim() || '',
    lat:        finalLat,
    lon:        finalLon,
    km:         parseFloat(km)   || 0,
    dplus:      parseInt(dplus)  || 0,
    visibility: validViz.includes(visibility) ? visibility : (existing.visibility || 'all'),
    photos,
    gpx:        gpxFile,
  };
  writePosts(posts);
  res.redirect('/#post-' + req.params.id);
});

// ── Admin : télécharger une sauvegarde ────────────────────
app.get('/backup', requireAuth, (req, res) => {
  if (!fs.existsSync(DATA)) return res.status(404).send('Aucune donnée à sauvegarder.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  res.setHeader('Content-Disposition', `attachment; filename="velo-backup-${stamp}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(fs.readFileSync(DATA, 'utf8'));
});

// ── Admin : page paramètres ───────────────────────────────
app.get('/settings', requireAuth, (req, res) => {
  const token = csrfToken(req);
  req.session.save(() => {
    res.send(renderSettings(token, req.query.restored === '1'));
  });
});

// ── Admin : restaurer une sauvegarde ─────────────────────
app.post('/restore', requireAuth, requireCsrf, upload.single('backup'), (req, res) => {
  if (!req.file) return res.status(400).send('Aucun fichier reçu.');
  const tmpPath = req.file.path;
  try {
    const raw = fs.readFileSync(tmpPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Format invalide — tableau attendu.');
    // Écriture atomique : on ne touche à rien si le JSON est invalide
    writePosts(parsed);
    res.redirect('/settings?restored=1');
  } catch(e) {
    res.status(400).send('Fichier invalide : ' + e.message);
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});


// ── Lancement ─────────────────────────────────────────────
fs.mkdirSync(path.dirname(DATA), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });

app.listen(PORT, () => {
  console.log(`\n🚴 Velo Journal démarré sur http://localhost:${PORT}`);
  console.log(`   Mot de passe famille : ${FAMILY_PASSWORD}`);
  console.log(`   Mot de passe admin   : ${ADMIN_PASSWORD}`);
  if (MARGOT_PASSWORD) console.log(`   Mot de passe Margot  : ${MARGOT_PASSWORD}`);
  console.log(`   Page famille         : http://localhost:${PORT}/`);
  console.log(`   Poster une étape     : http://localhost:${PORT}/post\n`);
});


// ══════════════════════════════════════════════════════════
//  Logo SVG inline
// ══════════════════════════════════════════════════════════

const LOGO_SVG = `<img src="/public/logo_nijumatim.png" class="header-logo" alt="${TRIP_TITLE || 'Nijumatim'}">`;

function renderHeader({ activePage = '', isAdmin = false, showMap = false } = {}) {
  const links = [
    { href: '/', label: 'Journal', key: 'journal' },
    { href: '/timeline', label: 'Timeline', key: 'timeline' },
    ...(showMap ? [{ href: '/map', label: '🗺️ Carte', key: 'map' }] : []),
    { href: '/preparation', label: '🛠️ Préparation', key: 'preparation' },
    { href: '/rss', label: 'RSS', key: 'rss' },
    ...(!isAdmin ? [{ href: '/login', label: '🔧', key: 'login' }] : []),
    ...(isAdmin ? [{ href: '/settings', label: '⚙️ Paramètres', key: 'settings' }] : []),
    { href: '/logout', label: '🔓 Déconnexion', key: 'logout' },
  ];

  function makeLink(l) {
    const cls = activePage === l.key ? ' class="active"' : '';
    return '<a href="' + l.href + '"' + cls + '>' + l.label + '</a>';
  }

  const desktopLinks = links.map(makeLink).join('');
  const mobileLinks  = links.map(makeLink).join('');

  const sub = TRIP_START && TRIP_END
    ? '<span class="header-sub">' + TRIP_START + ' → ' + TRIP_END + '</span>'
    : TRIP_START ? '<span class="header-sub">Depuis ' + TRIP_START + '</span>' : '';

  return `
    <div class="header">
      <div class="header-bike-bg"></div>
      <div class="header-inner">
        <div class="header-title-block">
          <a href="/">${LOGO_SVG}</a>
          ${sub}
        </div>
        <nav class="header-nav">${desktopLinks}</nav>
        <button class="hamburger" id="hamburger" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      </div>
      <nav class="mobile-menu" id="mobileMenu">${mobileLinks}</nav>
    </div>
    <script>
      (function(){
        var h = document.getElementById('hamburger');
        var m = document.getElementById('mobileMenu');
        if (!h || !m) return;
        h.addEventListener('click', function(e) {
          e.stopPropagation();
          var open = m.classList.toggle('open');
          h.classList.toggle('open', open);
        });
        document.addEventListener('click', function(e) {
          if (!h.contains(e.target) && !m.contains(e.target)) {
            m.classList.remove('open');
            h.classList.remove('open');
          }
        });
      })();
    </script>`;
}


// ══════════════════════════════════════════════════════════
//  CSS
// ══════════════════════════════════════════════════════════

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&display=swap');

  :root {
    --ocean: #2a7a7a;
    --ocean-mid: #3a9090;
    --teal: #4aabab;
    --teal-light: #7ecece;
    --emerald: #2d7a5a;
    --emerald-mid: #3a9e72;
    --emerald-light: #a0dfc0;
    --sage: #e8f7f4;
    --mist: #f0fafa;
    --cream: #fdfffe;
    --warm-white: #f5fdfc;
    --sand: #cce8e8;
    --ink: #1a3a3a;
    --ink-mid: #2d5555;
    --ink-light: #5a8080;
    --accent: #e07a3a;
    --accent-light: #fdebd8;
  }

  *{box-sizing:border-box;margin:0;padding:0}

  body{
    font-family:'DM Sans',sans-serif;
    background:var(--warm-white);
    color:var(--ink);
    font-size:16px;
    line-height:1.6;
  }

  a{color:inherit;text-decoration:none}

  /* ── HEADER ─────────────────────────────────────── */
  .header{
    background:#ffffff;
    border-bottom:2px solid var(--sand);
    color:var(--ink);
    padding:0;
    position:sticky;
    top:0;
    z-index:10;
    overflow:visible;
    box-shadow:0 2px 12px rgba(42,122,122,0.10);
  }

  .header-bike-bg{
    position:absolute;
    inset:0;
    opacity:0.04;
    background-image:url("/public/bg.png");
    background-size:540px auto;
    background-repeat:repeat-x;
    background-position:center bottom;
  }

  .header-inner{
    position:relative;
    display:flex;
    align-items:center;
    gap:12px;
    padding:14px 20px;
  }

  .header-title-block{flex:1}

  .header-logo{
    display:block;
    height:52px;
    width:auto;
    max-width:240px;
  }

  .header-sub{
    font-size:11px;
    color:var(--teal);
    font-weight:500;
    letter-spacing:0.08em;
    text-transform:uppercase;
    margin-top:2px;
    display:block;
  }

  .header-nav{
    display:flex;
    align-items:center;
    gap:4px;
    flex-shrink:0;
  }

  .header-nav a{
    color:var(--ink-mid);
    font-size:12px;
    font-weight:600;
    padding:6px 12px;
    border-radius:20px;
    border:1.5px solid var(--sand);
    background:var(--mist);
    transition:all .2s;
    white-space:nowrap;
  }

  /* ── HAMBURGER MOBILE ────────────────────────────── */
  .hamburger{
    display:none;
    flex-direction:column;
    justify-content:center;
    align-items:center;
    gap:5px;
    width:40px;height:40px;
    border-radius:10px;
    border:1.5px solid var(--sand);
    background:var(--mist);
    cursor:pointer;
    flex-shrink:0;
  }
  .hamburger span{
    display:block;width:18px;height:2px;
    background:var(--ocean);border-radius:2px;
    transition:all .25s;
  }
  .hamburger.open span:nth-child(1){transform:translateY(7px) rotate(45deg)}
  .hamburger.open span:nth-child(2){opacity:0;transform:scaleX(0)}
  .hamburger.open span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}

  .mobile-menu{
    display:none;
    position:absolute;
    top:100%;right:0;left:0;
    background:#ffffff;
    border-top:1px solid var(--sand);
    border-bottom:2px solid var(--teal-light);
    z-index:200;
    flex-direction:column;
    padding:10px 14px 14px;
    gap:5px;
    box-shadow:0 8px 24px rgba(42,122,122,0.12);
  }
  .mobile-menu.open{display:flex}

  .mobile-menu a{
    color:var(--ink-mid);
    font-size:14px;
    font-weight:500;
    padding:10px 14px;
    border-radius:10px;
    border:1px solid var(--sand);
    background:var(--mist);
    display:flex;align-items:center;gap:8px;
    transition:background .15s;
    text-decoration:none;
  }
  .mobile-menu a:hover{background:var(--sage);border-color:var(--teal-light)}
  .mobile-menu a.active{background:var(--sage);border-color:var(--teal);color:var(--ocean)}

  @media(max-width:600px){
    .header-nav{display:none}
    .hamburger{display:flex}
  }

  @media(min-width:601px){
    .mobile-menu{display:none!important}
    .hamburger{display:none}
    .header-nav a:hover{
      background:var(--sage);
      color:var(--ocean);
      border-color:var(--teal-light);
    }
    .header-nav a.active{
      background:var(--sage);
      color:var(--ocean);
      border-color:var(--teal);
    }
    .header-logo { height:40px; }
  }

  /* ── STATS BAR ───────────────────────────────────── */
  .stats-bar{
    background:var(--ocean);
    border-bottom:1px solid rgba(255,255,255,0.08);
    padding:12px 20px;
    display:flex;
    gap:0;
  }

  .stat{
    text-align:center;
    flex:1;
    position:relative;
  }

  .stat:not(:last-child)::after{
    content:'';
    position:absolute;
    right:0;
    top:20%;
    height:60%;
    width:1px;
    background:rgba(255,255,255,0.12);
  }

  .stat-num{
    font-family:'Playfair Display',serif;
    font-size:22px;
    font-weight:700;
    color:#fff;
    line-height:1;
  }

  .stat-lbl{
    font-size:10px;
    color:rgba(255,255,255,0.5);
    text-transform:uppercase;
    letter-spacing:0.1em;
    margin-top:3px;
  }

  /* ── FEED ────────────────────────────────────────── */
  .feed{
    max-width:620px;
    margin:0 auto;
    padding:20px 12px 80px;
    display:flex;
    flex-direction:column;
    gap:20px;
  }

  /* ── CARDS ───────────────────────────────────────── */
  .card{
    background:#fff;
    border-radius:18px;
    overflow:hidden;
    border:1px solid rgba(0,0,0,0.06);
    box-shadow:0 2px 12px rgba(10,61,98,0.07), 0 1px 3px rgba(0,0,0,0.04);
    transition:box-shadow .2s, transform .2s;
  }

  .card:hover{
    box-shadow:0 8px 28px rgba(10,61,98,0.12), 0 2px 6px rgba(0,0,0,0.06);
    transform:translateY(-1px);
  }

  .card-date-header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:14px 18px 0;
    gap:8px;
  }

  .card-date-block{
    display:flex;
    align-items:center;
    gap:10px;
  }

  .card-day-num{
    font-family:'Playfair Display',serif;
    font-size:36px;
    font-weight:700;
    color:var(--ocean-mid);
    line-height:1;
    min-width:42px;
    text-align:center;
  }

  .card-date-text{
    display:flex;
    flex-direction:column;
    gap:1px;
  }

  .card-weekday{
    font-size:10px;
    font-weight:700;
    text-transform:uppercase;
    letter-spacing:0.12em;
    color:var(--teal);
  }

  .card-month-year{
    font-size:13px;
    font-weight:500;
    color:var(--ink-mid);
  }

  .card-time{
    font-size:11px;
    color:var(--ink-light);
    margin-top:2px;
  }

  .card-date-right{
    display:flex;
    flex-direction:column;
    align-items:flex-end;
    gap:5px;
  }

  /* ── CARD PHOTOS ─────────────────────────────────── */
  .card-photos{
    display:flex;
    gap:2px;
    background:#1a1a1a;
    max-height:280px;
    overflow:hidden;
    margin:12px 0 0;
  }

  .card-photos img{
    flex:1;
    min-width:0;
    height:240px;
    object-fit:cover;
    cursor:zoom-in;
    transition:transform .3s;
  }

  .card-photos.single img{
    height:280px;
  }

  .card-photos img:hover{transform:scale(1.02)}

  /* ── LIGHTBOX ────────────────────────────────────── */
  .lightbox{
    display:none;
    position:fixed;
    inset:0;
    background:rgba(5,15,30,0.95);
    z-index:1000;
    align-items:center;
    justify-content:center;
    flex-direction:column;
    backdrop-filter:blur(8px);
  }
  .lightbox.open{display:flex}
  .lightbox img{
    max-width:95vw;
    max-height:88vh;
    object-fit:contain;
    border-radius:8px;
    box-shadow:0 20px 60px rgba(0,0,0,0.6);
    user-select:none;
  }
  .lb-close{
    position:fixed;top:16px;right:20px;
    color:#fff;font-size:28px;cursor:pointer;
    background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);
    border-radius:50%;width:40px;height:40px;
    display:flex;align-items:center;justify-content:center;
    transition:background .15s;
  }
  .lb-close:hover{background:rgba(255,255,255,0.2)}
  .lb-nav{
    position:fixed;top:50%;transform:translateY(-50%);
    color:#fff;font-size:28px;cursor:pointer;
    background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);
    border-radius:50%;width:48px;height:48px;
    display:flex;align-items:center;justify-content:center;
    opacity:.8;transition:all .15s;
  }
  .lb-nav:hover{opacity:1;background:rgba(255,255,255,0.2)}
  .lb-prev{left:12px}
  .lb-next{right:12px}
  .lb-counter{color:rgba(255,255,255,0.5);font-size:13px;margin-top:12px}

  /* ── CARD BODY ───────────────────────────────────── */
  .card-body{padding:14px 18px 18px}

  .card-divider{
    height:1px;
    background:linear-gradient(to right, var(--teal-light), transparent);
    margin:0 18px 14px;
    opacity:0.35;
  }

  .card-badges{
    display:flex;
    align-items:center;
    gap:6px;
    margin-bottom:10px;
    flex-wrap:wrap;
  }

  .card-loc{
    font-size:12px;
    background:var(--sage);
    color:var(--emerald);
    padding:4px 10px;
    border-radius:20px;
    display:inline-flex;
    align-items:center;
    gap:4px;
    font-weight:600;
    letter-spacing:0.01em;
  }

  .km-badge{
    font-size:12px;
    background:var(--accent-light);
    color:var(--accent);
    padding:4px 10px;
    border-radius:20px;
    font-weight:700;
    display:inline-flex;
    align-items:center;
    gap:3px;
  }

  .dplus-badge{
    font-size:12px;
    background:var(--mist);
    color:var(--ocean-mid);
    padding:4px 10px;
    border-radius:20px;
    font-weight:600;
    display:inline-flex;
    align-items:center;
    gap:3px;
  }

  .card-title{
    font-family:'Playfair Display',serif;
    font-size:20px;
    font-weight:700;
    margin-bottom:10px;
    line-height:1.3;
    color:var(--ink);
  }

  .card-text{
    font-size:14.5px;
    color:var(--ink-mid);
    line-height:1.75;
    white-space:pre-wrap;
  }

  /* ── GPX CANVAS MAP ──────────────────────────────── */
  .gpx-canvas-wrap{
    margin:14px -18px 0;
    background:#e8f0e0;
    border-top:1px solid var(--sand);
    border-bottom:1px solid var(--sand);
    position:relative;
    overflow:hidden;
  }

  .gpx-canvas-wrap canvas{
    display:block;
    width:100%;
    height:260px;
    pointer-events:none;
    touch-action:none;
    user-select:none;
    -webkit-user-select:none;
  }

  .gpx-canvas-footer{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:6px 14px;
    background:rgba(255,255,255,0.88);
    border-top:1px solid var(--sand);
    backdrop-filter:blur(4px);
  }

  .gpx-map-lbl{
    font-size:11px;
    color:var(--ink-light);
    font-weight:500;
  }

  .gpx-link{
    display:inline-flex;align-items:center;gap:5px;
    font-size:12px;background:var(--accent-light);
    color:var(--accent);padding:4px 10px;
    border-radius:20px;
    border:1px solid rgba(230,126,34,0.2);
    font-weight:500;
  }

  /* ── COMMENTS ────────────────────────────────────── */
  .comments{
    border-top:1px solid var(--sand);
    padding:12px 18px;
    background:var(--warm-white);
  }

  .comment{display:flex;gap:10px;margin-bottom:10px}

  .comment-avatar{
    width:30px;height:30px;
    border-radius:50%;
    background:linear-gradient(135deg, var(--ocean-mid), var(--teal));
    display:flex;align-items:center;justify-content:center;
    font-size:11px;font-weight:600;color:#fff;flex-shrink:0;
  }

  .comment-bubble{
    background:#fff;
    border-radius:12px;
    padding:8px 12px;
    flex:1;
    border:1px solid var(--sand);
  }

  .comment-author{font-size:12px;font-weight:600;color:var(--ink)}
  .comment-date{font-size:10px;color:var(--ink-light);margin-left:6px}
  .comment-text{font-size:13px;color:var(--ink-mid);margin-top:3px}

  .comment-form{
    display:flex;flex-direction:column;gap:8px;margin-top:10px;
  }

  .comment-form input,.comment-form textarea{
    border:1.5px solid var(--sand);
    border-radius:10px;
    padding:8px 12px;
    font-size:13px;
    font-family:inherit;
    background:#fff;
    width:100%;
    transition:border-color .15s;
  }

  .comment-form input:focus,.comment-form textarea:focus{
    outline:none;
    border-color:var(--teal-light);
  }

  .comment-form textarea{height:64px;resize:none}

  .comment-form button{
    background:linear-gradient(135deg, var(--ocean-mid), var(--teal));
    color:#fff;border:none;border-radius:10px;
    padding:9px;font-size:13px;font-weight:500;cursor:pointer;
    transition:opacity .15s;
  }

  .comment-form button:hover{opacity:.9}

  /* ── ADMIN ───────────────────────────────────────── */
  .admin-actions{
    margin-top:12px;
    padding-top:10px;
    border-top:1px solid var(--sand);
    display:flex;gap:8px;
  }

  .btn-del{
    background:none;color:#dc3545;
    border:1.5px solid #fecaca;border-radius:8px;
    padding:5px 12px;font-size:12px;cursor:pointer;
    display:inline-flex;align-items:center;gap:4px;
    transition:all .15s;
  }
  .btn-del:hover{background:#fee2e2;border-color:#dc3545}

  .btn-edit{
    background:none;color:var(--emerald);
    border:1.5px solid var(--emerald-light);border-radius:8px;
    padding:5px 12px;font-size:12px;cursor:pointer;
    display:inline-flex;align-items:center;gap:4px;
    transition:all .15s;text-decoration:none;
  }
  .btn-edit:hover{background:var(--sage);border-color:var(--emerald)}

  /* ── FAB ─────────────────────────────────────────── */
  .fab{
    position:fixed;bottom:24px;right:24px;
    width:56px;height:56px;border-radius:50%;
    background:linear-gradient(135deg, var(--ocean-mid), var(--emerald));
    color:#fff;font-size:26px;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 6px 20px rgba(10,61,98,0.4);
    text-decoration:none;z-index:100;border:none;cursor:pointer;
    transition:transform .2s, box-shadow .2s;
  }
  .fab:hover{transform:scale(1.08);box-shadow:0 8px 28px rgba(10,61,98,0.5)}
  .fab:active{transform:scale(.95)}

  /* ── FORMS ───────────────────────────────────────── */
  .form-wrap{max-width:520px;margin:0 auto;padding:20px 14px 60px}

  .form-card{
    background:#fff;
    border-radius:18px;
    padding:24px;
    border:1px solid var(--sand);
    box-shadow:0 4px 20px rgba(10,61,98,0.08);
  }

  .form-card h2{
    font-family:'Playfair Display',serif;
    font-size:20px;font-weight:700;
    margin-bottom:18px;color:var(--ink);
  }

  .field{margin-bottom:16px}

  .field label{
    display:block;font-size:12px;
    color:var(--ink-light);margin-bottom:5px;
    font-weight:600;text-transform:uppercase;letter-spacing:0.06em;
  }

  .field input,.field textarea,.field select{
    width:100%;
    border:1.5px solid var(--sand);
    border-radius:10px;
    padding:10px 14px;
    font-size:15px;
    font-family:inherit;
    background:var(--warm-white);
    color:var(--ink);
    transition:border-color .15s, box-shadow .15s;
  }

  .field input:focus,.field textarea:focus,.field select:focus{
    outline:none;
    border-color:var(--teal-light);
    box-shadow:0 0 0 3px rgba(23,162,184,0.12);
    background:#fff;
  }

  .field textarea{height:130px;resize:vertical}

  .field-row{display:flex;gap:12px}
  .field-row .field{flex:1}

  .btn-submit{
    width:100%;
    background:linear-gradient(135deg, var(--ocean-mid) 0%, var(--teal) 50%, var(--emerald) 100%);
    color:#fff;border:none;border-radius:12px;
    padding:14px;font-size:15px;font-weight:600;cursor:pointer;
    margin-top:8px;
    box-shadow:0 4px 14px rgba(10,61,98,0.3);
    transition:opacity .15s, transform .15s;
    font-family:inherit;
  }

  .btn-submit:hover{opacity:.92;transform:translateY(-1px)}
  .btn-submit:active{transform:translateY(0)}

  .gps-btn{
    background:var(--mist);
    color:var(--ocean-mid);
    border:1.5px solid var(--teal-light);
    border-radius:8px;padding:7px 12px;
    font-size:13px;cursor:pointer;margin-top:6px;
    font-family:inherit;font-weight:500;
    transition:background .15s;
  }
  .gps-btn:hover{background:#d0eaf5}

  .photo-preview{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  .photo-preview img{width:72px;height:72px;object-fit:cover;border-radius:8px;border:2px solid var(--sand)}

  .error-msg{
    background:#fef2f2;color:#dc2626;
    border:1px solid #fecaca;border-radius:10px;
    padding:10px 14px;margin-bottom:14px;font-size:13px;
  }

  /* ── LOCATION AUTOCOMPLETE ───────────────────────── */
  .loc-wrap{position:relative}

  .loc-suggestions{
    position:absolute;
    top:100%;left:0;right:0;
    background:#fff;
    border:1.5px solid var(--teal-light);
    border-top:none;
    border-radius:0 0 10px 10px;
    z-index:500;
    max-height:220px;
    overflow-y:auto;
    box-shadow:0 8px 24px rgba(42,122,122,0.15);
    display:none;
  }

  .loc-suggestions.open{display:block}

  .loc-suggestion-item{
    padding:10px 14px;
    font-size:13px;
    color:var(--ink);
    cursor:pointer;
    border-bottom:1px solid var(--sand);
    display:flex;
    flex-direction:column;
    gap:2px;
    transition:background .1s;
  }

  .loc-suggestion-item:last-child{border-bottom:none}
  .loc-suggestion-item:hover,.loc-suggestion-item.active{background:var(--sage)}

  .loc-suggestion-name{font-weight:600;color:var(--ink)}
  .loc-suggestion-detail{font-size:11px;color:var(--ink-light)}

  .loc-search-btn{
    background:var(--mist);
    color:var(--ocean-mid);
    border:1.5px solid var(--teal-light);
    border-radius:8px;padding:7px 12px;
    font-size:13px;cursor:pointer;margin-top:6px;margin-right:6px;
    font-family:inherit;font-weight:500;
    transition:background .15s;
    display:inline-flex;align-items:center;gap:5px;
  }
  .loc-search-btn:hover{background:var(--sage)}

  /* ── EMPTY STATE ─────────────────────────────────── */
  .empty{
    text-align:center;padding:60px 20px;color:var(--ink-light);
  }
  .empty-icon{font-size:48px;margin-bottom:12px}
  .empty h3{font-family:'Playfair Display',serif;font-size:20px;margin-bottom:8px;color:var(--ink-mid)}

  /* ── TIMELINE PAGE ───────────────────────────────── */
  .timeline-wrap{max-width:600px;margin:0 auto;padding:24px 14px 80px}

  .timeline-title{
    font-family:'Playfair Display',serif;
    font-size:22px;font-weight:700;
    color:var(--ink);
    margin-bottom:24px;
    padding-left:40px;
  }

  .timeline{position:relative;padding-left:40px}

  .timeline::before{
    content:'';
    position:absolute;
    left:14px;top:0;bottom:0;
    width:2px;
    background:linear-gradient(to bottom, var(--ocean-mid), var(--teal), var(--emerald));
    border-radius:2px;
  }

  .timeline-item{
    position:relative;
    margin-bottom:20px;
  }

  .timeline-dot{
    position:absolute;
    left:-33px;
    top:14px;
    width:18px;height:18px;
    border-radius:50%;
    background:linear-gradient(135deg, var(--ocean-mid), var(--teal));
    border:3px solid #fff;
    box-shadow:0 0 0 2px var(--teal-light);
    z-index:1;
  }

  .timeline-dot.first{
    background:linear-gradient(135deg, var(--accent), #f39c12);
    box-shadow:0 0 0 2px var(--accent-light);
  }

  .timeline-dot.last{
    background:linear-gradient(135deg, var(--emerald), var(--emerald-mid));
    box-shadow:0 0 0 2px var(--emerald-light);
  }

  .timeline-card{
    background:#fff;
    border-radius:14px;
    border:1px solid var(--sand);
    box-shadow:0 2px 10px rgba(10,61,98,0.06);
    overflow:hidden;
    text-decoration:none;
    display:block;
    transition:transform .15s, box-shadow .15s;
  }

  .timeline-card:hover{
    transform:translateX(4px);
    box-shadow:0 4px 18px rgba(10,61,98,0.12);
  }

  .timeline-card-inner{padding:14px 16px}

  .timeline-date{
    font-size:11px;color:var(--ink-light);
    font-weight:500;letter-spacing:0.03em;
    margin-bottom:4px;
  }

  .timeline-loc{
    font-family:'Playfair Display',serif;
    font-size:16px;font-weight:600;
    color:var(--ink);margin-bottom:3px;
  }

  .timeline-snippet{
    font-size:12px;color:var(--ink-light);
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
    overflow:hidden;
    line-height:1.5;
    margin-top:4px;
  }

  .timeline-meta{
    display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;
  }

  .timeline-badge{
    font-size:10px;padding:2px 8px;border-radius:20px;
    font-weight:500;
  }

  .tl-km{background:var(--accent-light);color:var(--accent)}
  .tl-author{background:var(--mist);color:var(--ocean-mid)}

  .timeline-thumb{
    width:80px;height:70px;
    object-fit:cover;
    border-radius:8px;
    flex-shrink:0;
  }

  .timeline-card-inner-row{
    display:flex;gap:12px;align-items:flex-start;
  }

  /* ── LOGIN PAGES ─────────────────────────────────── */
  .login-hero{
    background:linear-gradient(135deg, var(--ocean) 0%, var(--teal) 60%, var(--emerald) 100%);
    padding:40px 20px;
    text-align:center;
    position:relative;
    overflow:hidden;
  }

  .login-hero::before{
    content:'';
    position:absolute;inset:0;
    background-image:url("/public/bg.png");
    background-size:540px auto;
    background-repeat:repeat-x;
    background-position:center bottom;
    opacity:0.10;
  }

  .login-hero-icon{
    font-size:56px;margin-bottom:10px;position:relative;
  }

  .login-hero h2{
    font-family:'Playfair Display',serif;
    font-size:24px;color:#fff;font-weight:700;
    position:relative;margin-bottom:4px;
  }

  .login-hero p{
    font-size:13px;color:rgba(255,255,255,0.7);
    position:relative;
  }

  .prev-location-hint{
    background:var(--mist);
    border:1px solid rgba(23,162,184,0.2);
    border-radius:8px;
    padding:8px 12px;
    font-size:12px;
    color:var(--ocean-mid);
    margin-bottom:14px;
    display:flex;
    align-items:center;
    gap:6px;
  }
`;


// ══════════════════════════════════════════════════════════
//  Template helpers
// ══════════════════════════════════════════════════════════

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  });
}
function formatDateShort(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric', month: 'long', year: 'numeric'
  });
}
function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
}

// Convertit un ISO en valeur datetime-local (format: YYYY-MM-DDTHH:MM) en heure Europe/Paris
function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  // Format Paris time
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d);
  const p = {};
  parts.forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// Retourne la date/heure actuelle en Paris pour le champ datetime-local
function nowDatetimeLocal() {
  return isoToDatetimeLocal(new Date().toISOString());
}

// ── Échappement HTML — protection XSS ─────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const AUTHOR_EMOJI = {
  'Julie': '👩',
  'Margot': '👧',
  'Nicolas': '🧔',
  'Timothé': '🧑',
  'La famille': '👨‍👩‍👧‍👦',
};

// ── JS partagé pour formulaires (autocomplete lieu + GPS) ─
const FORM_SCRIPTS = `
<script>
// ── Autocomplete lieu (Nominatim) ──────────────────────────
function initLocAutocomplete(fieldId, latId, lonId, suggestId) {
  var field = document.getElementById(fieldId);
  var list  = document.getElementById(suggestId);
  var timer = null;
  var items = [];
  var sel   = -1;

  if (!field || !list) return;

  field.addEventListener('input', function() {
    clearTimeout(timer);
    var q = field.value.trim();
    if (q.length < 3) { list.classList.remove('open'); return; }
    timer = setTimeout(function() { doSearch(q); }, 350);
  });

  field.addEventListener('keydown', function(e) {
    if (!list.classList.contains('open')) return;
    if (e.key === 'ArrowDown') { sel = Math.min(sel+1, items.length-1); highlight(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel-1, 0); highlight(); e.preventDefault(); }
    else if (e.key === 'Enter' && sel >= 0) { pick(sel); e.preventDefault(); }
    else if (e.key === 'Escape') { list.classList.remove('open'); }
  });

  document.addEventListener('click', function(e) {
    if (!field.contains(e.target) && !list.contains(e.target)) list.classList.remove('open');
  });

  function highlight() {
    Array.from(list.children).forEach(function(c,i){ c.classList.toggle('active', i===sel); });
  }

  function pick(i) {
    var item = items[i];
    field.value = item.display;
    document.getElementById(latId).value = parseFloat(item.lat).toFixed(6);
    document.getElementById(lonId).value = parseFloat(item.lon).toFixed(6);
    list.classList.remove('open');
    sel = -1;
  }

  function doSearch(q) {
    fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=6&addressdetails=1')
      .then(function(r){ return r.json(); })
      .then(function(data) {
        items = data.map(function(r) {
          var a = r.address || {};
          var name = a.city || a.town || a.village || a.hamlet || a.county || r.display_name.split(',')[0];
          var detail = [a.state, a.country].filter(Boolean).join(', ');
          return { display: name + (detail ? ', '+detail : ''), lat: r.lat, lon: r.lon, detail: detail };
        });
        if (!items.length) { list.classList.remove('open'); return; }
        sel = -1;
        list.innerHTML = items.map(function(it, i) {
          return '<div class="loc-suggestion-item" data-idx="'+i+'">'
            + '<span class="loc-suggestion-name">'+escHtml(it.display.split(',')[0])+'</span>'
            + '<span class="loc-suggestion-detail">'+escHtml(it.display.split(',').slice(1).join(',').trim())+'</span>'
            + '</div>';
        }).join('');
        list.classList.add('open');
        Array.from(list.querySelectorAll('.loc-suggestion-item')).forEach(function(el) {
          el.addEventListener('mousedown', function(e) { e.preventDefault(); pick(parseInt(el.dataset.idx)); });
        });
      })
      .catch(function(){});
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── GPS auto-detect ────────────────────────────────────────
function getGPS(fieldId, latId, lonId) {
  if (!navigator.geolocation) return alert('Géolocalisation non disponible sur ce navigateur.');
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    return alert('La géolocalisation nécessite HTTPS.');
  }
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      document.getElementById(latId).value = pos.coords.latitude.toFixed(6);
      document.getElementById(lonId).value = pos.coords.longitude.toFixed(6);
      var field = document.getElementById(fieldId);
      if (!field.value) {
        fetch('https://nominatim.openstreetmap.org/reverse?lat=' + pos.coords.latitude + '&lon=' + pos.coords.longitude + '&format=json')
          .then(function(r){ return r.json(); })
          .then(function(d) {
            var a = d.address;
            field.value = [a.town||a.city||a.village, a.state].filter(Boolean).join(', ');
          }).catch(function(){});
      }
      alert('Position enregistrée : ' + pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4));
    },
    function(err) {
      var msgs = {1:'Permission refusée',2:'Position indisponible',3:'Délai dépassé'};
      alert('Erreur GPS : ' + (msgs[err.code] || err.message));
    },
    { timeout: 10000, maximumAge: 60000 }
  );
}

// ── Parsing GPX ────────────────────────────────────────────
function parseGPX(input, fieldId, latId, lonId) {
  var file = input.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var parser = new DOMParser();
      var xml = parser.parseFromString(e.target.result, 'text/xml');
      var trkpts = Array.from(xml.querySelectorAll('trkpt'));
      if (!trkpts.length) { alert('Aucun point trouvé dans ce fichier GPX.'); return; }
      var dist = 0;
      for (var i = 1; i < trkpts.length; i++) {
        var lat1=parseFloat(trkpts[i-1].getAttribute('lat')),lon1=parseFloat(trkpts[i-1].getAttribute('lon'));
        var lat2=parseFloat(trkpts[i].getAttribute('lat')),lon2=parseFloat(trkpts[i].getAttribute('lon'));
        var R=6371000,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
        dist+=R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
      }
      var dplus=0;
      var elevs=trkpts.map(function(p){return parseFloat(p.querySelector('ele')?.textContent||0);}).filter(function(v){return !isNaN(v);});
      for (var j=1;j<elevs.length;j++){if(elevs[j]>elevs[j-1])dplus+=elevs[j]-elevs[j-1];}
      var last=trkpts[trkpts.length-1];
      var lat=parseFloat(last.getAttribute('lat')),lon=parseFloat(last.getAttribute('lon'));
      var kmVal=(dist/1000).toFixed(1);
      var dpVal=Math.round(dplus);
      document.querySelector('[name=km]').value=kmVal;
      document.querySelector('[name=dplus]').value=dpVal;
      document.getElementById(latId).value=lat.toFixed(6);
      document.getElementById(lonId).value=lon.toFixed(6);
      fetch('https://nominatim.openstreetmap.org/reverse?lat='+lat+'&lon='+lon+'&format=json')
        .then(function(r){return r.json();}).then(function(d){
          var a=d.address;
          var field=document.getElementById(fieldId);
          if(!field.value) field.value=[a.town||a.city||a.village,a.state].filter(Boolean).join(', ');
        }).catch(function(){});
      var info = document.getElementById('gpxInfo');
      if (info) { info.style.display='block'; info.innerHTML='✅ Trace importée — <strong>'+kmVal+' km</strong> · <strong>'+dpVal.toLocaleString()+' m D+</strong> · '+trkpts.length+' points'; }
    } catch(err) { alert('Erreur lors de la lecture du GPX : '+err.message); }
  };
  reader.readAsText(file);
}

function previewPhotos(input) {
  var preview = document.getElementById('photoPreview');
  if (!preview) return;
  preview.innerHTML='';
  Array.from(input.files).forEach(function(f){
    var img=document.createElement('img');
    img.src=URL.createObjectURL(f);
    preview.appendChild(img);
  });
}
</script>
`;


// ══════════════════════════════════════════════════════════
//  renderPublic
// ══════════════════════════════════════════════════════════

function renderPublic(posts, isAdmin = false, csrf = '') {
  const km    = Math.round(totalKm(posts));
  const dp    = Math.round(totalDPlus(posts)).toLocaleString('fr-FR');
  const days  = posts.length;
  const withGps = posts.filter(p => p.lat && p.lon);

  const postCards = posts.length === 0
    ? `<div class="empty">
        <div class="empty-icon">🚴</div>
        <h3>Le voyage n'a pas encore commencé...</h3>
        <p>Les étapes apparaîtront ici !</p>
      </div>`
    : posts.map(p => {
      const d = new Date(p.date);
      const weekday = d.toLocaleDateString('fr-FR', { timeZone:'Europe/Paris', weekday:'long' });
      const day     = d.toLocaleDateString('fr-FR', { timeZone:'Europe/Paris', day:'numeric' });
      const month   = d.toLocaleDateString('fr-FR', { timeZone:'Europe/Paris', month:'long' });
      const year    = d.getFullYear();
      const time    = d.toLocaleTimeString('fr-FR', { timeZone:'Europe/Paris', hour:'2-digit', minute:'2-digit' });
      return `
    <div class="card" id="post-${p.id}">
      <div class="card-date-header">
        <div class="card-date-block">
          <div class="card-day-num">${day}</div>
          <div class="card-date-text">
            <span class="card-weekday">${weekday}</span>
            <span class="card-month-year">${month} ${year}</span>
            <span class="card-time">⏱ ${time}</span>
          </div>
        </div>
        <div class="card-date-right">
          ${p.location ? `<span class="card-loc">📍 ${esc(p.location)}</span>` : ''}
        </div>
      </div>

      <div class="card-divider"></div>

      <div class="card-body">
        <h2 class="card-title">${esc(p.title)}</h2>

        ${(p.km || p.dplus) ? `
        <div class="card-badges" style="margin-bottom:14px">
          ${p.km   ? `<span class="km-badge">🚴 +${esc(String(p.km))} km</span>` : ''}
          ${p.dplus ? `<span class="dplus-badge">⛰️ ${esc(String(p.dplus))} m D+</span>` : ''}
        </div>` : ''}

        ${p.photos?.length ? `
        <div class="card-photos${p.photos.length === 1 ? ' single' : ''}" style="margin:0 -18px 16px;border-radius:0">
          ${p.photos.map(ph=>`<img src="${ph}" alt="photo" loading="lazy" data-postid="${p.id}">`).join('')}
        </div>
        ` : ''}

        <p class="card-text">${esc(p.body)}</p>

        ${p.gpx ? `
        <div class="gpx-canvas-wrap">
          <canvas id="gpxcanvas-${p.id}" data-gpx="${p.gpx}" style="display:block;width:100%;height:260px"></canvas>
          <div class="gpx-canvas-footer">
            <span class="gpx-map-lbl">🗺️ Trace GPX · chargement…</span>
            <a class="gpx-link" href="${p.gpx}" download>⬇️ Télécharger</a>
          </div>
        </div>` : ''}

        ${isAdmin ? `
        <div class="admin-actions">
          <a href="/edit/${p.id}" class="btn-edit">✏️ Modifier</a>
          ${p.visibility && p.visibility !== 'all' ? `<span style="font-size:11px;padding:4px 10px;border-radius:20px;background:#fef9c3;color:#92400e">⏳ À valider</span>` : ''}
          <form method="POST" action="/delete/${p.id}" style="margin-left:auto" class="form-delete">
            <input type="hidden" name="_csrf" value="${csrf}">
            <button type="submit" class="btn-del">🗑️ Supprimer</button>
          </form>
        </div>` : ''}
      </div>
      <div class="comments">
        ${(p.comments||[]).map(c=>`
          <div class="comment">
            <div class="comment-avatar">${esc(initials(c.author))}</div>
            <div class="comment-bubble">
              <span class="comment-author">${esc(c.author)}</span>
              <span class="comment-date">${formatDate(c.date)}</span>
              <p class="comment-text">${esc(c.text)}</p>
            </div>
          </div>
        `).join('')}
        <form class="comment-form" action="/comment/${p.id}" method="POST">
          <input type="hidden" name="_csrf" value="${csrf}">
          <input name="author" placeholder="Votre prénom" required maxlength="40">
          <textarea name="text" placeholder="Laisser un commentaire..." required maxlength="300"></textarea>
          <button type="submit">💬 Commenter</button>
        </form>
      </div>
    </div>
  `}).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${TRIP_TITLE}</title>
    <style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'journal', isAdmin, showMap: withGps.length > 0 })}

    <div class="stats-bar">
      <div class="stat">
        <div class="stat-num">${km.toLocaleString('fr-FR')}</div>
        <div class="stat-lbl">km</div>
      </div>
      <div class="stat">
        <div class="stat-num">${days}</div>
        <div class="stat-lbl">étapes</div>
      </div>
      <div class="stat">
        <div class="stat-num">${dp}</div>
        <div class="stat-lbl">m D+</div>
      </div>
    </div>

    <div class="feed">${postCards}</div>

    ${isAdmin ? `<a class="fab" href="/post" title="Nouvelle étape">+</a>` : ''}

    <!-- Lightbox -->
    <div class="lightbox" id="lb" role="dialog" aria-modal="true">
      <button class="lb-close" id="lb-close" title="Fermer">&#x2715;</button>
      <button class="lb-nav lb-prev" id="lb-prev">&#8249;</button>
      <img id="lb-img" src="" alt="Photo agrandie">
      <button class="lb-nav lb-next" id="lb-next">&#8250;</button>
      <div class="lb-counter" id="lb-counter"></div>
    </div>

    <script>
    // ── Rendu GPX sur fond de carte OSM (canvas statique) ──
    (function(){

      // ── Projection Mercator Web (EPSG:3857 / tuiles XYZ) ──
      function lon2x(lon, z) { return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
      function lat2y(lat, z) {
        var r = lat * Math.PI / 180;
        return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
      }
      // Coordonnées fractionnelles (précises) pour projection pixel
      function lon2xf(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
      function lat2yf(lat, z) {
        var r = lat * Math.PI / 180;
        return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z);
      }

      // Choisit le zoom optimal pour que la trace rentre dans le canvas
      function bestZoom(pts, W, H, padding) {
        var minLat=Infinity,maxLat=-Infinity,minLon=Infinity,maxLon=-Infinity;
        pts.forEach(function(p){
          if(p.lat<minLat)minLat=p.lat; if(p.lat>maxLat)maxLat=p.lat;
          if(p.lon<minLon)minLon=p.lon; if(p.lon>maxLon)maxLon=p.lon;
        });
        for (var z = 16; z >= 5; z--) {
          var x0=lon2xf(minLon,z), x1=lon2xf(maxLon,z);
          var y0=lat2yf(maxLat,z), y1=lat2yf(minLat,z);
          var pw=(x1-x0)*256, ph=(y1-y0)*256;
          if (pw <= W-padding*2 && ph <= H-padding*2) return z;
        }
        return 5;
      }

      function drawGpxCanvas(canvas) {
        var gpxUrl = canvas.dataset.gpx;
        if (!gpxUrl) return;

        fetch(gpxUrl)
          .then(function(r){ return r.text(); })
          .then(function(txt){
            var parser = new DOMParser();
            var xml = parser.parseFromString(txt, 'text/xml');
            var raw = Array.from(xml.querySelectorAll('trkpt')).map(function(p){
              return { lat: parseFloat(p.getAttribute('lat')), lon: parseFloat(p.getAttribute('lon')) };
            });
            if (raw.length < 2) return;

            // Sous-échantillonnage pour la performance
            var pts = raw.length > 600
              ? raw.filter(function(_,i){ return i % Math.ceil(raw.length/600) === 0; })
              : raw;
            if (pts[pts.length-1] !== raw[raw.length-1]) pts.push(raw[raw.length-1]);

            // Dimensions canvas (DPR-aware)
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            var W   = canvas.parentElement.clientWidth || 560;
            var H   = 260;
            canvas.width  = W * dpr;
            canvas.height = H * dpr;
            canvas.style.width  = W + 'px';
            canvas.style.height = H + 'px';

            var ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);

            // Fond neutre pendant le chargement
            ctx.fillStyle = '#e8f0e8';
            ctx.fillRect(0, 0, W, H);

            var PAD = 48; // pixels de marge autour de la trace
            var z   = bestZoom(pts, W, H, PAD);

            // Bounding box en coordonnées tuiles fractionnelles
            var minLat=Infinity,maxLat=-Infinity,minLon=Infinity,maxLon=-Infinity;
            pts.forEach(function(p){
              if(p.lat<minLat)minLat=p.lat; if(p.lat>maxLat)maxLat=p.lat;
              if(p.lon<minLon)minLon=p.lon; if(p.lon>maxLon)maxLon=p.lon;
            });

            var cx = (lon2xf(minLon,z) + lon2xf(maxLon,z)) / 2; // centre X en tuiles
            var cy = (lat2yf(minLat,z) + lat2yf(maxLat,z)) / 2; // centre Y en tuiles

            // Origine pixel du coin supérieur gauche du canvas (en unités tuiles*256)
            var ox = cx - W/2/256;  // tuile X correspondant au pixel 0
            var oy = cy - H/2/256;  // tuile Y correspondant au pixel 0

            // Convertit une coordonnée lat/lon en pixel canvas
            function toPixel(lat, lon) {
              return {
                x: (lon2xf(lon, z) - ox) * 256,
                y: (lat2yf(lat, z) - oy) * 256
              };
            }

            // Plage de tuiles à charger
            var tx0 = Math.floor(ox), tx1 = Math.floor(ox + W/256) + 1;
            var ty0 = Math.floor(oy), ty1 = Math.floor(oy + H/256) + 1;
            var tileMax = Math.pow(2, z) - 1;

            var totalTiles = (tx1-tx0+1) * (ty1-ty0+1);
            var loadedTiles = 0;

            // Met à jour le label du footer quand toutes les tuiles sont prêtes
            function onTileLoaded() {
              loadedTiles++;
              // Redessiner le fond + trace à chaque tuile
              redraw();
              if (loadedTiles >= totalTiles) {
                var footer = canvas.parentElement.querySelector('.gpx-map-lbl');
                if (footer) footer.textContent = '🗺️ Trace GPX';
              }
            }

            // Stockage des tuiles chargées
            var tiles = [];
            for (var tx = tx0; tx <= tx1; tx++) {
              for (var ty = ty0; ty <= ty1; ty++) {
                if (tx < 0 || ty < 0 || tx > tileMax || ty > tileMax) { loadedTiles++; continue; }
                (function(tx, ty) {
                  var img   = new Image();
                  img.crossOrigin = 'anonymous';
                  // Alterner entre les sous-domaines a/b/c pour respecter les limites OSM
                  var sub = ['a','b','c'][(tx + ty) % 3];
                  img.src = 'https://' + sub + '.tile.openstreetmap.org/' + z + '/' + tx + '/' + ty + '.png';
                  img.onload  = function() { tiles.push({img:img, tx:tx, ty:ty}); onTileLoaded(); };
                  img.onerror = function() { onTileLoaded(); }; // continue si tuile manquante
                })(tx, ty);
              }
            }

            function redraw() {
              ctx.clearRect(0, 0, W, H);

              // 1. Fond de secours
              ctx.fillStyle = '#e8ede8';
              ctx.fillRect(0, 0, W, H);

              // 2. Tuiles OSM
              tiles.forEach(function(t) {
                var px = (t.tx - ox) * 256;
                var py = (t.ty - oy) * 256;
                ctx.drawImage(t.img, px, py, 256, 256);
              });

              // 3. Voile semi-transparent très léger pour améliorer contraste de la trace
              ctx.fillStyle = 'rgba(255,255,255,0.10)';
              ctx.fillRect(0, 0, W, H);

              // 4. Ombre de la trace
              ctx.beginPath();
              var s = toPixel(pts[0].lat, pts[0].lon);
              ctx.moveTo(s.x + 2, s.y + 2);
              pts.forEach(function(p){ var c=toPixel(p.lat,p.lon); ctx.lineTo(c.x+2, c.y+2); });
              ctx.strokeStyle = 'rgba(0,0,0,0.25)';
              ctx.lineWidth   = 7;
              ctx.lineJoin    = 'round';
              ctx.lineCap     = 'round';
              ctx.stroke();

              // 5. Trace principale dégradée orange → teal → vert
              var startPx = toPixel(pts[0].lat, pts[0].lon);
              var endPx   = toPixel(pts[pts.length-1].lat, pts[pts.length-1].lon);
              var grad = ctx.createLinearGradient(startPx.x, startPx.y, endPx.x, endPx.y);
              grad.addColorStop(0,   '#e67e22');
              grad.addColorStop(0.5, '#2a7a7a');
              grad.addColorStop(1,   '#2d7a5a');

              ctx.beginPath();
              ctx.moveTo(startPx.x, startPx.y);
              pts.forEach(function(p){ var c=toPixel(p.lat,p.lon); ctx.lineTo(c.x,c.y); });
              ctx.strokeStyle = grad;
              ctx.lineWidth   = 4;
              ctx.lineJoin    = 'round';
              ctx.lineCap     = 'round';
              ctx.stroke();

              // Contour blanc fin pour lisibilité
              ctx.beginPath();
              ctx.moveTo(startPx.x, startPx.y);
              pts.forEach(function(p){ var c=toPixel(p.lat,p.lon); ctx.lineTo(c.x,c.y); });
              ctx.strokeStyle = 'rgba(255,255,255,0.4)';
              ctx.lineWidth   = 1.5;
              ctx.stroke();

              // 6. Point de départ (orange)
              var sp = toPixel(pts[0].lat, pts[0].lon);
              ctx.beginPath();
              ctx.arc(sp.x, sp.y, 8, 0, Math.PI*2);
              ctx.fillStyle = '#e67e22';
              ctx.fill();
              ctx.strokeStyle = '#fff';
              ctx.lineWidth = 2.5;
              ctx.stroke();

              // 7. Point d'arrivée (vert)
              var ep = toPixel(pts[pts.length-1].lat, pts[pts.length-1].lon);
              ctx.beginPath();
              ctx.arc(ep.x, ep.y, 8, 0, Math.PI*2);
              ctx.fillStyle = '#2d7a5a';
              ctx.fill();
              ctx.strokeStyle = '#fff';
              ctx.lineWidth = 2.5;
              ctx.stroke();

              // 8. Labels
              ctx.font = 'bold 11px DM Sans, sans-serif';
              // Halo blanc pour lisibilité sur toute couleur de fond
              function labelHalo(text, x, y) {
                ctx.strokeStyle = 'rgba(255,255,255,0.85)';
                ctx.lineWidth = 3;
                ctx.strokeText(text, x, y);
                ctx.fillText(text, x, y);
              }
              ctx.fillStyle = '#e67e22';
              labelHalo('Départ', sp.x + 12, sp.y + 4);
              ctx.fillStyle = '#2d7a5a';
              labelHalo('Arrivée', ep.x + 12, ep.y + 4);

              // 9. Attribution OSM (obligatoire par licence)
              ctx.font = '9px DM Sans, sans-serif';
              ctx.fillStyle = 'rgba(0,0,0,0.5)';
              var attr = '© OpenStreetMap contributors';
              var aw = ctx.measureText(attr).width;
              ctx.fillStyle = 'rgba(255,255,255,0.75)';
              ctx.fillRect(W - aw - 10, H - 16, aw + 8, 14);
              ctx.fillStyle = 'rgba(0,0,0,0.6)';
              ctx.fillText(attr, W - aw - 6, H - 5);
            }

            // Premier dessin immédiat (fond + trace sans tuiles)
            redraw();
          })
          .catch(function(e){ console.warn('[GPX canvas] erreur :', e); });
      }

      document.querySelectorAll('canvas[data-gpx]').forEach(drawGpxCanvas);
    })();
    </script>

    <script>
      (function(){
        var lb=document.getElementById('lb'),
            lbImg=document.getElementById('lb-img'),
            lbCounter=document.getElementById('lb-counter'),
            postImgs=[],cur=0;

        document.querySelectorAll('.card-photos img').forEach(function(img){
          img.addEventListener('click', function(){
            var card = img.closest('.card');
            postImgs = Array.from(card.querySelectorAll('.card-photos img')).map(function(i){return i.src;});
            cur = postImgs.indexOf(img.src);
            if(cur<0) cur=0;
            show();
          });
        });

        function show(){
          lbImg.src=postImgs[cur];
          lbCounter.textContent=(cur+1)+' / '+postImgs.length;
          document.getElementById('lb-prev').style.display=postImgs.length>1?'flex':'none';
          document.getElementById('lb-next').style.display=postImgs.length>1?'flex':'none';
          lb.classList.add('open');
          document.body.style.overflow='hidden';
        }
        function close(){
          lb.classList.remove('open');
          document.body.style.overflow='';
          lbImg.src='';
        }
        document.getElementById('lb-close').addEventListener('click',close);
        document.getElementById('lb-prev').addEventListener('click',function(){cur=(cur-1+postImgs.length)%postImgs.length;show();});
        document.getElementById('lb-next').addEventListener('click',function(){cur=(cur+1)%postImgs.length;show();});
        lb.addEventListener('click',function(e){if(e.target===lb)close();});
        document.addEventListener('keydown',function(e){
          if(!lb.classList.contains('open'))return;
          if(e.key==='Escape')close();
          if(e.key==='ArrowLeft'){cur=(cur-1+postImgs.length)%postImgs.length;show();}
          if(e.key==='ArrowRight'){cur=(cur+1)%postImgs.length;show();}
        });
        var tx=0;
        lb.addEventListener('touchstart',function(e){tx=e.changedTouches[0].screenX;},{passive:true});
        lb.addEventListener('touchend',function(e){
          var dx=e.changedTouches[0].screenX-tx;
          if(Math.abs(dx)>50){cur=dx<0?(cur+1)%postImgs.length:(cur-1+postImgs.length)%postImgs.length;show();}
        },{passive:true});
      })();
    </script>
    <script>
      document.querySelectorAll('.form-delete').forEach(function(f) {
        f.addEventListener('submit', function(e) {
          if (!window.confirm('Supprimer définitivement ?')) e.preventDefault();
        });
      });
    </script>
  </body></html>`;
}


// ══════════════════════════════════════════════════════════
//  renderPreparation
// ══════════════════════════════════════════════════════════

function renderPreparation(posts, isAdmin = false, csrf = '') {
  const postCards = posts.length === 0
    ? `<div class="empty">
        <div class="empty-icon">🛠️</div>
        <h3>La préparation n'a pas encore commencé...</h3>
        <p>Les articles de préparation apparaîtront ici !</p>
      </div>`
    : posts.map(p => {
      const d = new Date(p.date);
      const weekday = d.toLocaleDateString('fr-FR', { timeZone:'Europe/Paris', weekday:'long' });
      const day     = d.toLocaleDateString('fr-FR', { timeZone:'Europe/Paris', day:'numeric' });
      const month   = d.toLocaleDateString('fr-FR', { timeZone:'Europe/Paris', month:'long' });
      const year    = d.getFullYear();
      const time    = d.toLocaleTimeString('fr-FR', { timeZone:'Europe/Paris', hour:'2-digit', minute:'2-digit' });
      return `
    <div class="card" id="post-${p.id}">
      <div class="card-date-header">
        <div class="card-date-block">
          <div class="card-day-num">${day}</div>
          <div class="card-date-text">
            <span class="card-weekday">${weekday}</span>
            <span class="card-month-year">${month} ${year}</span>
            <span class="card-time">⏱ ${time}</span>
          </div>
        </div>
        <div class="card-date-right">
          ${p.location ? `<span class="card-loc">📍 ${esc(p.location)}</span>` : ''}
        </div>
      </div>

      <div class="card-divider"></div>

      <div class="card-body">
        <h2 class="card-title">${esc(p.title)}</h2>

        ${p.photos?.length ? `
        <div class="card-photos${p.photos.length === 1 ? ' single' : ''}" style="margin:0 -18px 16px;border-radius:0">
          ${p.photos.map(ph=>`<img src="${ph}" alt="photo" loading="lazy" data-postid="${p.id}">`).join('')}
        </div>
        ` : ''}

        <p class="card-text">${esc(p.body)}</p>

        ${isAdmin ? `
        <div class="admin-actions">
          <a href="/edit/${p.id}" class="btn-edit">✏️ Modifier</a>
          <form method="POST" action="/delete/${p.id}" style="margin-left:auto" class="form-delete">
            <input type="hidden" name="_csrf" value="${csrf}">
            <button type="submit" class="btn-del">🗑️ Supprimer</button>
          </form>
        </div>` : ''}
      </div>
      <div class="comments">
        ${(p.comments||[]).map(c=>`
          <div class="comment">
            <div class="comment-avatar">${esc(initials(c.author))}</div>
            <div class="comment-bubble">
              <span class="comment-author">${esc(c.author)}</span>
              <span class="comment-date">${formatDate(c.date)}</span>
              <p class="comment-text">${esc(c.text)}</p>
            </div>
          </div>
        `).join('')}
        <form class="comment-form" action="/comment/${p.id}" method="POST">
          <input type="hidden" name="_csrf" value="${csrf}">
          <input name="author" placeholder="Votre prénom" required maxlength="40">
          <textarea name="text" placeholder="Laisser un commentaire..." required maxlength="300"></textarea>
          <button type="submit">💬 Commenter</button>
        </form>
      </div>
    </div>
  `}).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Préparation — ${TRIP_TITLE}</title>
    <style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'preparation', isAdmin, showMap: false })}

    <div style="background:linear-gradient(135deg, var(--emerald) 0%, var(--ocean-mid) 100%);padding:20px 20px 18px;border-bottom:2px solid var(--sand)">
      <div style="max-width:620px;margin:0 auto;display:flex;align-items:center;gap:14px">
        <div style="font-size:36px">🛠️</div>
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:#fff">Préparation du voyage</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:2px">Matériel, itinéraire, entraînement, logistique…</div>
        </div>
        <div style="margin-left:auto;background:rgba(255,255,255,0.15);border-radius:20px;padding:6px 14px;font-size:13px;font-weight:600;color:#fff">${posts.length} article${posts.length > 1 ? 's' : ''}</div>
      </div>
    </div>

    <div class="feed">${postCards}</div>

    ${isAdmin ? '<a class="fab" href="/post?type=preparation" title="Nouvel article de préparation">+</a>' : ''}

    <!-- Lightbox -->
    <div class="lightbox" id="lb" role="dialog" aria-modal="true">
      <button class="lb-close" id="lb-close" title="Fermer">&#x2715;</button>
      <button class="lb-nav lb-prev" id="lb-prev">&#8249;</button>
      <img id="lb-img" src="" alt="Photo agrandie">
      <button class="lb-nav lb-next" id="lb-next">&#8250;</button>
      <div class="lb-counter" id="lb-counter"></div>
    </div>

    <script>
      (function(){
        var lb=document.getElementById('lb'),
            lbImg=document.getElementById('lb-img'),
            lbCounter=document.getElementById('lb-counter'),
            postImgs=[],cur=0;
        document.querySelectorAll('.card-photos img').forEach(function(img){
          img.addEventListener('click', function(){
            var card = img.closest('.card');
            postImgs = Array.from(card.querySelectorAll('.card-photos img')).map(function(i){return i.src;});
            cur = postImgs.indexOf(img.src);
            if(cur<0) cur=0;
            show();
          });
        });
        function show(){
          lbImg.src=postImgs[cur];
          lbCounter.textContent=(cur+1)+' / '+postImgs.length;
          document.getElementById('lb-prev').style.display=postImgs.length>1?'flex':'none';
          document.getElementById('lb-next').style.display=postImgs.length>1?'flex':'none';
          lb.classList.add('open');
          document.body.style.overflow='hidden';
        }
        function close(){
          lb.classList.remove('open');
          document.body.style.overflow='';
          lbImg.src='';
        }
        document.getElementById('lb-close').addEventListener('click',close);
        document.getElementById('lb-prev').addEventListener('click',function(){cur=(cur-1+postImgs.length)%postImgs.length;show();});
        document.getElementById('lb-next').addEventListener('click',function(){cur=(cur+1)%postImgs.length;show();});
        lb.addEventListener('click',function(e){if(e.target===lb)close();});
        document.addEventListener('keydown',function(e){
          if(!lb.classList.contains('open'))return;
          if(e.key==='Escape')close();
          if(e.key==='ArrowLeft'){cur=(cur-1+postImgs.length)%postImgs.length;show();}
          if(e.key==='ArrowRight'){cur=(cur+1)%postImgs.length;show();}
        });
      })();
    </script>
    <script>
      document.querySelectorAll('.form-delete').forEach(function(f) {
        f.addEventListener('submit', function(e) {
          if (!window.confirm('Supprimer définitivement ?')) e.preventDefault();
        });
      });
    </script>
  </body></html>`;
}

// ══════════════════════════════════════════════════════════
//  renderTimeline
// ══════════════════════════════════════════════════════════

function renderTimeline(posts, isAdmin = false) {
  const timelineItems = posts.length === 0
    ? `<div class="empty"><div class="empty-icon">🗺️</div><h3>Aucune étape pour l'instant</h3></div>`
    : posts.map((p, i) => `
      <div class="timeline-item">
        <div class="timeline-dot ${i===0?'first':i===posts.length-1?'last':''}"></div>
        <a href="/#post-${p.id}" class="timeline-card">
          <div class="timeline-card-inner">
            <div class="timeline-card-inner-row">
              <div style="flex:1">
                <div class="timeline-date">📅 ${formatDateShort(p.date)}</div>
                <div class="timeline-loc">${esc(p.location || p.title)}</div>
                ${p.location ? `<div class="timeline-snippet" style="font-size:13px;color:#555;font-style:italic">${esc(p.title)}</div>` : ''}
                <p class="timeline-snippet">${esc(p.body)}</p>
                <div class="timeline-meta">
                  ${p.km ? `<span class="timeline-badge tl-km">🚴 ${esc(String(p.km))} km</span>` : ''}
                  ${p.dplus ? `<span class="timeline-badge tl-km">⛰️ ${esc(String(p.dplus))} m D+</span>` : ''}
                  ${p.author ? `<span class="timeline-badge tl-author">${AUTHOR_EMOJI[p.author]||'👤'} ${esc(p.author)}</span>` : ''}
                </div>
              </div>
              ${p.photos?.length ? `<img src="${p.photos[0]}" class="timeline-thumb" alt="photo" loading="lazy">` : ''}
            </div>
          </div>
        </a>
      </div>
    `).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Timeline — ${TRIP_TITLE}</title>
    <style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'timeline', isAdmin, showMap: true })}
    <div class="timeline-wrap">
      <div class="timeline">${timelineItems}</div>
    </div>
  </body></html>`;
}

// ══════════════════════════════════════════════════════════
//  renderMap  — avec traces GPX chargées côté client
// ══════════════════════════════════════════════════════════

function renderMap(posts, isAdmin = false) {
  const withGps = posts.filter(p => p.lat && p.lon);

  // On passe aussi les URLs GPX pour les charger côté client
  const gpsJson = JSON.stringify(withGps.map(p => ({
    lat: p.lat, lon: p.lon,
    title: p.title,
    location: p.location || '',
    km: p.km || 0,
    dplus: p.dplus || 0,
    date: p.date,
    id: p.id,
    photo: p.photos?.[0] || null,
    gpx: p.gpx || null,
  })));

  const emptyState = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--mist);">
      <div style="font-size:48px;margin-bottom:12px">🗺️</div>
      <h3 style="font-family:'Playfair Display',serif;font-size:20px;color:var(--ink-mid);margin-bottom:8px">Aucun point GPS pour l'instant</h3>
      <p style="color:var(--ink-light)">Postez une étape avec la géolocalisation activée.</p>
    </div>`;

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Carte — ${TRIP_TITLE}</title>
    <style>${CSS}
      html, body { height: 100%; margin: 0; }
      .map-page { display: flex; flex-direction: column; height: 100%; }
      .map-page .header { position: relative; flex-shrink: 0; overflow: visible; z-index: 1000; }
      .map-page .mobile-menu { position: absolute; z-index: 1001; }
      #map-container { flex: 1; position: relative; overflow: hidden; }
      #fullmap { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }
      .map-sidebar {
        position: absolute; top: 12px; left: 12px;
        z-index: 500; display: flex; flex-direction: column; gap: 8px;
        max-width: 280px; pointer-events: none;
      }
      .map-legend {
        background: rgba(255,255,255,0.94); border-radius: 12px; padding: 12px 14px;
        font-size: 12px; box-shadow: 0 4px 16px rgba(10,61,98,0.15);
        border: 1px solid rgba(10,61,98,0.08); pointer-events: all;
      }
      .map-legend-title { font-family:'Playfair Display',serif; font-size:13px; font-weight:700; color:var(--ink); margin-bottom:8px; display:flex; align-items:center; gap:6px; }
      .map-legend-row { display:flex; align-items:center; gap:8px; margin-bottom:5px; color:var(--ink-mid); }
      .map-legend-dot { width:14px; height:14px; border-radius:50%; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,0.25); flex-shrink:0; }
      .map-stats {
        background: rgba(42,122,122,0.88); border-radius:12px; padding:10px 14px; color:#fff;
        display:flex; gap:16px; box-shadow:0 4px 16px rgba(10,61,98,0.3); pointer-events:all;
      }
      .map-stat-item { text-align:center; }
      .map-stat-num { font-family:'Playfair Display',serif; font-size:18px; font-weight:700; line-height:1; }
      .map-stat-lbl { font-size:9px; text-transform:uppercase; letter-spacing:0.1em; color:rgba(255,255,255,0.6); margin-top:2px; }
      .map-popup-photo { width:100%; height:100px; object-fit:cover; border-radius:6px; margin-bottom:6px; display:block; }
      .map-popup-title { font-family:'Playfair Display',serif; font-size:14px; font-weight:700; color:var(--ink); margin-bottom:4px; }
      .map-popup-meta { font-size:11px; color:var(--ink-light); display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px; }
      .map-popup-badge { background:var(--mist); color:var(--ocean-mid); padding:2px 7px; border-radius:20px; font-weight:500; }
      .map-popup-link { display:inline-block; margin-top:6px; font-size:12px; color:var(--ocean-mid); font-weight:600; text-decoration:underline; }
    </style>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  </head><body>
    <div class="map-page">
      ${renderHeader({ activePage: 'map', isAdmin, showMap: true })}
      <div id="map-container" style="position:relative; flex:1;">
        <div id="fullmap">
          ${withGps.length === 0 ? emptyState : ''}
          ${withGps.length > 0 ? `
          <div class="map-sidebar">
            <div class="map-stats">
              <div class="map-stat-item">
                <div class="map-stat-num">${withGps.length}</div>
                <div class="map-stat-lbl">étapes</div>
              </div>
              <div class="map-stat-item">
                <div class="map-stat-num">${Math.round(withGps.reduce((s,p)=>s+(p.km||0),0)).toLocaleString('fr-FR')}</div>
                <div class="map-stat-lbl">km</div>
              </div>
              <div class="map-stat-item">
                <div class="map-stat-num">${Math.round(withGps.reduce((s,p)=>s+(p.dplus||0),0)).toLocaleString('fr-FR')}</div>
                <div class="map-stat-lbl">m D+</div>
              </div>
            </div>
            <div class="map-legend">
              <div class="map-legend-title">🗺️ Légende</div>
              <div class="map-legend-row">
                <div class="map-legend-dot" style="background:linear-gradient(135deg,#e67e22,#f39c12)"></div>
                Point de départ
              </div>
              <div class="map-legend-row">
                <div class="map-legend-dot" style="background:linear-gradient(135deg,#2a7a7a,#4aabab)"></div>
                Étape intermédiaire
              </div>
              <div class="map-legend-row">
                <div class="map-legend-dot" style="background:linear-gradient(135deg,#1a7a4a,#2ecc71)"></div>
                Dernière position connue
              </div>
              <div class="map-legend-row" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--sand)">
                <div style="width:28px;height:4px;background:#3a9090;border-radius:2px;flex-shrink:0"></div>
                Trace GPS du jour
              </div>
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const gpsData = ${gpsJson};

      function initMap() {
        if (gpsData.length === 0) return;

        const map = L.map('fullmap', { zoomControl: false, scrollWheelZoom: true });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18, attribution: '© OpenStreetMap'
        }).addTo(map);

        const pts = gpsData.map(p => [p.lat, p.lon]);

        // Tracé entre les points GPS
        if (pts.length > 1) L.polyline(pts, { color: 'rgba(0,0,0,.10)', weight: 8 }).addTo(map);
        if (pts.length > 1) L.polyline(pts, { color: '#2a7a7a', weight: 4, opacity: .9 }).addTo(map);
        if (pts.length > 1) L.polyline(pts, { color: '#fff', weight: 1.5, opacity: .5, dashArray: '8,10' }).addTo(map);

        // Charger et afficher les traces GPX de chaque étape
        const gpxPromises = gpsData
          .filter(p => p.gpx)
          .map(function(p) {
            return fetch(p.gpx)
              .then(function(r){ return r.text(); })
              .then(function(txt){
                const parser = new DOMParser();
                const xml = parser.parseFromString(txt, 'text/xml');
                const trkpts = Array.from(xml.querySelectorAll('trkpt')).map(function(tp){
                  return [parseFloat(tp.getAttribute('lat')), parseFloat(tp.getAttribute('lon'))];
                });
                if (trkpts.length < 2) return;
                // Ombre
                L.polyline(trkpts, { color: 'rgba(0,0,0,0.12)', weight: 6 }).addTo(map);
                // Trace colorée
                L.polyline(trkpts, { color: '#3a9090', weight: 3, opacity: 0.85 }).addTo(map);
              })
              .catch(function(){});
          });

        // Marqueurs des étapes
        gpsData.forEach((p, i) => {
          const isFirst = i === 0;
          const isLast  = i === gpsData.length - 1;
          let color, size;
          if (isFirst)      { color = 'linear-gradient(135deg,#e67e22,#f39c12)'; size = 22; }
          else if (isLast)  { color = 'linear-gradient(135deg,#1a7a4a,#2ecc71)'; size = 22; }
          else              { color = 'linear-gradient(135deg,#2a7a7a,#4aabab)'; size = 14; }

          const dot = '<div style="background:' + color + ';border:' + (size>14?3:2) + 'px solid #fff;border-radius:50%;width:' + size + 'px;height:' + size + 'px;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>';
          const ic = L.divIcon({ html: dot, iconSize: [size,size], iconAnchor: [size/2,size/2], className: '' });
          const marker = L.marker([p.lat, p.lon], { icon: ic }).addTo(map);

          const dateStr = new Date(p.date).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
          const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          const label = esc(p.location || p.title);
          const sub   = p.location ? '<div style="font-size:12px;color:#555;margin-bottom:2px;font-style:italic">' + esc(p.title) + '</div>' : '';
          const photoHtml = p.photo ? '<img src="' + esc(p.photo) + '" class="map-popup-photo" alt="">' : '';
          const kmHtml    = p.km    ? '<span class="map-popup-badge">' + p.km + ' km</span>' : '';
          const dplusHtml = p.dplus ? '<span class="map-popup-badge">' + p.dplus + ' m D+</span>' : '';
          const popupHtml = '<div style="min-width:180px;max-width:240px">'
            + photoHtml
            + '<div class="map-popup-title">' + label + '</div>'
            + '<div class="map-popup-meta"><span>' + dateStr + '</span>' + kmHtml + dplusHtml + '</div>'
            + sub
            + '<a href="/#post-' + esc(p.id) + '" class="map-popup-link">Lire l&#39;&eacute;tape &#8594;</a>'
            + '</div>';
          marker.bindPopup(popupHtml, { maxWidth: 260, className: 'map-custom-popup' });
        });

        map.fitBounds(L.latLngBounds(pts).pad(.18));
        setTimeout(() => map.invalidateSize(), 50);
        setTimeout(() => map.invalidateSize(), 400);
        window.addEventListener('resize', () => map.invalidateSize());
      }

      document.addEventListener('DOMContentLoaded', initMap);
    </script>
    <style>
      .map-custom-popup .leaflet-popup-content-wrapper {
        border-radius: 12px; box-shadow: 0 8px 24px rgba(10,61,98,0.18);
        border: 1px solid rgba(10,61,98,0.08); padding: 0; overflow: hidden;
      }
      .map-custom-popup .leaflet-popup-content { margin: 12px 14px; }
      .map-custom-popup .leaflet-popup-tip { background: #fff; }
    </style>
  </body></html>`;
}


// ══════════════════════════════════════════════════════════
//  renderLogin
// ══════════════════════════════════════════════════════════

function renderLogin(error, next = '/') {
  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${TRIP_TITLE} — Accès</title>
    <style>${CSS}
      body{min-height:100vh;display:flex;flex-direction:column;justify-content:center;background:var(--warm-white);}
    </style>
  </head><body>
    <div class="login-hero">
      <div style="display:flex;justify-content:center;margin-bottom:8px">
        <img src="/public/logo_nijumatim.png" alt="Nijumatim" style="height:70px;width:auto;background:#fff;border-radius:12px;padding:6px 14px;">
      </div>
      <p>${TRIP_START && TRIP_END ? esc(TRIP_START) + ' → ' + esc(TRIP_END) : 'Journal de voyage privé'}</p>
    </div>
    <div class="form-wrap" style="max-width:420px;padding-top:28px">
      <div class="form-card">
        ${error ? '<div class="error-msg">Mot de passe incorrect. Demandez-le à votre aventurier !</div>' : ''}
        <h2 style="text-align:center;margin-bottom:6px">Bienvenue !</h2>
        <p style="text-align:center;font-size:13px;color:var(--ink-light);margin-bottom:20px">
          Entrez votre mot de passe pour accéder au journal.
        </p>
        <form method="POST" action="/login">
          <input type="hidden" name="next" value="${esc(next)}">
          <div class="field">
            <label>Mot de passe</label>
            <input type="password" name="password" placeholder="" autofocus required
              style="text-align:center;font-size:18px;letter-spacing:.1em">
          </div>
          <button class="btn-submit" type="submit">Accéder au journal 🚴</button>
        </form>
      </div>
    </div>
  </body></html>`;
}

// ══════════════════════════════════════════════════════════
//  renderPostForm  — avec date éditable + autocomplete lieu
// ══════════════════════════════════════════════════════════

function renderPostForm(err, lastLocation = '', isMargot = false, csrf = '', defaultType = '') {
  const authorOptions = AUTHORS.map(a =>
    `<option value="${esc(a)}">${AUTHOR_EMOJI[a]||''} ${esc(a)}</option>`
  ).join('');

  const defaultDate = nowDatetimeLocal();
  // (defaultType est passé depuis la route)

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Nouvelle étape</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: '', isAdmin: true, showMap: false })}
    <div class="form-wrap">
      <div class="form-card">
        <h2>Poster une étape</h2>
        ${err ? `<div class="error-msg">${esc(err || '')}</div>` : ''}
        ${lastLocation ? `
        <div class="prev-location-hint">
          📍 Dernière position connue : <strong>${esc(lastLocation)}</strong>
        </div>` : ''}
        <form method="POST" action="/post?_csrf=${csrf}" enctype="multipart/form-data" id="postForm">
          <input type="hidden" name="_csrf" value="${csrf}">

          <div class="field">
            <label>Type de publication</label>
            <select name="type">
              <option value="etape" ${defaultType !== 'preparation' ? 'selected' : ''}>🚴 Étape de voyage</option>
              <option value="preparation" ${defaultType === 'preparation' ? 'selected' : ''}>🛠️ Préparation</option>
            </select>
          </div>

          <div class="field">
            <label>Date et heure de l'étape</label>
            <input type="datetime-local" name="postDate" value="${defaultDate}" required>
          </div>

          <div class="field">
            <label>Titre de l'étape *</label>
            <input name="title" type="text" placeholder="Ex : Arrivée à Lyon !" required maxlength="100">
          </div>
          <div class="field">
            <label>Raconte ta journée *</label>
            <textarea name="body" placeholder="Décris ton étape, tes rencontres, la météo..." required maxlength="2000"></textarea>
          </div>

          <div class="field">
            <label>Lieu d'arrivée</label>
            <div class="loc-wrap">
              <input name="location" id="locationField" type="text"
                placeholder="Tapez un lieu pour chercher, ou utilisez le GPS..."
                autocomplete="off">
              <div class="loc-suggestions" id="locSuggestions"></div>
            </div>
            <input type="hidden" name="lat" id="lat">
            <input type="hidden" name="lon" id="lon">
            <button type="button" class="loc-search-btn" id="gpsBtnPost">📍 GPS auto</button>
          </div>

          <div class="field-row">
            <div class="field">
              <label>Km du jour</label>
              <input name="km" type="number" min="0" max="500" step="0.1" placeholder="">
            </div>
            <div class="field">
              <label>D+ (mètres)</label>
              <input name="dplus" type="number" min="0" max="10000" placeholder="">
            </div>
          </div>
          <div class="field">
            <label>Photos (max 10, 20 Mo chacune)</label>
            <input type="file" name="photos" multiple accept="image/*" id="photoInput" onchange="previewPhotos(this)">
            <div class="photo-preview" id="photoPreview"></div>
          </div>
          <div class="field">
            <label>Trace GPX (optionnel)</label>
            <input type="file" name="gpx" accept=".gpx,application/gpx+xml"
              onchange="parseGPX(this,'locationField','lat','lon')">
            <div id="gpxInfo" style="display:none;margin-top:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;font-size:13px;color:#166534"></div>
          </div>
          <div class="field">
            <label>Visibilité</label>
            ${isMargot
              ? `<input type="hidden" name="visibility" value="margot">
                 <div style="padding:10px 14px;border-radius:10px;background:var(--mist);border:1.5px solid var(--sand);font-size:13px;color:var(--ocean-mid);font-weight:500">
                   👧 À valider (visible par admin seulement jusqu'à validation)
                 </div>`
              : `<select name="visibility">
                   <option value="all">🌍 Tout le monde</option>
                   <option value="margot">👧 À valider</option>
                 </select>`
            }
          </div>
          <button class="btn-submit" type="submit">🚴 Publier l'étape</button>
        </form>
      </div>
    </div>
    ${FORM_SCRIPTS}
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        initLocAutocomplete('locationField', 'lat', 'lon', 'locSuggestions');
        var btn = document.getElementById('gpsBtnPost');
        if (btn) btn.addEventListener('click', function() { getGPS('locationField', 'lat', 'lon'); });
      });
    </script>
  </body></html>`;
}

// ══════════════════════════════════════════════════════════
//  renderEditForm  — avec date éditable, sans auteur, autocomplete lieu
// ══════════════════════════════════════════════════════════

function renderEditForm(post, err, isMargot = false, csrf = '') {
  const postDateLocal = isoToDatetimeLocal(post.date);

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Modifier l'étape</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: '', isAdmin: true, showMap: false })}
    <div class="form-wrap">
      <div class="form-card">
        <h2>Modifier l'étape</h2>
        ${err ? `<div class="error-msg">${esc(err || '')}</div>` : ''}
        <form method="POST" action="/edit/${post.id}?_csrf=${csrf}" enctype="multipart/form-data">
          <input type="hidden" name="_csrf" value="${csrf}">

          <div class="field">
            <label>Date et heure de l'étape</label>
            <input type="datetime-local" name="postDate" value="${postDateLocal}" required>
          </div>

          <div class="field">
            <label>Titre de l'étape *</label>
            <input name="title" type="text" value="${esc(post.title)}" required maxlength="100">
          </div>
          <div class="field">
            <label>Raconte ta journée *</label>
            <textarea name="body" required maxlength="2000">${esc(post.body)}</textarea>
          </div>

          <div class="field">
            <label>Lieu</label>
            <div class="loc-wrap">
              <input name="location" id="locationField" type="text"
                value="${esc(post.location||'')}"
                placeholder="Tapez un lieu pour chercher, ou utilisez le GPS..."
                autocomplete="off">
              <div class="loc-suggestions" id="locSuggestions"></div>
            </div>
            <input type="hidden" name="lat" id="lat" value="${post.lat||''}">
            <input type="hidden" name="lon" id="lon" value="${post.lon||''}">
            <button type="button" class="loc-search-btn" id="gpsBtnEdit">📍 GPS auto</button>
          </div>

          <div class="field-row">
            <div class="field">
              <label>Km du jour</label>
              <input name="km" type="number" min="0" max="500" step="0.1" value="${post.km||''}">
            </div>
            <div class="field">
              <label>D+ (mètres)</label>
              <input name="dplus" type="number" min="0" max="10000" value="${post.dplus||''}">
            </div>
          </div>

          ${post.photos?.length ? `
          <div class="field">
            <label>Photos actuelles — décochez pour supprimer</label>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
              ${post.photos.map(ph=>`
                <label style="position:relative;cursor:pointer">
                  <input type="checkbox" name="keepPhotos" value="${ph}" checked style="position:absolute;top:4px;left:4px;z-index:1;accent-color:var(--teal)">
                  <img src="${ph}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid var(--teal-light)">
                </label>
              `).join('')}
            </div>
          </div>` : ''}
          <div class="field">
            <label>Ajouter de nouvelles photos</label>
            <input type="file" name="photos" multiple accept="image/*" onchange="previewPhotos(this)">
            <div class="photo-preview" id="photoPreview"></div>
          </div>
          ${post.gpx ? `
          <div class="field">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:13px;font-weight:500;letter-spacing:0">
              <input type="checkbox" name="keepGpx" value="1" checked style="accent-color:var(--teal)">
              Conserver la trace GPX existante
            </label>
          </div>` : ''}
          <div class="field">
            <label>Remplacer la trace GPX</label>
            <input type="file" name="gpx" accept=".gpx,application/gpx+xml"
              onchange="parseGPX(this,'locationField','lat','lon')">
            <div id="gpxInfo" style="display:none;margin-top:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;font-size:13px;color:#166534"></div>
          </div>
          <div class="field">
            <label>Visibilité</label>
            ${isMargot ? `
            <input type="hidden" name="visibility" value="margot">
            <div style="padding:10px 14px;background:#fef9c3;border:1.5px solid #fde68a;border-radius:10px;font-size:13px;color:#92400e;font-weight:500">
              👧 À valider — visible par Margot et l'admin uniquement
            </div>` : `
            <select name="visibility">
              <option value="all" ${(!post.visibility||post.visibility==='all')?'selected':''}>🌍 Tout le monde</option>
              <option value="margot" ${post.visibility==='margot'?'selected':''}>👧 À valider</option>
            </select>`}
          </div>
          <button class="btn-submit" type="submit">💾 Enregistrer les modifications</button>
        </form>
      </div>
    </div>
    ${FORM_SCRIPTS}
    <script>
    document.addEventListener('DOMContentLoaded', function() {
      initLocAutocomplete('locationField', 'lat', 'lon', 'locSuggestions');
      var btn = document.getElementById('gpsBtnEdit');
      if (btn) btn.addEventListener('click', function() { getGPS('locationField', 'lat', 'lon'); });
    });
  </script>
  </body></html>`;
}

// ══════════════════════════════════════════════════════════
//  renderRSS
// ══════════════════════════════════════════════════════════

function renderRSS(posts) {
  const items = posts.slice(0, 20).map(p => `
    <item>
      <title>${p.title}</title>
      <description><![CDATA[${p.body}]]></description>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <guid>${p.id}</guid>
    </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${TRIP_TITLE}</title>
    <description>Journal de voyage vélo</description>
    ${items}
  </channel>
</rss>`;
}

// ══════════════════════════════════════════════════════════
//  renderSettings
// ══════════════════════════════════════════════════════════

function renderSettings(csrf = '', restored = false) {
  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Paramètres — ${TRIP_TITLE}</title>
    <style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'settings', isAdmin: true, showMap: false })}
    <div class="form-wrap">

        ${restored ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:14px;color:#166534;font-weight:500">
        ✅ Données restaurées avec succès.
      </div>` : ''}

      <div class="form-card" style="margin-bottom:16px">
        <h2>⬇️ Sauvegarder</h2>
        <p style="font-size:14px;color:var(--ink-light);margin-bottom:18px;line-height:1.6">
          Télécharge un fichier <code>velo-backup-….json</code> contenant toutes les étapes.
          Conserve-le précieusement — il suffit à tout restaurer.
        </p>
        <a href="/backup" class="btn-submit" style="display:block;text-align:center;text-decoration:none">
          ⬇️ Télécharger la sauvegarde
        </a>
      </div>

      <div class="form-card">
        <h2>⬆️ Restaurer</h2>
        <p style="font-size:14px;color:var(--ink-light);margin-bottom:18px;line-height:1.6">
          Importe un fichier de sauvegarde JSON. <strong style="color:#dc2626">Les étapes actuelles
          seront remplacées</strong> par celles du fichier.
        </p>
        <form method="POST" action="/restore" enctype="multipart/form-data" class="form-restore">
          <input type="hidden" name="_csrf" value="${csrf}">
          <div class="field">
            <label>Fichier de sauvegarde (.json)</label>
            <input type="file" name="backup" accept=".json,application/json" required
                   style="padding:8px;background:#fff">
          </div>
          <button class="btn-submit" type="submit"
                  style="background:linear-gradient(135deg,#dc2626,#b91c1c)">
            ⬆️ Restaurer les données
          </button>
        </form>
      </div>

    </div>
    <script>
      document.querySelectorAll('.form-restore').forEach(function(f) {
        f.addEventListener('submit', function(e) {
          if (!window.confirm('Restaurer ces données ? Les étapes actuelles seront remplacées.')) e.preventDefault();
        });
      });
    </script>
  </body></html>`;
}
