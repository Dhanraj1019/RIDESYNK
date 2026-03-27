// ── State ──────────────────────────────────────────────────
const addedPhones = new Set();
const addedIds    = new Set();
let   searchedUser = null;

const AVATAR_COLORS = ['av-1','av-2','av-3','av-4','av-5','av-6'];
let   colorIndex = 0;

function nextColor() {
  const c = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  colorIndex++;
  return c;
}

/* ============================================================
   SINGLE SOURCE OF TRUTH for DOM element id
   Strips EVERYTHING except digits
   e.g. '+91 98765 43210' → 'mem-919876543210'
   ============================================================ */
function phoneToId(phone) {
  return 'mem-' + String(phone).replace(/\D/g, '');
}

/* ============================================================
   SINGLE SOURCE OF TRUTH for phone key stored in Set
   Same stripping logic — so Set.has() always works
   ============================================================ */
function normalizePhone(phone) {
  return String(phone).replace(/\D/g, '');
}

/* ============================================================
   SEARCH
   ============================================================ */
async function doSearch() {
  const raw       = document.getElementById('phone-input').value.trim();
  const resultDiv = document.getElementById('search-result');
  const notFound  = document.getElementById('not-found');

  resultDiv.style.display = 'none';
  notFound.style.display  = 'none';
  searchedUser = null;

  if (!raw) { showToast('Please enter a phone number'); return; }

  const digits = raw.replace(/\D/g, '');
  if (digits.length < 6) { showToast('Enter at least 6 digits'); return; }

  setSearchLoading(true);

  try {
    const res  = await fetch(`/ridesync/rideroom/search-member?phone=${encodeURIComponent(digits)}`);
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('Non-JSON from server:', text);
      showToast('Server error — check terminal');
      return;
    }

    if (!res.ok || !data.success) {
      notFound.style.display = 'block';
      const msg = document.getElementById('not-found-msg');
      if (msg) msg.textContent = data.message || 'No user found';
      return;
    }

    const user   = data.data;
    searchedUser = user;

    // ── populate result card ──
    const av = document.getElementById('result-avatar');
    av.textContent = (user.firstname || '?')[0].toUpperCase();
    av.className   = 'mem-avatar av-3';

    document.getElementById('result-name').textContent =
      (user.firstname || '') + ' ' + (user.lastname || '');
    document.getElementById('result-phone').textContent =
      user.phonenumber || '';

    // ── check if already in list using NORMALIZED phone ──
    const addBtn = document.getElementById('add-result-btn');
    
    console.log(user)
    if (addedPhones.has(normalizePhone(user.phonenumber))) {
      setAddBtnAdded(addBtn);
    } else {
      setAddBtnReady(addBtn);
    }
    if (user.isDeleted || user.status !== "active") {
      addBtn.disabled = true;
      addBtn.textContent = "Cannot Add";
    } else {
      addBtn.disabled = false;
      addBtn.textContent = "Add";
    }
    resultDiv.style.display = 'block';

  } catch (err) {
    console.error('doSearch error:', err);
    showToast('Network error — please try again');
  } finally {
    setSearchLoading(false);
  }
}

/* ============================================================
   ADD FROM SEARCH RESULT CARD
   ============================================================ */
function addFromSearch() {
  if (!searchedUser) return;

  // use normalizePhone for consistent Set check
  if (addedPhones.has(normalizePhone(searchedUser.phonenumber))) {
    console.log('Already added — skipping');
    return;
  }

  addMemberToList(searchedUser);

  setAddBtnAdded(document.getElementById('add-result-btn'));
}

/* ============================================================
   ADD MEMBER TO LIST
   ============================================================ */
function addMemberToList(user) {
  const key = normalizePhone(user.phonenumber); // ← NORMALIZED key

  if (addedPhones.has(key)) {
    console.log('addMemberToList: already in Set, skipping');
    return;
  }

  // ── Track in Sets using NORMALIZED key ──
  addedPhones.add(key);
  addedIds.add(String(user._id));

  console.log('Added phone key:', key);
  console.log('addedPhones Set:', [...addedPhones]);

  const list  = document.getElementById('member-list');
  const color = nextColor();

  const item  = document.createElement('div');
  item.className      = 'member-item';
  item.id             = phoneToId(user.phonenumber); // 'mem-' + digits only
  item.dataset.phone  = key;                         // normalized digits only
  item.dataset.userId = String(user._id);

  const avatarLetter = (user.firstname || '?')[0].toUpperCase();
  const fullName     = ((user.firstname || '') + ' ' + (user.lastname || '')).trim();

  // Pass NORMALIZED phone to removeMember — no special chars
  item.innerHTML = `
    <div class="mem-avatar ${color}">${avatarLetter}</div>
    <div class="mem-info">
      <div class="mem-name">${fullName}</div>
      <div class="mem-phone">${user.phonenumber}</div>
    </div>
    <div class="mem-actions">
      <span class="role-badge role-member">Member</span>
      <button
        class="remove-btn"
        onclick="removeMember('${key}', '${user._id}')"
        title="Remove"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>`;

  item.style.opacity   = '0';
  item.style.transform = 'translateY(10px)';
  list.appendChild(item);

  requestAnimationFrame(() => {
    item.style.transition = 'opacity .25s, transform .25s';
    item.style.opacity    = '1';
    item.style.transform  = 'translateY(0)';
  });

  updateCount();
  showToast((user.firstname || 'User') + ' added to ride 🎉');
}

/* ============================================================
   REMOVE MEMBER
   phone param here is already NORMALIZED (digits only)
   because we pass `key` from addMemberToList above
   ============================================================ */
function removeMember(phone, userId) {
  // phone is already normalized digits — phoneToId just adds 'mem-' prefix
  const elemId = 'mem-' + phone;
  const item   = document.getElementById(elemId);

  console.log('removeMember called — phone:', phone, 'elemId:', elemId, 'found:', !!item);
  console.log('addedPhones before delete:', [...addedPhones]);

  if (!item) {
    console.error('ELEMENT NOT FOUND — id was:', elemId);
    return;
  }

  item.style.transition = 'opacity .2s, transform .2s';
  item.style.opacity    = '0';
  item.style.transform  = 'translateX(20px)';

  setTimeout(() => {
    item.remove();

    // Delete using exact same key that was added
    addedPhones.delete(phone);
    addedIds.delete(String(userId));

    console.log('addedPhones after delete:', [...addedPhones]);

    updateCount();

    // Re-enable Add button if this removed user matches current search result
    if (searchedUser) {
      const searchedKey = normalizePhone(searchedUser.phonenumber);
      console.log('searchedKey:', searchedKey, 'removed phone:', phone, 'match:', searchedKey === phone);

      if (searchedKey === phone) {
        setAddBtnReady(document.getElementById('add-result-btn'));
      }
    }
  }, 200);

  showToast('Member removed');
}

/* ============================================================
   CLEAR SEARCH UI
   ============================================================ */
function clearSearch() {
  document.getElementById('search-result').style.display = 'none';
  document.getElementById('not-found').style.display     = 'none';
  searchedUser = null;
}

/* ============================================================
   DONE — save all _ids to DB
   ============================================================ */
async function handleDone() {
  const parts   = window.location.pathname.split('/');
  const RIDE_ID = parts[parts.indexOf('rideroom') + 1];

  if (!RIDE_ID) {
    showToast('Done ✓');
    setTimeout(() => history.back(), 800);
    return;
  }

  if (addedIds.size === 0) {
    showToast('No new members added');
    setTimeout(() => history.back(), 800);
    return;
  }

  try {
    const res = await fetch(`/ridesync/rideroom/${RIDE_ID}/add-members`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userIds: Array.from(addedIds) })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.message || 'Failed to save members');
      return;
    }

    showToast('Members saved ✓');
    setTimeout(() => history.back(), 800);

  } catch (err) {
    console.error('handleDone error:', err);
    showToast('Network error');
  }
}

/* ============================================================
   UPDATE COUNT BADGES
   ============================================================ */
function updateCount() {
  const total = document.querySelectorAll('.member-item').length;
  const badge = document.getElementById('count-badge');
  const count = document.getElementById('done-count');
  if (badge) badge.textContent = total === 1 ? '1 Member' : total + ' Members';
  if (count) count.textContent = total;
}

/* ============================================================
   BUTTON STATE HELPERS
   ============================================================ */
function setAddBtnReady(btn) {
  if (!btn) return;
  btn.disabled         = false;
  btn.innerHTML        = '<i class="fa-solid fa-plus" style="margin-right:4px;font-size:.7rem;"></i>Add';
  btn.style.background = '';
  btn.classList.remove('added');
  btn.onclick          = addFromSearch;
}

function setAddBtnAdded(btn) {
  if (!btn) return;
  btn.disabled         = true;
  btn.innerHTML        = '<i class="fa-solid fa-check" style="margin-right:4px;font-size:.7rem;"></i>Added';
  btn.style.background = '#38bd67';
  btn.classList.add('added');
  btn.onclick          = null;
}

function setSearchLoading(on) {
  const btn = document.getElementById('search-btn');
  if (!btn) return;
  btn.disabled  = on;
  btn.innerHTML = on
    ? '<i class="fa-solid fa-spinner fa-spin"></i>'
    : '<i class="fa-solid fa-magnifying-glass" style="margin-right:5px;"></i>Search';
}

/* ============================================================
   TOAST
   ============================================================ */
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ============================================================
   ENTER KEY
   ============================================================ */
document.getElementById('phone-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
});