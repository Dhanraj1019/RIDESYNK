(function () {
  "use strict";

  if (!window.SettingsModalWrapper || !window.SettingsProfileBus) return;

  const profile = window.settingsProfileData || {};
  const first = String(profile.firstname || "").trim();
  const last = String(profile.lastname || "").trim();
  const fullName = `${first} ${last}`.trim() || String(profile.username || "-");

  const modal = new window.SettingsModalWrapper("profileViewModal", {
    title: "Profile",
    onClose: () => {
      if (window.SettingsProfileState) {
        window.SettingsProfileState.isProfileViewOpen = false;
      }
    }
  });

  modal.setContent(`
    <div class="profile-view-grid">
      <div class="profile-view-row">
        <span class="profile-view-label">Username</span>
        <span class="profile-view-value">${profile.username || "-"}</span>
      </div>
      <div class="profile-view-row">
        <span class="profile-view-label">Full Name</span>
        <span class="profile-view-value">${fullName}</span>
      </div>
      <div class="profile-view-row">
        <span class="profile-view-label">Email</span>
        <span class="profile-view-value">${profile.email || "-"}</span>
      </div>
      <div class="profile-view-row">
        <span class="profile-view-label">Phone</span>
        <span class="profile-view-value">${profile.phonenumber || "-"}</span>
      </div>
      <div class="profile-view-row">
        <span class="profile-view-label">Vehical</span>
        <span class="profile-view-value">${profile.vehical || "-"}</span>
      </div>
    </div>
    <div class="profile-view-actions">
      <button type="button" class="btn-brand btn js-modal-edit-profile">Edit Profile</button>
      <button type="button" class="btn btn-light rounded-3 js-modal-close-profile">Close</button>
    </div>
  `);

  const editBtn = modal.bodyNode.querySelector(".js-modal-edit-profile");
  const closeBtn = modal.bodyNode.querySelector(".js-modal-close-profile");

  editBtn.addEventListener("click", () => {
    modal.close();
    if (window.SettingsProfileState) {
      window.SettingsProfileState.isProfileViewOpen = false;
      window.SettingsProfileState.isEditProfileOpen = true;
    }
    if (window.SettingsProfileBus && typeof window.SettingsProfileBus.openEditProfile === "function") {
      window.SettingsProfileBus.openEditProfile();
    }
  });

  closeBtn.addEventListener("click", () => {
    modal.close();
  });

  window.SettingsProfileBus.openProfileView = () => modal.open();
  window.SettingsProfileBus.closeProfileView = () => modal.close();
})();
