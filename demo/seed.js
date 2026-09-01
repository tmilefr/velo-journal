#!/usr/bin/env node
// ── Générateur du carnet de démonstration ─────────────────
//
//   npm run demo            installe le carnet de démo (refuse d'écraser)
//   npm run demo -- --force écrase le carnet existant (après sauvegarde)
//   npm run demo -- --svg   photos en SVG (sans sharp, plus rapide)
//   npm run demo -- --clean retire le carnet de démo et ses fichiers
//
// À partir de demo/trip.js, ce script fabrique un carnet complet et cohérent :
// les traces GPX (calées sur la distance et le dénivelé annoncés), des photos
// d'illustration dessinées à la volée, et les fichiers data/*.json de
// l'application. Rien n'est téléchargé : aucun appel réseau, aucun service
// externe, la démo tourne hors ligne.
//
// Tout est déterministe : deux exécutions produisent le même carnet, aux mêmes
// identifiants et aux mêmes photos.

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const TRIP = require('./trip');

const ROOT        = path.join(__dirname, '..');
const DATA_DIR    = path.join(ROOT, 'data');
const POSTS_FILE  = path.join(DATA_DIR, 'posts.json');
const SUBS_FILE   = path.join(DATA_DIR, 'subscribers.json');
const SET_FILE    = path.join(DATA_DIR, 'settings.json');
const UPLOADS_DIR = path.join(ROOT, 'public', 'uploads');

const args   = process.argv.slice(2);
const FORCE  = args.includes('--force');
const CLEAN  = args.includes('--clean');
const NO_PIC = args.includes('--no-photos');
const AS_SVG = args.includes('--svg');

const PREFIX = 'demo-';          // tous les fichiers produits en portent la marque
const AUTHOR = 'NiJuMaTim';

let sharp = null;
if (!AS_SVG) { try { sharp = require('sharp'); } catch (e) { sharp = null; } }

// ── Hasard reproductible ──────────────────────────────────
function rng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Géométrie ─────────────────────────────────────────────
const R_EARTH = 6371;
const rad = d => d * Math.PI / 180;

function haversine(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2
          + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(s));
}
function trackLength(pts) {
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += haversine([pts[i-1].lat, pts[i-1].lon], [pts[i].lat, pts[i].lon]);
  return km;
}

// Points de passage → polyligne échantillonnée tous les ~250 m,
// avec la distance cumulée et l'altitude interpolée à chaque point.
function densify(route, ele, stepKm = 0.25) {
  const out = [];
  let cum = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const segKm = haversine(a, b);
    const n = Math.max(2, Math.round(segKm / stepKm));
    for (let k = (i === 1 ? 0 : 1); k <= n; k++) {
      const t = k / n;
      const lat = a[0] + (b[0] - a[0]) * t;
      const lon = a[1] + (b[1] - a[1]) * t;
      const h   = ele[i - 1] + (ele[i] - ele[i - 1]) * t;
      if (out.length) cum += haversine([out[out.length-1].lat, out[out.length-1].lon], [lat, lon]);
      out.push({ lat, lon, ele: h, km: cum });
    }
  }
  return out;
}

// Un vrai itinéraire ne va jamais tout droit : on fait serpenter la polyligne
// perpendiculairement à sa direction, avec deux harmoniques, jusqu'à ce que sa
// longueur atteigne la distance annoncée pour l'étape.
function meander(base, amplitudeKm, seed) {
  const r = rng(seed);
  const phase1 = r() * Math.PI * 2;
  const phase2 = r() * Math.PI * 2;
  const L1 = 9.0, L2 = 2.7;   // longueurs d'onde, en km
  const total = base[base.length - 1].km;
  return base.map((p, i) => {
    if (i === 0 || i === base.length - 1) return { ...p };
    // direction locale, puis sa perpendiculaire
    const a = base[Math.max(0, i - 1)], b = base[Math.min(base.length - 1, i + 1)];
    const dLat = b.lat - a.lat;
    const dLon = (b.lon - a.lon) * Math.cos(rad(p.lat));
    const norm = Math.hypot(dLat, dLon) || 1;
    // atténuation aux extrémités : on rejoint proprement les points de passage
    const edge = Math.min(1, Math.min(p.km, total - p.km) / 2.5);
    const off  = amplitudeKm * edge
      * (Math.sin(2 * Math.PI * p.km / L1 + phase1) + 0.45 * Math.sin(2 * Math.PI * p.km / L2 + phase2));
    const dLatKm = -dLon / norm * off;
    const dLonKm =  dLat / norm * off;
    return {
      lat: p.lat + dLatKm / 111.32,
      lon: p.lon + dLonKm / (111.32 * Math.cos(rad(p.lat))),
      ele: p.ele,
      km:  p.km,
    };
  });
}

// Recherche l'amplitude qui donne la distance visée (dichotomie).
function fitDistance(base, targetKm, seed) {
  const straight = base[base.length - 1].km;
  if (targetKm <= straight * 1.005) return meander(base, 0, seed);
  let lo = 0, hi = 8, best = meander(base, 0, seed);
  for (let it = 0; it < 40; it++) {
    const mid = (lo + hi) / 2;
    const pts = meander(base, mid, seed);
    const len = trackLength(pts);
    best = pts;
    if (Math.abs(len - targetKm) < 0.05) break;
    if (len < targetKm) lo = mid; else hi = mid;
  }
  return best;
}

// D+ tel que l'application le recalcule depuis un GPX (somme des montées).
function dplusOf(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].ele - pts[i-1].ele > 0) d += pts[i].ele - pts[i-1].ele;
  return Math.round(d);
}

// Le profil des points de passage donne la tendance ; le relief réel ajoute des
// bosses. On règle leur ampleur pour atteindre le dénivelé annoncé.
function fitElevation(pts, targetDplus, seed) {
  const r = rng(seed + '-ele');
  const p1 = r() * Math.PI * 2, p2 = r() * Math.PI * 2, p3 = r() * Math.PI * 2;
  const bump = km => Math.sin(2 * Math.PI * km / 1.9 + p1)
                   + 0.55 * Math.sin(2 * Math.PI * km / 0.73 + p2)
                   + 0.30 * Math.sin(2 * Math.PI * km / 4.30 + p3);
  const apply = amp => pts.map(p => ({ ...p, ele: Math.round((p.ele + amp * bump(p.km)) * 10) / 10 }));

  if (dplusOf(apply(0)) >= targetDplus) return apply(0);
  let lo = 0, hi = 120, out = apply(0);
  for (let it = 0; it < 40; it++) {
    const mid = (lo + hi) / 2;
    out = apply(mid);
    const d = dplusOf(out);
    if (Math.abs(d - targetDplus) <= 2) break;
    if (d < targetDplus) lo = mid; else hi = mid;
  }
  return out;
}

// ── GPX ───────────────────────────────────────────────────
function gpxDocument(pts, name, startISO) {
  const t0 = new Date(startISO).getTime();
  const speed = 16; // km/h : sert seulement à horodater les points
  const body = pts.map(p => {
    const at = new Date(t0 + (p.km / speed) * 3600 * 1000).toISOString();
    return `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>${p.ele.toFixed(1)}</ele><time>${at}</time></trkpt>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="velo-journal-demo" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${xml(name)}</name><time>${new Date(t0).toISOString()}</time></metadata>
  <trk>
    <name>${xml(name)}</name>
    <trkseg>
${body}
    </trkseg>
  </trk>
</gpx>
`;
}

// ── Photos dessinées à la volée ───────────────────────────
const PALETTES = {
  France:    { sky: ['#bfe3f5', '#eaf4e6'], sun: '#fff6d8', hills: ['#9ec6a3', '#6fa87d', '#47795c', '#2d5341'], ground: '#e6dfc6', accent: '#c2543f' },
  Allemagne: { sky: ['#cfe6f7', '#fdf3cf'], sun: '#ffeeb0', hills: ['#c8cf7c', '#9ab86a', '#688f57', '#3f6242'], ground: '#e9dfae', accent: '#b8562f' },
  Autriche:  { sky: ['#b7dcf2', '#e7f2f7'], sun: '#fffbe6', hills: ['#a9c8cf', '#78a4a5', '#4d7c78', '#2f5450'], ground: '#dbe4d6', accent: '#2f6f8f' },
  Slovénie:  { sky: ['#a9d3ee', '#e4f4f3'], sun: '#ffffff', hills: ['#b8c2c6', '#8aa0a8', '#5c7a83', '#37525c'], ground: '#cfe6df', accent: '#1f9c9c' },
  Italie:    { sky: ['#ffd9a0', '#ffeccb'], sun: '#fff1c2', hills: ['#d8b184', '#bd8b60', '#8f6444', '#5e422f'], ground: '#e8d3a8', accent: '#a83c2c' },
};

function xml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Crête de montagne : une ligne brisée aléatoire mais reproductible
function ridge(r, w, h, baseY, amp, teeth) {
  const pts = [];
  for (let i = 0; i <= teeth; i++) {
    const x = (w * i) / teeth;
    const y = baseY - amp * (0.35 + 0.65 * r()) * Math.sin((Math.PI * i) / teeth) ;
    pts.push(`${x.toFixed(0)},${y.toFixed(0)}`);
  }
  return `M -10,${h + 10} L -10,${baseY.toFixed(0)} L ${pts.join(' L ')} L ${w + 10},${baseY.toFixed(0)} L ${w + 10},${h + 10} Z`;
}

function photoSvg({ caption, place, dateLabel, country, portrait, seed }) {
  const pal = PALETTES[country] || PALETTES.France;
  const w = portrait ? 1000 : 1600;
  const h = portrait ? 1500 : 1067;
  const r = rng(seed);
  const horizon = h * (portrait ? 0.52 : 0.56);

  const layers = pal.hills.map((color, i) => {
    const baseY = horizon + (h - horizon) * (i / (pal.hills.length + 1)) * 0.9;
    const amp   = (horizon * 0.55) * (1 - i * 0.18);
    return `<path d="${ridge(r, w, h, baseY, amp, 7 + i * 3)}" fill="${color}"/>`;
  }).join('\n  ');

  // une route (ou une rivière) qui file vers l'horizon
  const roadX = w * (0.3 + r() * 0.4);
  const road = `<path d="M ${(w * 0.5 - w * 0.28).toFixed(0)},${h} Q ${(w * 0.5).toFixed(0)},${(h * 0.78).toFixed(0)} ${roadX.toFixed(0)},${(horizon + 12).toFixed(0)} L ${(roadX + w * 0.02).toFixed(0)},${(horizon + 12).toFixed(0)} Q ${(w * 0.5 + w * 0.06).toFixed(0)},${(h * 0.8).toFixed(0)} ${(w * 0.5 + w * 0.2).toFixed(0)},${h} Z" fill="${pal.ground}" opacity="0.92"/>`;

  const sunX = w * (0.18 + r() * 0.6);
  const sunY = horizon * (0.28 + r() * 0.3);
  const fontBig = portrait ? 40 : 44;
  const fontSmall = portrait ? 26 : 28;

  // Le carnet affiche déjà la légende sous la photo : ici elle est écrite en
  // haut, discrètement, pour que les deux ne se marchent pas dessus.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${pal.sky[0]}"/><stop offset="100%" stop-color="${pal.sky[1]}"/>
    </linearGradient>
    <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0.34"/><stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  <circle cx="${sunX.toFixed(0)}" cy="${sunY.toFixed(0)}" r="${(h * 0.055).toFixed(0)}" fill="${pal.sun}" opacity="0.9"/>
  ${layers}
  ${road}
  <g transform="translate(${(w * 0.5 - 40).toFixed(0)}, ${(h * 0.86).toFixed(0)}) scale(${portrait ? 1.5 : 1.7})">
    <circle cx="0" cy="0" r="13" fill="none" stroke="${pal.accent}" stroke-width="3.5"/>
    <circle cx="34" cy="0" r="13" fill="none" stroke="${pal.accent}" stroke-width="3.5"/>
    <path d="M 0,0 L 12,-16 L 30,-16 L 34,0 M 12,-16 L 22,0 M 30,-16 L 33,-22 L 27,-22" fill="none" stroke="${pal.accent}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M 17,-30 a 5 5 0 1 0 0.1 0 M 17,-25 L 20,-14" fill="none" stroke="${pal.accent}" stroke-width="3.5" stroke-linecap="round"/>
  </g>
  <rect x="0" y="0" width="${w}" height="${(h * 0.22).toFixed(0)}" fill="url(#veil)"/>
  <text x="56" y="${(fontBig * 1.6).toFixed(0)}" font-family="Helvetica, Arial, sans-serif" font-size="${fontBig}" font-weight="700" fill="#ffffff">${xml(caption)}</text>
  <text x="56" y="${(fontBig * 1.6 + fontSmall * 1.5).toFixed(0)}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSmall}" fill="#ffffff" opacity="0.85">${xml(place)} · ${xml(dateLabel)}</text>
  <text x="${w - 56}" y="${(h - 34).toFixed(0)}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="${(fontSmall * 0.8).toFixed(0)}" fill="${pal.hills[3]}" opacity="0.55">image de démonstration</text>
</svg>`;
}

// ── Dates (Europe/Paris → ISO) ────────────────────────────
function parisOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const p = {}; parts.forEach(x => { p[x.type] = x.value; });
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}
function parisToISO(y, mo, d, h = 19, mi = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = parisOffsetMinutes(new Date(guess));
  return new Date(guess - off * 60000).toISOString();
}
function dayISO(dayOffset, hour = 19, minute = 0) {
  const [y, m, d] = TRIP.departure.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d) + dayOffset * 86400000;
  const dt = new Date(base);
  return parisToISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), hour, minute);
}
function dateLabel(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Identifiants stables ──────────────────────────────────
const idOf = (kind, n) => crypto.createHash('sha1').update(`velo-demo/${kind}/${n}`).digest('hex').slice(0, kind === 'post' ? 16 : 12);

// ── Nettoyage ─────────────────────────────────────────────
function cleanDemoFiles() {
  let n = 0;
  if (fs.existsSync(UPLOADS_DIR)) {
    for (const f of fs.readdirSync(UPLOADS_DIR)) {
      if (f.startsWith(PREFIX)) { fs.unlinkSync(path.join(UPLOADS_DIR, f)); n++; }
    }
  }
  return n;
}

// ── Construction du carnet ────────────────────────────────
async function build() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const posts = [];
  const pending = [];   // photos à écrire (SVG ou JPEG)
  let photoN = 0;

  TRIP.posts.forEach((src, index) => {
    const isPrep = src.type === 'preparation';
    const iso = isPrep
      ? parisToISO(...src.date.split('-').map(Number), src.hour ?? 19, 0)
      : dayISO(src.day, src.hour ?? 19, (index * 7) % 60);
    const endISO = src.days && src.days > 1
      ? dayISO(src.day + src.days - 1, 23, 0)
      : null;

    const country = src.geo ? src.geo[0][0] : 'France';
    const place   = String(src.location || '').split(',')[0].trim();

    // ── trace GPX ──
    let gpxUrl = null, km = src.km ?? 0, dplus = src.dplus ?? 0, endPoint = src.at;
    if (src.route && src.route.length >= 2) {
      const seed = `stage-${index}`;
      const base = densify(src.route, src.ele || src.route.map(() => 100));
      const wavy = fitDistance(base, src.km, seed);
      // la distance cumulée a changé avec les méandres : on la recalcule
      let cum = 0;
      const withKm = wavy.map((p, i) => {
        if (i) cum += haversine([wavy[i-1].lat, wavy[i-1].lon], [p.lat, p.lon]);
        return { ...p, km: cum };
      });
      const pts = fitElevation(withKm, src.dplus, seed);
      km    = Math.round(trackLength(pts) * 10) / 10;
      dplus = dplusOf(pts);
      endPoint = [pts[pts.length - 1].lat, pts[pts.length - 1].lon];
      const file = `${PREFIX}${String(index).padStart(2, '0')}-${slug(place)}.gpx`;
      fs.writeFileSync(path.join(UPLOADS_DIR, file), gpxDocument(pts, src.title, dayISO(src.day, 8, 30)));
      gpxUrl = '/uploads/' + file;
    }

    // ── photos ──
    const photos = [], captions = [];
    (src.photos || []).forEach(([caption, orientation], i) => {
      const portrait = orientation === 'portrait';
      const file = `${PREFIX}${String(index).padStart(2, '0')}${String.fromCharCode(97 + i)}-${slug(place)}.${sharp ? 'jpg' : 'svg'}`;
      pending.push({
        file,
        svg: photoSvg({
          caption, place, dateLabel: dateLabel(iso), country, portrait,
          seed: `photo-${index}-${i}`,
        }),
      });
      photos.push('/uploads/' + file);
      captions.push(caption);
      photoN++;
    });

    // ── répartition par pays / région ──
    const share = src.geo ? src.geo.reduce((s, g) => s + g[3], 0) || 1 : 1;
    const isTrain = !!src.train;
    const trainKm = isTrain ? src.train.km : 0;
    const geoBreakdown = (src.geo || []).map(([c, region, code, part]) => ({
      country: c, region, countryCode: code,
      km:      isTrain ? 0 : Math.round((km * part / share) * 10) / 10,
      trainKm: isTrain ? Math.round((trainKm * part / share) * 10) / 10 : 0,
    }));
    if (geoBreakdown.length && isTrain && km > 0) geoBreakdown[geoBreakdown.length - 1].km += km;
    const main = geoBreakdown.length
      ? geoBreakdown.reduce((a, b) => ((b.km + b.trainKm) > (a.km + a.trainKm) ? b : a))
      : { country: '', region: '', countryCode: '' };

    // ── commentaires ──
    const comments = (src.comments || []).map(([author, text, day, replies], ci) => ({
      id:     idOf('comment', `${index}-${ci}`),
      author, text,
      date:   isPrep ? offsetISO(iso, day) : dayISO(day, 21, (ci * 11) % 60),
      replies: (replies || []).map(([rAuthor, rText, rDay], ri) => ({
        id:     idOf('comment', `${index}-${ci}-${ri}`),
        author: rAuthor, text: rText,
        date:   isPrep ? offsetISO(iso, rDay) : dayISO(rDay, 22, (ri * 13) % 60),
      })),
    }));

    posts.push({
      id:      idOf('post', index),
      date:    iso,
      endDate: endISO,
      title:   src.title,
      body:    src.body,
      location: src.location || '',
      lat: endPoint ? endPoint[0] : null,
      lon: endPoint ? endPoint[1] : null,
      km:    isPrep ? 0 : km,
      dplus: isPrep ? 0 : dplus,
      trainTransfer: isTrain,
      trainKm:       trainKm,
      trainKmSource: isTrain ? 'manual' : '',
      trainLabel:    isTrain ? `${src.train.from} → ${src.train.to}` : '',
      trainFrom:     isTrain ? src.train.from : '',
      trainTo:       isTrain ? src.train.to   : '',
      trainFromLat: null, trainFromLon: null, trainToLat: null, trainToLon: null,
      country:     main.country,
      region:      main.region,
      countryCode: main.countryCode,
      geoSource:   isPrep ? '' : (gpxUrl ? 'gpx' : 'point'),
      geoBreakdown: isPrep ? [] : geoBreakdown,
      author:     AUTHOR,
      visibility: src.visibility || 'all',
      type:       isPrep ? 'preparation' : 'etape',
      photos,
      captions,
      cover:      photos[0] || null,
      bookPhotos: src.book ? src.book.map(i => photos[i]).filter(Boolean) : photos.slice(),
      gpx:        gpxUrl,
      expenses:   (src.expenses || []).map(([category, subcategory, payer, amount, label]) =>
                    ({ category, subcategory: subcategory || null, payer, amount, label })),
      sleep:      src.sleep ? {
                    label: src.sleep.label, comment: src.sleep.comment || '',
                    lat: src.sleep.at ? src.sleep.at[0] : null,
                    lon: src.sleep.at ? src.sleep.at[1] : null,
                  } : null,
      privateNote: src.privateNote || '',
      comments,
    });
  });

  // ── totaux réels, injectés dans les textes de l'arrivée ──
  const stages   = posts.filter(p => p.type !== 'preparation');
  const totalKm  = stages.reduce((s, p) => s + p.km, 0);
  const ridden   = stages.filter(p => p.km > 0);
  const days     = new Set();
  ridden.forEach(p => days.add(p.date.slice(0, 10)));
  const countries = new Set();
  stages.forEach(p => (p.geoBreakdown || []).forEach(g => countries.add(g.country)));
  const spanDays = Math.round(
    (new Date(ridden[ridden.length - 1].date) - new Date(ridden[0].date)) / 86400000) + 1;

  const vars = {
    TOTAL_KM:    Math.round(totalKm).toLocaleString('fr-FR'),
    TOTAL_DAYS:  String(spanDays),
    RIDING_DAYS: String(ridden.length),
    COUNTRIES:   String(countries.size),
  };
  const fill = s => String(s).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  posts.forEach(p => {
    p.body     = fill(p.body);
    p.title    = fill(p.title);
    p.captions = p.captions.map(fill);
    p.comments.forEach(c => {
      c.text = fill(c.text);
      (c.replies || []).forEach(r => { r.text = fill(r.text); });
    });
  });

  // ── écriture des photos ───────────────────────────────
  if (!NO_PIC) {
    process.stdout.write(`   photos : 0/${pending.length}`);
    let done = 0;
    for (const item of pending) {
      const abs = path.join(UPLOADS_DIR, item.file);
      if (sharp) {
        await sharp(Buffer.from(item.svg))
          .jpeg({ quality: 82, progressive: true })
          .toFile(abs);
      } else {
        fs.writeFileSync(abs, item.svg);
      }
      done++;
      process.stdout.write(`\r   photos : ${done}/${pending.length}`);
    }
    process.stdout.write('\n');
  }

  // ── fichiers de données ───────────────────────────────
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));

  const subs = [
    ['mamie.jeanne@example.com',   true,  -40],
    ['papi.rene@example.com',      true,  -38],
    ['marc.duvivier@example.com',  true,  -31],
    ['lea.b@example.com',          true,  -12],
    ['classe.cm2@example.com',     true,   -9],
    ['voisin.curieux@example.com', false,  -2],
  ].map(([email, confirmed, dayOffset], i) => ({
    email,
    token:       crypto.createHash('sha256').update('velo-demo/sub/' + email).digest('hex').slice(0, 48),
    confirmed,
    createdAt:   dayISO(dayOffset, 10, i * 3),
    confirmedAt: confirmed ? dayISO(dayOffset, 10, i * 3 + 12) : null,
  }));
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));

  fs.writeFileSync(SET_FILE, JSON.stringify({
    commentEmails: ['julie.demo@example.com', 'nico.demo@example.com'],
  }, null, 2));

  return { posts, photoN, totalKm, ridden: ridden.length, spanDays, countries: countries.size, subs };
}

function offsetISO(iso, days) {
  return new Date(new Date(iso).getTime() + (days || 0) * 86400000).toISOString();
}
function slug(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24) || 'etape';
}

// ── Programme principal ───────────────────────────────────
(async () => {
  if (CLEAN) {
    const n = cleanDemoFiles();
    [POSTS_FILE, SUBS_FILE, SET_FILE].forEach(f => {
      if (fs.existsSync(f)) {
        const raw = fs.readFileSync(f, 'utf8');
        if (raw.includes('velo-journal-demo') || f !== POSTS_FILE || raw.includes(PREFIX)) fs.unlinkSync(f);
      }
    });
    console.log(`\n🧹 Carnet de démonstration retiré (${n} fichier(s) supprimé(s) dans public/uploads).\n`);
    return;
  }

  if (fs.existsSync(POSTS_FILE) && !FORCE) {
    console.error('\n⚠️  data/posts.json existe déjà — rien n\'a été touché.');
    console.error('   Pour l\'écraser (une sauvegarde est faite d\'abord) :');
    console.error('     npm run demo -- --force\n');
    process.exit(1);
  }
  if (fs.existsSync(POSTS_FILE) && FORCE) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backup = path.join(DATA_DIR, `posts.avant-demo-${stamp}.json`);
    fs.copyFileSync(POSTS_FILE, backup);
    console.log(`\n💾 Carnet existant sauvegardé : ${path.relative(ROOT, backup)}`);
    cleanDemoFiles();
  }

  console.log(`\n🚴 Fabrication du carnet de démonstration « ${TRIP.title} »…`);
  const t0 = Date.now();
  const res = await build();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const money = res.posts.reduce((s, p) => s + (p.expenses || []).reduce((n, e) => n + e.amount, 0), 0);
  const nComments = res.posts.reduce((s, p) => s + p.comments.reduce((n, c) => n + 1 + (c.replies || []).length, 0), 0);

  console.log(`
✅ Carnet installé en ${secs} s

   ${res.posts.length} publications  (${res.posts.filter(p => p.type === 'preparation').length} de préparation, ${res.posts.filter(p => p.type !== 'preparation').length} étapes)
   ${Math.round(res.totalKm).toLocaleString('fr-FR')} km à vélo · ${res.ridden} jours roulés sur ${res.spanDays} · ${res.countries} pays
   ${res.photoN} photos${sharp ? ' (JPEG)' : ' (SVG — sharp absent)'} · ${res.posts.filter(p => p.gpx).length} traces GPX
   ${nComments} commentaires · ${money.toFixed(2).replace('.', ',')} € de dépenses · ${res.subs.length} abonnés

   Démarrez : npm start   puis   http://localhost:3000
   Mots de passe par défaut : famille2024 (famille) · velo2024 (admin)

   Pour tout retirer : npm run demo -- --clean
`);
})().catch(err => {
  console.error('\n❌ Échec de la génération :', err.stack || err.message);
  process.exit(1);
});
