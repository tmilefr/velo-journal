const { nowDatetimeLocal } = require('../lib/dates');
const { esc } = require('../lib/html');
const { CSS, renderHeader } = require('./layout');
const { FORM_SCRIPTS, richEditorHtml, sleepFieldsHtml, sleepFieldsInit } = require('./scripts');

// ══════════════════════════════════════════════════════════
//  renderPostForm
// ══════════════════════════════════════════════════════════

function renderPostForm(err, lastLocation = '', isMargot = false, csrf = '', defaultType = '') {
  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Nouvelle étape</title><style>${CSS}</style>
  </head><body>
    ${renderHeader({ activePage: '', isAdmin: true, showMap: false })}
    <div class="form-wrap"><div class="form-card">
      <h2>✏️ Poster une étape</h2>
      ${err ? `<div class="error-msg">${esc(err || '')}</div>` : ''}
      ${lastLocation ? `<div class="prev-location-hint">📍 Dernière position connue : <strong>${esc(lastLocation)}</strong></div>` : ''}
      <form method="POST" action="/post?_csrf=${csrf}" enctype="multipart/form-data" id="postForm">
        <input type="hidden" name="_csrf" value="${csrf}">

        <div class="tabs-nav" id="postTabs">
          <button type="button" class="tab-btn" data-target="tab-contenu"><span>📝</span><span class="tab-label">Contenu</span></button>
          <button type="button" class="tab-btn" data-target="tab-parcours"><span>🗺️</span><span class="tab-label">Parcours</span></button>
          <button type="button" class="tab-btn" data-target="tab-options"><span>⚙️</span><span class="tab-label">Options</span></button>
        </div>

        <!-- ── Onglet Contenu ── -->
        <div class="tab-panel" id="tab-contenu">
          <div class="field">
            <label>Titre *</label>
            <input name="title" type="text" placeholder="Ex : Arrivée à Lyon !" required maxlength="100">
          </div>
          <div class="field">
            <label>Raconte ta journée *</label>
            ${richEditorHtml('', 4000)}
          </div>
          <div class="field">
            <label>Photos / vidéos (max 10)</label>
            <input type="file" name="photos" multiple accept="image/*,video/*" id="photoInputPost" data-photo-grid="newCaptionsPost" data-cover-input="coverNewPost">
            <div id="newCaptionsPost"></div>
            <input type="hidden" name="cover_new" id="coverNewPost" value="0">
            <p style="font-size:11px;color:var(--ink-light);margin-top:6px">⭐ Choisissez le média affiché sur la carte du post : les autres photos et vidéos s'ouvrent au clic.</p>
          </div>
          <div class="field">
            <label>Visibilité</label>
            ${isMargot
              ? `<input type="hidden" name="visibility" value="margot">
                 <div style="padding:10px 14px;border-radius:10px;background:var(--mist);border:1.5px solid var(--sand);font-size:13px;color:var(--ocean-mid);font-weight:500">👧 À valider (visible par admin seulement)</div>`
              : `<select name="visibility">
                   <option value="all">🌍 Tout le monde</option>
                   <option value="margot">👧 À valider</option>
                 </select>`}
          </div>
        </div>

        <!-- ── Onglet Parcours ── -->
        <div class="tab-panel" id="tab-parcours">
          <div class="field">
            <label>Date et heure de l'étape</label>
            <input type="datetime-local" name="postDate" value="${nowDatetimeLocal()}" required>
          </div>
          <div class="field">
            <label>Date de fin <span style="text-transform:none;font-weight:400;color:var(--ink-light);letter-spacing:0">— étape sur plusieurs jours (optionnel)</span></label>
            <input type="date" name="endDate">
            <div class="field-hint">📅 Laissez vide pour une étape d'un seul jour. Si vous ajoutez une trace GPX, les jours en plus sont comptés comme <strong>repos</strong> (non roulés).</div>
          </div>
          <div class="field">
            <label>Lieu d'arrivée</label>
            <div class="loc-wrap">
              <input name="location" id="locationField" type="text" placeholder="Tapez un lieu ou utilisez le GPS..." autocomplete="off">
              <div class="loc-suggestions" id="locSuggestions"></div>
            </div>
            <input type="hidden" name="lat" id="lat">
            <input type="hidden" name="lon" id="lon">
            <button type="button" class="loc-search-btn" id="gpsBtnPost">📍 GPS auto</button>
          </div>
          ${sleepFieldsHtml(null, 'gpsBtnSleepPost')}
          <div class="field-row">
            <div class="field"><label>Km du jour</label><input name="km" type="number" min="0" max="500" step="0.1"></div>
            <div class="field"><label>D+ (mètres)</label><input name="dplus" type="number" min="0" max="10000"></div>
          </div>
          <div class="field">
            <label class="check-line">
              <input type="checkbox" name="trainTransfer" value="1" id="trainTransferPost">
              🚆 Ce déplacement s'est fait en train
            </label>
            <div class="field-hint">La distance se calcule toute seule, <strong>entre les deux gares ci-dessous</strong> (à défaut, depuis la position de l'étape précédente). Une trace GPX ne sert à mesurer le train que si elle relie justement ces deux gares : sinon elle compte, comme d'habitude, pour les kilomètres roulés. Les kilomètres de train n'entrent ni dans les km roulés ni dans les moyennes, mais s'ajoutent au <strong>trajet total parcouru</strong>.</div>
            <div class="reveal-panel" id="trainStopsPost" hidden>
              <div class="field">
                <label>Km en train <span style="text-transform:none;font-weight:400;color:var(--ink-light);letter-spacing:0">— si vide, calculé</span></label>
                <input name="trainKm" type="number" min="0" max="5000" step="0.1">
              </div>
              <div class="field-row">
                <div class="field">
                  <label>🚉 Départ <span style="text-transform:none;font-weight:400;color:var(--ink-light);letter-spacing:0">— si vide, déduit</span></label>
                  <div class="loc-wrap">
                    <input name="trainFrom" id="trainFromField" type="text" placeholder="Ex : Lyon" autocomplete="off" maxlength="120">
                    <div class="loc-suggestions" id="trainFromSuggestions"></div>
                  </div>
                  <input type="hidden" name="trainFromLat" id="trainFromLat">
                  <input type="hidden" name="trainFromLon" id="trainFromLon">
                </div>
                <div class="field">
                  <label>🚉 Arrivée <span style="text-transform:none;font-weight:400;color:var(--ink-light);letter-spacing:0">— si vide, déduit</span></label>
                  <div class="loc-wrap">
                    <input name="trainTo" id="trainToField" type="text" placeholder="Ex : Turin" autocomplete="off" maxlength="120">
                    <div class="loc-suggestions" id="trainToSuggestions"></div>
                  </div>
                  <input type="hidden" name="trainToLat" id="trainToLat">
                  <input type="hidden" name="trainToLon" id="trainToLon">
                </div>
              </div>
              <div class="field-hint" style="margin-top:0">🚆 Le nom d'une ville suffit (« Halle », « Berlin ») : la position est retrouvée toute seule. Tapez trois lettres pour choisir une suggestion et lever toute ambiguïté sur les homonymes. Laissez vide pour déduire le trajet de l'étape précédente et du lieu d'arrivée.</div>
            </div>
          </div>
          <details style="margin-bottom:16px">
            <summary style="font-size:12px;color:var(--ink-light);cursor:pointer">🌍 Pays et région — détectés automatiquement, cliquez pour corriger</summary>
            <div class="field-row" style="margin-top:10px">
              <div class="field"><label>Pays</label><input name="country" id="countryField" type="text" placeholder="Détecté au parcours" maxlength="80"></div>
              <div class="field"><label>Région</label><input name="region" id="regionField" type="text" placeholder="Détectée au parcours" maxlength="80"></div>
            </div>
            <input type="hidden" name="countryCode" id="countryCodeField">
            <input type="hidden" name="geoManual" id="geoManualField" value="0">
            <div class="field-hint">Les pays et régions traversés sont déduits de la trace GPX (découpée frontière par frontière) ou des coordonnées de l'étape, juste après la publication. Ne remplissez ces champs que pour forcer une valeur : elle ne sera plus recalculée.</div>
          </details>
          <div class="field">
            <label>Trace GPX (optionnel)</label>
            <input type="file" name="gpx" accept=".gpx,application/gpx+xml" data-gpx-parse="1">
            <div id="gpxInfo" style="display:none;margin-top:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;font-size:13px;color:#166534"></div>
          </div>
        </div>

        <!-- ── Onglet Options ── -->
        <div class="tab-panel" id="tab-options">
          <div class="field">
            <label>Type de publication</label>
            <select name="type">
              <option value="etape" ${defaultType !== 'preparation' ? 'selected' : ''}>🚴 Étape de voyage</option>
              <option value="preparation" ${defaultType === 'preparation' ? 'selected' : ''}>🛠️ Préparation</option>
            </select>
          </div>
          <div class="field">
            <label>Dépenses de l'étape</label>
            <div class="exp-list" id="expList"></div>
            <button type="button" class="exp-add-btn" id="expAddBtn">➕ Ajouter une dépense</button>
            <div class="exp-total-hint" id="expTotal"></div>
          </div>
          <div class="field">
            <label>📝 Note privée (admin uniquement)</label>
            <textarea name="privateNote" placeholder="Visible seulement par les comptes admin. Ex : budget, infos pratiques, rappels…" maxlength="2000" style="min-height:80px"></textarea>
          </div>
        </div>

        <div class="tabs-footer">
          <button type="button" class="tab-prev" id="postTabs-prev">← Précédent</button>
          <button type="button" class="tab-next" id="postTabs-next">Suivant →</button>
        </div>
        <button class="btn-submit" type="submit">🚴 Publier l'étape</button>
      </form>
    </div></div>
    <div class="upload-overlay" id="uploadOverlay">
      <div class="upload-box">
        <div class="up-emoji">🚴</div>
        <h3>Publication en cours…</h3>
        <p id="upMsg">Envoi des éléments</p>
        <div class="up-file" id="upFile"><span class="up-file-name"></span><span class="up-file-meta"></span></div>
        <div class="up-bar"><div class="up-bar-fill" id="upBarFill"></div></div>
        <div class="up-pct" id="upPct">0 %</div>
      </div>
    </div>
    ${FORM_SCRIPTS}
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        initRichEditor('bodyEditor', 'bodyHidden', 'bodyCount', 4000);
        initFormTabs('postTabs');
        var geoFields = { countryId: 'countryField', regionId: 'regionField', codeId: 'countryCodeField', manualId: 'geoManualField' };
        watchGeoOverride(geoFields);
        initLocAutocomplete('locationField', 'lat', 'lon', 'locSuggestions', { geo: geoFields });
        initRevealToggle('trainTransferPost', 'trainStopsPost', 'trainFromField');
        initStationField('trainFromField', 'trainFromLat', 'trainFromLon', 'trainFromSuggestions');
        initStationField('trainToField', 'trainToLat', 'trainToLon', 'trainToSuggestions');
        var btn = document.getElementById('gpsBtnPost');
        if (btn) btn.addEventListener('click', function() { getGPS('locationField', 'lat', 'lon', geoFields); });
${sleepFieldsInit('gpsBtnSleepPost')}
        initExpenses('expList', 'expAddBtn', 'expTotal', []);
        initUploadProgress('postForm', 'draft_post', 'bodyHidden');
        restoreDraft('draft_post', 'postForm', 'bodyEditor', 'bodyHidden');
      });
    </script>
  </body></html>`;
}

module.exports = { renderPostForm };
