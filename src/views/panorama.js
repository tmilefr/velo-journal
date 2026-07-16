// ── Panorama : coupe altimétrique continue du voyage ──────
const { TRIP_TITLE } = require('../config');
const { CSS, renderHeader } = require('./layout');

// ══════════════════════════════════════════════════════════
// Génère (côté client, sur canvas) une grande image blanche : tous les
// profils de dénivelé mis bout à bout, un trait en biais vers chaque point
// d'arrivée de GPX, et la photo de chaque étape reliée à sa trace.
function renderPanorama(stages) {
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
      .pano-canvas-card{background:#fff;border-radius:18px;padding:14px;border:1px solid var(--sand);box-shadow:0 4px 20px rgba(10,61,98,0.08);overflow-x:auto}
      #panoCanvas{display:block;width:100%;height:auto;background:#fff;border-radius:10px}
      .pano-btn{font-family:inherit;font-size:13px;font-weight:600;padding:9px 16px;border-radius:22px;border:1.5px solid var(--sand);background:var(--mist);color:var(--ink-mid);cursor:pointer;transition:all .15s;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
      .pano-btn:hover{background:var(--sage);border-color:var(--teal-light)}
      .pano-btn.primary{background:linear-gradient(135deg,var(--emerald),var(--emerald-mid));color:#fff;border-color:transparent}
      .pano-btn:disabled{opacity:.5;cursor:default}
    </style>
  </head><body>
    ${renderHeader({ activePage: 'settings', isAdmin: true, showMap: false })}
    <div class="pano-wrap">
      <div class="form-card" style="margin-bottom:16px">
        <h2 style="margin-bottom:6px">🏔️ Panorama du voyage</h2>
        <p style="font-size:14px;color:var(--ink-light);line-height:1.6;margin:0">Tous les dénivelés bout à bout. Chaque trait en biais pointe vers le point d'arrivée d'une trace GPX et sa photo.</p>
      </div>
      ${emptyState
        ? `<div class="form-card"><p style="font-size:14px;color:var(--ink-light);margin:0">Aucune étape avec trace GPX pour le moment. Ajoutez des étapes avec un fichier <code>.gpx</code> pour générer le panorama.</p></div>`
        : `<div class="pano-toolbar">
             <span class="pano-status" id="panoStatus">Chargement des traces…</span>
             <button class="pano-btn primary" id="panoDownload" disabled>⬇️ Télécharger l'image (PNG)</button>
           </div>
           <div class="pano-canvas-card">
             <canvas id="panoCanvas" width="1600" height="900"></canvas>
           </div>`}
    </div>
    ${emptyState ? '' : `<script>
    (function(){
      var STAGES = ${dataJson};
      var TRIP   = ${titleJson};
      var canvas = document.getElementById('panoCanvas');
      var ctx = canvas.getContext('2d');
      var statusEl = document.getElementById('panoStatus');
      var dlBtn = document.getElementById('panoDownload');

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

      // 1) Charger toutes les traces + photos en parallèle
      Promise.all(STAGES.map(function(s){
        return Promise.all([
          loadText(s.gpx).then(function(txt){ return buildProfile(txt); }, function(){ return []; }),
          loadImg(s.photo)
        ]).then(function(r){ return { stage:s, pts:r[0], img:r[1] }; });
      })).then(function(loaded){
        draw(loaded);
        statusEl.textContent = loaded.length + ' étape(s) · ' +
          loaded.filter(function(l){return l.pts.length>1;}).length + ' trace(s) avec altitude';
        dlBtn.disabled = false;
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

        // Dimensions de l'image (haute résolution) selon le nombre d'étapes
        var N = loaded.length;
        var W = Math.max(1600, N*280);
        var H = 900;
        canvas.width=W; canvas.height=H;

        // Fond blanc
        ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);

        // Titre
        ctx.fillStyle='#1a3a3a';
        ctx.font='700 30px "Playfair Display", serif';
        ctx.textAlign='left'; ctx.textBaseline='alphabetic';
        ctx.fillText(TRIP, 50, 52);
        ctx.fillStyle='#5a8080';
        ctx.font='500 15px "DM Sans", sans-serif';
        ctx.fillText(N + ' étapes · ' + Math.round(totalDist/1000).toLocaleString('fr-FR') + ' km · profil altimétrique continu', 50, 76);

        // Zones
        var PADL=64, PADR=48;
        var plotW=W-PADL-PADR;
        var profTop=H-300, profBot=H-70;      // bande du profil
        var plotH=profBot-profTop;
        var cardTop=110, cardH=160;
        var cardGap=16;
        var cardW=Math.min(230, (plotW-(N-1)*cardGap)/Math.max(N,1));
        if(cardW<80) cardW=Math.max(64,(plotW-(N-1)*6)/Math.max(N,1));

        // Échelle altitude
        var minE=Infinity,maxE=-Infinity;
        elevPts.forEach(function(p){ if(p.e<minE)minE=p.e; if(p.e>maxE)maxE=p.e; });
        if(!isFinite(minE)){ minE=0; maxE=1; }
        var range=Math.max(maxE-minE,1), padE=range*0.12;
        var loE=minE-padE, hiE=maxE+padE, spanE=hiE-loE;
        function px(d){ return PADL+(d/totalDist)*plotW; }
        function py(e){ return profTop+plotH-((e-loE)/spanE)*plotH; }

        // Grille + labels altitude
        ctx.font='11px "DM Sans", sans-serif'; ctx.textBaseline='middle';
        var steps=4;
        for(var i=0;i<=steps;i++){
          var e=loE+spanE*i/steps, y=py(e);
          ctx.strokeStyle='rgba(42,122,122,0.10)'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(PADL,y); ctx.lineTo(W-PADR,y); ctx.stroke();
          ctx.fillStyle='#5a8080'; ctx.textAlign='right';
          ctx.fillText(Math.round(e).toLocaleString('fr-FR')+' m', PADL-8, y);
        }
        // Labels distance
        ctx.textAlign='center'; ctx.textBaseline='top';
        for(var k=0;k<=6;k++){
          var d=totalDist*k/6, x=px(d);
          ctx.fillStyle='#5a8080';
          ctx.fillText((d/1000).toFixed(0)+' km', x, profBot+10);
        }

        // Aire remplie + ligne de profil continue
        if(elevPts.length>1){
          ctx.beginPath();
          ctx.moveTo(px(elevPts[0].x), py(elevPts[0].e));
          elevPts.forEach(function(p){ ctx.lineTo(px(p.x), py(p.e)); });
          ctx.lineTo(px(elevPts[elevPts.length-1].x), profBot);
          ctx.lineTo(px(elevPts[0].x), profBot);
          ctx.closePath();
          var grad=ctx.createLinearGradient(0,profTop,0,profBot);
          grad.addColorStop(0,'rgba(45,122,90,0.42)');
          grad.addColorStop(1,'rgba(45,122,90,0.04)');
          ctx.fillStyle=grad; ctx.fill();

          ctx.beginPath();
          ctx.moveTo(px(elevPts[0].x), py(elevPts[0].e));
          elevPts.forEach(function(p){ ctx.lineTo(px(p.x), py(p.e)); });
          ctx.strokeStyle='#2a7a7a'; ctx.lineWidth=2.5; ctx.lineJoin='round'; ctx.stroke();
        }

        // Ligne de base
        ctx.strokeStyle='rgba(42,122,122,0.35)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(PADL,profBot); ctx.lineTo(W-PADR,profBot); ctx.stroke();

        // Pour chaque arrivée : trait en biais + pastille + carte photo
        arrivals.forEach(function(a, idx){
          var cardX = (N===1)
            ? PADL + (plotW-cardW)/2
            : PADL + idx*((plotW-cardW)/Math.max(N-1,1));
          var cardCX = cardX + cardW/2;
          var cardBottom = cardTop + cardH;
          var ax = px(a.x);
          var ay = isNaN(a.ele) ? profBot : py(a.ele);

          // Trait en biais : de la photo vers le point d'arrivée
          ctx.strokeStyle='#e07a3a'; ctx.lineWidth=1.8;
          ctx.setLineDash([6,4]);
          ctx.beginPath();
          ctx.moveTo(cardCX, cardBottom);
          ctx.lineTo(ax, ay);
          ctx.stroke();
          ctx.setLineDash([]);

          // Pastille au point d'arrivée
          ctx.fillStyle='#e07a3a';
          ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();

          // Carte photo (ombre)
          ctx.save();
          ctx.shadowColor='rgba(10,61,98,0.18)'; ctx.shadowBlur=14; ctx.shadowOffsetY=4;
          roundRect(ctx, cardX, cardTop, cardW, cardH, 12);
          ctx.fillStyle='#ffffff'; ctx.fill();
          ctx.restore();

          // Image (photo) ou placeholder
          var imgPad=6, imgH=cardH-42;
          ctx.save();
          roundRect(ctx, cardX+imgPad, cardTop+imgPad, cardW-imgPad*2, imgH, 8);
          ctx.clip();
          if(a.img){
            drawCover(ctx, a.img, cardX+imgPad, cardTop+imgPad, cardW-imgPad*2, imgH);
          } else {
            ctx.fillStyle='#e8f7f4'; ctx.fillRect(cardX+imgPad, cardTop+imgPad, cardW-imgPad*2, imgH);
            ctx.fillStyle='#7ecece'; ctx.font='26px sans-serif';
            ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText('🚴', cardCX, cardTop+imgPad+imgH/2);
          }
          ctx.restore();

          // Titre de l'étape (tronqué)
          ctx.fillStyle='#1a3a3a';
          ctx.font='600 13px "DM Sans", sans-serif';
          ctx.textAlign='center'; ctx.textBaseline='middle';
          var full = a.stage.title || a.stage.date || ('Étape '+(idx+1));
          var label = full;
          var maxW = cardW-12;
          var truncated = false;
          while(label.length>1 && ctx.measureText(label+'…').width>maxW){ label=label.slice(0,-1); truncated=true; }
          ctx.fillText(truncated ? label+'…' : full, cardCX, cardTop+cardH-14);
        });

        // Cadre
        ctx.strokeStyle='rgba(204,232,232,0.9)'; ctx.lineWidth=1;
        ctx.strokeRect(0.5,0.5,W-1,H-1);
      }

      dlBtn.addEventListener('click', function(){
        try{
          var a=document.createElement('a');
          a.download='panorama-velo.png';
          a.href=canvas.toDataURL('image/png');
          a.click();
        }catch(e){ statusEl.textContent='Impossible d\\'exporter l\\'image.'; }
      });
    })();
    </script>`}
  </body></html>`;
}

module.exports = { renderPanorama };
