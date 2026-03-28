document.addEventListener("DOMContentLoaded", () => {
  const SELECTORS = {
    card: ".ride-card",
    tab: ".tab-item[data-tab]",
    allCount: "#allCount",
    upcomingCount: "#upcomingCount",
    completedCount: "#completedCount",
    canceledCount: "#canceledCount"
  };

  const cards = Array.from(document.querySelectorAll(SELECTORS.card));
  const tabs = Array.from(document.querySelectorAll(SELECTORS.tab));

  const countElements = {
    all: document.querySelector(SELECTORS.allCount),
    upcoming: document.querySelector(SELECTORS.upcomingCount),
    completed: document.querySelector(SELECTORS.completedCount),
    canceled: document.querySelector(SELECTORS.canceledCount)
  };

  const STATUS_ALIASES = {
    upcoming: "upcoming",
    completed: "completed",
    complete: "completed",
    canceled: "canceled",
    cancelled: "canceled"
  };

  const STATUS_PRIORITY = {
    upcoming: 1,
    completed: 2,
    canceled: 3
  };

  function normalizeStatus(value) {
    return String(value || "").trim().toLowerCase();
  }

  function toCanonicalStatus(value) {
    const normalized = normalizeStatus(value);
    return STATUS_ALIASES[normalized] || normalized;
  }

  function extractStatusFromBadge(card) {
    const badge = card.querySelector(".ride-badge");
    if (!badge) {
      return "";
    }

    const badgeTextStatus = toCanonicalStatus(badge.textContent);
    if (badgeTextStatus) {
      return badgeTextStatus;
    }

    const badgeClass = Array.from(badge.classList).find((className) => className.startsWith("badge-"));
    if (!badgeClass) {
      return "";
    }

    return toCanonicalStatus(badgeClass.replace("badge-", ""));
  }

  function getCardStatus(card) {
    const dataStatus = toCanonicalStatus(card.getAttribute("data-status"));
    if (dataStatus) {
      return dataStatus;
    }

    return extractStatusFromBadge(card);
  }

  function getCardDateValue(card) {
    const rawDate = card.getAttribute("data-date");
    const parsed = Date.parse(String(rawDate || "").trim());
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function getReorderContext(cardList) {
    if (cardList.length === 0) {
      return null;
    }

    const directParent = cardList[0].parentElement;
    const allShareDirectParent = Boolean(directParent) && cardList.every((card) => card.parentElement === directParent);

    if (allShareDirectParent) {
      return {
        container: directParent,
        getNodeToMove: (card) => card
      };
    }

    const wrapperParent = directParent ? directParent.parentElement : null;
    const allShareWrapperParent = Boolean(wrapperParent) && cardList.every((card) => {
      const parent = card.parentElement;
      return parent && parent.parentElement === wrapperParent;
    });

    if (allShareWrapperParent) {
      return {
        container: wrapperParent,
        getNodeToMove: (card) => card.parentElement
      };
    }

    return null;
  }

  function sortRideCards() {
    const reorderContext = getReorderContext(cards);
    if (!reorderContext) {
      return;
    }

    const sortableCards = cards.map((card, index) => ({
      card,
      index,
      status: getCardStatus(card),
      dateValue: getCardDateValue(card)
    }));

    sortableCards.sort((a, b) => {
      const priorityA = STATUS_PRIORITY[a.status] || Number.MAX_SAFE_INTEGER;
      const priorityB = STATUS_PRIORITY[b.status] || Number.MAX_SAFE_INTEGER;

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      if (a.dateValue !== b.dateValue) {
        return b.dateValue - a.dateValue;
      }

      return a.index - b.index;
    });

    sortableCards.forEach(({ card }) => {
      const nodeToMove = reorderContext.getNodeToMove(card);
      if (nodeToMove) {
        reorderContext.container.appendChild(nodeToMove);
      }
    });
  }

  function getCounts() {
    return cards.reduce(
      (acc, card) => {
        const status = getCardStatus(card);

        acc.all += 1;

        if (status === "upcoming") {
          acc.upcoming += 1;
        }

        if (status === "completed") {
          acc.completed += 1;
        }

        if (status === "canceled") {
          acc.canceled += 1;
        }

        return acc;
      },
      { all: 0, upcoming: 0, completed: 0, canceled: 0 }
    );
  }

  function updateCountUI() {
    const counts = getCounts();

    if (countElements.all) {
      countElements.all.textContent = String(counts.all);
    }

    if (countElements.upcoming) {
      countElements.upcoming.textContent = String(counts.upcoming);
    }

    if (countElements.completed) {
      countElements.completed.textContent = String(counts.completed);
    }

    if (countElements.canceled) {
      countElements.canceled.textContent = String(counts.canceled);
    }
  }

  function isCardVisibleForTab(cardStatus, tabKey) {
    if (tabKey === "all") {
      return true;
    }

    return cardStatus === tabKey;
  }

  function applyFilter(tabKey) {
    cards.forEach((card) => {
      const status = getCardStatus(card);
      const shouldShow = isCardVisibleForTab(status, tabKey);
      const cancelButton = card.querySelector(".cancel-btn");

      if (cancelButton && status !== "upcoming") {
        cancelButton.style.display = "none";
      }

      card.style.display = shouldShow ? "flex" : "none";
    });
  }

  function setActiveTab(selectedTab) {
    tabs.forEach((tab) => {
      const isActive = tab === selectedTab;
      tab.classList.toggle("active", isActive);
    });
  }

  function initializeTabs() {
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabKey = toCanonicalStatus(tab.dataset.tab);

        setActiveTab(tab);
        sortRideCards();
        applyFilter(tabKey || "all");
      });
    });
  }

  function initializeCanceledRideNavigationGuard() {
    cards.forEach((card) => {
      if (card.dataset.disableNav === "true") {
        card.addEventListener("click", (event) => {
          event.preventDefault();
        });
      }
    });
  }

  function initializeCancelModal() {
    const cancelModal = document.getElementById("cancelModal");
    const confirmCancelButton = document.getElementById("confirmCancel");
    const closeModalButton = document.getElementById("closeModal");

    if (!cancelModal || !confirmCancelButton || !closeModalButton) {
      return;
    }

    let activeCancelForm = null;
    let isSubmitting = false;

    function openModal(form) {
      activeCancelForm = form;
      cancelModal.classList.remove("hidden");
      cancelModal.classList.add("show");
      cancelModal.setAttribute("aria-hidden", "false");
      closeModalButton.focus();
    }

    function closeModal() {
      if (isSubmitting) {
        return;
      }
      cancelModal.classList.remove("show");
      cancelModal.classList.add("hidden");
      cancelModal.setAttribute("aria-hidden", "true");
      activeCancelForm = null;
    }

    document.addEventListener("click", (event) => {
      const cancelButton = event.target.closest(".cancel-btn");
      if (!cancelButton) {
        return;
      }

      const parentForm = cancelButton.closest("form");
      if (!parentForm || isSubmitting) {
        return;
      }

      event.preventDefault();
      openModal(parentForm);
    });

    closeModalButton.addEventListener("click", closeModal);

    cancelModal.addEventListener("click", (event) => {
      if (event.target === cancelModal) {
        closeModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && cancelModal.classList.contains("show")) {
        closeModal();
      }
    });

    confirmCancelButton.addEventListener("click", () => {
      if (!activeCancelForm || isSubmitting) {
        return;
      }

      isSubmitting = true;
      confirmCancelButton.disabled = true;
      closeModalButton.disabled = true;
      confirmCancelButton.textContent = "Canceling...";

      const cancelButton = activeCancelForm.querySelector(".cancel-btn");
      if (cancelButton) {
        cancelButton.disabled = true;
      }

      activeCancelForm.submit();
    });
  }

  function initializeStickyHeaderHeight() {
    const stickyHeader = document.querySelector(".sticky-header");
    const ridesListPage = document.querySelector(".rides-list-page");
    if (!stickyHeader || !ridesListPage) {
      return;
    }

    const applyStickyHeight = () => {
      ridesListPage.style.setProperty("--sticky-header-height", `${stickyHeader.offsetHeight}px`);
    };

    applyStickyHeight();
    window.addEventListener("resize", applyStickyHeight);
  }

  sortRideCards();
  updateCountUI();
  initializeTabs();
  initializeCanceledRideNavigationGuard();
  initializeCancelModal();
  initializeStickyHeaderHeight();
  applyFilter("all");
});