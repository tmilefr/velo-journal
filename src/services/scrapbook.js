// ── Éléments « scrapbooking » du livre Word ───────────────
// Tirages photo (cadre blanc + ombre) posés de guingois, rubans adhésifs,
// étoiles. Chaque élément est une image flottante de Word : on peut la
// déplacer, la pivoter, la supprimer ou la remplacer comme on veut.
// Toutes les dimensions sont en DXA (1440 = 1 pouce), sauf mention contraire.
const {
  ImageRun, Paragraph, TextRun, AlignmentType, FrameAnchorType, FrameWrap, HeightRule,
  HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType,
} = require('docx');
let sharp; try { sharp = require('sharp'); } catch(e) { sharp = null; }

const PAPER = '#FBFAF6';
const RENDER_DPI = 200;                 // finesse des tirages (impression)
const PX = d => Math.max(1, Math.round(d * RENDER_DPI / 1440));
const EMU = d => Math.round(d * 635);   // 1 DXA = 635 EMU
const SHADOW = 140;                     // marge d'ombre autour de la carte
const TAPE_COLORS = ['#E07A3A', '#38B2AC', '#E8B93B', '#D97A9B', '#6BA3D6'];

// Tirage reproductible : une même page doit donner le même collage à chaque export
function rng(seed) {
  let s = (Math.abs(Math.floor(seed)) * 2654435761 % 2147483647) || 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const rotate = (x, y, deg) => {
  const a = deg * Math.PI / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};

// Image flottante placée par son centre (cx, cy) sur la page
function floatingImage({ type, data, w, h, cx, cy, angle = 0, z }) {
  return new ImageRun({
    type, data,
    transformation: { width: Math.round(w / 15), height: Math.round(h / 15), rotation: Math.round(angle * 10) / 10 },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: EMU(cx - w / 2) },
      verticalPosition:   { relative: VerticalPositionRelativeFrom.PAGE,   offset: EMU(cy - h / 2) },
      allowOverlap: true, behindDocument: false,
      wrap: { type: TextWrappingType.NONE },
      zIndex: z,
    },
  });
}

// Carte blanche + ombre portée sur fond papier, la photo au milieu. JPEG
// (pas de transparence) : le fond est de la couleur du papier des pages, donc
// invisible tant que les tirages ne se chevauchent pas.
async function polaroidImage(photo, pw, ph, f, bottom) {
  const cw = pw + 2 * f, ch = ph + f + bottom;
  const W = cw + 2 * SHADOW, H = ch + 2 * SHADOW;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX(W)}" height="${PX(H)}">
    <defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${PX(SHADOW * 0.28)}"/></filter></defs>
    <rect width="100%" height="100%" fill="${PAPER}"/>
    <rect x="${PX(SHADOW + 45)}" y="${PX(SHADOW + 75)}" width="${PX(cw)}" height="${PX(ch)}" fill="#1a3a3a" fill-opacity="0.34" filter="url(#b)"/>
    <rect x="${PX(SHADOW)}" y="${PX(SHADOW)}" width="${PX(cw)}" height="${PX(ch)}" fill="#ffffff" stroke="#d5deda" stroke-width="1"/>
  </svg>`;
  const inner = await sharp(photo.data).resize(PX(pw), PX(ph), { fit: 'fill' }).toBuffer();
  const data = await sharp(Buffer.from(svg))
    .composite([{ input: inner, left: PX(SHADOW + f), top: PX(SHADOW + f) }])
    .jpeg({ quality: 86 }).toBuffer();
  return { data, w: W, h: H, cw, ch };
}

// Ruban adhésif (washi tape) translucide aux bords dentelés
async function tapeImage(color) {
  const w = 1500, h = 440, px = PX(w), py = PX(h), z = Math.max(3, Math.round(py / 9));
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push([i % 2 ? z : 0, py * i / 8]);
  const right = [];
  for (let i = 8; i >= 0; i--) right.push([px - (i % 2 ? z : 0), py * i / 8]);
  const poly = pts.concat(right).map(p => p.join(',')).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${py}">
    <polygon points="${poly}" fill="${color}" fill-opacity="0.62"/>
    <polygon points="${poly}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>
    ${[0.25, 0.5, 0.75].map(t => `<rect x="${px * t}" y="0" width="${Math.max(2, px * 0.025)}" height="${py}" fill="#ffffff" fill-opacity="0.18"/>`).join('')}
  </svg>`;
  return { data: await sharp(Buffer.from(svg)).png().toBuffer(), w, h };
}

// Étoile décorative (sans texte : rien ne dépend des polices du serveur)
async function starImage(color) {
  const w = 1100, h = 1100, p = PX(w);
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 ? 0.22 : 0.5) * p, a = -Math.PI / 2 + i * Math.PI / 5;
    pts.push(`${p / 2 + r * Math.cos(a)},${p / 2 + r * Math.sin(a)}`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p}" height="${p}">
    <polygon points="${pts.join(' ')}" fill="${color}" stroke="#ffffff" stroke-width="${Math.round(p * 0.03)}" stroke-linejoin="round"/>
  </svg>`;
  return { data: await sharp(Buffer.from(svg)).png().toBuffer(), w, h };
}

// Étiquette de légende : paragraphe en cadre positionné sur la page, donc
// du vrai texte qu'on retape directement dans Word.
function captionFrame(text, cx, y, width, font) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    frame: {
      type: 'absolute',
      position: { x: Math.max(0, Math.round(cx - width / 2)), y: Math.round(y) },
      width: Math.round(width),
      rule: HeightRule.AUTO,
      anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
      wrap: FrameWrap.NONE,
    },
    children: [new TextRun({ text, font, size: 20, italics: true, color: '5A8080' })],
  });
}

// Pose des tirages dans une zone : une case par photo, chacune de guingois,
// avec ruban adhésif et légende. Renvoie les images flottantes (à glisser
// dans un paragraphe d'ancrage de la page) et les cadres de légende.
async function placePolaroids(photos, area, grid, seed, { maxAngle = 5, font = 'Calibri' } = {}) {
  const [cols, rows] = grid;
  const rand = rng(seed);
  const hasCaption = photos.some(p => p.caption);
  const capH = hasCaption ? 620 : 0;                       // place sous le tirage
  const cellW = area.w / cols, cellH = area.h / rows;
  const runs = [], captions = [];

  for (let i = 0; i < photos.length; i++) {
    const ph = photos[i];
    const r = Math.floor(i / cols), c = i % cols;
    const inRow = Math.min(cols, photos.length - r * cols);
    // Dernière rangée incomplète : on la centre
    const ccx0 = inRow === cols ? area.x + cellW * (c + 0.5)
                                : area.x + area.w / 2 + (c - (inRow - 1) / 2) * cellW;
    const ccy0 = area.y + cellH * (r + 0.5);
    const angle = (photos.length === 1 ? 0.4 : 1) * (rand() - 0.5) * 2 * maxAngle;

    // Plus grand tirage dont l'encombrement incliné tient dans la case
    const aw = cellW - 160 - SHADOW, ah = cellH - 160 - SHADOW - capH;
    const ar = ph.w / ph.h;
    let pw = Math.min(aw, ah * ar), dims;
    for (let k = 0; k < 120; k++) {
      const pH = pw / ar;
      const f = Math.max(130, Math.round(0.05 * Math.min(pw, pH)));
      const bottom = Math.round(f * 2.3);
      const cw = pw + 2 * f, ch = pH + f + bottom;
      const a = Math.abs(angle) * Math.PI / 180;
      const bw = cw * Math.cos(a) + ch * Math.sin(a), bh = cw * Math.sin(a) + ch * Math.cos(a);
      dims = { pw, ph: pH, f, bottom, cw, ch, bw, bh };
      if (bw <= aw && bh <= ah) break;
      pw *= 0.97;
    }
    // Un peu de jeu dans la case : le tirage n'est pas pile au centre
    const slackX = Math.max(0, (cellW - 160 - dims.bw) / 2), slackY = Math.max(0, (cellH - 160 - capH - dims.bh) / 2);
    const cx = ccx0 + (rand() - 0.5) * slackX * 1.2;
    const cy = ccy0 - capH / 2 + (rand() - 0.5) * slackY * 1.2;

    const img = await polaroidImage(ph, Math.round(dims.pw), Math.round(dims.ph), dims.f, dims.bottom);
    // L'image est centrée sur la carte : on la pose par son centre, elle pivote autour.
    runs.push(floatingImage({ type: 'jpg', data: img.data, w: img.w, h: img.h, cx, cy, angle, z: 10 + i }));

    // Ruban : au milieu du bord haut de la carte, de travers
    if (rand() < 0.8) {
      const tape = await tapeImage(TAPE_COLORS[Math.floor(rand() * TAPE_COLORS.length)]);
      const [ox, oy] = rotate(0, -dims.ch / 2 + 40, angle);
      runs.push(floatingImage({ type: 'png', data: tape.data, w: tape.w, h: tape.h,
        cx: cx + ox, cy: cy + oy, angle: angle + (rand() - 0.5) * 22, z: 100 + i }));
    }
    if (ph.caption) {
      const w = Math.min(cellW - 200, Math.max(dims.cw, 3200));
      captions.push(captionFrame(ph.caption, cx, cy + dims.bh / 2 + 70, w, font));
    }
  }
  return { runs, captions };
}

// Décor de page de texte : un ruban sur le titre, une étoile en coin
async function pageDecor(seed, spec) {
  const rand = rng(seed);
  const tape = await tapeImage(TAPE_COLORS[Math.floor(rand() * TAPE_COLORS.length)]);
  const star = await starImage(TAPE_COLORS[Math.floor(rand() * TAPE_COLORS.length)]);
  return [
    floatingImage({ type: 'png', data: tape.data, w: tape.w, h: tape.h, cx: spec.tapeX, cy: spec.tapeY, angle: -4 + rand() * 8, z: 100 }),
    floatingImage({ type: 'png', data: star.data, w: star.w * 0.9, h: star.h * 0.9, cx: spec.starX, cy: spec.starY, angle: 8 + rand() * 14, z: 90 }),
  ];
}

module.exports = { placePolaroids, pageDecor };
