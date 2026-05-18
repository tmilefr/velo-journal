const express = require('express');
const multer  = require('multer');
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

const AUTHORS = ['Julie', 'Margot', 'Nicolas', 'Timothé', 'La famille'];

// ── Helpers ───────────────────────────────────────────────
function readPosts() {
  if (!fs.existsSync(DATA)) return [];
  return JSON.parse(fs.readFileSync(DATA, 'utf8'));
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
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));
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
        .rotate()                          // respect EXIF orientation
        .resize(1800, 1800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, progressive: true })
        .toFile(tmpPath);
      fs.renameSync(tmpPath, file.path);
      // Rename to .jpg if not already
      if (!file.path.endsWith('.jpg') && !file.path.endsWith('.jpeg')) {
        const newPath = file.path.replace(/\.[^.]+$/, '.jpg');
        fs.renameSync(file.path, newPath);
        file.path     = newPath;
        file.filename = path.basename(newPath);
      }
    } catch(e) {
      // Keep original on error
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
  if (req.session.auth || req.session.margot) return posts; // admin et Margot voient tout
  return posts.filter(p => !p.visibility || p.visibility === 'all'); // famille
}

// ── Routes publiques ──────────────────────────────────────
app.get('/', requireFamily, (req, res) => {
  const posts = filterPostsByRole(readPosts().sort((a, b) => new Date(b.date) - new Date(a.date)), req);
  res.send(renderPublic(posts, !!req.session.auth || !!req.session.margot));
});

app.get('/timeline', requireFamily, (req, res) => {
  const posts = filterPostsByRole(readPosts().sort((a, b) => new Date(a.date) - new Date(b.date)), req);
  res.send(renderTimeline(posts, !!req.session.auth || !!req.session.margot));
});

app.get('/map', requireFamily, (req, res) => {
  const posts = filterPostsByRole(readPosts().sort((a, b) => new Date(a.date) - new Date(b.date)), req);
  res.send(renderMap(posts, !!req.session.auth || !!req.session.margot));
});

app.get('/rss', requireFamily, (req, res) => {
  const posts = filterPostsByRole(readPosts().sort((a, b) => new Date(b.date) - new Date(a.date)), req);
  res.type('application/rss+xml');
  res.send(renderRSS(posts));
});

// ── Commentaires ──────────────────────────────────────────
app.post('/comment/:id', requireFamily, (req, res) => {
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

app.post('/login', (req, res) => {
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

// Redirections legacy
app.get('/family-login', (req, res) => res.redirect('/login' + (req.query.next ? '?next=' + encodeURIComponent(req.query.next) : '')));

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ── Admin : poster ────────────────────────────────────────
app.get('/post', requireAuth, (req, res) => {
  const posts = readPosts().sort((a, b) => new Date(b.date) - new Date(a.date));
  const lastLocation = posts.length > 0 ? (posts[0].location || '') : '';
  res.send(renderPostForm(null, lastLocation, !!req.session.margot));
});

app.post('/post', requireAuth, upload.fields([{name:'photos', maxCount:10},{name:'gpx', maxCount:1}]), async (req, res) => {
  const { title, body, location, lat, lon, km, dplus, author, visibility } = req.body;
  if (!title?.trim() || !body?.trim()) {
    return res.send(renderPostForm('Titre et texte obligatoires.', '', !!req.session.margot));
  }
  await resizeUploadedImages(req.files?.photos || []);
  const photos  = (req.files?.photos || []).map(f => '/uploads/' + f.filename);
  const gpxFile = req.files?.gpx?.[0] ? '/uploads/' + req.files.gpx[0].filename : null;

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
    date:       new Date().toISOString(),
    title:      title.trim(),
    body:       body.trim(),
    location:   location?.trim() || '',
    lat:        finalLat,
    lon:        finalLon,
    km:         parseFloat(km)   || 0,
    dplus:      parseInt(dplus)  || 0,
    author:     AUTHORS.includes(author) ? author : AUTHORS[0],
    visibility: forcedViz,
    photos,
    gpx:        gpxFile,
    comments:   []
  });
  writePosts(posts);
  res.redirect('/');
});

// ── Admin : supprimer ─────────────────────────────────────
app.post('/delete/:id', requireAuth, (req, res) => {
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
  res.send(renderEditForm(post, null, !!req.session.margot));
});

app.post('/edit/:id', requireAuth, upload.fields([{name:'photos', maxCount:10},{name:'gpx', maxCount:1}]), async (req, res) => {
  const posts = readPosts();
  const idx   = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).send('Étape introuvable');
  const { title, body, location, lat, lon, km, dplus, author, visibility } = req.body;
  if (!title?.trim() || !body?.trim()) {
    return res.send(renderEditForm(posts[idx], 'Titre et texte obligatoires.', !!req.session.margot));
  }
  const existing = posts[idx];
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

  // Delete old GPX if replaced
  if (req.files?.gpx?.[0] && existing.gpx && existing.gpx !== gpxFile) {
    const abs = path.join(__dirname, 'public', existing.gpx);
    if (fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch(e){} }
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

  const validViz = ['all', 'margot', 'admin'];
  posts[idx] = {
    ...existing,
    title:      title.trim(),
    body:       body.trim(),
    location:   location?.trim() || '',
    lat:        finalLat,
    lon:        finalLon,
    km:         parseFloat(km)   || 0,
    dplus:      parseInt(dplus)  || 0,
    author:     AUTHORS.includes(author) ? author : (existing.author || AUTHORS[0]),
    visibility: validViz.includes(visibility) ? visibility : (existing.visibility || 'all'),
    photos,
    gpx:        gpxFile,
  };
  writePosts(posts);
  res.redirect('/#post-' + req.params.id);
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
//  Logo SVG inline (white version for dark header)
// ══════════════════════════════════════════════════════════

const LOGO_SVG = `<img src="/public/logo_nijumatim.png" class="header-logo" alt="${TRIP_TITLE || 'Nijumatim'}">`;

// Génère le bloc header + menu mobile hamburger
function renderHeader({ activePage = '', isAdmin = false, showMap = false } = {}) {
  const links = [
    { href: '/', label: 'Journal', key: 'journal' },
    { href: '/timeline', label: 'Timeline', key: 'timeline' },
    ...(showMap ? [{ href: '/map', label: '🗺️ Carte', key: 'map' }] : []),
    { href: '/rss', label: 'RSS', key: 'rss' },
    ...(!isAdmin ? [{ href: '/login', label: '🔧', key: 'login' }] : []),
    { href: '/logout', label: '🔓 Déco', key: 'logout' },
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
        <button class="hamburger" id="hamburger" aria-label="Menu" onclick="toggleMenu()">
          <span></span><span></span><span></span>
        </button>
      </div>
      <nav class="mobile-menu" id="mobileMenu">${mobileLinks}</nav>
    </div>
    <script>
      function toggleMenu(){
        var h=document.getElementById('hamburger');
        var m=document.getElementById('mobileMenu');
        var open=m.classList.toggle('open');
        h.classList.toggle('open',open);
      }
      document.addEventListener('click',function(e){
        var h=document.getElementById('hamburger');
        var m=document.getElementById('mobileMenu');
        if(!h.contains(e.target)&&!m.contains(e.target)){
          m.classList.remove('open');h.classList.remove('open');
        }
      });
    </script>`;
}

// ══════════════════════════════════════════════════════════
//  Design System & CSS
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

  /* ── MAP ─────────────────────────────────────────── */
  .map-wrap{
    background:var(--mist);
    height:320px;
    position:relative;
    overflow:hidden;
    border-bottom:3px solid var(--teal-light);
  }
  #map{width:100%;height:100%}

  /* ── FILTER BAR ──────────────────────────────────── */
  .filter-bar{
    background:#fff;
    border-bottom:1px solid var(--sand);
    padding:10px 16px;
    display:flex;
    gap:8px;
    align-items:center;
    overflow-x:auto;
    scrollbar-width:none;
  }

  .filter-bar::-webkit-scrollbar{display:none}

  .filter-label{
    font-size:11px;
    color:var(--ink-light);
    font-weight:600;
    text-transform:uppercase;
    letter-spacing:0.08em;
    white-space:nowrap;
    margin-right:4px;
  }

  .filter-chip{
    display:inline-flex;
    align-items:center;
    gap:5px;
    padding:5px 12px;
    border-radius:20px;
    font-size:12px;
    font-weight:500;
    border:1.5px solid var(--sand);
    background:#fff;
    color:var(--ink-mid);
    text-decoration:none;
    white-space:nowrap;
    transition:all .15s;
    cursor:pointer;
  }

  .filter-chip:hover{
    border-color:var(--teal);
    color:var(--teal);
  }

  .filter-chip.active{
    background:linear-gradient(135deg, var(--ocean-mid), var(--teal));
    border-color:transparent;
    color:#fff;
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

  /* ── CARD DATE HEADER ────────────────────────────── */
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

  .card-date{
    font-size:11px;
    color:var(--ink-light);
    font-weight:400;
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

  .author-badge{
    font-size:11px;
    background:var(--mist);
    color:var(--ocean-mid);
    padding:3px 9px;
    border-radius:20px;
    font-weight:500;
    display:inline-flex;
    align-items:center;
    gap:4px;
    margin-left:auto;
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
  .admin-banner{
    background:var(--ocean);
    border-bottom:2px solid var(--teal-light);
    padding:10px 18px;
    display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  }

  .admin-banner-label{
    color:var(--emerald-light);
    font-size:12px;font-weight:600;flex:1;
  }

  .admin-banner a,.admin-banner-btn{
    display:inline-flex;align-items:center;gap:5px;
    background:rgba(255,255,255,0.12);
    color:#fff;border:1px solid rgba(255,255,255,0.2);
    border-radius:8px;padding:6px 14px;
    font-size:12px;font-weight:500;cursor:pointer;text-decoration:none;
    transition:background .15s;
  }

  .admin-banner a:hover,.admin-banner-btn:hover{
    background:rgba(255,255,255,0.2);
  }

  .admin-banner-btn.danger{
    background:rgba(155,28,28,0.5);
    border-color:rgba(220,50,50,0.4);
  }

  .admin-banner-btn.danger:hover{background:rgba(155,28,28,0.8)}

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

  .gpx-link{
    display:inline-flex;align-items:center;gap:5px;
    font-size:12px;background:var(--accent-light);
    color:var(--accent);padding:4px 10px;
    border-radius:20px;
    border:1px solid rgba(230,126,34,0.2);
    font-weight:500;
  }

  .gpx-map-wrap{
    margin:14px -18px 0;
    background:var(--mist);
    border-top:1px solid var(--sand);
    border-bottom:1px solid var(--sand);
    overflow:hidden;
  }

  .gpx-leaflet{
    border-top:1px solid var(--sand);
  }

  .gpx-map-footer{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:6px 14px;
    background:rgba(255,255,255,0.7);
    border-top:1px solid var(--sand);
  }

  .gpx-map-lbl{
    font-size:11px;
    color:var(--ink-light);
    font-weight:500;
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

const AUTHOR_EMOJI = {
  'Julie': '👩',
  'Margot': '👧',
  'Nicolas': '🧔',
  'Timothé': '🧑',
  'La famille': '👨‍👩‍👧‍👦',
};

// ══════════════════════════════════════════════════════════
//  renderPublic
// ══════════════════════════════════════════════════════════

function renderPublic(posts, isAdmin = false) {
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

      <!-- Date en vedette -->
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
          ${p.location ? `<span class="card-loc">📍 ${p.location}</span>` : ''}
        </div>
      </div>

      <div class="card-divider"></div>

      <div class="card-body">
        <h2 class="card-title">${p.title}</h2>

        <!-- Badges km / D+ -->
        ${(p.km || p.dplus) ? `
        <div class="card-badges" style="margin-bottom:14px">
          ${p.km   ? `<span class="km-badge">🚴 +${p.km} km</span>` : ''}
          ${p.dplus ? `<span class="dplus-badge">⛰️ ${p.dplus} m D+</span>` : ''}
        </div>` : ''}

        <!-- Photos APRÈS le titre -->
        ${p.photos?.length ? `
        <div class="card-photos${p.photos.length === 1 ? ' single' : ''}" style="margin:0 -18px 16px;border-radius:0">
          ${p.photos.map(ph=>`<img src="${ph}" alt="photo" loading="lazy" data-postid="${p.id}">`).join('')}
        </div>
        ` : ''}

        <p class="card-text">${p.body}</p>
        ${p.gpx ? `
        <div class="gpx-map-wrap" data-gpx="${p.gpx}">
          <div class="gpx-leaflet" id="gpxmap-${p.id}" style="height:260px"></div>
          <div class="gpx-map-footer">
            <span class="gpx-map-lbl">🗺️ Trace GPX</span>
            <a class="gpx-link" href="${p.gpx}" download>⬇️ Télécharger</a>
          </div>
        </div>` : ''}
        ${isAdmin ? `
        <div class="admin-actions">
          <a href="/edit/${p.id}" class="btn-edit">✏️ Modifier</a>
          ${p.visibility && p.visibility !== 'all' ? `<span style="font-size:11px;padding:4px 10px;border-radius:20px;background:#fef9c3;color:#92400e">⏳ À valider</span>` : ''}
          <form method="POST" action="/delete/${p.id}" style="margin-left:auto" onsubmit="return confirm('Supprimer définitivement cette étape ?')">
            <button type="submit" class="btn-del">🗑️ Supprimer</button>
          </form>
        </div>` : ''}
      </div>
      <div class="comments">
        ${(p.comments||[]).map(c=>`
          <div class="comment">
            <div class="comment-avatar">${initials(c.author)}</div>
            <div class="comment-bubble">
              <span class="comment-author">${c.author}</span>
              <span class="comment-date">${formatDate(c.date)}</span>
              <p class="comment-text">${c.text}</p>
            </div>
          </div>
        `).join('')}
        <form class="comment-form" action="/comment/${p.id}" method="POST">
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
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
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

    ${isAdmin ? '<a class="fab" href="/post" title="Nouvelle étape">+</a>' : ''}

    <!-- Lightbox (photos du post seulement) -->
    <div class="lightbox" id="lb" role="dialog" aria-modal="true">
      <button class="lb-close" id="lb-close" title="Fermer">&#x2715;</button>
      <button class="lb-nav lb-prev" id="lb-prev">&#8249;</button>
      <img id="lb-img" src="" alt="Photo agrandie">
      <button class="lb-nav lb-next" id="lb-next">&#8250;</button>
      <div class="lb-counter" id="lb-counter"></div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      // ── GPX Leaflet map renderer ─────────────────────
      (function(){
        function drawGpx(wrap) {
          var url = wrap.dataset.gpx;
          var mapDiv = wrap.querySelector('.gpx-leaflet');
          if (!url || !mapDiv) return;
          fetch(url)
            .then(function(r){ return r.text(); })
            .then(function(txt){
              var parser = new DOMParser();
              var xml = parser.parseFromString(txt, 'text/xml');
              var pts = Array.from(xml.querySelectorAll('trkpt')).map(function(p){
                return [parseFloat(p.getAttribute('lat')), parseFloat(p.getAttribute('lon'))];
              });
              if (pts.length < 2) return;
              var map = L.map(mapDiv, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 18, attribution: '© OpenStreetMap'
              }).addTo(map);
              L.polyline(pts, { color: 'rgba(0,0,0,0.12)', weight: 7 }).addTo(map);
              L.polyline(pts, { color: '#3a9090', weight: 3.5, opacity: 0.95 }).addTo(map);
              var mk = function(color){ return L.divIcon({ html: '<div style="background:'+color+';border:2px solid #fff;border-radius:50%;width:12px;height:12px;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>', iconSize:[12,12], iconAnchor:[6,6], className:'' }); };
              L.marker(pts[0], { icon: mk('#e67e22') }).addTo(map);
              L.marker(pts[pts.length-1], { icon: mk('#2d7a5a') }).addTo(map);
              map.fitBounds(L.latLngBounds(pts).pad(0.15));
              setTimeout(function(){ map.invalidateSize(); }, 100);
            })
            .catch(function(){});
        }
        document.querySelectorAll('.gpx-map-wrap').forEach(drawGpx);
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
            // Collect only photos from the same post card
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
                <div class="timeline-loc">${p.location || p.title}</div>
                ${p.location ? `<div class="timeline-snippet" style="font-size:13px;color:#555;font-style:italic">${p.title}</div>` : ''}
                <p class="timeline-snippet">${p.body}</p>
                <div class="timeline-meta">
                  ${p.km ? `<span class="timeline-badge tl-km">🚴 ${p.km} km</span>` : ''}
                  ${p.dplus ? `<span class="timeline-badge tl-km">⛰️ ${p.dplus} m D+</span>` : ''}
                  ${p.author ? `<span class="timeline-badge tl-author">${AUTHOR_EMOJI[p.author]||'👤'} ${p.author}</span>` : ''}
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
      <h2 class="timeline-title">📍 Itinéraire chronologique</h2>
      <div class="timeline">
        ${timelineItems}
      </div>
    </div>
  </body></html>`;
}

// ══════════════════════════════════════════════════════════
//  renderMap
// ══════════════════════════════════════════════════════════

function renderMap(posts, isAdmin = false) {
  const withGps = posts.filter(p => p.lat && p.lon);

  const gpsJson = JSON.stringify(withGps.map(p => ({
    lat: p.lat, lon: p.lon,
    title: p.title,
    location: p.location || '',
    km: p.km || 0,
    dplus: p.dplus || 0,
    date: p.date,
    id: p.id,
    photo: p.photos?.[0] || null,
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
      /* Sur la page carte : layout flex sans overflow:hidden sur body */
      .map-page { display: flex; flex-direction: column; height: 100%; }
      .map-page .header { position: relative; flex-shrink: 0; overflow: visible; z-index: 1000; }
      .map-page .mobile-menu { position: absolute; z-index: 1001; }
      #map-container { flex: 1; position: relative; overflow: hidden; }
      #fullmap {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
      }
      .map-sidebar {
        position: absolute;
        top: 12px; left: 12px;
        z-index: 500;
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-width: 280px;
        pointer-events: none;
      }
      .map-legend {
        background: rgba(255,255,255,0.94);
        border-radius: 12px;
        padding: 12px 14px;
        font-size: 12px;
        box-shadow: 0 4px 16px rgba(10,61,98,0.15);
        border: 1px solid rgba(10,61,98,0.08);
        pointer-events: all;
      }
      .map-legend-title {
        font-family: 'Playfair Display', serif;
        font-size: 13px;
        font-weight: 700;
        color: var(--ink);
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .map-legend-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 5px;
        color: var(--ink-mid);
      }
      .map-legend-dot {
        width: 14px; height: 14px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 1px 4px rgba(0,0,0,0.25);
        flex-shrink: 0;
      }
      .map-stats {
        background: rgba(42,122,122,0.88);
        border-radius: 12px;
        padding: 10px 14px;
        color: #fff;
        display: flex;
        gap: 16px;
        box-shadow: 0 4px 16px rgba(10,61,98,0.3);
        pointer-events: all;
      }
      .map-stat-item { text-align: center; }
      .map-stat-num { font-family: 'Playfair Display', serif; font-size: 18px; font-weight: 700; line-height: 1; }
      .map-stat-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.6); margin-top: 2px; }
      .map-popup-photo { width: 100%; height: 100px; object-fit: cover; border-radius: 6px; margin-bottom: 6px; display: block; }
      .map-popup-title { font-family: 'Playfair Display', serif; font-size: 14px; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
      .map-popup-meta { font-size: 11px; color: var(--ink-light); display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
      .map-popup-badge { background: var(--mist); color: var(--ocean-mid); padding: 2px 7px; border-radius: 20px; font-weight: 500; }
      .map-popup-link { display: inline-block; margin-top: 6px; font-size: 12px; color: var(--ocean-mid); font-weight: 600; text-decoration: underline; }
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
          </div>
        </div>
        ` : ''}
      </div><!-- #fullmap -->
      </div><!-- #map-container -->
    </div><!-- .map-page -->

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

        // Tracé
        if (pts.length > 1) L.polyline(pts, { color: 'rgba(0,0,0,.10)', weight: 8 }).addTo(map);
        if (pts.length > 1) L.polyline(pts, { color: '#2a7a7a', weight: 4, opacity: .9 }).addTo(map);
        if (pts.length > 1) L.polyline(pts, { color: '#fff', weight: 1.5, opacity: .5, dashArray: '8,10' }).addTo(map);

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

          var dateStr = new Date(p.date).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
          var esc = function(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
          var label = esc(p.location || p.title);
          var sub   = p.location ? '<div style="font-size:12px;color:#555;margin-bottom:2px;font-style:italic">' + esc(p.title) + '</div>' : '';
          var photoHtml = p.photo ? '<img src="' + esc(p.photo) + '" class="map-popup-photo" alt="">' : '';
          var kmHtml    = p.km    ? '<span class="map-popup-badge">' + p.km + ' km</span>' : '';
          var dplusHtml = p.dplus ? '<span class="map-popup-badge">' + p.dplus + ' m D+</span>' : '';
          var popupHtml = '<div style="min-width:180px;max-width:240px">'
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
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(10,61,98,0.18);
        border: 1px solid rgba(10,61,98,0.08);
        padding: 0;
        overflow: hidden;
      }
      .map-custom-popup .leaflet-popup-content { margin: 12px 14px; }
      .map-custom-popup .leaflet-popup-tip { background: #fff; }
    </style>
  </body></html>`;
}

// ══════════════════════════════════════════════════════════
//  renderFamilyLogin
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
      <p>${TRIP_START && TRIP_END ? TRIP_START + ' → ' + TRIP_END : 'Journal de voyage privé'}</p>
    </div>

    <div class="form-wrap" style="max-width:420px;padding-top:28px">
      <div class="form-card">
        ${error ? '<div class="error-msg">Mot de passe incorrect. Demandez-le à votre aventurier !</div>' : ''}
        <h2 style="text-align:center;margin-bottom:6px">Bienvenue !</h2>
        <p style="text-align:center;font-size:13px;color:var(--ink-light);margin-bottom:20px">
          Entrez votre mot de passe pour accéder au journal.
        </p>
        <form method="POST" action="/login">
          <input type="hidden" name="next" value="${next}">
          <div class="field">
            <label>Mot de passe</label>
            <input type="password" name="password" placeholder="••••••••" autofocus required
              style="text-align:center;font-size:18px;letter-spacing:.1em">
          </div>
          <button class="btn-submit" type="submit">Accéder au journal 🚴</button>
        </form>
      </div>
    </div>
  </body></html>`;
}

// ══════════════════════════════════════════════════════════
//  renderFamilyLogin (legacy stub — plus utilisé)
// ══════════════════════════════════════════════════════════

function renderFamilyLogin(error, next) {
  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${TRIP_TITLE} — Accès</title>
    <style>${CSS}
      body{min-height:100vh;display:flex;flex-direction:column;justify-content:center;background:var(--warm-white);}
    </style>
  </head><body>
    <div class="login-hero">
      <div class="login-hero-icon">🚴</div>
      <h2>${TRIP_TITLE}</h2>
      <p>${TRIP_START && TRIP_END ? TRIP_START+' → '+TRIP_END : 'Journal de voyage privé'}</p>
    </div>

    <div class="form-wrap" style="max-width:420px;padding-top:28px">
      <div class="form-card">
        ${error ? '<div class="error-msg">Mot de passe incorrect. Demandez-le à votre aventurier !</div>' : ''}
        <h2 style="text-align:center;margin-bottom:6px">Accès famille</h2>
        <p style="text-align:center;font-size:13px;color:var(--ink-light);margin-bottom:20px">
          Entrez le mot de passe partagé pour suivre le voyage.
        </p>
        <form method="POST" action="/family-login">
          <input type="hidden" name="next" value="${next}">
          <div class="field">
            <label>Mot de passe</label>
            <input type="password" name="password" placeholder="••••••••" autofocus required
              style="text-align:center;font-size:18px;letter-spacing:.1em">
          </div>
          <button class="btn-submit" type="submit">Accéder au journal 🚴</button>
        </form>
        <div style="text-align:center;margin-top:18px;padding-top:14px;border-top:1px solid var(--sand)">
          <a href="/login" style="font-size:12px;color:var(--ink-light);display:inline-flex;align-items:center;gap:5px;
            padding:6px 14px;border:1px solid var(--sand);border-radius:8px;transition:background .15s"
            onmouseover="this.style.background='var(--mist)'" onmouseout="this.style.background='transparent'">
            🔧 Accès administrateur
          </a>
        </div>
      </div>
    </div>
  </body></html>`;
}

// ══════════════════════════════════════════════════════════
//  renderPostForm
// ══════════════════════════════════════════════════════════

function renderPostForm(err, lastLocation = '', isMargot = false) {
  const authorOptions = AUTHORS.map(a =>
    `<option value="${a}">${AUTHOR_EMOJI[a]||''} ${a}</option>`
  ).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Nouvelle étape</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: '', isAdmin: true, showMap: false })}
    <div class="form-wrap">
      <div class="form-card">
        <h2>Poster une étape</h2>
        ${err ? `<div class="error-msg">${err}</div>` : ''}
        ${lastLocation ? `
        <div class="prev-location-hint">
          📍 Dernière position connue : <strong>${lastLocation}</strong>
        </div>` : ''}
        <form method="POST" action="/post" enctype="multipart/form-data" id="postForm">
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
            <input name="location" id="locationField" type="text" placeholder="Ex : Lyon, Bord de Saône">
            <button type="button" class="gps-btn" onclick="getGPS()">📍 Détecter ma position</button>
          </div>
          <input type="hidden" name="lat" id="lat">
          <input type="hidden" name="lon" id="lon">
          <div class="field-row">
            <div class="field">
              <label>Km du jour</label>
              <input name="km" type="number" min="0" max="500" step="0.1" placeholder="68">
            </div>
            <div class="field">
              <label>D+ (mètres)</label>
              <input name="dplus" type="number" min="0" max="10000" placeholder="1200">
            </div>
          </div>
          <div class="field">
            <label>Photos (max 10, 20 Mo chacune)</label>
            <input type="file" name="photos" multiple accept="image/*" id="photoInput" onchange="previewPhotos(this)">
            <div class="photo-preview" id="photoPreview"></div>
          </div>
          <div class="field">
            <label>Trace GPX (optionnel)</label>
            <input type="file" name="gpx" accept=".gpx,application/gpx+xml" onchange="parseGPX(this)">
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
    <script>
      function getGPS() {
        if (!navigator.geolocation) {
          return alert('Géolocalisation non disponible sur ce navigateur.');
        }
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
          return alert('La géolocalisation nécessite HTTPS. Configurez un certificat SSL sur votre domaine.');
        }
        navigator.geolocation.getCurrentPosition(
          pos => {
            document.getElementById('lat').value = pos.coords.latitude.toFixed(6);
            document.getElementById('lon').value = pos.coords.longitude.toFixed(6);
            if (!document.getElementById('locationField').value) {
              fetch('https://nominatim.openstreetmap.org/reverse?lat=' + pos.coords.latitude + '&lon=' + pos.coords.longitude + '&format=json')
                .then(r => r.json())
                .then(d => {
                  const a = d.address;
                  document.getElementById('locationField').value = [a.town || a.city || a.village, a.state].filter(Boolean).join(', ');
                })
                .catch(() => {
                  alert('Position GPS enregistrée ! (Nom du lieu non trouvé, remplissez-le manuellement)');
                });
            }
            alert('Position enregistrée : ' + pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4));
          },
          err => {
            const msgs = {1: 'Permission refusée', 2: 'Position indisponible', 3: 'Délai dépassé'};
            alert('Erreur GPS : ' + (msgs[err.code] || err.message));
          },
          { timeout: 10000, maximumAge: 60000 }
        );
      }
      function parseGPX(input) {
        const file = input.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const parser = new DOMParser();
            const xml = parser.parseFromString(e.target.result, 'text/xml');
            const trkpts = Array.from(xml.querySelectorAll('trkpt'));
            if (!trkpts.length) { alert('Aucun point trouvé dans ce fichier GPX.'); return; }
            let dist = 0;
            for (let i = 1; i < trkpts.length; i++) {
              const lat1=parseFloat(trkpts[i-1].getAttribute('lat')),lon1=parseFloat(trkpts[i-1].getAttribute('lon'));
              const lat2=parseFloat(trkpts[i].getAttribute('lat')),lon2=parseFloat(trkpts[i].getAttribute('lon'));
              const R=6371000,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
              const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
              dist+=R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
            }
            let dplus=0;
            const elevs=trkpts.map(p=>parseFloat(p.querySelector('ele')?.textContent||0)).filter(v=>!isNaN(v));
            for(let i=1;i<elevs.length;i++){if(elevs[i]>elevs[i-1])dplus+=elevs[i]-elevs[i-1];}
            const last=trkpts[trkpts.length-1];
            const lat=parseFloat(last.getAttribute('lat')),lon=parseFloat(last.getAttribute('lon'));
            const kmVal=(dist/1000).toFixed(1);
            const dpVal=Math.round(dplus);
            document.querySelector('[name=km]').value=kmVal;
            document.querySelector('[name=dplus]').value=dpVal;
            document.getElementById('lat').value=lat.toFixed(6);
            document.getElementById('lon').value=lon.toFixed(6);
            fetch('https://nominatim.openstreetmap.org/reverse?lat='+lat+'&lon='+lon+'&format=json')
              .then(r=>r.json()).then(d=>{
                const a=d.address;
                if(!document.getElementById('locationField').value)
                  document.getElementById('locationField').value=[a.town||a.city||a.village,a.state].filter(Boolean).join(', ');
              }).catch(()=>{});
            document.getElementById('gpxInfo').style.display='block';
            document.getElementById('gpxInfo').innerHTML='✅ Trace importée — <strong>'+kmVal+' km</strong> · <strong>'+dpVal.toLocaleString()+' m D+</strong> · '+trkpts.length+' points';
          } catch(err) { alert('Erreur lors de la lecture du GPX : '+err.message); }
        };
        reader.readAsText(file);
      }
      function previewPhotos(input) {
        const preview = document.getElementById('photoPreview');
        preview.innerHTML='';
        Array.from(input.files).forEach(f=>{
          const img=document.createElement('img');
          img.src=URL.createObjectURL(f);
          preview.appendChild(img);
        });
      }
    </script>
  </body></html>`;
}

// ══════════════════════════════════════════════════════════
//  renderEditForm
// ══════════════════════════════════════════════════════════

function renderEditForm(post, err, isMargot = false) {
  const authorOptions = AUTHORS.map(a =>
    `<option value="${a}" ${post.author===a?'selected':''}>${AUTHOR_EMOJI[a]||''} ${a}</option>`
  ).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Modifier l'étape</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: '', isAdmin: true, showMap: false })}
    <div class="form-wrap">
      <div class="form-card">
        <h2>Modifier l'étape</h2>
        ${err ? `<div class="error-msg">${err}</div>` : ''}
        <form method="POST" action="/edit/${post.id}" enctype="multipart/form-data">
          <div class="field">
            <label>Auteur</label>
            <select name="author">${authorOptions}</select>
          </div>
          <div class="field">
            <label>Titre de l'étape *</label>
            <input name="title" type="text" value="${post.title.replace(/"/g,'&quot;')}" required maxlength="100">
          </div>
          <div class="field">
            <label>Raconte ta journée *</label>
            <textarea name="body" required maxlength="2000">${post.body}</textarea>
          </div>
          <div class="field">
            <label>Lieu</label>
            <input name="location" id="locationField" type="text" value="${(post.location||'').replace(/"/g,'&quot;')}" placeholder="Ex : Lyon, Bord de Saône">
            <button type="button" class="gps-btn" onclick="getGPS()">📍 Détecter ma position</button>
          </div>
          <input type="hidden" name="lat" id="lat" value="${post.lat||''}">
          <input type="hidden" name="lon" id="lon" value="${post.lon||''}">
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
            <input type="file" name="gpx" accept=".gpx,application/gpx+xml" onchange="parseGPX(this)">
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
    <script>
      function getGPS() {
        if(!navigator.geolocation) return alert('Géolocalisation non disponible');
        navigator.geolocation.getCurrentPosition(pos=>{
          document.getElementById('lat').value=pos.coords.latitude.toFixed(6);
          document.getElementById('lon').value=pos.coords.longitude.toFixed(6);
          if(!document.getElementById('locationField').value){
            fetch('https://nominatim.openstreetmap.org/reverse?lat='+pos.coords.latitude+'&lon='+pos.coords.longitude+'&format=json')
              .then(r=>r.json()).then(d=>{const a=d.address;document.getElementById('locationField').value=[a.town||a.city||a.village,a.state].filter(Boolean).join(', ');}).catch(()=>{});
          }
          alert('Position mise à jour !');
        },()=>alert('Impossible d\'obtenir la position.'));
      }
      function parseGPX(input){
        const file=input.files[0];if(!file)return;
        const reader=new FileReader();
        reader.onload=e=>{
          try{
            const parser=new DOMParser();
            const xml=parser.parseFromString(e.target.result,'text/xml');
            const trkpts=Array.from(xml.querySelectorAll('trkpt'));
            if(!trkpts.length){alert('Aucun point trouvé dans ce fichier GPX.');return;}
            let dist=0;
            for(let i=1;i<trkpts.length;i++){
              const lat1=parseFloat(trkpts[i-1].getAttribute('lat')),lon1=parseFloat(trkpts[i-1].getAttribute('lon'));
              const lat2=parseFloat(trkpts[i].getAttribute('lat')),lon2=parseFloat(trkpts[i].getAttribute('lon'));
              const R=6371000,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
              const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
              dist+=R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
            }
            let dplus=0;
            const elevs=trkpts.map(p=>parseFloat(p.querySelector('ele')?.textContent||0)).filter(v=>!isNaN(v));
            for(let i=1;i<elevs.length;i++){if(elevs[i]>elevs[i-1])dplus+=elevs[i]-elevs[i-1];}
            const last=trkpts[trkpts.length-1];
            const lat=parseFloat(last.getAttribute('lat')),lon=parseFloat(last.getAttribute('lon'));
            const kmVal=(dist/1000).toFixed(1);const dpVal=Math.round(dplus);
            document.querySelector('[name=km]').value=kmVal;document.querySelector('[name=dplus]').value=dpVal;
            document.getElementById('lat').value=lat.toFixed(6);document.getElementById('lon').value=lon.toFixed(6);
            fetch('https://nominatim.openstreetmap.org/reverse?lat='+lat+'&lon='+lon+'&format=json')
              .then(r=>r.json()).then(d=>{const a=d.address;if(!document.getElementById('locationField').value)document.getElementById('locationField').value=[a.town||a.city||a.village,a.state].filter(Boolean).join(', ');}).catch(()=>{});
            document.getElementById('gpxInfo').style.display='block';
            document.getElementById('gpxInfo').innerHTML='✅ Trace importée — <strong>'+kmVal+' km</strong> · <strong>'+dpVal.toLocaleString()+' m D+</strong> · '+trkpts.length+' points';
          }catch(err){alert('Erreur GPX : '+err.message);}
        };
        reader.readAsText(file);
      }
      function previewPhotos(input){
        const preview=document.getElementById('photoPreview');preview.innerHTML='';
        Array.from(input.files).forEach(f=>{const img=document.createElement('img');img.src=URL.createObjectURL(f);preview.appendChild(img);});
      }
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