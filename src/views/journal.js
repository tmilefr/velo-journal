const { TRIP_TITLE } = require('../config');
const { totalKm, totalDPlus } = require('../services/stats');
const { CSS, renderHeader } = require('./layout');
const {
  LIGHTBOX_JS, LIGHTBOX_HTML, TRANSLATE_JS, SINGLE_VIDEO_JS,
  ELEV_MODAL_HTML, ELEV_MODAL_JS, SLEEP_MODAL_HTML, SLEEP_MODAL_JS,
  DELETE_CONFIRM_JS, COMMENTS_JS,
} = require('./scripts');
const { renderCard } = require('./card');

// ══════════════════════════════════════════════════════════
//  renderPublic
// ══════════════════════════════════════════════════════════

function renderPublic(posts, isAdmin = false, csrf = '', isStrictAdmin = false) {
  const km      = Math.round(totalKm(posts));
  const dp      = Math.round(totalDPlus(posts)).toLocaleString('fr-FR');
  const withGps = posts.filter(p => p.lat && p.lon);

  const PAGE = 5;
  const firstBatch = posts.slice(0, PAGE);
  const hasMore    = posts.length > PAGE;

  const postCards = posts.length === 0
    ? `<div class="empty"><div class="empty-icon">🚴</div><h3>Le voyage n'a pas encore commencé...</h3><p>Les étapes apparaîtront ici !</p></div>`
    : firstBatch.map(p => renderCard(p, isAdmin, csrf, isStrictAdmin)).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${TRIP_TITLE}</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'journal', isAdmin, isStrictAdmin, showMap: withGps.length > 0, csrf })}
    <div class="stats-bar">
      <div class="stat"><div class="stat-num">${km.toLocaleString('fr-FR')}</div><div class="stat-lbl">km</div></div>
      <div class="stat"><div class="stat-num">${posts.length}</div><div class="stat-lbl">étapes</div></div>
      <div class="stat"><div class="stat-num">${dp}</div><div class="stat-lbl">m D+</div></div>
    </div>
    <div class="feed" id="feed">${postCards}</div>
    ${hasMore ? `<div id="loadMoreSentinel" data-offset="${PAGE}" style="text-align:center;padding:24px 12px 40px">
      <div class="lazy-spinner" id="lazySpinner" style="display:none">⏳ Chargement…</div>
    </div>` : ''}
    ${isAdmin ? `<a class="fab" href="/post" title="Nouvelle étape">+</a>` : ''}
    ${LIGHTBOX_HTML}
    ${ELEV_MODAL_HTML}
    ${SLEEP_MODAL_HTML}
    <script>
    (function(){
      function lon2xf(lon,z){return(lon+180)/360*Math.pow(2,z);}
      function lat2yf(lat,z){var r=lat*Math.PI/180;return(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z);}
      function bestZoom(pts,W,H,pad){
        var minLat=Infinity,maxLat=-Infinity,minLon=Infinity,maxLon=-Infinity;
        pts.forEach(function(p){if(p.lat<minLat)minLat=p.lat;if(p.lat>maxLat)maxLat=p.lat;if(p.lon<minLon)minLon=p.lon;if(p.lon>maxLon)maxLon=p.lon;});
        for(var z=16;z>=5;z--){var pw=(lon2xf(maxLon,z)-lon2xf(minLon,z))*256,ph=(lat2yf(minLat,z)-lat2yf(maxLat,z))*256;if(pw<=W-pad*2&&ph<=H-pad*2)return z;}
        return 5;
      }
      function drawGpxCanvas(canvas){
        if(canvas.dataset.gpxDrawn)return; canvas.dataset.gpxDrawn='1';
        var gpxUrl=canvas.dataset.gpx; if(!gpxUrl)return;
        fetch(gpxUrl).then(function(r){return r.text();}).then(function(txt){
          var xml=new DOMParser().parseFromString(txt,'text/xml');
          var raw=Array.from(xml.querySelectorAll('trkpt')).map(function(p){return{lat:parseFloat(p.getAttribute('lat')),lon:parseFloat(p.getAttribute('lon'))};});
          if(raw.length<2)return;
          var pts=raw.length>600?raw.filter(function(_,i){return i%Math.ceil(raw.length/600)===0;}):raw;
          if(pts[pts.length-1]!==raw[raw.length-1])pts.push(raw[raw.length-1]);
          var dpr=Math.min(window.devicePixelRatio||1,2),W=canvas.parentElement.clientWidth||560,H=260;
          canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';
          var ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
          ctx.fillStyle='#e8f0e8';ctx.fillRect(0,0,W,H);
          var z=bestZoom(pts,W,H,48);
          var minLat=Infinity,maxLat=-Infinity,minLon=Infinity,maxLon=-Infinity;
          pts.forEach(function(p){if(p.lat<minLat)minLat=p.lat;if(p.lat>maxLat)maxLat=p.lat;if(p.lon<minLon)minLon=p.lon;if(p.lon>maxLon)maxLon=p.lon;});
          var cx=(lon2xf(minLon,z)+lon2xf(maxLon,z))/2,cy=(lat2yf(minLat,z)+lat2yf(maxLat,z))/2;
          var ox=cx-W/2/256,oy=cy-H/2/256;
          function toPixel(lat,lon){return{x:(lon2xf(lon,z)-ox)*256,y:(lat2yf(lat,z)-oy)*256};}
          var tx0=Math.floor(ox),tx1=Math.floor(ox+W/256)+1,ty0=Math.floor(oy),ty1=Math.floor(oy+H/256)+1;
          var tileMax=Math.pow(2,z)-1,totalTiles=(tx1-tx0+1)*(ty1-ty0+1),loadedTiles=0,tiles=[];
          function onTileLoaded(){loadedTiles++;redraw();if(loadedTiles>=totalTiles){var f=canvas.parentElement.querySelector('.gpx-map-lbl');if(f)f.textContent='🗺️ Trace GPX';}}
          for(var tx=tx0;tx<=tx1;tx++){for(var ty=ty0;ty<=ty1;ty++){
            if(tx<0||ty<0||tx>tileMax||ty>tileMax){loadedTiles++;continue;}
            (function(tx,ty){var img=new Image();img.crossOrigin='anonymous';img.src='https://'+['a','b','c'][(tx+ty)%3]+'.tile.openstreetmap.org/'+z+'/'+tx+'/'+ty+'.png';
            img.onload=function(){tiles.push({img:img,tx:tx,ty:ty});onTileLoaded();};img.onerror=function(){onTileLoaded();};})(tx,ty);
          }}
          function redraw(){
            ctx.clearRect(0,0,W,H);ctx.fillStyle='#e8ede8';ctx.fillRect(0,0,W,H);
            tiles.forEach(function(t){ctx.drawImage(t.img,(t.tx-ox)*256,(t.ty-oy)*256,256,256);});
            ctx.fillStyle='rgba(255,255,255,0.10)';ctx.fillRect(0,0,W,H);
            var s=toPixel(pts[0].lat,pts[0].lon);
            ctx.beginPath();ctx.moveTo(s.x+2,s.y+2);pts.forEach(function(p){var c=toPixel(p.lat,p.lon);ctx.lineTo(c.x+2,c.y+2);});
            ctx.strokeStyle='rgba(0,0,0,0.25)';ctx.lineWidth=7;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
            var sp=toPixel(pts[0].lat,pts[0].lon),ep=toPixel(pts[pts.length-1].lat,pts[pts.length-1].lon);
            var grad=ctx.createLinearGradient(sp.x,sp.y,ep.x,ep.y);
            grad.addColorStop(0,'#e67e22');grad.addColorStop(0.5,'#2a7a7a');grad.addColorStop(1,'#2d7a5a');
            ctx.beginPath();ctx.moveTo(sp.x,sp.y);pts.forEach(function(p){var c=toPixel(p.lat,p.lon);ctx.lineTo(c.x,c.y);});
            ctx.strokeStyle=grad;ctx.lineWidth=4;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
            ctx.beginPath();ctx.moveTo(sp.x,sp.y);pts.forEach(function(p){var c=toPixel(p.lat,p.lon);ctx.lineTo(c.x,c.y);});
            ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=1.5;ctx.stroke();
            ctx.beginPath();ctx.arc(sp.x,sp.y,8,0,Math.PI*2);ctx.fillStyle='#e67e22';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2.5;ctx.stroke();
            ctx.beginPath();ctx.arc(ep.x,ep.y,8,0,Math.PI*2);ctx.fillStyle='#2d7a5a';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2.5;ctx.stroke();
            ctx.font='bold 11px DM Sans,sans-serif';
            function lh(t,x,y){ctx.strokeStyle='rgba(255,255,255,0.85)';ctx.lineWidth=3;ctx.strokeText(t,x,y);ctx.fillText(t,x,y);}
            ctx.fillStyle='#e67e22';lh('Départ',sp.x+12,sp.y+4);ctx.fillStyle='#2d7a5a';lh('Arrivée',ep.x+12,ep.y+4);
            ctx.font='9px DM Sans,sans-serif';var attr='© OpenStreetMap contributors',aw=ctx.measureText(attr).width;
            ctx.fillStyle='rgba(255,255,255,0.75)';ctx.fillRect(W-aw-10,H-16,aw+8,14);ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillText(attr,W-aw-6,H-5);
          }
          redraw();
        }).catch(function(e){console.warn('[GPX canvas] erreur :',e);});
      }
      function bindGpxCanvases(root){ (root||document).querySelectorAll('canvas[data-gpx]').forEach(drawGpxCanvas); }
      window.bindGpxCanvases=bindGpxCanvases;
      bindGpxCanvases(document);
    })();
    </script>
    <script>
    (function(){
      var sentinel=document.getElementById('loadMoreSentinel');
      var feed=document.getElementById('feed');
      if(!sentinel||!feed)return;
      var spinner=document.getElementById('lazySpinner');
      var loading=false, done=false;

      function loadMore(){
        if(loading||done)return Promise.resolve(false);
        loading=true;
        if(spinner)spinner.style.display='block';
        var offset=parseInt(sentinel.dataset.offset,10)||0;
        return fetch('/api/posts?offset='+offset,{headers:{'Accept':'application/json'}})
          .then(function(r){return r.json();})
          .then(function(data){
            if(data.html){
              var tmp=document.createElement('div');
              tmp.innerHTML=data.html;
              var added=Array.from(tmp.children);
              added.forEach(function(node){feed.appendChild(node);});
              // Réactiver les comportements interactifs sur les nouvelles cartes
              if(window.bindGpxCanvases)window.bindGpxCanvases(feed);
              if(window.bindLightbox)window.bindLightbox(feed);
              if(window.bindElev)window.bindElev(feed);
              if(window.bindSleep)window.bindSleep(feed);
              if(window.bindDelete)window.bindDelete(feed);
              if(window.bindComments)window.bindComments(feed);
              if(window.bindTranslate)window.bindTranslate(feed);
            }
            sentinel.dataset.offset=String(offset+(data.count||0));
            if(!data.hasMore){
              done=true;
              if(observer)observer.disconnect();
              sentinel.remove();
            }
            loading=false;
            if(spinner)spinner.style.display='none';
            return data.hasMore;
          })
          .catch(function(){
            loading=false;
            if(spinner)spinner.textContent='Erreur de chargement — retentez en faisant défiler.';
            return false;
          });
      }

      var observer=null;
      if('IntersectionObserver' in window){
        observer=new IntersectionObserver(function(entries){
          entries.forEach(function(e){ if(e.isIntersecting)loadMore(); });
        },{rootMargin:'400px 0px'});
        observer.observe(sentinel);
      } else {
        // Repli : bouton manuel
        sentinel.style.cursor='pointer';
        sentinel.addEventListener('click',loadMore);
      }

      // ── Ancre #post-xxx : charge les pages jusqu'à trouver le post ──
      function scrollToHashPost(){
        var hash=window.location.hash;
        if(!hash||hash.indexOf('#post-')!==0)return;
        var id=hash.slice(1); // post-xxxx
        var target=document.getElementById(id);
        if(target){
          // Attendre le rendu des images au-dessus avant de scroller précisément
          target.scrollIntoView({behavior:'auto',block:'start'});
          target.style.transition='background .3s';
          var card=target;
          card.style.boxShadow='0 0 0 3px var(--teal-light)';
          setTimeout(function(){card.style.boxShadow='';},1600);
          // Re-scroll après chargement des images (corrige le décalage lazyload)
          setTimeout(function(){var t=document.getElementById(id);if(t)t.scrollIntoView({behavior:'auto',block:'start'});},350);
          return;
        }
        // Pas encore chargé : charger la page suivante puis réessayer
        if(done){return;} // tout est chargé, post introuvable
        if(loading){ setTimeout(scrollToHashPost, 120); return; } // chargement en cours, on patiente
        loadMore().then(function(){ setTimeout(scrollToHashPost, 60); });
      }

      if(window.location.hash && window.location.hash.indexOf('#post-')===0){
        // Laisser le premier rendu se faire, puis lancer la recherche d'ancre
        setTimeout(scrollToHashPost, 80);
      }
      window.addEventListener('hashchange', scrollToHashPost);
    })();
    </script>
    ${LIGHTBOX_JS}
    ${SINGLE_VIDEO_JS}
    ${TRANSLATE_JS}
    ${ELEV_MODAL_JS}
    ${SLEEP_MODAL_JS}
    ${DELETE_CONFIRM_JS}
    ${COMMENTS_JS}
  </body></html>`;
}

module.exports = { renderPublic };
