// ── Livre photo au format Word (.docx), A4 paysage ────────
// Deux pages par étape : le texte sur la première, les photos sur la
// suivante (autant de pages de photos que nécessaire, 6 par page).
const fs   = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, PageOrientation, PageBreak, WidthType, BorderStyle, VerticalAlign,
  Footer, PageNumber,
} = require('docx');
const { PUBLIC_DIR, TRIP_TITLE, TRIP_START, TRIP_END } = require('../config');
const { formatDateShort } = require('../lib/dates');
let sharp; try { sharp = require('sharp'); } catch(e) { sharp = null; }

// A4 paysage en DXA (1440 = 1 pouce), marges de 1,5 cm
const PAGE_W = 16838, PAGE_H = 11906, MARGIN = 850;
const BOX_W = PAGE_W - 2 * MARGIN;          // zone utile, largeur
const BOX_H = PAGE_H - 2 * MARGIN - 500;    // zone utile, hauteur (pied de page déduit)
const PX_PER_DXA = 96 / 1440;               // les images se règlent en pixels à 96 dpi
const PHOTOS_PER_PAGE = 6;

const INK = '1A3A3A', SOFT = '5A8080', ACCENT = 'E07A3A';
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

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
  return new TextRun({ text: t, font: 'Calibri', color: INK, ...opts });
}

// TRIP_START / TRIP_END sont des villes (« Paris → Rome »), pas des dates :
// les dates du voyage viennent de la première et de la dernière étape.
function coverPage(stages) {
  const day = s => { try { return s && s.date ? formatDateShort(s.date) : ''; } catch(e) { return ''; } };
  const d1 = day(stages[0]), d2 = day(stages[stages.length - 1]);
  const route = [TRIP_START, TRIP_END].filter(Boolean).join('  →  ');
  const km = stages.reduce((t, s) => t + (s.km || 0), 0);
  const dplus = stages.reduce((t, s) => t + (s.dplus || 0), 0);
  const line = (t, size, before, extra = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before },
    children: [text(t, { size, color: SOFT, ...extra })] });
  const out = [
    new Paragraph({ spacing: { before: 2600 }, alignment: AlignmentType.CENTER,
      children: [text(String(TRIP_TITLE || 'Carnet de voyage'), { size: 96, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } },
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

// Page de texte d'une étape
function textPage(s) {
  const kids = [
    new Paragraph({ spacing: { after: 60 }, children: [text(s.title || 'Étape', { size: 56, bold: true })] }),
  ];
  const meta = [s.date ? formatDateShort(s.date) : '', s.location].filter(Boolean).join('  —  ');
  if (meta) kids.push(new Paragraph({ spacing: { after: 60 }, children: [text(meta, { size: 28, color: SOFT })] }));
  const stats = statsLine(s);
  kids.push(new Paragraph({
    spacing: { after: 280 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 6 } },
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

// Page(s) de photos : une table de cellules à hauteur fixe, chaque photo
// tenant dans sa cellule sans être rognée.
function photoPage(photos, caption) {
  const [cols, rows] = gridFor(photos.length);
  const capH = 400;
  const cellW = Math.floor(BOX_W / cols);
  const cellH = Math.floor((BOX_H - capH) / rows);
  const pad = 80;
  // Place réservée sous chaque photo pour sa légende (deux lignes au plus)
  const legH = photos.some(p => p.caption) ? 460 : 0;
  const maxWpx = Math.floor((cellW - 2 * pad) * PX_PER_DXA);
  const maxHpx = Math.floor((cellH - 2 * pad - legH) * PX_PER_DXA);

  const trs = [];
  for (let r = 0; r < rows; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const ph = photos[r * cols + c];
      let children = [new Paragraph({ children: [] })];
      if (ph) {
        const k = Math.min(maxWpx / ph.w, maxHpx / ph.h);
        children = [new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new ImageRun({ type: 'jpg', data: ph.data,
            transformation: { width: Math.round(ph.w * k), height: Math.round(ph.h * k) } }),
        ] })];
        if (ph.caption) {
          children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 },
            children: [text(ph.caption, { size: 20, italics: true, color: SOFT })] }));
        }
      }
      cells.push(new TableCell({
        width: { size: cellW, type: WidthType.DXA }, borders: NO_BORDERS,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: pad, bottom: pad, left: pad, right: pad },
        children,
      }));
    }
    trs.push(new TableRow({ height: { value: cellH, rule: 'exact' }, cantSplit: true, children: cells }));
  }
  return [
    new Paragraph({ spacing: { after: 0 }, children: [text(caption, { size: 22, color: SOFT })] }),
    new Table({ width: { size: cellW * cols, type: WidthType.DXA },
      columnWidths: Array(cols).fill(cellW), borders: { ...NO_BORDERS, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
      rows: trs }),
  ];
}

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

// stages : même forme que celle de la route /livre ; maxPhotos plafonne le
// nombre de photos par étape.
async function buildLivreDocx(stages, { maxPhotos = 99 } = {}) {
  const kids = [...coverPage(stages)];
  for (const s of stages) {
    kids.push(pageBreak(), ...textPage(s));
    const loaded = [];
    const urls = (s.photos || []).slice(0, maxPhotos);
    for (let i = 0; i < urls.length; i++) {
      const p = await loadPhoto(urls[i]);
      if (p) loaded.push({ ...p, caption: String((s.captions || [])[i] || '').trim() });
    }
    for (let i = 0; i < loaded.length; i += PHOTOS_PER_PAGE) {
      const caption = [s.title, s.date ? formatDateShort(s.date) : ''].filter(Boolean).join(' — ');
      kids.push(pageBreak(), ...photoPage(loaded.slice(i, i + PHOTOS_PER_PAGE), caption));
    }
  }

  const doc = new Document({
    title: String(TRIP_TITLE || 'Livre photo'),
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
