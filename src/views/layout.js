// ── Layout partagé : logo, en-tête de navigation et feuille de style ──
const { TRIP_TITLE, TRIP_START, TRIP_END } = require('../config');
const { renderSubscribeBell, renderSubscribeModal } = require('./subscribeWidget');

// ══════════════════════════════════════════════════════════
//  Header
// ══════════════════════════════════════════════════════════

const LOGO_SVG = `<img src="/public/logo_nijumatim.png" class="header-logo" alt="${TRIP_TITLE || 'Nijumatim'}">`;

function renderHeader({ activePage = '', isAdmin = false, isStrictAdmin = false, showMap = false, csrf = '' } = {}) {
  const links = [
    { href: '/',           label: 'Journal',       key: 'journal',     icon: '📖' },
    { href: '/timeline',   label: 'Timeline',      key: 'timeline',    icon: '📅' },
    { href: '/map',        label: 'Carte',         key: 'map',         icon: '🗺️' },
    ...(isStrictAdmin ? [{ href: '/stats', label: 'Statistiques', key: 'stats', icon: '📊' }] : []),
    { href: '/preparation',label: 'Préparation',   key: 'preparation', icon: '🛠️' },
    ...(isAdmin ? [{ href: '/settings', label: 'Système', key: 'settings', icon: '⚙️' }] : []),
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
        ${renderSubscribeBell(csrf)}
        <button class="hamburger" id="hamburger" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      </div>
      <nav class="mobile-menu" id="mobileMenu">${links.map(makeLink).join('')}</nav>
    </div>
    ${renderSubscribeModal(csrf)}
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
  .sbar-detail-item{display:flex;align-items:center;gap:8px;}
  .sbar-detail-track{flex:1;height:6px;background:var(--sand);border-radius:4px;overflow:hidden;}
  .sbar-detail-fill{display:block;height:100%;background:linear-gradient(90deg,var(--teal),var(--emerald-mid));border-radius:4px;}

  /* ── DÉPENSES (formulaire) ───────────────────────── */
  .exp-list{display:flex;flex-direction:column;gap:10px;margin-top:8px;}
  .exp-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:var(--mist);border:1.5px solid var(--sand);border-radius:12px;padding:10px;position:relative;}
  .exp-row select,.exp-row input{width:100%;border:1.5px solid var(--sand);border-radius:8px;padding:8px 10px;font-size:14px;font-family:inherit;background:#fff;color:var(--ink);}
  .exp-row .exp-label-field{grid-column:1/-1;}
  .exp-row .exp-amount-field{grid-column:1/-1;}
  .exp-subcat-field[style*="display:none"]{display:none;}
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
  .lb-caption{color:rgba(255,255,255,0.9);font-size:14px;margin-top:10px;text-align:center;max-width:90vw;max-height:22vh;overflow-y:auto;padding:0 12px;}
  .caption-input{width:100%;border:1.5px solid var(--sand);border-radius:8px;padding:6px 10px;font-size:13px;font-family:inherit;margin-top:4px;background:#fff;}

  /* ── COUCHAGE (carte) ────────────────────────────── */
  .card-sleep{display:flex;align-items:center;gap:12px;width:100%;margin-top:16px;padding:12px 14px;text-align:left;font-family:inherit;color:var(--ink);background:linear-gradient(135deg,var(--mist),var(--sage));border:1.5px solid var(--sand);border-radius:14px;}
  button.card-sleep{cursor:pointer;transition:transform .15s,box-shadow .15s,border-color .15s;}
  button.card-sleep:hover{border-color:var(--teal-light);box-shadow:0 4px 16px rgba(42,122,122,0.16);transform:translateY(-1px);}
  button.card-sleep:active{transform:translateY(0);}
  .card-sleep-icon{font-size:22px;line-height:1;flex-shrink:0;}
  .card-sleep-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}
  .card-sleep-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--teal);}
  .card-sleep-place{font-family:'Playfair Display',serif;font-size:15px;font-weight:700;color:var(--ink);line-height:1.3;}
  .card-sleep-hint{font-size:11px;color:var(--ink-light);margin-top:2px;}
  .card-sleep-chev{flex-shrink:0;font-size:22px;color:var(--ocean-mid);line-height:1;}

  /* ── COUCHAGE (fenêtre commentaire) ──────────────── */
  .sleep-modal{display:none;position:fixed;inset:0;background:rgba(5,15,30,0.85);z-index:1100;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:16px;}
  .sleep-modal.open{display:flex;}
  .sleep-box{background:#fff;border-radius:16px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.4);overflow:hidden;}
  .sleep-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:14px 18px;background:linear-gradient(135deg,var(--ocean-mid),var(--teal));}
  .sleep-head h3{font-family:'Playfair Display',serif;font-size:16px;font-weight:700;color:#fff;margin:0;}
  .sleep-head-place{font-size:12px;color:rgba(255,255,255,0.85);margin-top:2px;}
  .sleep-close{background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.3);color:#fff;font-size:18px;width:30px;height:30px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;padding:0;}
  .sleep-close:hover{background:rgba(255,255,255,0.32);}
  .sleep-body{padding:18px;font-size:14.5px;color:var(--ink-mid);line-height:1.75;white-space:pre-wrap;max-height:60vh;overflow-y:auto;}
  .sleep-body.sleep-empty{color:var(--ink-light);font-style:italic;}

  /* ── NOTE PRIVÉE (admin) ─────────────────────────── */
  .card-private{margin-top:14px;background:#fffbeb;border:1.5px solid #fde68a;border-radius:12px;padding:12px 14px;}
  .card-private-head{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#92400e;margin-bottom:6px;}
  .card-private-text{font-size:14px;color:#78350f;line-height:1.6;white-space:pre-wrap;}

  /* ── SUPPRESSION COMMENTAIRE ─────────────────────── */
  .comment-del{background:none;border:none;color:#dc2626;font-size:11px;cursor:pointer;padding:2px 6px;margin-left:6px;border-radius:6px;}
  .comment-del:hover{background:#fee2e2;}

  /* ── VALIDATION MANUELLE D'UN ABONNÉ (système) ───── */
  .sub-validate{background:none;border:1px solid var(--emerald);color:var(--emerald);font-size:11px;font-weight:600;cursor:pointer;padding:2px 8px;border-radius:20px;white-space:nowrap;}
  .sub-validate:hover{background:var(--sage);}

  /* ── SYNTHÈSE DÉPENSES (stats) ───────────────────── */
  .exp-month-card{background:#fff;border:1px solid var(--sand);border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 2px 12px rgba(10,61,98,0.06);}
  .exp-month-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px;}
  .exp-month-name{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;color:var(--ink);text-transform:capitalize;}
  .exp-month-total{font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:var(--accent);}
  .exp-break-title{font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-light);font-weight:600;margin:10px 0 6px;}
  .exp-break-row{display:flex;align-items:center;gap:10px;font-size:13px;margin-bottom:6px;}
  .exp-break-row-toggle{cursor:pointer;user-select:none;}
  .exp-break-caret{display:inline-block;font-size:10px;color:var(--ink-light);transition:transform .15s;margin-left:2px;}
  .exp-break-row-toggle.open .exp-break-caret{transform:rotate(180deg);}
  .exp-detail{display:none;flex-direction:column;gap:4px;margin:-2px 0 10px 0;padding:8px 10px;background:var(--mist);border-radius:8px;border:1px solid var(--sand);}
  .exp-detail.open{display:flex;}
  .exp-detail-item{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-mid);}
  .exp-detail-date{flex-shrink:0;color:var(--ink-light);width:78px;}
  .exp-detail-lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .exp-detail-subcat{display:inline-block;font-size:10px;background:var(--sand);color:var(--ink-mid);padding:1px 6px;border-radius:10px;font-weight:600;}
  .exp-detail-payer{flex-shrink:0;font-size:11px;color:var(--ink-light);}
  .exp-detail-amt{flex-shrink:0;font-weight:600;width:60px;text-align:right;}
  .exp-break-lbl{width:130px;flex-shrink:0;color:var(--ink-mid);}
  .exp-break-track{flex:1;background:var(--mist);border-radius:6px;height:16px;overflow:hidden;border:1px solid var(--sand);}
  .exp-break-fill{height:100%;border-radius:6px;}
  .exp-break-val{width:78px;flex-shrink:0;text-align:right;font-weight:600;color:var(--ink-mid);font-size:12px;}
  .exp-grand-total{background:linear-gradient(135deg,var(--ocean),var(--emerald));color:#fff;border-radius:14px;padding:16px;text-align:center;margin-bottom:16px;}
  .exp-grand-total .egt-num{font-family:'Playfair Display',serif;font-size:32px;font-weight:700;}
  .exp-grand-total .egt-lbl{font-size:12px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.9;margin-top:4px;}
  .exp-detail-subtotals{display:flex;flex-direction:column;gap:4px;padding-bottom:6px;margin-bottom:6px;border-bottom:1px dashed var(--sand);}
  .exp-subcat-row{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-mid);}
  .exp-subcat-lbl{width:90px;flex-shrink:0;}
  .exp-subcat-track{flex:1;height:6px;background:var(--sand);border-radius:4px;overflow:hidden;}
  .exp-subcat-fill{display:block;height:100%;border-radius:4px;}
  .exp-subcat-amt{flex-shrink:0;width:60px;text-align:right;font-weight:600;}

  /* ── ABONNEMENT E-MAIL (cloche + modale) ─────────── */
  .sub-bell{width:40px;height:40px;border-radius:10px;border:1.5px solid var(--sand);background:var(--mist);font-size:17px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:background .15s,transform .15s;padding:0;}
  .sub-bell:hover{background:var(--sage);transform:translateY(-1px);}
  .sub-modal{display:none;position:fixed;inset:0;background:rgba(5,15,30,0.85);z-index:1100;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:16px;}
  .sub-modal.open{display:flex;}
  .sub-box{background:#fff;border-radius:16px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.4);overflow:hidden;}
  .sub-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--sand);background:linear-gradient(135deg,var(--ocean-mid),var(--teal));}
  .sub-head h3{font-family:'Playfair Display',serif;font-size:16px;font-weight:700;color:#fff;margin:0;}
  .sub-close{background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.3);color:#fff;font-size:18px;width:30px;height:30px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;padding:0;}
  .sub-close:hover{background:rgba(255,255,255,0.32);}
  .sub-body{padding:18px;}
  .sub-intro{font-size:13px;color:var(--ink-light);line-height:1.6;margin-bottom:14px;}
  .sub-done-hint{font-size:12px;color:var(--emerald);margin-top:10px;}
  .sub-form{display:flex;gap:8px;}
  .sub-form input{flex:1;min-width:0;border:1.5px solid var(--sand);border-radius:10px;padding:9px 12px;font-size:14px;font-family:inherit;background:#fff;color:var(--ink);}
  .sub-form input:focus{outline:none;border-color:var(--teal-light);box-shadow:0 0 0 3px rgba(23,162,184,0.12);}
  .sub-form .sub-btn{background:linear-gradient(135deg,var(--ocean-mid),var(--teal));color:#fff;border:none;border-radius:10px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;transition:opacity .15s;}
  .sub-form .sub-btn:hover{opacity:.9}
  .sub-form .sub-btn[disabled]{opacity:.6;cursor:default}
  .sub-msg{text-align:center;font-size:13px;padding:8px 12px;border-radius:10px;margin-top:12px;}
  .sub-msg.ok{background:var(--sage);color:var(--emerald);border:1px solid var(--emerald-light);}
  .sub-msg.err{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;}

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

  /* ── COUVERTURE DU POST ──────────────────────────── */
  .card-cover{position:relative;display:block;width:calc(100% + 36px);margin:0 -18px 16px;padding:0;border:none;background:#1a1a1a;cursor:zoom-in;overflow:hidden;font-family:inherit;text-align:left;}
  .card-cover-media{display:block;width:100%;height:300px;object-fit:cover;transition:transform .35s;background:#1a1a1a;}
  .card-cover:hover .card-cover-media{transform:scale(1.03);}
  .card-cover-play{position:absolute;top:calc(50% - 12px);left:50%;transform:translate(-50%,-50%);box-sizing:border-box;width:62px;height:62px;border-radius:50%;background:rgba(0,0,0,0.5);border:2px solid rgba(255,255,255,0.85);color:#fff;font-size:22px;display:flex;align-items:center;justify-content:center;padding-left:5px;pointer-events:none;}
  .card-cover-badge{position:absolute;top:10px;right:10px;display:flex;align-items:center;gap:8px;background:rgba(0,0,0,0.6);color:#fff;font-size:12px;font-weight:600;padding:5px 11px;border-radius:20px;backdrop-filter:blur(4px);pointer-events:none;}
  .card-cover-badge b{font-weight:700;padding-left:8px;border-left:1px solid rgba(255,255,255,0.35);}
  .card-cover-cap{display:block;font-size:11px;color:#e8e8e8;background:#1a1a1a;padding:6px 10px;text-align:center;line-height:1.4;}
  @media(max-width:480px){
    .card-cover-media{height:230px;}
  }

  /* ── LIGHTBOX ────────────────────────────────────── */
  .lightbox{display:none;position:fixed;inset:0;background:rgba(5,15,30,0.95);z-index:1000;align-items:center;justify-content:center;flex-direction:column;backdrop-filter:blur(8px);}
  .lightbox.open{display:flex}
  .lb-stage{display:flex;align-items:center;justify-content:center;max-width:95vw;}
  .lb-stage img,.lb-stage video{max-width:95vw;max-height:70vh;object-fit:contain;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,0.6);user-select:none;background:#000;}
  .lb-thumbs{display:none;gap:8px;margin-top:12px;max-width:92vw;padding:2px 4px 0;overflow-x:auto;scrollbar-width:thin;}
  .lb-thumb{position:relative;flex:0 0 auto;width:60px;height:46px;padding:0;border:2px solid transparent;border-radius:6px;overflow:hidden;background:#000;cursor:pointer;opacity:.5;transition:opacity .15s,border-color .15s;}
  .lb-thumb img,.lb-thumb video{width:100%;height:100%;object-fit:cover;display:block;}
  .lb-thumb:hover{opacity:.85;}
  .lb-thumb.active{opacity:1;border-color:#fff;}
  .lb-thumb.is-video::after{content:'🎬';position:absolute;right:2px;bottom:1px;font-size:10px;line-height:1;text-shadow:0 1px 3px rgba(0,0,0,0.8);}
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
  .card-multiday{font-size:12px;background:var(--mist);color:var(--ocean-mid);padding:4px 10px;border-radius:20px;display:inline-flex;align-items:center;gap:4px;font-weight:600;letter-spacing:0.01em;}
  .card-restnote{font-size:12px;color:var(--ink-light);display:flex;align-items:center;gap:5px;font-weight:500;}
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
  .translate-widget{display:flex;align-items:center;gap:8px;margin:-2px 0 12px;}
  .translate-select{font-size:12px;font-weight:500;color:var(--ocean-mid);background:var(--mist);border:1.5px solid var(--teal-light);border-radius:20px;padding:4px 10px;font-family:inherit;cursor:pointer;}
  .translate-status{font-size:11px;color:var(--ink-light);}
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
  .photo-grid-new{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:10px}
  .photo-grid-card{display:flex;flex-direction:column;gap:5px}
  .photo-grid-media{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:8px;border:2px solid var(--sand);display:block}
  .photo-grid-caption{font-size:12px;padding:5px 8px;border-radius:6px;border:1.5px solid var(--sand);font-family:inherit;background:#fff;width:100%;box-sizing:border-box;color:var(--ink)}
  .photo-grid-caption:focus{outline:none;border-color:var(--teal-light);box-shadow:0 0 0 2px rgba(56,178,172,.15)}
  .media-order-badge{position:absolute;top:4px;left:4px;z-index:2;background:var(--ocean);color:#fff;font-size:11px;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 5px;box-shadow:0 1px 4px rgba(0,0,0,.3)}
  .media-item{touch-action:none}
  .media-caption-btn{position:absolute;bottom:4px;right:4px;z-index:2;background:rgba(10,61,98,0.75);color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;transition:background .15s;}
  .media-caption-btn:hover{background:rgba(10,61,98,0.95);}
  .media-caption-btn.has-caption{background:var(--teal);}
  .media-cover-btn{position:absolute;bottom:4px;left:4px;z-index:2;background:rgba(10,61,98,0.75);color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;transition:background .15s;}
  .media-cover-btn:hover{background:rgba(10,61,98,0.95);}
  .media-cover-btn.is-cover{background:var(--accent);box-shadow:0 0 0 2px rgba(255,255,255,.85);}
  .photo-grid-cover{margin-top:2px;background:var(--mist);color:var(--ocean-mid);border:1.5px solid var(--sand);border-radius:6px;padding:4px 6px;font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;transition:background .15s,border-color .15s;}
  .photo-grid-cover.is-cover{background:var(--accent);border-color:var(--accent);color:#fff;}
  .caption-popup{display:none;position:fixed;inset:0;background:rgba(5,15,30,0.85);z-index:1200;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:16px;}
  .caption-popup.open{display:flex;}
  .caption-popup-box{background:#fff;border-radius:16px;max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.4);overflow:hidden;}
  .caption-popup-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--sand);background:linear-gradient(135deg,var(--ocean-mid),var(--teal));}
  .caption-popup-head h3{font-family:'Playfair Display',serif;font-size:15px;font-weight:700;color:#fff;margin:0;}
  .caption-popup-close{background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.3);color:#fff;font-size:18px;width:28px;height:28px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;}
  .caption-popup-close:hover{background:rgba(255,255,255,0.32);}
  .caption-popup-body{padding:16px;}
  .caption-popup-body img{width:100%;max-height:160px;object-fit:cover;border-radius:8px;margin-bottom:10px;display:block;}
  .caption-popup-body video{width:100%;max-height:200px;border-radius:8px;margin-bottom:10px;display:block;background:#000;}
  .caption-popup-body textarea{width:100%;box-sizing:border-box;min-height:70px;font-size:13px;padding:8px 10px;border-radius:8px;border:1.5px solid var(--sand);font-family:inherit;resize:vertical;color:var(--ink);}
  .caption-popup-body textarea:focus{outline:none;border-color:var(--teal-light);box-shadow:0 0 0 2px rgba(56,178,172,.15);}
  .caption-popup-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;}
  .caption-popup-save{background:var(--teal);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}
  .caption-popup-save:hover{opacity:.9;}
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

module.exports = { CSS, LOGO_SVG, renderHeader };
