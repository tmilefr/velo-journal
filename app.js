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

// ── Générateur ZIP sans dépendance (méthode "stored", non compressée) ──
// Suffisant pour une sauvegarde : les JPEG/MP4 sont déjà compressés.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
// Construit un Buffer ZIP à partir d'une liste {name, data:Buffer}
function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data    = e.data;
    const crc     = crc32(data);
    const size    = data.length;

    // En-tête local (30 octets + nom)
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // signature
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // flag : nom en UTF-8
    local.writeUInt16LE(0, 8);            // méthode 0 = stored
    local.writeUInt16LE(0, 10);           // heure
    local.writeUInt16LE(0, 12);           // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);        // taille compressée
    local.writeUInt32LE(size, 22);        // taille non compressée
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // extra field length

    chunks.push(local, nameBuf, data);

    // Entrée du central directory (46 octets + nom)
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);              // version made by
    cd.writeUInt16LE(20, 6);             // version needed
    cd.writeUInt16LE(0x0800, 8);         // flag UTF-8
    cd.writeUInt16LE(0, 10);            // méthode
    cd.writeUInt16LE(0, 12);           // heure
    cd.writeUInt16LE(0, 14);          // date
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(size, 20);
    cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);          // extra
    cd.writeUInt16LE(0, 32);         // comment
    cd.writeUInt16LE(0, 34);        // disk number
    cd.writeUInt16LE(0, 36);       // internal attrs
    cd.writeUInt32LE(0, 38);      // external attrs
    cd.writeUInt32LE(offset, 42); // offset de l'en-tête local
    central.push(Buffer.concat([cd, nameBuf]));

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                       // disk
  eocd.writeUInt16LE(0, 6);                      // disk with CD
  eocd.writeUInt16LE(entries.length, 8);         // entries on disk
  eocd.writeUInt16LE(entries.length, 10);        // total entries
  eocd.writeUInt32LE(centralBuf.length, 12);     // taille du central dir
  eocd.writeUInt32LE(offset, 16);                // offset du central dir
  eocd.writeUInt16LE(0, 20);                     // comment length

  return Buffer.concat([...chunks, centralBuf, eocd]);
}

function totalKm(posts) {
  return posts.reduce((s, p) => s + (parseFloat(p.km) || 0), 0);
}
function totalDPlus(posts) {
  return posts.reduce((s, p) => s + (parseInt(p.dplus) || 0), 0);
}

// Catégories et payeurs autorisés pour les dépenses
const EXPENSE_CATEGORIES = ['restaurant', 'hebergement', 'nourriture', 'divers'];
const EXPENSE_PAYERS     = ['julie', 'nico', 'commun'];
const EXPENSE_CAT_LABELS = { restaurant: '\ud83c\udf7d\ufe0f Restaurant', hebergement: '\ud83c\udfe8 H\u00e9bergement', nourriture: '\ud83d\uded2 Nourriture', divers: '\ud83e\uddf3 Divers' };
const EXPENSE_PAYER_LABELS = { julie: '\ud83d\udc69 Julie', nico: '\ud83e\uddd4 Nico', commun: '\ud83d\udc6b Commun' };

// Reconstruit le tableau de dépenses depuis le corps de formulaire
// Champs attendus : exp_cat[], exp_payer[], exp_amount[], exp_label[]
function parseExpenses(body) {
  const toArr = v => v === undefined ? [] : (Array.isArray(v) ? v : [v]);
  const cats    = toArr(body.exp_cat);
  const payers  = toArr(body.exp_payer);
  const amounts = toArr(body.exp_amount);
  const labels  = toArr(body.exp_label);
  const out = [];
  for (let i = 0; i < amounts.length; i++) {
    const amt = parseFloat(String(amounts[i]).replace(',', '.'));
    if (!amt || amt <= 0) continue;
    out.push({
      category: EXPENSE_CATEGORIES.includes(cats[i]) ? cats[i] : 'divers',
      payer:    EXPENSE_PAYERS.includes(payers[i]) ? payers[i] : 'commun',
      amount:   Math.round(amt * 100) / 100,
      label:    (labels[i] || '').toString().trim().substring(0, 80)
    });
  }
  return out;
}

// Somme totale des dépenses d'un post
function postExpenseTotal(p) {
  return (p.expenses || []).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
}

// Synthèse des dépenses regroupées par mois (YYYY-MM en Europe/Paris)
function expensesByMonth(posts) {
  const map = {};
  posts.forEach(p => {
    if (!p.expenses || !p.expenses.length) return;
    const d = new Date(p.date);
    const key = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).format(d); // YYYY-MM
    if (!map[key]) map[key] = { total: 0, byCat: {}, byPayer: {} };
    p.expenses.forEach(e => {
      const amt = parseFloat(e.amount) || 0;
      map[key].total += amt;
      map[key].byCat[e.category]   = (map[key].byCat[e.category]   || 0) + amt;
      map[key].byPayer[e.payer]    = (map[key].byPayer[e.payer]    || 0) + amt;
    });
  });
  return map;
}

function formatEuro(n) {
  return (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20ac';
}
function formatMonthLabel(key) { // 'YYYY-MM' -> 'septembre 2025'
  const [y, m] = key.split('-');
  const d = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, 1));
  return d.toLocaleDateString('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
}

// Convertit une valeur "datetime-local" (YYYY-MM-DDTHH:MM, saisie en heure de Paris)
// en ISO UTC correct. `new Date('YYYY-MM-DDTHH:MM')` interprète la chaîne comme UTC,
// d'où le décalage de 1 ou 2 h selon l'heure d'été/hiver de Paris.
function parisLocalToISO(local) {
  if (!local) return null;
  const m = String(local).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) {
    const d = new Date(local);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [, y, mo, da, h, mi] = m.map(Number);
  // On suppose d'abord que la saisie est en UTC, puis on calcule le décalage
  // réel de Paris à cet instant et on le retranche.
  const guessUTC = Date.UTC(y, mo - 1, da, h, mi);
  // Décalage de Paris (en minutes) à cet instant approximatif
  const offsetMin = parisOffsetMinutes(new Date(guessUTC));
  return new Date(guessUTC - offsetMin * 60000).toISOString();
}

// Décalage UTC de l'Europe/Paris (en minutes) pour une date donnée (+60 ou +120)
function parisOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date);
  const p = {};
  parts.forEach(x => { p[x.type] = x.value; });
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

// Calcule les statistiques de roulage.
// On exclut le départ et les jours sans kilométrage :
// seuls les jours avec km > 0 comptent comme "jours roulés".
function computeStats(posts) {
  const etapes = posts.filter(p => p.type !== 'preparation');
  // jours réellement roulés (km > 0) — exclut le départ « jour 0 » et les jours de repos/sans distance
  const ridingDays = etapes
    .filter(p => (parseFloat(p.km) || 0) > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const km    = ridingDays.reduce((s, p) => s + (parseFloat(p.km) || 0), 0);
  const dplus = ridingDays.reduce((s, p) => s + (parseInt(p.dplus) || 0), 0);
  const nDays = ridingDays.length;

  const kmValues = ridingDays.map(p => parseFloat(p.km) || 0);
  const maxKm    = kmValues.length ? Math.max(...kmValues) : 0;
  const minKm    = kmValues.length ? Math.min(...kmValues) : 0;
  const maxKmDay = ridingDays.find(p => (parseFloat(p.km) || 0) === maxKm) || null;

  const dplusValues = ridingDays.map(p => parseInt(p.dplus) || 0);
  const maxDplus    = dplusValues.length ? Math.max(...dplusValues) : 0;
  const maxDplusDay = ridingDays.find(p => (parseInt(p.dplus) || 0) === maxDplus) || null;

  // durée calendaire (du 1er au dernier jour roulé, bornes incluses)
  let spanDays = nDays;
  let restDays = 0;
  if (nDays >= 2) {
    const first = new Date(ridingDays[0].date);
    const last  = new Date(ridingDays[nDays - 1].date);
    const dayMs = 24 * 60 * 60 * 1000;
    const d0 = Date.UTC(first.getFullYear(), first.getMonth(), first.getDate());
    const d1 = Date.UTC(last.getFullYear(),  last.getMonth(),  last.getDate());
    spanDays = Math.round((d1 - d0) / dayMs) + 1;
    restDays = Math.max(0, spanDays - nDays);
  }

  return {
    nDays,
    spanDays,
    restDays,
    km,
    dplus,
    avgKm:    nDays ? km / nDays : 0,
    avgDplus: nDays ? dplus / nDays : 0,
    maxKm,
    minKm,
    maxKmDay,
    maxDplus,
    maxDplusDay,
    nExcluded: etapes.length - nDays, // étapes ignorées (départ, repos, km nuls)
  };
}

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

// ── Debug log ─────────────────────────────────────────────
const LOG_FILE = path.join(__dirname, 'application.log');
function logDebug(msg) {
  const line = new Date().toISOString() + ' ' + msg + '\n';
  fs.appendFileSync(LOG_FILE, line);
}
const _origLog   = console.log.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);
console.log   = (...a) => { _origLog(...a);   logDebug('[LOG]   ' + a.join(' ')); };
console.warn  = (...a) => { _origWarn(...a);  logDebug('[WARN]  ' + a.join(' ')); };
console.error = (...a) => { _origError(...a); logDebug('[ERROR] ' + a.join(' ')); };
process.on('uncaughtException',  e => logDebug('[UNCAUGHT] ' + e.stack || e.message));
process.on('unhandledRejection', e => logDebug('[UNHANDLED] ' + (e?.stack || e)));

// ── Helmet ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "unpkg.com"],
      styleSrc:   ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "unpkg.com"],
      fontSrc:    ["'self'", "fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "*.tile.openstreetmap.org", "nominatim.openstreetmap.org"],
      connectSrc: ["'self'", "nominatim.openstreetmap.org", "unpkg.com"],
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
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = file.mimetype.startsWith('image/')
      || file.mimetype.startsWith('video/')
      || file.originalname.toLowerCase().endsWith('.gpx');
    if (ok) cb(null, true);
    else cb(new Error('Images, vidéos et GPX seulement'));
  }
});

// Parse un fichier GPX côté serveur : distance (km), dénivelé positif (D+), dernier point
// ── Service d'élévation (Open-Meteo) ──────────────────
// Récupère l'altitude d'une liste de points {lat, lon} via l'API publique
// Open-Meteo, par lots de 100 points. Renvoie un tableau d'altitudes
// (mètres) dans le même ordre, ou null en cas d'échec total.
const ELEVATION_API = 'https://api.open-meteo.com/v1/elevation';

async function fetchElevations(points) {
  if (!points || !points.length) return null;
  if (typeof fetch !== 'function') {
    console.warn('[elevation] fetch indisponible (Node < 18) — D+ non calculable via API');
    return null;
  }
  const BATCH = 100; // Open-Meteo : max 100 coordonnées par requête
  const out = [];
  for (let i = 0; i < points.length; i += BATCH) {
    const slice = points.slice(i, i + BATCH);
    const lats = slice.map(p => p.lat.toFixed(6)).join(',');
    const lons = slice.map(p => p.lon.toFixed(6)).join(',');
    const url  = ELEVATION_API + '?latitude=' + lats + '&longitude=' + lons;
    try {
      const ctrl = new AbortController();
      const to   = setTimeout(() => ctrl.abort(), 15000);
      const resp = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl.signal });
      clearTimeout(to);
      if (!resp.ok) { console.warn('[elevation] HTTP ' + resp.status); return null; }
      const data = await resp.json();
      if (!data || !Array.isArray(data.elevation)) { console.warn('[elevation] réponse inattendue'); return null; }
      for (const e of data.elevation) out.push(e);
    } catch(e) {
      console.warn('[elevation] échec lot ' + (i / BATCH) + ' : ' + (e.message || e));
      return null;
    }
  }
  return out.length === points.length ? out : null;
}

// Calcule le D+ cumulé à partir d'une liste d'altitudes (avec petit seuil
// anti-bruit de 1 m pour éviter de gonfler le dénivelé sur données lissées).
function cumulativeDplus(eles, threshold = 1) {
  let dplus = 0;
  for (let i = 1; i < eles.length; i++) {
    const a = eles[i], b = eles[i-1];
    if (!isNaN(a) && !isNaN(b) && a - b > threshold) dplus += a - b;
  }
  return Math.round(dplus);
}

// ── Parsing GPX côté serveur ──────────────────────────────
// Async : si le GPX ne contient pas de balises <ele> et useElevationApi=true,
// interroge Open-Meteo pour obtenir le D+. Renvoie aussi dplusSource :
//  'gpx'  → altitude présente dans le fichier
//  'api'  → altitude récupérée via Open-Meteo
//  'none' → aucune altitude disponible (dplus = 0)
async function parseGpxStats(gpxAbsPath, useElevationApi = false) {
  try {
    const txt = fs.readFileSync(gpxAbsPath, 'utf8');
    const pts = [...txt.matchAll(/<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g)]
      .map(m => ({ lat: parseFloat(m[1]), lon: parseFloat(m[2]) }))
      .filter(p => !isNaN(p.lat) && !isNaN(p.lon));
    if (pts.length < 1) return null;

    // élévations présentes dans le fichier (dans l'ordre, peuvent être absentes)
    const eles = [...txt.matchAll(/<ele>([^<]+)<\/ele>/g)].map(m => parseFloat(m[1]));

    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      const R = 6371000;
      const dLat = (pts[i].lat - pts[i-1].lat) * Math.PI / 180;
      const dLon = (pts[i].lon - pts[i-1].lon) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2
        + Math.cos(pts[i-1].lat*Math.PI/180) * Math.cos(pts[i].lat*Math.PI/180) * Math.sin(dLon/2)**2;
      dist += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    let dplus = 0;
    let dplusSource = 'none';

    if (eles.length >= 2 && eles.filter(v => !isNaN(v)).length >= 2) {
      // Cas normal : altitude dans le GPX
      dplus = cumulativeDplus(eles, 0);
      dplusSource = 'gpx';
    } else if (useElevationApi && pts.length >= 2) {
      // Fallback : pas d'altitude dans le fichier → on interroge Open-Meteo.
      // Sous-échantillonnage à ~200 points max pour limiter le nb de requêtes
      // et le bruit (l'API renvoie des altitudes lissées au pas du MNT).
      const MAX = 200;
      const sample = pts.length > MAX
        ? pts.filter((_, i) => i % Math.ceil(pts.length / MAX) === 0)
        : pts.slice();
      if (sample[sample.length - 1] !== pts[pts.length - 1]) sample.push(pts[pts.length - 1]);
      const apiEles = await fetchElevations(sample);
      if (apiEles) {
        dplus = cumulativeDplus(apiEles, 1);
        dplusSource = 'api';
      }
    }

    const last = pts[pts.length - 1];
    return {
      km: Math.round((dist / 1000) * 10) / 10,
      dplus,
      dplusSource,
      lat: last.lat,
      lon: last.lon,
    };
  } catch(e) { return null; }
}

// Type de média d'une URL d'upload
function isVideoUrl(u) {
  return /\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(u || '');
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
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  return req.session.csrf;
}
function requireCsrf(req, res, next) {
  const token = req.body._csrf || req.query._csrf || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrf) return res.status(403).send('Token CSRF invalide ou manquant.');
  next();
}

// ── Auth middleware ───────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.auth || req.session.margot) return next();
  res.redirect('/login');
}
function requireAdmin(req, res, next) {
  if (req.session.auth) return next();
  res.redirect('/login');
}
function requireFamily(req, res, next) {
  if (req.session.auth || req.session.family || req.session.margot) return next();
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}
function filterPostsByRole(posts, req) {
  if (req.session.auth || req.session.margot) return posts;
  return posts.filter(p => !p.visibility || p.visibility === 'all');
}

// ── Routes ────────────────────────────────────────────────
app.get('/', requireFamily, (req, res) => {
  const posts = filterPostsByRole(
    readPosts().filter(p => p.type !== 'preparation').sort((a, b) => new Date(b.date) - new Date(a.date)),
    req
  );
  const token = csrfToken(req);
  req.session.save(() => res.send(renderPublic(posts, !!req.session.auth || !!req.session.margot, token, !!req.session.auth)));
});

// Pagination du feed (lazy-load) : renvoie les cartes HTML à partir d'un offset
app.get('/api/posts', requireFamily, (req, res) => {
  const PAGE = 5;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const posts = filterPostsByRole(
    readPosts().filter(p => p.type !== 'preparation').sort((a, b) => new Date(b.date) - new Date(a.date)),
    req
  );
  const isAdmin = !!req.session.auth || !!req.session.margot;
  const isStrictAdmin = !!req.session.auth;
  const token   = csrfToken(req);
  const slice   = posts.slice(offset, offset + PAGE);
  const html    = slice.map(p => renderCard(p, isAdmin, token, isStrictAdmin)).join('');
  req.session.save(() => res.json({
    html,
    count:   slice.length,
    hasMore: offset + PAGE < posts.length
  }));
});

app.get('/timeline', requireFamily, (req, res) => {
  const posts = filterPostsByRole(readPosts().filter(p => p.type !== 'preparation').sort((a, b) => new Date(a.date) - new Date(b.date)), req);
  res.send(renderTimeline(posts, !!req.session.auth || !!req.session.margot, !!req.session.auth));
});

app.get('/map', requireFamily, (req, res) => {
  const posts = filterPostsByRole(readPosts().filter(p => p.type !== 'preparation').sort((a, b) => new Date(a.date) - new Date(b.date)), req);
  res.send(renderMap(posts, !!req.session.auth || !!req.session.margot, !!req.session.auth));
});

app.get('/stats', requireAdmin, (req, res) => {
  const allPosts = readPosts();
  const posts = allPosts.filter(p => p.type !== 'preparation');
  res.send(renderStats(posts, true, allPosts));
});

app.get('/preparation', requireFamily, (req, res) => {
  const posts = filterPostsByRole(
    readPosts().filter(p => p.type === 'preparation').sort((a, b) => new Date(b.date) - new Date(a.date)),
    req
  );
  const token = csrfToken(req);
  req.session.save(() => res.send(renderPreparation(posts, !!req.session.auth || !!req.session.margot, token, !!req.session.auth)));
});

app.get('/rss', requireFamily, (req, res) => {
  const posts = filterPostsByRole(readPosts().sort((a, b) => new Date(b.date) - new Date(a.date)), req);
  res.type('application/rss+xml');
  res.send(renderRSS(posts));
});

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

// ── Répondre à un commentaire ─────────────────────────────
app.post('/comment/:postId/reply/:commentId', requireFamily, requireCsrf, (req, res) => {
  const posts = readPosts();
  const post  = posts.find(p => p.id === req.params.postId);
  if (!post) return res.status(404).send('Étape introuvable');
  const parent = (post.comments || []).find(c => c.id === req.params.commentId);
  if (!parent) return res.status(404).send('Commentaire introuvable');
  const { author, text } = req.body;
  if (!author?.trim() || !text?.trim()) return res.redirect('/#post-' + req.params.postId);
  if (!parent.replies) parent.replies = [];
  parent.replies.push({
    id:     crypto.randomBytes(6).toString('hex'),
    author: author.trim().substring(0, 40),
    text:   text.trim().substring(0, 300),
    date:   new Date().toISOString()
  });
  writePosts(posts);
  res.redirect('/#post-' + req.params.postId);
});

// ── Admin : supprimer un commentaire ──────────────────────
app.post('/comment/:postId/delete/:commentId', requireAuth, requireCsrf, (req, res) => {
  const posts = readPosts();
  const post  = posts.find(p => p.id === req.params.postId);
  if (!post) return res.status(404).send('\u00c9tape introuvable');
  // Supprime soit un commentaire racine, soit une réponse imbriquée
  post.comments = (post.comments || []).filter(c => c.id !== req.params.commentId);
  post.comments.forEach(c => {
    if (c.replies) c.replies = c.replies.filter(r => r.id !== req.params.commentId);
  });
  writePosts(posts);
  res.redirect('/#post-' + req.params.postId);
});

app.get('/login', (req, res) => {
  if (req.session.auth || req.session.family || req.session.margot) return res.redirect('/');
  res.send(renderLogin(false, req.query.next || '/'));
});

app.post('/login', loginLimiter, (req, res) => {
  const next = req.body.next || '/';
  const pw   = req.body.password;
  if (pw === ADMIN_PASSWORD) { req.session.auth = true; return res.redirect(next !== '/' ? next : '/'); }
  if (MARGOT_PASSWORD && pw === MARGOT_PASSWORD) { req.session.margot = true; return res.redirect(next); }
  if (pw === FAMILY_PASSWORD) { req.session.family = true; return res.redirect(next); }
  res.send(renderLogin(true, next));
});

app.get('/family-login', (req, res) => res.redirect('/login' + (req.query.next ? '?next=' + encodeURIComponent(req.query.next) : '')));

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.get('/post', requireAuth, (req, res) => {
  const posts = readPosts().sort((a, b) => new Date(b.date) - new Date(a.date));
  const lastLocation = posts.length > 0 ? (posts[0].location || '') : '';
  const token = csrfToken(req);
  req.session.save(() => res.send(renderPostForm(null, lastLocation, !!req.session.margot, token, req.query.type || '')));
});

app.post('/post', requireAuth, requireCsrf, upload.fields([{name:'photos', maxCount:10},{name:'gpx', maxCount:1}]), async (req, res) => {
  const { title, body, location, lat, lon, km, dplus, author, visibility, postDate, type, privateNote } = req.body;
  if (!title?.trim() || !body?.trim()) {
    return res.send(renderPostForm('Titre et texte obligatoires.', '', !!req.session.margot, csrfToken(req)));
  }
  await resizeUploadedImages(req.files?.photos || []);
  const photos  = (req.files?.photos || []).map(f => '/uploads/' + f.filename);
  const gpxFile = req.files?.gpx?.[0] ? '/uploads/' + req.files.gpx[0].filename : null;

  let finalDate = new Date().toISOString();
  if (postDate) { const parsed = parisLocalToISO(postDate); if (parsed) finalDate = parsed; }

  let finalLat = parseFloat(lat) || null;
  let finalLon = parseFloat(lon) || null;
  let finalKm  = parseFloat(km) || 0;
  let finalDp  = parseInt(dplus) || 0;
  if (gpxFile) {
    const stats = await parseGpxStats(path.join(__dirname, 'public', gpxFile), true);
    if (stats) {
      finalLat = stats.lat;
      finalLon = stats.lon;
      if (!finalKm) finalKm = stats.km;
      if (!finalDp) finalDp = stats.dplus;
    }
  }

  const expenses = parseExpenses(req.body);
  const captions = (req.files?.photos || []).map((_, i) => (req.body['caption_new_' + i] || '').toString().trim().substring(0, 200));

  const posts    = readPosts();
  const validViz = ['all', 'margot', 'admin'];
  const forcedViz = req.session.margot ? 'margot' : (validViz.includes(visibility) ? visibility : 'all');
  posts.push({
    id:         crypto.randomBytes(8).toString('hex'),
    date:       finalDate,
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
    gpx:        gpxFile,
    expenses,
    privateNote: (privateNote || '').toString().trim().substring(0, 2000),
    comments:   []
  });
  writePosts(posts);
  res.redirect(type === 'preparation' ? '/preparation' : '/');
});

app.post('/delete/:id', requireAuth, requireCsrf, (req, res) => {
  const posts = readPosts();
  const post  = posts.find(p => p.id === req.params.id);
  if (post) deletePostFiles(post);
  writePosts(posts.filter(p => p.id !== req.params.id));
  res.redirect('/');
});

app.get('/edit/:id', requireAuth, (req, res) => {
  const posts = readPosts();
  const post  = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).send('Étape introuvable');
  const token = csrfToken(req);
  req.session.save(() => res.send(renderEditForm(post, null, !!req.session.margot, token)));
});

app.post('/edit/:id', requireAuth, requireCsrf, upload.fields([{name:'photos', maxCount:10},{name:'gpx', maxCount:1}]), async (req, res) => {
  const posts = readPosts();
  const idx   = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).send('Étape introuvable');
  const { title, body, location, lat, lon, km, dplus, visibility, postDate, privateNote } = req.body;
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
  let finalKm  = parseFloat(km) || 0;
  let finalDp  = parseInt(dplus) || 0;
  // Si un NOUVEAU GPX est fourni, on relit toutes ses stats côté serveur (fiable)
  if (req.files?.gpx?.[0] && gpxFile) {
    const stats = await parseGpxStats(path.join(__dirname, 'public', gpxFile), true);
    if (stats) {
      finalLat = stats.lat;
      finalLon = stats.lon;
      finalKm  = stats.km;
      finalDp  = stats.dplus;
    }
  }

  const validViz = ['all', 'margot', 'admin'];
  posts[idx] = {
    ...existing,
    date:       finalDate,
    title:      title.trim(),
    body:       sanitizeHtml(body),
    location:   location?.trim() || '',
    lat:        finalLat,
    lon:        finalLon,
    km:         finalKm,
    dplus:      finalDp,
    visibility: validViz.includes(visibility) ? visibility : (existing.visibility || 'all'),
    photos,
    captions,
    gpx:        gpxFile,
    expenses:    parseExpenses(req.body),
    privateNote: (privateNote || '').toString().trim().substring(0, 2000),
  };
  writePosts(posts);
  res.redirect('/#post-' + req.params.id);
});

// ── Admin : recalculer le D+ d'une étape via l'API d'élévation ──
// Pour les GPX sans balises <ele> : relit la trace et interroge Open-Meteo.
app.post('/recalc-elevation/:id', requireAuth, requireCsrf, async (req, res) => {
  const posts = readPosts();
  const idx   = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).send('Étape introuvable');
  const post = posts[idx];
  if (!post.gpx) return res.status(400).send("Cette étape n'a pas de trace GPX.");

  const stats = await parseGpxStats(path.join(__dirname, 'public', post.gpx), true);
  if (!stats) return res.status(502).send('Impossible de lire la trace GPX.');

  if (stats.dplusSource === 'none') {
    return res.status(502).send("Le service d'élévation n'a pas répondu. Réessayez dans un instant.");
  }

  posts[idx] = { ...post, dplus: stats.dplus, km: post.km || stats.km };
  writePosts(posts);
  res.redirect('/edit/' + req.params.id);
});

app.get('/backup', requireAuth, (req, res) => {
  if (!fs.existsSync(DATA)) return res.status(404).send('Aucune donnée à sauvegarder.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  res.setHeader('Content-Disposition', `attachment; filename="velo-backup-${stamp}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(fs.readFileSync(DATA, 'utf8'));
});

// ── Sauvegarde complète : ZIP avec posts.json + tous les médias ──
app.get('/backup-full', requireAuth, (req, res) => {
  if (!fs.existsSync(DATA)) return res.status(404).send('Aucune donnée à sauvegarder.');
  try {
    const entries = [];
    // 1. Les données
    entries.push({ name: 'posts.json', data: fs.readFileSync(DATA) });
    // 2. Tous les médias présents dans public/uploads
    const upDir = path.join(__dirname, 'public', 'uploads');
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

app.get('/settings', requireAuth, (req, res) => {
  const token = csrfToken(req);
  req.session.save(() => res.send(renderSettings(token, req.query.restored === '1')));
});

app.post('/restore', requireAuth, requireCsrf, upload.single('backup'), (req, res) => {
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
//  Header
// ══════════════════════════════════════════════════════════

const LOGO_SVG = `<img src="/public/logo_nijumatim.png" class="header-logo" alt="${TRIP_TITLE || 'Nijumatim'}">`;

function renderHeader({ activePage = '', isAdmin = false, isStrictAdmin = false, showMap = false } = {}) {
  const links = [
    { href: '/',           label: 'Journal',       key: 'journal',     icon: '📖' },
    { href: '/timeline',   label: 'Timeline',      key: 'timeline',    icon: '📅' },
    { href: '/map',        label: 'Carte',         key: 'map',         icon: '🗺️' },
    ...(isStrictAdmin ? [{ href: '/stats', label: 'Statistiques', key: 'stats', icon: '📊' }] : []),
    { href: '/preparation',label: 'Préparation',   key: 'preparation', icon: '🛠️' },
    ...(isAdmin ? [{ href: '/settings', label: 'Paramètres', key: 'settings', icon: '⚙️' }] : []),
    { href: '/logout',     label: 'Déconnexion',   key: 'logout',      icon: '🔓' },
  ];

  function makeLink(l) {
    const cls = activePage === l.key ? ' class="active"' : '';
    return `<a href="${l.href}"${cls}>${l.icon} ${l.label}</a>`;
  }

  const sub = TRIP_START && TRIP_END
    ? `<span class="header-sub">${TRIP_START} → ${TRIP_END}</span>`
    : TRIP_START ? `<span class="header-sub">Depuis ${TRIP_START}</span>` : '';

  return `
    <div class="header">
      <div class="header-bike-bg"></div>
      <div class="header-inner">
        <div class="header-title-block">
          <a href="/">${LOGO_SVG}</a>
          ${sub}
        </div>
        <nav class="header-nav">${links.map(makeLink).join('')}</nav>
        <button class="hamburger" id="hamburger" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      </div>
      <nav class="mobile-menu" id="mobileMenu">${links.map(makeLink).join('')}</nav>
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
  body{font-family:'DM Sans',sans-serif;background:var(--warm-white);color:var(--ink);font-size:16px;line-height:1.6;}
  a{color:inherit;text-decoration:none}

  /* ── HEADER ─────────────────────────────────────── */
  .header{background:#ffffff;border-bottom:2px solid var(--sand);color:var(--ink);padding:0;position:sticky;top:0;z-index:10;overflow:visible;box-shadow:0 2px 12px rgba(42,122,122,0.10);}
  .header-bike-bg{position:absolute;inset:0;opacity:0.04;background-image:url("/public/bg.png");background-size:540px auto;background-repeat:repeat-x;background-position:center bottom;}
  .header-inner{position:relative;display:flex;align-items:center;gap:12px;padding:14px 20px;}
  .header-title-block{flex:1}
  .header-logo{display:block;height:52px;width:auto;max-width:240px;}
  .header-sub{font-size:11px;color:var(--teal);font-weight:500;letter-spacing:0.08em;text-transform:uppercase;margin-top:2px;display:block;}
  .header-nav{display:flex;align-items:center;gap:4px;flex-shrink:0;}
  .header-nav a{color:var(--ink-mid);font-size:12px;font-weight:600;padding:6px 12px;border-radius:20px;border:1.5px solid var(--sand);background:var(--mist);transition:all .2s;white-space:nowrap;}

  /* ── HAMBURGER ───────────────────────────────────── */
  .hamburger{display:none;flex-direction:column;justify-content:center;align-items:center;gap:5px;width:40px;height:40px;border-radius:10px;border:1.5px solid var(--sand);background:var(--mist);cursor:pointer;flex-shrink:0;}
  .hamburger span{display:block;width:18px;height:2px;background:var(--ocean);border-radius:2px;transition:all .25s;}
  .hamburger.open span:nth-child(1){transform:translateY(7px) rotate(45deg)}
  .hamburger.open span:nth-child(2){opacity:0;transform:scaleX(0)}
  .hamburger.open span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
  .mobile-menu{display:none;position:absolute;top:100%;right:0;left:0;background:#ffffff;border-top:1px solid var(--sand);border-bottom:2px solid var(--teal-light);z-index:200;flex-direction:column;padding:10px 14px 14px;gap:5px;box-shadow:0 8px 24px rgba(42,122,122,0.12);}
  .mobile-menu.open{display:flex}
  .mobile-menu a{color:var(--ink-mid);font-size:14px;font-weight:500;padding:10px 14px;border-radius:10px;border:1px solid var(--sand);background:var(--mist);display:flex;align-items:center;gap:8px;transition:background .15s;text-decoration:none;}
  .mobile-menu a:hover{background:var(--sage);border-color:var(--teal-light)}
  .mobile-menu a.active{background:var(--sage);border-color:var(--teal);color:var(--ocean)}

  @media(max-width:600px){
    .header-nav{display:none}
    .hamburger{display:flex}
  }
  @media(min-width:601px){
    .mobile-menu{display:none!important}
    .hamburger{display:none}
    .header-nav a:hover{background:var(--sage);color:var(--ocean);border-color:var(--teal-light);}
    .header-nav a.active{background:var(--sage);color:var(--ocean);border-color:var(--teal);}
    .header-logo{height:40px;}
  }

  /* ── STATS BAR ───────────────────────────────────── */
  .stats-bar{background:var(--ocean);border-bottom:1px solid rgba(255,255,255,0.08);padding:12px 20px;display:flex;gap:0;}
  .stat{text-align:center;flex:1;position:relative;}
  .stat:not(:last-child)::after{content:'';position:absolute;right:0;top:20%;height:60%;width:1px;background:rgba(255,255,255,0.12);}
  .stat-num{font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:#fff;line-height:1;}
  .stat-lbl{font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.1em;margin-top:3px;}

  /* ── STATS PAGE ──────────────────────────────────── */
  .stats-wrap{max-width:760px;margin:0 auto;padding:24px 14px 80px;}
  .stats-hero{text-align:center;margin-bottom:8px;}
  .stats-hero h1{font-family:'Playfair Display',serif;font-size:26px;color:var(--ocean);font-weight:700;}
  .stats-hero p{font-size:13px;color:var(--ink-light);margin-top:4px;}
  .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin:22px 0;}
  .stat-card{background:#fff;border:1px solid var(--sand);border-radius:16px;padding:18px 16px;text-align:center;box-shadow:0 2px 12px rgba(10,61,98,0.06);}
  .stat-card.feature{grid-column:1/-1;background:linear-gradient(135deg,var(--ocean),var(--emerald));border:none;color:#fff;}
  .stat-card .sc-icon{font-size:24px;line-height:1;}
  .stat-card .sc-num{font-family:'Playfair Display',serif;font-size:30px;font-weight:700;color:var(--ocean);line-height:1.1;margin-top:6px;}
  .stat-card.feature .sc-num{color:#fff;font-size:38px;}
  .stat-card .sc-lbl{font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--ink-light);margin-top:6px;font-weight:600;}
  .stat-card.feature .sc-lbl{color:rgba(255,255,255,0.85);}
  .stat-card .sc-sub{font-size:12px;color:var(--ink-light);margin-top:4px;}
  .stat-card.feature .sc-sub{color:rgba(255,255,255,0.9);}
  .stats-note{font-size:12px;color:var(--ink-light);text-align:center;line-height:1.6;background:var(--mist);border:1px solid var(--sand);border-radius:12px;padding:12px 16px;margin-top:8px;}
  .stats-section-title{font-family:'Playfair Display',serif;font-size:18px;color:var(--ink-mid);margin:28px 0 12px;font-weight:700;}
  .stats-bars{display:flex;flex-direction:column;gap:8px;}
  .sbar-row{display:flex;align-items:center;gap:10px;font-size:13px;}
  .sbar-date{width:64px;flex-shrink:0;color:var(--ink-light);font-size:11px;}
  .sbar-track{flex:1;background:var(--mist);border-radius:6px;height:18px;overflow:hidden;border:1px solid var(--sand);}
  .sbar-fill{height:100%;background:linear-gradient(90deg,var(--teal),var(--emerald-mid));border-radius:6px;}
  .sbar-val{width:58px;flex-shrink:0;text-align:right;font-weight:600;color:var(--ink-mid);font-size:12px;}
  .sbar-dplus{width:72px;flex-shrink:0;text-align:right;color:var(--ink-light);font-size:11px;}

  /* ── DÉPENSES (formulaire) ───────────────────────── */
  .exp-list{display:flex;flex-direction:column;gap:10px;margin-top:8px;}
  .exp-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:var(--mist);border:1.5px solid var(--sand);border-radius:12px;padding:10px;position:relative;}
  .exp-row select,.exp-row input{width:100%;border:1.5px solid var(--sand);border-radius:8px;padding:8px 10px;font-size:14px;font-family:inherit;background:#fff;color:var(--ink);}
  .exp-row .exp-label-field{grid-column:1/-1;}
  .exp-row .exp-amount-field{grid-column:1/-1;}
  .exp-row-del{position:absolute;top:-8px;right:-8px;width:24px;height:24px;border-radius:50%;border:none;background:#dc2626;color:#fff;font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.2);}
  .exp-add-btn{margin-top:10px;background:var(--mist);color:var(--ocean-mid);border:1.5px dashed var(--teal-light);border-radius:10px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;width:100%;transition:background .15s;}
  .exp-add-btn:hover{background:var(--sage);}
  .exp-total-hint{font-size:13px;color:var(--ink-mid);font-weight:600;margin-top:8px;text-align:right;}

  /* ── DÉPENSES (carte) ────────────────────────────── */
  .card-expenses{margin-top:14px;background:var(--mist);border:1px solid var(--sand);border-radius:12px;padding:12px 14px;}
  .card-exp-head{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:700;color:var(--ink-mid);margin-bottom:8px;}
  .card-exp-total{color:var(--accent);font-family:'Playfair Display',serif;font-size:16px;}
  .card-exp-item{display:flex;align-items:center;justify-content:space-between;font-size:13px;color:var(--ink-mid);padding:4px 0;border-top:1px dashed var(--sand);}
  .card-exp-item:first-of-type{border-top:none;}
  .card-exp-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
  .card-exp-cat{font-size:11px;background:var(--sage);color:var(--emerald);padding:2px 8px;border-radius:20px;font-weight:600;}
  .card-exp-payer{font-size:11px;background:var(--accent-light);color:var(--accent);padding:2px 8px;border-radius:20px;font-weight:600;}
  .card-exp-amt{font-weight:700;color:var(--ink);}

  /* ── LÉGENDES D'IMAGES ───────────────────────────── */
  .card-photos figure{flex:1;min-width:0;margin:0;display:flex;flex-direction:column;}
  .card-photos figure img{flex:1;}
  .card-photos figure figcaption{font-size:11px;color:#e8e8e8;background:#1a1a1a;padding:5px 8px;text-align:center;line-height:1.4;}
  .lb-caption{color:rgba(255,255,255,0.9);font-size:14px;margin-top:10px;text-align:center;max-width:90vw;padding:0 12px;}
  .caption-input{width:100%;border:1.5px solid var(--sand);border-radius:8px;padding:6px 10px;font-size:13px;font-family:inherit;margin-top:4px;background:#fff;}

  /* ── NOTE PRIVÉE (admin) ─────────────────────────── */
  .card-private{margin-top:14px;background:#fffbeb;border:1.5px solid #fde68a;border-radius:12px;padding:12px 14px;}
  .card-private-head{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#92400e;margin-bottom:6px;}
  .card-private-text{font-size:14px;color:#78350f;line-height:1.6;white-space:pre-wrap;}

  /* ── SUPPRESSION COMMENTAIRE ─────────────────────── */
  .comment-del{background:none;border:none;color:#dc2626;font-size:11px;cursor:pointer;padding:2px 6px;margin-left:6px;border-radius:6px;}
  .comment-del:hover{background:#fee2e2;}

  /* ── SYNTHÈSE DÉPENSES (stats) ───────────────────── */
  .exp-month-card{background:#fff;border:1px solid var(--sand);border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 2px 12px rgba(10,61,98,0.06);}
  .exp-month-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px;}
  .exp-month-name{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;color:var(--ink);text-transform:capitalize;}
  .exp-month-total{font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:var(--accent);}
  .exp-break-title{font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-light);font-weight:600;margin:10px 0 6px;}
  .exp-break-row{display:flex;align-items:center;gap:10px;font-size:13px;margin-bottom:6px;}
  .exp-break-lbl{width:130px;flex-shrink:0;color:var(--ink-mid);}
  .exp-break-track{flex:1;background:var(--mist);border-radius:6px;height:16px;overflow:hidden;border:1px solid var(--sand);}
  .exp-break-fill{height:100%;border-radius:6px;}
  .exp-break-val{width:78px;flex-shrink:0;text-align:right;font-weight:600;color:var(--ink-mid);font-size:12px;}
  .exp-grand-total{background:linear-gradient(135deg,var(--ocean),var(--emerald));color:#fff;border-radius:14px;padding:16px;text-align:center;margin-bottom:16px;}
  .exp-grand-total .egt-num{font-family:'Playfair Display',serif;font-size:32px;font-weight:700;}
  .exp-grand-total .egt-lbl{font-size:12px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.9;margin-top:4px;}

  /* ── FEED ────────────────────────────────────────── */
  .feed{max-width:620px;margin:0 auto;padding:20px 12px 80px;display:flex;flex-direction:column;gap:20px;}

  /* ── CARDS ───────────────────────────────────────── */
  .card{background:#fff;border-radius:18px;overflow:hidden;border:1px solid rgba(0,0,0,0.06);box-shadow:0 2px 12px rgba(10,61,98,0.07), 0 1px 3px rgba(0,0,0,0.04);transition:box-shadow .2s, transform .2s;}
  .card:hover{box-shadow:0 8px 28px rgba(10,61,98,0.12), 0 2px 6px rgba(0,0,0,0.06);transform:translateY(-1px);}
  .card-date-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px 0;gap:8px;}
  .card-date-block{display:flex;align-items:center;gap:10px;}
  .card-day-num{font-family:'Playfair Display',serif;font-size:36px;font-weight:700;color:var(--ocean-mid);line-height:1;min-width:42px;text-align:center;}
  .card-date-text{display:flex;flex-direction:column;gap:1px;}
  .card-weekday{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--teal);}
  .card-month-year{font-size:13px;font-weight:500;color:var(--ink-mid);}
  .card-time{font-size:11px;color:var(--ink-light);margin-top:2px;}
  .card-date-right{display:flex;flex-direction:column;align-items:flex-end;gap:5px;}

  /* ── CARD PHOTOS ─────────────────────────────────── */
  .card-photos{display:flex;gap:2px;background:#1a1a1a;max-height:280px;overflow:hidden;margin:12px 0 0;}
  .card-photos img{flex:1;min-width:0;height:240px;object-fit:cover;cursor:zoom-in;transition:transform .3s;}
  .card-photos.single img{height:280px;}
  .card-photos img:hover{transform:scale(1.02)}
  .card-videos{display:flex;flex-direction:column;gap:10px;margin:0 -18px 16px;background:#000;}
  .card-videos video{width:100%;max-height:480px;display:block;background:#000;}

  /* ── LIGHTBOX ────────────────────────────────────── */
  .lightbox{display:none;position:fixed;inset:0;background:rgba(5,15,30,0.95);z-index:1000;align-items:center;justify-content:center;flex-direction:column;backdrop-filter:blur(8px);}
  .lightbox.open{display:flex}
  .lightbox img{max-width:95vw;max-height:88vh;object-fit:contain;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,0.6);user-select:none;}
  .lb-close{position:fixed;top:16px;right:20px;color:#fff;font-size:28px;cursor:pointer;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;transition:background .15s;}
  .lb-close:hover{background:rgba(255,255,255,0.2)}
  .lb-nav{position:fixed;top:50%;transform:translateY(-50%);color:#fff;font-size:28px;cursor:pointer;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;opacity:.8;transition:all .15s;}
  .lb-nav:hover{opacity:1;background:rgba(255,255,255,0.2)}
  .lb-prev{left:12px}
  .lb-next{right:12px}
  .lb-counter{color:rgba(255,255,255,0.5);font-size:13px;margin-top:12px}

  /* ── CARD BODY ───────────────────────────────────── */
  .card-body{padding:14px 18px 18px}
  .card-divider{height:1px;background:linear-gradient(to right, var(--teal-light), transparent);margin:0 18px 14px;opacity:0.35;}
  .card-badges{display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap;}
  .card-loc{font-size:12px;background:var(--sage);color:var(--emerald);padding:4px 10px;border-radius:20px;display:inline-flex;align-items:center;gap:4px;font-weight:600;letter-spacing:0.01em;}
  .km-badge{font-size:12px;background:var(--accent-light);color:var(--accent);padding:4px 10px;border-radius:20px;font-weight:700;display:inline-flex;align-items:center;gap:3px;}
  .dplus-badge{font-size:12px;background:var(--mist);color:var(--ocean-mid);padding:4px 10px;border-radius:20px;font-weight:600;display:inline-flex;align-items:center;gap:3px;}
  .dplus-clickable{cursor:pointer;border:1.5px solid var(--teal-light);font-family:inherit;transition:background .15s,transform .15s;}
  .dplus-clickable:hover{background:var(--sage);transform:translateY(-1px);}
  .dplus-clickable:active{transform:translateY(0);}
  /* Modale profil de dénivelé */
  .elev-modal{display:none;position:fixed;inset:0;background:rgba(5,15,30,0.85);z-index:1100;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:16px;}
  .elev-modal.open{display:flex;}
  .elev-box{background:#fff;border-radius:16px;max-width:640px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.4);overflow:hidden;}
  .elev-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--sand);background:linear-gradient(135deg,var(--ocean-mid),var(--teal));}
  .elev-head h3{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;color:#fff;margin:0;}
  .elev-close{background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.3);color:#fff;font-size:20px;width:34px;height:34px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;}
  .elev-close:hover{background:rgba(255,255,255,0.32);}
  .elev-body{padding:18px 20px 20px;}
  .elev-canvas-wrap{position:relative;width:100%;}
  .elev-canvas-wrap canvas{display:block;width:100%;height:260px;}
  .elev-stats{display:flex;gap:0;margin-top:16px;border-top:1px solid var(--sand);padding-top:14px;}
  .elev-stat{flex:1;text-align:center;position:relative;}
  .elev-stat:not(:last-child)::after{content:'';position:absolute;right:0;top:15%;height:70%;width:1px;background:var(--sand);}
  .elev-stat-num{font-family:'Playfair Display',serif;font-size:19px;font-weight:700;color:var(--ocean-mid);line-height:1;}
  .elev-stat-lbl{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--ink-light);margin-top:4px;}
  .elev-loading{text-align:center;padding:40px 0;color:var(--ink-light);font-size:14px;}
  .card-title{font-family:'Playfair Display',serif;font-size:20px;font-weight:700;margin-bottom:10px;line-height:1.3;color:var(--ink);}
  .card-text{font-size:14.5px;color:var(--ink-mid);line-height:1.75;}
  .card-text p{margin:0 0 10px}
  .card-text p:last-child{margin-bottom:0}
  .card-text h3{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;color:var(--ink);margin:14px 0 8px;line-height:1.3}
  .card-text ul,.card-text ol{margin:8px 0 12px;padding-left:22px}
  .card-text li{margin-bottom:4px}
  .card-text blockquote{margin:12px 0;padding:8px 14px;border-left:3px solid var(--teal-light);background:var(--mist);border-radius:0 8px 8px 0;color:var(--ink-mid);font-style:italic}
  .card-text a{color:var(--ocean);text-decoration:underline;text-underline-offset:2px;word-break:break-word}
  .card-text a:hover{color:var(--emerald)}

  /* ── GPX CANVAS MAP ──────────────────────────────── */
  .gpx-canvas-wrap{margin:14px -18px 0;background:#e8f0e0;border-top:1px solid var(--sand);border-bottom:1px solid var(--sand);position:relative;overflow:hidden;}
  .gpx-canvas-wrap canvas{display:block;width:100%;height:260px;pointer-events:none;touch-action:none;user-select:none;-webkit-user-select:none;}
  .gpx-canvas-footer{display:flex;align-items:center;justify-content:space-between;padding:6px 14px;background:rgba(255,255,255,0.88);border-top:1px solid var(--sand);backdrop-filter:blur(4px);}
  .gpx-map-lbl{font-size:11px;color:var(--ink-light);font-weight:500;}
  .gpx-link{display:inline-flex;align-items:center;gap:5px;font-size:12px;background:var(--accent-light);color:var(--accent);padding:4px 10px;border-radius:20px;border:1px solid rgba(230,126,34,0.2);font-weight:500;}

  /* ── COMMENTS ────────────────────────────────────── */
  .comments{border-top:1px solid var(--sand);padding:12px 18px;background:var(--warm-white);}
  .comment{display:flex;gap:10px;margin-bottom:10px}
  .comment-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg, var(--ocean-mid), var(--teal));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#fff;flex-shrink:0;}
  .comment-bubble{background:#fff;border-radius:12px;padding:8px 12px;flex:1;border:1px solid var(--sand);}
  .comment-author{font-size:12px;font-weight:600;color:var(--ink)}
  .comment-date{font-size:10px;color:var(--ink-light);margin-left:6px}
  .comment-text{font-size:13px;color:var(--ink-mid);margin-top:3px}
  .comment-form{display:flex;flex-direction:column;gap:8px;margin-top:10px;}
  .comment-form input,.comment-form textarea{border:1.5px solid var(--sand);border-radius:10px;padding:8px 12px;font-size:13px;font-family:inherit;background:#fff;width:100%;transition:border-color .15s;}
  .comment-form input:focus,.comment-form textarea:focus{outline:none;border-color:var(--teal-light);}
  .comment-form textarea{height:64px;resize:none}
  .comment-form button{background:linear-gradient(135deg, var(--ocean-mid), var(--teal));color:#fff;border:none;border-radius:10px;padding:9px;font-size:13px;font-weight:500;cursor:pointer;transition:opacity .15s;}
  .comment-form button:hover{opacity:.9}
  .comment-main{flex:1;display:flex;flex-direction:column}
  .comment-reply-btn{align-self:flex-start;margin-top:4px;background:none;border:none;color:var(--ocean-mid);font-size:11px;font-weight:600;cursor:pointer;padding:2px 4px;font-family:inherit;transition:color .15s}
  .comment-reply-btn:hover{color:var(--emerald);text-decoration:underline}
  .comment-nested{margin-top:8px;margin-left:6px;padding-left:12px;border-left:2px solid var(--sand);gap:8px}
  .comment-avatar-sm{width:24px;height:24px;font-size:10px}
  .comment-reply-form{margin-top:8px;margin-bottom:4px;padding:10px;background:var(--mist);border-radius:10px}

  /* ── ADMIN ───────────────────────────────────────── */
  .admin-actions{margin-top:12px;padding-top:10px;border-top:1px solid var(--sand);display:flex;gap:8px;}
  .btn-del{background:none;color:#dc3545;border:1.5px solid #fecaca;border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all .15s;}
  .btn-del:hover{background:#fee2e2;border-color:#dc3545}
  .btn-edit{background:none;color:var(--emerald);border:1.5px solid var(--emerald-light);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all .15s;text-decoration:none;}
  .btn-edit:hover{background:var(--sage);border-color:var(--emerald)}

  /* ── FAB ─────────────────────────────────────────── */
  .fab{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg, var(--ocean-mid), var(--emerald));color:#fff;font-size:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(10,61,98,0.4);text-decoration:none;z-index:100;border:none;cursor:pointer;transition:transform .2s, box-shadow .2s;}
  .fab:hover{transform:scale(1.08);box-shadow:0 8px 28px rgba(10,61,98,0.5)}
  .fab:active{transform:scale(.95)}

  /* ── FORMS ───────────────────────────────────────── */
  .form-wrap{max-width:520px;margin:0 auto;padding:20px 14px 60px}
  .form-card{background:#fff;border-radius:18px;padding:24px;border:1px solid var(--sand);box-shadow:0 4px 20px rgba(10,61,98,0.08);}
  .form-card h2{font-family:'Playfair Display',serif;font-size:20px;font-weight:700;margin-bottom:18px;color:var(--ink);}
  .field{margin-bottom:16px}
  .field label{display:block;font-size:12px;color:var(--ink-light);margin-bottom:5px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;}
  .field input,.field textarea,.field select{width:100%;border:1.5px solid var(--sand);border-radius:10px;padding:10px 14px;font-size:15px;font-family:inherit;background:var(--warm-white);color:var(--ink);transition:border-color .15s, box-shadow .15s;}
  .field input:focus,.field textarea:focus,.field select:focus{outline:none;border-color:var(--teal-light);box-shadow:0 0 0 3px rgba(23,162,184,0.12);background:#fff;}
  .field textarea{height:130px;resize:vertical}
  .field-row{display:flex;gap:12px}
  .field-row .field{flex:1}
  .btn-submit{width:100%;background:linear-gradient(135deg, var(--ocean-mid) 0%, var(--teal) 50%, var(--emerald) 100%);color:#fff;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:600;cursor:pointer;margin-top:8px;box-shadow:0 4px 14px rgba(10,61,98,0.3);transition:opacity .15s, transform .15s;font-family:inherit;}
  .btn-submit:hover{opacity:.92;transform:translateY(-1px)}
  .btn-submit:active{transform:translateY(0)}
  .gps-btn{background:var(--mist);color:var(--ocean-mid);border:1.5px solid var(--teal-light);border-radius:8px;padding:7px 12px;font-size:13px;cursor:pointer;margin-top:6px;font-family:inherit;font-weight:500;transition:background .15s;}
  .gps-btn:hover{background:#d0eaf5}
  .photo-preview{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  .photo-preview img,.photo-preview video{width:72px;height:72px;object-fit:cover;border-radius:8px;border:2px solid var(--sand)}
  .media-order-badge{position:absolute;top:4px;left:4px;z-index:2;background:var(--ocean);color:#fff;font-size:11px;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 5px;box-shadow:0 1px 4px rgba(0,0,0,.3)}
  .media-item{touch-action:none}
  .error-msg{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:13px;}

  /* ── ÉDITEUR RICHE ───────────────────────────────── */
  .rte-toolbar{display:flex;flex-wrap:wrap;gap:3px;padding:7px 8px;background:var(--mist);border:1.5px solid var(--sand);border-bottom:none;border-radius:10px 10px 0 0;position:sticky;top:0;z-index:3}
  .rte-btn{min-width:34px;height:32px;padding:0 8px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--ink-mid);font-size:14px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .12s,border-color .12s;font-family:inherit;line-height:1}
  .rte-btn:hover{background:#fff;border-color:var(--sand)}
  .rte-btn.active{background:var(--sage);border-color:var(--teal-light);color:var(--ocean)}
  .rte-btn:active{transform:scale(.94)}
  .rte-sep{width:1px;align-self:stretch;margin:3px 4px;background:var(--sand)}
  .rte-editor{min-height:280px;max-height:60vh;overflow-y:auto;border:1.5px solid var(--sand);border-radius:0 0 10px 10px;padding:14px 16px;font-size:15px;line-height:1.7;color:var(--ink);background:#fff;resize:vertical;transition:border-color .15s,box-shadow .15s}
  .rte-editor:focus{outline:none;border-color:var(--teal-light);box-shadow:0 0 0 3px rgba(23,162,184,0.12)}
  .rte-editor:empty:before{content:attr(data-placeholder);color:var(--ink-light);pointer-events:none}
  .rte-editor p{margin:0 0 10px}
  .rte-editor h3{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;margin:12px 0 6px}
  .rte-editor ul,.rte-editor ol{margin:8px 0 10px;padding-left:24px}
  .rte-editor blockquote{margin:10px 0;padding:6px 12px;border-left:3px solid var(--teal-light);background:var(--mist);font-style:italic}
  .rte-editor a{color:var(--ocean);text-decoration:underline}
  .rte-count{font-size:11px;color:var(--ink-light);text-align:right;margin-top:5px}
  .rte-count.over{color:#dc2626;font-weight:600}

  /* ── ONGLETS FORMULAIRE ──────────────────────────── */
  .tabs-nav{display:flex;gap:4px;margin-bottom:18px;background:var(--mist);padding:5px;border-radius:12px;border:1px solid var(--sand)}
  .tab-btn{flex:1;padding:9px 6px;border:none;background:transparent;color:var(--ink-light);font-size:13px;font-weight:600;cursor:pointer;border-radius:8px;transition:background .15s,color .15s;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap}
  .tab-btn:hover{color:var(--ink-mid)}
  .tab-btn.active{background:#fff;color:var(--ocean);box-shadow:0 1px 4px rgba(10,61,98,0.1)}
  .tab-btn .tab-label{}
  .tab-panel{display:none;animation:tabfade .2s ease}
  .tab-panel.active{display:block}
  @keyframes tabfade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  .tabs-footer{display:flex;gap:10px;margin-top:8px}
  .tab-prev,.tab-next{flex:1;padding:11px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;border:1.5px solid var(--sand);background:var(--mist);color:var(--ink-mid);transition:background .15s}
  .tab-prev:hover,.tab-next:hover{background:var(--sage)}
  .tab-prev[disabled]{opacity:.4;cursor:default}
  @media(max-width:480px){
    .tab-btn .tab-label{display:none}
    .tab-btn{font-size:18px;padding:10px 4px}
  }

  /* ── LOCATION AUTOCOMPLETE ───────────────────────── */
  .loc-wrap{position:relative}
  .loc-suggestions{position:absolute;top:100%;left:0;right:0;background:#fff;border:1.5px solid var(--teal-light);border-top:none;border-radius:0 0 10px 10px;z-index:500;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(42,122,122,0.15);display:none;}
  .loc-suggestions.open{display:block}
  .loc-suggestion-item{padding:10px 14px;font-size:13px;color:var(--ink);cursor:pointer;border-bottom:1px solid var(--sand);display:flex;flex-direction:column;gap:2px;transition:background .1s;}
  .loc-suggestion-item:last-child{border-bottom:none}
  .loc-suggestion-item:hover,.loc-suggestion-item.active{background:var(--sage)}
  .loc-suggestion-name{font-weight:600;color:var(--ink)}
  .loc-suggestion-detail{font-size:11px;color:var(--ink-light)}
  .loc-search-btn{background:var(--mist);color:var(--ocean-mid);border:1.5px solid var(--teal-light);border-radius:8px;padding:7px 12px;font-size:13px;cursor:pointer;margin-top:6px;margin-right:6px;font-family:inherit;font-weight:500;transition:background .15s;display:inline-flex;align-items:center;gap:5px;}
  .loc-search-btn:hover{background:var(--sage)}

  /* ── EMPTY STATE ─────────────────────────────────── */
  .empty{text-align:center;padding:60px 20px;color:var(--ink-light);}
  .empty-icon{font-size:48px;margin-bottom:12px}
  .empty h3{font-family:'Playfair Display',serif;font-size:20px;margin-bottom:8px;color:var(--ink-mid)}

  /* ── TIMELINE ────────────────────────────────────── */
  .timeline-wrap{max-width:600px;margin:0 auto;padding:24px 14px 80px}
  .timeline{position:relative;padding-left:40px}
  .timeline::before{content:'';position:absolute;left:14px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom, var(--ocean-mid), var(--teal), var(--emerald));border-radius:2px;}
  .timeline-item{position:relative;margin-bottom:20px;}
  .timeline-dot{position:absolute;left:-33px;top:14px;width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg, var(--ocean-mid), var(--teal));border:3px solid #fff;box-shadow:0 0 0 2px var(--teal-light);z-index:1;}
  .timeline-dot.first{background:linear-gradient(135deg, var(--accent), #f39c12);box-shadow:0 0 0 2px var(--accent-light);}
  .timeline-dot.last{background:linear-gradient(135deg, var(--emerald), var(--emerald-mid));box-shadow:0 0 0 2px var(--emerald-light);}
  .timeline-card{background:#fff;border-radius:14px;border:1px solid var(--sand);box-shadow:0 2px 10px rgba(10,61,98,0.06);overflow:hidden;text-decoration:none;display:block;transition:transform .15s, box-shadow .15s;}
  .timeline-card:hover{transform:translateX(4px);box-shadow:0 4px 18px rgba(10,61,98,0.12);}
  .timeline-card-inner{padding:14px 16px}
  .timeline-date{font-size:11px;color:var(--ink-light);font-weight:500;letter-spacing:0.03em;margin-bottom:4px;}
  .timeline-loc{font-family:'Playfair Display',serif;font-size:16px;font-weight:600;color:var(--ink);margin-bottom:3px;}
  .timeline-snippet{font-size:12px;color:var(--ink-light);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.5;margin-top:4px;}
  .timeline-meta{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;}
  .timeline-badge{font-size:10px;padding:2px 8px;border-radius:20px;font-weight:500;}
  .tl-km{background:var(--accent-light);color:var(--accent)}
  .tl-author{background:var(--mist);color:var(--ocean-mid)}
  .timeline-thumb,video.timeline-thumb{width:80px;height:70px;object-fit:cover;border-radius:8px;flex-shrink:0;}
  .timeline-card-inner-row{display:flex;gap:12px;align-items:flex-start;}

  /* ── LOGIN ───────────────────────────────────────── */
  .login-hero{background:linear-gradient(135deg, var(--ocean) 0%, var(--teal) 60%, var(--emerald) 100%);padding:40px 20px;text-align:center;position:relative;overflow:hidden;}
  .login-hero::before{content:'';position:absolute;inset:0;background-image:url("/public/bg.png");background-size:540px auto;background-repeat:repeat-x;background-position:center bottom;opacity:0.10;}
  .login-hero h2{font-family:'Playfair Display',serif;font-size:24px;color:#fff;font-weight:700;position:relative;margin-bottom:4px;}
  .login-hero p{font-size:13px;color:rgba(255,255,255,0.7);position:relative;}
  .prev-location-hint{background:var(--mist);border:1px solid rgba(23,162,184,0.2);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--ocean-mid);margin-bottom:14px;display:flex;align-items:center;gap:6px;}

  /* ── UPLOAD PROGRESS ─────────────────────────────── */
  .upload-overlay{
    display:none;
    position:fixed;inset:0;
    background:rgba(5,15,30,0.88);
    z-index:2000;
    align-items:center;justify-content:center;
    flex-direction:column;
    backdrop-filter:blur(6px);
    padding:24px;
  }
  .upload-overlay.open{display:flex}
  .upload-box{
    background:#fff;border-radius:18px;
    padding:28px 26px;max-width:340px;width:100%;
    box-shadow:0 20px 60px rgba(0,0,0,0.4);
    text-align:center;
  }
  .upload-box .up-emoji{font-size:40px;margin-bottom:10px}
  .upload-box h3{
    font-family:'Playfair Display',serif;
    font-size:18px;color:var(--ink);margin-bottom:6px;
  }
  .upload-box p{font-size:13px;color:var(--ink-light);margin-bottom:18px}
  .up-bar{
    height:12px;border-radius:8px;
    background:var(--sand);overflow:hidden;
  }
  .up-bar-fill{
    height:100%;width:0%;
    background:linear-gradient(135deg,var(--ocean-mid),var(--teal),var(--emerald));
    border-radius:8px;
    transition:width .2s ease;
  }
  .up-pct{
    font-size:13px;font-weight:600;color:var(--ocean-mid);
    margin-top:10px;
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
function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d);
  const p = {};
  parts.forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function nowDatetimeLocal() {
  return isoToDatetimeLocal(new Date().toISOString());
}
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Sanitization HTML de l'éditeur riche (allowlist) ──────
// Autorise un petit jeu de balises sûres et nettoie tout le reste.
// Aucune dépendance : parsing par regex sur une allowlist stricte.
const ALLOWED_TAGS = new Set(['b','strong','i','em','u','h3','ul','ol','li','blockquote','a','br','p','span']);

function sanitizeHtml(input) {
  let html = String(input ?? '');
  if (!html.trim()) return '';

  // 1. Neutralise les blocs entièrement interdits (script/style/iframe + contenu)
  html = html.replace(/<\s*(script|style|iframe|object|embed|svg|math)[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  // 2. Retire les balises orphelines de ces mêmes éléments
  html = html.replace(/<\s*\/?\s*(script|style|iframe|object|embed|svg|math)[^>]*>/gi, '');

  // 3. Parcours de chaque balise pour appliquer l'allowlist
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (full, slash, tagRaw, attrs) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';           // balise non autorisée → supprimée
    if (slash) return `</${tag}>`;                   // balise fermante : sans attributs

    // Seul <a> conserve un attribut href (http/https/mailto)
    if (tag === 'a') {
      const m = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs || '');
      const href = m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
      const safe = /^(https?:|mailto:)/i.test(href.trim());
      if (safe) {
        return `<a href="${esc(href.trim())}" target="_blank" rel="noopener noreferrer nofollow">`;
      }
      return '<a>';
    }
    // Toutes les autres balises autorisées : aucun attribut conservé
    return `<${tag}>`;
  });

  // 4. Filet de sécurité : neutralise tout reste de gestionnaire on… ou javascript:
  html = html.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/javascript:/gi, '');

  return html.trim();
}

// Convertit le HTML d'un post en texte brut (pour snippets / RSS)
function stripTags(input) {
  return String(input ?? '')
    .replace(/<\s*(br|\/p|\/li|\/h3|\/blockquote)\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Détecte si le corps est déjà du HTML riche (nouveau format)
function isRichHtml(body) {
  return /<(b|strong|i|em|u|h3|ul|ol|li|blockquote|a|br|p)\b[^>]*>/i.test(String(body ?? ''));
}

// Rend le corps d'un post : HTML assaini si riche, sinon texte brut → <br>
function renderBody(body) {
  const s = String(body ?? '');
  if (isRichHtml(s)) return sanitizeHtml(s);
  // Ancien format texte brut : on échappe et on convertit les sauts de ligne
  return esc(s).replace(/\r\n|\r|\n/g, '<br>');
}

// ── JS partagé pour formulaires ───────────────────────────
const FORM_SCRIPTS = `
<script>
function initLocAutocomplete(fieldId, latId, lonId, suggestId) {
  var field = document.getElementById(fieldId);
  var list  = document.getElementById(suggestId);
  var timer = null, items = [], sel = -1;
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
  function highlight() { Array.from(list.children).forEach(function(c,i){ c.classList.toggle('active', i===sel); }); }
  function pick(i) {
    var item = items[i];
    field.value = item.display;
    document.getElementById(latId).value = parseFloat(item.lat).toFixed(6);
    document.getElementById(lonId).value = parseFloat(item.lon).toFixed(6);
    list.classList.remove('open'); sel = -1;
  }
  function doSearch(q) {
    fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=6&addressdetails=1')
      .then(function(r){ return r.json(); })
      .then(function(data) {
        items = data.map(function(r) {
          var a = r.address || {};
          var name = a.city || a.town || a.village || a.hamlet || a.county || r.display_name.split(',')[0];
          var detail = [a.state, a.country].filter(Boolean).join(', ');
          return { display: name + (detail ? ', '+detail : ''), lat: r.lat, lon: r.lon };
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
      }).catch(function(){});
  }
}
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function getGPS(fieldId, latId, lonId) {
  if (!navigator.geolocation) return alert('Géolocalisation non disponible sur ce navigateur.');
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return alert('La géolocalisation nécessite HTTPS.');
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      document.getElementById(latId).value = pos.coords.latitude.toFixed(6);
      document.getElementById(lonId).value = pos.coords.longitude.toFixed(6);
      var field = document.getElementById(fieldId);
      if (!field.value) {
        fetch('https://nominatim.openstreetmap.org/reverse?lat=' + pos.coords.latitude + '&lon=' + pos.coords.longitude + '&format=json')
          .then(function(r){ return r.json(); })
          .then(function(d) { var a = d.address; field.value = [a.town||a.city||a.village, a.state].filter(Boolean).join(', '); })
          .catch(function(){});
      }
      alert('Position enregistrée : ' + pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4));
    },
    function(err) { var msgs = {1:'Permission refusée',2:'Position indisponible',3:'Délai dépassé'}; alert('Erreur GPS : ' + (msgs[err.code] || err.message)); },
    { timeout: 10000, maximumAge: 60000 }
  );
}
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
      var kmVal=(dist/1000).toFixed(1), dpVal=Math.round(dplus);
      document.querySelector('[name=km]').value=kmVal;
      document.querySelector('[name=dplus]').value=dpVal;
      document.getElementById(latId).value=lat.toFixed(6);
      document.getElementById(lonId).value=lon.toFixed(6);
      fetch('https://nominatim.openstreetmap.org/reverse?lat='+lat+'&lon='+lon+'&format=json')
        .then(function(r){return r.json();}).then(function(d){
          var a=d.address, field=document.getElementById(fieldId);
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
    var url = URL.createObjectURL(f);
    var el;
    if (f.type.indexOf('video/') === 0) {
      el = document.createElement('video'); el.src = url; el.muted = true; el.playsInline = true;
    } else {
      el = document.createElement('img'); el.src = url;
    }
    preview.appendChild(el);
  });
}

// ── Barre de progression d'envoi (post + édition) ──────────
function initUploadProgress(formId) {
  var form    = document.getElementById(formId);
  var overlay = document.getElementById('uploadOverlay');
  var fill    = document.getElementById('upBarFill');
  var pct     = document.getElementById('upPct');
  var msg     = document.getElementById('upMsg');
  if (!form || !overlay) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var fd  = new FormData(form);
    var xhr = new XMLHttpRequest();
    // L'action contient déjà ?_csrf=… donc requireCsrf passe via req.query
    xhr.open('POST', form.getAttribute('action'), true);

    overlay.classList.add('open');
    fill.style.width = '0%';
    pct.textContent  = '0 %';

    xhr.upload.addEventListener('progress', function(ev) {
      if (ev.lengthComputable) {
        var p = Math.round(ev.loaded / ev.total * 100);
        fill.style.width = p + '%';
        pct.textContent  = p + ' %';
        if (p >= 100 && msg) msg.textContent = 'Traitement des médias sur le serveur…';
      }
    });

    xhr.addEventListener('load', function() {
      if (xhr.status >= 200 && xhr.status < 400) {
        // Le serveur redirige (302 suivie auto) → on suit l'URL finale
        window.location.href = xhr.responseURL || '/';
      } else {
        // Erreur de validation : on réaffiche la page renvoyée
        overlay.classList.remove('open');
        document.open();
        document.write(xhr.responseText);
        document.close();
      }
    });

    xhr.addEventListener('error', function() {
      overlay.classList.remove('open');
      alert('Erreur reseau pendant l\\'envoi. Reessayez.');
    });

    xhr.send(fd);
  });
}

// ── Dépenses dynamiques ────────────────────────────────────
var EXP_CATS  = [['restaurant','\\ud83c\\udf7d\\ufe0f Restaurant'],['hebergement','\\ud83c\\udfe8 H\\u00e9bergement'],['nourriture','\\ud83d\\uded2 Nourriture'],['divers','\\ud83e\\uddf3 Divers']];
var EXP_PAYERS= [['julie','\\ud83d\\udc69 Julie'],['nico','\\ud83e\\uddd4 Nico'],['commun','\\ud83d\\udc6b Commun']];

function expRowHtml(cat, payer, amount, label) {
  function opts(list, sel) {
    return list.map(function(o){ return '<option value="'+o[0]+'"'+(o[0]===sel?' selected':'')+'>'+o[1]+'</option>'; }).join('');
  }
  return '<div class="exp-row">'
    + '<button type="button" class="exp-row-del" title="Supprimer cette d\\u00e9pense">\\u00d7</button>'
    + '<select name="exp_cat">'+opts(EXP_CATS, cat||'restaurant')+'</select>'
    + '<select name="exp_payer">'+opts(EXP_PAYERS, payer||'commun')+'</select>'
    + '<input class="exp-amount-field" name="exp_amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Montant en \\u20ac" value="'+(amount!=null?amount:'')+'">'
    + '<input class="exp-label-field" name="exp_label" type="text" maxlength="80" placeholder="D\\u00e9tail (optionnel) : ex. Pizzeria du port" value="'+(label?String(label).replace(/"/g,'&quot;'):'')+'">'
    + '</div>';
}

function initExpenses(listId, addBtnId, totalId, initial) {
  var list = document.getElementById(listId);
  var addBtn = document.getElementById(addBtnId);
  var totalEl = document.getElementById(totalId);
  if (!list || !addBtn) return;

  function recalcTotal() {
    if (!totalEl) return;
    var t = 0;
    list.querySelectorAll('input[name=exp_amount]').forEach(function(i){
      var v = parseFloat(String(i.value).replace(',','.')); if (v>0) t += v;
    });
    totalEl.textContent = t > 0 ? ('Total des d\\u00e9penses : ' + t.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' \\u20ac') : '';
  }

  function addRow(cat, payer, amount, label) {
    var tmp = document.createElement('div');
    tmp.innerHTML = expRowHtml(cat, payer, amount, label);
    var row = tmp.firstChild;
    list.appendChild(row);
    row.querySelector('.exp-row-del').addEventListener('click', function(){ row.remove(); recalcTotal(); });
    row.querySelector('input[name=exp_amount]').addEventListener('input', recalcTotal);
    recalcTotal();
  }

  addBtn.addEventListener('click', function(){ addRow(); });

  if (initial && initial.length) {
    initial.forEach(function(e){ addRow(e.category, e.payer, e.amount, e.label); });
  }
  recalcTotal();
}

// ── Légendes pour nouvelles photos ─────────────────────────
function renderNewCaptions(input, containerId) {
  var c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = '';
  Array.from(input.files).forEach(function(f, i){
    if (f.type.indexOf('image/') !== 0) return; // légendes pour images seulement
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:6px';
    var thumb = document.createElement('img');
    thumb.src = URL.createObjectURL(f);
    thumb.style.cssText = 'width:42px;height:42px;object-fit:cover;border-radius:6px;flex-shrink:0;border:1px solid var(--sand)';
    var inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'caption-input'; inp.name = 'caption_new_' + i;
    inp.maxLength = 200; inp.placeholder = 'L\\u00e9gende de la photo ' + (i+1) + ' (optionnel)';
    inp.style.marginTop = '0';
    wrap.appendChild(thumb); wrap.appendChild(inp);
    c.appendChild(wrap);
  });
}

// ── Éditeur de texte riche (contenteditable, 0 dépendance) ──
function initRichEditor(editorId, hiddenId, countId, maxLen) {
  var ed     = document.getElementById(editorId);
  var hidden = document.getElementById(hiddenId);
  if (!ed || !hidden) return;
  var max = maxLen || 4000;

  // Charge le contenu initial depuis le champ caché
  if (hidden.value && hidden.value.trim()) {
    ed.innerHTML = hidden.value;
  }

  function exec(cmd, val) {
    ed.focus();
    document.execCommand(cmd, false, val || null);
    sync();
    refreshState();
  }

  function sync() {
    var html = ed.innerHTML
      .replace(/<div>/gi, '<p>').replace(/<\\/div>/gi, '</p>')
      .replace(/<br><\\/p>/gi, '</p>')
      .trim();
    if (html === '<p></p>' || html === '<br>') html = '';
    hidden.value = html;
    if (countId) {
      var cnt  = document.getElementById(countId);
      var text = (ed.textContent || '').length;
      if (cnt) {
        cnt.textContent = text + ' / ' + max + ' caractères';
        cnt.classList.toggle('over', text > max);
      }
    }
  }

  // Met en surbrillance les boutons actifs (gras, italique…)
  function refreshState() {
    var bar = ed.previousElementSibling;
    if (!bar || !bar.classList.contains('rte-toolbar')) return;
    bar.querySelectorAll('.rte-btn[data-cmd]').forEach(function(b) {
      var cmd = b.dataset.cmd;
      var on = false;
      try { on = document.queryCommandState(cmd); } catch(e){}
      b.classList.toggle('active', on);
    });
  }

  // Branche les boutons de la toolbar
  var bar = ed.previousElementSibling;
  if (bar && bar.classList.contains('rte-toolbar')) {
    bar.querySelectorAll('.rte-btn').forEach(function(btn) {
      btn.addEventListener('mousedown', function(e){ e.preventDefault(); }); // garde la sélection
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        var cmd = btn.dataset.cmd;
        var block = btn.dataset.block;
        if (block) {
          // bascule le format de bloc (titre / citation / paragraphe)
          var cur = '';
          try { cur = document.queryCommandValue('formatBlock'); } catch(e){}
          exec('formatBlock', (cur && cur.toLowerCase() === block.toLowerCase()) ? 'p' : block);
        } else if (cmd === 'createLink') {
          var url = prompt('Adresse du lien (https://…) :', 'https://');
          if (url) exec('createLink', url);
        } else if (cmd) {
          exec(cmd);
        }
      });
    });
  }

  // Nettoyage du collage : on garde le texte, pas les styles externes
  ed.addEventListener('paste', function(e) {
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
    sync();
  });

  ed.addEventListener('input', sync);
  ed.addEventListener('keyup', refreshState);
  ed.addEventListener('mouseup', refreshState);

  // Synchro finale à la soumission
  var form = ed.closest('form');
  if (form) form.addEventListener('submit', sync);

  sync();
}

// ── Onglets de formulaire ────────────────────────────────
function initFormTabs(navId) {
  var nav = document.getElementById(navId);
  if (!nav) return;
  var btns   = Array.from(nav.querySelectorAll('.tab-btn'));
  var panels = btns.map(function(b){ return document.getElementById(b.dataset.target); });
  var prevBtn = document.getElementById(navId + '-prev');
  var nextBtn = document.getElementById(navId + '-next');
  var idx = 0;

  function activate(i) {
    idx = Math.max(0, Math.min(i, btns.length - 1));
    btns.forEach(function(b, k){ b.classList.toggle('active', k === idx); });
    panels.forEach(function(p, k){ if (p) p.classList.toggle('active', k === idx); });
    if (prevBtn) prevBtn.disabled = (idx === 0);
    if (nextBtn) nextBtn.textContent = (idx === btns.length - 1) ? '✓ Dernier onglet' : 'Suivant →';
  }
  btns.forEach(function(b, k){ b.addEventListener('click', function(){ activate(k); }); });
  if (prevBtn) prevBtn.addEventListener('click', function(){ activate(idx - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function(){ activate(idx + 1); });
  activate(0);
}
</script>
`;

// Génère le bloc HTML de l'éditeur riche (toolbar + zone + champ caché)
function richEditorHtml(initialBody = '', maxLen = 4000) {
  return `
    <div class="rte-toolbar" aria-label="Mise en forme">
      <button type="button" class="rte-btn" data-cmd="bold" title="Gras (Ctrl+B)"><b>B</b></button>
      <button type="button" class="rte-btn" data-cmd="italic" title="Italique (Ctrl+I)"><i>I</i></button>
      <button type="button" class="rte-btn" data-cmd="underline" title="Souligné (Ctrl+U)"><u>U</u></button>
      <span class="rte-sep"></span>
      <button type="button" class="rte-btn" data-block="h3" title="Titre">H</button>
      <button type="button" class="rte-btn" data-block="blockquote" title="Citation">&#10078;</button>
      <span class="rte-sep"></span>
      <button type="button" class="rte-btn" data-cmd="insertUnorderedList" title="Liste à puces">&bull;&equiv;</button>
      <button type="button" class="rte-btn" data-cmd="insertOrderedList" title="Liste numérotée">1&equiv;</button>
      <span class="rte-sep"></span>
      <button type="button" class="rte-btn" data-cmd="createLink" title="Insérer un lien">🔗</button>
      <button type="button" class="rte-btn" data-cmd="removeFormat" title="Effacer la mise en forme">⌫</button>
    </div>
    <div class="rte-editor" id="bodyEditor" contenteditable="true"
         data-placeholder="Décris ton étape, tes rencontres, la météo…"></div>
    <textarea name="body" id="bodyHidden" style="display:none" maxlength="${maxLen}">${esc(initialBody)}</textarea>
    <div class="rte-count" id="bodyCount"></div>`;
}

// ── Lightbox JS (partagé entre renderPublic et renderPreparation) ──
const LIGHTBOX_JS = `
<script>
  (function(){
    var lb=document.getElementById('lb'),lbImg=document.getElementById('lb-img'),lbCounter=document.getElementById('lb-counter'),lbCap=document.getElementById('lb-caption'),postImgs=[],postCaps=[],cur=0;
    function bindLightbox(root){
      (root||document).querySelectorAll('.card-photos img').forEach(function(img){
        if(img.dataset.lbBound)return; img.dataset.lbBound='1';
        img.addEventListener('click', function(){
          var card=img.closest('.card');
          var imgEls=Array.from(card.querySelectorAll('.card-photos img'));
          postImgs=imgEls.map(function(i){return i.src;});
          postCaps=imgEls.map(function(i){return i.getAttribute('data-caption')||'';});
          cur=postImgs.indexOf(img.src); if(cur<0)cur=0; show();
        });
      });
    }
    window.bindLightbox=bindLightbox;
    bindLightbox(document);
    function show(){
      lbImg.src=postImgs[cur]; lbCounter.textContent=(cur+1)+' / '+postImgs.length;
      if(lbCap){ lbCap.textContent=postCaps[cur]||''; lbCap.style.display=postCaps[cur]?'block':'none'; }
      document.getElementById('lb-prev').style.display=postImgs.length>1?'flex':'none';
      document.getElementById('lb-next').style.display=postImgs.length>1?'flex':'none';
      lb.classList.add('open'); document.body.style.overflow='hidden';
    }
    function close(){ lb.classList.remove('open'); document.body.style.overflow=''; lbImg.src=''; }
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
</script>`;

const LIGHTBOX_HTML = `
<div class="lightbox" id="lb" role="dialog" aria-modal="true">
  <button class="lb-close" id="lb-close" title="Fermer">&#x2715;</button>
  <button class="lb-nav lb-prev" id="lb-prev">&#8249;</button>
  <img id="lb-img" src="" alt="Photo agrandie">
  <button class="lb-nav lb-next" id="lb-next">&#8250;</button>
  <div class="lb-caption" id="lb-caption" style="display:none"></div>
  <div class="lb-counter" id="lb-counter"></div>
</div>`;

const ELEV_MODAL_HTML = `
<div class="elev-modal" id="elevModal" role="dialog" aria-modal="true">
  <div class="elev-box">
    <div class="elev-head">
      <h3 id="elevTitle">Profil de dénivelé</h3>
      <button class="elev-close" id="elevClose" title="Fermer">&#x2715;</button>
    </div>
    <div class="elev-body">
      <div class="elev-canvas-wrap">
        <canvas id="elevCanvas"></canvas>
        <div class="elev-loading" id="elevLoading">Chargement de la trace…</div>
      </div>
      <div class="elev-stats" id="elevStats" style="display:none">
        <div class="elev-stat"><div class="elev-stat-num" id="elevDplus">—</div><div class="elev-stat-lbl">D+ total</div></div>
        <div class="elev-stat"><div class="elev-stat-num" id="elevDminus">—</div><div class="elev-stat-lbl">D− total</div></div>
        <div class="elev-stat"><div class="elev-stat-num" id="elevMin">—</div><div class="elev-stat-lbl">Alt. min</div></div>
        <div class="elev-stat"><div class="elev-stat-num" id="elevMax">—</div><div class="elev-stat-lbl">Alt. max</div></div>
      </div>
    </div>
  </div>
</div>`;

const ELEV_MODAL_JS = `
<script>
(function(){
  var modal=document.getElementById('elevModal');
  if(!modal)return;
  var canvas=document.getElementById('elevCanvas');
  var loading=document.getElementById('elevLoading');
  var stats=document.getElementById('elevStats');
  var titleEl=document.getElementById('elevTitle');
  var cache={};

  function openModal(){ modal.classList.add('open'); document.body.style.overflow='hidden'; }
  function closeModal(){ modal.classList.remove('open'); document.body.style.overflow=''; }
  document.getElementById('elevClose').addEventListener('click',closeModal);
  modal.addEventListener('click',function(e){ if(e.target===modal) closeModal(); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&modal.classList.contains('open')) closeModal(); });

  function haversine(la1,lo1,la2,lo2){
    var R=6371000,dLa=(la2-la1)*Math.PI/180,dLo=(lo2-lo1)*Math.PI/180;
    var a=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)*Math.sin(dLo/2);
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  function buildProfile(txt){
    var xml=new DOMParser().parseFromString(txt,'text/xml');
    var trkpts=Array.from(xml.querySelectorAll('trkpt'));
    var pts=[],distCum=0,prev=null;
    trkpts.forEach(function(tp){
      var lat=parseFloat(tp.getAttribute('lat')),lon=parseFloat(tp.getAttribute('lon'));
      var eleEl=tp.querySelector('ele');
      var ele=eleEl?parseFloat(eleEl.textContent):NaN;
      if(isNaN(lat)||isNaN(lon))return;
      if(prev)distCum+=haversine(prev.lat,prev.lon,lat,lon);
      pts.push({lat:lat,lon:lon,ele:ele,dist:distCum});
      prev={lat:lat,lon:lon};
    });
    return pts;
  }

  function drawProfile(pts){
    var elevPts=pts.filter(function(p){return !isNaN(p.ele);});
    if(elevPts.length<2){
      loading.textContent='Aucune donnée d\\'altitude dans ce fichier GPX.';
      loading.style.display='block'; stats.style.display='none'; return;
    }
    loading.style.display='none';

    var dpr=Math.min(window.devicePixelRatio||1,2);
    var W=canvas.parentElement.clientWidth||600, H=260;
    canvas.width=W*dpr; canvas.height=H*dpr;
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    var ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);

    var PADL=46,PADR=14,PADT=16,PADB=28;
    var plotW=W-PADL-PADR, plotH=H-PADT-PADB;
    var totalDist=elevPts[elevPts.length-1].dist;
    var minE=Infinity,maxE=-Infinity;
    elevPts.forEach(function(p){ if(p.ele<minE)minE=p.ele; if(p.ele>maxE)maxE=p.ele; });
    var range=Math.max(maxE-minE,1);
    var padE=range*0.1; var loE=minE-padE, hiE=maxE+padE; var spanE=hiE-loE;

    function px(d){ return PADL+(d/totalDist)*plotW; }
    function py(e){ return PADT+plotH-((e-loE)/spanE)*plotH; }

    // Grille horizontale + labels altitude
    ctx.font='10px DM Sans,sans-serif'; ctx.textBaseline='middle';
    var steps=4;
    for(var i=0;i<=steps;i++){
      var e=loE+(spanE*i/steps); var y=py(e);
      ctx.strokeStyle='rgba(42,122,122,0.10)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(PADL,y); ctx.lineTo(W-PADR,y); ctx.stroke();
      ctx.fillStyle='#5a8080'; ctx.textAlign='right';
      ctx.fillText(Math.round(e)+' m',PADL-6,y);
    }
    // Labels distance
    ctx.textAlign='center'; ctx.textBaseline='top';
    for(var k=0;k<=4;k++){
      var d=totalDist*k/4; var x=px(d);
      ctx.fillStyle='#5a8080';
      ctx.fillText((d/1000).toFixed(d>0?1:0)+' km',x,H-PADB+8);
    }

    // Aire remplie
    ctx.beginPath();
    ctx.moveTo(px(elevPts[0].dist),py(elevPts[0].ele));
    elevPts.forEach(function(p){ ctx.lineTo(px(p.dist),py(p.ele)); });
    ctx.lineTo(px(elevPts[elevPts.length-1].dist),PADT+plotH);
    ctx.lineTo(px(elevPts[0].dist),PADT+plotH);
    ctx.closePath();
    var grad=ctx.createLinearGradient(0,PADT,0,PADT+plotH);
    grad.addColorStop(0,'rgba(58,144,144,0.45)');
    grad.addColorStop(1,'rgba(58,144,144,0.05)');
    ctx.fillStyle=grad; ctx.fill();

    // Ligne de profil
    ctx.beginPath();
    ctx.moveTo(px(elevPts[0].dist),py(elevPts[0].ele));
    elevPts.forEach(function(p){ ctx.lineTo(px(p.dist),py(p.ele)); });
    ctx.strokeStyle='#2a7a7a'; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.stroke();

    // Stats D+/D-
    var dPlus=0,dMinus=0;
    for(var j=1;j<elevPts.length;j++){
      var diff=elevPts[j].ele-elevPts[j-1].ele;
      if(diff>0)dPlus+=diff; else dMinus+=-diff;
    }
    document.getElementById('elevDplus').textContent=Math.round(dPlus).toLocaleString('fr-FR')+' m';
    document.getElementById('elevDminus').textContent=Math.round(dMinus).toLocaleString('fr-FR')+' m';
    document.getElementById('elevMin').textContent=Math.round(minE).toLocaleString('fr-FR')+' m';
    document.getElementById('elevMax').textContent=Math.round(maxE).toLocaleString('fr-FR')+' m';
    stats.style.display='flex';
  }

  function load(gpxUrl){
    if(cache[gpxUrl]){ drawProfile(cache[gpxUrl]); return; }
    fetch(gpxUrl).then(function(r){return r.text();}).then(function(txt){
      var pts=buildProfile(txt); cache[gpxUrl]=pts; drawProfile(pts);
    }).catch(function(){
      loading.textContent='Impossible de charger la trace GPX.'; loading.style.display='block';
    });
  }

  function bindElev(root){
    (root||document).querySelectorAll('.dplus-clickable').forEach(function(btn){
      if(btn.dataset.elevBound)return; btn.dataset.elevBound='1';
      btn.addEventListener('click',function(){
        titleEl.textContent='Dénivelé · '+(btn.dataset.elevTitle||'');
        loading.textContent='Chargement de la trace…'; loading.style.display='block';
        stats.style.display='none';
        var ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
        openModal();
        setTimeout(function(){ load(btn.dataset.elevGpx); },50);
      });
    });
  }
  window.bindElev=bindElev;
  bindElev(document);
})();
</script>`;

const DELETE_CONFIRM_JS = `
<script>
  (function(){
    function bindDelete(root){
      (root||document).querySelectorAll('.form-delete').forEach(function(f) {
        if(f.dataset.delBound)return; f.dataset.delBound='1';
        f.addEventListener('submit', function(e) {
          if (!window.confirm('Supprimer définitivement ?')) e.preventDefault();
        });
      });
      (root||document).querySelectorAll('.form-comment-del').forEach(function(f) {
        if(f.dataset.delBound)return; f.dataset.delBound='1';
        f.addEventListener('submit', function(e) {
          if (!window.confirm('Supprimer ce commentaire ?')) e.preventDefault();
        });
      });
    }
    window.bindDelete=bindDelete;
    bindDelete(document);
  })();
</script>`;

const COMMENTS_JS = `
<script>
  (function(){
    function bindComments(root){
      (root||document).querySelectorAll('.comment-reply-btn').forEach(function(btn){
        if(btn.dataset.replyBound)return; btn.dataset.replyBound='1';
        btn.addEventListener('click', function(){
          var id=btn.dataset.replyTarget;
          var form=document.getElementById(id);
          if(!form)return;
          var open=form.style.display!=='none';
          form.style.display=open?'none':'flex';
          if(!open){ var inp=form.querySelector('input[name=author]'); if(inp)inp.focus(); }
        });
      });
    }
    window.bindComments=bindComments;
    bindComments(document);
  })();
</script>`;


// ══════════════════════════════════════════════════════════
//  renderCard — carte de post partagée
// ══════════════════════════════════════════════════════════

function renderCard(p, isAdmin, csrf, isStrictAdmin = false) {
  // Index des légendes aligné sur l'ordre de p.photos
  const captionOf = (ph) => {
    const idx = (p.photos || []).indexOf(ph);
    return (p.captions && p.captions[idx]) ? p.captions[idx] : '';
  };
  const expTotal = postExpenseTotal(p);
  const d       = new Date(p.date);
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
        ${p.km    ? `<span class="km-badge">🚴 +${esc(String(p.km))} km</span>` : ''}
        ${p.dplus ? (p.gpx ? `<button type="button" class="dplus-badge dplus-clickable" data-elev-gpx="${p.gpx}" data-elev-title="${esc(p.title)}" title="Voir le profil de dénivelé">⛰️ ${esc(String(p.dplus))} m D+ 📈</button>` : `<span class="dplus-badge">⛰️ ${esc(String(p.dplus))} m D+</span>`) : ''}
      </div>` : ''}
      ${(() => {
        const imgs = (p.photos || []).filter(ph => !isVideoUrl(ph));
        const vids = (p.photos || []).filter(ph => isVideoUrl(ph));
        const imgHtml = imgs.length ? `
      <div class="card-photos${imgs.length === 1 ? ' single' : ''}" style="margin:0 -18px 16px;border-radius:0">
        ${imgs.map(ph => {
          const cap = captionOf(ph);
          return cap
            ? `<figure><img src="${ph}" alt="${esc(cap)}" loading="lazy" data-postid="${p.id}" data-caption="${esc(cap)}"><figcaption>${esc(cap)}</figcaption></figure>`
            : `<img src="${ph}" alt="photo" loading="lazy" data-postid="${p.id}">`;
        }).join('')}
      </div>` : '';
        const vidHtml = vids.length ? `
      <div class="card-videos">
        ${vids.map(ph => `<video src="${ph}" controls preload="metadata" playsinline></video>`).join('')}
      </div>` : '';
        return imgHtml + vidHtml;
      })()}
      <div class="card-text">${renderBody(p.body)}</div>
      ${p.gpx ? `
      <div class="gpx-canvas-wrap">
        <canvas id="gpxcanvas-${p.id}" data-gpx="${p.gpx}" style="display:block;width:100%;height:260px"></canvas>
        <div class="gpx-canvas-footer">
          <span class="gpx-map-lbl">🗺️ Trace GPX · chargement…</span>
          <a class="gpx-link" href="${p.gpx}" download>⬇️ Télécharger</a>
        </div>
      </div>` : ''}
      ${(isStrictAdmin && p.expenses && p.expenses.length) ? `
      <div class="card-expenses">
        <div class="card-exp-head">
          <span>💶 Dépenses</span>
          <span class="card-exp-total">${formatEuro(expTotal)}</span>
        </div>
        ${p.expenses.map(e => `
        <div class="card-exp-item">
          <span class="card-exp-tags">
            <span class="card-exp-cat">${EXPENSE_CAT_LABELS[e.category] || e.category}</span>
            <span class="card-exp-payer">${EXPENSE_PAYER_LABELS[e.payer] || e.payer}</span>
            ${e.label ? `<span style="color:var(--ink-light)">${esc(e.label)}</span>` : ''}
          </span>
          <span class="card-exp-amt">${formatEuro(parseFloat(e.amount) || 0)}</span>
        </div>`).join('')}
      </div>` : ''}
      ${(isStrictAdmin && p.privateNote) ? `
      <div class="card-private">
        <div class="card-private-head">🔒 Note privée — admin uniquement</div>
        <div class="card-private-text">${esc(p.privateNote)}</div>
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
      ${(p.comments||[]).map(c => `
        <div class="comment">
          <div class="comment-avatar">${esc(initials(c.author))}</div>
          <div class="comment-main">
            <div class="comment-bubble">
              <span class="comment-author">${esc(c.author)}</span>
              <span class="comment-date">${formatDate(c.date)}</span>
              ${isStrictAdmin ? `<form method="POST" action="/comment/${p.id}/delete/${c.id}?_csrf=${csrf}" class="form-comment-del" style="display:inline">
                <input type="hidden" name="_csrf" value="${csrf}">
                <button type="submit" class="comment-del" title="Supprimer ce commentaire">🗑️</button>
              </form>` : ''}
              <p class="comment-text">${esc(c.text)}</p>
            </div>
            <button type="button" class="comment-reply-btn" data-reply-target="reply-${c.id}">↩️ Répondre</button>

            ${(c.replies||[]).map(r => `
              <div class="comment comment-nested">
                <div class="comment-avatar comment-avatar-sm">${esc(initials(r.author))}</div>
                <div class="comment-bubble">
                  <span class="comment-author">${esc(r.author)}</span>
                  <span class="comment-date">${formatDate(r.date)}</span>
                  ${isStrictAdmin ? `<form method="POST" action="/comment/${p.id}/delete/${r.id}?_csrf=${csrf}" class="form-comment-del" style="display:inline">
                    <input type="hidden" name="_csrf" value="${csrf}">
                    <button type="submit" class="comment-del" title="Supprimer cette réponse">🗑️</button>
                  </form>` : ''}
                  <p class="comment-text">${esc(r.text)}</p>
                </div>
              </div>`).join('')}

            <form class="comment-form comment-reply-form" id="reply-${c.id}" action="/comment/${p.id}/reply/${c.id}" method="POST" style="display:none">
              <input type="hidden" name="_csrf" value="${csrf}">
              <input name="author" placeholder="Votre prénom" required maxlength="40">
              <textarea name="text" placeholder="Votre réponse..." required maxlength="300"></textarea>
              <button type="submit">↩️ Répondre</button>
            </form>
          </div>
        </div>`).join('')}
      <form class="comment-form" action="/comment/${p.id}" method="POST">
        <input type="hidden" name="_csrf" value="${csrf}">
        <input name="author" placeholder="Votre prénom" required maxlength="40">
        <textarea name="text" placeholder="Laisser un commentaire..." required maxlength="300"></textarea>
        <button type="submit">💬 Commenter</button>
      </form>
    </div>
  </div>`;
}


// ══════════════════════════════════════════════════════════
//  renderPublic
// ══════════════════════════════════════════════════════════

function renderPublic(posts, isAdmin = false, csrf = '', isStrictAdmin = false) {
  const km      = Math.round(totalKm(posts));
  const dp      = Math.round(totalDPlus(posts)).toLocaleString('fr-FR');
  const withGps = posts.filter(p => p.lat && p.lon);

  const PAGE = 5;
  const firstBatch = posts.slice(0, PAGE);
  const hasMore    = posts.length > PAGE;

  const postCards = posts.length === 0
    ? `<div class="empty"><div class="empty-icon">🚴</div><h3>Le voyage n'a pas encore commencé...</h3><p>Les étapes apparaîtront ici !</p></div>`
    : firstBatch.map(p => renderCard(p, isAdmin, csrf, isStrictAdmin)).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${TRIP_TITLE}</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'journal', isAdmin, isStrictAdmin, showMap: withGps.length > 0 })}
    <div class="stats-bar">
      <div class="stat"><div class="stat-num">${km.toLocaleString('fr-FR')}</div><div class="stat-lbl">km</div></div>
      <div class="stat"><div class="stat-num">${posts.length}</div><div class="stat-lbl">étapes</div></div>
      <div class="stat"><div class="stat-num">${dp}</div><div class="stat-lbl">m D+</div></div>
    </div>
    <div class="feed" id="feed">${postCards}</div>
    ${hasMore ? `<div id="loadMoreSentinel" data-offset="${PAGE}" style="text-align:center;padding:24px 12px 40px">
      <div class="lazy-spinner" id="lazySpinner" style="display:none">⏳ Chargement…</div>
    </div>` : ''}
    ${isAdmin ? `<a class="fab" href="/post" title="Nouvelle étape">+</a>` : ''}
    ${LIGHTBOX_HTML}
    ${ELEV_MODAL_HTML}
    <script>
    (function(){
      function lon2xf(lon,z){return(lon+180)/360*Math.pow(2,z);}
      function lat2yf(lat,z){var r=lat*Math.PI/180;return(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z);}
      function bestZoom(pts,W,H,pad){
        var minLat=Infinity,maxLat=-Infinity,minLon=Infinity,maxLon=-Infinity;
        pts.forEach(function(p){if(p.lat<minLat)minLat=p.lat;if(p.lat>maxLat)maxLat=p.lat;if(p.lon<minLon)minLon=p.lon;if(p.lon>maxLon)maxLon=p.lon;});
        for(var z=16;z>=5;z--){var pw=(lon2xf(maxLon,z)-lon2xf(minLon,z))*256,ph=(lat2yf(minLat,z)-lat2yf(maxLat,z))*256;if(pw<=W-pad*2&&ph<=H-pad*2)return z;}
        return 5;
      }
      function drawGpxCanvas(canvas){
        if(canvas.dataset.gpxDrawn)return; canvas.dataset.gpxDrawn='1';
        var gpxUrl=canvas.dataset.gpx; if(!gpxUrl)return;
        fetch(gpxUrl).then(function(r){return r.text();}).then(function(txt){
          var xml=new DOMParser().parseFromString(txt,'text/xml');
          var raw=Array.from(xml.querySelectorAll('trkpt')).map(function(p){return{lat:parseFloat(p.getAttribute('lat')),lon:parseFloat(p.getAttribute('lon'))};});
          if(raw.length<2)return;
          var pts=raw.length>600?raw.filter(function(_,i){return i%Math.ceil(raw.length/600)===0;}):raw;
          if(pts[pts.length-1]!==raw[raw.length-1])pts.push(raw[raw.length-1]);
          var dpr=Math.min(window.devicePixelRatio||1,2),W=canvas.parentElement.clientWidth||560,H=260;
          canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';
          var ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
          ctx.fillStyle='#e8f0e8';ctx.fillRect(0,0,W,H);
          var z=bestZoom(pts,W,H,48);
          var minLat=Infinity,maxLat=-Infinity,minLon=Infinity,maxLon=-Infinity;
          pts.forEach(function(p){if(p.lat<minLat)minLat=p.lat;if(p.lat>maxLat)maxLat=p.lat;if(p.lon<minLon)minLon=p.lon;if(p.lon>maxLon)maxLon=p.lon;});
          var cx=(lon2xf(minLon,z)+lon2xf(maxLon,z))/2,cy=(lat2yf(minLat,z)+lat2yf(maxLat,z))/2;
          var ox=cx-W/2/256,oy=cy-H/2/256;
          function toPixel(lat,lon){return{x:(lon2xf(lon,z)-ox)*256,y:(lat2yf(lat,z)-oy)*256};}
          var tx0=Math.floor(ox),tx1=Math.floor(ox+W/256)+1,ty0=Math.floor(oy),ty1=Math.floor(oy+H/256)+1;
          var tileMax=Math.pow(2,z)-1,totalTiles=(tx1-tx0+1)*(ty1-ty0+1),loadedTiles=0,tiles=[];
          function onTileLoaded(){loadedTiles++;redraw();if(loadedTiles>=totalTiles){var f=canvas.parentElement.querySelector('.gpx-map-lbl');if(f)f.textContent='🗺️ Trace GPX';}}
          for(var tx=tx0;tx<=tx1;tx++){for(var ty=ty0;ty<=ty1;ty++){
            if(tx<0||ty<0||tx>tileMax||ty>tileMax){loadedTiles++;continue;}
            (function(tx,ty){var img=new Image();img.crossOrigin='anonymous';img.src='https://'+['a','b','c'][(tx+ty)%3]+'.tile.openstreetmap.org/'+z+'/'+tx+'/'+ty+'.png';
            img.onload=function(){tiles.push({img:img,tx:tx,ty:ty});onTileLoaded();};img.onerror=function(){onTileLoaded();};})(tx,ty);
          }}
          function redraw(){
            ctx.clearRect(0,0,W,H);ctx.fillStyle='#e8ede8';ctx.fillRect(0,0,W,H);
            tiles.forEach(function(t){ctx.drawImage(t.img,(t.tx-ox)*256,(t.ty-oy)*256,256,256);});
            ctx.fillStyle='rgba(255,255,255,0.10)';ctx.fillRect(0,0,W,H);
            var s=toPixel(pts[0].lat,pts[0].lon);
            ctx.beginPath();ctx.moveTo(s.x+2,s.y+2);pts.forEach(function(p){var c=toPixel(p.lat,p.lon);ctx.lineTo(c.x+2,c.y+2);});
            ctx.strokeStyle='rgba(0,0,0,0.25)';ctx.lineWidth=7;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
            var sp=toPixel(pts[0].lat,pts[0].lon),ep=toPixel(pts[pts.length-1].lat,pts[pts.length-1].lon);
            var grad=ctx.createLinearGradient(sp.x,sp.y,ep.x,ep.y);
            grad.addColorStop(0,'#e67e22');grad.addColorStop(0.5,'#2a7a7a');grad.addColorStop(1,'#2d7a5a');
            ctx.beginPath();ctx.moveTo(sp.x,sp.y);pts.forEach(function(p){var c=toPixel(p.lat,p.lon);ctx.lineTo(c.x,c.y);});
            ctx.strokeStyle=grad;ctx.lineWidth=4;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
            ctx.beginPath();ctx.moveTo(sp.x,sp.y);pts.forEach(function(p){var c=toPixel(p.lat,p.lon);ctx.lineTo(c.x,c.y);});
            ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=1.5;ctx.stroke();
            ctx.beginPath();ctx.arc(sp.x,sp.y,8,0,Math.PI*2);ctx.fillStyle='#e67e22';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2.5;ctx.stroke();
            ctx.beginPath();ctx.arc(ep.x,ep.y,8,0,Math.PI*2);ctx.fillStyle='#2d7a5a';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2.5;ctx.stroke();
            ctx.font='bold 11px DM Sans,sans-serif';
            function lh(t,x,y){ctx.strokeStyle='rgba(255,255,255,0.85)';ctx.lineWidth=3;ctx.strokeText(t,x,y);ctx.fillText(t,x,y);}
            ctx.fillStyle='#e67e22';lh('Départ',sp.x+12,sp.y+4);ctx.fillStyle='#2d7a5a';lh('Arrivée',ep.x+12,ep.y+4);
            ctx.font='9px DM Sans,sans-serif';var attr='© OpenStreetMap contributors',aw=ctx.measureText(attr).width;
            ctx.fillStyle='rgba(255,255,255,0.75)';ctx.fillRect(W-aw-10,H-16,aw+8,14);ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillText(attr,W-aw-6,H-5);
          }
          redraw();
        }).catch(function(e){console.warn('[GPX canvas] erreur :',e);});
      }
      function bindGpxCanvases(root){ (root||document).querySelectorAll('canvas[data-gpx]').forEach(drawGpxCanvas); }
      window.bindGpxCanvases=bindGpxCanvases;
      bindGpxCanvases(document);
    })();
    </script>
    <script>
    (function(){
      var sentinel=document.getElementById('loadMoreSentinel');
      var feed=document.getElementById('feed');
      if(!sentinel||!feed)return;
      var spinner=document.getElementById('lazySpinner');
      var loading=false, done=false;

      function loadMore(){
        if(loading||done)return Promise.resolve(false);
        loading=true;
        if(spinner)spinner.style.display='block';
        var offset=parseInt(sentinel.dataset.offset,10)||0;
        return fetch('/api/posts?offset='+offset,{headers:{'Accept':'application/json'}})
          .then(function(r){return r.json();})
          .then(function(data){
            if(data.html){
              var tmp=document.createElement('div');
              tmp.innerHTML=data.html;
              var added=Array.from(tmp.children);
              added.forEach(function(node){feed.appendChild(node);});
              // Réactiver les comportements interactifs sur les nouvelles cartes
              if(window.bindGpxCanvases)window.bindGpxCanvases(feed);
              if(window.bindLightbox)window.bindLightbox(feed);
              if(window.bindElev)window.bindElev(feed);
              if(window.bindDelete)window.bindDelete(feed);
              if(window.bindComments)window.bindComments(feed);
            }
            sentinel.dataset.offset=String(offset+(data.count||0));
            if(!data.hasMore){
              done=true;
              if(observer)observer.disconnect();
              sentinel.remove();
            }
            loading=false;
            if(spinner)spinner.style.display='none';
            return data.hasMore;
          })
          .catch(function(){
            loading=false;
            if(spinner)spinner.textContent='Erreur de chargement — retentez en faisant défiler.';
            return false;
          });
      }

      var observer=null;
      if('IntersectionObserver' in window){
        observer=new IntersectionObserver(function(entries){
          entries.forEach(function(e){ if(e.isIntersecting)loadMore(); });
        },{rootMargin:'400px 0px'});
        observer.observe(sentinel);
      } else {
        // Repli : bouton manuel
        sentinel.style.cursor='pointer';
        sentinel.addEventListener('click',loadMore);
      }

      // ── Ancre #post-xxx : charge les pages jusqu'à trouver le post ──
      function scrollToHashPost(){
        var hash=window.location.hash;
        if(!hash||hash.indexOf('#post-')!==0)return;
        var id=hash.slice(1); // post-xxxx
        var target=document.getElementById(id);
        if(target){
          // Attendre le rendu des images au-dessus avant de scroller précisément
          target.scrollIntoView({behavior:'auto',block:'start'});
          target.style.transition='background .3s';
          var card=target;
          card.style.boxShadow='0 0 0 3px var(--teal-light)';
          setTimeout(function(){card.style.boxShadow='';},1600);
          // Re-scroll après chargement des images (corrige le décalage lazyload)
          setTimeout(function(){var t=document.getElementById(id);if(t)t.scrollIntoView({behavior:'auto',block:'start'});},350);
          return;
        }
        // Pas encore chargé : charger la page suivante puis réessayer
        if(done){return;} // tout est chargé, post introuvable
        if(loading){ setTimeout(scrollToHashPost, 120); return; } // chargement en cours, on patiente
        loadMore().then(function(){ setTimeout(scrollToHashPost, 60); });
      }

      if(window.location.hash && window.location.hash.indexOf('#post-')===0){
        // Laisser le premier rendu se faire, puis lancer la recherche d'ancre
        setTimeout(scrollToHashPost, 80);
      }
      window.addEventListener('hashchange', scrollToHashPost);
    })();
    </script>
    ${LIGHTBOX_JS}
    ${ELEV_MODAL_JS}
    ${DELETE_CONFIRM_JS}
    ${COMMENTS_JS}
  </body></html>`;
}


// ══════════════════════════════════════════════════════════
//  renderPreparation
// ══════════════════════════════════════════════════════════

function renderPreparation(posts, isAdmin = false, csrf = '', isStrictAdmin = false) {
  const postCards = posts.length === 0
    ? `<div class="empty"><div class="empty-icon">🛠️</div><h3>La préparation n'a pas encore commencé...</h3><p>Les articles de préparation apparaîtront ici !</p></div>`
    : posts.map(p => renderCard(p, isAdmin, csrf, isStrictAdmin)).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Préparation — ${TRIP_TITLE}</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'preparation', isAdmin, isStrictAdmin, showMap: true })}
    <div style="background:linear-gradient(135deg,var(--emerald) 0%,var(--ocean-mid) 100%);padding:20px 20px 18px;border-bottom:2px solid var(--sand)">
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
    ${LIGHTBOX_HTML}
    ${ELEV_MODAL_HTML}
    ${LIGHTBOX_JS}
    ${ELEV_MODAL_JS}
    ${DELETE_CONFIRM_JS}
    ${COMMENTS_JS}
  </body></html>`;
}


// ══════════════════════════════════════════════════════════
//  renderTimeline
// ══════════════════════════════════════════════════════════

function renderTimeline(posts, isAdmin = false, isStrictAdmin = false) {
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
                <p class="timeline-snippet">${esc(stripTags(p.body))}</p>
                <div class="timeline-meta">
                  ${p.km    ? `<span class="timeline-badge tl-km">🚴 ${esc(String(p.km))} km</span>` : ''}
                  ${p.dplus ? `<span class="timeline-badge tl-km">⛰️ ${esc(String(p.dplus))} m D+</span>` : ''}
                  ${p.author ? `<span class="timeline-badge tl-author">👤 ${esc(p.author)}</span>` : ''}
                </div>
              </div>
              ${(() => {
                const firstImg = (p.photos || []).find(ph => !isVideoUrl(ph));
                if (firstImg) return `<img src="${firstImg}" class="timeline-thumb" alt="photo" loading="lazy">`;
                const firstVid = (p.photos || []).find(ph => isVideoUrl(ph));
                if (firstVid) return `<video src="${firstVid}" class="timeline-thumb" muted playsinline preload="metadata" style="background:#000"></video>`;
                return '';
              })()}
            </div>
          </div>
        </a>
      </div>`).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Timeline — ${TRIP_TITLE}</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'timeline', isAdmin, isStrictAdmin, showMap: true })}
    <div class="timeline-wrap"><div class="timeline">${timelineItems}</div></div>
  </body></html>`;
}


// ══════════════════════════════════════════════════════════
//  renderStats
// ══════════════════════════════════════════════════════════

function renderStats(posts, isAdmin = false, allPosts = null) {
  const s = computeStats(posts);

  const fr1 = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fr0 = n => Math.round(n).toLocaleString('fr-FR');

  // ── Synthèse des dépenses par mois (toutes publications, étapes + préparation) ──
  const expSource = allPosts || posts;
  const byMonth = expensesByMonth(expSource);
  const monthKeys = Object.keys(byMonth).sort(); // ordre chronologique
  const grandTotal = monthKeys.reduce((sum, k) => sum + byMonth[k].total, 0);

  const catColors = { restaurant: '#3a9e72', hebergement: '#2a7a7a', nourriture: '#e07a3a', divers: '#7ecece' };
  const payerColors = { julie: '#e07a3a', nico: '#2a7a7a', commun: '#3a9e72' };

  const expensesHtml = monthKeys.length === 0 ? '' : `
      <div class="stats-section-title">💶 Dépenses par mois</div>
      <div class="exp-grand-total">
        <div class="egt-num">${formatEuro(grandTotal)}</div>
        <div class="egt-lbl">Total dépensé sur le voyage</div>
      </div>
      ${monthKeys.map(key => {
        const m = byMonth[key];
        const catRows = EXPENSE_CATEGORIES.filter(c => m.byCat[c]).map(c => {
          const v = m.byCat[c];
          const pct = m.total > 0 ? Math.max(2, Math.round(v / m.total * 100)) : 0;
          return `<div class="exp-break-row">
            <div class="exp-break-lbl">${EXPENSE_CAT_LABELS[c]}</div>
            <div class="exp-break-track"><div class="exp-break-fill" style="width:${pct}%;background:${catColors[c]}"></div></div>
            <div class="exp-break-val">${formatEuro(v)}</div>
          </div>`;
        }).join('');
        const payerRows = EXPENSE_PAYERS.filter(pr => m.byPayer[pr]).map(pr => {
          const v = m.byPayer[pr];
          const pct = m.total > 0 ? Math.max(2, Math.round(v / m.total * 100)) : 0;
          return `<div class="exp-break-row">
            <div class="exp-break-lbl">${EXPENSE_PAYER_LABELS[pr]}</div>
            <div class="exp-break-track"><div class="exp-break-fill" style="width:${pct}%;background:${payerColors[pr]}"></div></div>
            <div class="exp-break-val">${formatEuro(v)}</div>
          </div>`;
        }).join('');
        return `
      <div class="exp-month-card">
        <div class="exp-month-head">
          <span class="exp-month-name">${formatMonthLabel(key)}</span>
          <span class="exp-month-total">${formatEuro(m.total)}</span>
        </div>
        <div class="exp-break-title">Par catégorie</div>
        ${catRows}
        <div class="exp-break-title">Par personne</div>
        ${payerRows}
      </div>`;
      }).join('')}`;

  if (s.nDays === 0) {
    return `<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Statistiques — ${TRIP_TITLE}</title><style>${CSS}</style>
    </head><body>
      ${renderHeader({ activePage: 'stats', isAdmin, isStrictAdmin: true, showMap: false })}
      <div class="stats-wrap">
        ${monthKeys.length === 0
          ? `<div class="empty"><div class="empty-icon">📊</div><h3>Pas encore de jour roulé</h3><p>Les statistiques apparaîtront dès la première étape avec des kilomètres.</p></div>`
          : expensesHtml}
      </div>
    </body></html>`;
  }

  // Graphique des km par jour roulé
  const ridingDays = posts
    .filter(p => p.type !== 'preparation' && (parseFloat(p.km) || 0) > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const maxKm = s.maxKm || 1;
  const bars = ridingDays.map(p => {
    const km = parseFloat(p.km) || 0;
    const dp = parseInt(p.dplus) || 0;
    const pct = Math.max(2, Math.round(km / maxKm * 100));
    return `<div class="sbar-row">
      <div class="sbar-date">${formatDateShort(p.date)}</div>
      <div class="sbar-track"><div class="sbar-fill" style="width:${pct}%"></div></div>
      <div class="sbar-val">${fr1(km)} km</div>
      <div class="sbar-dplus">${dp > 0 ? `⛰️ ${fr0(dp)} m` : ''}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Statistiques — ${TRIP_TITLE}</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'stats', isAdmin, isStrictAdmin: true, showMap: false })}
    <div class="stats-wrap">
      <div class="stats-hero">
        <h1>📊 Statistiques du voyage</h1>
        <p>Moyennes calculées sur les jours réellement roulés</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card feature">
          <div class="sc-icon">🚴</div>
          <div class="sc-num">${fr1(s.avgKm)} km</div>
          <div class="sc-lbl">Moyenne par jour roulé</div>
          <div class="sc-sub">sur ${s.nDays} jour${s.nDays > 1 ? 's' : ''} de vélo · ${fr0(s.km)} km au total</div>
        </div>

        <div class="stat-card">
          <div class="sc-icon">⛰️</div>
          <div class="sc-num">${fr0(s.avgDplus)}</div>
          <div class="sc-lbl">m D+ / jour</div>
          <div class="sc-sub">${fr0(s.dplus)} m au total</div>
        </div>

        <div class="stat-card">
          <div class="sc-icon">📈</div>
          <div class="sc-num">${fr1(s.maxKm)} km</div>
          <div class="sc-lbl">Plus longue étape</div>
          <div class="sc-sub">${s.maxKmDay ? formatDateShort(s.maxKmDay.date) : ''}</div>
        </div>

        <div class="stat-card">
          <div class="sc-icon">📉</div>
          <div class="sc-num">${fr1(s.minKm)} km</div>
          <div class="sc-lbl">Plus courte étape</div>
          <div class="sc-sub">jours roulés uniquement</div>
        </div>

        <div class="stat-card">
          <div class="sc-icon">🏔️</div>
          <div class="sc-num">${fr0(s.maxDplus)} m</div>
          <div class="sc-lbl">D+ max du jour</div>
          <div class="sc-sub">${s.maxDplusDay ? formatDateShort(s.maxDplusDay.date) : ''}</div>
        </div>

        <div class="stat-card">
          <div class="sc-icon">🗓️</div>
          <div class="sc-num">${s.nDays}</div>
          <div class="sc-lbl">Jours roulés</div>
          <div class="sc-sub">${s.restDays > 0 ? `+ ${s.restDays} jour${s.restDays > 1 ? 's' : ''} de pause` : 'aucune pause'}</div>
        </div>

        <div class="stat-card">
          <div class="sc-icon">🛣️</div>
          <div class="sc-num">${fr0(s.km)}</div>
          <div class="sc-lbl">km parcourus</div>
          <div class="sc-sub">${s.spanDays} jour${s.spanDays > 1 ? 's' : ''} depuis le départ</div>
        </div>
      </div>

      <div class="stats-note">
        🚩 Le jour de départ et les jours sans kilométrage (repos, transferts) sont exclus du calcul des moyennes.${s.nExcluded > 0 ? ` ${s.nExcluded} étape${s.nExcluded > 1 ? 's' : ''} non comptée${s.nExcluded > 1 ? 's' : ''}.` : ''}
      </div>

      <div class="stats-section-title">Distance par jour roulé</div>
      <div class="stats-bars">${bars}</div>
      ${expensesHtml}
    </div>
  </body></html>`;
}


// ══════════════════════════════════════════════════════════
//  renderMap
// ══════════════════════════════════════════════════════════

function renderMap(posts, isAdmin = false, isStrictAdmin = false) {
  const withGps = posts.filter(p => p.lat && p.lon);
  const gpsJson = JSON.stringify(withGps.map(p => ({
    lat: p.lat, lon: p.lon, title: p.title, location: p.location || '',
    km: p.km || 0, dplus: p.dplus || 0, date: p.date, id: p.id,
    photo: (p.photos || []).find(ph => !/\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(ph)) || null, gpx: p.gpx || null,
  })));

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Carte — ${TRIP_TITLE}</title>
    <style>${CSS}
      html,body{height:100%;margin:0;}
      .map-page{display:flex;flex-direction:column;height:100%;}
      .map-page .header{position:relative;flex-shrink:0;overflow:visible;z-index:1000;}
      .map-page .mobile-menu{position:absolute;z-index:1001;}
      #map-container{flex:1;position:relative;overflow:hidden;}
      #fullmap{position:absolute;top:0;left:0;right:0;bottom:0;}
      .map-sidebar{position:absolute;top:12px;left:12px;z-index:500;display:flex;flex-direction:column;gap:8px;max-width:280px;pointer-events:none;}
      .map-legend{background:rgba(255,255,255,0.94);border-radius:12px;padding:12px 14px;font-size:12px;box-shadow:0 4px 16px rgba(10,61,98,0.15);border:1px solid rgba(10,61,98,0.08);pointer-events:all;}
      .map-legend-title{font-family:'Playfair Display',serif;font-size:13px;font-weight:700;color:var(--ink);margin-bottom:8px;display:flex;align-items:center;gap:6px;}
      .map-legend-row{display:flex;align-items:center;gap:8px;margin-bottom:5px;color:var(--ink-mid);}
      .map-legend-dot{width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);flex-shrink:0;}
      .map-stats{background:rgba(42,122,122,0.88);border-radius:12px;padding:10px 14px;color:#fff;display:flex;gap:16px;box-shadow:0 4px 16px rgba(10,61,98,0.3);pointer-events:all;}
      .map-stat-item{text-align:center;}
      .map-stat-num{font-family:'Playfair Display',serif;font-size:18px;font-weight:700;line-height:1;}
      .map-stat-lbl{font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.6);margin-top:2px;}
      .map-popup-photo{width:100%;height:100px;object-fit:cover;border-radius:6px;margin-bottom:6px;display:block;}
      .map-popup-title{font-family:'Playfair Display',serif;font-size:14px;font-weight:700;color:var(--ink);margin-bottom:4px;}
      .map-popup-meta{font-size:11px;color:var(--ink-light);display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;}
      .map-popup-badge{background:var(--mist);color:var(--ocean-mid);padding:2px 7px;border-radius:20px;font-weight:500;}
      .map-popup-link{display:inline-block;margin-top:6px;font-size:12px;color:var(--ocean-mid);font-weight:600;text-decoration:underline;}
    </style>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  </head><body>
    <div class="map-page">
      ${renderHeader({ activePage: 'map', isAdmin, isStrictAdmin, showMap: true })}
      <div id="map-container">
        <div id="fullmap">
          ${withGps.length === 0 ? `
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--mist);">
            <div style="font-size:48px;margin-bottom:12px">🗺️</div>
            <h3 style="font-family:'Playfair Display',serif;font-size:20px;color:var(--ink-mid);margin-bottom:8px">Aucun point GPS pour l'instant</h3>
            <p style="color:var(--ink-light)">Postez une étape avec la géolocalisation activée.</p>
          </div>` : `
          <div class="map-sidebar">
            <div class="map-stats">
              <div class="map-stat-item"><div class="map-stat-num">${withGps.length}</div><div class="map-stat-lbl">étapes</div></div>
              <div class="map-stat-item"><div class="map-stat-num">${Math.round(withGps.reduce((s,p)=>s+(p.km||0),0)).toLocaleString('fr-FR')}</div><div class="map-stat-lbl">km</div></div>
              <div class="map-stat-item"><div class="map-stat-num">${Math.round(withGps.reduce((s,p)=>s+(p.dplus||0),0)).toLocaleString('fr-FR')}</div><div class="map-stat-lbl">m D+</div></div>
            </div>
            <div class="map-legend">
              <div class="map-legend-title">🗺️ Légende</div>
              <div class="map-legend-row"><div class="map-legend-dot" style="background:linear-gradient(135deg,#e67e22,#f39c12)"></div>Point de départ</div>
              <div class="map-legend-row"><div class="map-legend-dot" style="background:linear-gradient(135deg,#2a7a7a,#4aabab)"></div>Étape intermédiaire</div>
              <div class="map-legend-row"><div class="map-legend-dot" style="background:linear-gradient(135deg,#1a7a4a,#2ecc71)"></div>Dernière position</div>
              <div class="map-legend-row" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--sand)">
                <div style="width:28px;height:4px;background:#3a9090;border-radius:2px;flex-shrink:0"></div>Trace GPS du jour
              </div>
            </div>
          </div>`}
        </div>
      </div>
    </div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const gpsData = ${gpsJson};
      function initMap() {
        if (!gpsData.length) return;
        const map = L.map('fullmap', { zoomControl: false, scrollWheelZoom: true });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
        const pts = gpsData.map(p => [p.lat, p.lon]);
        // Lien droit entre deux étapes consécutives UNIQUEMENT si l'étape
        // d'arrivée n'a pas de trace GPX (auquel cas la trace remplace le segment).
        const segments = [];
        for (let i = 1; i < gpsData.length; i++) {
          if (gpsData[i].gpx) continue; // trace présente → pas de lien droit
          segments.push([[gpsData[i-1].lat, gpsData[i-1].lon], [gpsData[i].lat, gpsData[i].lon]]);
        }
        segments.forEach(function(seg) {
          L.polyline(seg, { color: 'rgba(0,0,0,.10)', weight: 8 }).addTo(map);
          L.polyline(seg, { color: '#2a7a7a', weight: 4, opacity: .9 }).addTo(map);
          L.polyline(seg, { color: '#fff', weight: 1.5, opacity: .5, dashArray: '8,10' }).addTo(map);
        });
        gpsData.filter(p => p.gpx).forEach(function(p) {
          fetch(p.gpx).then(r => r.text()).then(txt => {
            const xml = new DOMParser().parseFromString(txt, 'text/xml');
            const trkpts = Array.from(xml.querySelectorAll('trkpt')).map(tp => [parseFloat(tp.getAttribute('lat')), parseFloat(tp.getAttribute('lon'))]);
            if (trkpts.length < 2) return;
            L.polyline(trkpts, { color: 'rgba(0,0,0,0.12)', weight: 6 }).addTo(map);
            L.polyline(trkpts, { color: '#3a9090', weight: 3, opacity: 0.85 }).addTo(map);
          }).catch(() => {});
        });
        gpsData.forEach((p, i) => {
          const isFirst = i === 0, isLast = i === gpsData.length - 1;
          let color, size;
          if (isFirst)     { color = 'linear-gradient(135deg,#e67e22,#f39c12)'; size = 22; }
          else if (isLast) { color = 'linear-gradient(135deg,#1a7a4a,#2ecc71)'; size = 22; }
          else             { color = 'linear-gradient(135deg,#2a7a7a,#4aabab)'; size = 14; }
          const ic = L.divIcon({ html: '<div style="background:'+color+';border:'+(size>14?3:2)+'px solid #fff;border-radius:50%;width:'+size+'px;height:'+size+'px;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>', iconSize: [size,size], iconAnchor: [size/2,size/2], className: '' });
          const marker = L.marker([p.lat, p.lon], { icon: ic }).addTo(map);
          const e = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          const dateStr = new Date(p.date).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
          const popupHtml = '<div style="min-width:180px;max-width:240px">'
            +(p.photo?'<img src="'+e(p.photo)+'" class="map-popup-photo" alt="">':'')
            +'<div class="map-popup-title">'+e(p.location||p.title)+'</div>'
            +'<div class="map-popup-meta"><span>'+dateStr+'</span>'
            +(p.km?'<span class="map-popup-badge">'+p.km+' km</span>':'')
            +(p.dplus?'<span class="map-popup-badge">'+p.dplus+' m D+</span>':'')
            +'</div>'
            +(p.location?'<div style="font-size:12px;color:#555;font-style:italic">'+e(p.title)+'</div>':'')
            +'<a href="/#post-'+e(p.id)+'" class="map-popup-link">Lire l&#39;&eacute;tape &rarr;</a>'
            +'</div>';
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
      .map-custom-popup .leaflet-popup-content-wrapper{border-radius:12px;box-shadow:0 8px 24px rgba(10,61,98,0.18);border:1px solid rgba(10,61,98,0.08);padding:0;overflow:hidden;}
      .map-custom-popup .leaflet-popup-content{margin:12px 14px;}
      .map-custom-popup .leaflet-popup-tip{background:#fff;}
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
    <style>${CSS} body{min-height:100vh;display:flex;flex-direction:column;justify-content:center;background:var(--warm-white);}</style>
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
        <p style="text-align:center;font-size:13px;color:var(--ink-light);margin-bottom:20px">Entrez votre mot de passe pour accéder au journal.</p>
        <form method="POST" action="/login">
          <input type="hidden" name="next" value="${esc(next)}">
          <div class="field">
            <label>Mot de passe</label>
            <input type="password" name="password" autofocus required style="text-align:center;font-size:18px;letter-spacing:.1em">
          </div>
          <button class="btn-submit" type="submit">Accéder au journal 🚴</button>
        </form>
      </div>
    </div>
  </body></html>`;
}


// ══════════════════════════════════════════════════════════
//  renderPostForm
// ══════════════════════════════════════════════════════════

function renderPostForm(err, lastLocation = '', isMargot = false, csrf = '', defaultType = '') {
  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Nouvelle étape</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: '', isAdmin: true, showMap: false })}
    <div class="form-wrap"><div class="form-card">
      <h2>✏️ Poster une étape</h2>
      ${err ? `<div class="error-msg">${esc(err || '')}</div>` : ''}
      ${lastLocation ? `<div class="prev-location-hint">📍 Dernière position connue : <strong>${esc(lastLocation)}</strong></div>` : ''}
      <form method="POST" action="/post?_csrf=${csrf}" enctype="multipart/form-data" id="postForm">
        <input type="hidden" name="_csrf" value="${csrf}">

        <div class="tabs-nav" id="postTabs">
          <button type="button" class="tab-btn" data-target="tab-contenu"><span>📝</span><span class="tab-label">Contenu</span></button>
          <button type="button" class="tab-btn" data-target="tab-parcours"><span>🗺️</span><span class="tab-label">Parcours</span></button>
          <button type="button" class="tab-btn" data-target="tab-options"><span>⚙️</span><span class="tab-label">Options</span></button>
        </div>

        <!-- ── Onglet Contenu ── -->
        <div class="tab-panel" id="tab-contenu">
          <div class="field">
            <label>Titre *</label>
            <input name="title" type="text" placeholder="Ex : Arrivée à Lyon !" required maxlength="100">
          </div>
          <div class="field">
            <label>Raconte ta journée *</label>
            ${richEditorHtml('', 4000)}
          </div>
          <div class="field">
            <label>Photos / vidéos (max 10)</label>
            <input type="file" name="photos" multiple accept="image/*,video/*" id="photoInputPost" onchange="previewPhotos(this);renderNewCaptions(this,'newCaptionsPost')">
            <div class="photo-preview" id="photoPreview"></div>
            <div id="newCaptionsPost"></div>
          </div>
          <div class="field">
            <label>Visibilité</label>
            ${isMargot
              ? `<input type="hidden" name="visibility" value="margot">
                 <div style="padding:10px 14px;border-radius:10px;background:var(--mist);border:1.5px solid var(--sand);font-size:13px;color:var(--ocean-mid);font-weight:500">👧 À valider (visible par admin seulement)</div>`
              : `<select name="visibility">
                   <option value="all">🌍 Tout le monde</option>
                   <option value="margot">👧 À valider</option>
                 </select>`}
          </div>
        </div>

        <!-- ── Onglet Parcours ── -->
        <div class="tab-panel" id="tab-parcours">
          <div class="field">
            <label>Date et heure de l'étape</label>
            <input type="datetime-local" name="postDate" value="${nowDatetimeLocal()}" required>
          </div>
          <div class="field">
            <label>Lieu d'arrivée</label>
            <div class="loc-wrap">
              <input name="location" id="locationField" type="text" placeholder="Tapez un lieu ou utilisez le GPS..." autocomplete="off">
              <div class="loc-suggestions" id="locSuggestions"></div>
            </div>
            <input type="hidden" name="lat" id="lat">
            <input type="hidden" name="lon" id="lon">
            <button type="button" class="loc-search-btn" id="gpsBtnPost">📍 GPS auto</button>
          </div>
          <div class="field-row">
            <div class="field"><label>Km du jour</label><input name="km" type="number" min="0" max="500" step="0.1"></div>
            <div class="field"><label>D+ (mètres)</label><input name="dplus" type="number" min="0" max="10000"></div>
          </div>
          <div class="field">
            <label>Trace GPX (optionnel)</label>
            <input type="file" name="gpx" accept=".gpx,application/gpx+xml" onchange="parseGPX(this,'locationField','lat','lon')">
            <div id="gpxInfo" style="display:none;margin-top:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;font-size:13px;color:#166534"></div>
          </div>
        </div>

        <!-- ── Onglet Options ── -->
        <div class="tab-panel" id="tab-options">
          <div class="field">
            <label>Type de publication</label>
            <select name="type">
              <option value="etape" ${defaultType !== 'preparation' ? 'selected' : ''}>🚴 Étape de voyage</option>
              <option value="preparation" ${defaultType === 'preparation' ? 'selected' : ''}>🛠️ Préparation</option>
            </select>
          </div>
          <div class="field">
            <label>Dépenses de l'étape</label>
            <div class="exp-list" id="expList"></div>
            <button type="button" class="exp-add-btn" id="expAddBtn">➕ Ajouter une dépense</button>
            <div class="exp-total-hint" id="expTotal"></div>
          </div>
          <div class="field">
            <label>📝 Note privée (admin uniquement)</label>
            <textarea name="privateNote" placeholder="Visible seulement par les comptes admin. Ex : budget, infos pratiques, rappels…" maxlength="2000" style="min-height:80px"></textarea>
          </div>
        </div>

        <div class="tabs-footer">
          <button type="button" class="tab-prev" id="postTabs-prev">← Précédent</button>
          <button type="button" class="tab-next" id="postTabs-next">Suivant →</button>
        </div>
        <button class="btn-submit" type="submit">🚴 Publier l'étape</button>
      </form>
    </div></div>
    <div class="upload-overlay" id="uploadOverlay">
      <div class="upload-box">
        <div class="up-emoji">🚴</div>
        <h3>Publication en cours…</h3>
        <p id="upMsg">Envoi des photos et de la trace</p>
        <div class="up-bar"><div class="up-bar-fill" id="upBarFill"></div></div>
        <div class="up-pct" id="upPct">0 %</div>
      </div>
    </div>
    ${FORM_SCRIPTS}
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        initRichEditor('bodyEditor', 'bodyHidden', 'bodyCount', 4000);
        initFormTabs('postTabs');
        initLocAutocomplete('locationField', 'lat', 'lon', 'locSuggestions');
        var btn = document.getElementById('gpsBtnPost');
        if (btn) btn.addEventListener('click', function() { getGPS('locationField', 'lat', 'lon'); });
        initExpenses('expList', 'expAddBtn', 'expTotal', []);
        initUploadProgress('postForm');
      });
    </script>
  </body></html>`;
}


// ══════════════════════════════════════════════════════════
//  renderEditForm
// ══════════════════════════════════════════════════════════

function renderEditForm(post, err, isMargot = false, csrf = '') {
  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Modifier l'étape</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: '', isAdmin: true, showMap: false })}
    <div class="form-wrap"><div class="form-card">
      <h2>✏️ Modifier l'étape</h2>
      ${err ? `<div class="error-msg">${esc(err || '')}</div>` : ''}
      <form method="POST" action="/edit/${post.id}?_csrf=${csrf}" enctype="multipart/form-data" id="editForm">
        <input type="hidden" name="_csrf" value="${csrf}">

        <div class="tabs-nav" id="editTabs">
          <button type="button" class="tab-btn" data-target="etab-contenu"><span>📝</span><span class="tab-label">Contenu</span></button>
          <button type="button" class="tab-btn" data-target="etab-parcours"><span>🗺️</span><span class="tab-label">Parcours</span></button>
          <button type="button" class="tab-btn" data-target="etab-options"><span>⚙️</span><span class="tab-label">Options</span></button>
        </div>

        <!-- ── Onglet Contenu ── -->
        <div class="tab-panel" id="etab-contenu">
          <div class="field">
            <label>Titre *</label>
            <input name="title" type="text" value="${esc(post.title)}" required maxlength="100">
          </div>
          <div class="field">
            <label>Raconte ta journée *</label>
            ${richEditorHtml(post.body || '', 4000)}
          </div>
          ${post.photos?.length ? `
          <div class="field">
            <label>Médias actuels — glissez pour réordonner, décochez pour supprimer</label>
            <div id="mediaSortable" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">
              ${post.photos.map((ph, i) => `
                <div class="media-item" draggable="true" data-url="${ph}" style="position:relative;cursor:grab;border-radius:8px;display:flex;flex-direction:column;gap:4px;width:90px">
                  <div style="position:relative">
                    <span class="media-order-badge">${i+1}</span>
                    <input type="checkbox" name="keepPhotos" value="${ph}" checked
                      style="position:absolute;top:4px;right:4px;z-index:2;accent-color:var(--teal);width:18px;height:18px">
                    ${isVideoUrl(ph)
                      ? `<video src="${ph}" muted playsinline style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:2px solid var(--teal-light);pointer-events:none"></video>`
                      : `<img src="${ph}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:2px solid var(--teal-light);pointer-events:none">`}
                  </div>
                  ${isVideoUrl(ph) ? '' : `<input type="text" class="caption-input" name="caption_keep_${ph}" maxlength="200" placeholder="Légende…" value="${esc((post.captions && post.captions[i]) || '')}" style="width:90px;font-size:11px;padding:4px 6px;margin-top:0">`}
                </div>`).join('')}
            </div>
            <div id="photoOrderInputs"></div>
            <p style="font-size:11px;color:var(--ink-light);margin-top:6px">↕️ Maintenez et glissez une vignette pour changer l'ordre.</p>
          </div>` : ''}
          <div class="field">
            <label>Ajouter des photos ou vidéos</label>
            <input type="file" name="photos" multiple accept="image/*,video/*" onchange="previewPhotos(this);renderNewCaptions(this,'newCaptionsEdit')">
            <div class="photo-preview" id="photoPreview"></div>
            <div id="newCaptionsEdit"></div>
          </div>
          <div class="field">
            <label>Visibilité</label>
            ${isMargot ? `
            <input type="hidden" name="visibility" value="margot">
            <div style="padding:10px 14px;background:#fef9c3;border:1.5px solid #fde68a;border-radius:10px;font-size:13px;color:#92400e;font-weight:500">👧 À valider — visible par Margot et l'admin uniquement</div>` : `
            <select name="visibility">
              <option value="all" ${(!post.visibility||post.visibility==='all')?'selected':''}>🌍 Tout le monde</option>
              <option value="margot" ${post.visibility==='margot'?'selected':''}>👧 À valider</option>
            </select>`}
          </div>
        </div>

        <!-- ── Onglet Parcours ── -->
        <div class="tab-panel" id="etab-parcours">
          <div class="field">
            <label>Date et heure de l'étape</label>
            <input type="datetime-local" name="postDate" value="${isoToDatetimeLocal(post.date)}" required>
          </div>
          <div class="field">
            <label>Lieu</label>
            <div class="loc-wrap">
              <input name="location" id="locationField" type="text" value="${esc(post.location||'')}" placeholder="Tapez un lieu ou utilisez le GPS..." autocomplete="off">
              <div class="loc-suggestions" id="locSuggestions"></div>
            </div>
            <input type="hidden" name="lat" id="lat" value="${post.lat||''}">
            <input type="hidden" name="lon" id="lon" value="${post.lon||''}">
            <button type="button" class="loc-search-btn" id="gpsBtnEdit">📍 GPS auto</button>
          </div>
          <div class="field-row">
            <div class="field"><label>Km du jour</label><input name="km" type="number" min="0" max="500" step="0.1" value="${post.km||''}"></div>
            <div class="field"><label>D+ (mètres)</label><input name="dplus" type="number" min="0" max="10000" value="${post.dplus||''}"></div>
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
            <input type="file" name="gpx" accept=".gpx,application/gpx+xml" onchange="parseGPX(this,'locationField','lat','lon')">
            <div id="gpxInfo" style="display:none;margin-top:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;font-size:13px;color:#166534"></div>
          </div>
          ${post.gpx ? `
          <div class="field" style="margin-top:6px;padding-top:16px;border-top:1px solid var(--sand)">
            <label>Recalcul du dénivelé</label>
            <div style="font-size:13px;color:var(--ink-mid);margin-bottom:8px;line-height:1.5">
              ⛰️ <strong>D+</strong> ${post.dplus ? `actuellement <strong>${esc(String(post.dplus))} m</strong>` : `<strong>non calculé</strong>`}.
              Si la trace GPX ne contient pas d'altitude, recalcule via le service Open-Meteo.
            </div>
            <button type="submit" form="recalcForm" class="loc-search-btn" style="margin-top:0">📈 Recalculer le D+ depuis le GPX</button>
            <div style="font-size:11px;color:var(--ink-light);margin-top:6px">
              La trace est interrogée auprès d'Open-Meteo — cela peut prendre quelques secondes.
            </div>
          </div>` : ''}
        </div>

        <!-- ── Onglet Options ── -->
        <div class="tab-panel" id="etab-options">
          <div class="field">
            <label>Dépenses de l'étape</label>
            <div class="exp-list" id="expList"></div>
            <button type="button" class="exp-add-btn" id="expAddBtn">➕ Ajouter une dépense</button>
            <div class="exp-total-hint" id="expTotal"></div>
          </div>
          <div class="field">
            <label>📝 Note privée (admin uniquement)</label>
            <textarea name="privateNote" placeholder="Visible seulement par les comptes admin." maxlength="2000" style="min-height:80px">${esc(post.privateNote || '')}</textarea>
          </div>
        </div>

        <div class="tabs-footer">
          <button type="button" class="tab-prev" id="editTabs-prev">← Précédent</button>
          <button type="button" class="tab-next" id="editTabs-next">Suivant →</button>
        </div>
        <button class="btn-submit" type="submit">💾 Enregistrer les modifications</button>
        </form>
        ${post.gpx ? `
        <form method="POST" action="/recalc-elevation/${post.id}?_csrf=${csrf}" id="recalcForm" class="form-recalc" style="display:none">
          <input type="hidden" name="_csrf" value="${csrf}">
        </form>` : ''}
    </div></div>
    <div class="upload-overlay" id="uploadOverlay">
      <div class="upload-box">
        <div class="up-emoji">💾</div>
        <h3>Enregistrement en cours…</h3>
        <p id="upMsg">Envoi des photos et de la trace</p>
        <div class="up-bar"><div class="up-bar-fill" id="upBarFill"></div></div>
        <div class="up-pct" id="upPct">0 %</div>
      </div>
    </div>
    ${FORM_SCRIPTS}
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        initRichEditor('bodyEditor', 'bodyHidden', 'bodyCount', 4000);
        initFormTabs('editTabs');
        initLocAutocomplete('locationField', 'lat', 'lon', 'locSuggestions');
        var btn = document.getElementById('gpsBtnEdit');
        if (btn) btn.addEventListener('click', function() { getGPS('locationField', 'lat', 'lon'); });
        initExpenses('expList', 'expAddBtn', 'expTotal', ${JSON.stringify(post.expenses || []).replace(/</g, '\\u003c')});

        // ── Réordonnancement des médias (drag & drop + tactile) ──
        var sortable = document.getElementById('mediaSortable');
        var orderInputs = document.getElementById('photoOrderInputs');
        if (sortable && orderInputs) {
          var dragged = null;

          function refreshOrder() {
            var items = Array.from(sortable.querySelectorAll('.media-item'));
            orderInputs.innerHTML = '';
            items.forEach(function(it, i) {
              var badge = it.querySelector('.media-order-badge');
              if (badge) badge.textContent = i + 1;
              var inp = document.createElement('input');
              inp.type = 'hidden';
              inp.name = 'photoOrder';
              inp.value = it.dataset.url;
              orderInputs.appendChild(inp);
            });
          }

          sortable.querySelectorAll('.media-item').forEach(function(item) {
            item.addEventListener('dragstart', function() { dragged = item; item.style.opacity = '0.4'; });
            item.addEventListener('dragend', function() { item.style.opacity = '1'; dragged = null; refreshOrder(); });
            item.addEventListener('dragover', function(e) {
              e.preventDefault();
              if (!dragged || dragged === item) return;
              var rect = item.getBoundingClientRect();
              var after = (e.clientX - rect.left) > rect.width / 2;
              sortable.insertBefore(dragged, after ? item.nextSibling : item);
            });
          });

          // Support tactile simple : appui long puis déplacement
          var touchItem = null;
          sortable.querySelectorAll('.media-item').forEach(function(item) {
            item.addEventListener('touchstart', function() { touchItem = item; }, { passive: true });
            item.addEventListener('touchmove', function(e) {
              if (!touchItem) return;
              var t = e.touches[0];
              var over = document.elementFromPoint(t.clientX, t.clientY);
              if (!over) return;
              var target = over.closest('.media-item');
              if (target && target !== touchItem && target.parentElement === sortable) {
                var rect = target.getBoundingClientRect();
                var after = (t.clientX - rect.left) > rect.width / 2;
                sortable.insertBefore(touchItem, after ? target.nextSibling : target);
              }
            }, { passive: true });
            item.addEventListener('touchend', function() { touchItem = null; refreshOrder(); }, { passive: true });
          });

          refreshOrder();
        }

        initUploadProgress('editForm');
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
      <description><![CDATA[${stripTags(p.body)}]]></description>
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
    <title>Paramètres — ${TRIP_TITLE}</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'settings', isAdmin: true, showMap: false })}
    <div class="form-wrap">
      ${restored ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:14px;color:#166534;font-weight:500">✅ Données restaurées avec succès.</div>` : ''}
      <div class="form-card" style="margin-bottom:16px">
        <h2>⬇️ Sauvegarder</h2>
        <p style="font-size:14px;color:var(--ink-light);margin-bottom:18px;line-height:1.6"><strong>Sauvegarde complète (recommandée)</strong> : une archive ZIP contenant les étapes <em>et</em> toutes les photos/vidéos. C'est la sauvegarde à conserver.</p>
        <a href="/backup-full" class="btn-submit" style="display:block;text-align:center;text-decoration:none">📦 Télécharger la sauvegarde complète (ZIP)</a>
        <p style="font-size:13px;color:var(--ink-light);margin:16px 0 10px;line-height:1.6">Sauvegarde légère : uniquement les textes des étapes au format <code>.json</code>, sans les médias.</p>
        <a href="/backup" class="loc-search-btn" style="display:block;text-align:center;text-decoration:none;margin:0">⬇️ Télécharger les données seules (JSON)</a>
      </div>
      <div class="form-card">
        <h2>⬆️ Restaurer</h2>
        <p style="font-size:14px;color:var(--ink-light);margin-bottom:18px;line-height:1.6">Importe un fichier de sauvegarde JSON. <strong style="color:#dc2626">Les étapes actuelles seront remplacées</strong> par celles du fichier.</p>
        <form method="POST" action="/restore" enctype="multipart/form-data" class="form-restore">
          <input type="hidden" name="_csrf" value="${csrf}">
          <div class="field">
            <label>Fichier de sauvegarde (.json)</label>
            <input type="file" name="backup" accept=".json,application/json" required style="padding:8px;background:#fff">
          </div>
          <button class="btn-submit" type="submit" style="background:linear-gradient(135deg,#dc2626,#b91c1c)">⬆️ Restaurer les données</button>
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
