// ── Système : sommaire et pages de section ────────────────
// Le Système est découpé en pages autonomes (sauvegarde, recalculs, panorama,
// abonnés), listées à la fois dans le sous-menu « ⚙️ Système » et dans le
// sommaire /settings. Le découpage lui-même vit dans layout.js.
const { TRIP_TITLE, MAIL_ENABLED } = require('../config');
const { MAX_COMMENT_EMAILS } = require('../services/settings');
const { esc } = require('../lib/html');
const { formatDateShort } = require('../lib/dates');
const { CSS, SYSTEM_SECTIONS, renderHeader } = require('./layout');

// ══════════════════════════════════════════════════════════
//  Coquille commune
// ══════════════════════════════════════════════════════════

const section = key => SYSTEM_SECTIONS.find(s => s.key === key);

// Bandeaux d'information réutilisés d'une section à l'autre
const banner = (bg, border, color, html) =>
  `<div style="background:${bg};border:1px solid ${border};border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:14px;color:${color};font-weight:500;line-height:1.5">${html}</div>`;
const bannerOk    = html => banner('#f0fdf4', '#bbf7d0', '#166534', html);
const bannerWarn  = html => banner('#fffbeb', '#fde68a', '#92400e', html);
const bannerInfo  = html => banner('var(--mist)', 'var(--sand)', 'var(--ink-mid)', html);

// Page d'une section : en-tête (titre + description + retour au sommaire),
// puis le contenu propre à la section.
function renderSystemPage({ key, isStrictAdmin = false, banners = '', body = '', script = '' }) {
  const s = section(key);
  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${s.title} — ${TRIP_TITLE}</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: key, isAdmin: true, isStrictAdmin, showMap: false })}
    <div class="form-wrap">
      <div class="sys-head">
        <a href="/settings" class="sys-back">← Système</a>
        <h1>${s.icon} ${s.title}</h1>
        <p>${s.desc}</p>
      </div>
      ${banners}
      ${body}
    </div>
    ${script}
  </body></html>`;
}

// ══════════════════════════════════════════════════════════
//  Sommaire : /settings
// ══════════════════════════════════════════════════════════

function renderSystemHome(isStrictAdmin = false, geoJob = null) {
  // Une détection lancée depuis les Recalculs continue en arrière-plan :
  // le sommaire en rappelle l'avancement où qu'on soit reparti.
  const running = geoJob && geoJob.running && geoJob.total > 0
    ? bannerInfo(`⏳ Détection des pays et régions en cours — ${geoJob.done} / ${geoJob.total} étape${geoJob.total > 1 ? 's' : ''}. <a href="/settings/recalc" style="text-decoration:underline">Voir l'avancement</a>`)
    : '';

  const cards = SYSTEM_SECTIONS.map(s => `
    <a href="${s.href}" class="sys-card">
      <span class="sys-card-icon">${s.icon}</span>
      <span class="sys-card-body">
        <span class="sys-card-title">${s.title}</span>
        <span class="sys-card-desc">${s.desc}</span>
      </span>
      <span class="sys-card-go">›</span>
    </a>`).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Système — ${TRIP_TITLE}</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: 'settings', isAdmin: true, isStrictAdmin, showMap: false })}
    <div class="form-wrap">
      <div class="sys-head">
        <h1>⚙️ Système</h1>
        <p>L'entretien du carnet, une page par sujet.</p>
      </div>
      ${running}
      <div class="sys-grid">${cards}</div>
    </div>
  </body></html>`;
}

// ══════════════════════════════════════════════════════════
//  Sauvegarde et restauration : /settings/backup
// ══════════════════════════════════════════════════════════

function renderBackup(csrf = '', restored = false, isStrictAdmin = false) {
  return renderSystemPage({
    key: 'sys-backup',
    isStrictAdmin,
    banners: restored ? bannerOk('✅ Données restaurées avec succès.') : '',
    body: `
      <div class="form-card" style="margin-bottom:16px">
        <h2>⬇️ Sauvegarder</h2>
        <p style="font-size:14px;color:var(--ink-light);margin-bottom:18px;line-height:1.6"><strong>Sauvegarde complète (recommandée)</strong> : une archive ZIP contenant les étapes <em>et</em> toutes les photos/vidéos. C'est la sauvegarde à conserver.</p>
        <a href="/backup-full" class="btn-submit" style="display:block;text-align:center;text-decoration:none">📦 Télécharger la sauvegarde complète (ZIP)</a>
        <p style="font-size:13px;color:var(--ink-light);margin:16px 0 10px;line-height:1.6">Sauvegarde légère : uniquement les textes des étapes au format <code>.json</code>, sans les médias.</p>
        <a href="/backup" class="loc-search-btn" style="display:block;text-align:center;text-decoration:none;margin:0">⬇️ Télécharger les données seules (JSON)</a>
      </div>
      <div class="form-card">
        <h2>⬆️ Restaurer</h2>
        <p style="font-size:14px;color:var(--ink-light);margin-bottom:18px;line-height:1.6">Importe un fichier de sauvegarde JSON. <strong style="color:#dc2626">Les étapes actuelles seront remplacées</strong> par celles du fichier.</p>
        <!-- Envoi multipart : requireCsrf s'exécute avant multer, le jeton doit
             donc voyager dans l'URL (même convention que /post et /edit). -->
        <form method="POST" action="/restore?_csrf=${csrf}" enctype="multipart/form-data" class="form-restore">
          <input type="hidden" name="_csrf" value="${csrf}">
          <div class="field">
            <label>Fichier de sauvegarde (.json)</label>
            <input type="file" name="backup" accept=".json,application/json" required style="padding:8px;background:#fff">
          </div>
          <button class="btn-submit" type="submit" style="background:linear-gradient(135deg,#dc2626,#b91c1c)">⬆️ Restaurer les données</button>
        </form>
      </div>`,
    script: `<script>
      document.querySelectorAll('.form-restore').forEach(function(f) {
        f.addEventListener('submit', function(e) {
          if (!window.confirm('Restaurer ces données ? Les étapes actuelles seront remplacées.')) e.preventDefault();
        });
      });
    </script>`,
  });
}

// ══════════════════════════════════════════════════════════
//  Recalculs : /settings/recalc
// ══════════════════════════════════════════════════════════

function renderRecalc(csrf = '', recalc = null, geo = null, geoJob = null, isStrictAdmin = false, train = null) {
  // Bandeau de lancement (retour de POST /recalc-geo)
  let geoBanner = '';
  if (geo === 'running') {
    geoBanner = bannerWarn('⏳ Une détection est déjà en cours — laissez-la se terminer.');
  } else if (geo === 'started') {
    const n = geoJob ? geoJob.total : 0;
    geoBanner = n === 0
      ? bannerOk('✅ Toutes les étapes sont déjà localisées — rien à détecter.')
      : bannerOk(`✅ Détection lancée sur ${n} étape${n > 1 ? 's' : ''} — l'avancement s'affiche ci-dessous.`);
  }
  // Avancement de la détection en cours (ou de la dernière terminée)
  let geoProgress = '';
  if (geoJob && geoJob.total > 0) {
    const pct = Math.round(geoJob.done / geoJob.total * 100);
    geoProgress = geoJob.running
      ? `<div style="background:var(--mist);border:1px solid var(--sand);border-radius:12px;padding:12px 16px;margin-bottom:16px">
           <div style="font-size:13px;color:var(--ink-mid);font-weight:600;margin-bottom:8px">⏳ Détection en cours — ${geoJob.done} / ${geoJob.total} étape${geoJob.total > 1 ? 's' : ''}</div>
           <div class="exp-break-track"><div class="exp-break-fill" style="width:${Math.max(2, pct)}%;background:var(--ocean)"></div></div>
         </div>`
      : `<div style="background:var(--mist);border:1px solid var(--sand);border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:var(--ink-mid)">✅ Dernière détection : ${geoJob.updated} étape(s) localisée(s)${geoJob.errors ? ` · ⚠️ ${geoJob.errors} sans position exploitable` : ''}.</div>`;
  }

  let recalcBanner = '';
  if (recalc) {
    if (recalc.scanned === 0) {
      recalcBanner = bannerWarn('ℹ️ Aucune étape ne possède de trace GPX — rien à recalculer.');
    } else {
      const errPart = recalc.errors ? ` · ⚠️ ${recalc.errors} trace(s) illisible(s)` : '';
      recalcBanner = bannerOk(`✅ Distances recalculées : ${recalc.updated} étape(s) mise(s) à jour sur ${recalc.scanned} avec trace GPX${errPart}.`);
    }
  }

  let trainBanner = '';
  if (train) {
    if (train.scanned === 0) {
      trainBanner = bannerWarn('ℹ️ Aucune étape n\'est marquée « déplacement en train » — rien à recalculer.');
    } else {
      const errPart = train.errors ? ` · ⚠️ ${train.errors} trace(s) illisible(s)` : '';
      trainBanner = bannerOk(`✅ Trajets en train : ${train.updated} distance(s) mise(s) à jour sur ${train.scanned} trajet(s)${errPart}.`);
    }
  }

  return renderSystemPage({
    key: 'sys-recalc',
    isStrictAdmin,
    banners: `${recalcBanner}${trainBanner}${geoBanner}`,
    body: `
      <div class="form-card" style="margin-bottom:16px">
        <h2>📐 Recalcul des distances</h2>
        <p style="font-size:14px;color:var(--ink-light);margin-bottom:18px;line-height:1.6">Recalcule la distance (km) de <strong>toutes les étapes possédant une trace GPX</strong>, à partir des points de la trace. Les étapes sans GPX ne sont pas modifiées. Utile après un import ou pour corriger d'anciennes valeurs saisies à la main.</p>
        <form method="POST" action="/recalc-distances" class="form-recalc">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button class="btn-submit" type="submit" style="background:linear-gradient(135deg,var(--ocean),var(--teal))">📐 Recalculer toutes les distances</button>
        </form>
      </div>
      <div class="form-card" style="margin-bottom:16px">
        <h2>🚆 Distances des trajets en train</h2>
        <p style="font-size:14px;color:var(--ink-light);margin-bottom:18px;line-height:1.6">Reprend chaque étape marquée <strong>« déplacement en train »</strong> avec le calcul courant : longueur de la trace GPX du trajet, à défaut estimation entre les <strong>deux gares</strong> saisies, à défaut depuis la position de l'étape précédente. Les distances <strong>saisies à la main</strong> ne sont jamais touchées. À lancer après avoir renseigné les gares d'anciens trajets.</p>
        <form method="POST" action="/recalc-train" class="form-recalc-train">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button class="btn-submit" type="submit" style="background:linear-gradient(135deg,var(--ocean),var(--teal))">🚆 Recalculer les distances de train</button>
        </form>
      </div>
      <div class="form-card">
        <h2>🌍 Pays et régions traversés</h2>
        <p style="font-size:14px;color:var(--ink-light);margin-bottom:18px;line-height:1.6">Détecte les pays et régions de chaque étape sans aucune saisie : les étapes avec une <strong>trace GPX</strong> sont découpées frontière par frontière (le kilométrage est réparti entre les régions traversées), les autres sont situées par leurs <strong>coordonnées</strong>. Les pays <strong>corrigés à la main</strong> ne sont jamais écrasés.</p>
        ${geoProgress}
        <form method="POST" action="/recalc-geo" class="form-recalc-geo">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button class="btn-submit" type="submit" style="background:linear-gradient(135deg,var(--ocean),var(--emerald))">🌍 Détecter les étapes pas encore localisées</button>
        </form>
        <form method="POST" action="/recalc-geo" class="form-recalc-geo">
          <input type="hidden" name="_csrf" value="${csrf}">
          <input type="hidden" name="force" value="1">
          <button class="loc-search-btn" type="submit" style="display:block;width:100%;text-align:center;margin-top:10px">🔄 Tout recalculer (y compris les étapes déjà localisées)</button>
        </form>
        <p style="font-size:12px;color:var(--ink-light);margin-top:10px;line-height:1.5">⏳ Le service OpenStreetMap n'accepte qu'une requête par seconde : la détection tourne en arrière-plan (environ 2 requêtes par étape, davantage quand une trace franchit une frontière). Vous pouvez quitter cette page, le traitement continue.</p>
      </div>`,
    script: `<script>
      document.querySelectorAll('.form-recalc').forEach(function(f) {
        f.addEventListener('submit', function(e) {
          if (!window.confirm('Recalculer les distances de toutes les étapes avec une trace GPX ? Les valeurs de km actuelles seront remplacées.')) e.preventDefault();
        });
      });
      document.querySelectorAll('.form-recalc-train').forEach(function(f) {
        f.addEventListener('submit', function(e) {
          if (!window.confirm('Recalculer la distance de tous les trajets en train ? Les distances saisies à la main sont conservées.')) e.preventDefault();
        });
      });
      document.querySelectorAll('.form-recalc-geo').forEach(function(f) {
        f.addEventListener('submit', function() {
          var b = f.querySelector('button[type=submit]');
          if (b) { b.disabled = true; b.textContent = '🌍 Détection lancée…'; }
        });
      });
      ${geoJob && geoJob.running
        // La détection tourne côté serveur : on rafraîchit pour suivre l'avancement.
        ? `setTimeout(function() { location.href = '/settings/recalc'; }, 5000);`
        : ''}
    </script>`,
  });
}

// ══════════════════════════════════════════════════════════
//  Abonnés : /settings/subscribers
// ══════════════════════════════════════════════════════════

function renderSubscribers(csrf = '', subscribers = [], isStrictAdmin = false) {
  const rows = subscribers.map(s => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px dashed var(--sand);font-size:13px">
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--ink)">${esc(s.email)}</span>
      ${s.confirmed
        ? `<span style="font-size:11px;background:var(--sage);color:var(--emerald);padding:2px 8px;border-radius:20px;font-weight:600;white-space:nowrap">✔ confirmé</span>`
        : `<span style="font-size:11px;background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:20px;font-weight:600;white-space:nowrap">⏳ en attente</span>
           <form method="POST" action="/subscribe/validate" class="form-sub-validate" style="margin:0">
             <input type="hidden" name="_csrf" value="${csrf}">
             <input type="hidden" name="email" value="${esc(s.email)}">
             <button type="submit" class="sub-validate" title="Valider cette inscription à la main">✔ valider</button>
           </form>`}
      <span style="font-size:11px;color:var(--ink-light);white-space:nowrap">${esc(formatDateShort(s.confirmedAt || s.createdAt))}</span>
      <form method="POST" action="/subscribe/remove" class="form-sub-remove" style="margin:0">
        <input type="hidden" name="_csrf" value="${csrf}">
        <input type="hidden" name="email" value="${esc(s.email)}">
        <button type="submit" class="comment-del" title="Retirer cet abonné">✕</button>
      </form>
    </div>`).join('');

  const pending = subscribers.filter(s => !s.confirmed).length;
  const pendingNote = pending
    ? ` ${pending} en attente — si l'e-mail de confirmation n'arrive jamais (spam, adresse dictée de vive voix…), le bouton « ✔ valider » confirme l'inscription à la main.`
    : '';

  const body = !MAIL_ENABLED
    ? `<p style="font-size:14px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;line-height:1.6">⚠️ L'envoi d'e-mails n'est pas configuré : renseignez <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> (et <code>MAIL_FROM</code>) dans <code>.env</code> pour activer les abonnements.</p>`
    : subscribers.length === 0
      ? `<p style="font-size:14px;color:var(--ink-light);line-height:1.6">Personne n'est encore abonné. Le bandeau « 🔔 » en haut du journal permet à vos proches de laisser leur e-mail : ils recevront un message à chaque nouvelle étape publiée.</p>`
      : `<p style="font-size:14px;color:var(--ink-light);margin-bottom:10px;line-height:1.6">${subscribers.filter(s => s.confirmed).length} abonné(s) confirmé(s) — prévenus une seule fois par étape, à sa première publication.${pendingNote}</p>${rows}`;

  return renderSystemPage({
    key: 'sys-subscribers',
    isStrictAdmin,
    body: `<div class="form-card" id="subscribers">
        <h2>🔔 Abonnés aux notifications</h2>
        ${body}
      </div>`,
    script: `<script>
      document.querySelectorAll('.form-sub-validate').forEach(function(f) {
        f.addEventListener('submit', function(e) {
          var email = f.querySelector('input[name=email]').value;
          if (!window.confirm('Valider l\\'inscription de ' + email + ' à la main ? Cette personne recevra les prochaines étapes sans avoir cliqué sur le lien de confirmation.')) e.preventDefault();
        });
      });
      document.querySelectorAll('.form-sub-remove').forEach(function(f) {
        f.addEventListener('submit', function(e) {
          var email = f.querySelector('input[name=email]').value;
          if (!window.confirm('Retirer ' + email + ' des abonnés ?')) e.preventDefault();
        });
      });
    </script>`,
  });
}

// ══════════════════════════════════════════════════════════
//  Notifications de commentaires : /settings/commentaires
// ══════════════════════════════════════════════════════════

// `saved` : null au chargement, sinon { count, rejected } au retour du POST.
function renderCommentMails(csrf = '', emails = [], saved = null, isStrictAdmin = false) {
  let banners = '';
  if (saved) {
    banners += saved.count
      ? bannerOk(`✅ ${saved.count} adresse${saved.count > 1 ? 's' : ''} enregistrée${saved.count > 1 ? 's' : ''} — elle${saved.count > 1 ? 's seront prévenues' : ' sera prévenue'} au prochain commentaire.`)
      : bannerInfo('ℹ️ Aucune adresse enregistrée — les notifications de commentaire sont désormais désactivées.');
    if (saved.rejected && saved.rejected.length) {
      banners += bannerWarn(`⚠️ Adresse(s) ignorée(s) : ${saved.rejected.map(esc).join(', ')} — vérifiez l'orthographe (au maximum ${MAX_COMMENT_EMAILS} adresses).`);
    }
  }
  if (!MAIL_ENABLED) {
    banners += bannerWarn(`⚠️ L'envoi d'e-mails n'est pas configuré : renseignez <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> (et <code>MAIL_FROM</code>) dans <code>.env</code>. Les adresses saisies ici sont conservées, mais rien ne partira tant que le serveur SMTP n'est pas réglé.`);
  }

  const current = emails.length
    ? `<p style="font-size:13px;color:var(--ink-light);margin-top:14px;line-height:1.6">Actuellement prévenu(e)s : ${emails.map(e => `<strong>${esc(e)}</strong>`).join(', ')}.</p>`
    : `<p style="font-size:13px;color:var(--ink-light);margin-top:14px;line-height:1.6">Aucune adresse pour le moment : les commentaires ne déclenchent aucun e-mail.</p>`;

  return renderSystemPage({
    key: 'sys-comment-mails',
    isStrictAdmin,
    banners,
    body: `<div class="form-card">
        <h2>💬 Qui est prévenu d'un nouveau commentaire ?</h2>
        <p style="font-size:14px;color:var(--ink-light);margin-bottom:18px;line-height:1.6">Dès qu'un lecteur laisse un commentaire — ou répond à un autre — un e-mail part vers chacune des adresses ci-dessous, avec le message et un lien vers l'étape concernée. C'est indépendant des <a href="/settings/subscribers" style="color:var(--ocean-mid)">🔔 abonnés</a>, prévenus eux des nouvelles étapes.</p>
        <form method="POST" action="/settings/commentaires">
          <input type="hidden" name="_csrf" value="${csrf}">
          <div class="field">
            <label>Adresses à prévenir</label>
            <textarea name="emails" placeholder="marie@example.fr&#10;tim@example.fr" style="height:120px">${esc(emails.join('\n'))}</textarea>
            <p class="field-hint">Une adresse par ligne (ou séparées par des virgules), ${MAX_COMMENT_EMAILS} au maximum. Laisser vide pour ne plus recevoir de notification.</p>
          </div>
          <button class="btn-submit" type="submit">💾 Enregistrer</button>
        </form>
        ${current}
      </div>`,
  });
}

module.exports = {
  renderSystemHome, renderBackup, renderRecalc, renderSubscribers, renderCommentMails,
};
