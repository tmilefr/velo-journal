// ── Scripts et fragments HTML partagés injectés dans les pages ──
const { esc } = require('../lib/html');

// ── JS partagé pour formulaires ───────────────────────────
const FORM_SCRIPTS = `
<script>
function initLocAutocomplete(fieldId, latId, lonId, suggestId) {
  var field = document.getElementById(fieldId);
  var list  = document.getElementById(suggestId);
  var timer = null, items = [], sel = -1;
  if (!field || !list) return;
  field.addEventListener('input', function() {
    clearTimeout(timer);
    var q = field.value.trim();
    if (q.length < 3) { list.classList.remove('open'); return; }
    timer = setTimeout(function() { doSearch(q); }, 350);
  });
  field.addEventListener('keydown', function(e) {
    if (!list.classList.contains('open')) return;
    if (e.key === 'ArrowDown') { sel = Math.min(sel+1, items.length-1); highlight(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel-1, 0); highlight(); e.preventDefault(); }
    else if (e.key === 'Enter' && sel >= 0) { pick(sel); e.preventDefault(); }
    else if (e.key === 'Escape') { list.classList.remove('open'); }
  });
  document.addEventListener('click', function(e) {
    if (!field.contains(e.target) && !list.contains(e.target)) list.classList.remove('open');
  });
  function highlight() { Array.from(list.children).forEach(function(c,i){ c.classList.toggle('active', i===sel); }); }
  function pick(i) {
    var item = items[i];
    field.value = item.display;
    var latEl = document.getElementById(latId), lonEl = document.getElementById(lonId);
    latEl.value = parseFloat(item.lat).toFixed(6);
    lonEl.value = parseFloat(item.lon).toFixed(6);
    latEl.dataset.manual = lonEl.dataset.manual = '1';
    list.classList.remove('open'); sel = -1;
  }
  function doSearch(q) {
    fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=6&addressdetails=1')
      .then(function(r){ return r.json(); })
      .then(function(data) {
        items = data.map(function(r) {
          var a = r.address || {};
          var name = a.city || a.town || a.village || a.hamlet || a.county || r.display_name.split(',')[0];
          var detail = [a.state, a.country].filter(Boolean).join(', ');
          return { display: name + (detail ? ', '+detail : ''), lat: r.lat, lon: r.lon };
        });
        if (!items.length) { list.classList.remove('open'); return; }
        sel = -1;
        list.innerHTML = items.map(function(it, i) {
          return '<div class="loc-suggestion-item" data-idx="'+i+'">'
            + '<span class="loc-suggestion-name">'+escHtml(it.display.split(',')[0])+'</span>'
            + '<span class="loc-suggestion-detail">'+escHtml(it.display.split(',').slice(1).join(',').trim())+'</span>'
            + '</div>';
        }).join('');
        list.classList.add('open');
        Array.from(list.querySelectorAll('.loc-suggestion-item')).forEach(function(el) {
          el.addEventListener('mousedown', function(e) { e.preventDefault(); pick(parseInt(el.dataset.idx)); });
        });
      }).catch(function(){});
  }
}
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function getGPS(fieldId, latId, lonId) {
  if (!navigator.geolocation) return alert('Géolocalisation non disponible sur ce navigateur.');
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return alert('La géolocalisation nécessite HTTPS.');
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var latEl = document.getElementById(latId), lonEl = document.getElementById(lonId);
      latEl.value = pos.coords.latitude.toFixed(6);
      lonEl.value = pos.coords.longitude.toFixed(6);
      latEl.dataset.manual = lonEl.dataset.manual = '1';
      var field = document.getElementById(fieldId);
      if (!field.value) {
        fetch('https://nominatim.openstreetmap.org/reverse?lat=' + pos.coords.latitude + '&lon=' + pos.coords.longitude + '&format=json')
          .then(function(r){ return r.json(); })
          .then(function(d) { var a = d.address; field.value = [a.town||a.city||a.village, a.state].filter(Boolean).join(', '); })
          .catch(function(){});
      }
      alert('Position enregistrée : ' + pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4));
    },
    function(err) { var msgs = {1:'Permission refusée',2:'Position indisponible',3:'Délai dépassé'}; alert('Erreur GPS : ' + (msgs[err.code] || err.message)); },
    { timeout: 10000, maximumAge: 60000 }
  );
}
function parseGPX(input, fieldId, latId, lonId) {
  var file = input.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var parser = new DOMParser();
      var xml = parser.parseFromString(e.target.result, 'text/xml');
      var trkpts = Array.from(xml.querySelectorAll('trkpt'));
      if (!trkpts.length) { alert('Aucun point trouvé dans ce fichier GPX.'); return; }
      var dist = 0;
      for (var i = 1; i < trkpts.length; i++) {
        var lat1=parseFloat(trkpts[i-1].getAttribute('lat')),lon1=parseFloat(trkpts[i-1].getAttribute('lon'));
        var lat2=parseFloat(trkpts[i].getAttribute('lat')),lon2=parseFloat(trkpts[i].getAttribute('lon'));
        var R=6371000,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
        dist+=R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
      }
      var dplus=0;
      var elevs=trkpts.map(function(p){return parseFloat(p.querySelector('ele')?.textContent||0);}).filter(function(v){return !isNaN(v);});
      for (var j=1;j<elevs.length;j++){if(elevs[j]>elevs[j-1])dplus+=elevs[j]-elevs[j-1];}
      var last=trkpts[trkpts.length-1];
      var lat=parseFloat(last.getAttribute('lat')),lon=parseFloat(last.getAttribute('lon'));
      var kmVal=(dist/1000).toFixed(1), dpVal=Math.round(dplus);
      document.querySelector('[name=km]').value=kmVal;
      document.querySelector('[name=dplus]').value=dpVal;
      var latEl=document.getElementById(latId), lonEl=document.getElementById(lonId);
      var hasManualPoint = latEl.dataset.manual === '1';
      if (!hasManualPoint) {
        latEl.value=lat.toFixed(6);
        lonEl.value=lon.toFixed(6);
        fetch('https://nominatim.openstreetmap.org/reverse?lat='+lat+'&lon='+lon+'&format=json')
          .then(function(r){return r.json();}).then(function(d){
            var a=d.address, field=document.getElementById(fieldId);
            if(!field.value) field.value=[a.town||a.city||a.village,a.state].filter(Boolean).join(', ');
          }).catch(function(){});
      }
      var info = document.getElementById('gpxInfo');
      if (info) { info.style.display='block'; info.innerHTML='✅ Trace importée — <strong>'+kmVal+' km</strong> · <strong>'+dpVal.toLocaleString()+' m D+</strong> · '+trkpts.length+' points'; }
    } catch(err) { alert('Erreur lors de la lecture du GPX : '+err.message); }
  };
  reader.readAsText(file);
}
function previewPhotos(input) {
  var preview = document.getElementById('photoPreview');
  if (!preview) return;
  preview.innerHTML='';
  Array.from(input.files).forEach(function(f){
    var url = URL.createObjectURL(f);
    var el;
    if (f.type.indexOf('video/') === 0) {
      el = document.createElement('video'); el.src = url; el.muted = true; el.playsInline = true;
    } else {
      el = document.createElement('img'); el.src = url;
    }
    preview.appendChild(el);
  });
}

function renderPhotoGrid(input, containerId) {
  var c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = '';
  var files = Array.from(input.files);
  if (!files.length) return;
  var grid = document.createElement('div');
  grid.className = 'photo-grid-new';
  files.forEach(function(f, i) {
    var url = URL.createObjectURL(f);
    var card = document.createElement('div');
    card.className = 'photo-grid-card';
    var media;
    if (f.type.indexOf('video/') === 0) {
      media = document.createElement('video');
      media.src = url; media.muted = true; media.playsInline = true; media.controls = true;
    } else {
      media = document.createElement('img');
      media.src = url; media.alt = 'Photo ' + (i + 1);
    }
    media.className = 'photo-grid-media';
    card.appendChild(media);
    if (f.type.indexOf('image/') === 0) {
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'photo-grid-caption caption-input';
      inp.name = 'caption_new_' + i;
      inp.maxLength = 200;
      inp.placeholder = 'Légende…';
      card.appendChild(inp);
    }
    grid.appendChild(card);
  });
  c.appendChild(grid);
}

// ── Barre de progression d'envoi (post + édition) ──────────
function initUploadProgress(formId, draftKey, bodyHiddenId) {
  var form    = document.getElementById(formId);
  var overlay = document.getElementById('uploadOverlay');
  var fill    = document.getElementById('upBarFill');
  var pct     = document.getElementById('upPct');
  var msg     = document.getElementById('upMsg');
  if (!form || !overlay) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    // Sauvegarde brouillon avant envoi (restauré si le serveur renvoie une erreur)
    if (draftKey) saveDraft(draftKey, formId, bodyHiddenId);
    var fd  = new FormData(form);
    var xhr = new XMLHttpRequest();
    // L'action contient déjà ?_csrf=… donc requireCsrf passe via req.query
    xhr.open('POST', form.getAttribute('action'), true);

    overlay.classList.add('open');
    fill.style.width = '0%';
    pct.textContent  = '0 %';

    xhr.upload.addEventListener('progress', function(ev) {
      if (ev.lengthComputable) {
        var p = Math.round(ev.loaded / ev.total * 100);
        fill.style.width = p + '%';
        pct.textContent  = p + ' %';
        if (p >= 100 && msg) msg.textContent = 'Traitement des médias sur le serveur…';
      }
    });

    xhr.addEventListener('load', function() {
      if (xhr.status >= 200 && xhr.status < 400) {
        // Le serveur redirige (302 suivie auto) → on suit l'URL finale
        if (draftKey) clearDraft(draftKey);
        window.location.href = xhr.responseURL || '/';
      } else {
        // Erreur de validation : on réaffiche la page renvoyée
        overlay.classList.remove('open');
        document.open();
        document.write(xhr.responseText);
        document.close();
      }
    });

    xhr.addEventListener('error', function() {
      overlay.classList.remove('open');
      alert('Erreur réseau pendant l\\'envoi. Vos textes ont été conservés, réessayez.');
    });

    xhr.send(fd);
  });
}

// ── Dépenses dynamiques ────────────────────────────────────
var EXP_CATS  = [['restaurant','\\ud83c\\udf7d\\ufe0f Restaurant'],['hebergement','\\ud83c\\udfe8 H\\u00e9bergement'],['nourriture','\\ud83d\\uded2 Nourriture'],['divers','\\ud83e\\uddf3 Divers']];
var EXP_PAYERS= [['julie','\\ud83d\\udc69 Julie'],['nico','\\ud83e\\uddd4 Nico'],['commun','\\ud83d\\udc6b Commun']];
var EXP_SUBCATS = { hebergement: [['hotel','\\ud83c\\udfe8 H\\u00f4tel'],['camping','\\u26fa Camping']] };

function expRowHtml(cat, payer, amount, label, subcat) {
  function opts(list, sel) {
    return list.map(function(o){ return '<option value="'+o[0]+'"'+(o[0]===sel?' selected':'')+'>'+o[1]+'</option>'; }).join('');
  }
  var subOptions = EXP_SUBCATS[cat||'restaurant'];
  var subHtml = '<select name="exp_subcat" class="exp-subcat-field"'+(subOptions?'':' style="display:none"')+'>'
    + (subOptions ? '<option value="">— Pr\\u00e9ciser —</option>'+opts(subOptions, subcat) : '')
    + '</select>';
  return '<div class="exp-row" data-cat="'+(cat||'restaurant')+'">'
    + '<button type="button" class="exp-row-del" title="Supprimer cette d\\u00e9pense">\\u00d7</button>'
    + '<select name="exp_cat" class="exp-cat-field">'+opts(EXP_CATS, cat||'restaurant')+'</select>'
    + subHtml
    + '<select name="exp_payer">'+opts(EXP_PAYERS, payer||'commun')+'</select>'
    + '<input class="exp-amount-field" name="exp_amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Montant en \\u20ac" value="'+(amount!=null?amount:'')+'">'
    + '<input class="exp-label-field" name="exp_label" type="text" maxlength="80" placeholder="D\\u00e9tail (optionnel) : ex. Pizzeria du port" value="'+(label?String(label).replace(/"/g,'&quot;'):'')+'">'
    + '</div>';
}

function initExpenses(listId, addBtnId, totalId, initial) {
  var list = document.getElementById(listId);
  var addBtn = document.getElementById(addBtnId);
  var totalEl = document.getElementById(totalId);
  if (!list || !addBtn) return;

  function recalcTotal() {
    if (!totalEl) return;
    var t = 0;
    list.querySelectorAll('input[name=exp_amount]').forEach(function(i){
      var v = parseFloat(String(i.value).replace(',','.')); if (v>0) t += v;
    });
    totalEl.textContent = t > 0 ? ('Total des d\\u00e9penses : ' + t.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' \\u20ac') : '';
  }

  function refreshSubcat(row, keepValue) {
    var catSel = row.querySelector('.exp-cat-field');
    var oldSub = row.querySelector('.exp-subcat-field');
    var subOptions = EXP_SUBCATS[catSel.value];
    var newHtml = '<select name="exp_subcat" class="exp-subcat-field"'+(subOptions?'':' style="display:none"')+'>'
      + (subOptions ? '<option value="">\\u2014 Pr\\u00e9ciser \\u2014</option>'+subOptions.map(function(o){
          return '<option value="'+o[0]+'"'+(o[0]===keepValue?' selected':'')+'>'+o[1]+'</option>';
        }).join('') : '');
    var tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    oldSub.replaceWith(tmp.firstChild);
  }

  function addRow(cat, payer, amount, label, subcat) {
    var tmp = document.createElement('div');
    tmp.innerHTML = expRowHtml(cat, payer, amount, label, subcat);
    var row = tmp.firstChild;
    list.appendChild(row);
    row.querySelector('.exp-row-del').addEventListener('click', function(){ row.remove(); recalcTotal(); });
    row.querySelector('input[name=exp_amount]').addEventListener('input', recalcTotal);
    row.querySelector('.exp-cat-field').addEventListener('change', function(){ refreshSubcat(row); });
    recalcTotal();
  }

  addBtn.addEventListener('click', function(){ addRow(); });

  if (initial && initial.length) {
    initial.forEach(function(e){ addRow(e.category, e.payer, e.amount, e.label, e.subcategory); });
  }
  recalcTotal();
}

// ── Légendes pour nouvelles photos (legacy, remplacée par renderPhotoGrid) ──
function renderNewCaptions(input, containerId) {
  renderPhotoGrid(input, containerId);
}

// ── Sauvegarde/restauration de brouillon (sessionStorage) ──
function saveDraft(key, formId, bodyHiddenId) {
  try {
    var form = document.getElementById(formId);
    if (!form) return;
    var draft = {};
    ['title','location','km','dplus','privateNote','postDate','endDate'].forEach(function(n) {
      var el = form.querySelector('[name=' + n + ']');
      if (el) draft[n] = el.value;
    });
    if (bodyHiddenId) {
      var h = document.getElementById(bodyHiddenId);
      if (h) draft.body = h.value;
    }
    sessionStorage.setItem(key, JSON.stringify(draft));
  } catch(e) {}
}
function clearDraft(key) {
  try { sessionStorage.removeItem(key); } catch(e) {}
}
function restoreDraft(key, formId, bodyEditorId, bodyHiddenId) {
  try {
    var hasError = document.querySelector('.error-msg');
    if (!hasError) { clearDraft(key); return; }
    var draft = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!draft) return;
    var form = document.getElementById(formId);
    if (!form) return;
    ['title','location','km','dplus','privateNote','postDate','endDate'].forEach(function(n) {
      var el = form.querySelector('[name=' + n + ']');
      if (el && draft[n] != null) el.value = draft[n];
    });
    if (bodyHiddenId && draft.body != null) {
      var h = document.getElementById(bodyHiddenId);
      if (h) h.value = draft.body;
      var ed = document.getElementById(bodyEditorId);
      if (ed) ed.innerHTML = draft.body;
    }
  } catch(e) {}
}

// ── Éditeur de texte riche (contenteditable, 0 dépendance) ──
function initRichEditor(editorId, hiddenId, countId, maxLen) {
  var ed     = document.getElementById(editorId);
  var hidden = document.getElementById(hiddenId);
  if (!ed || !hidden) return;
  var max = maxLen || 4000;

  // Charge le contenu initial depuis le champ caché
  if (hidden.value && hidden.value.trim()) {
    ed.innerHTML = hidden.value;
  }

  function exec(cmd, val) {
    ed.focus();
    document.execCommand(cmd, false, val || null);
    sync();
    refreshState();
  }

  function sync() {
    var html = ed.innerHTML
      .replace(/<div>/gi, '<p>').replace(/<\\/div>/gi, '</p>')
      .replace(/<br><\\/p>/gi, '</p>')
      .trim();
    if (html === '<p></p>' || html === '<br>') html = '';
    hidden.value = html;
    if (countId) {
      var cnt  = document.getElementById(countId);
      var text = (ed.textContent || '').length;
      if (cnt) {
        cnt.textContent = text + ' / ' + max + ' caractères';
        cnt.classList.toggle('over', text > max);
      }
    }
  }

  // Met en surbrillance les boutons actifs (gras, italique…)
  function refreshState() {
    var bar = ed.previousElementSibling;
    if (!bar || !bar.classList.contains('rte-toolbar')) return;
    bar.querySelectorAll('.rte-btn[data-cmd]').forEach(function(b) {
      var cmd = b.dataset.cmd;
      var on = false;
      try { on = document.queryCommandState(cmd); } catch(e){}
      b.classList.toggle('active', on);
    });
  }

  // Branche les boutons de la toolbar
  var bar = ed.previousElementSibling;
  if (bar && bar.classList.contains('rte-toolbar')) {
    bar.querySelectorAll('.rte-btn').forEach(function(btn) {
      btn.addEventListener('mousedown', function(e){ e.preventDefault(); }); // garde la sélection
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        var cmd = btn.dataset.cmd;
        var block = btn.dataset.block;
        if (block) {
          // bascule le format de bloc (titre / citation / paragraphe)
          var cur = '';
          try { cur = document.queryCommandValue('formatBlock'); } catch(e){}
          exec('formatBlock', (cur && cur.toLowerCase() === block.toLowerCase()) ? 'p' : block);
        } else if (cmd === 'createLink') {
          var url = prompt('Adresse du lien (https://…) :', 'https://');
          if (url) exec('createLink', url);
        } else if (cmd) {
          exec(cmd);
        }
      });
    });
  }

  // Nettoyage du collage : on garde le texte, pas les styles externes
  ed.addEventListener('paste', function(e) {
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
    sync();
  });

  ed.addEventListener('input', sync);
  ed.addEventListener('keyup', refreshState);
  ed.addEventListener('mouseup', refreshState);

  // Synchro finale à la soumission
  var form = ed.closest('form');
  if (form) form.addEventListener('submit', sync);

  sync();
}

// ── Onglets de formulaire ────────────────────────────────
function initFormTabs(navId) {
  var nav = document.getElementById(navId);
  if (!nav) return;
  var btns   = Array.from(nav.querySelectorAll('.tab-btn'));
  var panels = btns.map(function(b){ return document.getElementById(b.dataset.target); });
  var prevBtn = document.getElementById(navId + '-prev');
  var nextBtn = document.getElementById(navId + '-next');
  var idx = 0;

  function activate(i) {
    idx = Math.max(0, Math.min(i, btns.length - 1));
    btns.forEach(function(b, k){ b.classList.toggle('active', k === idx); });
    panels.forEach(function(p, k){ if (p) p.classList.toggle('active', k === idx); });
    if (prevBtn) prevBtn.disabled = (idx === 0);
    if (nextBtn) nextBtn.textContent = (idx === btns.length - 1) ? '✓ Dernier onglet' : 'Suivant →';
  }
  btns.forEach(function(b, k){ b.addEventListener('click', function(){ activate(k); }); });
  if (prevBtn) prevBtn.addEventListener('click', function(){ activate(idx - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function(){ activate(idx + 1); });
  activate(0);
}
</script>
`;

// Génère le bloc HTML de l'éditeur riche (toolbar + zone + champ caché)
function richEditorHtml(initialBody = '', maxLen = 4000) {
  return `
    <div class="rte-toolbar" aria-label="Mise en forme">
      <button type="button" class="rte-btn" data-cmd="bold" title="Gras (Ctrl+B)"><b>B</b></button>
      <button type="button" class="rte-btn" data-cmd="italic" title="Italique (Ctrl+I)"><i>I</i></button>
      <button type="button" class="rte-btn" data-cmd="underline" title="Souligné (Ctrl+U)"><u>U</u></button>
      <span class="rte-sep"></span>
      <button type="button" class="rte-btn" data-block="h3" title="Titre">H</button>
      <button type="button" class="rte-btn" data-block="blockquote" title="Citation">&#10078;</button>
      <span class="rte-sep"></span>
      <button type="button" class="rte-btn" data-cmd="insertUnorderedList" title="Liste à puces">&bull;&equiv;</button>
      <button type="button" class="rte-btn" data-cmd="insertOrderedList" title="Liste numérotée">1&equiv;</button>
      <span class="rte-sep"></span>
      <button type="button" class="rte-btn" data-cmd="createLink" title="Insérer un lien">🔗</button>
      <button type="button" class="rte-btn" data-cmd="removeFormat" title="Effacer la mise en forme">⌫</button>
    </div>
    <div class="rte-editor" id="bodyEditor" contenteditable="true"
         data-placeholder="Décris ton étape, tes rencontres, la météo…"></div>
    <textarea name="body" id="bodyHidden" style="display:none" maxlength="${maxLen}">${esc(initialBody)}</textarea>
    <div class="rte-count" id="bodyCount"></div>`;
}

// ── Lightbox JS (partagé entre renderPublic et renderPreparation) ──
const LIGHTBOX_JS = `
<script>
  (function(){
    var lb=document.getElementById('lb'),lbImg=document.getElementById('lb-img'),lbCounter=document.getElementById('lb-counter'),lbCap=document.getElementById('lb-caption'),postImgs=[],postCaps=[],cur=0;
    function bindLightbox(root){
      (root||document).querySelectorAll('.card-photos img').forEach(function(img){
        if(img.dataset.lbBound)return; img.dataset.lbBound='1';
        img.addEventListener('click', function(){
          var card=img.closest('.card');
          var imgEls=Array.from(card.querySelectorAll('.card-photos img'));
          postImgs=imgEls.map(function(i){return i.src;});
          postCaps=imgEls.map(function(i){return i.getAttribute('data-caption')||'';});
          cur=postImgs.indexOf(img.src); if(cur<0)cur=0; show();
        });
      });
    }
    window.bindLightbox=bindLightbox;
    bindLightbox(document);
    function show(){
      lbImg.src=postImgs[cur]; lbCounter.textContent=(cur+1)+' / '+postImgs.length;
      if(lbCap){ lbCap.textContent=postCaps[cur]||''; lbCap.style.display=postCaps[cur]?'block':'none'; }
      document.getElementById('lb-prev').style.display=postImgs.length>1?'flex':'none';
      document.getElementById('lb-next').style.display=postImgs.length>1?'flex':'none';
      lb.classList.add('open'); document.body.style.overflow='hidden';
    }
    function close(){ lb.classList.remove('open'); document.body.style.overflow=''; lbImg.src=''; }
    document.getElementById('lb-close').addEventListener('click',close);
    document.getElementById('lb-prev').addEventListener('click',function(){cur=(cur-1+postImgs.length)%postImgs.length;show();});
    document.getElementById('lb-next').addEventListener('click',function(){cur=(cur+1)%postImgs.length;show();});
    lb.addEventListener('click',function(e){if(e.target===lb)close();});
    document.addEventListener('keydown',function(e){
      if(!lb.classList.contains('open'))return;
      if(e.key==='Escape')close();
      if(e.key==='ArrowLeft'){cur=(cur-1+postImgs.length)%postImgs.length;show();}
      if(e.key==='ArrowRight'){cur=(cur+1)%postImgs.length;show();}
    });
    var tx=0;
    lb.addEventListener('touchstart',function(e){tx=e.changedTouches[0].screenX;},{passive:true});
    lb.addEventListener('touchend',function(e){
      var dx=e.changedTouches[0].screenX-tx;
      if(Math.abs(dx)>50){cur=dx<0?(cur+1)%postImgs.length:(cur-1+postImgs.length)%postImgs.length;show();}
    },{passive:true});
  })();
</script>`;

// ── Carrousel vidéos (une seule vidéo visible par post) ──
const VIDEO_CAROUSEL_JS = `
<script>
(function(){
  // Une seule vidéo joue à la fois sur toute la page
  document.addEventListener('play', function(e){
    document.querySelectorAll('video').forEach(function(v){
      if(v!==e.target && !v.paused) v.pause();
    });
  }, true);

  function bindVideoCarousels(root){
    (root||document).querySelectorAll('.card-videos.multi').forEach(function(box){
      if(box.dataset.vcBound)return; box.dataset.vcBound='1';
      var vp     = box.querySelector('.cvid-viewport');
      var slides = Array.from(box.querySelectorAll('.cvid-slide'));
      var dots   = Array.from(box.querySelectorAll('.cvid-dot'));
      var num    = box.querySelector('.cvid-counter b');
      var prev   = box.querySelector('.cvid-prev');
      var next   = box.querySelector('.cvid-next');
      if(!vp||slides.length<2)return;
      var cur=0;

      // Format du cadre = celui de la vidéo la plus haute du post (bornes 9:16 → 2:1),
      // pour éviter les bandes noires inutiles et les sauts de hauteur entre diapos
      var ratios=[];
      function applyRatio(){
        var known=ratios.filter(function(r){ return r>0; });
        if(!known.length)return;
        var r=Math.min.apply(null,known);
        r=Math.max(0.5625,Math.min(2,r));
        box.style.setProperty('--vr',r.toFixed(4));
      }
      slides.forEach(function(s,i){
        var v=s.querySelector('video');
        if(!v)return;
        function note(){ if(v.videoWidth&&v.videoHeight){ ratios[i]=v.videoWidth/v.videoHeight; applyRatio(); } }
        if(v.readyState>=1) note(); else v.addEventListener('loadedmetadata',note);
      });

      function goTo(i){
        i=Math.max(0,Math.min(slides.length-1,i));
        vp.scrollTo({ left:i*vp.clientWidth, behavior:'smooth' });
      }
      function sync(){
        var i=Math.round(vp.scrollLeft/Math.max(1,vp.clientWidth));
        i=Math.max(0,Math.min(slides.length-1,i));
        if(i!==cur){
          var old=slides[cur].querySelector('video');
          if(old && !old.paused) old.pause();
          cur=i;
        }
        dots.forEach(function(d,k){ d.classList.toggle('active',k===cur); });
        if(num) num.textContent=String(cur+1);
        if(prev) prev.disabled=(cur===0);
        if(next) next.disabled=(cur===slides.length-1);
      }

      var ticking=false;
      vp.addEventListener('scroll', function(){
        if(ticking)return; ticking=true;
        requestAnimationFrame(function(){ ticking=false; sync(); });
      }, { passive:true });
      window.addEventListener('resize', function(){ vp.scrollLeft=cur*vp.clientWidth; });
      if(prev) prev.addEventListener('click', function(){ goTo(cur-1); });
      if(next) next.addEventListener('click', function(){ goTo(cur+1); });
      dots.forEach(function(d){ d.addEventListener('click', function(){ goTo(parseInt(d.dataset.i,10)||0); }); });
      sync();
    });
  }
  window.bindVideoCarousels=bindVideoCarousels;
  bindVideoCarousels(document);
})();
</script>`;

const TRANSLATE_JS = `
<script>
(function(){
  function bindTranslate(root){
    (root||document).querySelectorAll('.translate-widget').forEach(function(widget){
      if(widget.dataset.trBound)return; widget.dataset.trBound='1';
      var postId=widget.dataset.postid, csrf=widget.dataset.csrf;
      var select=widget.querySelector('.translate-select');
      var status=widget.querySelector('.translate-status');
      var card=document.getElementById('post-'+postId);
      if(!card)return;
      var titleEl=card.querySelector('.card-title');
      var textEl=card.querySelector('.card-text');
      var origTitle=titleEl.innerHTML, origBody=textEl?textEl.innerHTML:'';
      select.addEventListener('change', function(){
        var lang=select.value;
        if(!lang)return;
        if(lang==='fr'){
          titleEl.innerHTML=origTitle; if(textEl)textEl.innerHTML=origBody;
          status.textContent=''; select.value=''; return;
        }
        status.textContent='⏳ Traduction…';
        fetch('/translate/'+postId,{
          method:'POST',
          headers:{'Content-Type':'application/json','x-csrf-token':csrf},
          credentials:'same-origin',
          body:JSON.stringify({lang:lang})
        }).then(function(r){ return r.json().then(function(data){return {ok:r.ok,data:data};}); })
          .then(function(res){
            if(!res.ok){ status.textContent='⚠️ '+(res.data.error||'Erreur'); select.value=''; return; }
            titleEl.innerHTML=res.data.title;
            if(textEl)textEl.innerHTML=res.data.body;
            status.textContent='✅ Traduit';
          })
          .catch(function(){ status.textContent='⚠️ Erreur réseau'; select.value=''; });
      });
    });
  }
  window.bindTranslate=bindTranslate;
  bindTranslate(document);
})();
</script>`;

const LIGHTBOX_HTML = `
<div class="lightbox" id="lb" role="dialog" aria-modal="true">
  <button class="lb-close" id="lb-close" title="Fermer">&#x2715;</button>
  <button class="lb-nav lb-prev" id="lb-prev">&#8249;</button>
  <img id="lb-img" src="" alt="Photo agrandie">
  <button class="lb-nav lb-next" id="lb-next">&#8250;</button>
  <div class="lb-caption" id="lb-caption" style="display:none"></div>
  <div class="lb-counter" id="lb-counter"></div>
</div>`;

const ELEV_MODAL_HTML = `
<div class="elev-modal" id="elevModal" role="dialog" aria-modal="true">
  <div class="elev-box">
    <div class="elev-head">
      <h3 id="elevTitle">Profil de dénivelé</h3>
      <button class="elev-close" id="elevClose" title="Fermer">&#x2715;</button>
    </div>
    <div class="elev-body">
      <div class="elev-canvas-wrap">
        <canvas id="elevCanvas"></canvas>
        <div class="elev-loading" id="elevLoading">Chargement de la trace…</div>
      </div>
      <div class="elev-stats" id="elevStats" style="display:none">
        <div class="elev-stat"><div class="elev-stat-num" id="elevDplus">—</div><div class="elev-stat-lbl">D+ total</div></div>
        <div class="elev-stat"><div class="elev-stat-num" id="elevDminus">—</div><div class="elev-stat-lbl">D− total</div></div>
        <div class="elev-stat"><div class="elev-stat-num" id="elevMin">—</div><div class="elev-stat-lbl">Alt. min</div></div>
        <div class="elev-stat"><div class="elev-stat-num" id="elevMax">—</div><div class="elev-stat-lbl">Alt. max</div></div>
      </div>
    </div>
  </div>
</div>`;

const ELEV_MODAL_JS = `
<script>
(function(){
  var modal=document.getElementById('elevModal');
  if(!modal)return;
  var canvas=document.getElementById('elevCanvas');
  var loading=document.getElementById('elevLoading');
  var stats=document.getElementById('elevStats');
  var titleEl=document.getElementById('elevTitle');
  var cache={};

  function openModal(){ modal.classList.add('open'); document.body.style.overflow='hidden'; }
  function closeModal(){ modal.classList.remove('open'); document.body.style.overflow=''; }
  document.getElementById('elevClose').addEventListener('click',closeModal);
  modal.addEventListener('click',function(e){ if(e.target===modal) closeModal(); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&modal.classList.contains('open')) closeModal(); });

  function haversine(la1,lo1,la2,lo2){
    var R=6371000,dLa=(la2-la1)*Math.PI/180,dLo=(lo2-lo1)*Math.PI/180;
    var a=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)*Math.sin(dLo/2);
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  function buildProfile(txt){
    var xml=new DOMParser().parseFromString(txt,'text/xml');
    var trkpts=Array.from(xml.querySelectorAll('trkpt'));
    var pts=[],distCum=0,prev=null;
    trkpts.forEach(function(tp){
      var lat=parseFloat(tp.getAttribute('lat')),lon=parseFloat(tp.getAttribute('lon'));
      var eleEl=tp.querySelector('ele');
      var ele=eleEl?parseFloat(eleEl.textContent):NaN;
      if(isNaN(lat)||isNaN(lon))return;
      if(prev)distCum+=haversine(prev.lat,prev.lon,lat,lon);
      pts.push({lat:lat,lon:lon,ele:ele,dist:distCum});
      prev={lat:lat,lon:lon};
    });
    return pts;
  }

  function drawProfile(pts){
    var elevPts=pts.filter(function(p){return !isNaN(p.ele);});
    if(elevPts.length<2){
      loading.textContent='Aucune donnée d\\'altitude dans ce fichier GPX.';
      loading.style.display='block'; stats.style.display='none'; return;
    }
    loading.style.display='none';

    var dpr=Math.min(window.devicePixelRatio||1,2);
    var W=canvas.parentElement.clientWidth||600, H=260;
    canvas.width=W*dpr; canvas.height=H*dpr;
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    var ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);

    var PADL=46,PADR=14,PADT=16,PADB=28;
    var plotW=W-PADL-PADR, plotH=H-PADT-PADB;
    var totalDist=elevPts[elevPts.length-1].dist;
    var minE=Infinity,maxE=-Infinity;
    elevPts.forEach(function(p){ if(p.ele<minE)minE=p.ele; if(p.ele>maxE)maxE=p.ele; });
    var range=Math.max(maxE-minE,1);
    var padE=range*0.1; var loE=minE-padE, hiE=maxE+padE; var spanE=hiE-loE;

    function px(d){ return PADL+(d/totalDist)*plotW; }
    function py(e){ return PADT+plotH-((e-loE)/spanE)*plotH; }

    // Grille horizontale + labels altitude
    ctx.font='10px DM Sans,sans-serif'; ctx.textBaseline='middle';
    var steps=4;
    for(var i=0;i<=steps;i++){
      var e=loE+(spanE*i/steps); var y=py(e);
      ctx.strokeStyle='rgba(42,122,122,0.10)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(PADL,y); ctx.lineTo(W-PADR,y); ctx.stroke();
      ctx.fillStyle='#5a8080'; ctx.textAlign='right';
      ctx.fillText(Math.round(e)+' m',PADL-6,y);
    }
    // Labels distance
    ctx.textAlign='center'; ctx.textBaseline='top';
    for(var k=0;k<=4;k++){
      var d=totalDist*k/4; var x=px(d);
      ctx.fillStyle='#5a8080';
      ctx.fillText((d/1000).toFixed(d>0?1:0)+' km',x,H-PADB+8);
    }

    // Aire remplie
    ctx.beginPath();
    ctx.moveTo(px(elevPts[0].dist),py(elevPts[0].ele));
    elevPts.forEach(function(p){ ctx.lineTo(px(p.dist),py(p.ele)); });
    ctx.lineTo(px(elevPts[elevPts.length-1].dist),PADT+plotH);
    ctx.lineTo(px(elevPts[0].dist),PADT+plotH);
    ctx.closePath();
    var grad=ctx.createLinearGradient(0,PADT,0,PADT+plotH);
    grad.addColorStop(0,'rgba(58,144,144,0.45)');
    grad.addColorStop(1,'rgba(58,144,144,0.05)');
    ctx.fillStyle=grad; ctx.fill();

    // Ligne de profil
    ctx.beginPath();
    ctx.moveTo(px(elevPts[0].dist),py(elevPts[0].ele));
    elevPts.forEach(function(p){ ctx.lineTo(px(p.dist),py(p.ele)); });
    ctx.strokeStyle='#2a7a7a'; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.stroke();

    // Stats D+/D-
    var dPlus=0,dMinus=0;
    for(var j=1;j<elevPts.length;j++){
      var diff=elevPts[j].ele-elevPts[j-1].ele;
      if(diff>0)dPlus+=diff; else dMinus+=-diff;
    }
    document.getElementById('elevDplus').textContent=Math.round(dPlus).toLocaleString('fr-FR')+' m';
    document.getElementById('elevDminus').textContent=Math.round(dMinus).toLocaleString('fr-FR')+' m';
    document.getElementById('elevMin').textContent=Math.round(minE).toLocaleString('fr-FR')+' m';
    document.getElementById('elevMax').textContent=Math.round(maxE).toLocaleString('fr-FR')+' m';
    stats.style.display='flex';
  }

  function load(gpxUrl){
    if(cache[gpxUrl]){ drawProfile(cache[gpxUrl]); return; }
    fetch(gpxUrl).then(function(r){return r.text();}).then(function(txt){
      var pts=buildProfile(txt); cache[gpxUrl]=pts; drawProfile(pts);
    }).catch(function(){
      loading.textContent='Impossible de charger la trace GPX.'; loading.style.display='block';
    });
  }

  function bindElev(root){
    (root||document).querySelectorAll('.dplus-clickable').forEach(function(btn){
      if(btn.dataset.elevBound)return; btn.dataset.elevBound='1';
      btn.addEventListener('click',function(){
        titleEl.textContent='Dénivelé · '+(btn.dataset.elevTitle||'');
        loading.textContent='Chargement de la trace…'; loading.style.display='block';
        stats.style.display='none';
        var ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
        openModal();
        setTimeout(function(){ load(btn.dataset.elevGpx); },50);
      });
    });
  }
  window.bindElev=bindElev;
  bindElev(document);
})();
</script>`;

const DELETE_CONFIRM_JS = `
<script>
  (function(){
    function bindDelete(root){
      (root||document).querySelectorAll('.form-delete').forEach(function(f) {
        if(f.dataset.delBound)return; f.dataset.delBound='1';
        f.addEventListener('submit', function(e) {
          if (!window.confirm('Supprimer définitivement ?')) e.preventDefault();
        });
      });
      (root||document).querySelectorAll('.form-comment-del').forEach(function(f) {
        if(f.dataset.delBound)return; f.dataset.delBound='1';
        f.addEventListener('submit', function(e) {
          if (!window.confirm('Supprimer ce commentaire ?')) e.preventDefault();
        });
      });
    }
    window.bindDelete=bindDelete;
    bindDelete(document);
  })();
</script>`;

const COMMENTS_JS = `
<script>
  (function(){
    function bindComments(root){
      (root||document).querySelectorAll('.comment-reply-btn').forEach(function(btn){
        if(btn.dataset.replyBound)return; btn.dataset.replyBound='1';
        btn.addEventListener('click', function(){
          var id=btn.dataset.replyTarget;
          var form=document.getElementById(id);
          if(!form)return;
          var open=form.style.display!=='none';
          form.style.display=open?'none':'flex';
          if(!open){ var inp=form.querySelector('input[name=author]'); if(inp)inp.focus(); }
        });
      });
    }
    window.bindComments=bindComments;
    bindComments(document);
  })();
</script>`;

module.exports = {
  FORM_SCRIPTS, richEditorHtml,
  LIGHTBOX_JS, LIGHTBOX_HTML, TRANSLATE_JS, VIDEO_CAROUSEL_JS,
  ELEV_MODAL_HTML, ELEV_MODAL_JS,
  DELETE_CONFIRM_JS, COMMENTS_JS,
};
