const { TRIP_TITLE } = require('../config');
const { stripTags } = require('../lib/html');

// ══════════════════════════════════════════════════════════
//  renderRSS
// ══════════════════════════════════════════════════════════

function renderRSS(posts) {
  const items = posts.slice(0, 20).map(p => `
    <item>
      <title>${p.title}</title>
      <description><![CDATA[${stripTags(p.body)}]]></description>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <guid>${p.id}</guid>
    </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${TRIP_TITLE}</title>
    <description>Journal de voyage vélo</description>
    ${items}
  </channel>
</rss>`;
}

module.exports = { renderRSS };
