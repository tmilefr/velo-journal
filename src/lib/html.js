// ── Échappement & sanitization HTML ───────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Sanitization HTML de l'éditeur riche (allowlist) ──────
// Autorise un petit jeu de balises sûres et nettoie tout le reste.
// Aucune dépendance : parsing par regex sur une allowlist stricte.
const ALLOWED_TAGS = new Set(['b','strong','i','em','u','h3','ul','ol','li','blockquote','a','br','p','span']);

function sanitizeHtml(input) {
  let html = String(input ?? '');
  if (!html.trim()) return '';

  // 1. Neutralise les blocs entièrement interdits (script/style/iframe + contenu)
  html = html.replace(/<\s*(script|style|iframe|object|embed|svg|math)[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  // 2. Retire les balises orphelines de ces mêmes éléments
  html = html.replace(/<\s*\/?\s*(script|style|iframe|object|embed|svg|math)[^>]*>/gi, '');

  // 3. Parcours de chaque balise pour appliquer l'allowlist
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (full, slash, tagRaw, attrs) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';           // balise non autorisée → supprimée
    if (slash) return `</${tag}>`;                   // balise fermante : sans attributs

    // Seul <a> conserve un attribut href (http/https/mailto)
    if (tag === 'a') {
      const m = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs || '');
      const href = m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
      const safe = /^(https?:|mailto:)/i.test(href.trim());
      if (safe) {
        return `<a href="${esc(href.trim())}" target="_blank" rel="noopener noreferrer nofollow">`;
      }
      return '<a>';
    }
    // Toutes les autres balises autorisées : aucun attribut conservé
    return `<${tag}>`;
  });

  // 4. Filet de sécurité : neutralise tout reste de gestionnaire on… ou javascript:
  html = html.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/javascript:/gi, '');

  return html.trim();
}

// Convertit le HTML d'un post en texte brut (pour snippets / RSS)
function stripTags(input) {
  return String(input ?? '')
    .replace(/<\s*(br|\/p|\/li|\/h3|\/blockquote)\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Détecte si le corps est déjà du HTML riche (nouveau format)
function isRichHtml(body) {
  return /<(b|strong|i|em|u|h3|ul|ol|li|blockquote|a|br|p)\b[^>]*>/i.test(String(body ?? ''));
}

// Rend le corps d'un post : HTML assaini si riche, sinon texte brut → <br>
function renderBody(body) {
  const s = String(body ?? '');
  if (isRichHtml(s)) return sanitizeHtml(s);
  // Ancien format texte brut : on échappe et on convertit les sauts de ligne
  return esc(s).replace(/\r\n|\r|\n/g, '<br>');
}

module.exports = { esc, sanitizeHtml, stripTags, isRichHtml, renderBody };
