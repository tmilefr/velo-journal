// ── Diplôme : les chiffres d'un compagnon de route, en A4 à encadrer ──
// Quelqu'un a rejoint le voyage en route : cette page recalcule ses kilomètres
// à elle depuis son étape d'arrivée, et les met en page sur un diplôme à
// imprimer — grosses pastilles de chiffres, comparaisons à hauteur d'enfant,
// badges gagnés et frise des journées de vélo.
const { TRIP_TITLE } = require('../config');
const { esc } = require('../lib/html');
const { formatDateShort } = require('../lib/dates');
const { CSS, renderHeader } = require('./layout');

const fr0 = n => Math.round(n).toLocaleString('fr-FR');
const fr1 = n => (Math.round(n * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// Une comparaison rigolote n'a pas besoin de décimales passé la dizaine.
const frFact = n => (n >= 10 ? fr0(n) : fr1(n));
const plural = (n, s = 's') => (n > 1 ? s : '');

// Trois habillages au choix — le diplôme n'est pas une facture.
// `--d1` à `--d4` sont les quatre couleurs vives du thème ; les `…-soft` sont
// leurs versions diluées (traits et halos), écrites en dur pour rester lisibles
// à l'impression comme sur un vieux navigateur.
const THEMES = {
  arc: {
    label: 'Arc-en-ciel',
    vars: '--d1:#ff5d8f;--d2:#ffa62b;--d3:#3ec9b0;--d4:#6c8cff;'
        + '--d-paper:#fffdf7;--d-ink:#3a2a4d;--d-soft:#7a6a8d;--d-line:rgba(122,106,141,.45);'
        + '--d1-soft:rgba(255,93,143,.14);--d3-soft:rgba(62,201,176,.14);'
        + '--d3-edge:rgba(62,201,176,.40);--d4-edge:rgba(108,140,255,.26)',
  },
  ocean: {
    label: 'Océan',
    vars: '--d1:#2a7a7a;--d2:#4aabab;--d3:#3a9e72;--d4:#e07a3a;'
        + '--d-paper:#fbfffe;--d-ink:#1a3a3a;--d-soft:#5a8080;--d-line:rgba(90,128,128,.45);'
        + '--d1-soft:rgba(42,122,122,.12);--d3-soft:rgba(58,158,114,.12);'
        + '--d3-edge:rgba(58,158,114,.38);--d4-edge:rgba(224,122,58,.26)',
  },
  sunset: {
    label: 'Coucher de soleil',
    vars: '--d1:#e8455f;--d2:#ff8a3d;--d3:#ffc93c;--d4:#9b5de5;'
        + '--d-paper:#fffaf3;--d-ink:#4a2130;--d-soft:#8d6070;--d-line:rgba(141,96,112,.45);'
        + '--d1-soft:rgba(232,69,95,.13);--d3-soft:rgba(255,201,60,.18);'
        + '--d3-edge:rgba(255,201,60,.55);--d4-edge:rgba(155,93,229,.26)',
  },
};

// ══════════════════════════════════════════════════════════
//  La feuille A4 paysage
// ══════════════════════════════════════════════════════════

function renderSheet(d, { name, theme, showFrise }) {
  const s = d.stats;
  const t = THEMES[theme] || THEMES.arc;

  // ── Les cinq grands chiffres ────────────────────────────
  const medals = [
    { icon: '🚴', num: fr0(s.km),      unit: 'km',      lbl: 'parcourus à vélo' },
    { icon: '🗓️', num: fr0(s.nDays),   unit: `jour${plural(s.nDays)}`,
      lbl: s.restDays > 0 ? `de vélo, ${s.restDays} de repos` : 'de vélo, sans une pause' },
    { icon: '📊', num: fr1(s.avgKm),   unit: 'km/jour', lbl: 'de moyenne' },
    { icon: '⛰️', num: fr0(s.dplus),   unit: 'm D+',    lbl: 'de montée cumulée' },
    { icon: '🏔️', num: fr0(s.avgDplus),unit: 'm/jour',  lbl: 'de montée en moyenne' },
  ].map(m => `
        <div class="dip-medal">
          <div class="dip-medal-icon">${m.icon}</div>
          <div class="dip-medal-num">${m.num}</div>
          <div class="dip-medal-unit">${m.unit}</div>
          <div class="dip-medal-lbl">${m.lbl}</div>
        </div>`).join('');

  // ── Les records du carnet ───────────────────────────────
  const records = [
    s.maxKmDay ? {
      icon: '🥇', lbl: 'Plus longue journée',
      val: `${fr1(s.maxKm)} km`,
      sub: `${esc(s.maxKmDay.title || s.maxKmDay.location || '')} · ${formatDateShort(s.maxKmDay.date)}`,
    } : null,
    s.maxDplus > 0 && s.maxDplusDay ? {
      icon: '🚀', lbl: 'Plus grosse montée',
      val: `${fr0(s.maxDplus)} m D+`,
      sub: `${esc(s.maxDplusDay.title || s.maxDplusDay.location || '')} · ${formatDateShort(s.maxDplusDay.date)}`,
    } : null,
    d.countries.length ? {
      icon: '🌍', lbl: `Pays traversé${plural(d.countries.length)}`,
      val: d.countries.map(c => c.flag).join(' '),
      sub: d.countries.map(c => `${esc(c.country)} (${fr0(c.km)} km)`).join(' · '),
    } : null,
    // Le voyage a aussi ses trajets en train : ils ne comptent pas comme du
    // vélo, mais ils disent le chemin réellement parcouru. À défaut, on montre
    // la durée du séjour en selle.
    d.train.count > 0 ? {
      icon: '🚆', lbl: `Aussi, ${d.train.count} trajet${plural(d.train.count)} en train`,
      val: `${fr0(d.train.km)} km`,
      sub: `soit ${fr0(d.totals.totalKm)} km de voyage en tout, vélo et rail réunis`,
    } : {
      icon: '🗺️', lbl: 'Du guidon au guidon',
      val: `${s.spanDays} jour${plural(s.spanDays)}`,
      sub: `de la première à la dernière étape${s.restDays > 0 ? `, dont ${s.restDays} de repos` : ', sans une pause'}`,
    },
  ].filter(Boolean).slice(0, 4).map(r => `
          <div class="dip-rec">
            <span class="dip-rec-icon">${r.icon}</span>
            <span class="dip-rec-body">
              <span class="dip-rec-lbl">${r.lbl}</span>
              <span class="dip-rec-sub">${r.sub}</span>
            </span>
            <span class="dip-rec-val">${r.val}</span>
          </div>`).join('');

  // ── Les mêmes chiffres, mais pour de vrai ───────────────
  const facts = d.facts.slice(0, 4).map(f => `
          <div class="dip-fact">
            <span class="dip-fact-icon">${f.icon}</span>
            <span class="dip-fact-num">${frFact(f.count)}</span>
            <span class="dip-fact-lbl">${f.label}</span>
          </div>`).join('');

  const badges = d.badges.map((b, i) => `
        <span class="dip-badge dip-badge-${i % 4}">
          <span class="dip-badge-icon">${b.icon}</span>${esc(b.name)}
        </span>`).join('');

  // ── La frise des journées de vélo ───────────────────────
  const maxDayKm = d.days.reduce((m, x) => Math.max(m, x.km), 1);
  const bars = d.days.map(x => `<span class="dip-bar" style="height:${Math.max(6, Math.round(x.km / maxDayKm * 100))}%" title="${formatDateShort(x.date)} — ${fr1(x.km)} km"></span>`).join('');
  const friseHtml = (showFrise && d.days.length) ? `
      <div class="dip-frise">
        <div class="dip-frise-lbl">
          <b>🚲 ${d.days.length} journée${plural(d.days.length)} de vélo</b>
          une barre par jour · la plus haute : ${fr1(maxDayKm)} km
        </div>
        <div class="dip-bars" style="gap:${d.days.length > 60 ? 1 : 2}px">${bars}</div>
      </div>` : '';

  const endDate = formatDateShort(d.last.date);
  // Deux histoires possibles : on l'a retrouvée en chemin, ou elle était du
  // voyage depuis le premier tour de roue.
  const story = d.join
    ? `qui a rejoint l'aventure à <b>${esc(d.joinPlace)}</b> le ${formatDateShort(d.join.date)},
       et qui n'a plus lâché son guidon jusqu'à <b>${esc(d.endPlace)}</b>, le ${endDate}.`
    : `qui a pris la route dès le premier jour, à <b>${esc(d.startPlace)}</b>,
       et qui a pédalé jusqu'à <b>${esc(d.endPlace)}</b>, le ${endDate}.`;

  return `
    <div class="dip-sheet" id="dipSheet" style="${t.vars}">
      <div class="dip-frame">
        <span class="dip-corner dip-corner-tl">🚲</span>
        <span class="dip-corner dip-corner-tr">⛰️</span>
        <span class="dip-corner dip-corner-bl">🌍</span>
        <span class="dip-corner dip-corner-br">⭐</span>

        <div class="dip-head">
          <div class="dip-kicker">${esc(TRIP_TITLE)}</div>
          <div class="dip-ribbon">Grand diplôme de la route</div>
          <h1 class="dip-title">Diplôme de Grande Cycliste</h1>
          <div class="dip-award">fièrement décerné à</div>
          <div class="dip-name">${esc(name)}</div>
          <p class="dip-story">${story}</p>
        </div>

        <div class="dip-medals">${medals}</div>

        <div class="dip-cols">
          <div class="dip-col">
            <div class="dip-col-title">🏅 Ses records</div>
            ${records}
          </div>
          <div class="dip-col">
            <div class="dip-col-title">🤯 Autrement dit…</div>
            ${facts || '<div class="dip-rec-sub">Les comparaisons arrivent dès les premiers kilomètres !</div>'}
          </div>
        </div>

        ${badges ? `<div class="dip-badges">${badges}</div>` : ''}

        ${friseHtml}

        <div class="dip-foot">
          <div class="dip-sign">
            <div class="dip-sign-line"></div>
            <div class="dip-sign-lbl">L'équipage du voyage</div>
          </div>
          <div class="dip-seal">
            <div class="dip-seal-in">
              <span class="dip-seal-icon">🏅</span>
              <span class="dip-seal-txt">${fr0(s.km)} km</span>
              <span class="dip-seal-sub">au compteur</span>
            </div>
          </div>
          <div class="dip-sign">
            <div class="dip-sign-line"></div>
            <div class="dip-sign-lbl">Fait le ${formatDateShort(new Date().toISOString())}</div>
          </div>
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════
//  La page : réglages, aperçu, impression
// ══════════════════════════════════════════════════════════

function renderDiplome(data, opts = {}, isStrictAdmin = false) {
  const name      = opts.name || 'Margot';
  const theme     = THEMES[opts.theme] ? opts.theme : 'arc';
  const showFrise = opts.showFrise !== false;

  const empty = !data || data.stats.nDays === 0;

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
      .dip-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px}
      .dip-field{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ink-mid);background:var(--mist);border:1.5px solid var(--sand);border-radius:22px;padding:7px 14px}
      .dip-field select,.dip-field input[type=text]{font-family:inherit;font-size:13px;font-weight:600;color:var(--ink-mid);border:none;background:transparent;outline:none}
      .dip-field input[type=text]{width:110px}
      .dip-field input[type=checkbox]{accent-color:var(--emerald);width:15px;height:15px;cursor:pointer}
      .dip-btn{font-family:inherit;font-size:13px;font-weight:600;padding:9px 16px;border-radius:22px;border:1.5px solid var(--sand);background:var(--mist);color:var(--ink-mid);cursor:pointer;transition:all .15s}
      .dip-btn:hover{background:var(--sage);border-color:var(--teal-light)}
      .dip-btn.primary{background:linear-gradient(135deg,var(--emerald),var(--emerald-mid));color:#fff;border-color:transparent}

      /* ── La feuille : A4 paysage (297 × 210 mm) ─────── */
      .dip-stage{overflow:hidden}
      .dip-scale{transform-origin:top left}
      .dip-sheet{width:297mm;height:210mm;background:var(--d-paper);color:var(--d-ink);
        font-family:'Fredoka',sans-serif;border-radius:6px;overflow:hidden;position:relative;
        box-shadow:0 10px 40px rgba(26,58,58,.18);
        background-image:radial-gradient(circle at 12% 8%, var(--d3-soft) 0 22%, transparent 60%),
                         radial-gradient(circle at 88% 92%, var(--d1-soft) 0 22%, transparent 60%);
        -webkit-print-color-adjust:exact;print-color-adjust:exact}
      .dip-sheet::before{content:'';position:absolute;inset:0;border:7mm solid transparent;border-radius:6px;
        background:linear-gradient(120deg,var(--d1),var(--d2),var(--d3),var(--d4),var(--d1)) border-box;
        -webkit-mask:linear-gradient(#fff 0 0) padding-box,linear-gradient(#fff 0 0);
        -webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
      .dip-frame{position:absolute;inset:9mm;border:2px dashed var(--d-line);
        border-radius:4mm;padding:6mm 9mm;display:flex;flex-direction:column;gap:3mm}
      .dip-corner{position:absolute;font-size:20px;opacity:.55}
      .dip-corner-tl{top:3mm;left:4mm}.dip-corner-tr{top:3mm;right:4mm}
      .dip-corner-bl{bottom:3mm;left:4mm}.dip-corner-br{bottom:3mm;right:4mm}

      .dip-head{text-align:center}
      .dip-kicker{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--d-soft);font-weight:600}
      .dip-ribbon{display:inline-block;margin-top:3px;background:linear-gradient(135deg,var(--d1),var(--d2));color:#fff;
        font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:4px 16px;border-radius:20px}
      .dip-title{font-family:'Fredoka',sans-serif;font-size:28px;font-weight:700;line-height:1.1;margin:5px 0 0;
        background:linear-gradient(100deg,var(--d1),var(--d4),var(--d3));-webkit-background-clip:text;background-clip:text;color:transparent}
      .dip-award{font-size:12px;color:var(--d-soft);margin-top:3px;font-weight:500}
      .dip-name{font-family:'Caveat',cursive;font-size:48px;font-weight:700;line-height:1.05;color:var(--d1);margin:0}
      .dip-story{font-size:12.5px;line-height:1.45;margin-top:1px;color:var(--d-ink);max-width:190mm;margin:0 auto}
      .dip-story b{color:var(--d1)}

      .dip-medals{display:grid;grid-template-columns:repeat(5,1fr);gap:3.5mm}
      .dip-medal{background:#fff;border:2px solid var(--d3-edge);border-radius:5mm;
        padding:2.5mm 2mm;text-align:center;box-shadow:0 3px 10px rgba(0,0,0,.05)}
      .dip-medal-icon{font-size:19px;line-height:1}
      .dip-medal-num{font-size:25px;font-weight:700;line-height:1.05;margin-top:.5mm;
        background:linear-gradient(120deg,var(--d1),var(--d4));-webkit-background-clip:text;background-clip:text;color:transparent}
      .dip-medal-unit{font-size:12px;font-weight:600;color:var(--d-ink)}
      .dip-medal-lbl{font-size:10px;color:var(--d-soft);line-height:1.25;margin-top:1mm}

      .dip-cols{display:grid;grid-template-columns:1.15fr 1fr;gap:4mm;flex:1;min-height:0}
      .dip-col{background:#fff;border:2px solid var(--d4-edge);border-radius:5mm;padding:2mm 4mm;display:flex;flex-direction:column;justify-content:space-evenly;gap:1.5mm;overflow:hidden}
      .dip-col-title{font-size:12px;font-weight:700;color:var(--d4);letter-spacing:.04em;margin-bottom:.5mm}
      .dip-rec{display:flex;align-items:center;gap:2.5mm}
      .dip-rec-icon{font-size:17px;width:8mm;text-align:center;flex:none}
      .dip-rec-body{flex:1;min-width:0;display:flex;flex-direction:column}
      .dip-rec-lbl{font-size:11px;font-weight:600;line-height:1.25}
      .dip-rec-sub{font-size:9px;color:var(--d-soft);line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dip-rec-val{font-size:15px;font-weight:700;color:var(--d1);white-space:nowrap;flex:none}
      .dip-fact{display:flex;align-items:baseline;gap:2mm}
      .dip-fact-icon{font-size:15px;flex:none}
      .dip-fact-num{font-size:19px;font-weight:700;color:var(--d2);flex:none}
      .dip-fact-lbl{font-size:10px;color:var(--d-ink);line-height:1.25}

      .dip-badges{display:flex;flex-wrap:wrap;gap:2.5mm;justify-content:center}
      .dip-badge{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;color:#fff;
        padding:1.7mm 4mm;border-radius:20px;box-shadow:0 2px 6px rgba(0,0,0,.10)}
      .dip-badge-icon{font-size:14px}
      .dip-badge-0{background:linear-gradient(135deg,var(--d1),var(--d2))}
      .dip-badge-1{background:linear-gradient(135deg,var(--d2),var(--d3))}
      .dip-badge-2{background:linear-gradient(135deg,var(--d3),var(--d4))}
      .dip-badge-3{background:linear-gradient(135deg,var(--d4),var(--d1))}

      .dip-frise{background:#fff;border:2px solid var(--d3-edge);border-radius:5mm;padding:2mm 4mm;display:flex;align-items:flex-end;gap:4mm}
      .dip-frise-lbl{flex:none;width:52mm;font-size:9.5px;color:var(--d-soft);line-height:1.35}
      .dip-frise-lbl b{display:block;font-size:10.5px;color:var(--d-ink)}
      .dip-bars{flex:1;display:flex;align-items:flex-end;justify-content:space-between;gap:2px;height:11mm;overflow:hidden}
      .dip-bar{flex:1;min-width:2px;max-width:7mm;border-radius:2px 2px 0 0;background:linear-gradient(180deg,var(--d2),var(--d1))}

      .dip-foot{display:flex;align-items:center;justify-content:space-between;gap:6mm}
      .dip-sign{flex:1;text-align:center}
      .dip-sign-line{border-bottom:1.5px dotted var(--d-soft);margin-bottom:1.5mm}
      .dip-sign-lbl{font-size:9.5px;color:var(--d-soft)}
      .dip-seal{width:20mm;height:20mm;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;
        background:linear-gradient(135deg,var(--d1),var(--d2));box-shadow:0 4px 14px rgba(0,0,0,.16);transform:rotate(-8deg)}
      .dip-seal-in{width:16.5mm;height:16.5mm;border-radius:50%;border:1.5px dashed rgba(255,255,255,.85);color:#fff;
        display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}
      .dip-seal-icon{font-size:15px}
      .dip-seal-txt{font-size:12px;font-weight:700;margin-top:1mm}
      .dip-seal-sub{font-size:8px;opacity:.9;margin-top:.5mm}

      @media print{
        @page{size:A4 landscape;margin:0}
        body{background:#fff}
        .header,.dip-toolbar,.dip-intro,.dip-hint{display:none!important}
        .dip-wrap{max-width:none;padding:0;margin:0}
        .dip-stage{overflow:visible}
        .dip-scale{transform:none!important}
        .dip-sheet{box-shadow:none;border-radius:0}
      }
    </style>
  </head><body>
    ${renderHeader({ activePage: 'sys-diplome', isAdmin: true, isStrictAdmin, showMap: false })}
    <div class="dip-wrap">
      <div class="form-card dip-intro" style="margin-bottom:16px">
        <a href="/settings" class="sys-back">← Système</a>
        <h2 style="margin-bottom:6px">🏅 Diplôme de la route</h2>
        <p style="font-size:14px;color:var(--ink-light);line-height:1.6;margin:0">Le diplôme d'un compagnon de route qui a rejoint le voyage en chemin : ses kilomètres à lui, comptés depuis son étape d'arrivée — total, moyenne par jour, dénivelé, records, pays traversés — avec les comparaisons qui parlent quand on a dix ans, et les badges gagnés. Une page A4 paysage, à imprimer et à encadrer.</p>
      </div>

      ${empty ? `<div class="form-card"><p style="font-size:14px;color:var(--ink-light);margin:0">Pas encore de kilomètre à mettre au diplôme : il faut au moins une étape avec des kilomètres après celle choisie.</p></div>` : `
      <form class="dip-toolbar" method="GET" action="/diplome">
        <input type="hidden" name="regle" value="1">
        <label class="dip-field">Prénom <input type="text" name="nom" value="${esc(name)}" maxlength="30"></label>
        <label class="dip-field">Sa première étape à vélo
          <select name="from">${stageOptions}</select>
        </label>
        <label class="dip-field">Couleurs <select name="theme">${themeOptions}</select></label>
        <label class="dip-field"><input type="checkbox" name="frise" value="1"${showFrise ? ' checked' : ''}> Frise des journées</label>
        <button class="dip-btn" type="submit">↻ Mettre à jour</button>
        <button class="dip-btn primary" type="button" id="dipPrint">🖨️ Imprimer / PDF</button>
      </form>
      <p class="dip-hint" style="font-size:13px;color:var(--ink-light);margin:0 0 14px">💡 À l'impression, pensez à cocher « graphiques d'arrière-plan » et à choisir le format <strong>A4 paysage</strong>.</p>

      <div class="dip-stage"><div class="dip-scale" id="dipScale">
        ${renderSheet(data, { name, theme, showFrise })}
      </div></div>`}
    </div>
    ${empty ? '' : `<script>
    (function(){
      // L'aperçu est une vraie feuille A4 en millimètres : on la réduit à la
      // largeur de l'écran, sans toucher à ce qui part à l'imprimante.
      var stage = document.querySelector('.dip-stage');
      var scale = document.getElementById('dipScale');
      var sheet = document.getElementById('dipSheet');
      function fit(){
        var w = sheet.offsetWidth, h = sheet.offsetHeight;
        if(!w) return;
        var k = Math.min(1, stage.clientWidth / w);
        scale.style.transform = 'scale(' + k + ')';
        stage.style.height = (h * k) + 'px';
      }
      window.addEventListener('resize', fit);
      if(document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
      fit();
      document.getElementById('dipPrint').addEventListener('click', function(){ window.print(); });
    })();
    </script>`}
  </body></html>`;
}

module.exports = { renderDiplome, THEMES };
