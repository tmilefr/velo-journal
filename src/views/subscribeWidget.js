// ── Abonnement e-mail : icône 🔔 dans le header + fenêtre modale ──
// Affiché uniquement sur les pages accessibles après connexion :
// rien du site n'est proposé à qui n'a pas le mot de passe.
// L'abonnement lui-même ne retient que l'adresse e-mail.
const { MAIL_ENABLED } = require('../config');

// Bouton cloche, inséré dans le header à côté du menu
function renderSubscribeBell(csrf) {
  if (!MAIL_ENABLED || !csrf) return '';
  return `<button class="sub-bell" id="subBell" type="button" title="Recevoir les nouvelles étapes par e-mail" aria-label="S'abonner par e-mail">🔔</button>`;
}

// Fenêtre modale + script (ouverture, envoi, mémorisation locale)
function renderSubscribeModal(csrf) {
  if (!MAIL_ENABLED || !csrf) return '';
  return `<div class="sub-modal" id="subModal">
      <div class="sub-box">
        <div class="sub-head">
          <h3>🔔 Nouvelles étapes par e-mail</h3>
          <button class="sub-close" id="subClose" type="button" aria-label="Fermer">✕</button>
        </div>
        <div class="sub-body">
          <p class="sub-intro">Laissez votre adresse pour recevoir un e-mail à chaque nouvelle étape publiée. Un e-mail de confirmation vous sera envoyé — et chaque message contient un lien de désinscription.</p>
          <form class="sub-form" id="subForm">
            <input type="email" id="subEmail" placeholder="votre@email.fr" autocomplete="email" required>
            <button type="submit" class="sub-btn">S'abonner</button>
          </form>
          <div class="sub-msg" id="subMsg" hidden></div>
          <p class="sub-done-hint" id="subDoneHint" hidden>✅ Un abonnement a déjà été enregistré depuis cet appareil.</p>
        </div>
      </div>
    </div>
    <script>
    (function(){
      var bell=document.getElementById('subBell');
      var modal=document.getElementById('subModal');
      if(!bell||!modal)return;
      var form=document.getElementById('subForm');
      var msg=document.getElementById('subMsg');
      var email=document.getElementById('subEmail');
      var hint=document.getElementById('subDoneHint');
      var KEY='vj_sub_email';
      function refreshSaved(){
        var saved=null; try{saved=localStorage.getItem(KEY);}catch(e){}
        if(saved){ hint.hidden=false; if(!email.value)email.value=saved; }
      }
      function open(){ modal.classList.add('open'); msg.hidden=true; refreshSaved(); setTimeout(function(){email.focus();},60); }
      function close(){ modal.classList.remove('open'); }
      bell.addEventListener('click',open);
      document.getElementById('subClose').addEventListener('click',close);
      modal.addEventListener('click',function(e){ if(e.target===modal)close(); });
      document.addEventListener('keydown',function(e){ if(e.key==='Escape')close(); });
      form.addEventListener('submit',function(e){
        e.preventDefault();
        var btn=form.querySelector('.sub-btn');
        btn.disabled=true; btn.textContent='Envoi…';
        function done(){ btn.disabled=false; btn.textContent="S'abonner"; }
        fetch('/subscribe',{
          method:'POST',
          headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
          body:'_csrf=${csrf}&email='+encodeURIComponent(email.value)
        })
        .then(function(r){return r.json();})
        .then(function(d){
          msg.textContent=d.message||'Erreur inattendue.';
          msg.className='sub-msg '+(d.ok?'ok':'err'); msg.hidden=false;
          if(d.ok){
            try{localStorage.setItem(KEY,email.value.trim().toLowerCase());}catch(e){}
            refreshSaved();
          }
          done();
        })
        .catch(function(){
          msg.textContent='Erreur réseau — réessayez.';
          msg.className='sub-msg err'; msg.hidden=false;
          done();
        });
      });
    })();
    </script>`;
}

module.exports = { renderSubscribeBell, renderSubscribeModal };
