const { TRIP_TITLE } = require('../config');
const { CSS, renderHeader } = require('./layout');

// ══════════════════════════════════════════════════════════
//  renderMap
// ══════════════════════════════════════════════════════════

function renderMap(posts, isAdmin = false, isStrictAdmin = false, csrf = '') {
  const withGps = posts.filter(p => p.lat && p.lon);
  const gpsJson = JSON.stringify(withGps.map(p => ({
    lat: p.lat, lon: p.lon, title: p.title, location: p.location || '',
    km: p.km || 0, dplus: p.dplus || 0, date: p.date, id: p.id,
    photo: (p.photos || []).find(ph => !/\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(ph)) || null, gpx: p.gpx || null,
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
    </style>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  </head><body>
    <div class="map-page">
      ${renderHeader({ activePage: 'map', isAdmin, isStrictAdmin, showMap: true, csrf })}
      <div id="map-container">
        <div id="fullmap">
          ${withGps.length === 0 ? `
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
              <div class="map-legend-row" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--sand)">
                <div style="width:28px;height:4px;background:#3a9090;border-radius:2px;flex-shrink:0"></div>Trace GPS du jour
              </div>
            </div>
          </div>`}
        </div>
      </div>
    </div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const gpsData = ${gpsJson};
      function initMap() {
        if (!gpsData.length) return;
        const map = L.map('fullmap', { zoomControl: false, scrollWheelZoom: true });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
        const pts = gpsData.map(p => [p.lat, p.lon]);
        // Lien droit entre deux étapes consécutives UNIQUEMENT si l'étape
        // d'arrivée n'a pas de trace GPX (auquel cas la trace remplace le segment).
        const segments = [];
        for (let i = 1; i < gpsData.length; i++) {
          if (gpsData[i].gpx) continue; // trace présente → pas de lien droit
          segments.push([[gpsData[i-1].lat, gpsData[i-1].lon], [gpsData[i].lat, gpsData[i].lon]]);
        }
        segments.forEach(function(seg) {
          L.polyline(seg, { color: 'rgba(0,0,0,.10)', weight: 8 }).addTo(map);
          L.polyline(seg, { color: '#2a7a7a', weight: 4, opacity: .9 }).addTo(map);
          L.polyline(seg, { color: '#fff', weight: 1.5, opacity: .5, dashArray: '8,10' }).addTo(map);
        });
        // Distance approx. en mètres entre deux points [lat,lon] (Haversine).
        function ptDist(a, b) {
          const R = 6371000, dLat = (b[0]-a[0])*Math.PI/180, dLon = (b[1]-a[1])*Math.PI/180;
          const la1 = a[0]*Math.PI/180, la2 = b[0]*Math.PI/180;
          const x = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
          return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
        }
        const GAP_THRESHOLD_M = 150;
        gpsData.forEach(function(p, i) {
          if (!p.gpx) return;
          fetch(p.gpx).then(r => r.text()).then(txt => {
            const xml = new DOMParser().parseFromString(txt, 'text/xml');
            const trkpts = Array.from(xml.querySelectorAll('trkpt')).map(tp => [parseFloat(tp.getAttribute('lat')), parseFloat(tp.getAttribute('lon'))]);
            if (trkpts.length < 2) return;
            L.polyline(trkpts, { color: 'rgba(0,0,0,0.12)', weight: 6 }).addTo(map);
            L.polyline(trkpts, { color: '#3a9090', weight: 3, opacity: 0.85 }).addTo(map);
            // Raccords si le point GPS de l'étape (marqueur, éventuellement fixé
            // manuellement) ne coïncide pas avec les extrémités de la trace, pour
            // que le rendu reste continu d'une étape à l'autre.
            const bridges = [];
            if (i > 0) {
              const prevMarker = [gpsData[i-1].lat, gpsData[i-1].lon];
              if (ptDist(prevMarker, trkpts[0]) > GAP_THRESHOLD_M) bridges.push([prevMarker, trkpts[0]]);
            }
            const marker = [p.lat, p.lon], last = trkpts[trkpts.length - 1];
            if (ptDist(last, marker) > GAP_THRESHOLD_M) bridges.push([last, marker]);
            bridges.forEach(function(seg) {
              L.polyline(seg, { color: '#2a7a7a', weight: 3, opacity: .7, dashArray: '6,8' }).addTo(map);
            });
          }).catch(() => {});
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
        map.fitBounds(L.latLngBounds(pts).pad(.18));
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
