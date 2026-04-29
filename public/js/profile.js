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

  const statValues = document.querySelectorAll(".stat-value");

  statValues.forEach((value, index) => {
    const originalText = value.textContent.trim();
    const match = originalText.match(/^(\d+(?:\.\d+)?)(.*)$/);

    if (!match) return;

    const target = Number(match[1]);
    const suffix = match[2] || "";
    const decimals = match[1].includes(".") ? match[1].split(".")[1].length : 0;
    const duration = 850;
    const delay = 80 + index * 70;

    value.textContent = `${decimals ? "0.0" : "0"}${suffix}`;

    setTimeout(() => {
      const startTime = performance.now();

      function tick(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = target * eased;
        const displayValue = decimals ? current.toFixed(decimals) : Math.round(current);

        value.textContent = `${displayValue}${suffix}`;

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          value.textContent = originalText;
        }
      }

      requestAnimationFrame(tick);
    }, delay);
  });
});
