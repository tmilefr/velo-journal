const { MYMEMORY_EMAIL } = require('../config');
const { esc } = require('../lib/html');

// ── Traduction automatique (MyMemory — gratuit, sans clé API) ────
const TRANSLATE_LANGS = { en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano' };
const MYMEMORY_MAX_BYTES = 450; // limite officielle : 500 octets par requête — marge de sécurité

// Convertit le corps HTML (sanitizé) en texte brut avec retours à la ligne,
// car l'API MyMemory ne traduit que du texte simple (pas de mode "html")
function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h3|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Reconstruit un HTML simple (sûr) depuis du texte brut traduit
function plainTextToHtml(text) {
  return String(text || '')
    .split(/\n+/)
    .map(line => esc(line))
    .join('<br>');
}

// Découpe un texte en morceaux ≤ MYMEMORY_MAX_BYTES, en coupant sur les phrases puis les mots
function splitIntoChunks(text, maxBytes = MYMEMORY_MAX_BYTES) {
  const sentences = text.split(/(?<=[.!?:])\s+/);
  const chunks = [];
  let cur = '';
  const pushWords = (s) => {
    let wcur = '';
    s.split(' ').forEach(w => {
      const cand = wcur ? wcur + ' ' + w : w;
      if (Buffer.byteLength(cand, 'utf8') > maxBytes) {
        if (wcur) chunks.push(wcur);
        wcur = w;
      } else wcur = cand;
    });
    if (wcur) chunks.push(wcur);
  };
  for (const s of sentences) {
    const candidate = cur ? cur + ' ' + s : s;
    if (Buffer.byteLength(candidate, 'utf8') > maxBytes) {
      if (cur) chunks.push(cur);
      if (Buffer.byteLength(s, 'utf8') > maxBytes) { pushWords(s); cur = ''; }
      else cur = s;
    } else cur = candidate;
  }
  if (cur) chunks.push(cur);
  return chunks.filter(c => c.trim());
}

// Traduit un seul morceau (≤500 octets) via l'API MyMemory
async function mymemoryTranslateChunk(text, targetLang) {
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text)
    + '&langpair=' + encodeURIComponent('fr|' + targetLang)
    + (MYMEMORY_EMAIL ? '&de=' + encodeURIComponent(MYMEMORY_EMAIL) : '');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('MyMemory HTTP ' + resp.status);
  const data = await resp.json();
  if (data.responseStatus && Number(data.responseStatus) >= 400) {
    throw new Error('MyMemory : ' + (data.responseDetails || data.responseStatus));
  }
  return (data.responseData && data.responseData.translatedText) || text;
}

// Traduit un texte (potentiellement long) en le découpant en morceaux
async function translateLongText(text, targetLang) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  const chunks = splitIntoChunks(clean);
  const out = [];
  for (const chunk of chunks) {
    out.push(await mymemoryTranslateChunk(chunk, targetLang));
  }
  return out.join(' ');
}

module.exports = { TRANSLATE_LANGS, htmlToPlainText, plainTextToHtml, translateLongText };
