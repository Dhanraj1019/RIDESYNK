(function () {
  "use strict";

  if (!window.SettingsModalWrapper || !window.SettingsProfileBus) return;

  const profile = window.settingsProfileData || {};
  const action = profile.updateAction || "/ridesync/user?_method=PATCH";

  const modal = new window.SettingsModalWrapper("editProfileModalCustom", {
    title: "Edit Profile",
    onClose: () => {
      if (window.SettingsProfileState) {
        window.SettingsProfileState.isEditProfileOpen = false;
      }
    }
  });

  modal.setContent(`
    <form action="${action}" method="POST" class="settings-edit-form" novalidate>
      <div class="mb-3">
        <label class="form-label">Username</label>
        <input type="text" class="form-control" name="update[username]" value="${profile.username || ""}" placeholder="Enter username">
      </div>
      <div class="mb-3">
        <label class="form-label">First Name</label>
        <input type="text" class="form-control" name="update[firstname]" value="${profile.firstname || ""}" placeholder="Enter first name">
      </div>
      <div class="mb-3">
        <label class="form-label">Last Name</label>
        <input type="text" class="form-control" name="update[lastname]" value="${profile.lastname || ""}" placeholder="Enter last name">
      </div>
      <div class="mb-3">
        <label class="form-label">Email</label>
        <input type="email" class="form-control" name="update[email]" value="${profile.email || ""}" placeholder="Enter email">
      </div>
      <div class="mb-3">
        <label class="form-label">Phone</label>
        <input type="tel" class="form-control" name="update[phonenumber]" value="${profile.phonenumber || ""}" placeholder="Enter phone number">
      </div>
      <div class="mb-0">
        <label class="form-label">Vehical</label>
        <input type="text" class="form-control" name="update[vehical]" value="${profile.vehical || ""}" placeholder="Enter vehical">
      </div>
      <div class="profile-view-actions settings-edit-actions">
        <button type="submit" class="btn-brand btn">Save Changes</button>
        <button type="button" class="btn btn-light rounded-3 js-modal-cancel-edit">Cancel</button>
      </div>
    </form>
  `);

  const cancelBtn = modal.bodyNode.querySelector(".js-modal-cancel-edit");
  cancelBtn.addEventListener("click", () => {
    modal.close();
  });

  window.SettingsProfileBus.openEditProfile = () => modal.open();
  window.SettingsProfileBus.closeEditProfile = () => modal.close();
})();
