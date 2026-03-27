let confirmed = false;
let resetTimer = null;

function handleConfirm(btn) {
  if (!confirmed) {
    // First click — ask to confirm
    confirmed = true;
    btn.textContent = '⚠ Tap again to confirm';
    btn.style.background = '#E24B4A';
    btn.style.borderColor = '#E24B4A';
    btn.style.color = '#ffffff';

    // Auto-reset after 3 seconds if user doesn't confirm
    resetTimer = setTimeout(() => {
      confirmed = false;
      btn.textContent = 'Cancel ride';
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 3000);

  } else {
    // Second click — confirmed!
    clearTimeout(resetTimer);
    confirmed = false;
    btn.textContent = '✓ Cancelled';
    btn.style.background = '#dcfce7';
    btn.style.borderColor = '#86efac';
    btn.style.color = '#15803d';
    btn.disabled = true;

    // Reset button after 2 seconds
    setTimeout(() => {
      btn.textContent = 'Cancel ride';
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
      btn.disabled = false;
    }, 2000);
  }
}
