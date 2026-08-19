// ── Diplôme : les chiffres d'un compagnon de route, en A4 à encadrer ──
// Quelqu'un a rejoint le voyage en route : cette page recalcule ses kilomètres
// à elle depuis sa première étape à vélo, et les dessine sur un diplôme —
// grosses pastilles de chiffres, comparaisons à hauteur d'enfant, badges
// gagnés et frise des journées.
//
// Comme l'affiche et le livre, le diplôme est peint sur un canvas plutôt que
// mis en page en HTML : la même image sert d'aperçu, d'impression et de PNG,
// et rien ne peut déborder d'un cadre puisque chaque bloc reçoit sa place.
const { TRIP_TITLE } = require('../config');
const { esc } = require('../lib/html');
const { formatDateShort } = require('../lib/dates');
const { CSS, renderHeader } = require('./layout');
const { CANVAS_KIT } = require('./canvasKit');

const fr0 = n => Math.round(n).toLocaleString('fr-FR');
const fr1 = n => (Math.round(n * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// Une comparaison rigolote n'a pas besoin de décimales passé la dizaine.
const frFact = n => (n >= 10 ? fr0(n) : fr1(n));
const plural = (n, s = 's') => (n > 1 ? s : '');

// Trois habillages au choix — le diplôme n'est pas une facture. `c1` à `c4`
// sont les couleurs vives, les autres les teintes de papier et de trait.
const THEMES = {
  arc: {
    label: 'Arc-en-ciel',
    c1: '#ff5d8f', c2: '#ffa62b', c3: '#3ec9b0', c4: '#6c8cff',
    paper: '#fffdf7', ink: '#3a2a4d', soft: '#7a6a8d', line: '#c0b2cc',
    halo1: 'rgba(255,93,143,.16)', halo3: 'rgba(62,201,176,.16)',
    edge3: '#b3e6da', edge4: '#ccd6ff',
  },
  ocean: {
    label: 'Océan',
    c1: '#2a7a7a', c2: '#4aabab', c3: '#3a9e72', c4: '#e07a3a',
    paper: '#fbfffe', ink: '#1a3a3a', soft: '#5a8080', line: '#a8c4c4',
    halo1: 'rgba(42,122,122,.14)', halo3: 'rgba(58,158,114,.14)',
    edge3: '#b6dfcb', edge4: '#f4d4bd',
  },
  sunset: {
    label: 'Coucher de soleil',
    c1: '#e8455f', c2: '#ff8a3d', c3: '#ffc93c', c4: '#9b5de5',
    paper: '#fffaf3', ink: '#4a2130', soft: '#8d6070', line: '#d3b0b8',
    halo1: 'rgba(232,69,95,.14)', halo3: 'rgba(255,201,60,.20)',
    edge3: '#ffe6a8', edge4: '#dfc6f5',
  },
};

// ══════════════════════════════════════════════════════════
//  Les données du diplôme, prêtes à peindre
// ══════════════════════════════════════════════════════════
// Tout est mis en forme ici — nombres à la française, phrases, libellés — pour
// que le dessin sur canvas n'ait plus qu'à poser du texte déjà écrit.
function sheetData(d, { name, theme, showFrise, signature }) {
  const s = d.stats;

  const medals = [
    { icon: '🚴', num: fr0(s.km),       unit: 'km',      lbl: 'parcourus à vélo' },
    { icon: '🗓️', num: fr0(s.nDays),    unit: `jour${plural(s.nDays)}`,
      lbl: s.restDays > 0 ? `de vélo, ${s.restDays} de repos` : 'de vélo, sans une pause' },
    { icon: '📊', num: fr1(s.avgKm),    unit: 'km/jour', lbl: 'de moyenne' },
    { icon: '⛰️', num: fr0(s.dplus),    unit: 'm D+',    lbl: 'de montée cumulée' },
    { icon: '🏔️', num: fr0(s.avgDplus), unit: 'm/jour',  lbl: 'de montée en moyenne' },
  ];

  const records = [
    s.maxKmDay ? {
      icon: '🥇', lbl: 'Plus longue journée', val: `${fr1(s.maxKm)} km`,
      sub: `${s.maxKmDay.title || s.maxKmDay.location || ''} · ${formatDateShort(s.maxKmDay.date)}`,
    } : null,
    s.maxDplus > 0 && s.maxDplusDay ? {
      icon: '🚀', lbl: 'Plus grosse montée', val: `${fr0(s.maxDplus)} m D+`,
      sub: `${s.maxDplusDay.title || s.maxDplusDay.location || ''} · ${formatDateShort(s.maxDplusDay.date)}`,
    } : null,
    d.countries.length ? {
      icon: '🌍', lbl: `Pays traversé${plural(d.countries.length)}`,
      val: d.countries.map(c => c.flag).join(' '),
      sub: d.countries.map(c => `${c.country} (${fr0(c.km)} km)`).join(' · '),
    } : null,
    d.train.count > 0 ? {
      icon: '🚆', lbl: `Aussi, ${d.train.count} trajet${plural(d.train.count)} en train`,
      val: `${fr0(d.train.km)} km`,
      sub: `soit ${fr0(d.totals.totalKm)} km de voyage en tout, vélo et rail réunis`,
    } : null,
    {
      icon: '🗺️', lbl: 'Du guidon au guidon', val: `${s.spanDays} jour${plural(s.spanDays)}`,
      sub: `de la première à la dernière étape${s.restDays > 0 ? `, dont ${s.restDays} de repos` : ', sans une pause'}`,
    },
  ].filter(Boolean);

  const facts = d.facts.slice(0, 4).map(f => ({ icon: f.icon, num: frFact(f.count), lbl: f.label }));

  // La phrase du diplôme, en morceaux : les lieux et les dates s'écrivent en
  // couleur, le reste au fil du texte.
  const story = d.join
    ? [
        { t: "qui a rejoint l'aventure à " }, { t: d.joinPlace, b: true },
        { t: ` le ${formatDateShort(d.join.date)}, et qui n'a plus lâché son guidon jusqu'à ` },
        { t: d.endPlace, b: true }, { t: `, le ${formatDateShort(d.last.date)}.` },
      ]
    : [
        { t: 'qui a pris la route dès le premier jour, à ' }, { t: d.startPlace, b: true },
        { t: ', et qui a pédalé jusqu\'à ' }, { t: d.endPlace, b: true },
        { t: `, le ${formatDateShort(d.last.date)}.` },
      ];

  const maxDayKm = d.days.reduce((m, x) => Math.max(m, x.km), 1);

  return {
    theme: THEMES[theme] || THEMES.arc,
    kicker: TRIP_TITLE,
    ribbon: 'Grand diplôme de la route',
    title:  'Diplôme de Grande Cycliste',
    award:  'fièrement décerné à',
    name, story,
    medals, records, facts,
    badges: d.badges,
    frise: showFrise && d.days.length ? {
      lbl:  `🚲 ${d.days.length} journée${plural(d.days.length)} de vélo`,
      sub:  `une barre par jour · la plus haute : ${fr1(maxDayKm)} km`,
      bars: d.days.map(x => Math.max(0.06, x.km / maxDayKm)),
    } : null,
    signature,
    madeOn: `Fait le ${formatDateShort(new Date().toISOString())}`,
    seal:   { num: `${fr0(s.km)} km`, sub: 'au compteur' },
  };
}

// ══════════════════════════════════════════════════════════
//  Le dessin (navigateur)
// ══════════════════════════════════════════════════════════
// Le diplôme est peint dans un repère de 1122,5 × 794 unités — l'A4 paysage —
// puis mis à l'échelle de la toile demandée : l'aperçu, l'impression et le PNG
// 300 dpi sont la même image, à des tailles différentes.
const DRAW_SCRIPT = `
      var SHEET = { w:1122.5, h:794 };
      var BORDER = 26.5, FRAME = 34, PADX = 34, PADY = 22.7, GAP = 11.3;
      // Pas de police d'emoji dans cette pile : elle rendrait aussi les chiffres
      // et les espaces, en glyphes larges que fillStyle ne colore pas. Le
      // navigateur retombe de lui-même sur celle du système pour les emoji.
      var FONTS = ", 'DM Sans', sans-serif";

      function drawDiploma(cv, W){
        var H = Math.round(W * SHEET.h / SHEET.w);
        cv.width = Math.round(W); cv.height = H;
        var g = cv.getContext('2d');
        var S = W / SHEET.w;                       // unités de dessin → pixels
        var T = DATA.theme;

        // Toutes les mesures s'écrivent en unités ; u() les met à l'échelle.
        function u(v){ return v * S; }
        function font(size, weight, family){
          return (weight || 400) + ' ' + u(size).toFixed(2) + 'px ' + (family || "'Fredoka'") + FONTS;
        }
        function grad(x0, y0, x1, y1, stops){
          var lg = g.createLinearGradient(x0, y0, x1, y1);
          stops.forEach(function(c, i){ lg.addColorStop(i / (stops.length - 1), c); });
          return lg;
        }
        // Texte simple ; renvoie la largeur dessinée.
        function text(str, x, y, o){
          o = o || {};
          g.font = font(o.size || 12, o.weight, o.family);
          g.fillStyle = o.color || T.ink;
          g.textAlign = o.align || 'left';
          g.textBaseline = o.baseline || 'alphabetic';
          if('letterSpacing' in g) g.letterSpacing = o.spacing ? u(o.spacing).toFixed(2) + 'px' : '0px';
          var s = o.max ? fit(g, str, u(o.max)) : String(str == null ? '' : str);
          g.fillText(s, x, y);
          var w = g.measureText(s).width;
          if('letterSpacing' in g) g.letterSpacing = '0px';
          return w;
        }
        function measure(str, o){
          o = o || {};
          g.font = font(o.size || 12, o.weight, o.family);
          if('letterSpacing' in g) g.letterSpacing = o.spacing ? u(o.spacing).toFixed(2) + 'px' : '0px';
          var w = g.measureText(String(str == null ? '' : str)).width;
          if('letterSpacing' in g) g.letterSpacing = '0px';
          return w;
        }
        // Texte en dégradé : le dégradé court sur la largeur du texte.
        function gradText(str, cx, y, o){
          var w = measure(str, o);
          g.fillStyle = grad(cx - w/2, y, cx + w/2, y, o.stops);
          g.font = font(o.size, o.weight, o.family);
          g.textAlign = 'center'; g.textBaseline = o.baseline || 'alphabetic';
          g.fillText(str, cx, y);
        }
        function card(x, y, w, h, edge){
          roundRect(g, x, y, w, h, u(18.9));
          g.fillStyle = '#ffffff'; g.fill();
          g.lineWidth = u(2); g.strokeStyle = edge; g.stroke();
        }

        // ── Le papier, son cadre en dégradé, son liséré pointillé ──
        g.fillStyle = grad(0, 0, W, H, [T.c1, T.c2, T.c3, T.c4, T.c1]);
        g.fillRect(0, 0, W, H);
        roundRect(g, u(BORDER), u(BORDER), W - u(BORDER*2), H - u(BORDER*2), u(10));
        g.save(); g.clip();
        g.fillStyle = T.paper; g.fillRect(0, 0, W, H);
        [[0.12, 0.08, T.halo3], [0.88, 0.92, T.halo1]].forEach(function(h){
          var r = g.createRadialGradient(W*h[0], H*h[1], 0, W*h[0], H*h[1], W*0.42);
          r.addColorStop(0, h[2]); r.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = r; g.fillRect(0, 0, W, H);
        });
        g.restore();

        roundRect(g, u(FRAME), u(FRAME), W - u(FRAME*2), H - u(FRAME*2), u(15));
        g.setLineDash([u(9), u(7)]); g.lineWidth = u(2); g.strokeStyle = T.line; g.stroke();
        g.setLineDash([]);

        var L = u(FRAME + PADX), R = W - u(FRAME + PADX), CW = R - L, cx = (L + R) / 2;
        var top = u(FRAME + PADY), bot = H - u(FRAME + PADY);

        [['🚲', L - u(20), top - u(4)], ['⛰️', R + u(20), top - u(4)],
         ['🌍', L - u(20), bot + u(16)], ['⭐', R + u(20), bot + u(16)]].forEach(function(c){
          g.globalAlpha = 0.55;
          text(c[0], c[1], c[2], { size: 20, align: 'center' });
          g.globalAlpha = 1;
        });

        // ── L'en-tête : titre, prénom, phrase ──────────────
        var y = top;
        text(DATA.kicker.toUpperCase(), cx, y + u(11), { size: 10.5, weight: 600, color: T.soft, align: 'center', spacing: 1.7, max: CW });
        y += u(18);

        var rw = measure(DATA.ribbon.toUpperCase(), { size: 11, weight: 600, spacing: 1.1 }) + u(32);
        roundRect(g, cx - rw/2, y, rw, u(21), u(10.5));
        g.fillStyle = grad(cx - rw/2, y, cx + rw/2, y + u(21), [T.c1, T.c2]); g.fill();
        text(DATA.ribbon.toUpperCase(), cx, y + u(14.5), { size: 11, weight: 600, color: '#fff', align: 'center', spacing: 1.1 });
        y += u(21 + 6);

        gradText(DATA.title, cx, y + u(25), { size: 28, weight: 700, stops: [T.c1, T.c4, T.c3] });
        y += u(34);
        text(DATA.award, cx, y + u(11), { size: 12, weight: 500, color: T.soft, align: 'center' });
        y += u(16);
        text(DATA.name, cx, y + u(40), { size: 48, weight: 700, family: "'Caveat'", color: T.c1, align: 'center', max: CW });
        y += u(52);
        y += drawStory(y) + u(4);

        // La phrase mêle du texte courant et des lieux en couleur : on la
        // découpe en mots, chacun gardant son style, puis on centre chaque ligne.
        function drawStory(y0){
          var words = [];
          DATA.story.forEach(function(seg){
            String(seg.t).split(/(\\s+)/).forEach(function(w){
              if(!w.trim()) return;
              words.push({ t: w, b: !!seg.b });
            });
          });
          // Une virgule ou un point suit le mot précédent sans espace — ils se
          // retrouvent séparés parce que le texte a été découpé segment par
          // segment pour colorer les lieux.
          function glued(w){ return /^[,.;:!?…)]/.test(w.t); }
          var sp = measure(' ', { size: 12.5 });
          var lines = [], cur = [], curW = 0;
          words.forEach(function(w){
            var ww = measure(w.t, { size: 12.5, weight: w.b ? 600 : 400 });
            var lead = (cur.length && !glued(w)) ? sp : 0;
            if(cur.length && curW + lead + ww > CW){ lines.push({ words: cur, w: curW }); cur = []; curW = 0; lead = 0; }
            curW += lead + ww;
            cur.push(w);
          });
          if(cur.length) lines.push({ words: cur, w: curW });
          lines.forEach(function(ln, i){
            var x = cx - ln.w/2, yy = y0 + u(13 + i*18);
            ln.words.forEach(function(w, j){
              if(j && !glued(w)) x += sp;
              x += text(w.t, x, yy, { size: 12.5, weight: w.b ? 600 : 400, color: w.b ? T.c1 : T.ink });
            });
          });
          return u(lines.length * 18);
        }

        // ── Ce qu'il reste à répartir sous l'en-tête ───────
        var badgesH = DATA.badges.length ? u(35) : 0;
        var friseH  = DATA.frise ? u(61) : 0;
        var footH   = u(76);
        var medalsH = u(105);
        var blocks  = 1 + (badgesH ? 1 : 0) + (friseH ? 1 : 0) + 2; // médailles, colonnes, badges, frise, pied
        var colsH   = bot - y - medalsH - badgesH - friseH - footH - GAP*S*blocks;

        drawMedals(y, medalsH); y += medalsH + u(GAP);
        drawCols(y, colsH);     y += colsH + u(GAP);
        if(badgesH){ drawBadges(y, badgesH); y += badgesH + u(GAP); }
        if(friseH){  drawFrise(y, friseH);   y += friseH + u(GAP); }
        drawFoot(y, footH);

        // ── Les cinq grands chiffres ───────────────────────
        function drawMedals(y0, h){
          var n = DATA.medals.length, gp = u(13.2), w = (CW - gp*(n-1)) / n;
          DATA.medals.forEach(function(m, i){
            var x = L + i*(w + gp), mx = x + w/2;
            card(x, y0, w, h, T.edge3);
            text(m.icon, mx, y0 + u(26), { size: 19, align: 'center' });
            gradText(m.num, mx, y0 + u(56), { size: 25, weight: 700, stops: [T.c1, T.c4] });
            text(m.unit, mx, y0 + u(73), { size: 12, weight: 600, align: 'center', max: w - u(10) });
            text(m.lbl,  mx, y0 + u(89), { size: 10, color: T.soft, align: 'center', max: w - u(8) });
          });
        }

        // ── Records et comparaisons, côte à côte ───────────
        // Les lignes se partagent la hauteur disponible : quoi qu'il arrive,
        // elles tiennent dans la carte. S'il n'y a pas la place de les écrire
        // lisiblement, on en retire une plutôt que de les tasser.
        function rowsFor(list, h, minStep, maxRows){
          var pad = u(15), titleH = u(21);
          var n = Math.min(list.length, maxRows);
          while(n > 1 && (h - pad - titleH) / n < minStep) n--;
          return { n: n, step: (h - pad - titleH) / n, y0: titleH + u(7.5) };
        }
        function drawCols(y0, h){
          var gp = u(15.1), lw = (CW - gp) * 1.15 / 2.15, rw2 = CW - gp - lw;

          card(L, y0, lw, h, T.edge4);
          text('🏅 Ses records', L + u(15), y0 + u(20), { size: 12, weight: 700, color: T.c4, max: lw - u(30) });
          var rec = rowsFor(DATA.records, h, u(26), 5);
          DATA.records.slice(0, rec.n).forEach(function(r, i){
            var ry = y0 + rec.y0 + rec.step*i + rec.step/2;
            var vx = L + lw - u(14);
            text(r.icon, L + u(24), ry + u(5), { size: 17, align: 'center' });
            var vw = text(r.val, vx, ry - u(1), { size: 15, weight: 700, color: T.c1, align: 'right', max: lw*0.42 });
            var tw = lw - u(38 + 22) - vw;
            text(r.lbl, L + u(38), ry - u(1), { size: 11, weight: 600, max: tw });
            text(r.sub, L + u(38), ry + u(12), { size: 9, color: T.soft, max: tw + u(10) });
          });

          var X = L + lw + gp;
          card(X, y0, rw2, h, T.edge4);
          text('🤯 Autrement dit…', X + u(15), y0 + u(20), { size: 12, weight: 700, color: T.c4, max: rw2 - u(30) });
          var fac = rowsFor(DATA.facts, h, u(24), 4);
          DATA.facts.slice(0, fac.n).forEach(function(f, i){
            var fy = y0 + fac.y0 + fac.step*i + fac.step/2 + u(4);
            text(f.icon, X + u(22), fy, { size: 15, align: 'center' });
            var nw = text(f.num, X + u(36), fy, { size: 19, weight: 700, color: T.c2 });
            text(f.lbl, X + u(42) + nw, fy, { size: 10, max: rw2 - u(58) - nw });
          });
        }

        // ── Les badges gagnés ──────────────────────────────
        function drawBadges(y0, h){
          var pills = DATA.badges.map(function(b){
            return { txt: b.name, icon: b.icon, w: 0 };
          });
          var size = 11.5, padX = 15.1, gp = u(9.4), total;
          // Tout doit tenir sur une ligne : on resserre, puis on renonce aux
          // derniers badges si vraiment ils ne rentrent pas.
          for(var pass = 0; pass < 12; pass++){
            total = 0;
            pills.forEach(function(p){
              p.w = measure(p.icon, { size: size + 2.5 }) + u(5) + measure(p.txt, { size: size, weight: 600 }) + u(padX*2);
              total += p.w;
            });
            total += gp * (pills.length - 1);
            if(total <= CW) break;
            if(size > 9){ size -= 0.5; padX -= 0.8; } else { pills.pop(); }
          }
          var x = cx - total/2, ph = u(26), py = y0 + (h - ph)/2;
          pills.forEach(function(p, i){
            var stops = [[T.c1,T.c2],[T.c2,T.c3],[T.c3,T.c4],[T.c4,T.c1]][i % 4];
            roundRect(g, x, py, p.w, ph, ph/2);
            g.fillStyle = grad(x, py, x + p.w, py + ph, stops); g.fill();
            var ix = x + u(padX);
            ix += text(p.icon, ix, py + ph/2 + u(5), { size: size + 2.5, color: '#fff' }) + u(5);
            text(p.txt, ix, py + ph/2 + u(4), { size: size, weight: 600, color: '#fff' });
            x += p.w + gp;
          });
        }

        // ── La frise des journées de vélo ──────────────────
        function drawFrise(y0, h){
          card(L, y0, CW, h, T.edge3);
          text(DATA.frise.lbl, L + u(15), y0 + u(22), { size: 10.5, weight: 700, max: u(195) });
          text(DATA.frise.sub, L + u(15), y0 + u(37), { size: 9.5, color: T.soft, max: u(195) });
          var bx = L + u(225), bw = CW - u(225 + 15);
          var n = DATA.frise.bars.length, gp = u(n > 60 ? 1 : 2);
          var w = Math.min(u(26.5), (bw - gp*(n-1)) / n);
          var span = n*w + gp*(n-1), x0 = bx + (bw - span)/2;
          var base = y0 + h - u(11), hMax = u(41.6);
          DATA.frise.bars.forEach(function(v, i){
            var bh = Math.max(u(3), v*hMax), x = x0 + i*(w + gp);
            roundRect(g, x, base - bh, w, bh, Math.min(u(3), w/2));
            g.fillStyle = grad(x, base - bh, x, base, [T.c2, T.c1]); g.fill();
          });
        }

        // ── Signatures et sceau ────────────────────────────
        function drawFoot(y0, h){
          var r = u(38), cy = y0 + h/2;
          var sideW = (CW - r*2 - u(50)) / 2;
          [[L + sideW/2, DATA.signature], [R - sideW/2, DATA.madeOn]].forEach(function(sg){
            g.setLineDash([u(1.5), u(4)]); g.lineWidth = u(1.5); g.strokeStyle = T.soft;
            g.beginPath(); g.moveTo(sg[0] - sideW/2, cy + u(2)); g.lineTo(sg[0] + sideW/2, cy + u(2)); g.stroke();
            g.setLineDash([]);
            text(sg[1], sg[0], cy + u(18), { size: 9.5, color: T.soft, align: 'center', max: sideW });
          });
          g.save();
          g.translate(cx, cy); g.rotate(-8 * Math.PI/180);
          g.beginPath(); g.arc(0, 0, r, 0, Math.PI*2);
          g.fillStyle = grad(-r, -r, r, r, [T.c1, T.c2]); g.fill();
          g.beginPath(); g.arc(0, 0, r - u(6), 0, Math.PI*2);
          g.setLineDash([u(4), u(3)]); g.lineWidth = u(1.5); g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();
          g.setLineDash([]);
          text('🏅', 0, -u(7), { size: 15, align: 'center', color: '#fff' });
          var numSize = 12;
          while(numSize > 8 && measure(DATA.seal.num, { size: numSize, weight: 700 }) > r*1.45) numSize -= 0.5;
          text(DATA.seal.num, 0, u(9), { size: numSize, weight: 700, color: '#fff', align: 'center' });
          text(DATA.seal.sub, 0, u(20), { size: 7.5, color: 'rgba(255,255,255,.92)', align: 'center' });
          g.restore();
        }
        return cv;
      }`;

// ══════════════════════════════════════════════════════════
//  La page : réglages, aperçu, impression, PNG
// ══════════════════════════════════════════════════════════

function renderDiplome(data, opts = {}, isStrictAdmin = false) {
  const name      = opts.name || 'Margot';
  const theme     = THEMES[opts.theme] ? opts.theme : 'arc';
  const showFrise = opts.showFrise !== false;
  const place     = opts.place || '';
  const signature = opts.signature || 'Maman et Papa';

  const empty = !data || data.stats.nDays === 0;
  const payload = empty ? null : sheetData(data, { name, theme, showFrise, signature });
  const dataJson = JSON.stringify(payload).replace(/</g, '\\u003c');

  const stageOptions = (data ? data.stages : []).map(p => {
    const lbl = `${formatDateShort(p.date)} — ${p.title || p.location || 'étape'}`;
    return `<option value="${esc(p.id)}"${data.start && p.id === data.start.id ? ' selected' : ''}>${esc(lbl)}</option>`;
  }).join('');

  const themeOptions = Object.entries(THEMES)
    .map(([k, t]) => `<option value="${k}"${k === theme ? ' selected' : ''}>${t.label}</option>`).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Diplôme — ${TRIP_TITLE}</title>
    <!-- Le diplôme a ses propres fontes : une ronde pour les titres, une
         manuscrite pour le prénom. Les @import passent avant toute règle. -->
    <style>@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Fredoka:wght@400;500;600;700&display=swap');
${CSS}
      .dip-wrap{max-width:1180px;margin:0 auto;padding:20px 14px 60px}
      .dip-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px}
      .dip-field{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ink-mid);background:var(--mist);border:1.5px solid var(--sand);border-radius:22px;padding:7px 14px}
      .dip-field select,.dip-field input[type=text]{font-family:inherit;font-size:13px;font-weight:600;color:var(--ink-mid);border:none;background:transparent;outline:none}
      .dip-field input[type=text]{width:120px}
      .dip-field input[type=checkbox]{accent-color:var(--emerald);width:15px;height:15px;cursor:pointer}
      .dip-btn{font-family:inherit;font-size:13px;font-weight:600;padding:9px 16px;border-radius:22px;border:1.5px solid var(--sand);background:var(--mist);color:var(--ink-mid);cursor:pointer;transition:all .15s}
      .dip-btn:hover{background:var(--sage);border-color:var(--teal-light)}
      .dip-btn.primary{background:linear-gradient(135deg,var(--emerald),var(--emerald-mid));color:#fff;border-color:transparent}
      .dip-btn:disabled{opacity:.5;cursor:default}
      .dip-status{font-size:13px;color:var(--ink-light);font-weight:500;flex-basis:100%}
      #dipCanvas{display:block;width:100%;height:auto;border-radius:8px;box-shadow:0 10px 40px rgba(26,58,58,.18)}
    </style>
  </head><body>
    ${renderHeader({ activePage: 'sys-diplome', isAdmin: true, isStrictAdmin, showMap: false })}
    <div class="dip-wrap">
      <div class="form-card" style="margin-bottom:16px">
        <a href="/settings" class="sys-back">← Système</a>
        <h2 style="margin-bottom:6px">🏅 Diplôme de la route</h2>
        <p style="font-size:14px;color:var(--ink-light);line-height:1.6;margin:0">Le diplôme d'un compagnon de route qui a rejoint le voyage en chemin : ses kilomètres à lui, comptés depuis sa première étape à vélo — total, moyenne par jour, dénivelé, records, pays traversés — avec les comparaisons qui parlent quand on a dix ans, et les badges gagnés. Une page A4 paysage, à imprimer ou à télécharger en PNG.</p>
      </div>

      ${empty ? `<div class="form-card"><p style="font-size:14px;color:var(--ink-light);margin:0">Pas encore de kilomètre à mettre au diplôme : il faut au moins une étape avec des kilomètres après celle choisie.</p></div>` : `
      <form class="dip-toolbar" method="GET" action="/diplome">
        <input type="hidden" name="regle" value="1">
        <label class="dip-field">Prénom <input type="text" name="nom" value="${esc(name)}" maxlength="30"></label>
        <label class="dip-field">Sa première étape à vélo
          <select name="from">${stageOptions}</select>
        </label>
        <label class="dip-field">Retrouvailles à <input type="text" name="lieu" value="${esc(place)}" maxlength="40" placeholder="Nuremberg"></label>
        <label class="dip-field">Signé <input type="text" name="signe" value="${esc(signature)}" maxlength="40"></label>
        <label class="dip-field">Couleurs <select name="theme">${themeOptions}</select></label>
        <label class="dip-field"><input type="checkbox" name="frise" value="1"${showFrise ? ' checked' : ''}> Frise des journées</label>
        <button class="dip-btn" type="submit">↻ Mettre à jour</button>
        <button class="dip-btn primary" type="button" id="dipPrint">🖨️ Imprimer / PDF</button>
        <button class="dip-btn" type="button" id="dipPng300">⬇️ PNG 300 dpi</button>
        <button class="dip-btn" type="button" id="dipPng150">⬇️ PNG 150 dpi</button>
        <span class="dip-status" id="dipStatus">Dessin du diplôme…</span>
      </form>

      <canvas id="dipCanvas"></canvas>`}
    </div>
    ${empty ? '' : `<script>
    (function(){
      var DATA = ${dataJson};

${CANVAS_KIT}
${DRAW_SCRIPT}

      // A4 paysage : 1754 × 1240 px à 150 dpi, le double à 300.
      var A4_150 = 1754;
      var el = {
        canvas: document.getElementById('dipCanvas'),
        status: document.getElementById('dipStatus'),
        print:  document.getElementById('dipPrint'),
        png300: document.getElementById('dipPng300'),
        png150: document.getElementById('dipPng150')
      };
      function setStatus(t){ el.status.textContent = t; }

      function exportBlob(scale){
        var cv = document.createElement('canvas');
        drawDiploma(cv, A4_150 * scale);
        return new Promise(function(res){
          if(cv.toBlob) cv.toBlob(res, 'image/png');
          else res(null);
        });
      }
      function download(scale, dpi){
        setStatus('Préparation du PNG ' + dpi + ' dpi…');
        exportBlob(scale).then(function(blob){
          if(!blob){ setStatus('Export impossible sur ce navigateur.'); return; }
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'diplome-' + (DATA.name || 'velo').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + dpi + 'dpi.png';
          a.click();
          setTimeout(function(){ URL.revokeObjectURL(url); }, 10000);
          setStatus('PNG ' + dpi + ' dpi téléchargé.');
        });
      }

      el.png300.addEventListener('click', function(){ download(2, 300); });
      el.png150.addEventListener('click', function(){ download(1, 150); });
      el.print.addEventListener('click', function(){
        setStatus('Préparation de l\\'impression…');
        exportBlob(2).then(function(blob){
          if(!blob){ setStatus('Impression impossible sur ce navigateur.'); return; }
          var url = URL.createObjectURL(blob);
          var w = window.open('', '_blank');
          if(!w){ setStatus('Autorisez les fenêtres pop-up pour imprimer.'); URL.revokeObjectURL(url); return; }
          w.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">'
            +'<title>Diplôme</title><style>'
            +'@page{size:A4 landscape;margin:0}'
            +'html,body{margin:0;padding:0;background:#fff}'
            +'img{display:block;width:100%;height:auto}'
            +'</style></head><body><img src="' + url + '"></body></html>');
          w.document.close(); w.focus();
          setTimeout(function(){ w.print(); setStatus('Fenêtre d\\'impression ouverte.'); }, 800);
        });
      });

      // Les fontes doivent être chargées avant le premier tracé, sinon le
      // prénom se dessinerait dans une police de secours.
      ((document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve())
        .then(function(){
          drawDiploma(el.canvas, A4_150);
          setStatus('Diplôme prêt — à imprimer en A4 paysage, ou à télécharger en PNG.');
        });
    })();
    </script>`}
  </body></html>`;
}

module.exports = { renderDiplome, THEMES };
