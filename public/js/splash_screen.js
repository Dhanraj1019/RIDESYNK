
    const content = document.getElementById("splash-content");

    const t1 = setTimeout(() => {
      content.classList.remove("entering");
      content.classList.add("exiting");
    }, 2000);

    const t2 = setTimeout(() => {
      window.location.replace("/login");
    }, 2500);

    window.addEventListener("pagehide", () => {
      clearTimeout(t1);
      clearTimeout(t2);
    });
