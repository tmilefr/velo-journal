// ── Formatage divers ──────────────────────────────────────

function formatEuro(n) {
  return (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20ac';
}
function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
}

module.exports = { formatEuro, initials };
