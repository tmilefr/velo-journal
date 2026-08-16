// ── Affiche : la carte du voyage au format A3, à encadrer ──
const { TRIP_TITLE, TRIP_START, TRIP_END } = require('../config');
const { CSS, renderHeader } = require('./layout');
const { CANVAS_KIT } = require('./canvasKit');

// ══════════════════════════════════════════════════════════
// Génère (côté client, sur canvas) une affiche A3 : au centre une carte
// épurée — littoraux, frontières, villes et relief ombré — parcourue par les
// traces GPX du voyage ; tout autour, en cadre, la photo favorite de chaque
// étape, reliée par un fil à son point d'arrivée sur la carte.
//
// Chaque photo se pose au plus près de son propre point d'arrivée : on part
// tout contre le point et on s'en éloigne en spirale jusqu'à trouver une
// place qui ne recouvre ni le tracé, ni un point d'étape, ni une autre photo.
// Les fils sont donc courts, les vignettes suivent le voyage en quinconce, et
// elles occupent les contrées que le parcours ne traverse pas. Leur taille est
// la plus grande où tout le monde trouve encore sa place.
//
// Deux fonds au choix :
//   • épuré  → frontières/littoraux (/public/geo/countries-50m.json, Natural
//              Earth), villes (/public/geo/cities.json, GeoNames) et relief
//              ombré (grille d'altitudes servie par /api/affiche/relief)
//   • OSM    → les tuiles d'OpenStreetMap, comme la page Carte
// Les traces, elles, viennent toujours des fichiers .gpx des étapes.
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
        <p style="font-size:14px;color:var(--ink-light);line-height:1.6;margin:0">Une carte A3 du voyage : les traces GPX sur un fond au choix — épuré (frontières, littoraux, villes et relief ombré) ou la carte OpenStreetMap de la page Carte — et la photo favorite de <strong>chaque étape</strong> posée au plus près de son point d'arrivée. Les vignettes sont aussi grandes que la feuille le permet : elles se serrent le long du voyage sans jamais recouvrir le tracé, et gagnent les contrées que le parcours ne traverse pas. À imprimer et encadrer.</p>
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
             <label class="aff-field">Fond
               <select id="affFond">
                 <option value="clean">épuré (frontières + relief)</option>
                 <option value="osm">carte OpenStreetMap</option>
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
             <label class="aff-field"><input type="checkbox" id="affPhotos" checked> Photos</label>
             <label class="aff-field"><input type="checkbox" id="affStats"> Statistiques détaillées</label>
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
        fond:    document.getElementById('affFond'),
        relief:  document.getElementById('affRelief'),
        quality: document.getElementById('affQuality'),
        profile: document.getElementById('affProfile'),
        cities:  document.getElementById('affCities'),
        photos:  document.getElementById('affPhotos'),
        stats:   document.getElementById('affStats'),
        dl300:   document.getElementById('affDownload'),
        dl150:   document.getElementById('affDownload150'),
        print:   document.getElementById('affPrint')
      };

      var world = null;   // frontières décodées
      var tileSet = null; // tuiles de l'emprise courante
      var cities = null;  // villes, de la plus peuplée à la moins peuplée
      var tracks = null;  // traces GPX + altitudes
      var relief = null;  // grille d'altitudes de l'emprise courante
      var reliefKey = ''; // emprise/finesse déjà demandées
      var drawing = false, pending = false;

      function setStatus(t){ el.status.textContent = t; }
      function opts(){
        return {
          orient:  el.orient.value === 'l' ? 'l' : 'p',
          fond:    el.fond.value === 'osm' ? 'osm' : 'clean',
          relief:  el.relief.checked,
          quality: el.quality.value,
          profile: el.profile.checked,
          cities:  el.cities.checked,
          photos:  el.photos.checked,
          stats:   el.stats.checked
        };
      }

${CANVAS_KIT}

      // ── TopoJSON : arcs, anneaux, et partage des frontières ──
      // Un arc utilisé par deux pays est une frontière ; utilisé une seule
      // fois, c'est un littoral. On les trace donc différemment, et une seule
      // fois chacun (pas de double trait sur les frontières communes).

      // ── GPX ─────────────────────────────────────────────

      // ── Emprise de la carte ─────────────────────────────
      // Tout se calcule en Mercator (x et y en radians, sinon la carte serait
      // étirée d'un facteur 57 en longitude) : toutes les traces et tous les
      // points d'étape tiennent dans le cadre avec une marge, puis l'emprise
      // est étendue — à échelle constante — au format du cadre.
      var RAD = Math.PI/180;

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

      // L'emprise est calculée pour la zone que les vignettes n'atteignent
      // jamais, puis prolongée — à la même échelle, Mercator étant linéaire —
      // jusqu'aux bords de la carte. Le fond continue donc sous les photos,
      // alors que la trace, elle, reste toujours à découvert.
      function widenView(view, safe, map){
        var sx=(view.xright-view.xleft)/safe.w, sy=(view.ybot-view.ytop)/safe.h;
        var xleft = view.xleft + (map.x-safe.x)*sx;
        var xright= view.xleft + (map.x+map.w-safe.x)*sx;
        var ytop  = view.ytop  + (map.y-safe.y)*sy;
        var ybot  = view.ytop  + (map.y+map.h-safe.y)*sy;
        var YMAX=mercY(84);
        ytop=Math.min(YMAX, ytop); ybot=Math.max(-YMAX, ybot);
        return {
          west:xleft/RAD, east:xright/RAD, south:invMercY(ybot), north:invMercY(ytop),
          xleft:xleft, xright:xright, ytop:ytop, ybot:ybot
        };
      }

      // ── Géométrie de la feuille ─────────────────────────
      // La carte occupe toute la surface intérieure ; les vignettes se posent
      // dessus, chacune au plus près de son étape (voir placeTiles). La zone
      // « safe » sert seulement à ajuster le tracé : une marge tout autour,
      // pour que le voyage ne colle pas aux bords de la feuille.
      var TILE_SIZES=[560,500,450,410,380,340,300,268,240,214,192,172,154,138,124,112,100,90,82,74];
      var TRACE_INSET = 0.06;   // marge laissée autour du tracé, en part du cadre

      function layout(o, count, ratio){
        var S = SHEET[o.orient];
        var M = 84, HEAD = 168, FOOT = o.profile ? 214 : 96;
        var inner = { x:M, y:M+HEAD, w:S.w-2*M, h:S.h-2*M-HEAD-FOOT };
        var n = Math.max(1, count||1);
        var padX=inner.w*TRACE_INSET, padY=inner.h*TRACE_INSET;

        // Taille de départ : ce que n vignettes peuvent occuper si elles se
        // partagent la moitié de la feuille. placeTiles part de là et essaie
        // plus grand tant que tout le monde trouve sa place.
        var est=Math.sqrt(inner.w*inner.h*0.5/(n*0.9));
        var TW=TILE_SIZES[TILE_SIZES.length-1];
        for(var i=0;i<TILE_SIZES.length;i++){ if(TILE_SIZES[i]<=est){ TW=TILE_SIZES[i]; break; } }

        return {
          sheet:S, M:M,
          head:{ x:M, y:M, w:S.w-2*M, h:HEAD },
          foot:{ x:M, y:S.h-M-FOOT, w:S.w-2*M, h:FOOT },
          inner:inner,
          map:{ x:inner.x, y:inner.y, w:inner.w, h:inner.h },
          safe:{ x:inner.x+padX, y:inner.y+padY, w:inner.w-2*padX, h:inner.h-2*padY },
          slots:[],                       // rempli par placeTiles, au moment du rendu
          tile:{ w:TW, h:Math.round(TW*0.9) }
        };
      }

      // Filet de sécurité : un carnet trop fourni pour la feuille garde le
      // départ, l'arrivée et un échantillon régulier entre les deux.
      function pickStages(k){
        if(STAGES.length <= k) return STAGES.slice();
        var out=[];
        for(var i=0;i<k;i++) out.push(STAGES[Math.round(i*(STAGES.length-1)/(k-1))]);
        return out;
      }

      // ── Relief ──────────────────────────────────────────
      // Une emprise (et sa finesse) résumée en une clé : inutile de recharger
      // le relief ou les tuiles tant qu'elle n'a pas bougé.
      function reliefKeyOf(view, extra){
        return [view.south.toFixed(3),view.north.toFixed(3),
                view.west.toFixed(3),view.east.toFixed(3),extra].join('|');
      }
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

      // ══════════════════════════════════════════════════
      //  Rendu de l'affiche
      // ══════════════════════════════════════════════════
      // Emprise dessinée : ajustée à la zone libre, puis élargie aux bords de
      // la carte. Utilisée aussi bien pour le rendu que pour aller chercher le
      // relief ou les tuiles.
      function viewOf(L){ return widenView(fitView(L.safe), L.safe, L.map); }

      function drawPoster(g, o, L){
        var S=L.sheet, map=L.map;
        var view=viewOf(L), proj=projector(view,map);

        // Tout se décide avant le premier trait : le masque du tracé, puis
        // les encarts posés là où ils ne cachent rien, puis les vignettes —
        // la carte doit savoir où seront les uns et les autres pour ne pas y
        // écrire de noms de villes.
        var mask=buildMask(L, proj);
        L.legend=legendGeom(L,view,mask);
        L.stats=o.stats ? statsGeom(L,mask) : null;
        [L.legend,L.stats].forEach(function(b){
          if(b) mask.markRect(b.x-10,b.y-10,b.w+20,b.h+20);
        });
        mask.seal();
        placeTiles(L, proj, o, mask);

        g.fillStyle=C.paper; g.fillRect(0,0,S.w,S.h);

        drawHead(g,L);
        drawMap(g,L,view,proj,o);
        var placed=drawFrame(g,L);
        drawStats(g,L);
        drawFoot(g,L,o);
        return placed;
      }

      // ── Statistiques détaillées ─────────────────────────
      // Les chiffres que le sous-titre ne peut pas porter : durée, moyennes,
      // records, pays traversés. L'encart se pose dans un coin de la zone
      // libre, et les photos l'évitent comme elles évitent la légende.
      function tripStats(){
        var km=0, dplus=0, train=0, best=null, high=null, days={}, countries=[];
        STAGES.forEach(function(s){
          km+=s.km||0; dplus+=s.dplus||0; train+=s.trainKm||0;
          if(s.km && (!best || s.km>best.km)) best=s;
          if(s.dplus && (!high || s.dplus>high.dplus)) high=s;
          if(s.date) days[String(s.date).slice(0,10)]=1;
          var c=(s.country||'').trim();
          if(c && countries.indexOf(c)<0) countries.push(c);
        });
        var first=STAGES[0]&&STAGES[0].date ? new Date(STAGES[0].date) : null;
        var last=STAGES[STAGES.length-1]&&STAGES[STAGES.length-1].date ? new Date(STAGES[STAGES.length-1].date) : null;
        var span = (first&&last&&!isNaN(first)&&!isNaN(last))
          ? Math.round((last-first)/86400000)+1 : 0;
        var ridden=Object.keys(days).length;
        return {
          km:km, dplus:dplus, train:train, span:span, ridden:ridden,
          perDay: ridden ? km/ridden : 0,
          best:best, high:high, countries:countries
        };
      }
      function statsRows(){
        var t=tripStats(), rows=[];
        if(t.span)  rows.push(['Durée', t.span+' jour'+(t.span>1?'s':'')+(t.ridden?' · '+t.ridden+' avec étape':'')]);
        rows.push(['Distance', frNum(t.km)+' km'+(t.train?'  ·  '+frNum(t.train)+' km en train':'')]);
        rows.push(['Dénivelé', frNum(t.dplus)+' m D+']);
        if(t.perDay) rows.push(['Moyenne', frNum(t.perDay)+' km par étape']);
        if(t.best)   rows.push(['Plus longue', frNum(t.best.km)+' km — '+(t.best.location||t.best.title||'')]);
        if(t.high)   rows.push(['Plus raide', frNum(t.high.dplus)+' m D+ — '+(t.high.location||t.high.title||'')]);
        if(t.countries.length) rows.push([t.countries.length>1?'Pays traversés':'Pays', t.countries.join(', ')]);
        return rows;
      }
      function statsGeom(L, mask){
        var safe=L.safe, rows=statsRows();
        if(!rows.length || safe.w<340 || safe.h<260) return null;
        var w=Math.min(520, Math.max(360, safe.w*0.34));
        var h=26+rows.length*34+14;
        var pos=placeCard(mask, safe, w, h, ['tr','tl','br','bl']);
        return { x:pos.x, y:pos.y, w:w, h:h, rows:rows };
      }
      function drawStats(g,L){
        var b=L.stats;
        if(!b) return;
        g.save();
        roundRect(g,b.x,b.y,b.w,b.h,12);
        g.fillStyle='rgba(255,255,255,0.88)'; g.fill();
        g.strokeStyle='rgba(26,58,58,0.10)'; g.lineWidth=1; g.stroke();
        g.textBaseline='alphabetic';
        b.rows.forEach(function(row,i){
          var y=b.y+26+i*34+8;
          g.textAlign='left';
          g.font='600 12px "DM Sans", Helvetica, sans-serif'; g.fillStyle='#9fb2ad';
          g.fillText(row[0].toUpperCase(), b.x+18, y);
          g.font='500 16px "DM Sans", Helvetica, sans-serif'; g.fillStyle=C.ink;
          g.fillText(fit(g,row[1],b.w-36), b.x+18, y+18);
        });
        g.restore();
      }

      // ── Vignettes : chacune au plus près de son étape ───
      // Plutôt qu'un cadre autour de la carte, chaque photo cherche une place
      // libre autour de son propre point d'arrivée : on part tout près du
      // point et on s'en éloigne en spirale jusqu'à trouver un emplacement qui
      // ne recouvre ni le tracé, ni un point d'étape, ni une autre photo, ni
      // la légende. Les fils deviennent courts, et les contrées que le voyage
      // ne traverse pas se remplissent de grandes photos.
      var TRACE_PAD = 16;    // marge gardée autour du tracé
      var DOT_PAD   = 26;    // ... et autour d'un point d'étape
      var TILE_GAP  = 10;    // écart entre deux vignettes
      var GROW_MAX  = 1.7;   // agrandissement maximal d'une vignette isolée

      // Masque des zones interdites, en cases de 10 px, avec somme cumulée :
      // savoir si un rectangle est libre coûte alors quatre additions.
      function buildMask(L, proj){
        var inner=L.inner, CELL=10;
        var cols=Math.ceil(inner.w/CELL)+2, rows=Math.ceil(inner.h/CELL)+2;
        var grid=new Uint8Array(cols*rows);
        function markRect(x,y,w,h){
          var c0=Math.max(0,Math.floor((x-inner.x)/CELL)), c1=Math.min(cols-1,Math.floor((x+w-inner.x)/CELL));
          var r0=Math.max(0,Math.floor((y-inner.y)/CELL)), r1=Math.min(rows-1,Math.floor((y+h-inner.y)/CELL));
          for(var r=r0;r<=r1;r++) for(var c=c0;c<=c1;c++) grid[r*cols+c]=1;
        }
        function markPt(x,y,pad){ markRect(x-pad,y-pad,2*pad,2*pad); }
        function markSeg(a,b,pad){
          var dx=b[0]-a[0], dy=b[1]-a[1], d=Math.sqrt(dx*dx+dy*dy);
          var steps=Math.min(200, Math.ceil(d/(CELL*0.7)));
          for(var i=0;i<=steps;i++) markPt(a[0]+dx*i/steps, a[1]+dy*i/steps, pad);
        }

        tracks.forEach(function(t){
          var prev=null;
          t.pts.forEach(function(p){
            var q=proj(p.lat,p.lon);
            if(prev) markSeg(prev,q,TRACE_PAD); else markPt(q[0],q[1],TRACE_PAD);
            prev=q;
          });
        });
        var prevPt=null;
        STAGES.forEach(function(st,i){
          if(st.lat==null||st.lon==null){ prevPt=null; return; }
          var p=proj(st.lat,st.lon);
          markPt(p[0],p[1],DOT_PAD);
          // Raccord entre deux étapes quand la seconde n'a pas de trace
          if(prevPt && !(tracks[i] && tracks[i].pts.length>1)) markSeg(prevPt,p,TRACE_PAD);
          prevPt=p;
        });
        // Somme cumulée : sum[r][c] = nombre de cases interdites au-dessus et
        // à gauche. Compter les cases occupées d'un rectangle coûte alors
        // quatre additions. Elle est recalculée à chaque fois qu'on ajoute
        // quelque chose au masque (les encarts, une fois placés).
        var sum=null;
        function seal(){
          sum=new Int32Array((cols+1)*(rows+1));
          for(var r=0;r<rows;r++){
            var acc=0;
            for(var c=0;c<cols;c++){
              acc+=grid[r*cols+c];
              sum[(r+1)*(cols+1)+(c+1)] = sum[r*(cols+1)+(c+1)] + acc;
            }
          }
        }
        function busy(x,y,w,h){
          var c0=Math.max(0,Math.floor((x-inner.x)/CELL)), c1=Math.min(cols-1,Math.floor((x+w-inner.x)/CELL));
          var r0=Math.max(0,Math.floor((y-inner.y)/CELL)), r1=Math.min(rows-1,Math.floor((y+h-inner.y)/CELL));
          var W=cols+1;
          return sum[(r1+1)*W+(c1+1)] - sum[r0*W+(c1+1)] - sum[(r1+1)*W+c0] + sum[r0*W+c0];
        }
        seal();
        return {
          markRect: function(x,y,w,h){ markRect(x,y,w,h); },
          seal: seal,
          busy: function(x,y,w,h){
            if(x<inner.x || y<inner.y || x+w>inner.x+inner.w || y+h>inner.y+inner.h) return Infinity;
            return busy(x,y,w,h);
          },
          free: function(x,y,w,h){
            if(x<inner.x || y<inner.y || x+w>inner.x+inner.w || y+h>inner.y+inner.h) return false;
            return busy(x,y,w,h)===0;
          }
        };
      }

      // Pose un encart (légende, statistiques) là où il ne cache rien : on
      // essaie les quatre coins de la zone libre, puis, si le tracé les occupe
      // tous, on balaie la feuille et on retient l'endroit le moins encombré.
      function placeCard(mask, area, w, h, order){
        var M=16, cands=[];
        var corners={
          bl:[area.x+M, area.y+area.h-h-M], br:[area.x+area.w-w-M, area.y+area.h-h-M],
          tl:[area.x+M, area.y+M],          tr:[area.x+area.w-w-M, area.y+M]
        };
        (order||['bl','br','tl','tr']).forEach(function(k){ if(corners[k]) cands.push(corners[k]); });
        for(var i=0;i<cands.length;i++){
          if(mask.free(cands[i][0],cands[i][1],w,h)) return { x:cands[i][0], y:cands[i][1], w:w, h:h };
        }
        var best=null, step=24;
        for(var y=area.y+M; y+h<=area.y+area.h-M; y+=step){
          for(var x=area.x+M; x+w<=area.x+area.w-M; x+=step){
            var b=mask.busy(x,y,w,h);
            if(b===0) return { x:x, y:y, w:w, h:h };
            if(!best || b<best.b) best={ x:x, y:y, w:w, h:h, b:b };
          }
        }
        return best || { x:cands[0][0], y:cands[0][1], w:w, h:h };
      }

      // Place les vignettes : on essaie la plus grande taille possible, et pour
      // chacune on cherche en spirale autour de son point d'étape.
      function placeTiles(L, proj, o, mask){
        if(o && !o.photos){ L.slots=[]; return L.slots; }   // affiche sans photos
        var pts=STAGES.map(function(s,i){
          var lat=s.lat, lon=s.lon, t=tracks[i];
          if((lat==null||lon==null) && t && t.pts.length){
            lat=t.pts[t.pts.length-1].lat; lon=t.pts[t.pts.length-1].lon;
          }
          return (lat==null||lon==null) ? null : proj(lat,lon);
        });
        var live=[];
        STAGES.forEach(function(s,i){ if(pts[i]) live.push({ stage:s, num:i+1, pt:pts[i] }); });
        // Les étapes serrées les unes contre les autres passent en premier :
        // ce sont elles qui manquent de place, autant qu'elles choisissent
        // pendant que la feuille est encore vide.
        var order=live.map(function(it,i){
          var near=0;
          live.forEach(function(o){
            var dx=o.pt[0]-it.pt[0], dy=o.pt[1]-it.pt[1];
            if(dx*dx+dy*dy < 260*260) near++;
          });
          return { it:it, near:near, i:i };
        }).sort(function(a,b){ return b.near-a.near || a.i-b.i; }).map(function(e){ return e.it; });

        function overlaps(placed, x, y, w, h){
          for(var i=0;i<placed.length;i++){
            var s=placed[i];
            if(x < s.x+s.w+TILE_GAP && x+w+TILE_GAP > s.x &&
               y < s.y+s.h+TILE_GAP && y+h+TILE_GAP > s.y) return true;
          }
          return false;
        }
        // Recherche en spirale : anneaux de plus en plus larges autour du point,
        // seize directions par anneau, décalées d'un anneau à l'autre pour ne
        // pas aligner toutes les photos sur les mêmes axes.
        function spot(placed, p, w, h, reach){
          var r0=Math.max(w,h)*0.55+DOT_PAD, step=14, NA=16;
          for(var r=r0; r<=reach; r+=step){
            for(var a=0; a<NA; a++){
              var ang=(a/NA)*2*Math.PI + (r/step)*0.31;
              var x=p[0]+Math.cos(ang)*r-w/2, y=p[1]+Math.sin(ang)*r-h/2;
              if(!mask.free(x,y,w,h)) continue;
              if(overlaps(placed,x,y,w,h)) continue;
              return { x:x, y:y };
            }
          }
          return null;
        }

        // La plus grande taille où tout le monde trouve sa place
        var reach=Math.max(L.inner.w, L.inner.h)*0.75;
        var best=null;
        for(var ti=0; ti<TILE_SIZES.length; ti++){
          var TW=TILE_SIZES[ti], TH=Math.round(TW*0.9);
          if(TW*TH*live.length > L.inner.w*L.inner.h*0.62) continue;   // manifestement trop
          var placed=[], ok=true;
          for(var i=0;i<order.length;i++){
            var pos=spot(placed, order[i].pt, TW, TH, reach);
            if(!pos){ ok=false; break; }
            placed.push({ x:pos.x, y:pos.y, w:TW, h:TH, stage:order[i].stage, num:order[i].num, pt:order[i].pt });
          }
          if(ok){ best={ tiles:placed, TW:TW, TH:TH }; break; }
        }
        if(!best){
          // Feuille saturée : on garde ce qui rentre, à la plus petite taille.
          var TWm=TILE_SIZES[TILE_SIZES.length-1], THm=Math.round(TWm*0.9), kept=[];
          order.forEach(function(it){
            var pos=spot(kept, it.pt, TWm, THm, reach);
            if(pos) kept.push({ x:pos.x, y:pos.y, w:TWm, h:THm, stage:it.stage, num:it.num, pt:it.pt });
          });
          best={ tiles:kept, TW:TWm, TH:THm };
        }

        // Rapprochement : chaque photo retente sa chance sans elle-même dans le
        // décor. Les premières posées se sont éloignées pour rien lorsque leurs
        // voisines n'étaient pas encore là — ce tour de rattrapage raccourcit
        // les fils sans jamais empiéter sur le tracé.
        var tiles0=best.tiles;
        function reach2(s){
          var ax=Math.max(s.x, Math.min(s.pt[0], s.x+s.w));
          var ay=Math.max(s.y, Math.min(s.pt[1], s.y+s.h));
          return Math.sqrt((s.pt[0]-ax)*(s.pt[0]-ax)+(s.pt[1]-ay)*(s.pt[1]-ay));
        }
        for(var pass=0; pass<2; pass++){
          tiles0.forEach(function(s){
            var before=reach2(s);
            if(before<=1) return;
            var others=tiles0.filter(function(t){ return t!==s; });
            var pos=spot(others, s.pt, s.w, s.h, before+s.w);
            if(!pos) return;
            var old={ x:s.x, y:s.y }; s.x=pos.x; s.y=pos.y;
            if(reach2(s) >= before-1){ s.x=old.x; s.y=old.y; }
          });
        }

        // Une photo au large peut encore grandir : par petits pas et pour
        // toutes à la fois, pour qu'elles restent de tailles comparables.
        var tiles=best.tiles, grew=true, round=0;
        while(grew && round++<20){
          grew=false;
          tiles.forEach(function(s){
            if(s.w >= best.TW*GROW_MAX) return;
            var w=s.w*1.06, h=s.h*1.06, x=s.x-(w-s.w)/2, y=s.y-(h-s.h)/2;
            if(!mask.free(x,y,w,h)) return;
            if(overlaps(tiles.filter(function(t){ return t!==s; }), x,y,w,h)) return;
            s.x=x; s.y=y; s.w=w; s.h=h; grew=true;
          });
        }

        L.slots=tiles;
        L.tile={ w:best.TW, h:best.TH };
        return tiles;
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
        var osm = o.fond==='osm' && tileSet && tileSet.ok;
        g.save();
        g.beginPath(); g.rect(map.x,map.y,map.w,map.h); g.clip();

        // Mer
        g.fillStyle=C.sea; g.fillRect(map.x,map.y,map.w,map.h);

        // Fond OpenStreetMap : il porte déjà terres, frontières et villes,
        // on lui laisse toute la place et on saute le fond vectoriel. Un voile
        // de la couleur du papier l'apaise juste assez pour que la trace et
        // les vignettes gardent le premier plan.
        if(osm){
          drawTiles(g, map, tileSet);
          g.fillStyle='rgba(251,250,246,0.20)';
          g.fillRect(map.x,map.y,map.w,map.h);
        }

        // Terres : un seul chemin, règle pair-impair pour évider les lacs
        var land=new Path2D(), drawn=0;
        if(world && !osm){
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
        if(relief && !osm && drawn){
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
        } else if(relief && !osm && !drawn){
          var bmp2=reliefBitmap(relief);
          var a2=proj(relief.north,relief.west), b2=proj(relief.south,relief.east);
          g.drawImage(bmp2, a2[0], a2[1], b2[0]-a2[0], b2[1]-a2[1]);
        }

        // Frontières puis littoraux (chaque arc une seule fois)
        if(world && !osm){
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

        // Villes, puis points d'étape par-dessus. Le fond OSM porte déjà ses
        // propres noms de lieux : en rajouter ferait double emploi.
        if(o.cities && !osm) drawCities(g,L,view,proj);

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

        drawLegend(g,L);

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
        // Les vignettes seront posées par-dessus la carte : une étiquette
        // glissée dessous serait tronquée, on réserve donc leur emplacement.
        L.slots.forEach(function(s){ boxes.push([s.x-6,s.y-6,s.w+12,s.h+12]); });
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
      // Position et taille de la légende, calculées avant tout dessin : les
      // vignettes doivent savoir où elle se trouve pour ne pas s'y poser.
      function legendGeom(L, view, mask){
        var map=L.map, safe=L.safe;
        if(safe.w<300 || safe.h<200) return null;   // zone libre trop petite
        var latC=(view.north+view.south)/2;
        var mPerPx=(view.east-view.west)*Math.PI/180*6378137*Math.cos(latC*Math.PI/180)/map.w;
        var want=Math.max(90, Math.min(170, safe.w*0.22));
        var CANDS=[1,2,5,10,20,50,100,200,500,1000,2000,5000];
        var kmBar=CANDS[CANDS.length-1];
        for(var i=0;i<CANDS.length;i++){ if(CANDS[i]*1000/mPerPx>=want){ kmBar=CANDS[i]; break; } }
        var barPx=kmBar*1000/mPerPx;
        var boxW=Math.max(200, barPx+40), boxH=relief?128:78;
        var pos=placeCard(mask, safe, boxW, boxH, ['bl','br','tl','tr']);
        return { x:pos.x, y:pos.y, w:boxW, h:boxH, kmBar:kmBar, barPx:barPx };
      }

      function drawLegend(g,L){
        var box=L.legend;
        if(!box) return;
        var x=box.x, y=box.y, boxW=box.w, boxH=box.h, kmBar=box.kmBar, barPx=box.barPx;

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

      // ── Les photos ──────────────────────────────────────
      // Chaque vignette est déjà posée près de son étape : il reste à tirer le
      // fil entre elle et son point, puis à la dessiner par-dessus.
      function drawFrame(g,L){
        var tiles=L.slots;

        g.strokeStyle=C.lead; g.lineWidth=1.5;
        tiles.forEach(function(s){
          // Le fil part du bord de la vignette le plus proche du point : quand
          // la photo est juste à côté, il se réduit à un trait discret.
          var ax=Math.max(s.x, Math.min(s.pt[0], s.x+s.w));
          var ay=Math.max(s.y, Math.min(s.pt[1], s.y+s.h));
          var dx=s.pt[0]-ax, dy=s.pt[1]-ay, d=Math.sqrt(dx*dx+dy*dy);
          if(d>7){
            g.beginPath(); g.moveTo(ax,ay);
            g.lineTo(s.pt[0]-dx/d*6, s.pt[1]-dy/d*6);
            g.stroke();
          }
          g.beginPath(); g.arc(s.pt[0],s.pt[1],5.5,0,Math.PI*2);
          g.fillStyle=C.track; g.fill();
          g.strokeStyle='#fff'; g.lineWidth=2; g.stroke();
          g.strokeStyle=C.lead; g.lineWidth=1.5;
        });

        tiles.forEach(function(s){ drawTile(g,s,s.stage,s.num); });
        return tiles.length;
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
        // OpenStreetMap demande que ses fonds soient crédités sur la carte.
        var credit = (o.fond==='osm' && tileSet && tileSet.ok)
          ? 'Fond de carte : © OpenStreetMap contributors  ·  Traces : GPX du carnet'
          : 'Frontières : Natural Earth  ·  Villes : GeoNames  ·  Relief : Open-Meteo  ·  Traces : GPX du carnet';
        g.fillText(credit, L.sheet.w/2, L.sheet.h-L.M+22);
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
        // Sur fond OSM, relief et villes viennent des tuiles : les réglages
        // du fond épuré n'ont plus de prise.
        [el.relief,el.quality,el.cities].forEach(function(c){ c.disabled = o.fond==='osm'; });

        var chain=Promise.resolve();

        // Villes : un seul chargement pour toute la session
        if(o.cities && !cities){
          chain=chain.then(function(){
            setStatus('Chargement des villes…');
            return loadJson(CITIES_URL).then(function(list){ cities=list; }, function(){ cities=[]; });
          });
        }

        // Photos : réduites au double de la vignette, pour rester nettes à
        // l'export 300 dpi sans garder les originaux en mémoire. Chaque étape a
        // la sienne — les emplacements, eux, ne sont connus qu'au dessin.
        var want=Math.min(860, Math.round(L.tile.w*2*GROW_MAX));
        var need=(o.photos ? STAGES : []).map(function(s){ return s.photo; })
                  .filter(function(u){ return u && !(imgs[u] && imgs[u].want>=want*0.98) && imgs[u]!==null; });
        if(need.length){
          chain=chain.then(function(){
            setStatus('Chargement des photos (0 / '+need.length+')…');
            return loadThumbs(need, want, function(done,total){
              if(done%3===0 || done===total) setStatus('Chargement des photos ('+done+' / '+total+')…');
            });
          });
        }

        // Fond OpenStreetMap : les tuiles de l'emprise courante
        if(o.fond==='osm'){
          chain=chain.then(function(){
            var view=viewOf(L), z=tileZoom(view,L.map);
            if(tileSet && tileSet.key===reliefKeyOf(view,z)) return;
            setStatus('Chargement du fond OpenStreetMap (' + tileCount(view,z) + ' tuiles)…');
            return loadTiles(view, z, function(done,total){
              if(done%8===0 || done===total) setStatus('Chargement du fond OpenStreetMap ('+done+' / '+total+')…');
            }).then(function(set){
              set.key=reliefKeyOf(view,z);
              tileSet = set.ok ? set : null;
            }, function(){ tileSet=null; });
          });
        } else {
          tileSet=null;
        }

        // Relief de l'emprise courante (fond épuré seulement)
        if(o.relief && o.fond!=='osm'){
          chain=chain.then(function(){
            var view=viewOf(L), dims=reliefDims(L.map,o.quality);
            var key=reliefKeyOf(view, dims.cols+'x'+dims.rows);
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
          var msg=(o.photos
                ? res.placed+' vignette'+(res.placed>1?'s':'')
                  + (res.placed<STAGES.length ? ' (sur '+STAGES.length+' étapes — trop pour une seule feuille)' : ' — toutes les étapes')
                : 'carte seule, sans photos')
                + ' · ' + tracks.filter(function(t){ return t.pts.length>1; }).length+' trace'+(tracks.length>1?'s':'')+' GPX'
                + ' · A3 ' + (o.orient==='p'?'portrait':'paysage');
          if(o.fond==='osm') msg += tileSet
            ? ' · fond OSM (zoom '+tileSet.z+', '+tileSet.ok+' tuiles)'
            : ' · fond OSM injoignable — dessiné en épuré';
          else if(o.relief && !relief) msg+=' · relief indisponible';
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

      [el.orient,el.quality,el.fond].forEach(function(s){ s.addEventListener('change', refresh); });
      [el.relief,el.profile,el.cities,el.photos,el.stats].forEach(function(c){ c.addEventListener('change', refresh); });

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
