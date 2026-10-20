// ── Livre photo au format Word (.docx), A4 paysage ────────
// Deux pages par étape : le texte sur la première, les photos sur la
// suivante (autant de pages de photos que nécessaire, 6 par page). Les photos
// sont des tirages posés librement sur la page (voir scrapbook.js).
const fs   = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, PageOrientation, BorderStyle,
  Footer, PageNumber,
} = require('docx');
const { PUBLIC_DIR, TRIP_TITLE, TRIP_START, TRIP_END } = require('../config');
const { formatDateShort } = require('../lib/dates');
const { placePolaroids, pageDecor, cleanText } = require('./scrapbook');
let sharp; try { sharp = require('sharp'); } catch(e) { sharp = null; }

// A4 paysage en DXA (1440 = 1 pouce), marges de 1,5 cm
const PAGE_W = 16838, PAGE_H = 11906, MARGIN = 850;
const BOX_W = PAGE_W - 2 * MARGIN;          // zone utile, largeur
const PHOTOS_PER_PAGE = 6;

const INK = '1A3A3A', SOFT = '5A8080', ACCENT = 'E07A3A';

// Du HTML de l'éditeur à des paragraphes de texte (même logique que le livre canvas)
function textOf(html) {
  if (!html) return [];
  const decoded = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
  return decoded.split(/\n{2,}/).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Grille colonnes × lignes selon le nombre de photos de la page
function gridFor(n) {
  if (n <= 1) return [1, 1];
  if (n === 2) return [2, 1];
  if (n <= 4) return [2, 2];
  return [3, 2];
}

// Photo réduite (1600 px max) pour garder un fichier Word raisonnable ;
// renvoie null si le fichier a disparu ou n'est pas lisible.
async function loadPhoto(url) {
  const abs = path.join(PUBLIC_DIR, String(url).replace(/^\/+/, '').replace(/^public\//, ''));
  if (!abs.startsWith(PUBLIC_DIR) || !fs.existsSync(abs)) return null;
  try {
    if (!sharp) return null;
    const { data, info } = await sharp(abs).rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
    return { data, w: info.width, h: info.height };
  } catch(e) {
    return null;
  }
}

function text(t, opts = {}) {
  return new TextRun({ text: cleanText(t), font: 'Calibri', color: INK, ...opts });
}

// TRIP_START / TRIP_END sont des villes (« Paris → Rome »), pas des dates :
// les dates du voyage viennent de la première et de la dernière étape.
// Trois tirages éparpillés en bas de page, tirés au début, au milieu et à la fin.
async function coverPage(stages, photosByStage) {
  const day = s => { try { return s && s.date ? formatDateShort(s.date) : ''; } catch(e) { return ''; } };
  const d1 = day(stages[0]), d2 = day(stages[stages.length - 1]);
  const route = [TRIP_START, TRIP_END].filter(Boolean).join('  →  ');
  const km = stages.reduce((t, s) => t + (s.km || 0), 0);
  const dplus = stages.reduce((t, s) => t + (s.dplus || 0), 0);
  const line = (t, size, before, extra = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before },
    children: [text(t, { size, color: SOFT, ...extra })] });

  const withPhotos = photosByStage.map((p, i) => ({ p, i })).filter(x => x.p.length);
  const picks = [0, Math.floor((withPhotos.length - 1) / 2), withPhotos.length - 1]
    .filter((v, i, arr) => withPhotos.length && arr.indexOf(v) === i)
    .map(i => ({ ...withPhotos[i].p[0], caption: '' }));
  const anchorRuns = [];
  if (picks.length) {
    const { runs } = await placePolaroids(picks, { x: MARGIN, y: 7000, w: BOX_W, h: PAGE_H - MARGIN - 7000 - 100 },
      [picks.length, 1], 7, { maxAngle: 7 });
    anchorRuns.push(...runs);
  }
  const out = [
    new Paragraph({ spacing: { before: 1400 }, alignment: AlignmentType.CENTER,
      children: [text(String(TRIP_TITLE || 'Carnet de voyage'), { size: 96, bold: true }), ...anchorRuns] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
      border: { bottom: { style: BorderStyle.DASHED, size: 12, color: ACCENT, space: 8 } },
      children: [] }),
  ];
  if (route) out.push(line(route, 44, 400, { color: INK }));
  if (d1 && d2) out.push(line(d1 === d2 ? d1 : `${d1}  →  ${d2}`, 32, 200));
  if (stages.length) {
    out.push(line(`${stages.length} étapes   ·   ${Math.round(km).toLocaleString('fr-FR')} km   ·   ${dplus.toLocaleString('fr-FR')} m D+`, 28, 300));
  }
  return out;
}

function statsLine(s) {
  const parts = [];
  if (s.km) parts.push(`${s.km.toLocaleString('fr-FR')} km à vélo`);
  if (s.dplus) parts.push(`${s.dplus.toLocaleString('fr-FR')} m de dénivelé`);
  if (s.trainKm) parts.push(`${s.trainKm.toLocaleString('fr-FR')} km en train`);
  return parts.join('   ·   ');
}

// Page de texte d'une étape : ruban sur le titre, étoile dans le coin
async function textPage(s, seed) {
  const decor = await pageDecor(seed, { tapeX: MARGIN + 1700, tapeY: MARGIN - 40, starX: PAGE_W - MARGIN - 700, starY: MARGIN + 650 });
  const kids = [
    new Paragraph({ pageBreakBefore: true, spacing: { before: 420, after: 60 },
      children: [text(s.title || 'Étape', { size: 56, bold: true }), ...decor] }),
  ];
  const meta = [s.date ? formatDateShort(s.date) : '', s.location].filter(Boolean).join('  —  ');
  if (meta) kids.push(new Paragraph({ spacing: { after: 60 }, children: [text(meta, { size: 28, color: SOFT })] }));
  const stats = statsLine(s);
  kids.push(new Paragraph({
    spacing: { after: 280 },
    border: { bottom: { style: BorderStyle.DASHED, size: 10, color: ACCENT, space: 6 } },
    children: stats ? [text(stats, { size: 26, bold: true, color: ACCENT })] : [],
  }));
  const paras = textOf(s.body);
  if (!paras.length) {
    kids.push(new Paragraph({ children: [text('Pas de récit pour cette étape.', { size: 26, italics: true, color: SOFT })] }));
  }
  for (const t of paras) {
    kids.push(new Paragraph({ spacing: { after: 160, line: 340 }, children: [text(t, { size: 26 })] }));
  }
  return kids;
}

// Page de photos : des tirages posés de guingois (images flottantes) avec
// leurs rubans adhésifs et leurs légendes. Le premier paragraphe porte les
// images ; les légendes sont des cadres de texte positionnés sur la page.
async function photoPage(photos, caption, seed) {
  const top = MARGIN + 500;
  const grid = photos.length <= 1 ? [1, 1] : photos.length === 2 ? [2, 1] : photos.length <= 4 ? [2, 2] : [3, 2];
  const { runs, captions } = await placePolaroids(photos,
    { x: MARGIN, y: top, w: BOX_W, h: PAGE_H - MARGIN - 300 - top }, grid, seed);
  return [
    new Paragraph({ pageBreakBefore: true, spacing: { after: 0 }, children: [text(caption, { size: 22, color: SOFT }), ...runs] }),
    ...captions,
    // Les cadres de légende s'accrochent au paragraphe qui les suit : ce paragraphe
    // minuscule les garde sur cette page, avant le saut de page suivant.
    new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' }, children: [new TextRun({ text: '', size: 2 })] }),
  ];
}

// stages : même forme que celle de la route /livre ; maxPhotos plafonne le
// nombre de photos par étape.
async function buildLivreDocx(stages, { maxPhotos = 99 } = {}) {
  // Photos de chaque étape, chargées une fois (la couverture en réutilise)
  const loadedByStage = [];
  for (const s of stages) {
    const urls = (s.photos || []).slice(0, maxPhotos);
    const all = await Promise.all(urls.map(loadPhoto));
    loadedByStage.push(all
      .map((p, i) => p && { ...p, caption: String((s.captions || [])[i] || '').trim() })
      .filter(Boolean));
  }

  const kids = [...await coverPage(stages, loadedByStage)];
  for (let n = 0; n < stages.length; n++) {
    const s = stages[n], loaded = loadedByStage[n];
    kids.push(...await textPage(s, n + 1));
    for (let i = 0; i < loaded.length; i += PHOTOS_PER_PAGE) {
      const caption = [s.title, s.date ? formatDateShort(s.date) : ''].filter(Boolean).join(' — ');
      kids.push(...await photoPage(loaded.slice(i, i + PHOTOS_PER_PAGE), caption, (n + 1) * 31 + i));
    }
  }

  const doc = new Document({
    title: String(TRIP_TITLE || 'Livre photo'),
    background: { color: 'FBFAF6' },
    sections: [{
      properties: { page: {
        size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
        margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 20, color: SOFT })] })] }) },
      children: kids,
    }],
  });
  return Packer.toBuffer(doc);
}

module.exports = { buildLivreDocx };
