// ── Envoi d'e-mails : confirmation d'abonnement, nouvelle étape, nouveau commentaire ──
// Nécessite SMTP_HOST (+ SMTP_USER/SMTP_PASS/MAIL_FROM) dans .env, sinon désactivé.
const fs         = require('fs');
const nodemailer = require('nodemailer');
const {
  SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS,
  MAIL_FROM, MAIL_ENABLED, BASE_URL, MAIL_LOG, TRIP_TITLE,
} = require('../config');
const { esc, stripTags } = require('../lib/html');
const { formatDate, formatDateShort } = require('../lib/dates');
const { readPosts, writePosts } = require('./posts');
const { confirmedSubscribers } = require('./subscribers');
const { commentEmails } = require('./settings');

// URL publique du site pour les liens dans les e-mails :
// BASE_URL si défini, sinon déduite de la requête (trust proxy actif).
function siteBaseUrl(req) {
  return BASE_URL || `${req.protocol}://${req.get('host')}`;
}

// Trace chaque envoi d'e-mail dans data/mail.log (une ligne par envoi) :
// 2026-07-19T10:00:00.000Z CONFIRMATION lecteur@example.fr OK
function logMailSend(kind, email, ok, detail = '') {
  const line = `${new Date().toISOString()} ${kind} ${email} ${ok ? 'OK' : 'ECHEC'}${detail ? ' — ' + detail : ''}\n`;
  try { fs.appendFileSync(MAIL_LOG, line); } catch (e) { /* le log ne doit jamais bloquer un envoi */ }
}

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:   SMTP_HOST,
      port:   SMTP_PORT,
      secure: SMTP_SECURE,
      auth:   SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

// ── Gabarit commun ────────────────────────────────────────
function mailLayout(inner, unsubscribeUrl = '') {
  const footer = unsubscribeUrl
    ? `<p style="margin:18px 0 0;font-size:12px;color:#8aa;text-align:center">
         Vous recevez cet e-mail car vous êtes abonné aux nouvelles de ce voyage.<br>
         <a href="${esc(unsubscribeUrl)}" style="color:#8aa">Se désabonner</a>
       </p>`
    : '';
  return `<div style="margin:0;padding:24px 12px;background:#f0fafa;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#2a7a7a,#2d7a5a);border-radius:14px 14px 0 0;padding:20px 24px;text-align:center">
        <span style="font-size:22px">🚴</span>
        <div style="color:#fff;font-size:18px;font-weight:bold;margin-top:4px">${esc(TRIP_TITLE)}</div>
      </div>
      <div style="background:#ffffff;border:1px solid #cce8e8;border-top:none;border-radius:0 0 14px 14px;padding:24px;color:#1a3a3a;font-size:15px;line-height:1.6">
        ${inner}
      </div>
      ${footer}
    </div>
  </div>`;
}

async function sendMail(to, subject, html, text) {
  await getTransporter().sendMail({ from: `"${TRIP_TITLE}" <${MAIL_FROM}>`, to, subject, html, text });
}

// ── E-mail de confirmation (double opt-in) ────────────────
async function sendConfirmationEmail(sub, baseUrl) {
  const confirmUrl = `${baseUrl}/subscribe/confirm/${sub.token}`;
  const html = mailLayout(`
    <p>Bonjour,</p>
    <p>Vous avez demandé à recevoir un e-mail à chaque nouvelle étape publiée sur <strong>${esc(TRIP_TITLE)}</strong>.</p>
    <p>Il ne reste qu'un clic pour confirmer :</p>
    <p style="text-align:center;margin:24px 0">
      <a href="${esc(confirmUrl)}" style="background:#2a7a7a;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:10px;font-weight:bold;display:inline-block">✅ Confirmer mon abonnement</a>
    </p>
    <p style="font-size:13px;color:#5a8080">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet e-mail — ce lien expirera dans 7 jours.</p>
  `);
  const text = `Confirmez votre abonnement aux nouvelles étapes de ${TRIP_TITLE} en ouvrant ce lien :\n${confirmUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`;
  try {
    await sendMail(sub.email, `Confirmez votre abonnement — ${TRIP_TITLE}`, html, text);
    console.log(`[mailer] e-mail de confirmation d'inscription envoyé à ${sub.email}`);
    logMailSend('CONFIRMATION', sub.email, true);
  } catch (e) {
    logMailSend('CONFIRMATION', sub.email, false, e.message);
    throw e;
  }
}

// ── E-mail « nouvelle étape » ─────────────────────────────
function buildPostEmail(post, baseUrl, sub) {
  const isPrep  = post.type === 'preparation';
  const postUrl = isPrep
    ? `${baseUrl}/preparation#post-${post.id}`
    : `${baseUrl}/#post-${post.id}`;
  const unsubscribeUrl = `${baseUrl}/subscribe/stop/${sub.token}`;

  const excerptFull = stripTags(post.body);
  const excerpt = excerptFull.length > 300 ? excerptFull.slice(0, 300).trimEnd() + '…' : excerptFull;
  const metaBits = [
    formatDateShort(post.date),
    post.location ? `📍 ${post.location}` : '',
    post.km ? `🚴 ${post.km} km` : '',
    post.dplus ? `⛰️ ${post.dplus} m D+` : '',
  ].filter(Boolean);
  const photoNote = (post.photos || []).length
    ? `<p style="font-size:13px;color:#5a8080;margin:10px 0 0">📷 ${post.photos.length} photo(s) à découvrir sur le journal</p>`
    : '';

  const html = mailLayout(`
    <p style="margin:0 0 4px;font-size:12px;color:#4aabab;text-transform:uppercase;letter-spacing:1px;font-weight:bold">${isPrep ? 'Nouvel article — préparation' : 'Nouvelle étape publiée'}</p>
    <h2 style="margin:0 0 10px;font-size:21px;color:#1a3a3a">${esc(post.title)}</h2>
    <p style="margin:0 0 14px;font-size:13px;color:#5a8080">${metaBits.map(esc).join(' &nbsp;·&nbsp; ')}</p>
    <p style="margin:0">${esc(excerpt)}</p>
    ${photoNote}
    <p style="text-align:center;margin:24px 0 4px">
      <a href="${esc(postUrl)}" style="background:#2a7a7a;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:10px;font-weight:bold;display:inline-block">📖 Lire sur le journal</a>
    </p>
    <p style="text-align:center;font-size:12px;color:#8aa;margin:6px 0 0">(mot de passe famille habituel)</p>
  `, unsubscribeUrl);
  const text = `${isPrep ? 'Nouvel article' : 'Nouvelle étape'} : ${post.title}\n${metaBits.join(' · ')}\n\n${excerpt}\n\nLire sur le journal : ${postUrl}\n\nSe désabonner : ${unsubscribeUrl}`;
  const subject = `${isPrep ? '🛠️ Nouvel article' : '🚴 Nouvelle étape'} : ${post.title}`;
  return { subject, html, text };
}

async function notifySubscribers(post, baseUrl) {
  const subs = confirmedSubscribers();
  if (!subs.length) return;
  console.log(`[mailer] notification « ${post.title} » → ${subs.length} abonné(s)`);
  let sent = 0;
  for (const sub of subs) {
    try {
      const { subject, html, text } = buildPostEmail(post, baseUrl, sub);
      await sendMail(sub.email, subject, html, text);
      logMailSend(`NOTIFICATION post=${post.id}`, sub.email, true);
      sent++;
    } catch (e) {
      console.error(`[mailer] échec d'envoi à ${sub.email} :`, e.message);
      logMailSend(`NOTIFICATION post=${post.id}`, sub.email, false, e.message);
    }
  }
  console.log(`[mailer] notification envoyée à ${sent}/${subs.length} abonné(s)`);
}

// ── E-mail « nouveau commentaire » ────────────────────────
// Destinataires : les adresses réglées dans Système → 💬 Commentaires
// (data/settings.json), et non les abonnés du carnet.
function buildCommentEmail(post, comment, baseUrl, parent = null) {
  const isPrep    = post.type === 'preparation';
  const postUrl   = `${baseUrl}${isPrep ? '/preparation' : '/'}#post-${post.id}`;
  const listUrl   = `${baseUrl}/commentaires`;
  const author    = comment.author || 'Quelqu\'un';
  const intro     = parent
    ? `<strong>${esc(author)}</strong> a répondu à <strong>${esc(parent.author || 'un commentaire')}</strong> sur l'étape :`
    : `<strong>${esc(author)}</strong> a laissé un commentaire sur l'étape :`;

  const html = mailLayout(`
    <p style="margin:0 0 4px;font-size:12px;color:#4aabab;text-transform:uppercase;letter-spacing:1px;font-weight:bold">${parent ? 'Nouvelle réponse' : 'Nouveau commentaire'}</p>
    <p style="margin:0 0 10px">${intro}</p>
    <h2 style="margin:0 0 14px;font-size:19px;color:#1a3a3a">${esc(post.title)}</h2>
    <div style="background:#f0fafa;border:1px solid #cce8e8;border-left:4px solid #2a7a7a;border-radius:10px;padding:12px 16px">
      <div style="font-size:13px;color:#5a8080;margin-bottom:6px">${esc(author)} · ${esc(formatDate(comment.date))}</div>
      <div style="white-space:pre-wrap">${esc(comment.text)}</div>
    </div>
    <p style="text-align:center;margin:24px 0 4px">
      <a href="${esc(postUrl)}" style="background:#2a7a7a;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:10px;font-weight:bold;display:inline-block">💬 Voir sur le journal</a>
    </p>
    <p style="text-align:center;font-size:12px;color:#8aa;margin:10px 0 0">
      <a href="${esc(listUrl)}" style="color:#8aa">Tous les commentaires du carnet</a>
    </p>
  `);
  const text = `${parent ? `${author} a répondu à ${parent.author || 'un commentaire'}` : `${author} a laissé un commentaire`} sur l'étape « ${post.title} » :\n\n${comment.text}\n\nVoir sur le journal : ${postUrl}\nTous les commentaires : ${listUrl}`;
  const subject = parent
    ? `💬 Réponse de ${author} — ${post.title}`
    : `💬 Nouveau commentaire de ${author} — ${post.title}`;
  return { subject, html, text };
}

async function sendCommentNotification(post, comment, baseUrl, parent) {
  const recipients = commentEmails();
  if (!recipients.length) return;
  const { subject, html, text } = buildCommentEmail(post, comment, baseUrl, parent);
  for (const email of recipients) {
    try {
      await sendMail(email, subject, html, text);
      logMailSend(`COMMENTAIRE post=${post.id} comment=${comment.id}`, email, true);
    } catch (e) {
      console.error(`[mailer] échec d'envoi à ${email} :`, e.message);
      logMailSend(`COMMENTAIRE post=${post.id} comment=${comment.id}`, email, false, e.message);
    }
  }
}

// Prévient les adresses réglées dans Système qu'un commentaire vient d'être
// déposé. Envoi en arrière-plan : le lecteur qui commente n'attend jamais le
// serveur SMTP, et un échec d'envoi ne perd pas son commentaire.
function notifyNewComment(post, comment, baseUrl, parent = null) {
  if (!MAIL_ENABLED) return;
  if (!commentEmails().length) return;
  console.log(`[mailer] commentaire de ${comment.author} sur « ${post.title} » → ${commentEmails().length} destinataire(s)`);
  sendCommentNotification(post, comment, baseUrl, parent)
    .catch(e => console.error('[mailer] notification de commentaire échouée :', e.message));
}

// Prévient les abonnés qu'un post est publié — une seule fois par post.
// Le marqueur notifiedAt garantit qu'une édition ultérieure ne renvoie rien.
function maybeNotifyNewPost(postId, baseUrl) {
  if (!MAIL_ENABLED) return;
  const posts = readPosts();
  const idx   = posts.findIndex(p => p.id === postId);
  if (idx === -1) return;
  const post = posts[idx];
  if (post.notifiedAt) return;                                     // déjà prévenu
  if (post.visibility && post.visibility !== 'all') return;        // pas (encore) public
  posts[idx] = { ...post, notifiedAt: new Date().toISOString() };
  writePosts(posts);
  // Envoi en arrière-plan : on ne bloque pas la réponse HTTP de l'auteur.
  notifySubscribers(post, baseUrl).catch(e => console.error('[mailer] notification échouée :', e.message));
}

module.exports = { siteBaseUrl, sendConfirmationEmail, maybeNotifyNewPost, notifyNewComment };
