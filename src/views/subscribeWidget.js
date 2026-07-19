// ── Widget d'abonnement e-mail (bandeau 🔔 + formulaire inline) ──
// Affiché uniquement sur les pages accessibles après connexion :
// rien du site n'est proposé à qui n'a pas le mot de passe.
// L'abonnement lui-même ne retient que l'adresse e-mail.
const { MAIL_ENABLED } = require('../config');

function renderSubscribeWidget(csrf) {
  if (!MAIL_ENABLED || !csrf) return '';
  return `<div class="sub-strip" id="subStrip">
      <button class="sub-toggle" id="subToggle" type="button">🔔 <span id="subToggleLbl">Être prévenu des nouvelles étapes par e-mail</span></button>
      <form class="sub-form" id="subForm" hidden>
        <input type="email" id="subEmail" placeholder="votre@email.fr" autocomplete="email" required>
        <button type="submit" class="sub-btn">S'abonner</button>
      </form>
      <div class="sub-msg" id="subMsg" hidden></div>
    </div>
    <script>
    (function(){
      var strip=document.getElementById('subStrip'); if(!strip)return;
      var toggle=document.getElementById('subToggle');
      var lbl=document.getElementById('subToggleLbl');
      var form=document.getElementById('subForm');
      var msg=document.getElementById('subMsg');
      var email=document.getElementById('subEmail');
      var KEY='vj_sub_email';
      function markDone(){ lbl.textContent='Abonné aux nouvelles étapes ✔'; toggle.classList.add('sub-done'); }
      var saved=null; try{saved=localStorage.getItem(KEY);}catch(e){}
      if(saved){ markDone(); if(!email.value)email.value=saved; }
      toggle.addEventListener('click',function(){
        form.hidden=!form.hidden; msg.hidden=true;
        if(!form.hidden)email.focus();
      });
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
            form.hidden=true;
            try{localStorage.setItem(KEY,email.value.trim().toLowerCase());}catch(e){}
            markDone();
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

module.exports = { renderSubscribeWidget };
