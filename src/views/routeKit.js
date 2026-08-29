// ── Le tracé du voyage, le même partout ───────────────────
// Trois pages dessinent le voyage : la page Carte (Leaflet), l'affiche et le
// livre photo (canvas). Elles racontent la même chose et doivent donc la
// tracer de la même façon : la trace GPX en trait plein, et en pointillés les
// raccords, c'est-à-dire tout ce que le GPS n'a pas enregistré —
//   • d'une étape à la suivante quand aucune trace ne les relie ;
//   • entre le bout d'une trace et le point d'une étape quand les deux ne
//     coïncident pas (point repositionné à la main, trace coupée un peu avant
//     l'arrivée).
// Ce module n'exporte pas des fonctions Node mais un morceau de JavaScript
// destiné au navigateur : le calcul des segments pointillés, les épaisseurs
// communes et le dessin sur canvas. Chaque carte s'en sert au lieu de tenir
// sa propre version — c'est ainsi que l'affiche avait fini par oublier des
// pointillés que la page Carte, elle, dessinait.
const ROUTE_KIT = `
      // ── Épaisseurs communes ─────────────────────────────
      var ROUTE = {
        gapM: 150,        // au-delà de cet écart, on raccorde trace et étape
        dash: [12, 9],    // motif des pointillés, à l'échelle 1
        wHalo: 11,        // halo clair posé sous la trace
        wTrack: 5.5,      // la trace elle-même
        wDashHalo: 8,     // halo clair sous les pointillés
        wDash: 4          // les pointillés
      };
      // Une affiche A3 mérite un trait plus large qu'une couverture de livre :
      // la largeur de la carte donne l'échelle, bornée pour que le tracé reste
      // lisible sans écraser la carte, quel que soit le format.
      function routeScale(mapW){ return Math.max(0.7, Math.min(1.8, mapW/1500)); }
      function routeDashArray(k){ return [ROUTE.dash[0]*k, ROUTE.dash[1]*k]; }

      function haversine(la1,lo1,la2,lo2){
        var R=6371000, dLa=(la2-la1)*Math.PI/180, dLo=(lo2-lo1)*Math.PI/180;
        var a=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)*Math.sin(dLo/2);
        return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
      }

      // Trace de l'étape i, seulement si elle compte assez de points pour
      // faire une ligne (un .gpx illisible ou vide n'en est pas une : l'étape
      // sera alors reliée à la précédente par un pointillé).
      function routeTrack(tracks, i){
        var t = tracks && tracks[i];
        return (t && t.pts && t.pts.length>1) ? t.pts : null;
      }

      // Les segments à tracer en pointillés, dans l'ordre du voyage, sous la
      // forme [[lat,lon],[lat,lon]] — de quoi nourrir aussi bien une polyline
      // Leaflet qu'une projection sur canvas.
      function routeDashSegments(stages, tracks){
        var segs=[], prev=null;   // prev : dernier point atteint par le voyage
        for(var i=0;i<(stages||[]).length;i++){
          var s=stages[i], pts=routeTrack(tracks,i);
          var here=(s && s.lat!=null && s.lon!=null) ? [Number(s.lat), Number(s.lon)] : null;
          if(pts){
            var a=pts[0], b=pts[pts.length-1];
            if(prev && haversine(prev[0],prev[1],a.lat,a.lon)>ROUTE.gapM) segs.push([prev,[a.lat,a.lon]]);
            if(here && haversine(b.lat,b.lon,here[0],here[1])>ROUTE.gapM) segs.push([[b.lat,b.lon],here]);
            prev = here || [b.lat,b.lon];
          } else if(here){
            if(prev) segs.push([prev,here]);
            prev = here;
          }
        }
        return segs;
      }

      // ── Dessin sur canvas (affiche, livre) ──────────────
      function strokeRouteSegments(g, proj, segs){
        if(!segs.length) return;
        g.beginPath();
        segs.forEach(function(seg){
          var a=proj(seg[0][0],seg[0][1]), b=proj(seg[1][0],seg[1][1]);
          g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]);
        });
        g.stroke();
      }
      function strokeRouteTracks(g, proj, tracks){
        g.beginPath();
        (tracks||[]).forEach(function(t){
          if(!t.pts || t.pts.length<2) return;
          var p0=proj(t.pts[0].lat,t.pts[0].lon);
          g.moveTo(p0[0],p0[1]);
          for(var i=1;i<t.pts.length;i++){ var p=proj(t.pts[i].lat,t.pts[i].lon); g.lineTo(p[0],p[1]); }
        });
        g.stroke();
      }
      // Halo clair d'abord, trait de couleur ensuite : le voyage reste lisible
      // aussi bien sur le fond épuré que sur les tuiles OpenStreetMap.
      function drawRoute(g, proj, stages, tracks, opt){
        opt = opt || {};
        var k     = opt.scale || 1;
        var color = opt.color || '#e07a3a';
        var halo  = opt.halo  || '#ffffff';
        var dashColor = opt.dashColor || color;
        var segs  = routeDashSegments(stages, tracks);
        var dash  = routeDashArray(k);
        g.save();
        g.lineJoin='round'; g.lineCap='round';
        g.globalAlpha = opt.haloAlpha!=null ? opt.haloAlpha : 0.85;
        g.strokeStyle = halo;
        g.lineWidth = ROUTE.wHalo*k;      strokeRouteTracks(g, proj, tracks);
        g.lineWidth = ROUTE.wDashHalo*k;  g.setLineDash(dash); strokeRouteSegments(g, proj, segs);
        g.setLineDash([]);
        g.globalAlpha = 1;
        g.strokeStyle = color;
        g.lineWidth = ROUTE.wTrack*k;     strokeRouteTracks(g, proj, tracks);
        g.strokeStyle = dashColor;
        g.lineWidth = ROUTE.wDash*k;      g.setLineDash(dash); strokeRouteSegments(g, proj, segs);
        g.restore();
      }
`;

module.exports = { ROUTE_KIT };
