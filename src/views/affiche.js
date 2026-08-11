// ── Affiche : la carte du voyage au format A3, à encadrer ──
const { TRIP_TITLE, TRIP_START, TRIP_END } = require('../config');
const { CSS, renderHeader } = require('./layout');

// ══════════════════════════════════════════════════════════
// Génère (côté client, sur canvas) une affiche A3 : au centre une carte
// épurée — littoraux, frontières, villes et relief ombré — parcourue par les
// traces GPX du voyage ; tout autour, en cadre, la photo favorite de chaque
// étape, reliée par un fil à son point d'arrivée sur la carte.
//
// Quatre sources, toutes locales sauf le relief :
//   • les traces           → fichiers .gpx des étapes (/uploads)
//   • frontières/littoraux → /public/geo/countries-50m.json (Natural Earth)
//   • les villes           → /public/geo/cities.json (GeoNames)
//   • le relief            → grille d'altitudes servie par /api/affiche/relief
function renderAffiche(stages, isStrictAdmin = false) {
  // Embarquage sûr des données (évite la fermeture prématurée de </script>)
  const dataJson = JSON.stringify(stages).replace(/</g, '\\u003c');
  const metaJson = JSON.stringify({
    title: String(TRIP_TITLE || 'Carnet de voyage'),
    start: String(TRIP_START || ''),
    end:   String(TRIP_END   || ''),
  }).replace(/</g, '\\u003c');
  const emptyState = stages.length === 0;

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Affiche — ${TRIP_TITLE}</title><style>${CSS}
      .aff-wrap{max-width:1200px;margin:0 auto;padding:20px 14px 60px}
      .aff-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px}
      .aff-field{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ink-mid);background:var(--mist);border:1.5px solid var(--sand);border-radius:22px;padding:7px 14px}
      .aff-field select{font-family:inherit;font-size:13px;font-weight:600;color:var(--ink-mid);border:none;background:transparent;cursor:pointer}
      .aff-field input[type=checkbox]{accent-color:var(--emerald);width:15px;height:15px;cursor:pointer}
      .aff-status{font-size:13px;color:var(--ink-light);font-weight:500;flex-basis:100%}
      .aff-btn{font-family:inherit;font-size:13px;font-weight:600;padding:9px 16px;border-radius:22px;border:1.5px solid var(--sand);background:var(--mist);color:var(--ink-mid);cursor:pointer;transition:all .15s;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
      .aff-btn:hover{background:var(--sage);border-color:var(--teal-light)}
      .aff-btn.primary{background:linear-gradient(135deg,var(--emerald),var(--emerald-mid));color:#fff;border-color:transparent}
      .aff-btn:disabled{opacity:.5;cursor:default}
      .aff-sheet{background:#fff;border-radius:18px;padding:14px;border:1px solid var(--sand);box-shadow:0 4px 20px rgba(10,61,98,0.08)}
      .aff-sheet canvas{display:block;width:100%;height:auto;border-radius:6px;box-shadow:0 2px 12px rgba(10,61,98,0.12)}
    </style>
  </head><body>
    ${renderHeader({ activePage: 'sys-affiche', isAdmin: true, isStrictAdmin, showMap: false })}
    <div class="aff-wrap">
      <div class="form-card" style="margin-bottom:16px">
        <a href="/settings" class="sys-back">← Système</a>
        <h2 style="margin-bottom:6px">🖼️ Affiche du voyage</h2>
        <p style="font-size:14px;color:var(--ink-light);line-height:1.6;margin:0">Une carte A3 du voyage : les traces GPX sur un fond épuré — frontières, littoraux, villes et relief ombré — et la photo favorite de <strong>chaque étape</strong> disposée tout autour, reliée à son point d'arrivée. Les vignettes s'agrandissent ou se resserrent en anneaux selon le nombre d'étapes. À imprimer et encadrer.</p>
      </div>
      ${emptyState
        ? `<div class="form-card"><p style="font-size:14px;color:var(--ink-light);margin:0">Aucune étape localisée pour le moment. Ajoutez des étapes avec un fichier <code>.gpx</code> ou des coordonnées GPS pour composer l'affiche.</p></div>`
        : `<div class="aff-toolbar">
             <label class="aff-field">Format
               <select id="affOrient">
                 <option value="p">A3 portrait</option>
                 <option value="l">A3 paysage</option>
               </select>
             </label>
             <label class="aff-field"><input type="checkbox" id="affRelief" checked> Relief</label>
             <label class="aff-field">Finesse
               <select id="affQuality">
                 <option value="fast">rapide</option>
                 <option value="std" selected>standard</option>
                 <option value="hi">détaillée</option>
               </select>
             </label>
             <label class="aff-field"><input type="checkbox" id="affCities" checked> Villes</label>
             <label class="aff-field"><input type="checkbox" id="affProfile" checked> Profil altimétrique</label>
             <button class="aff-btn primary" id="affDownload" disabled>⬇️ PNG 300 dpi</button>
             <button class="aff-btn" id="affDownload150" disabled>⬇️ PNG 150 dpi</button>
             <button class="aff-btn" id="affPrint" disabled>🖨️ Imprimer / PDF (A3)</button>
             <span class="aff-status" id="affStatus">Chargement…</span>
           </div>
           <div class="aff-sheet"><canvas id="affCanvas"></canvas></div>`}
    </div>
    ${emptyState ? '' : `<script>
    (function(){
      var STAGES = ${dataJson};
      var META   = ${metaJson};
      var GEO_URL    = '/public/geo/countries-50m.json';
      var CITIES_URL = '/public/geo/cities.json';

      // Feuille A3 (297 × 420 mm) à 150 dpi ; l'export 300 dpi redessine tout
      // dans le même repère, à l'échelle 2.
      var SHEET = { p:{ w:1754, h:2480 }, l:{ w:2480, h:1754 } };

      // Palette de l'affiche (accordée à celle du carnet)
      var C = {
        paper:'#fbfaf6', ink:'#1a3a3a', inkSoft:'#5a8080', rule:'#d8e4e0',
        sea:'#dceaef', land:'#eef0e4', border:'#7b9793',
        coast:'#4c7a80', track:'#e07a3a', trackHalo:'#ffffff',
        dot:'#2a7a7a', start:'#e67e22', end:'#1a7a4a',
        card:'#ffffff', cardEdge:'#e2e8e2', lead:'rgba(26,58,58,0.45)'
      };

      // Nuancier hypsométrique : altitude (m) → couleur du relief
      var RAMP = [
        [   0, [201, 216, 186]], [ 250, [219, 222, 178]], [ 700, [227, 210, 161]],
        [1300, [214, 184, 139]], [2100, [190, 150, 116]], [3000, [166, 132, 116]],
        [4000, [206, 202, 198]], [5500, [250, 250, 250]]
      ];

      var TARGET_CELLS = { fast:4500, std:9000, hi:18000 };

      var el = {
        canvas:  document.getElementById('affCanvas'),
        status:  document.getElementById('affStatus'),
        orient:  document.getElementById('affOrient'),
        relief:  document.getElementById('affRelief'),
        quality: document.getElementById('affQuality'),
        profile: document.getElementById('affProfile'),
        cities:  document.getElementById('affCities'),
        dl300:   document.getElementById('affDownload'),
        dl150:   document.getElementById('affDownload150'),
        print:   document.getElementById('affPrint')
      };

      var world = null;   // frontières décodées
      var cities = null;  // villes, de la plus peuplée à la moins peuplée
      var tracks = null;  // traces GPX + altitudes
      var relief = null;  // grille d'altitudes de l'emprise courante
      var reliefKey = ''; // emprise/finesse déjà demandées
      var imgs = {};      // photos favorites, réduites à la taille des vignettes
      var drawing = false, pending = false;

      function setStatus(t){ el.status.textContent = t; }
      function opts(){
        return {
          orient:  el.orient.value === 'l' ? 'l' : 'p',
          relief:  el.relief.checked,
          quality: el.quality.value,
          profile: el.profile.checked,
          cities:  el.cities.checked
        };
      }

      // ── Projection Mercator ─────────────────────────────
      function mercY(lat){ var l=Math.max(-85,Math.min(85,lat)); return Math.log(Math.tan(Math.PI/4 + l*Math.PI/360)); }
      function invMercY(y){ return (2*Math.atan(Math.exp(y)) - Math.PI/2) * 180/Math.PI; }

      function haversine(la1,lo1,la2,lo2){
        var R=6371000, dLa=(la2-la1)*Math.PI/180, dLo=(lo2-lo1)*Math.PI/180;
        var a=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)*Math.sin(dLo/2);
        return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
      }

      // ── Chargements ─────────────────────────────────────
      function loadJson(url){ return fetch(url).then(function(r){ if(!r.ok) throw new Error('http '+r.status); return r.json(); }); }
      function loadText(url){ return fetch(url).then(function(r){ if(!r.ok) throw new Error('http '+r.status); return r.text(); }); }
      function loadImg(url){
        return new Promise(function(res){
          var im = new Image();
          im.onload  = function(){ res(im); };
          im.onerror = function(){ res(null); };
          im.src = url;
        });
      }
      // Un carnet peut compter cent étapes : garder cent photos pleine
      // définition en mémoire ferait tomber l'onglet. Chaque photo est donc
      // réduite dès son chargement à la taille utile pour sa vignette (le
      // double, pour rester net à l'export 300 dpi), et l'original est libéré.
      function thumbFor(url, want){
        if(!url) return Promise.resolve(null);
        var have=imgs[url];
        if(have===null) return Promise.resolve(null);
        if(have && have.want >= want*0.98) return Promise.resolve(have.cv);
        return loadImg(url).then(function(im){
          if(!im || !im.width || !im.height){ imgs[url]=null; return null; }
          var side=Math.min(im.width,im.height);
          var k=Math.min(1, want/side);
          var cv=document.createElement('canvas');
          cv.width =Math.max(1,Math.round(im.width*k));
          cv.height=Math.max(1,Math.round(im.height*k));
          var g=cv.getContext('2d');
          g.imageSmoothingEnabled=true;
          if(g.imageSmoothingQuality) g.imageSmoothingQuality='high';
          g.drawImage(im,0,0,cv.width,cv.height);
          imgs[url]={ cv:cv, want:want };
          return cv;
        });
      }
      // Chargements en file : six photos à la fois, pas cent d'un coup.
      function loadThumbs(list, want, onProgress){
        var next=0, done=0;
        function worker(){
          if(next>=list.length) return Promise.resolve();
          var url=list[next++];
          return thumbFor(url,want).then(function(){
            if(onProgress) onProgress(++done, list.length);
            return worker();
          });
        }
        var n=Math.min(6, list.length);
        var runners=[]; for(var i=0;i<n;i++) runners.push(worker());
        return Promise.all(runners);
      }

      // ── TopoJSON : arcs, anneaux, et partage des frontières ──
      // Un arc utilisé par deux pays est une frontière ; utilisé une seule
      // fois, c'est un littoral. On les trace donc différemment, et une seule
      // fois chacun (pas de double trait sur les frontières communes).
      function decodeWorld(topo){
        var tr = topo.transform, raw = topo.arcs;
        var arcs = raw.map(function(a){
          var x=0, y=0, pts=[];
          for(var i=0;i<a.length;i++){
            x+=a[i][0]; y+=a[i][1];
            pts.push([ x*tr.scale[0]+tr.translate[0], y*tr.scale[1]+tr.translate[1] ]);
          }
          return pts;
        });
        var use = new Array(arcs.length); for(var i=0;i<use.length;i++) use[i]=0;

        var rings = [];
        (topo.objects.countries.geometries||[]).forEach(function(g){
          var polys = g.type==='Polygon' ? [g.arcs] : (g.type==='MultiPolygon' ? g.arcs : []);
          polys.forEach(function(poly){
            poly.forEach(function(ring){
              var pts=[];
              ring.forEach(function(ai,k){
                var idx = ai<0 ? ~ai : ai;
                use[idx]++;
                var a = ai<0 ? arcs[idx].slice().reverse() : arcs[idx];
                for(var j=(k?1:0); j<a.length; j++) pts.push(a[j]);
              });
              if(pts.length>2) rings.push({ pts:pts, box:bboxOf(pts) });
            });
          });
        });
        var lines = arcs.map(function(pts,i){ return { pts:pts, box:bboxOf(pts), shared:use[i]>1, used:use[i]>0 }; })
                        .filter(function(l){ return l.used && l.pts.length>1; });
        return { rings:rings, lines:lines };
      }
      function bboxOf(pts){
        var w=Infinity,e=-Infinity,s=Infinity,n=-Infinity;
        for(var i=0;i<pts.length;i++){
          var p=pts[i];
          if(p[0]<w)w=p[0]; if(p[0]>e)e=p[0];
          if(p[1]<s)s=p[1]; if(p[1]>n)n=p[1];
        }
        return [w,s,e,n];
      }
      function boxHits(box, view){
        return !(box[2] < view.west || box[0] > view.east || box[3] < view.south || box[1] > view.north);
      }

      // ── GPX ─────────────────────────────────────────────
      function parseGpx(txt){
        var xml = new DOMParser().parseFromString(txt,'text/xml');
        var trkpts = Array.prototype.slice.call(xml.querySelectorAll('trkpt'));
        var pts=[], cum=0, prev=null;
        trkpts.forEach(function(tp){
          var lat=parseFloat(tp.getAttribute('lat')), lon=parseFloat(tp.getAttribute('lon'));
          if(isNaN(lat)||isNaN(lon)) return;
          var eleEl=tp.querySelector('ele');
          var ele=eleEl?parseFloat(eleEl.textContent):NaN;
          if(prev) cum += haversine(prev[0],prev[1],lat,lon);
          pts.push({ lat:lat, lon:lon, ele:ele, d:cum });
          prev=[lat,lon];
        });
        return pts;
      }

      // ── Emprise de la carte ─────────────────────────────
      // Tout se calcule en Mercator (x et y en radians, sinon la carte serait
      // étirée d'un facteur 57 en longitude) : toutes les traces et tous les
      // points d'étape tiennent dans le cadre avec une marge, puis l'emprise
      // est étendue — à échelle constante — au format du cadre.
      var RAD = Math.PI/180;
      function mercX(lon){ return lon*RAD; }

      function contentBox(){
        var xlo=Infinity,xhi=-Infinity,ylo=Infinity,yhi=-Infinity;
        function add(lat,lon){
          var x=mercX(lon); if(x<xlo)xlo=x; if(x>xhi)xhi=x;
          var y=mercY(lat); if(y<ylo)ylo=y; if(y>yhi)yhi=y;
        }
        tracks.forEach(function(t){ t.pts.forEach(function(p){ add(p.lat,p.lon); }); });
        STAGES.forEach(function(s){ if(s.lat!=null && s.lon!=null) add(s.lat,s.lon); });
        if(!isFinite(xlo)){ xlo=mercX(-5); xhi=mercX(5); ylo=mercY(40); yhi=mercY(50); }
        return { xlo:xlo, xhi:xhi, ylo:ylo, yhi:yhi };
      }

      function fitView(rect){
        var b=contentBox();
        var padX=Math.max((b.xhi-b.xlo)*0.07, 0.002), padY=Math.max((b.yhi-b.ylo)*0.07, 0.002);
        var xlo=b.xlo-padX, xhi=b.xhi+padX, ylo=b.ylo-padY, yhi=b.yhi+padY;

        var target=rect.w/rect.h, vw=xhi-xlo, vh=yhi-ylo;
        if(vw/vh < target){ var nw=vh*target, cx=(xlo+xhi)/2; xlo=cx-nw/2; xhi=cx+nw/2; }
        else              { var nh=vw/target, cy=(ylo+yhi)/2; ylo=cy-nh/2; yhi=cy+nh/2; }

        // Jamais au-delà des pôles : on recentre plutôt que de déformer.
        var YMAX=mercY(84);
        if(yhi-ylo > 2*YMAX){ var c=(ylo+yhi)/2; ylo=c-YMAX; yhi=c+YMAX; }
        if(yhi>YMAX){ ylo-=yhi-YMAX; yhi=YMAX; }
        if(ylo<-YMAX){ yhi+=-YMAX-ylo; ylo=-YMAX; }

        return {
          west:xlo/RAD, east:xhi/RAD, south:invMercY(ylo), north:invMercY(yhi),
          xleft:xlo, xright:xhi, ytop:yhi, ybot:ylo
        };
      }
      function projector(view, rect){
        var x0=view.xleft, dx=view.xright-view.xleft, y0=view.ytop, dy=view.ybot-view.ytop;
        return function(lat,lon){
          return [ rect.x + (mercX(lon)-x0)/dx*rect.w, rect.y + (mercY(lat)-y0)/dy*rect.h ];
        };
      }

      // ── Géométrie de la feuille ─────────────────────────
      // Les vignettes font le tour de la carte, sur un ou plusieurs anneaux
      // emboîtés. Chaque anneau est parcouru dans l'ordre du cadre — haut de
      // gauche à droite, droite de haut en bas, bas de droite à gauche, gauche
      // de bas en haut — pour que les photos se répartissent tout autour.
      function buildRings(inner, TW, TH, G, R){
        var rings=[], rect={ x:inner.x, y:inner.y, w:inner.w, h:inner.h }, r, cap=0;
        for(r=0;r<R;r++){
          var nH = Math.floor((rect.w+G)/(TW+G));
          var freeH = rect.h-2*(TH+G);
          var nV = freeH>0 ? Math.floor((freeH+G)/(TH+G)) : 0;
          if(nH<1) break;
          rings.push({ rect:{ x:rect.x, y:rect.y, w:rect.w, h:rect.h }, nH:nH, nV:nV, cap:2*nH+2*nV });
          cap += 2*nH+2*nV;
          rect={ x:rect.x+TW+G, y:rect.y+TH+G, w:rect.w-2*(TW+G), h:rect.h-2*(TH+G) };
          if(rect.w<TW*1.2 || rect.h<TH*1.2){ r++; break; }
        }
        return { rings:rings, map:rect, count:r, cap:cap };
      }

      // Répartition des n vignettes sur les anneaux : proportionnelle à leur
      // capacité, puis, sur chaque anneau, proportionnelle à la longueur des
      // côtés — et régulièrement étalée le long de chaque côté, pour qu'un
      // cadre à moitié rempli n'ait pas de trou au milieu d'une rangée.
      function share(total, weights){
        var sum=weights.reduce(function(a,b){ return a+b; },0) || 1;
        var out=weights.map(function(w){ return Math.floor(total*w/sum); });
        var rest=total-out.reduce(function(a,b){ return a+b; },0);
        var order=weights.map(function(w,i){ return { i:i, frac:total*w/sum-Math.floor(total*w/sum) }; })
                         .sort(function(a,b){ return b.frac-a.frac; });
        for(var k=0;k<rest;k++) out[order[k%order.length].i]++;
        return out;
      }
      function placeSlots(built, TW, TH, G, n){
        var slots=[];
        var perRing=share(Math.min(n, built.cap), built.rings.map(function(r){ return r.cap; }));
        built.rings.forEach(function(ring, ri){
          var take=Math.min(perRing[ri], ring.cap);
          if(take<=0) return;
          // Les côtés opposés reçoivent le même nombre de vignettes (à une
          // près) : le cadre reste symétrique même à moitié rempli.
          var pair=share(take, [2*ring.nH, 2*ring.nV]);
          var sides=[Math.ceil(pair[0]/2), Math.ceil(pair[1]/2),
                     Math.floor(pair[0]/2), Math.floor(pair[1]/2)];
          var rect=ring.rect;
          var freeY=rect.y+TH+G, freeH=rect.h-2*(TH+G);
          var spread=function(count, start, span, size){
            var out=[];
            for(var i=0;i<count;i++) out.push(start + (i+0.5)*span/count - size/2);
            return out;
          };
          var xs=spread(sides[0], rect.x, rect.w, TW);
          var ysR=spread(sides[1], freeY, freeH, TH);
          var xsB=spread(sides[2], rect.x, rect.w, TW);
          var ysL=spread(sides[3], freeY, freeH, TH);
          var i;
          for(i=0;i<xs.length;i++)  slots.push({ x:xs[i],  y:rect.y,          side:'t' });
          for(i=0;i<ysR.length;i++) slots.push({ x:rect.x+rect.w-TW, y:ysR[i],side:'r' });
          for(i=xsB.length-1;i>=0;i--) slots.push({ x:xsB[i], y:rect.y+rect.h-TH, side:'b' });
          for(i=ysL.length-1;i>=0;i--) slots.push({ x:rect.x, y:ysL[i],        side:'l' });
        });
        slots.forEach(function(s){
          s.w=TW; s.h=TH;
          // Point d'accroche du fil : le milieu du bord tourné vers la carte
          if(s.side==='t'){ s.ax=s.x+TW/2; s.ay=s.y+TH; }
          else if(s.side==='b'){ s.ax=s.x+TW/2; s.ay=s.y; }
          else if(s.side==='l'){ s.ax=s.x+TW; s.ay=s.y+TH/2; }
          else { s.ax=s.x; s.ay=s.y+TH/2; }
        });
        return slots;
      }

      // Taille des vignettes et nombre d'anneaux : toutes les étapes doivent
      // tenir autour de la carte, avec les plus grandes photos possibles et un
      // cadre bien rempli. La carte prend ensuite sa place au centre — un
      // tiers de la feuille, à la forme du voyage — sans forcément occuper
      // tout l'espace laissé libre : c'est un cadre de photos, pas un atlas.
      var TILE_SIZES=[380,340,300,268,240,214,192,172,154,138,124,112,100,90,82,74];
      var MAP_AREA = 0.34;   // part de la surface intérieure laissée à la carte
      function layout(o, count, ratio){
        var S = SHEET[o.orient];
        var M = 84, HEAD = 168, FOOT = o.profile ? 214 : 96, G = 14;
        var inner = { x:M, y:M+HEAD, w:S.w-2*M, h:S.h-2*M-HEAD-FOOT };
        var n = Math.max(1, count||1);

        var pick=null;
        for(var R=1; R<=4; R++){
          for(var ti=0; ti<TILE_SIZES.length; ti++){
            var TW=TILE_SIZES[ti], TH=Math.round(TW*0.9);
            var built=buildRings(inner, TW, TH, G, R);
            if(built.count<R || built.cap<n) continue;               // anneau incomplet ou trop juste
            var nat=built.map;
            if(nat.w < inner.w*0.24 || nat.h < inner.h*0.24) continue; // plus de place pour la carte
            var gap=1-n/built.cap;
            // Un cadre bien rempli d'abord, de grandes photos ensuite, et le
            // moins d'anneaux possible à qualité égale.
            var cost = 1.8*gap*gap - 0.5*(TW/TILE_SIZES[0]) + 0.35*(R-1);
            if(!pick || cost<pick.cost) pick={ built:built, TW:TW, TH:TH, cost:cost };
          }
        }
        if(!pick){
          // Trop d'étapes pour une feuille : les plus petites vignettes, le
          // plus d'anneaux possible — le cadre en accueillera autant qu'il peut.
          var TWm=TILE_SIZES[TILE_SIZES.length-1], THm=Math.round(TWm*0.9);
          pick={ built:buildRings(inner, TWm, THm, G, 4), TW:TWm, TH:THm };
        }

        // La carte : au centre de l'espace laissé par les photos, à la forme du
        // voyage tant qu'il reste de la marge. Si une dimension bute sur le
        // cadre, l'autre s'étire jusqu'à retrouver la surface visée plutôt que
        // de laisser une bande de papier vide — la carte montre alors un peu
        // plus de paysage autour du voyage, ce qui ne gâche rien.
        var nat=pick.built.map;
        var asp=Math.min(3, Math.max(0.5, ratio || (nat.w/nat.h)));
        var area=Math.min(inner.w*inner.h*MAP_AREA, nat.w*nat.h);
        var mw=Math.min(nat.w, Math.sqrt(area*asp)), mh=mw/asp;
        if(mh>nat.h){ mh=nat.h; mw=Math.min(nat.w, mh*asp); }
        if(mw*mh < area) mh=Math.min(nat.h, area/mw);
        if(mw*mh < area) mw=Math.min(nat.w, area/mh);
        var map={ x:nat.x+(nat.w-mw)/2, y:nat.y+(nat.h-mh)/2, w:mw, h:mh };

        return {
          sheet:S, M:M,
          head:{ x:M, y:M, w:S.w-2*M, h:HEAD },
          foot:{ x:M, y:S.h-M-FOOT, w:S.w-2*M, h:FOOT },
          inner:inner, map:map,
          slots:placeSlots(pick.built, pick.TW, pick.TH, G, n),
          tile:{ w:pick.TW, h:pick.TH }
        };
      }

      // ── Répartition des photos autour de la carte ───────
      // Chaque étape rejoint une vignette de façon à ce que la longueur totale
      // des fils soit la plus courte possible : on part du plus proche, puis on
      // échange deux vignettes tant que ça raccourcit. À l'arrivée, plus aucun
      // fil n'en croise un autre (deux fils qui se croisent sont toujours plus
      // longs que les mêmes fils échangés).
      function assignSlots(pts, slots){
        var k=pts.length;
        if(!k || slots.length<k) return [];
        function cost(i,j){
          var dx=pts[i][0]-slots[j].ax, dy=pts[i][1]-slots[j].ay;
          return Math.sqrt(dx*dx+dy*dy);
        }
        var taken=new Array(slots.length), perm=new Array(k), i, j;
        for(i=0;i<k;i++){
          var best=-1, bestC=Infinity;
          for(j=0;j<slots.length;j++){
            if(taken[j]) continue;
            var c=cost(i,j);
            if(c<bestC){ bestC=c; best=j; }
          }
          perm[i]=best; taken[best]=true;
        }
        var improved=true, guard=0;
        while(improved && guard++<40){
          improved=false;
          for(i=0;i<k;i++) for(j=i+1;j<k;j++){
            if(cost(i,perm[j])+cost(j,perm[i]) < cost(i,perm[i])+cost(j,perm[j])-0.5){
              var t=perm[i]; perm[i]=perm[j]; perm[j]=t; improved=true;
            }
          }
        }
        return perm;
      }
      // Toutes les étapes ont leur vignette. Le prélèvement régulier ne sert
      // que de filet de sécurité : un carnet trop long pour le cadre garde le
      // départ, l'arrivée et un échantillon régulier entre les deux.
      function pickStages(k){
        if(STAGES.length <= k) return STAGES.slice();
        var out=[];
        for(var i=0;i<k;i++) out.push(STAGES[Math.round(i*(STAGES.length-1)/(k-1))]);
        return out;
      }

      // ── Relief ──────────────────────────────────────────
      function reliefDims(map, quality){
        var target = TARGET_CELLS[quality] || TARGET_CELLS.std;
        var ratio  = map.w/map.h;
        var cols   = Math.max(24, Math.min(200, Math.round(Math.sqrt(target*ratio))));
        var rows   = Math.max(24, Math.min(200, Math.round(target/cols)));
        return { cols:cols, rows:rows };
      }
      function fetchRelief(view, dims){
        var q = 's='+view.south.toFixed(4)+'&n='+view.north.toFixed(4)
              + '&w='+view.west.toFixed(4)+'&e='+view.east.toFixed(4)
              + '&cols='+dims.cols+'&rows='+dims.rows;
        return loadJson('/api/affiche/relief?'+q);
      }
      function rampColor(e){
        if(e <= RAMP[0][0]) return RAMP[0][1];
        for(var i=1;i<RAMP.length;i++){
          if(e <= RAMP[i][0]){
            var a=RAMP[i-1], b=RAMP[i], t=(e-a[0])/(b[0]-a[0]);
            return [ a[1][0]+(b[1][0]-a[1][0])*t, a[1][1]+(b[1][1]-a[1][1])*t, a[1][2]+(b[1][2]-a[1][2])*t ];
          }
        }
        return RAMP[RAMP.length-1][1];
      }
      // Teinte hypsométrique + ombrage type « estompage » (soleil au nord-ouest)
      function reliefBitmap(rel){
        var cols=rel.cols, rows=rel.rows, ele=rel.ele;
        var cv=document.createElement('canvas'); cv.width=cols; cv.height=rows;
        var g=cv.getContext('2d'), im=g.createImageData(cols,rows), px=im.data;
        var zen=45*Math.PI/180, azi=(360-315+90)*Math.PI/180, Z=2.2;
        function at(r,c){
          r=Math.max(0,Math.min(rows-1,r)); c=Math.max(0,Math.min(cols-1,c));
          return ele[r*cols+c];
        }
        var lonStep=(rel.east-rel.west)/cols;
        for(var r=0;r<rows;r++){
          var lat=rel.lats[r];
          var dx=Math.max(30, lonStep*111320*Math.cos(lat*Math.PI/180));
          var latA=rel.lats[Math.max(0,r-1)], latB=rel.lats[Math.min(rows-1,r+1)];
          var dy=Math.max(30, Math.abs(latA-latB)/2*111320);
          for(var c=0;c<cols;c++){
            var e=at(r,c);
            var dzdx=(at(r,c+1)-at(r,c-1))/(2*dx);
            var dzdy=(at(r+1,c)-at(r-1,c))/(2*dy);
            var slope=Math.atan(Z*Math.sqrt(dzdx*dzdx+dzdy*dzdy));
            var aspect=Math.atan2(dzdy,-dzdx);
            var sh=Math.cos(zen)*Math.cos(slope)+Math.sin(zen)*Math.sin(slope)*Math.cos(azi-aspect);
            var k=0.62+0.62*Math.max(0,Math.min(1,sh));
            var col=rampColor(Math.max(0,e));
            var o=(r*cols+c)*4;
            px[o]  =Math.max(0,Math.min(255,col[0]*k));
            px[o+1]=Math.max(0,Math.min(255,col[1]*k));
            px[o+2]=Math.max(0,Math.min(255,col[2]*k));
            px[o+3]=255;
          }
        }
        g.putImageData(im,0,0);
        return cv;
      }

      // ── Petites aides de dessin ─────────────────────────
      function roundRect(g,x,y,w,h,r){
        g.beginPath();
        g.moveTo(x+r,y);
        g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r);
        g.arcTo(x,y+h,x,y,r);     g.arcTo(x,y,x+w,y,r);
        g.closePath();
      }
      function drawCover(g,img,x,y,w,h){
        var ir=img.width/img.height, r=w/h, sw,sh,sx,sy;
        if(ir>r){ sh=img.height; sw=sh*r; sx=(img.width-sw)/2; sy=0; }
        else    { sw=img.width;  sh=sw/r; sx=0; sy=(img.height-sh)/2; }
        g.drawImage(img,sx,sy,sw,sh,x,y,w,h);
      }
      function fit(g,text,maxW){
        var s=String(text||'');
        if(g.measureText(s).width<=maxW) return s;
        while(s.length>1 && g.measureText(s+'…').width>maxW) s=s.slice(0,-1);
        return s+'…';
      }
      function frDate(v){
        if(!v) return '';
        var d=new Date(v);
        if(isNaN(d.getTime())) return '';
        return d.toLocaleDateString('fr-FR',{ day:'numeric', month:'long', year:'numeric' });
      }
      function frNum(n){ return Math.round(n).toLocaleString('fr-FR'); }

      // ══════════════════════════════════════════════════
      //  Rendu de l'affiche
      // ══════════════════════════════════════════════════
      function drawPoster(g, o, L){
        var S=L.sheet, map=L.map;
        var view=fitView(map), proj=projector(view,map);

        g.fillStyle=C.paper; g.fillRect(0,0,S.w,S.h);

        drawHead(g,L);
        drawMap(g,L,view,proj,o);
        var placed=drawFrame(g,L,proj);
        drawFoot(g,L,o);
        return placed;
      }

      function tripTotals(){
        var km=0, dplus=0;
        STAGES.forEach(function(s){ km+=s.km||0; dplus+=s.dplus||0; });
        return { km:km, dplus:dplus };
      }

      function drawHead(g,L){
        var S=L.sheet, h=L.head;
        var tot=tripTotals();
        var first=STAGES[0]||{}, last=STAGES[STAGES.length-1]||{};
        var d1=frDate(META.start||first.date), d2=frDate(META.end||last.date);

        g.textAlign='center'; g.textBaseline='alphabetic';
        g.fillStyle=C.ink;
        g.font='700 '+(L.sheet.w>2000?58:52)+'px "Playfair Display", Georgia, serif';
        g.fillText(fit(g, META.title, h.w), S.w/2, h.y+70);

        var bits=[];
        if(d1&&d2) bits.push(d1+' → '+d2); else if(d1) bits.push('depuis le '+d1);
        bits.push(STAGES.length+' étape'+(STAGES.length>1?'s':''));
        if(tot.km)    bits.push(frNum(tot.km)+' km');
        if(tot.dplus) bits.push(frNum(tot.dplus)+' m D+');
        g.fillStyle=C.inkSoft;
        g.font='400 21px "DM Sans", Helvetica, sans-serif';
        g.fillText(bits.join('  ·  '), S.w/2, h.y+112);

        g.strokeStyle=C.rule; g.lineWidth=1.4;
        g.beginPath();
        g.moveTo(S.w/2-120, h.y+134); g.lineTo(S.w/2+120, h.y+134);
        g.stroke();
      }

      // ── La carte ────────────────────────────────────────
      function drawMap(g,L,view,proj,o){
        var map=L.map;
        g.save();
        g.beginPath(); g.rect(map.x,map.y,map.w,map.h); g.clip();

        // Mer
        g.fillStyle=C.sea; g.fillRect(map.x,map.y,map.w,map.h);

        // Terres : un seul chemin, règle pair-impair pour évider les lacs
        var land=new Path2D(), drawn=0;
        if(world){
          world.rings.forEach(function(ring){
            if(!boxHits(ring.box,view)) return;
            var pts=ring.pts;
            var p0=proj(pts[0][1],pts[0][0]);
            land.moveTo(p0[0],p0[1]);
            for(var i=1;i<pts.length;i++){ var p=proj(pts[i][1],pts[i][0]); land.lineTo(p[0],p[1]); }
            land.closePath(); drawn++;
          });
        }
        if(drawn){ g.fillStyle=C.land; g.fill(land,'evenodd'); }

        // Relief, contenu dans les terres pour ne pas déborder en mer
        if(relief && drawn){
          g.save();
          g.clip(land,'evenodd');
          var bmp=reliefBitmap(relief);
          g.imageSmoothingEnabled=true;
          if(g.imageSmoothingQuality) g.imageSmoothingQuality='high';
          var a=proj(relief.north,relief.west), b=proj(relief.south,relief.east);
          g.globalAlpha=0.95;
          g.drawImage(bmp, a[0], a[1], b[0]-a[0], b[1]-a[1]);
          g.globalAlpha=1;
          g.restore();
        } else if(relief && !drawn){
          var bmp2=reliefBitmap(relief);
          var a2=proj(relief.north,relief.west), b2=proj(relief.south,relief.east);
          g.drawImage(bmp2, a2[0], a2[1], b2[0]-a2[0], b2[1]-a2[1]);
        }

        // Frontières puis littoraux (chaque arc une seule fois)
        if(world){
          [false,true].forEach(function(shared){
            g.strokeStyle = shared ? C.border : C.coast;
            g.lineWidth   = shared ? 1.3 : 1.9;
            g.lineJoin='round'; g.lineCap='round';
            if(shared){ g.setLineDash([7,5]); } else { g.setLineDash([]); }
            g.beginPath();
            world.lines.forEach(function(l){
              if(l.shared!==shared || !boxHits(l.box,view)) return;
              var pts=l.pts, p0=proj(pts[0][1],pts[0][0]);
              g.moveTo(p0[0],p0[1]);
              for(var i=1;i<pts.length;i++){ var p=proj(pts[i][1],pts[i][0]); g.lineTo(p[0],p[1]); }
            });
            g.stroke();
            g.setLineDash([]);
          });
        }

        // Raccords entre étapes sans trace : le voyage reste continu
        g.strokeStyle='rgba(224,122,58,0.55)'; g.lineWidth=1.8; g.setLineDash([8,7]);
        g.beginPath();
        for(var i=1;i<STAGES.length;i++){
          var a3=STAGES[i-1], b3=STAGES[i];
          if(a3.lat==null||b3.lat==null) continue;
          if(tracks[i] && tracks[i].pts.length>1) continue;
          var pa=proj(a3.lat,a3.lon), pb=proj(b3.lat,b3.lon);
          g.moveTo(pa[0],pa[1]); g.lineTo(pb[0],pb[1]);
        }
        g.stroke(); g.setLineDash([]);

        // Traces GPX : halo clair puis trait franc
        [[C.trackHalo,6.5,0.85],[C.track,3,1]].forEach(function(style){
          g.strokeStyle=style[0]; g.lineWidth=style[1]; g.globalAlpha=style[2];
          g.lineJoin='round'; g.lineCap='round';
          g.beginPath();
          tracks.forEach(function(t){
            if(t.pts.length<2) return;
            var p0=proj(t.pts[0].lat,t.pts[0].lon);
            g.moveTo(p0[0],p0[1]);
            for(var i=1;i<t.pts.length;i++){ var p=proj(t.pts[i].lat,t.pts[i].lon); g.lineTo(p[0],p[1]); }
          });
          g.stroke();
          g.globalAlpha=1;
        });

        // Villes, puis points d'étape par-dessus
        if(o.cities) drawCities(g,L,view,proj);

        STAGES.forEach(function(s,i){
          if(s.lat==null||s.lon==null) return;
          var p=proj(s.lat,s.lon);
          var last=i===STAGES.length-1, first=i===0;
          var r=first||last?9:4.5;
          g.beginPath(); g.arc(p[0],p[1],r,0,Math.PI*2);
          g.fillStyle= first?C.start : (last?C.end:C.dot);
          g.fill();
          g.strokeStyle='#fff'; g.lineWidth=first||last?3:2; g.stroke();
        });

        drawLegend(g,L,view);

        g.restore();
        g.strokeStyle=C.rule; g.lineWidth=1.5;
        g.strokeRect(map.x+0.5,map.y+0.5,map.w-1,map.h-1);
      }

      // ── Villes ──────────────────────────────────────────
      // Les villes sont triées de la plus peuplée à la moins peuplée : on les
      // parcourt dans l'ordre et on ne pose une étiquette que si elle ne
      // chevauche ni une autre étiquette, ni un point d'étape. Les grandes
      // villes passent donc en premier, et la carte reste lisible quel que
      // soit le zoom — au niveau d'une région, ce sont les bourgs qui restent.
      function drawCities(g,L,view,proj){
        if(!cities || !cities.length) return 0;
        var map=L.map;
        var FS=Math.max(11, Math.min(17, Math.round(map.w/62)));
        var MAX=Math.max(10, Math.min(70, Math.round(map.w*map.h/26000)));
        var boxes=[];
        // Les points d'étape sont posés d'office : aucune ville ne viendra
        // s'écrire dessus.
        STAGES.forEach(function(s){
          if(s.lat==null||s.lon==null) return;
          var p=proj(s.lat,s.lon);
          boxes.push([p[0]-13,p[1]-13,26,26]);
        });
        function hits(b){
          for(var i=0;i<boxes.length;i++){
            var a=boxes[i];
            if(b[0]<a[0]+a[2] && b[0]+b[2]>a[0] && b[1]<a[1]+a[3] && b[1]+b[3]>a[1]) return true;
          }
          return false;
        }

        var placed=0;
        g.textBaseline='middle'; g.lineJoin='round';
        for(var i=0;i<cities.length && placed<MAX;i++){
          var c=cities[i];               // [nom, lat, lon, milliers d'hab., capitale]
          if(c[1]<view.south||c[1]>view.north||c[2]<view.west||c[2]>view.east) continue;
          var p=proj(c[1],c[2]);
          if(p[0]<map.x+10||p[0]>map.x+map.w-10||p[1]<map.y+10||p[1]>map.y+map.h-10) continue;

          var cap=c[4]===1, r=cap?4:2.6;
          g.font=(cap?'600 ':'500 ')+FS+'px "DM Sans", Helvetica, sans-serif';
          var w=g.measureText(c[0]).width, gap=r+5;
          g.textAlign='left';
          var bx=p[0]+gap;
          if(bx+w > map.x+map.w-8){ bx=p[0]-gap-w; g.textAlign='right'; }
          var box=[bx-3, p[1]-FS*0.75, w+6, FS*1.5];
          if(box[0]<map.x+6 || hits(box) || hits([p[0]-r-2,p[1]-r-2,2*r+4,2*r+4])) continue;
          boxes.push(box); boxes.push([p[0]-r-2,p[1]-r-2,2*r+4,2*r+4]);

          g.beginPath(); g.arc(p[0],p[1],r,0,Math.PI*2);
          g.fillStyle=cap?C.ink:'#4a6a6a'; g.fill();
          if(cap){ g.strokeStyle='#fff'; g.lineWidth=1.6; g.stroke(); }

          var tx=g.textAlign==='left' ? bx : bx+w;
          g.strokeStyle='rgba(255,255,255,0.85)'; g.lineWidth=Math.max(2.5,FS*0.28);
          g.strokeText(c[0], tx, p[1]);
          g.fillStyle=C.ink;
          g.fillText(c[0], tx, p[1]);
          placed++;
        }
        g.textBaseline='alphabetic'; g.textAlign='left';
        return placed;
      }

      // Échelle kilométrique + nuancier d'altitude, dans un coin de la carte
      function drawLegend(g,L,view){
        var map=L.map;
        var latC=(view.north+view.south)/2;
        var mPerPx=(view.east-view.west)*Math.PI/180*6378137*Math.cos(latC*Math.PI/180)/map.w;
        if(map.w<300 || map.h<240) return;   // carte trop petite pour une légende
        var want=Math.max(90, Math.min(170, map.w*0.22));
        var CANDS=[1,2,5,10,20,50,100,200,500,1000,2000,5000];
        var kmBar=CANDS[CANDS.length-1];
        for(var i=0;i<CANDS.length;i++){ if(CANDS[i]*1000/mPerPx>=want){ kmBar=CANDS[i]; break; } }
        var barPx=kmBar*1000/mPerPx;

        var boxW=Math.max(200, barPx+40), boxH=relief?128:78;
        var x=map.x+22, y=map.y+map.h-boxH-22;

        g.save();
        roundRect(g,x,y,boxW,boxH,12);
        g.fillStyle='rgba(255,255,255,0.86)'; g.fill();
        g.strokeStyle='rgba(26,58,58,0.10)'; g.lineWidth=1; g.stroke();

        g.textAlign='left'; g.textBaseline='alphabetic';
        g.font='600 13px "DM Sans", Helvetica, sans-serif'; g.fillStyle=C.inkSoft;

        // Échelle
        var bx=x+18, by=y+30;
        g.strokeStyle=C.ink; g.lineWidth=2;
        g.beginPath();
        g.moveTo(bx,by-5); g.lineTo(bx,by); g.lineTo(bx+barPx,by); g.lineTo(bx+barPx,by-5);
        g.stroke();
        g.fillText(frNum(kmBar)+' km', bx, by+18);

        // Trace
        var ty=y+ (relief?66:62);
        g.strokeStyle=C.track; g.lineWidth=3; g.lineCap='round';
        g.beginPath(); g.moveTo(bx,ty); g.lineTo(bx+34,ty); g.stroke();
        g.fillStyle=C.inkSoft; g.fillText('trace GPX', bx+44, ty+5);

        // Nuancier d'altitude
        if(relief){
          var gy=y+92, gw=boxW-36, gh=10;
          var grad=g.createLinearGradient(bx,0,bx+gw,0);
          for(var s=0;s<=10;s++){
            var e=relief.min+(relief.max-relief.min)*s/10;
            var col=rampColor(Math.max(0,e));
            grad.addColorStop(s/10,'rgb('+Math.round(col[0])+','+Math.round(col[1])+','+Math.round(col[2])+')');
          }
          g.fillStyle=grad; g.fillRect(bx,gy,gw,gh);
          g.strokeStyle='rgba(26,58,58,0.18)'; g.lineWidth=1; g.strokeRect(bx+0.5,gy+0.5,gw-1,gh-1);
          g.font='500 12px "DM Sans", Helvetica, sans-serif'; g.fillStyle=C.inkSoft;
          g.fillText(frNum(Math.max(0,relief.min))+' m', bx, gy+26);
          g.textAlign='right';
          g.fillText(frNum(relief.max)+' m', bx+gw, gy+26);
        }
        g.restore();
      }

      // Emplacements retenus quand il y a moins de photos que de cases :
      // un prélèvement régulier sur le tour du cadre, pour un cadre équilibré.
      function spreadSlots(slots, k){
        if(k>=slots.length) return slots.slice();
        var out=[];
        for(var i=0;i<k;i++) out.push(slots[Math.round(i*slots.length/k)%slots.length]);
        return out;
      }

      // ── Le cadre de photos ──────────────────────────────
      function drawFrame(g,L,proj){
        var chosen=pickStages(L.slots.length);
        var pts=chosen.map(function(s){
          var t=tracks[STAGES.indexOf(s)];
          var lat=s.lat, lon=s.lon;
          if((lat==null||lon==null) && t && t.pts.length){ lat=t.pts[t.pts.length-1].lat; lon=t.pts[t.pts.length-1].lon; }
          return (lat==null||lon==null) ? null : proj(lat,lon);
        });
        var keep=[];
        chosen.forEach(function(s,i){ if(pts[i]) keep.push({ stage:s, pt:pts[i], idx:STAGES.indexOf(s) }); });
        var used=spreadSlots(L.slots, keep.length);
        var pairing=assignSlots(keep.map(function(k){ return k.pt; }), used);

        // Les fils d'abord : ils passent sous les vignettes
        g.strokeStyle=C.lead; g.lineWidth=1.4;
        keep.forEach(function(k,i){
          var s=used[pairing[i]]; if(!s) return;
          g.beginPath(); g.moveTo(s.ax,s.ay); g.lineTo(k.pt[0],k.pt[1]); g.stroke();
          g.beginPath(); g.arc(k.pt[0],k.pt[1],5.5,0,Math.PI*2);
          g.fillStyle=C.track; g.fill();
          g.strokeStyle='#fff'; g.lineWidth=2; g.stroke();
          g.strokeStyle=C.lead; g.lineWidth=1.4;
        });

        keep.forEach(function(k,i){
          var s=used[pairing[i]]; if(!s) return;
          drawTile(g,s,k.stage,k.idx+1);
        });
        return keep.length;
      }

      // Tout est proportionnel à la vignette : selon le nombre d'étapes, elle
      // va de la grande photo à la miniature, et sa légende suit.
      function drawTile(g,s,stage,num){
        var k=s.w/212;
        var pad=Math.max(4, Math.round(9*k));
        var titleFS=Math.max(8, Math.min(20, Math.round(15*k)));
        var dateFS=Math.max(7, Math.round(11*k));
        var showDate=s.h>96;
        var capH=Math.round(titleFS*1.5 + (showDate?dateFS*1.35:0) + 6);
        var imgH=s.h-2*pad-capH;
        var rad=Math.max(4, Math.round(10*k));

        g.save();
        g.shadowColor='rgba(26,58,58,0.16)'; g.shadowBlur=12*k; g.shadowOffsetY=3*k;
        roundRect(g,s.x,s.y,s.w,s.h,rad);
        g.fillStyle=C.card; g.fill();
        g.restore();
        roundRect(g,s.x+0.5,s.y+0.5,s.w-1,s.h-1,rad);
        g.strokeStyle=C.cardEdge; g.lineWidth=1; g.stroke();

        g.save();
        roundRect(g,s.x+pad,s.y+pad,s.w-2*pad,imgH,Math.max(3,rad*0.6));
        g.clip();
        var entry=imgs[stage.photo];
        if(entry && entry.cv) drawCover(g,entry.cv,s.x+pad,s.y+pad,s.w-2*pad,imgH);
        else {
          g.fillStyle='#e8f7f4'; g.fillRect(s.x+pad,s.y+pad,s.w-2*pad,imgH);
          g.fillStyle='#7ecece'; g.font=Math.round(imgH*0.4)+'px sans-serif';
          g.textAlign='center'; g.textBaseline='middle';
          g.fillText('🚴', s.x+s.w/2, s.y+pad+imgH/2);
        }
        g.restore();

        // Pastille du numéro d'étape
        var br=Math.max(9, Math.round(15*k));
        g.beginPath(); g.arc(s.x+pad+br,s.y+pad+br,br,0,Math.PI*2);
        g.fillStyle='rgba(26,58,58,0.72)'; g.fill();
        g.fillStyle='#fff'; g.font='600 '+Math.max(8,Math.round(14*k))+'px "DM Sans", Helvetica, sans-serif';
        g.textAlign='center'; g.textBaseline='middle';
        g.fillText(String(num), s.x+pad+br, s.y+pad+br+1);

        // Légende : lieu (ou titre) et date courte
        g.textBaseline='alphabetic';
        var baseY=s.y+s.h-pad-(showDate?dateFS*1.35:0)-2;
        g.fillStyle=C.ink; g.font='600 '+titleFS+'px "DM Sans", Helvetica, sans-serif';
        var label=stage.location||stage.title||('Étape '+num);
        g.fillText(fit(g,label,s.w-2*pad), s.x+s.w/2, baseY);
        var d=stage.date?new Date(stage.date):null;
        if(showDate && d && !isNaN(d.getTime())){
          g.fillStyle=C.inkSoft; g.font='400 '+dateFS+'px "DM Sans", Helvetica, sans-serif';
          g.fillText(d.toLocaleDateString('fr-FR',{ day:'numeric', month:'short', year:'2-digit' }),
            s.x+s.w/2, s.y+s.h-pad-2);
        }
      }

      // ── Pied de page : profil altimétrique du voyage ────
      function drawFoot(g,L,o){
        var f=L.foot;
        g.textAlign='center'; g.textBaseline='alphabetic';

        if(o.profile){
          var prof=[], cum=0, has=false;
          tracks.forEach(function(t){
            var span=t.pts.length?t.pts[t.pts.length-1].d:0;
            t.pts.forEach(function(p){ if(!isNaN(p.ele)){ has=true; prof.push([cum+p.d,p.ele]); } });
            cum+=span;
          });
          if(has && prof.length>1){
            var x0=f.x, w=f.w, top=f.y+16, h=112, bot=top+h;
            var lo=Infinity, hi=-Infinity;
            prof.forEach(function(p){ if(p[1]<lo)lo=p[1]; if(p[1]>hi)hi=p[1]; });
            var span2=Math.max(hi-lo,1), total=prof[prof.length-1][0]||1;
            var px=function(d){ return x0+d/total*w; };
            var py=function(e){ return bot-(e-lo)/span2*h; };

            g.beginPath();
            g.moveTo(px(prof[0][0]),py(prof[0][1]));
            for(var i=1;i<prof.length;i++) g.lineTo(px(prof[i][0]),py(prof[i][1]));
            g.lineTo(px(prof[prof.length-1][0]),bot); g.lineTo(px(prof[0][0]),bot);
            g.closePath();
            var grad=g.createLinearGradient(0,top,0,bot);
            grad.addColorStop(0,'rgba(45,122,90,0.38)');
            grad.addColorStop(1,'rgba(45,122,90,0.05)');
            g.fillStyle=grad; g.fill();

            g.beginPath();
            g.moveTo(px(prof[0][0]),py(prof[0][1]));
            for(var j=1;j<prof.length;j++) g.lineTo(px(prof[j][0]),py(prof[j][1]));
            g.strokeStyle='#2a7a7a'; g.lineWidth=1.6; g.lineJoin='round'; g.stroke();

            g.strokeStyle=C.rule; g.lineWidth=1;
            g.beginPath(); g.moveTo(x0,bot); g.lineTo(x0+w,bot); g.stroke();

            g.font='500 12px "DM Sans", Helvetica, sans-serif'; g.fillStyle=C.inkSoft;
            g.textAlign='left';  g.fillText('0 km', x0, bot+18);
            g.textAlign='right'; g.fillText(frNum(total/1000)+' km', x0+w, bot+18);
            g.textAlign='center';g.fillText('profil du voyage · '+frNum(lo)+' m → '+frNum(hi)+' m', x0+w/2, bot+18);
          } else {
            g.font='500 13px "DM Sans", Helvetica, sans-serif'; g.fillStyle=C.inkSoft;
            g.fillText('Aucune altitude dans les traces GPX — profil non disponible', f.x+f.w/2, f.y+60);
          }
        }

        g.textAlign='center'; g.font='400 11px "DM Sans", Helvetica, sans-serif';
        g.fillStyle='#9fb2ad';
        g.fillText('Frontières : Natural Earth  ·  Villes : GeoNames  ·  Relief : Open-Meteo  ·  Traces : GPX du carnet',
          L.sheet.w/2, L.sheet.h-L.M+22);
      }

      // ══════════════════════════════════════════════════
      //  Rendu sur un canvas donné, à l'échelle voulue
      // ══════════════════════════════════════════════════
      // Forme du voyage (largeur / hauteur en Mercator) : la carte s'y ajuste,
      // ce qui évite les grandes plages de mer autour d'un périple tout en long.
      function contentRatio(){
        var b=contentBox();
        var w=(b.xhi-b.xlo)||1e-6, h=(b.yhi-b.ylo)||1e-6;
        return (w*1.14)/(h*1.14);
      }

      function render(canvas, scale, o){
        var L=layout(o, STAGES.length, contentRatio());
        canvas.width  = Math.round(L.sheet.w*scale);
        canvas.height = Math.round(L.sheet.h*scale);
        var g=canvas.getContext('2d');
        g.save(); g.scale(scale,scale);
        var placed=drawPoster(g,o,L);
        g.restore();
        return { layout:L, placed:placed };
      }

      // ── Cycle de rendu (relief compris) ─────────────────
      function refresh(){
        if(drawing){ pending=true; return; }
        drawing=true; pending=false;
        // Pas d'export tant que la composition n'est pas terminée : la feuille
        // exportée serait celle d'avant le réglage qu'on vient de changer.
        [el.dl300,el.dl150,el.print].forEach(function(b){ b.disabled=true; });
        var o=opts();
        var L=layout(o, STAGES.length, contentRatio());

        var chain=Promise.resolve();

        // Villes : un seul chargement pour toute la session
        if(o.cities && !cities){
          chain=chain.then(function(){
            setStatus('Chargement des villes…');
            return loadJson(CITIES_URL).then(function(list){ cities=list; }, function(){ cities=[]; });
          });
        }

        // Photos : réduites au double de la vignette, pour rester nettes à
        // l'export 300 dpi sans garder les originaux en mémoire.
        var want=Math.min(760, Math.round(L.tile.w*2));
        var need=pickStages(L.slots.length).map(function(s){ return s.photo; })
                  .filter(function(u){ return u && !(imgs[u] && imgs[u].want>=want*0.98) && imgs[u]!==null; });
        if(need.length){
          chain=chain.then(function(){
            setStatus('Chargement des photos (0 / '+need.length+')…');
            return loadThumbs(need, want, function(done,total){
              if(done%3===0 || done===total) setStatus('Chargement des photos ('+done+' / '+total+')…');
            });
          });
        }

        // Relief de l'emprise courante
        if(o.relief){
          chain=chain.then(function(){
            var view=fitView(L.map), dims=reliefDims(L.map,o.quality);
            var key=[view.south.toFixed(3),view.north.toFixed(3),view.west.toFixed(3),view.east.toFixed(3),dims.cols,dims.rows].join('|');
            if(relief && reliefKey===key) return;
            setStatus('Calcul du relief (' + (dims.cols*dims.rows).toLocaleString('fr-FR') + ' points) — quelques secondes la première fois…');
            return fetchRelief(view,dims).then(function(r){
              relief=r; reliefKey=key;
            }, function(){
              relief=null; reliefKey='';
              setStatus('Relief indisponible (Open-Meteo injoignable) — affiche dessinée sans ombrage.');
            });
          });
        } else {
          relief=null; reliefKey='';
        }

        chain.then(function(){
          var res=render(el.canvas,1,o);
          var msg=res.placed+' vignette'+(res.placed>1?'s':'')
                + (res.placed<STAGES.length ? ' (sur '+STAGES.length+' étapes — trop pour une seule feuille)' : ' — toutes les étapes')
                + ' · ' + tracks.filter(function(t){ return t.pts.length>1; }).length+' trace'+(tracks.length>1?'s':'')+' GPX'
                + ' · A3 ' + (o.orient==='p'?'portrait':'paysage');
          if(o.relief && !relief) msg+=' · relief indisponible';
          setStatus(msg);
          [el.dl300,el.dl150,el.print].forEach(function(b){ b.disabled=false; });
        }).catch(function(e){
          setStatus('Erreur pendant la composition : '+(e&&e.message?e.message:e));
        }).then(function(){
          drawing=false;
          if(pending) refresh();
        });
      }

      // ── Export ──────────────────────────────────────────
      function exportBlob(scale){
        var cv=document.createElement('canvas');
        render(cv,scale,opts());
        return new Promise(function(res){
          if(cv.toBlob) cv.toBlob(function(b){ res(b); },'image/png');
          else res(null);
        });
      }
      function download(scale,dpi){
        setStatus('Génération du PNG '+dpi+' dpi…');
        exportBlob(scale).then(function(blob){
          if(!blob){ setStatus('Export impossible sur ce navigateur.'); return; }
          var url=URL.createObjectURL(blob);
          var a=document.createElement('a');
          a.href=url; a.download='affiche-voyage-a3-'+dpi+'dpi.png';
          a.click();
          setTimeout(function(){ URL.revokeObjectURL(url); },10000);
          setStatus('PNG '+dpi+' dpi téléchargé.');
        });
      }

      el.dl300.addEventListener('click', function(){ download(2,300); });
      el.dl150.addEventListener('click', function(){ download(1,150); });
      el.print.addEventListener('click', function(){
        setStatus('Préparation de l\\'impression…');
        exportBlob(2).then(function(blob){
          if(!blob){ setStatus('Impression impossible sur ce navigateur.'); return; }
          var url=URL.createObjectURL(blob);
          var w=window.open('','_blank');
          if(!w){ setStatus('Autorisez les fenêtres pop-up pour imprimer.'); URL.revokeObjectURL(url); return; }
          var land=opts().orient==='l';
          w.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">'
            +'<title>Affiche</title><style>'
            +'@page{size:A3 '+(land?'landscape':'portrait')+';margin:0}'
            +'html,body{margin:0;padding:0;background:#fff}'
            +'img{display:block;width:100%;height:auto}'
            +'</style></head><body><img src="'+url+'"></body></html>');
          w.document.close(); w.focus();
          setTimeout(function(){ w.print(); setStatus('Fenêtre d\\'impression ouverte.'); }, 800);
        });
      });

      [el.orient,el.quality].forEach(function(s){ s.addEventListener('change', refresh); });
      [el.relief,el.profile,el.cities].forEach(function(c){ c.addEventListener('change', refresh); });

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
        if(!world) setStatus('Fond de carte introuvable — la carte sera dessinée sans frontières.');
        // Orientation proposée : celle dont le cadre colle le mieux à la forme
        // du voyage (un périple est-ouest s'affiche mieux en paysage).
        var b=contentBox(), ratio=(b.xhi-b.xlo)/Math.max(b.yhi-b.ylo,1e-9), o=opts();
        var rp=layout({ orient:'p', profile:o.profile }, STAGES.length).map;
        var rl=layout({ orient:'l', profile:o.profile }, STAGES.length).map;
        // (sans ratio ici : on compare la place disponible, pas la carte finale)
        var fitP=Math.abs(Math.log(ratio/(rp.w/rp.h))), fitL=Math.abs(Math.log(ratio/(rl.w/rl.h)));
        el.orient.value = fitL < fitP ? 'l' : 'p';
        refresh();
      }).catch(function(e){
        setStatus('Erreur de chargement : '+(e&&e.message?e.message:e));
      });
    })();
    </script>`}
  </body></html>`;
}

module.exports = { renderAffiche };
