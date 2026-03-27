  // Language list
  const langs = ['English','हिन्दी (Hindi)','Español','Français','العربية','বাংলা (Bengali)','Português','Русский'];
  let selectedLang = 'English';
  const langList = document.getElementById('langList');
  langs.forEach(l => {
    const btn = document.createElement('button');
    btn.className = 'menu-item';
    btn.style.borderRadius = '0';
    btn.innerHTML = `<div class="item-body"><p class="item-title">${l}</p></div>
      <span class="item-end">${l===selectedLang?'<i class="bi bi-check2" style="color:var(--brand);font-size:1.1rem;"></i>':''}</span>`;
    btn.onclick = () => {
      selectedLang = l;
      langList.innerHTML = '';
      langs.forEach(x => langList.appendChild(buildLangBtn(x)));
      showToast(`Language set to ${l}`);
    };
    langList.appendChild(btn);
  });
 
  function buildLangBtn(l) {
    const btn = document.createElement('button');
    btn.className = 'menu-item';
    btn.style.borderRadius = '0';
    btn.innerHTML = `<div class="item-body"><p class="item-title">${l}</p></div>
      <span class="item-end">${l===selectedLang?'<i class="bi bi-check2" style="color:var(--brand);font-size:1.1rem;"></i>':''}</span>`;
    btn.onclick = () => {
      selectedLang = l;
      langList.innerHTML = '';
      langs.forEach(x => langList.appendChild(buildLangBtn(x)));
      showToast(`Language set to ${l}`);
    };
    return btn;
  }
 
  // Delete confirm enable
  document.getElementById('deleteConfirmInput').addEventListener('input', function(){
    document.getElementById('confirmDeleteBtn').disabled = this.value.trim() !== 'DELETE';
  });
 
  // Toast helper
  function showToast(msg) {
    document.getElementById('toastMsg').textContent = msg;
    const toastEl = document.getElementById('appToast');
    bootstrap.Modal.getInstance(document.querySelector('.modal.show'))?.hide();
    new bootstrap.Toast(toastEl, {delay:2500}).show();
  }
 
  // Dark mode toggle (preview)
  document.getElementById('darkToggle').addEventListener('change', function(){
    document.body.style.background = this.checked ? '#12121A' : 'var(--bg)';
    document.querySelectorAll('.menu-group, .profile-card, .signout-btn, .modal-content').forEach(el=>{
      el.style.background = this.checked ? '#1E1E2A' : '';
      el.style.color = this.checked ? '#fff' : '';
    });
  });