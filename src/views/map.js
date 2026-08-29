const { TRIP_TITLE } = require('../config');
const { CSS, renderHeader } = require('./layout');
const { ROUTE_KIT } = require('./routeKit');

// ══════════════════════════════════════════════════════════
//  renderMap
// ══════════════════════════════════════════════════════════

function renderMap(posts, isAdmin = false, isStrictAdmin = false, csrf = '') {
  // Les données injectées dans le <script> viennent de champs libres : on
  // neutralise « < » pour qu'un texte contenant </script> ne puisse pas
  // refermer la balise.
  const toScriptJson = v => JSON.stringify(v).replace(/</g, '\\u003c');

  const withGps = posts.filter(p => p.lat && p.lon);
  const gpsJson = toScriptJson(withGps.map(p => ({
    lat: p.lat, lon: p.lon, title: p.title, location: p.location || '',
    km: p.km || 0, dplus: p.dplus || 0, date: p.date, id: p.id,
    photo: (p.photos || []).find(ph => !/\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(ph)) || null, gpx: p.gpx || null,
  })));

  // Lieux de couchage : marqueur dédié, indépendant du point d'arrivée de l'étape
  const withSleep = posts.filter(p => p.sleep && p.sleep.lat && p.sleep.lon);
  const sleepJson = toScriptJson(withSleep.map(p => ({
    lat: p.sleep.lat, lon: p.sleep.lon,
    label: p.sleep.label || '', comment: p.sleep.comment || '',
    date: p.date, id: p.id, title: p.title,
    // Point d'arrivée de l'étape, pour relier le couchage à celle-ci
    plat: p.lat || null, plon: p.lon || null,
  })));

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Carte — ${TRIP_TITLE}</title>
    <style>${CSS}
      html,body{height:100%;margin:0;}
      .map-page{display:flex;flex-direction:column;height:100%;}
      .map-page .header{position:relative;flex-shrink:0;overflow:visible;z-index:1000;}
      .map-page .mobile-menu{position:absolute;z-index:1001;}
      #map-container{flex:1;position:relative;overflow:hidden;}
      #fullmap{position:absolute;top:0;left:0;right:0;bottom:0;}
      .map-sidebar{position:absolute;top:12px;left:12px;z-index:500;display:flex;flex-direction:column;gap:8px;max-width:280px;pointer-events:none;}
      .map-legend{background:rgba(255,255,255,0.94);border-radius:12px;padding:12px 14px;font-size:12px;box-shadow:0 4px 16px rgba(10,61,98,0.15);border:1px solid rgba(10,61,98,0.08);pointer-events:all;}
      .map-legend-title{font-family:'Playfair Display',serif;font-size:13px;font-weight:700;color:var(--ink);margin-bottom:8px;display:flex;align-items:center;gap:6px;}
      .map-legend-row{display:flex;align-items:center;gap:8px;margin-bottom:5px;color:var(--ink-mid);}
      .map-legend-dot{width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);flex-shrink:0;}
      .map-stats{background:rgba(42,122,122,0.88);border-radius:12px;padding:10px 14px;color:#fff;display:flex;gap:16px;box-shadow:0 4px 16px rgba(10,61,98,0.3);pointer-events:all;}
      .map-stat-item{text-align:center;}
      .map-stat-num{font-family:'Playfair Display',serif;font-size:18px;font-weight:700;line-height:1;}
      .map-stat-lbl{font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.6);margin-top:2px;}
      .map-popup-photo{width:100%;height:100px;object-fit:cover;border-radius:6px;margin-bottom:6px;display:block;}
      .map-popup-title{font-family:'Playfair Display',serif;font-size:14px;font-weight:700;color:var(--ink);margin-bottom:4px;}
      .map-popup-meta{font-size:11px;color:var(--ink-light);display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;}
      .map-popup-badge{background:var(--mist);color:var(--ocean-mid);padding:2px 7px;border-radius:20px;font-weight:500;}
      .map-popup-link{display:inline-block;margin-top:6px;font-size:12px;color:var(--ocean-mid);font-weight:600;text-decoration:underline;}
      .map-popup-sleep-kicker{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#7a4fb5;margin-bottom:2px;}
      .map-popup-sleep-comment{font-size:12px;color:var(--ink-mid);line-height:1.6;white-space:pre-wrap;background:#f6f2fc;border:1px solid #e3d8f5;border-radius:8px;padding:7px 9px;margin-top:6px;max-height:150px;overflow-y:auto;}
    </style>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  </head><body>
    <div class="map-page">
      ${renderHeader({ activePage: 'map', isAdmin, isStrictAdmin, showMap: true, csrf })}
      <div id="map-container">
        <div id="fullmap">
          ${(withGps.length === 0 && withSleep.length === 0) ? `
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--mist);">
            <div style="font-size:48px;margin-bottom:12px">🗺️</div>
            <h3 style="font-family:'Playfair Display',serif;font-size:20px;color:var(--ink-mid);margin-bottom:8px">Aucun point GPS pour l'instant</h3>
            <p style="color:var(--ink-light)">Postez une étape avec la géolocalisation activée.</p>
          </div>` : `
          <div class="map-sidebar">
            <div class="map-stats">
              <div class="map-stat-item"><div class="map-stat-num">${withGps.length}</div><div class="map-stat-lbl">étapes</div></div>
              <div class="map-stat-item"><div class="map-stat-num">${Math.round(withGps.reduce((s,p)=>s+(p.km||0),0)).toLocaleString('fr-FR')}</div><div class="map-stat-lbl">km</div></div>
              <div class="map-stat-item"><div class="map-stat-num">${Math.round(withGps.reduce((s,p)=>s+(p.dplus||0),0)).toLocaleString('fr-FR')}</div><div class="map-stat-lbl">m D+</div></div>
            </div>
            <div class="map-legend">
              <div class="map-legend-title">🗺️ Légende</div>
              <div class="map-legend-row"><div class="map-legend-dot" style="background:linear-gradient(135deg,#e67e22,#f39c12)"></div>Point de départ</div>
              <div class="map-legend-row"><div class="map-legend-dot" style="background:linear-gradient(135deg,#2a7a7a,#4aabab)"></div>Étape intermédiaire</div>
              <div class="map-legend-row"><div class="map-legend-dot" style="background:linear-gradient(135deg,#1a7a4a,#2ecc71)"></div>Dernière position</div>
              ${withSleep.length ? `<div class="map-legend-row"><div class="map-legend-dot" style="background:linear-gradient(135deg,#7a4fb5,#a67ee0)"></div>🛏️ Couchage</div>` : ''}
              <div class="map-legend-row" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--sand)">
                <div style="width:28px;height:5px;background:#3a9090;border-radius:3px;flex-shrink:0"></div>Trace GPS du jour
              </div>
              <div class="map-legend-row">
                <div style="width:28px;height:4px;flex-shrink:0;background:repeating-linear-gradient(to right,#2a7a7a 0 8px,transparent 8px 14px)"></div>Liaison sans trace
              </div>
            </div>
          </div>`}
        </div>
      </div>
    </div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      // Le tracé du voyage — quels segments sont en pointillés, et à quelle
      // épaisseur — est partagé avec l'affiche et le livre photo.
      ${ROUTE_KIT}
      const gpsData = ${gpsJson};
      const sleepData = ${sleepJson};
      function initMap() {
        if (!gpsData.length && !sleepData.length) return;
        const map = L.map('fullmap', { zoomControl: false, scrollWheelZoom: true });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
        const pts = gpsData.map(p => [p.lat, p.lon]);
        // Les traces GPX d'abord, toutes ensemble : c'est seulement une fois
        // qu'on les a qu'on sait où le voyage a besoin d'un pointillé — d'une
        // étape à la suivante faute de trace, ou entre le bout d'une trace et
        // le point d'une étape quand les deux ne coïncident pas. routeKit
        // tranche, comme pour l'affiche et le livre photo.
        const dashArray = routeDashArray(1).join(',');
        Promise.all(gpsData.map(p => {
          if (!p.gpx) return Promise.resolve({ pts: [] });
          return fetch(p.gpx).then(r => r.text()).then(txt => {
            const xml = new DOMParser().parseFromString(txt, 'text/xml');
            return { pts: Array.from(xml.querySelectorAll('trkpt'))
              .map(tp => ({ lat: parseFloat(tp.getAttribute('lat')), lon: parseFloat(tp.getAttribute('lon')) }))
              .filter(q => !isNaN(q.lat) && !isNaN(q.lon)) };
          }).catch(() => ({ pts: [] }));
        })).then(function(tracks) {
          tracks.forEach(function(t) {
            if (t.pts.length < 2) return;
            const line = t.pts.map(q => [q.lat, q.lon]);
            L.polyline(line, { color: 'rgba(0,0,0,0.12)', weight: ROUTE.wHalo }).addTo(map);
            L.polyline(line, { color: '#3a9090', weight: ROUTE.wTrack, opacity: 0.9 }).addTo(map);
          });
          routeDashSegments(gpsData, tracks).forEach(function(seg) {
            L.polyline(seg, { color: 'rgba(0,0,0,0.10)', weight: ROUTE.wDashHalo, dashArray: dashArray }).addTo(map);
            L.polyline(seg, { color: '#2a7a7a', weight: ROUTE.wDash, opacity: .9, dashArray: dashArray }).addTo(map);
          });
        });
        gpsData.forEach((p, i) => {
          const isFirst = i === 0, isLast = i === gpsData.length - 1;
          let color, size;
          if (isFirst)     { color = 'linear-gradient(135deg,#e67e22,#f39c12)'; size = 22; }
          else if (isLast) { color = 'linear-gradient(135deg,#1a7a4a,#2ecc71)'; size = 22; }
          else             { color = 'linear-gradient(135deg,#2a7a7a,#4aabab)'; size = 14; }
          const ic = L.divIcon({ html: '<div style="background:'+color+';border:'+(size>14?3:2)+'px solid #fff;border-radius:50%;width:'+size+'px;height:'+size+'px;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>', iconSize: [size,size], iconAnchor: [size/2,size/2], className: '' });
          const marker = L.marker([p.lat, p.lon], { icon: ic }).addTo(map);
          const e = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          const dateStr = new Date(p.date).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
          const popupHtml = '<div style="min-width:180px;max-width:240px">'
            +(p.photo?'<img src="'+e(p.photo)+'" class="map-popup-photo" alt="">':'')
            +'<div class="map-popup-title">'+e(p.location||p.title)+'</div>'
            +'<div class="map-popup-meta"><span>'+dateStr+'</span>'
            +(p.km?'<span class="map-popup-badge">'+p.km+' km</span>':'')
            +(p.dplus?'<span class="map-popup-badge">'+p.dplus+' m D+</span>':'')
            +'</div>'
            +(p.location?'<div style="font-size:12px;color:#555;font-style:italic">'+e(p.title)+'</div>':'')
            +'<a href="/#post-'+e(p.id)+'" class="map-popup-link">Lire l&#39;&eacute;tape &rarr;</a>'
            +'</div>';
          marker.bindPopup(popupHtml, { maxWidth: 260, className: 'map-custom-popup' });
        });
        // ── Lieux de couchage ──
        const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        sleepData.forEach(s => {
          // Rattache visuellement le couchage au point d'arrivée de l'étape
          if (s.plat && s.plon && haversine(s.plat, s.plon, s.lat, s.lon) > 40) {
            L.polyline([[s.plat, s.plon], [s.lat, s.lon]], { color: '#7a4fb5', weight: ROUTE.wDash*0.8, opacity: .7, dashArray: routeDashArray(0.6).join(',') }).addTo(map);
          }
          // Même pastille que les étapes intermédiaires, à la couleur près :
          // un couchage n'est pas plus important qu'une étape, il ne doit pas
          // manger la carte. La légende dit ce que veut dire le violet.
          const size = 14;
          const ic = L.divIcon({
            html: '<div style="background:linear-gradient(135deg,#7a4fb5,#a67ee0);border:2px solid #fff;border-radius:50%;width:'+size+'px;height:'+size+'px;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>',
            iconSize: [size,size], iconAnchor: [size/2,size/2], className: ''
          });
          const marker = L.marker([s.lat, s.lon], { icon: ic }).addTo(map);
          const dateStr = new Date(s.date).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
          const popupHtml = '<div style="min-width:190px;max-width:260px">'
            +'<div class="map-popup-sleep-kicker">🛏️ Couchage</div>'
            +'<div class="map-popup-title">'+esc(s.label || 'Lieu non précisé')+'</div>'
            +'<div class="map-popup-meta"><span>'+dateStr+'</span></div>'
            +(s.comment?'<div class="map-popup-sleep-comment">'+esc(s.comment)+'</div>':'')
            +'<a href="/#post-'+esc(s.id)+'" class="map-popup-link">Lire l&#39;&eacute;tape &rarr;</a>'
            +'</div>';
          marker.bindPopup(popupHtml, { maxWidth: 280, className: 'map-custom-popup' });
        });
        const allPts = pts.concat(sleepData.map(s => [s.lat, s.lon]));
        map.fitBounds(L.latLngBounds(allPts).pad(.18));
        setTimeout(() => map.invalidateSize(), 50);
        setTimeout(() => map.invalidateSize(), 400);
        window.addEventListener('resize', () => map.invalidateSize());
      }
      document.addEventListener('DOMContentLoaded', initMap);
    </script>
    <style>
      .map-custom-popup .leaflet-popup-content-wrapper{border-radius:12px;box-shadow:0 8px 24px rgba(10,61,98,0.18);border:1px solid rgba(10,61,98,0.08);padding:0;overflow:hidden;}
      .map-custom-popup .leaflet-popup-content{margin:12px 14px;}
      .map-custom-popup .leaflet-popup-tip{background:#fff;}
    </style>
  </body></html>`;
}

module.exports = { renderMap };
