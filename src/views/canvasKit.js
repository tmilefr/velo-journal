// ── Outils canvas partagés (affiche et livre photo) ───────
// Ce module n'exporte pas des fonctions Node mais un morceau de JavaScript
// destiné au navigateur : projection Mercator, décodage du fond de carte,
// lecture des traces GPX, chargement des photos et petites aides de dessin.
// L'affiche et le livre le glissent tel quel dans leur <script>, ce qui leur
// évite d'entretenir chacun sa copie.
const CANVAS_KIT = `
      // ── Projection Mercator ─────────────────────────────
      var RAD = Math.PI/180;
      function mercY(lat){ var l=Math.max(-85,Math.min(85,lat)); return Math.log(Math.tan(Math.PI/4 + l*Math.PI/360)); }
      function invMercY(y){ return (2*Math.atan(Math.exp(y)) - Math.PI/2) * 180/Math.PI; }
      function mercX(lon){ return lon*RAD; }

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
      // réduite dès son chargement à la taille utile, et l'original libéré.
      var imgs = {};
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

      // ── Fond de carte (TopoJSON Natural Earth) ──────────
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

      // ── Traces GPX ──────────────────────────────────────
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

      // ── Fond OpenStreetMap ──────────────────────────────
      // Le même fond que la page Carte. Les tuiles OSM sont en Mercator, comme
      // la projection de l'affiche : elles se posent par simple mise à
      // l'échelle, sans reprojection. Le zoom est choisi pour l'export 300 dpi
      // (échelle 2) : l'aperçu réduit les mêmes tuiles, l'impression est nette
      // et rien n'est téléchargé deux fois. L'attribut crossOrigin est
      // indispensable : sans lui le canvas serait « teinté » par les tuiles et
      // l'export PNG deviendrait impossible.
      var TILE_HOSTS = ['a','b','c'];
      var TILE_MAX   = 360;   // plafond de politesse pour les serveurs d'OpenStreetMap
      var tiles = {};         // tuiles déjà chargées, par z/x/y

      function tileZoom(view, rect){
        var span=Math.max(view.xright-view.xleft, 1e-9);
        // On arrondit vers le haut : mieux vaut réduire des tuiles trop fines
        // que d'en étirer de trop grosses, qui se verraient à l'impression.
        var z=Math.ceil(Math.log(rect.w*2*(2*Math.PI/span)/256)/Math.LN2);
        z=Math.max(0, Math.min(18, z));
        // Trop de tuiles pour une seule affiche : on descend d'un cran.
        while(z>0 && tileCount(view,z)>TILE_MAX) z--;
        return z;
      }
      function tileFrame(view, z){
        var n=Math.pow(2,z), K=2*Math.PI;
        return {
          n:n,
          x0:(view.xleft+Math.PI)/K*n, x1:(view.xright+Math.PI)/K*n,
          y0:(Math.PI-view.ytop)/K*n,  y1:(Math.PI-view.ybot)/K*n
        };
      }
      function tileCount(view, z){
        var f=tileFrame(view,z);
        return (Math.floor(f.x1)-Math.floor(f.x0)+1)*(Math.floor(f.y1)-Math.floor(f.y0)+1);
      }
      function loadTiles(view, z, onProgress){
        var f=tileFrame(view,z), list=[];
        for(var tx=Math.floor(f.x0); tx<=Math.floor(f.x1); tx++){
          for(var ty=Math.floor(f.y0); ty<=Math.floor(f.y1); ty++){
            if(ty<0 || ty>=f.n) continue;
            list.push({ x:((tx%f.n)+f.n)%f.n, y:ty, gx:tx, gy:ty });
          }
        }
        var next=0, done=0;
        function worker(){
          if(next>=list.length) return Promise.resolve();
          var t=list[next++];
          var key=z+'/'+t.x+'/'+t.y;
          if(tiles[key]!==undefined){ t.img=tiles[key]; done++; return worker(); }
          return new Promise(function(res){
            var im=new Image();
            im.crossOrigin='anonymous';
            im.onload =function(){ tiles[key]=im;   t.img=im;   res(); };
            im.onerror=function(){ tiles[key]=null; t.img=null; res(); };
            im.src='https://'+TILE_HOSTS[(t.x+t.y)%3]+'.tile.openstreetmap.org/'+z+'/'+t.x+'/'+t.y+'.png';
          }).then(function(){
            if(onProgress) onProgress(++done, list.length);
            return worker();
          });
        }
        var runners=[]; for(var i=0;i<Math.min(6,list.length);i++) runners.push(worker());
        return Promise.all(runners).then(function(){
          return { z:z, frame:f, list:list, ok:list.filter(function(t){ return t.img; }).length };
        });
      }
      function drawTiles(g, map, set){
        var f=set.frame, tw=map.w/(f.x1-f.x0), th=map.h/(f.y1-f.y0);
        g.imageSmoothingEnabled=true;
        if(g.imageSmoothingQuality) g.imageSmoothingQuality='high';
        set.list.forEach(function(t){
          if(!t.img) return;
          // +1 px de recouvrement : sinon un liseré de fond apparaît entre
          // deux tuiles posées à des coordonnées fractionnaires.
          g.drawImage(t.img, map.x+(t.gx-f.x0)*tw, map.y+(t.gy-f.y0)*th, tw+1, th+1);
        });
      }

      // ── Aides de dessin ─────────────────────────────────
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
      // Découpe un texte en lignes tenant dans une largeur donnée.
      function wrapText(g, text, maxW, maxLines){
        var words=String(text||'').split(/\\s+/).filter(Boolean), lines=[], cur='';
        for(var i=0;i<words.length;i++){
          var next = cur ? cur+' '+words[i] : words[i];
          if(g.measureText(next).width<=maxW || !cur){ cur=next; continue; }
          lines.push(cur); cur=words[i];
          if(maxLines && lines.length>=maxLines) break;
        }
        if(cur && (!maxLines || lines.length<maxLines)) lines.push(cur);
        if(maxLines && lines.length>=maxLines){
          var last=lines[maxLines-1]||'';
          if(words.length && g.measureText(last).width>maxW*0.98) last=fit(g,last,maxW);
          lines=lines.slice(0,maxLines);
          if(cur && lines.length===maxLines && lines[maxLines-1]!==cur) lines[maxLines-1]=fit(g,lines[maxLines-1]+' …',maxW);
        }
        return lines;
      }
`;

module.exports = { CANVAS_KIT };
