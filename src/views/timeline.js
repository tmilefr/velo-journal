const { TRIP_TITLE } = require('../config');
const { formatDateShort } = require('../lib/dates');
const { esc, stripTags } = require('../lib/html');
const { isVideoUrl } = require('../services/media');
const { CSS, renderHeader } = require('./layout');

// ══════════════════════════════════════════════════════════
//  renderTimeline
// ══════════════════════════════════════════════════════════

function renderTimeline(posts, isAdmin = false, isStrictAdmin = false) {
  const timelineItems = posts.length === 0
    ? `<div class="empty"><div class="empty-icon">🗺️</div><h3>Aucune étape pour l'instant</h3></div>`
    : posts.map((p, i) => `
      <div class="timeline-item">
        <div class="timeline-dot ${i===0?'first':i===posts.length-1?'last':''}"></div>
        <a href="/#post-${p.id}" class="timeline-card">
          <div class="timeline-card-inner">
            <div class="timeline-card-inner-row">
              <div style="flex:1">
                <div class="timeline-date">📅 ${formatDateShort(p.date)}</div>
                <div class="timeline-loc">${esc(p.location || p.title)}</div>
                ${p.location ? `<div class="timeline-snippet" style="font-size:13px;color:#555;font-style:italic">${esc(p.title)}</div>` : ''}
                <p class="timeline-snippet">${esc(stripTags(p.body))}</p>
                <div class="timeline-meta">
                  ${p.km    ? `<span class="timeline-badge tl-km">🚴 ${esc(String(p.km))} km</span>` : ''}
                  ${p.dplus ? `<span class="timeline-badge tl-km">⛰️ ${esc(String(p.dplus))} m D+</span>` : ''}
                  ${p.author ? `<span class="timeline-badge tl-author">👤 ${esc(p.author)}</span>` : ''}
                </div>
              </div>
              ${(() => {
                const firstImg = (p.photos || []).find(ph => !isVideoUrl(ph));
                if (firstImg) return `<img src="${firstImg}" class="timeline-thumb" alt="photo" loading="lazy">`;
                const firstVid = (p.photos || []).find(ph => isVideoUrl(ph));
                if (firstVid) return `<video src="${firstVid}" class="timeline-thumb" muted playsinline preload="metadata" style="background:#000"></video>`;
                return '';
              })()}
            </div>
          </div>
        </a>
      </div>`).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Timeline — ${TRIP_TITLE}</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'timeline', isAdmin, isStrictAdmin, showMap: true })}
    <div class="timeline-wrap"><div class="timeline">${timelineItems}</div></div>
  </body></html>`;
}

module.exports = { renderTimeline };
