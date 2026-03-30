document.addEventListener("DOMContentLoaded", () => {
  const cards = document.querySelectorAll(".profile-header-card, .details-card, .stat-card");
  cards.forEach((card, index) => {
    card.style.opacity = "0";
    card.style.transform = "translateY(8px)";
    card.style.transition = "opacity 280ms ease, transform 280ms ease";
    setTimeout(() => {
      card.style.opacity = "1";
      card.style.transform = "translateY(0)";
    }, 40 * index);
  });
});
