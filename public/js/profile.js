
  const items = [
    { label: "My Bike",       value: "Ducati Monster 821" },
    { label: "Phone",         value: "+1 555-0100"        },
    { label: "Member Since",  value: "October 2024"       },
    { label: "Member ID",     value: "RS-2024-0001"       },
  ];

  const chevron = `<svg class="chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16"
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>`;

  const list = document.getElementById("info-list");

  items.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "info-row";
    row.style.animationDelay = `${i * 0.04}s`;
    row.innerHTML = `
      <div>
        <p class="info-row-label">${item.label}</p>
        <p class="info-row-value">${item.value}</p>
      </div>
      ${chevron}
    `;
    list.appendChild(row);
  });
