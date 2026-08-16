const { isoToDatetimeLocal, isoToDateInput } = require('../lib/dates');
const { esc } = require('../lib/html');
const { isVideoUrl, pickCover } = require('../services/media');
const { splitTrainLabel } = require('../services/train');
const { CSS, renderHeader } = require('./layout');
const { FORM_SCRIPTS, richEditorHtml, sleepFieldsHtml, sleepFieldsInit } = require('./scripts');

// ══════════════════════════════════════════════════════════
//  renderEditForm
// ══════════════════════════════════════════════════════════

function renderEditForm(post, err, isMargot = false, csrf = '') {
  const cover = pickCover(post.photos, post.cover);
  const sleep = post.sleep || { label: '', comment: '', lat: null, lon: null };
  // Gares de départ / d'arrivée : celles saisies, ou relues du libellé pour les
  // étapes publiées avant que le trajet ne soit découpé en deux champs.
  const stops = (post.trainFrom || post.trainTo)
    ? { from: post.trainFrom || '', to: post.trainTo || '' }
    : splitTrainLabel(post.trainLabel);

  // Rappel de ce que la détection automatique a déjà trouvé, pour que l'auteur
  // sache s'il a besoin de corriger quoi que ce soit.
  const km1 = n => (Math.round(n * 10) / 10).toLocaleString('fr-FR');
  const TRAIN_SOURCES = {
    gpx:      ' Distance actuelle : longueur de la trace GPX.',
    stations: ' Distance actuelle : estimée entre les deux gares ci-dessous.',
    points:   ' Distance actuelle : estimée depuis la position de l\'étape précédente.',
    manual:   ' Distance actuelle : valeur saisie ci-dessous.',
  };
  const trainSourceNote = post.trainKm > 0 ? ` <strong>${km1(post.trainKm)} km</strong>.${TRAIN_SOURCES[post.trainKmSource] || ''}` : '';

  const GEO_SOURCES = { gpx: 'détectés le long de la trace GPX', point: 'détectés depuis les coordonnées', location: 'déduits du nom du lieu', manual: 'corrigés à la main' };
  const geoDetected = post.country
    ? ` : ${esc(post.country)}${post.region ? ` / ${esc(post.region)}` : ''}${GEO_SOURCES[post.geoSource] ? ` <span style="opacity:.75">(${GEO_SOURCES[post.geoSource]})</span>` : ''}`
    : '';
  const breakdown = Array.isArray(post.geoBreakdown) ? post.geoBreakdown : [];
  const geoBreakdownNote = breakdown.length > 1
    ? `Répartition détectée : ${breakdown.map(b => `${esc(b.region || b.country)} ${km1((b.km || 0) + (b.trainKm || 0))} km`).join(' · ')}. `
    : '';
  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Modifier l'étape</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: '', isAdmin: true, showMap: false })}
    <div class="form-wrap"><div class="form-card">
      <h2>✏️ Modifier l'étape</h2>
      ${err ? `<div class="error-msg">${esc(err || '')}</div>` : ''}
      <form method="POST" action="/edit/${post.id}?_csrf=${csrf}" enctype="multipart/form-data" id="editForm" novalidate>
        <input type="hidden" name="_csrf" value="${csrf}">

        <div class="tabs-nav" id="editTabs">
          <button type="button" class="tab-btn" data-target="etab-contenu"><span>📝</span><span class="tab-label">Contenu</span></button>
          <button type="button" class="tab-btn" data-target="etab-parcours"><span>🗺️</span><span class="tab-label">Parcours</span></button>
          <button type="button" class="tab-btn" data-target="etab-options"><span>⚙️</span><span class="tab-label">Options</span></button>
        </div>

        <!-- ── Onglet Contenu ── -->
        <div class="tab-panel" id="etab-contenu">
          <div class="field">
            <label>Titre *</label>
            <input name="title" type="text" value="${esc(post.title)}" required maxlength="100">
          </div>
          <div class="field">
            <label>Raconte ta journée *</label>
            ${richEditorHtml(post.body || '', 4000)}
          </div>
          ${post.photos?.length ? `
          <div class="field">
            <label>Médias actuels — glissez pour réordonner, décochez pour supprimer</label>
            <div id="mediaSortable" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">
              ${post.photos.map((ph, i) => `
                <div class="media-item" draggable="true" data-url="${ph}" style="position:relative;cursor:grab;border-radius:8px;width:90px">
                  <span class="media-order-badge">${i+1}</span>
                  <input type="checkbox" name="keepPhotos" value="${ph}" checked
                    style="position:absolute;top:4px;right:4px;z-index:2;accent-color:var(--teal);width:18px;height:18px">
                  ${isVideoUrl(ph)
                    ? `<video src="${ph}" muted playsinline style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:2px solid var(--teal-light);pointer-events:none"></video>`
                    : `<img src="${ph}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:2px solid var(--teal-light);pointer-events:none">`}
                  <button type="button" class="media-cover-btn${ph === cover ? ' is-cover' : ''}" title="Afficher ce média sur la carte du post">⭐</button>
                  <button type="button" class="media-caption-btn${(post.captions && post.captions[i]) ? ' has-caption' : ''}" title="${(post.captions && post.captions[i]) ? 'Modifier la légende' : 'Ajouter une légende'}">💬</button>
                  <input type="hidden" name="caption_keep_${ph}" class="media-caption-input" value="${esc((post.captions && post.captions[i]) || '')}">
                </div>`).join('')}
            </div>
            <div id="photoOrderInputs"></div>
            <input type="hidden" name="cover" id="coverInput" value="${cover || ''}">
            <p style="font-size:11px;color:var(--ink-light);margin-top:6px">↕️ Maintenez et glissez une vignette pour changer l'ordre. 💬 pour ajouter une légende. ⭐ pour choisir le média affiché sur la carte (les autres s'ouvrent au clic).</p>
          </div>` : ''}
          <div class="field">
            <label>Ajouter des photos ou vidéos</label>
            <input type="file" name="photos" multiple accept="image/*,video/*" data-photo-grid="newCaptionsEdit">
            <div id="newCaptionsEdit"></div>
          </div>
          <div class="field">
            <label>Visibilité</label>
            ${isMargot ? `
            <input type="hidden" name="visibility" value="margot">
            <div style="padding:10px 14px;background:#fef9c3;border:1.5px solid #fde68a;border-radius:10px;font-size:13px;color:#92400e;font-weight:500">👧 À valider — visible par Margot et l'admin uniquement</div>` : `
            <select name="visibility">
              <option value="all" ${(!post.visibility||post.visibility==='all')?'selected':''}>🌍 Tout le monde</option>
              <option value="margot" ${post.visibility==='margot'?'selected':''}>👧 À valider</option>
            </select>`}
          </div>
        </div>

        <!-- ── Onglet Parcours ── -->
        <div class="tab-panel" id="etab-parcours">
          <div class="field">
            <label>Date et heure de l'étape</label>
            <input type="datetime-local" name="postDate" value="${isoToDatetimeLocal(post.date)}" required>
          </div>
          <div class="field">
            <label>Date de fin <span style="text-transform:none;font-weight:400;color:var(--ink-light);letter-spacing:0">— étape sur plusieurs jours (optionnel)</span></label>
            <input type="date" name="endDate" value="${isoToDateInput(post.endDate)}">
            <div class="field-hint">📅 Laissez vide pour une étape d'un seul jour. Les jours en plus (au-delà de la trace GPX / du kilométrage) sont comptés comme <strong>repos</strong>.</div>
          </div>
          <div class="field">
            <label>Lieu</label>
            <div class="loc-wrap">
              <input name="location" id="locationField" type="text" value="${esc(post.location||'')}" placeholder="Tapez un lieu ou utilisez le GPS..." autocomplete="off">
              <div class="loc-suggestions" id="locSuggestions"></div>
            </div>
            <input type="hidden" name="lat" id="lat" value="${post.lat||''}">
            <input type="hidden" name="lon" id="lon" value="${post.lon||''}">
            <button type="button" class="loc-search-btn" id="gpsBtnEdit">📍 GPS auto</button>
          </div>
          ${sleepFieldsHtml(sleep, 'gpsBtnSleepEdit')}
          <div class="field-row">
            <div class="field"><label>Km du jour</label><input name="km" type="number" min="0" max="500" step="0.1" value="${post.km||''}"></div>
            <div class="field"><label>D+ (mètres)</label><input name="dplus" type="number" min="0" max="10000" value="${post.dplus||''}"></div>
          </div>
          <div class="field">
            <label class="check-line">
              <input type="checkbox" name="trainTransfer" value="1" id="trainTransferEdit" ${post.trainTransfer ? 'checked' : ''}>
              🚆 Ce déplacement s'est fait en train
            </label>
            <div class="field-hint">Distance calculée automatiquement <strong>entre les deux gares ci-dessous</strong> (à défaut, depuis la position de l'étape précédente). Une trace GPX ne mesure le train que si elle relie justement ces deux gares.${trainSourceNote}</div>
            <div class="reveal-panel" id="trainStopsEdit"${post.trainTransfer ? '' : ' hidden'}>
              <div class="field">
                <label>Km en train <span style="text-transform:none;font-weight:400;color:var(--ink-light);letter-spacing:0">— si vide, calculé</span></label>
                <input name="trainKm" type="number" min="0" max="5000" step="0.1" value="${post.trainKmSource === 'manual' ? (post.trainKm || '') : ''}">
              </div>
              <div class="field-row">
                <div class="field">
                  <label>🚉 Départ <span style="text-transform:none;font-weight:400;color:var(--ink-light);letter-spacing:0">— si vide, déduit</span></label>
                  <div class="loc-wrap">
                    <input name="trainFrom" id="trainFromField" type="text" placeholder="Ex : Lyon" autocomplete="off" maxlength="120" value="${esc(stops.from)}">
                    <div class="loc-suggestions" id="trainFromSuggestions"></div>
                  </div>
                  <input type="hidden" name="trainFromLat" id="trainFromLat" value="${post.trainFromLat ?? ''}">
                  <input type="hidden" name="trainFromLon" id="trainFromLon" value="${post.trainFromLon ?? ''}">
                </div>
                <div class="field">
                  <label>🚉 Arrivée <span style="text-transform:none;font-weight:400;color:var(--ink-light);letter-spacing:0">— si vide, déduit</span></label>
                  <div class="loc-wrap">
                    <input name="trainTo" id="trainToField" type="text" placeholder="Ex : Turin" autocomplete="off" maxlength="120" value="${esc(stops.to)}">
                    <div class="loc-suggestions" id="trainToSuggestions"></div>
                  </div>
                  <input type="hidden" name="trainToLat" id="trainToLat" value="${post.trainToLat ?? ''}">
                  <input type="hidden" name="trainToLon" id="trainToLon" value="${post.trainToLon ?? ''}">
                </div>
              </div>
              <div class="field-hint" style="margin-top:0">🚆 Le nom d'une ville suffit (« Halle », « Berlin ») : la position est retrouvée toute seule. Tapez trois lettres pour choisir une suggestion et lever toute ambiguïté sur les homonymes. Laissez vide pour déduire le trajet de l'étape précédente et du lieu d'arrivée.</div>
            </div>
          </div>
          <details style="margin-bottom:16px"${(post.geoSource === 'manual') ? ' open' : ''}>
            <summary style="font-size:12px;color:var(--ink-light);cursor:pointer">🌍 Pays et région${geoDetected} — cliquez pour corriger</summary>
            <div class="field-row" style="margin-top:10px">
              <div class="field"><label>Pays</label><input name="country" id="countryField" type="text" placeholder="Détecté au parcours" maxlength="80" value="${esc(post.country||'')}"></div>
              <div class="field"><label>Région</label><input name="region" id="regionField" type="text" placeholder="Détectée au parcours" maxlength="80" value="${esc(post.region||'')}"></div>
            </div>
            <input type="hidden" name="countryCode" id="countryCodeField" value="${esc(post.countryCode||'')}">
            <input type="hidden" name="geoManual" id="geoManualField" value="${post.geoSource === 'manual' ? '1' : '0'}">
            <div class="field-hint">${geoBreakdownNote}Videz ces champs pour laisser la détection reprendre la main ; toute valeur saisie ici est figée.</div>
          </details>
          ${post.gpx ? `
          <div class="field">
            <label class="check-line">
              <input type="checkbox" name="keepGpx" value="1" checked>
              🗺️ Conserver la trace GPX existante
            </label>
          </div>` : ''}
          <div class="field">
            <label>Remplacer la trace GPX</label>
            <input type="file" name="gpx" accept=".gpx,application/gpx+xml" data-gpx-parse="1">
            <div id="gpxInfo" style="display:none;margin-top:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;font-size:13px;color:#166534"></div>
          </div>
          ${post.gpx ? `
          <div class="field" style="margin-top:6px;padding-top:16px;border-top:1px solid var(--sand)">
            <label>Recalcul du dénivelé</label>
            <div style="font-size:13px;color:var(--ink-mid);margin-bottom:8px;line-height:1.5">
              ⛰️ <strong>D+</strong> ${post.dplus ? `actuellement <strong>${esc(String(post.dplus))} m</strong>` : `<strong>non calculé</strong>`}.
              Si la trace GPX ne contient pas d'altitude, recalcule via le service Open-Meteo.
            </div>
            <button type="submit" form="recalcForm" class="loc-search-btn" style="margin-top:0">📈 Recalculer le D+ depuis le GPX</button>
            <div style="font-size:11px;color:var(--ink-light);margin-top:6px">
              La trace est interrogée auprès d'Open-Meteo — cela peut prendre quelques secondes.
            </div>
          </div>` : ''}
        </div>

        <!-- ── Onglet Options ── -->
        <div class="tab-panel" id="etab-options">
          <div class="field">
            <label>Dépenses de l'étape</label>
            <div class="exp-list" id="expList"></div>
            <button type="button" class="exp-add-btn" id="expAddBtn">➕ Ajouter une dépense</button>
            <div class="exp-total-hint" id="expTotal"></div>
          </div>
          <div class="field">
            <label>📝 Note privée (admin uniquement)</label>
            <textarea name="privateNote" placeholder="Visible seulement par les comptes admin." maxlength="2000" style="min-height:80px">${esc(post.privateNote || '')}</textarea>
          </div>
        </div>

        <div class="tabs-footer">
          <button type="button" class="tab-prev" id="editTabs-prev">← Précédent</button>
          <button type="button" class="tab-next" id="editTabs-next">Suivant →</button>
        </div>
        <button class="btn-submit" type="submit">💾 Enregistrer les modifications</button>
        </form>
        ${post.gpx ? `
        <form method="POST" action="/recalc-elevation/${post.id}?_csrf=${csrf}" id="recalcForm" class="form-recalc" style="display:none">
          <input type="hidden" name="_csrf" value="${csrf}">
        </form>` : ''}
    </div></div>
    <div class="upload-overlay" id="uploadOverlay">
      <div class="upload-box">
        <div class="up-emoji">💾</div>
        <h3>Enregistrement en cours…</h3>
        <p id="upMsg">Envoi des éléments</p>
        <div class="up-file" id="upFile"><span class="up-file-name"></span><span class="up-file-meta"></span></div>
        <div class="up-bar"><div class="up-bar-fill" id="upBarFill"></div></div>
        <div class="up-pct" id="upPct">0 %</div>
      </div>
    </div>
    <div class="caption-popup" id="captionPopup" role="dialog" aria-modal="true">
      <div class="caption-popup-box">
        <div class="caption-popup-head">
          <h3>💬 Légende du média</h3>
          <button type="button" class="caption-popup-close" id="captionPopupClose">×</button>
        </div>
        <div class="caption-popup-body">
          <img id="captionPopupImg" src="" alt="">
          <video id="captionPopupVid" src="" controls playsinline preload="metadata" style="display:none"></video>
          <textarea id="captionPopupText" maxlength="200" placeholder="Écrivez une légende…"></textarea>
          <div class="caption-popup-actions">
            <button type="button" class="caption-popup-save" id="captionPopupSave">Enregistrer</button>
          </div>
        </div>
      </div>
    </div>
    ${FORM_SCRIPTS}
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        initRichEditor('bodyEditor', 'bodyHidden', 'bodyCount', 4000);
        initFormTabs('editTabs');
        var geoFields = { countryId: 'countryField', regionId: 'regionField', codeId: 'countryCodeField', manualId: 'geoManualField' };
        watchGeoOverride(geoFields);
        initLocAutocomplete('locationField', 'lat', 'lon', 'locSuggestions', { geo: geoFields });
        initRevealToggle('trainTransferEdit', 'trainStopsEdit', 'trainFromField');
        initStationField('trainFromField', 'trainFromLat', 'trainFromLon', 'trainFromSuggestions');
        initStationField('trainToField', 'trainToLat', 'trainToLon', 'trainToSuggestions');
        var btn = document.getElementById('gpsBtnEdit');
        if (btn) btn.addEventListener('click', function() { getGPS('locationField', 'lat', 'lon', geoFields); });
${sleepFieldsInit('gpsBtnSleepEdit')}
        initExpenses('expList', 'expAddBtn', 'expTotal', ${JSON.stringify(post.expenses || []).replace(/</g, '\\u003c')});

        // ── Réordonnancement des médias (drag & drop + tactile) ──
        var sortable = document.getElementById('mediaSortable');
        var orderInputs = document.getElementById('photoOrderInputs');
        if (sortable && orderInputs) {
          var dragged = null;

          function refreshOrder() {
            var items = Array.from(sortable.querySelectorAll('.media-item'));
            orderInputs.innerHTML = '';
            items.forEach(function(it, i) {
              var badge = it.querySelector('.media-order-badge');
              if (badge) badge.textContent = i + 1;
              var inp = document.createElement('input');
              inp.type = 'hidden';
              inp.name = 'photoOrder';
              inp.value = it.dataset.url;
              orderInputs.appendChild(inp);
            });
          }

          sortable.querySelectorAll('.media-item').forEach(function(item) {
            item.addEventListener('dragstart', function() { dragged = item; item.style.opacity = '0.4'; });
            item.addEventListener('dragend', function() { item.style.opacity = '1'; dragged = null; refreshOrder(); });
            item.addEventListener('dragover', function(e) {
              e.preventDefault();
              if (!dragged || dragged === item) return;
              var rect = item.getBoundingClientRect();
              var after = (e.clientX - rect.left) > rect.width / 2;
              sortable.insertBefore(dragged, after ? item.nextSibling : item);
            });
          });

          // Support tactile simple : appui long puis déplacement
          var touchItem = null;
          sortable.querySelectorAll('.media-item').forEach(function(item) {
            item.addEventListener('touchstart', function() { touchItem = item; }, { passive: true });
            item.addEventListener('touchmove', function(e) {
              if (!touchItem) return;
              var t = e.touches[0];
              var over = document.elementFromPoint(t.clientX, t.clientY);
              if (!over) return;
              var target = over.closest('.media-item');
              if (target && target !== touchItem && target.parentElement === sortable) {
                var rect = target.getBoundingClientRect();
                var after = (t.clientX - rect.left) > rect.width / 2;
                sortable.insertBefore(touchItem, after ? target.nextSibling : target);
              }
            }, { passive: true });
            item.addEventListener('touchend', function() { touchItem = null; refreshOrder(); }, { passive: true });
          });

          refreshOrder();
        }

        // ── Choix du média de couverture (⭐) ──
        var coverInput = document.getElementById('coverInput');
        if (sortable && coverInput) {
          sortable.querySelectorAll('.media-cover-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              var item = btn.closest('.media-item');
              if (!item) return;
              coverInput.value = item.dataset.url;
              sortable.querySelectorAll('.media-cover-btn').forEach(function(b) {
                b.classList.toggle('is-cover', b === btn);
              });
            });
          });
        }

        // ── Popup de saisie des légendes depuis les vignettes ──
        var capPopup   = document.getElementById('captionPopup');
        var capImg     = document.getElementById('captionPopupImg');
        var capVid     = document.getElementById('captionPopupVid');
        var capText    = document.getElementById('captionPopupText');
        var capSaveBtn = document.getElementById('captionPopupSave');
        var capCloseBtn= document.getElementById('captionPopupClose');
        var capTarget  = null; // input hidden de la vignette en cours d'édition
        var capBtn     = null; // bouton 💬 de la vignette en cours d'édition

        function openCaptionPopup(btn) {
          var item = btn.closest('.media-item');
          if (!item) return;
          capTarget = item.querySelector('.media-caption-input');
          capBtn = btn;
          if (!capTarget) return;
          // Aperçu : vidéo ou image selon le type du média
          var isVid = /\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(item.dataset.url || '');
          capImg.style.display = isVid ? 'none' : 'block';
          capVid.style.display = isVid ? 'block' : 'none';
          capImg.src = isVid ? '' : item.dataset.url;
          capVid.src = isVid ? item.dataset.url : '';
          capText.value = capTarget.value || '';
          capPopup.classList.add('open');
          document.body.style.overflow = 'hidden';
          setTimeout(function() { capText.focus(); }, 50);
        }

        function closeCaptionPopup() {
          if (capVid && !capVid.paused) capVid.pause();
          capPopup.classList.remove('open');
          document.body.style.overflow = '';
          capTarget = null;
          capBtn = null;
        }

        function saveCaptionPopup() {
          if (capTarget) {
            capTarget.value = capText.value.trim().substring(0, 200);
            if (capBtn) capBtn.classList.toggle('has-caption', !!capTarget.value);
          }
          closeCaptionPopup();
        }

        if (capPopup) {
          document.querySelectorAll('.media-caption-btn').forEach(function(btn) {
            btn.addEventListener('click', function() { openCaptionPopup(btn); });
          });
          capSaveBtn.addEventListener('click', saveCaptionPopup);
          capCloseBtn.addEventListener('click', closeCaptionPopup);
          capPopup.addEventListener('click', function(e) { if (e.target === capPopup) closeCaptionPopup(); });
          document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && capPopup.classList.contains('open')) closeCaptionPopup();
          });
          capText.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveCaptionPopup(); }
          });
        }

        initUploadProgress('editForm', 'draft_edit', 'bodyHidden');
        restoreDraft('draft_edit', 'editForm', 'bodyEditor', 'bodyHidden');
      });
    </script>
  </body></html>`;
}

module.exports = { renderEditForm };
