const form = document.querySelector(".signupform");
const password1 = document.querySelector(".password1");
const password2 = document.querySelector(".password2");
const errorBox = document.getElementById("pass-error");

form.addEventListener("submit", (e) => {
    if (password1.value !== password2.value) {
        e.preventDefault();

        errorBox.classList.remove("hidden");
        requestAnimationFrame(() => {
            errorBox.classList.add("show");
        });
    }
});