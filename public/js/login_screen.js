

  // ── State ──
  let isSignup       = false;
  let showPassword   = false;
  let emailVerified  = false;
  let loading        = false;

  // ── Element refs ──
  const headingTitle  = document.getElementById("heading-title");
  const headingSub    = document.getElementById("heading-sub");
  const fieldName     = document.getElementById("field-name");
  const fullNameInput = document.getElementById("fullName");
  const emailInput    = document.getElementById("email");
  const emailCheck    = document.getElementById("email-check");
  const verifyBtn     = document.getElementById("verify-btn");
  const passwordInput = document.getElementById("password");
  const togglePw      = document.getElementById("toggle-pw");
  const iconEye       = document.getElementById("icon-eye");
  const iconEyeOff    = document.getElementById("icon-eye-off");
  const submitBtn     = document.getElementById("submit-btn");
  const toggleLabel   = document.getElementById("toggle-label");
  const toggleModeBtn = document.getElementById("toggle-mode-btn");
  const form          = document.getElementById("auth-form");

  // ── Render UI based on state ──
  function render() {
    // Heading
    headingTitle.textContent = isSignup ? "Create Account" : "Welcome Back";
    headingSub.textContent   = isSignup
      ? "Join Ridesynk and coordinate your group rides."
      : "Sign in to continue managing your rides.";

    // Full name field
    fieldName.classList.toggle("hidden", !isSignup);
    fullNameInput.required = isSignup;

    // Verify email
    verifyBtn.classList.toggle("hidden",   !isSignup || emailVerified);
    emailCheck.classList.toggle("hidden",  !isSignup || !emailVerified);

    // Submit label
    submitBtn.textContent = loading
      ? "Please wait..."
      : isSignup ? "Create Account" : "Sign In";
    submitBtn.disabled = loading;

    // Toggle row
    toggleLabel.textContent  = isSignup ? "Already have an account?" : "Don't have an account?";
    toggleModeBtn.textContent = isSignup ? " Sign In" : " Sign Up";
  }

  // ── Toggle sign-in / sign-up ──
  toggleModeBtn.addEventListener("click", () => {
    isSignup      = !isSignup;
    emailVerified = false;
    render();
  });

  // ── Show / hide password ──
  togglePw.addEventListener("click", () => {
    showPassword = !showPassword;
    passwordInput.type = showPassword ? "text" : "password";
    iconEye.classList.toggle("hidden",    showPassword);
    iconEyeOff.classList.toggle("hidden", !showPassword);
  });

  // ── Email input change → reset verified ──
  emailInput.addEventListener("input", () => {
    emailVerified = false;
    render();
  });

  // ── Verify email ──
  verifyBtn.addEventListener("click", () => {
    const val = emailInput.value.trim();
    if (val && val.includes("@")) {
      emailVerified = true;
      showToast("Email verified", "You can proceed.");
    } else {
      showToast("Enter a valid email first", "", true);
    }
    render();
  });

  // ── Form submit ──
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (loading) return;
    loading = true;
    render();

    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    const name     = fullNameInput.value.trim();

    try {
      // ── Replace these blocks with your real auth calls ──
      await fakeAuth(isSignup, email, password, name);

      if (isSignup) {
        showToast("Account created successfully!", "Please sign in to continue.");
        isSignup      = false;
        passwordInput.value = "";
        fullNameInput.value = "";
        emailVerified = false;
      } else {
        // Successful login → redirect
        window.location.replace("/home");
      }
    } catch (err) {
      showToast("Error", err.message || "Something went wrong", true);
    } finally {
      loading = false;
      render();
    }
  });

  // ── Fake auth stub (replace with real Supabase / API calls) ──
  function fakeAuth(signup, email, password, name) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (!email || !password) return reject(new Error("All fields are required."));
        resolve();
      }, 800);
    });
  }

  // ── Simple toast ──
  function showToast(title, desc = "", isError = false) {
    const existing = document.querySelector(".rs-toast");
    if (existing) existing.remove();

    const t = document.createElement("div");
    t.className = "rs-toast";
    t.style.cssText = `
      position:fixed; bottom:1.5rem; left:50%; transform:translateX(-50%);
      background:${isError ? "#dc2626" : "#111"};
      color:#fff; padding:0.6rem 1.2rem; border-radius:8px;
      font-size:0.8rem; font-weight:500; z-index:9999;
      box-shadow:0 4px 16px rgba(0,0,0,0.2);
      animation:fadeIn 0.25s ease;
      white-space:nowrap;
    `;
    t.textContent = desc ? `${title} — ${desc}` : title;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ── Init ──
  render();
