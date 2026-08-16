// ── Livre photo : une page par étape, à imprimer et relier ──
const { TRIP_TITLE, TRIP_START, TRIP_END } = require('../config');
const { CSS, renderHeader } = require('./layout');
const { CANVAS_KIT } = require('./canvasKit');

// ══════════════════════════════════════════════════════════
// Compose (côté client, sur canvas) un livre au format A4 :
//   • la couverture porte la carte du voyage entier — fond épuré ou tuiles
//     OpenStreetMap — avec le tracé par-dessus ;
//   • chaque étape a sa page — titre, date, chiffres, récit, et un montage
//     de ses photos à la manière d'un carnet de collage ;
//   • la quatrième de couverture porte le profil altimétrique.
// Le tout s'imprime d'un bloc (ou s'exporte en PNG page par page).
function renderLivre(stages, isStrictAdmin = false) {
  const dataJson = JSON.stringify(stages).replace(/</g, '\\u003c');
  const metaJson = JSON.stringify({
    title: String(TRIP_TITLE || 'Carnet de voyage'),
    start: String(TRIP_START || ''),
    end:   String(TRIP_END   || ''),
  }).replace(/</g, '\\u003c');
  const emptyState = stages.length === 0;

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Livre photo — ${TRIP_TITLE}</title><style>${CSS}
      .liv-wrap{max-width:1100px;margin:0 auto;padding:20px 14px 60px}
      .liv-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px}
      .liv-field{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ink-mid);background:var(--mist);border:1.5px solid var(--sand);border-radius:22px;padding:7px 14px}
      .liv-field select{font-family:inherit;font-size:13px;font-weight:600;color:var(--ink-mid);border:none;background:transparent;cursor:pointer}
      .liv-field input[type=checkbox]{accent-color:var(--emerald);width:15px;height:15px;cursor:pointer}
      .liv-status{font-size:13px;color:var(--ink-light);font-weight:500;flex-basis:100%}
      .liv-btn{font-family:inherit;font-size:13px;font-weight:600;padding:9px 16px;border-radius:22px;border:1.5px solid var(--sand);background:var(--mist);color:var(--ink-mid);cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:6px}
      .liv-btn:hover{background:var(--sage);border-color:var(--teal-light)}
      .liv-btn.primary{background:linear-gradient(135deg,var(--emerald),var(--emerald-mid));color:#fff;border-color:transparent}
      .liv-btn:disabled{opacity:.5;cursor:default}
      .liv-pages{display:flex;flex-direction:column;gap:18px}
      .liv-page{background:#fff;border-radius:14px;padding:12px;border:1px solid var(--sand);box-shadow:0 4px 20px rgba(10,61,98,0.08)}
      .liv-page canvas{display:block;width:100%;height:auto;border-radius:4px;box-shadow:0 2px 10px rgba(10,61,98,0.12)}
      .liv-page-label{font-size:12px;font-weight:600;color:var(--ink-light);margin:0 0 8px 2px}
    </style>
  </head><body>
    ${renderHeader({ activePage: 'sys-livre', isAdmin: true, isStrictAdmin, showMap: false })}
    <div class="liv-wrap">
      <div class="form-card" style="margin-bottom:16px">
        <a href="/settings" class="sys-back">← Système</a>
        <h2 style="margin-bottom:6px">📖 Livre photo du voyage</h2>
        <p style="font-size:14px;color:var(--ink-light);line-height:1.6;margin:0">Une page A4 par étape : le titre, la date, les chiffres du jour, le récit, et les photos assemblées en collage. La carte du voyage fait la couverture, le profil altimétrique la quatrième. À imprimer recto pour relier, ou à envoyer tel quel à un imprimeur.</p>
      </div>
      ${emptyState
        ? `<div class="form-card"><p style="font-size:14px;color:var(--ink-light);margin:0">Aucune étape à mettre en livre pour le moment.</p></div>`
        : `<div class="liv-toolbar">
             <label class="liv-field">Format
               <select id="livFormat">
                 <option value="a4">A4 portrait</option>
                 <option value="carre">Carré 21 × 21 cm</option>
               </select>
             </label>
             <label class="liv-field"><input type="checkbox" id="livCover" checked> Couverture et quatrième</label>
             <label class="liv-field">Carte de couverture
               <select id="livFond">
                 <option value="clean">épurée</option>
                 <option value="osm">OpenStreetMap</option>
               </select>
             </label>
             <label class="liv-field"><input type="checkbox" id="livText" checked> Récit des étapes</label>
             <button class="liv-btn primary" id="livPrint" disabled>🖨️ Imprimer / PDF</button>
             <button class="liv-btn" id="livPng" disabled>⬇️ Pages en PNG</button>
             <span class="liv-status" id="livStatus">Chargement…</span>
           </div>
           <div class="liv-pages" id="livPages"></div>`}
    </div>
    ${emptyState ? '' : `<script>
    (function(){
      var STAGES = ${dataJson};
      var META   = ${metaJson};
      var GEO_URL = '/public/geo/countries-50m.json';

${CANVAS_KIT}

      // Pages à 150 dpi : A4 portrait (210 × 297 mm) ou carré 21 × 21 cm.
      var SHEETS = { a4:{ w:1240, h:1754 }, carre:{ w:1240, h:1240 } };
      var C = {
        paper:'#fbfaf6', ink:'#1a3a3a', inkSoft:'#5a8080', rule:'#dde6e2',
        sea:'#dceaef', land:'#eef0e4', border:'#9fb2ad', coast:'#4c7a80',
        track:'#e07a3a', card:'#ffffff', shadow:'rgba(26,58,58,0.20)'
      };
      var MAX_PHOTOS = 6;      // au-delà, le collage devient illisible
      var THUMB = 520;

      var el = {
        pages:  document.getElementById('livPages'),
        status: document.getElementById('livStatus'),
        format: document.getElementById('livFormat'),
        cover:  document.getElementById('livCover'),
        fond:   document.getElementById('livFond'),
        text:   document.getElementById('livText'),
        print:  document.getElementById('livPrint'),
        png:    document.getElementById('livPng')
      };
      var world=null, tracks=null, canvases=[], drawing=false, pending=false;
      var coverTiles=null, coverKey='';

      function setStatus(t){ el.status.textContent=t; }
      function opts(){
        return {
          sheet: SHEETS[el.format.value] || SHEETS.a4,
          cover: el.cover.checked,
          fond:  el.fond.value === 'osm' ? 'osm' : 'clean',
          text:  el.text.checked
        };
      }

      // ── Le récit : du HTML de l'éditeur à des paragraphes de texte ──
      function textOf(html){
        if(!html) return [];
        var prepared=String(html)
          .replace(/<br\\s*\\/?>/gi, '\\n')
          .replace(/<\\/(p|div|li|h[1-6])>/gi, '\\n\\n')
          .replace(/<li[^>]*>/gi, '• ');
        var box=document.createElement('div');
        box.innerHTML=prepared;
        return (box.textContent||'').split(/\\n{2,}/)
          .map(function(t){ return t.replace(/\\s+/g,' ').trim(); })
          .filter(Boolean);
      }

      // Tirage reproductible : le collage d'une étape doit être le même à
      // l'aperçu et à l'impression.
      function rng(seed){
        var s=seed*2654435761 % 2147483647;
        return function(){ s=(s*16807)%2147483647; return (s-1)/2147483646; };
      }

      // ── Projection du tracé dans un rectangle ───────────
      function traceProjector(rect, pad){
        var xlo=Infinity,xhi=-Infinity,ylo=Infinity,yhi=-Infinity;
        tracks.forEach(function(t){ t.pts.forEach(function(p){
          var x=mercX(p.lon), y=mercY(p.lat);
          if(x<xlo)xlo=x; if(x>xhi)xhi=x; if(y<ylo)ylo=y; if(y>yhi)yhi=y;
        }); });
        STAGES.forEach(function(s){
          if(s.lat==null||s.lon==null) return;
          var x=mercX(s.lon), y=mercY(s.lat);
          if(x<xlo)xlo=x; if(x>xhi)xhi=x; if(y<ylo)ylo=y; if(y>yhi)yhi=y;
        });
        if(!isFinite(xlo)) return null;
        var w=rect.w-2*pad, h=rect.h-2*pad;
        var k=Math.min(w/Math.max(xhi-xlo,1e-6), h/Math.max(yhi-ylo,1e-6));
        var cx=(xlo+xhi)/2, cy=(ylo+yhi)/2;
        var proj=function(lat,lon){
          return [ rect.x+rect.w/2+(mercX(lon)-cx)*k, rect.y+rect.h/2-(mercY(lat)-cy)*k ];
        };
        // L'emprise porte à la fois les degrés (pour trier les formes du fond
        // de carte) et les coordonnées Mercator (dont les tuiles ont besoin).
        var xl=cx-(rect.w/2)/k, xr=cx+(rect.w/2)/k;
        var yb=cy-(rect.h/2)/k, yt=cy+(rect.h/2)/k;
        proj.view={ west:xl/RAD, east:xr/RAD, south:invMercY(yb), north:invMercY(yt),
                    xleft:xl, xright:xr, ytop:yt, ybot:yb };
        return proj;
      }

      // ══════════════════════════════════════════════════
      //  Les pages
      // ══════════════════════════════════════════════════
      function drawCovers(g, S, o){
        g.fillStyle=C.paper; g.fillRect(0,0,S.w,S.h);
        var M=Math.round(S.w*0.09);
        var rect={ x:M, y:Math.round(S.h*0.20), w:S.w-2*M, h:Math.round(S.h*0.52) };
        var proj=traceProjector(rect, 20);

        // La carte du voyage, en pleine page : tuiles OpenStreetMap si elles
        // ont pu être chargées, sinon le fond épuré — mer, terres, littoraux
        // et frontières — dessiné depuis le même TopoJSON que l'affiche.
        if(proj){
          g.save();
          g.beginPath(); g.rect(rect.x,rect.y,rect.w,rect.h); g.clip();
          var view=proj.view;
          var osm = o.fond==='osm' && coverTiles && coverTiles.ok;
          if(osm){
            drawTiles(g, rect, coverTiles);
            g.fillStyle='rgba(251,250,246,0.18)';
            g.fillRect(rect.x,rect.y,rect.w,rect.h);
          } else if(world){
            g.fillStyle=C.sea; g.fillRect(rect.x,rect.y,rect.w,rect.h);
            var land=new Path2D(), drawn=0;
            world.rings.forEach(function(ring){
              if(!boxHits(ring.box,view)) return;
              var pts=ring.pts, p0=proj(pts[0][1],pts[0][0]);
              land.moveTo(p0[0],p0[1]);
              for(var i=1;i<pts.length;i++){ var p=proj(pts[i][1],pts[i][0]); land.lineTo(p[0],p[1]); }
              land.closePath(); drawn++;
            });
            if(drawn){ g.fillStyle=C.land; g.fill(land,'evenodd'); }
            [false,true].forEach(function(shared){
              g.strokeStyle=shared?C.border:C.coast; g.lineWidth=shared?1:1.4;
              g.setLineDash(shared?[6,5]:[]);
              g.beginPath();
              world.lines.forEach(function(l){
                if(l.shared!==shared || !boxHits(l.box,view)) return;
                var pts=l.pts, p0=proj(pts[0][1],pts[0][0]);
                g.moveTo(p0[0],p0[1]);
                for(var i=1;i<pts.length;i++){ var p=proj(pts[i][1],pts[i][0]); g.lineTo(p[0],p[1]); }
              });
              g.stroke(); g.setLineDash([]);
            });
          }
          g.restore();
          g.strokeStyle='rgba(26,58,58,0.12)'; g.lineWidth=1;
          g.strokeRect(rect.x+0.5, rect.y+0.5, rect.w-1, rect.h-1);
        }
        if(proj){
          g.lineJoin='round'; g.lineCap='round';
          [['#ffffff',7,0.9],[C.track,3.4,1]].forEach(function(st){
            g.strokeStyle=st[0]; g.lineWidth=st[1]; g.globalAlpha=st[2];
            g.beginPath();
            tracks.forEach(function(t){
              if(t.pts.length<2) return;
              var p0=proj(t.pts[0].lat,t.pts[0].lon);
              g.moveTo(p0[0],p0[1]);
              for(var i=1;i<t.pts.length;i++){ var p=proj(t.pts[i].lat,t.pts[i].lon); g.lineTo(p[0],p[1]); }
            });
            g.stroke(); g.globalAlpha=1;
          });
          [[0,'#e67e22'],[STAGES.length-1,'#1a7a4a']].forEach(function(e){
            var s=STAGES[e[0]];
            if(!s || s.lat==null) return;
            var p=proj(s.lat,s.lon);
            g.beginPath(); g.arc(p[0],p[1],9,0,Math.PI*2);
            g.fillStyle=e[1]; g.fill();
            g.strokeStyle='#fff'; g.lineWidth=3; g.stroke();
          });
        }

        // Titre et sous-titre
        var tot=totals();
        g.textAlign='center'; g.textBaseline='alphabetic'; g.fillStyle=C.ink;
        var maxW=S.w-2*M, fs=Math.round(S.w*0.058);
        do {
          g.font='700 '+fs+'px "Playfair Display", Georgia, serif';
          if(g.measureText(META.title).width<=maxW) break;
          fs-=2;
        } while(fs>Math.round(S.w*0.026));
        g.fillText(fit(g, META.title, maxW), S.w/2, Math.round(S.h*0.145));
        var d1=frDate(META.start||(STAGES[0]||{}).date), d2=frDate(META.end||(STAGES[STAGES.length-1]||{}).date);
        g.fillStyle=C.inkSoft; g.font='400 '+Math.round(S.w*0.019)+'px "DM Sans", Helvetica, sans-serif';
        if(d1&&d2) g.fillText(d1+'  →  '+d2, S.w/2, Math.round(S.h*0.175));
        g.fillStyle=C.ink; g.font='500 '+Math.round(S.w*0.022)+'px "DM Sans", Helvetica, sans-serif';
        g.fillText(STAGES.length+' étapes   ·   '+frNum(tot.km)+' km   ·   '+frNum(tot.dplus)+' m D+',
          S.w/2, Math.round(S.h*0.80));
        g.strokeStyle=C.rule; g.lineWidth=1.5;
        g.beginPath(); g.moveTo(S.w/2-90, Math.round(S.h*0.83)); g.lineTo(S.w/2+90, Math.round(S.h*0.83)); g.stroke();
      }

      // Quatrième de couverture : le profil altimétrique du voyage entier
      function drawBack(g, S){
        g.fillStyle=C.paper; g.fillRect(0,0,S.w,S.h);
        var M=Math.round(S.w*0.09);
        var prof=[], cum=0, has=false;
        tracks.forEach(function(t){
          var span=t.pts.length?t.pts[t.pts.length-1].d:0;
          t.pts.forEach(function(p){ if(!isNaN(p.ele)){ has=true; prof.push([cum+p.d,p.ele]); } });
          cum+=span;
        });
        g.textAlign='center'; g.fillStyle=C.ink;
        g.font='700 '+Math.round(S.w*0.034)+'px "Playfair Display", Georgia, serif';
        g.fillText('Le relief du voyage', S.w/2, Math.round(S.h*0.16));

        if(has && prof.length>1){
          var x0=M, w=S.w-2*M, top=Math.round(S.h*0.30), h=Math.round(S.h*0.30), bot=top+h;
          var lo=Infinity, hi=-Infinity;
          prof.forEach(function(p){ if(p[1]<lo)lo=p[1]; if(p[1]>hi)hi=p[1]; });
          var span2=Math.max(hi-lo,1), total=prof[prof.length-1][0]||1;
          var px=function(d){ return x0+d/total*w; }, py=function(e){ return bot-(e-lo)/span2*h; };
          g.beginPath(); g.moveTo(px(prof[0][0]),py(prof[0][1]));
          for(var i=1;i<prof.length;i++) g.lineTo(px(prof[i][0]),py(prof[i][1]));
          g.lineTo(px(prof[prof.length-1][0]),bot); g.lineTo(px(prof[0][0]),bot); g.closePath();
          var grad=g.createLinearGradient(0,top,0,bot);
          grad.addColorStop(0,'rgba(45,122,90,0.40)'); grad.addColorStop(1,'rgba(45,122,90,0.05)');
          g.fillStyle=grad; g.fill();
          g.beginPath(); g.moveTo(px(prof[0][0]),py(prof[0][1]));
          for(var j=1;j<prof.length;j++) g.lineTo(px(prof[j][0]),py(prof[j][1]));
          g.strokeStyle='#2a7a7a'; g.lineWidth=1.8; g.lineJoin='round'; g.stroke();
          g.strokeStyle=C.rule; g.lineWidth=1;
          g.beginPath(); g.moveTo(x0,bot); g.lineTo(x0+w,bot); g.stroke();
          g.font='500 13px "DM Sans", Helvetica, sans-serif'; g.fillStyle=C.inkSoft;
          g.textAlign='left';  g.fillText('0 km', x0, bot+22);
          g.textAlign='right'; g.fillText(frNum(total/1000)+' km', x0+w, bot+22);
          g.textAlign='center';g.fillText(frNum(lo)+' m  →  '+frNum(hi)+' m', S.w/2, bot+22);
        } else {
          g.fillStyle=C.inkSoft; g.font='400 15px "DM Sans", Helvetica, sans-serif';
          g.fillText('Aucune altitude dans les traces GPX', S.w/2, Math.round(S.h*0.32));
        }

        var tot=totals();
        g.textAlign='center'; g.fillStyle=C.ink;
        g.font='500 '+Math.round(S.w*0.020)+'px "DM Sans", Helvetica, sans-serif';
        g.fillText(frNum(tot.dplus)+' mètres de dénivelé positif', S.w/2, Math.round(S.h*0.72));
        g.fillStyle=C.inkSoft; g.font='400 13px "DM Sans", Helvetica, sans-serif';
        g.fillText('Traces GPX du carnet  ·  Fond de carte : '
          + (opts().fond==='osm' && coverTiles ? '© OpenStreetMap contributors' : 'Natural Earth'),
          S.w/2, S.h-Math.round(S.h*0.06));
      }

      function totals(){
        var km=0, dplus=0;
        STAGES.forEach(function(s){ km+=s.km||0; dplus+=s.dplus||0; });
        return { km:km, dplus:dplus };
      }

      // ── Une page d'étape ────────────────────────────────
      function drawStage(g, S, stage, num, o){
        g.fillStyle=C.paper; g.fillRect(0,0,S.w,S.h);
        var M=Math.round(S.w*0.075), x=M, w=S.w-2*M, y=Math.round(S.h*0.062);

        // Bandeau : numéro d'étape et date
        g.textAlign='left'; g.textBaseline='alphabetic';
        g.fillStyle=C.inkSoft; g.font='600 13px "DM Sans", Helvetica, sans-serif';
        var kicker='ÉTAPE '+num;
        var d=stage.date?new Date(stage.date):null;
        if(d && !isNaN(d.getTime())) kicker+='   ·   '+d.toLocaleDateString('fr-FR',{ day:'numeric', month:'long', year:'numeric' }).toUpperCase();
        g.fillText(kicker, x, y);
        y+=Math.round(S.w*0.036);

        // Titre et lieu
        g.fillStyle=C.ink; g.font='700 '+Math.round(S.w*0.040)+'px "Playfair Display", Georgia, serif';
        wrapText(g, stage.title||stage.location||'Étape '+num, w, 2).forEach(function(line){
          g.fillText(line, x, y); y+=Math.round(S.w*0.046);
        });
        if(stage.location && stage.location!==stage.title){
          g.fillStyle=C.inkSoft; g.font='400 '+Math.round(S.w*0.019)+'px "DM Sans", Helvetica, sans-serif';
          g.fillText(fit(g,'📍 '+stage.location, w), x, y); y+=Math.round(S.w*0.028);
        }

        // Chiffres du jour
        var bits=[];
        if(stage.km)      bits.push(frNum(stage.km)+' km');
        if(stage.dplus)   bits.push(frNum(stage.dplus)+' m D+');
        if(stage.trainKm) bits.push(frNum(stage.trainKm)+' km en train');
        if(bits.length){
          g.fillStyle=C.ink; g.font='500 '+Math.round(S.w*0.017)+'px "DM Sans", Helvetica, sans-serif';
          g.fillText(bits.join('   ·   '), x, y); y+=Math.round(S.w*0.020);
        }
        g.strokeStyle=C.rule; g.lineWidth=1.2;
        g.beginPath(); g.moveTo(x,y); g.lineTo(x+w,y); g.stroke();
        y+=Math.round(S.w*0.030);

        // Récit — il ne prend jamais plus de la moitié de la page, pour que
        // les photos gardent la leur.
        if(o.text){
          var fs=Math.round(S.w*0.0155), lh=Math.round(fs*1.62);
          g.font='400 '+fs+'px "DM Sans", Helvetica, sans-serif';
          var maxY=Math.round(S.h*0.52), paras=textOf(stage.body);
          for(var pi=0; pi<paras.length && y<maxY; pi++){
            var lines=wrapText(g, paras[pi], w, Math.max(1, Math.floor((maxY-y)/lh)));
            g.fillStyle='#33504e';
            for(var li=0; li<lines.length; li++){ g.fillText(lines[li], x, y+lh*0.8); y+=lh; }
            y+=Math.round(lh*0.45);
          }
          y+=Math.round(S.w*0.012);
        }

        // Collage de photos sur tout l'espace restant
        var bottom=S.h-Math.round(S.h*0.055);
        collage(g, stage, num, { x:x, y:y, w:w, h:bottom-y });

        // Pied de page
        g.textAlign='center'; g.fillStyle='#a8bcb8';
        g.font='400 12px "DM Sans", Helvetica, sans-serif';
        g.fillText(String(num), S.w/2, S.h-Math.round(S.h*0.028));
      }

      // Montage à la manière d'un carnet de collage : des photos posées de
      // travers, débordant légèrement les unes sur les autres, chacune avec sa
      // marge blanche et son ombre portée.
      function collage(g, stage, num, box){
        var list=(stage.photos||[]).slice(0, MAX_PHOTOS);
        if(!list.length || box.h<80) return;
        var n=list.length;
        var cols = n===1?1 : (n<=2? (box.w>box.h?2:1) : (n<=6?2:3));
        var rows = Math.ceil(n/cols);
        if(box.h/rows < 120 && cols<3){ cols++; rows=Math.ceil(n/cols); }
        var cw=box.w/cols, ch=box.h/rows;
        var rand=rng(num*97+n);

        for(var i=0;i<n;i++){
          var r=Math.floor(i/cols), c=i%cols;
          // Dernière rangée incomplète : on la centre
          var inRow=Math.min(cols, n-r*cols);
          var rowW=box.w/inRow;
          var cx=box.x+rowW*(c+0.5)+(inRow===cols?0:0);
          if(inRow!==cols) cx=box.x+box.w/2+(c-(inRow-1)/2)*rowW;
          var cy=box.y+ch*(r+0.5);
          var scale=(i===0?1.14:1.02)+rand()*0.10;    // la préférée en avant, débordant un peu
          var tw=Math.min(rowW, cw)*scale*0.94, th=ch*scale*0.90;
          var ang=(rand()-0.5)*0.19;                  // ± 5,5°
          var pad=Math.max(6, Math.round(tw*0.035));

          g.save();
          g.translate(cx+(rand()-0.5)*10, cy+(rand()-0.5)*10);
          g.rotate(ang);
          g.shadowColor=C.shadow; g.shadowBlur=16; g.shadowOffsetY=5;
          g.fillStyle=C.card;
          g.fillRect(-tw/2, -th/2, tw, th);
          g.shadowColor='transparent';
          var entry=imgs[list[i]];
          if(entry && entry.cv){
            drawCover(g, entry.cv, -tw/2+pad, -th/2+pad, tw-2*pad, th-2*pad-Math.round(pad*0.4));
          } else {
            g.fillStyle='#e8f7f4'; g.fillRect(-tw/2+pad, -th/2+pad, tw-2*pad, th-2*pad);
          }
          g.restore();
        }
      }

      // ══════════════════════════════════════════════════
      //  Rendu
      // ══════════════════════════════════════════════════
      function pageList(o){
        var pages=[];
        if(o.cover) pages.push({ kind:'cover', label:'Couverture' });
        STAGES.forEach(function(s,i){
          pages.push({ kind:'stage', stage:s, num:i+1, label:'Étape '+(i+1)+' — '+(s.location||s.title||'') });
        });
        if(o.cover) pages.push({ kind:'back', label:'Quatrième de couverture' });
        return pages;
      }
      function drawPage(g, page, S, o){
        if(page.kind==='cover') drawCovers(g,S,o);
        else if(page.kind==='back') drawBack(g,S);
        else drawStage(g,S,page.stage,page.num,o);
      }

      function render(){
        var o=opts(), S=o.sheet, pages=pageList(o);
        el.pages.innerHTML=''; canvases=[];
        pages.forEach(function(page,i){
          var wrap=document.createElement('div'); wrap.className='liv-page';
          var lab=document.createElement('div'); lab.className='liv-page-label';
          lab.textContent=(i+1)+'/'+pages.length+' — '+page.label;
          var cv=document.createElement('canvas'); cv.width=S.w; cv.height=S.h;
          wrap.appendChild(lab); wrap.appendChild(cv); el.pages.appendChild(wrap);
          drawPage(cv.getContext('2d'), page, S, o);
          canvases.push(cv);
        });
        return pages.length;
      }

      function refresh(){
        if(drawing){ pending=true; return; }
        drawing=true; pending=false;
        // Pas d'export tant que la composition n'est pas finie : le livre
        // imprimé serait celui d'avant le réglage qu'on vient de changer.
        [el.print,el.png].forEach(function(b){ b.disabled=true; });
        var o=opts();
        var need=[];
        STAGES.forEach(function(s){
          (s.photos||[]).slice(0,MAX_PHOTOS).forEach(function(u){
            if(u && imgs[u]===undefined) need.push(u);
          });
        });
        var chain=Promise.resolve();

        // Tuiles de la couverture : même emprise que la carte qui y sera
        // dessinée, et le même cache pour tout le livre.
        if(o.cover && o.fond==='osm'){
          chain=chain.then(function(){
            var S=o.sheet, M=Math.round(S.w*0.09);
            var rect={ x:M, y:Math.round(S.h*0.20), w:S.w-2*M, h:Math.round(S.h*0.52) };
            var proj=traceProjector(rect, 20);
            if(!proj) return;
            var z=tileZoom(proj.view, rect);
            var key=[proj.view.west.toFixed(3),proj.view.east.toFixed(3),z].join('|');
            if(coverTiles && coverKey===key) return;
            setStatus('Chargement du fond OpenStreetMap (' + tileCount(proj.view,z) + ' tuiles)…');
            return loadTiles(proj.view, z, function(done,total){
              if(done%8===0||done===total) setStatus('Chargement du fond OpenStreetMap ('+done+' / '+total+')…');
            }).then(function(set){ coverTiles = set.ok ? set : null; coverKey=key; },
                    function(){ coverTiles=null; });
          });
        } else {
          coverTiles=null; coverKey='';
        }

        if(need.length){
          chain=chain.then(function(){
            setStatus('Chargement des photos (0 / '+need.length+')…');
            return loadThumbs(need, THUMB, function(done,total){
              if(done%4===0||done===total) setStatus('Chargement des photos ('+done+' / '+total+')…');
            });
          });
        }
        chain.then(function(){
          var n=render();
          setStatus(n+' page'+(n>1?'s':'')+' · '+STAGES.length+' étape'+(STAGES.length>1?'s':'')
            +' · '+(el.format.value==='carre'?'21 × 21 cm':'A4 portrait')+' à 150 dpi');
          [el.print,el.png].forEach(function(b){ b.disabled=false; });
        }).catch(function(e){
          setStatus('Erreur pendant la composition : '+(e&&e.message?e.message:e));
        }).then(function(){
          drawing=false; if(pending) refresh();
        });
      }

      // ── Export ──────────────────────────────────────────
      el.png.addEventListener('click', function(){
        setStatus('Téléchargement des pages…');
        canvases.forEach(function(cv,i){
          setTimeout(function(){
            cv.toBlob(function(blob){
              if(!blob) return;
              var url=URL.createObjectURL(blob), a=document.createElement('a');
              a.href=url; a.download='livre-page-'+String(i+1).padStart(2,'0')+'.png';
              a.click();
              setTimeout(function(){ URL.revokeObjectURL(url); }, 8000);
            }, 'image/png');
          }, i*350);
        });
      });

      el.print.addEventListener('click', function(){
        setStatus('Préparation de l\\'impression…');
        Promise.all(canvases.map(function(cv){
          return new Promise(function(res){ cv.toBlob(function(b){ res(URL.createObjectURL(b)); },'image/png'); });
        })).then(function(urls){
          var w=window.open('','_blank');
          if(!w){ setStatus('Autorisez les fenêtres pop-up pour imprimer.'); return; }
          var square=el.format.value==='carre';
          w.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">'
            +'<title>Livre photo</title><style>'
            +'@page{size:'+(square?'210mm 210mm':'A4 portrait')+';margin:0}'
            +'html,body{margin:0;padding:0;background:#fff}'
            +'img{display:block;width:100%;height:auto;break-after:page;page-break-after:always}'
            +'img:last-child{break-after:auto;page-break-after:auto}'
            +'</style></head><body>'
            + urls.map(function(u){ return '<img src="'+u+'">'; }).join('')
            +'</body></html>');
          w.document.close(); w.focus();
          setTimeout(function(){ w.print(); setStatus('Fenêtre d\\'impression ouverte.'); }, 900);
        });
      });

      [el.format,el.fond].forEach(function(s){ s.addEventListener('change', refresh); });
      [el.cover,el.text].forEach(function(c){ c.addEventListener('change', refresh); });

      // ── Démarrage ───────────────────────────────────────
      setStatus('Chargement des traces et du fond de carte…');
      Promise.all([
        loadJson(GEO_URL).then(function(t){ return decodeWorld(t); }, function(){ return null; }),
        Promise.all(STAGES.map(function(s){
          if(!s.gpx) return Promise.resolve({ stage:s, pts:[] });
          return loadText(s.gpx).then(function(txt){ return { stage:s, pts:parseGpx(txt) }; },
                                      function(){ return { stage:s, pts:[] }; });
        })),
        (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve()
      ]).then(function(r){
        world=r[0]; tracks=r[1];
        refresh();
      }).catch(function(e){
        setStatus('Erreur de chargement : '+(e&&e.message?e.message:e));
      });
    })();
    </script>`}
  </body></html>`;
}

module.exports = { renderLivre };
