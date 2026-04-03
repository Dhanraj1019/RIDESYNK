
 
  // Delete confirm enable
  const deleteConfirmInput = document.getElementById('deleteConfirmInput');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  if (deleteConfirmInput && confirmDeleteBtn) {
    deleteConfirmInput.addEventListener('input', function(){
      confirmDeleteBtn.disabled = this.value.trim().toUpperCase() !== 'DELETE';
    });
  }
 
  // Toast helper
  function showToast(msg) {
    document.getElementById('toastMsg').textContent = msg;
    const toastEl = document.getElementById('appToast');
    bootstrap.Modal.getInstance(document.querySelector('.modal.show'))?.hide();
    new bootstrap.Toast(toastEl, {delay:2500}).show();
  }


  class ModalWrapper {
    constructor(id, options = {}) {
      this.id = id;
      this.title = options.title || '';
      this.onClose = options.onClose || (() => {});
      this.backdrop = null;
      this.panel = null;
      this.lastFocused = null;
      this.handleKeyDown = this.handleKeyDown.bind(this);
      this.build();
    }

    build() {
      const root = document.createElement('div');
      root.className = 'settings-modal-backdrop';
      root.id = this.id;
      root.setAttribute('aria-hidden', 'true');
      root.innerHTML = `
        <div class="settings-modal-panel" role="dialog" aria-modal="true" aria-label="${this.title}">
          <div class="settings-modal-head">
            <h3>${this.title}</h3>
            <button type="button" class="settings-modal-close" aria-label="Close">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <div class="settings-modal-body"></div>
        </div>
      `;

      document.body.appendChild(root);
      this.backdrop = root;
      this.panel = root.querySelector('.settings-modal-panel');
      this.bodyNode = root.querySelector('.settings-modal-body');

      root.addEventListener('click', (event) => {
        if (event.target === root) {
          this.close();
        }
      });

      const closeBtn = root.querySelector('.settings-modal-close');
      closeBtn.addEventListener('click', () => this.close());
    }

    setContent(html) {
      this.bodyNode.innerHTML = html;
    }

    open() {
      this.lastFocused = document.activeElement;
      this.backdrop.classList.add('open');
      this.backdrop.setAttribute('aria-hidden', 'false');
      document.body.classList.add('settings-modal-open');
      document.addEventListener('keydown', this.handleKeyDown);
      this.focusFirst();
    }

    close() {
      this.backdrop.classList.remove('open');
      this.backdrop.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('settings-modal-open');
      document.removeEventListener('keydown', this.handleKeyDown);
      if (this.lastFocused && typeof this.lastFocused.focus === 'function') {
        this.lastFocused.focus();
      }
      this.onClose();
    }

    focusableNodes() {
      return Array.from(
        this.panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.hasAttribute('disabled'));
    }

    focusFirst() {
      const nodes = this.focusableNodes();
      if (nodes.length) {
        nodes[0].focus();
      }
    }

    handleKeyDown(event) {
      if (!this.backdrop.classList.contains('open')) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
        return;
      }

      if (event.key !== 'Tab') return;
      const nodes = this.focusableNodes();
      if (!nodes.length) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  const uiState = {
    isProfileViewOpen: false,
    isEditProfileOpen: false
  };

  const settingsBus = {
    openProfileView: null,
    closeProfileView: null,
    openEditProfile: null,
    closeEditProfile: null
  };

  function setState(nextState) {
    uiState.isProfileViewOpen = Boolean(nextState.isProfileViewOpen);
    uiState.isEditProfileOpen = Boolean(nextState.isEditProfileOpen);
  }

  function wireSettingsTriggers() {
    const openProfileBtns = document.querySelectorAll('.js-open-profile-view');
    const openEditBtns = document.querySelectorAll('.js-open-edit-profile');

    openProfileBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof settingsBus.closeEditProfile === 'function') {
          settingsBus.closeEditProfile();
        }
        setState({ isProfileViewOpen: true, isEditProfileOpen: false });
        if (typeof settingsBus.openProfileView === 'function') {
          settingsBus.openProfileView();
        }
      });
    });

    openEditBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof settingsBus.closeProfileView === 'function') {
          settingsBus.closeProfileView();
        }
        setState({ isProfileViewOpen: false, isEditProfileOpen: true });
        if (typeof settingsBus.openEditProfile === 'function') {
          settingsBus.openEditProfile();
        }
      });
    });
  }

  window.SettingsModalWrapper = ModalWrapper;
  window.SettingsProfileState = uiState;
  window.SettingsProfileBus = settingsBus;
  window.showToast = showToast;

  wireSettingsTriggers();



  documet.getElementById("changepasswordbtn").addEventListener("click",(e)=>{
    
  })