// ── Panorama : coupe altimétrique continue du voyage ──────
const { TRIP_TITLE } = require('../config');
const { CSS, renderHeader } = require('./layout');

// ══════════════════════════════════════════════════════════
// Génère (côté client, sur canvas) le panorama du voyage : tous les profils
// de dénivelé mis bout à bout, un trait en biais vers chaque point d'arrivée
// de GPX, et la photo favorite de chaque étape reliée à sa trace.
// Le tracé est découpé en pages A4 paysage successives, à recoller bord à
// bord : chaque page reprend exactement là où la précédente s'arrête.
function renderPanorama(stages, isStrictAdmin = false) {
  // Embarquage sûr des données (évite la fermeture prématurée de </script>)
  const dataJson  = JSON.stringify(stages).replace(/</g, '\\u003c');
  const titleJson = JSON.stringify(String(TRIP_TITLE || 'Panorama')).replace(/</g, '\\u003c');
  const emptyState = stages.length === 0;

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Panorama — ${TRIP_TITLE}</title><style>${CSS}
      .pano-wrap{max-width:1200px;margin:0 auto;padding:20px 14px 60px}
      .pano-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px}
      .pano-status{font-size:13px;color:var(--ink-light);font-weight:500}
      .pano-pages{display:flex;flex-direction:column;gap:18px}
      .pano-page{background:#fff;border-radius:18px;padding:12px 14px 14px;border:1px solid var(--sand);box-shadow:0 4px 20px rgba(10,61,98,0.08)}
      .pano-page canvas{display:block;width:100%;height:auto;background:#fff;border-radius:8px}
      .pano-page-label{font-size:12px;font-weight:600;color:var(--ink-light);margin:0 0 8px 2px}
      .pano-btn{font-family:inherit;font-size:13px;font-weight:600;padding:9px 16px;border-radius:22px;border:1.5px solid var(--sand);background:var(--mist);color:var(--ink-mid);cursor:pointer;transition:all .15s;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
      .pano-btn:hover{background:var(--sage);border-color:var(--teal-light)}
      .pano-btn.primary{background:linear-gradient(135deg,var(--emerald),var(--emerald-mid));color:#fff;border-color:transparent}
      .pano-btn:disabled{opacity:.5;cursor:default}
    </style>
  </head><body>
    ${renderHeader({ activePage: 'sys-panorama', isAdmin: true, isStrictAdmin, showMap: false })}
    <div class="pano-wrap">
      <div class="form-card" style="margin-bottom:16px">
        <a href="/settings" class="sys-back">← Système</a>
        <h2 style="margin-bottom:6px">🏔️ Panorama du voyage</h2>
        <p style="font-size:14px;color:var(--ink-light);line-height:1.6;margin:0">Tous les dénivelés bout à bout, découpés en pages A4 paysage à recoller. Chaque trait en biais pointe vers le point d'arrivée d'une trace GPX et sa photo favorite.</p>
      </div>
      ${emptyState
        ? `<div class="form-card"><p style="font-size:14px;color:var(--ink-light);margin:0">Aucune étape avec trace GPX pour le moment. Ajoutez des étapes avec un fichier <code>.gpx</code> pour générer le panorama.</p></div>`
        : `<div class="pano-toolbar">
             <span class="pano-status" id="panoStatus">Chargement des traces…</span>
             <button class="pano-btn primary" id="panoDownload" disabled>⬇️ Télécharger les pages (PNG)</button>
             <button class="pano-btn" id="panoPrint" disabled>🖨️ Imprimer / PDF (A4)</button>
           </div>
           <div class="pano-pages" id="panoPages"></div>`}
    </div>
    ${emptyState ? '' : `<script>
    (function(){
      var STAGES = ${dataJson};
      var TRIP   = ${titleJson};
      var pagesEl  = document.getElementById('panoPages');
      var statusEl = document.getElementById('panoStatus');
      var dlBtn    = document.getElementById('panoDownload');
      var prBtn    = document.getElementById('panoPrint');

      // Page A4 paysage à 150 dpi (297 × 210 mm)
      var PAGE_W = 1754, PAGE_H = 1240;
      var MARGIN = 48;          // marge extérieure de la page
      var GUTTER = 58;          // gouttière des altitudes, répétée à chaque page
      var PLOT_L = MARGIN + GUTTER;
      var PAGE_PLOT_W = PAGE_W - MARGIN - PLOT_L;   // largeur utile de tracé
      var SLOT_MIN = 330;       // largeur mini réservée à chaque étape
      var canvases = [];

      function haversine(la1,lo1,la2,lo2){
        var R=6371000,dLa=(la2-la1)*Math.PI/180,dLo=(lo2-lo1)*Math.PI/180;
        var a=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)*Math.sin(dLo/2);
        return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
      }
      // Même logique que le profil de dénivelé des étapes (ELEV_MODAL_JS)
      function buildProfile(txt){
        var xml=new DOMParser().parseFromString(txt,'text/xml');
        var trkpts=Array.prototype.slice.call(xml.querySelectorAll('trkpt'));
        var pts=[],distCum=0,prev=null;
        trkpts.forEach(function(tp){
          var lat=parseFloat(tp.getAttribute('lat')),lon=parseFloat(tp.getAttribute('lon'));
          var eleEl=tp.querySelector('ele');
          var ele=eleEl?parseFloat(eleEl.textContent):NaN;
          if(isNaN(lat)||isNaN(lon))return;
          if(prev)distCum+=haversine(prev.lat,prev.lon,lat,lon);
          pts.push({ele:ele,dist:distCum});
          prev={lat:lat,lon:lon};
        });
        return pts;
      }
      function loadText(url){
        return fetch(url).then(function(r){ if(!r.ok) throw new Error('http'); return r.text(); });
      }
      function loadImg(url){
        return new Promise(function(res){
          if(!url){ res(null); return; }
          var im=new Image();
          im.onload=function(){ res(im); };
          im.onerror=function(){ res(null); };
          im.src=url;
        });
      }
      function drawCover(g,img,x,y,w,h){
        var ir=img.width/img.height, r=w/h, sw,sh,sx,sy;
        if(ir>r){ sh=img.height; sw=sh*r; sx=(img.width-sw)/2; sy=0; }
        else { sw=img.width; sh=sw/r; sx=0; sy=(img.height-sh)/2; }
        g.drawImage(img,sx,sy,sw,sh,x,y,w,h);
      }
      function roundRect(g,x,y,w,h,rad){
        g.beginPath();
        g.moveTo(x+rad,y);
        g.arcTo(x+w,y,x+w,y+h,rad);
        g.arcTo(x+w,y+h,x,y+h,rad);
        g.arcTo(x,y+h,x,y,rad);
        g.arcTo(x,y,x+w,y,rad);
        g.closePath();
      }

      // 1) Charger toutes les traces + photos favorites en parallèle
      Promise.all(STAGES.map(function(s){
        return Promise.all([
          loadText(s.gpx).then(function(txt){ return buildProfile(txt); }, function(){ return []; }),
          loadImg(s.photo)
        ]).then(function(r){ return { stage:s, pts:r[0], img:r[1] }; });
      })).then(function(loaded){
        var pages = draw(loaded);
        statusEl.textContent = loaded.length + ' étape(s) · ' +
          loaded.filter(function(l){return l.pts.length>1;}).length + ' trace(s) avec altitude · ' +
          pages + ' page(s) A4';
        dlBtn.disabled = false;
        prBtn.disabled = false;
      }).catch(function(){
        statusEl.textContent = 'Erreur lors du chargement des traces.';
      });

      function draw(loaded){
        // Concaténation bout à bout
        var elevPts=[];      // {x:distCumGlobale, e:altitude}
        var arrivals=[];     // point d'arrivée de chaque étape
        var cum=0, lastEle=NaN;
        loaded.forEach(function(l){
          var pts=l.pts;
          var span = pts.length ? pts[pts.length-1].dist : 0;
          pts.forEach(function(p){
            if(!isNaN(p.ele)){ lastEle=p.ele; elevPts.push({x:cum+p.dist, e:p.ele}); }
          });
          cum += span;
          arrivals.push({ x:cum, ele:lastEle, stage:l.stage, img:l.img });
        });
        var totalDist = cum || 1;
        var N = loaded.length;

        // Nombre de pages A4 : on garde SLOT_MIN de large par étape, et le
        // tracé occupe exactement la largeur utile de toutes les pages.
        var pages  = Math.max(1, Math.ceil(Math.max(PAGE_PLOT_W, N*SLOT_MIN)/PAGE_PLOT_W));
        var totalW = pages*PAGE_PLOT_W;   // repère horizontal « global »

        // Bandes verticales (identiques sur chaque page)
        var PROF_BOT = PAGE_H-124, PLOT_H = 430, PROF_TOP = PROF_BOT-PLOT_H;
        var CARD_TOP = 132, CARD_H = 240, IMG_PAD = 8;

        // Échelle altitude, commune à toutes les pages
        var minE=Infinity,maxE=-Infinity;
        elevPts.forEach(function(p){ if(p.e<minE)minE=p.e; if(p.e>maxE)maxE=p.e; });
        if(!isFinite(minE)){ minE=0; maxE=1; }
        var range=Math.max(maxE-minE,1), padE=range*0.12;
        var loE=minE-padE, hiE=maxE+padE, spanE=hiE-loE;
        function px(d){ return (d/totalDist)*totalW; }   // coordonnée globale
        function py(e){ return PROF_TOP+PLOT_H-((e-loE)/spanE)*PLOT_H; }

        // Cartes photo : réparties sur toute la largeur, puis ramenées à
        // l'intérieur d'une seule page pour ne jamais être coupées en deux.
        var slot  = totalW/Math.max(N,1);
        var cardW = Math.max(120, Math.min(310, slot-24));
        var cards = arrivals.map(function(a, idx){
          var x = (N===1) ? (totalW-cardW)/2 : idx*((totalW-cardW)/Math.max(N-1,1));
          var pg = Math.min(pages-1, Math.max(0, Math.floor((x+cardW/2)/PAGE_PLOT_W)));
          var lo = pg*PAGE_PLOT_W+12, hi = (pg+1)*PAGE_PLOT_W-cardW-12;
          if(hi<lo) hi=lo;
          return { x: Math.min(Math.max(x,lo),hi), page: pg };
        });

        // Pas des graduations de distance (≥ 150 px entre deux libellés)
        var CANDS=[1,2,5,10,20,25,50,100,200,250,500,1000];
        var stepKm=CANDS[CANDS.length-1];
        for(var si=0;si<CANDS.length;si++){ if(px(CANDS[si]*1000)>=150){ stepKm=CANDS[si]; break; } }

        // Points du profil visibles sur une page (+ un point de part et d'autre
        // pour que la courbe entre et sorte proprement du cadre)
        function segmentFor(off){
          var x0=off-60, x1=off+PAGE_PLOT_W+60, seg=[], prev=null;
          for(var i=0;i<elevPts.length;i++){
            var gx=px(elevPts[i].x);
            if(gx<x0){ prev=elevPts[i]; continue; }
            if(gx>x1){ seg.push(elevPts[i]); break; }
            if(prev){ seg.push(prev); prev=null; }
            seg.push(elevPts[i]);
          }
          return seg;
        }

        function drawPage(g, p){
          var off = p*PAGE_PLOT_W;               // décalage global de la page
          var kmA = Math.round((off/totalW)*totalDist/1000);
          var kmB = Math.min(Math.round(totalDist/1000), Math.round(((off+PAGE_PLOT_W)/totalW)*totalDist/1000));

          // Fond blanc
          g.fillStyle='#ffffff'; g.fillRect(0,0,PAGE_W,PAGE_H);

          // En-tête
          g.fillStyle='#1a3a3a';
          g.font='700 30px "Playfair Display", serif';
          g.textAlign='left'; g.textBaseline='alphabetic';
          g.fillText(TRIP, MARGIN, 58);
          g.fillStyle='#5a8080';
          g.font='500 15px "DM Sans", sans-serif';
          g.fillText((p===0 ? N+' étapes · '+Math.round(totalDist/1000).toLocaleString('fr-FR')+' km · ' : '')
            + 'segment '+kmA.toLocaleString('fr-FR')+' → '+kmB.toLocaleString('fr-FR')+' km', MARGIN, 84);
          g.textAlign='right';
          g.font='600 14px "DM Sans", sans-serif';
          g.fillText('Page '+(p+1)+' / '+pages, PAGE_W-MARGIN, 58);

          // Grille + labels altitude (gouttière de gauche, sur chaque page)
          g.font='11px "DM Sans", sans-serif'; g.textBaseline='middle';
          for(var i=0;i<=4;i++){
            var e=loE+spanE*i/4, y=py(e);
            g.strokeStyle='rgba(42,122,122,0.10)'; g.lineWidth=1;
            g.beginPath(); g.moveTo(PLOT_L,y); g.lineTo(PAGE_W-MARGIN,y); g.stroke();
            g.fillStyle='#5a8080'; g.textAlign='right';
            g.fillText(Math.round(e).toLocaleString('fr-FR')+' m', PLOT_L-10, y);
          }

          // ── Contenu « global » : translaté puis rogné à la page ──
          g.save();
          g.beginPath(); g.rect(PLOT_L, 0, PAGE_PLOT_W, PAGE_H); g.clip();
          g.translate(PLOT_L-off, 0);

          // Aire remplie + ligne de profil continue
          var seg = segmentFor(off);
          if(seg.length>1){
            g.beginPath();
            g.moveTo(px(seg[0].x), py(seg[0].e));
            seg.forEach(function(q){ g.lineTo(px(q.x), py(q.e)); });
            g.lineTo(px(seg[seg.length-1].x), PROF_BOT);
            g.lineTo(px(seg[0].x), PROF_BOT);
            g.closePath();
            var grad=g.createLinearGradient(0,PROF_TOP,0,PROF_BOT);
            grad.addColorStop(0,'rgba(45,122,90,0.42)');
            grad.addColorStop(1,'rgba(45,122,90,0.04)');
            g.fillStyle=grad; g.fill();

            g.beginPath();
            g.moveTo(px(seg[0].x), py(seg[0].e));
            seg.forEach(function(q){ g.lineTo(px(q.x), py(q.e)); });
            g.strokeStyle='#2a7a7a'; g.lineWidth=2.5; g.lineJoin='round'; g.stroke();
          }

          // Ligne de base
          g.strokeStyle='rgba(42,122,122,0.35)'; g.lineWidth=1;
          g.beginPath();
          g.moveTo(Math.max(0,off), PROF_BOT);
          g.lineTo(Math.min(totalW, off+PAGE_PLOT_W), PROF_BOT);
          g.stroke();

          // Graduations de distance
          g.font='11px "DM Sans", sans-serif';
          g.textAlign='center'; g.textBaseline='top';
          for(var d=0; d<=totalDist; d+=stepKm*1000){
            var gx=px(d);
            if(gx<off-2 || gx>off+PAGE_PLOT_W+2) continue;
            g.strokeStyle='rgba(42,122,122,0.25)'; g.lineWidth=1;
            g.beginPath(); g.moveTo(gx, PROF_BOT); g.lineTo(gx, PROF_BOT+5); g.stroke();
            g.fillStyle='#5a8080';
            // Libellé recalé vers l'intérieur aux deux bords de la page,
            // sinon il serait coupé par le bord de la feuille.
            var near = (gx-off < 30) ? 'left' : ((off+PAGE_PLOT_W-gx < 30) ? 'right' : 'center');
            g.textAlign = near;
            g.fillText(Math.round(d/1000).toLocaleString('fr-FR')+' km',
              near==='left' ? gx-2 : (near==='right' ? gx+2 : gx), PROF_BOT+11);
          }
          g.textAlign='center';

          // Pour chaque arrivée : trait en biais + pastille + carte photo
          arrivals.forEach(function(a, idx){
            var c  = cards[idx];
            var ax = px(a.x);
            var ay = isNaN(a.ele) ? PROF_BOT : py(a.ele);
            // Étape d'une autre page : on garde seulement la pastille si son
            // point d'arrivée tombe quand même dans cette page.
            if(c.page !== p){
              if(ax>=off-8 && ax<=off+PAGE_PLOT_W+8){
                g.fillStyle='#e07a3a';
                g.beginPath(); g.arc(ax, ay, 5, 0, Math.PI*2); g.fill();
                g.strokeStyle='#fff'; g.lineWidth=2; g.stroke();
              }
              return;
            }
            var cardX = c.x, cardCX = cardX + cardW/2, cardBottom = CARD_TOP + CARD_H;

            // Trait en biais : de la photo vers le point d'arrivée
            g.strokeStyle='#e07a3a'; g.lineWidth=1.8;
            g.setLineDash([6,4]);
            g.beginPath();
            g.moveTo(cardCX, cardBottom);
            g.lineTo(ax, ay);
            g.stroke();
            g.setLineDash([]);

            // Pastille au point d'arrivée
            g.fillStyle='#e07a3a';
            g.beginPath(); g.arc(ax, ay, 5, 0, Math.PI*2); g.fill();
            g.strokeStyle='#fff'; g.lineWidth=2; g.stroke();

            // Carte photo (ombre)
            g.save();
            g.shadowColor='rgba(10,61,98,0.18)'; g.shadowBlur=14; g.shadowOffsetY=4;
            roundRect(g, cardX, CARD_TOP, cardW, CARD_H, 12);
            g.fillStyle='#ffffff'; g.fill();
            g.restore();

            // Image favorite ou placeholder
            var imgH=CARD_H-46;
            g.save();
            roundRect(g, cardX+IMG_PAD, CARD_TOP+IMG_PAD, cardW-IMG_PAD*2, imgH, 8);
            g.clip();
            if(a.img){
              drawCover(g, a.img, cardX+IMG_PAD, CARD_TOP+IMG_PAD, cardW-IMG_PAD*2, imgH);
            } else {
              g.fillStyle='#e8f7f4'; g.fillRect(cardX+IMG_PAD, CARD_TOP+IMG_PAD, cardW-IMG_PAD*2, imgH);
              g.fillStyle='#7ecece'; g.font='30px sans-serif';
              g.textAlign='center'; g.textBaseline='middle';
              g.fillText('🚴', cardCX, CARD_TOP+IMG_PAD+imgH/2);
            }
            g.restore();

            // Titre de l'étape (tronqué)
            g.fillStyle='#1a3a3a';
            g.font='600 14px "DM Sans", sans-serif';
            g.textAlign='center'; g.textBaseline='middle';
            var full = a.stage.title || a.stage.date || ('Étape '+(idx+1));
            var label = full;
            var maxW = cardW-14;
            var truncated = false;
            while(label.length>1 && g.measureText(label+'…').width>maxW){ label=label.slice(0,-1); truncated=true; }
            g.fillText(truncated ? label+'…' : full, cardCX, CARD_TOP+CARD_H-16);
          });

          g.restore();

          // Repères de raccord entre pages + cadre de la page
          g.font='600 12px "DM Sans", sans-serif'; g.textBaseline='alphabetic';
          g.fillStyle='#a8c4c4';
          if(p>0){ g.textAlign='left'; g.fillText('◀ suite de la page '+p, MARGIN, PAGE_H-40); }
          if(p<pages-1){ g.textAlign='right'; g.fillText('suite page '+(p+2)+' ▶', PAGE_W-MARGIN, PAGE_H-40); }
          if(p<pages-1){
            g.strokeStyle='rgba(224,122,58,0.35)'; g.lineWidth=1; g.setLineDash([5,5]);
            g.beginPath(); g.moveTo(PAGE_W-MARGIN+0.5, 100); g.lineTo(PAGE_W-MARGIN+0.5, PAGE_H-60); g.stroke();
            g.setLineDash([]);
          }
          g.strokeStyle='rgba(204,232,232,0.9)'; g.lineWidth=1;
          g.strokeRect(0.5,0.5,PAGE_W-1,PAGE_H-1);
        }

        // Une page A4 = un canvas
        pagesEl.innerHTML='';
        canvases=[];
        for(var p=0;p<pages;p++){
          var wrap=document.createElement('div'); wrap.className='pano-page';
          var lab=document.createElement('div'); lab.className='pano-page-label';
          lab.textContent='Page '+(p+1)+' / '+pages+' — A4 paysage';
          var cv=document.createElement('canvas'); cv.width=PAGE_W; cv.height=PAGE_H;
          wrap.appendChild(lab); wrap.appendChild(cv); pagesEl.appendChild(wrap);
          drawPage(cv.getContext('2d'), p);
          canvases.push(cv);
        }
        return pages;
      }

      dlBtn.addEventListener('click', function(){
        try{
          canvases.forEach(function(cv, i){
            // Un léger décalage évite que le navigateur bloque les
            // téléchargements successifs.
            setTimeout(function(){
              var a=document.createElement('a');
              a.download='panorama-velo-a4-'+(i+1)+'.png';
              a.href=cv.toDataURL('image/png');
              a.click();
            }, i*400);
          });
        }catch(e){ statusEl.textContent='Impossible d\\'exporter les images.'; }
      });

      prBtn.addEventListener('click', function(){
        var w=window.open('','_blank');
        if(!w){ statusEl.textContent='Autorisez les fenêtres pop-up pour imprimer.'; return; }
        var imgs='';
        try{
          canvases.forEach(function(cv){ imgs+='<img src="'+cv.toDataURL('image/png')+'">'; });
        }catch(e){ statusEl.textContent='Impossible de préparer l\\'impression.'; w.close(); return; }
        w.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">'
          +'<title>Panorama — '+TRIP+'</title><style>'
          +'@page{size:A4 landscape;margin:0}'
          +'html,body{margin:0;padding:0;background:#fff}'
          +'img{display:block;width:100%;height:auto;break-after:page;page-break-after:always}'
          +'img:last-child{break-after:auto;page-break-after:auto}'
          +'</style></head><body>'+imgs+'</body></html>');
        w.document.close();
        w.focus();
        setTimeout(function(){ w.print(); }, 600);
      });
    })();
    </script>`}
  </body></html>`;
}

module.exports = { renderPanorama };
