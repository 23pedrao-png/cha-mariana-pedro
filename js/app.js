(function () {
  const api = window.SiteAPI;
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  const state = {
    event: null,
    pendingGift: null,
    pendingMethod: "pix",
    lastPayload: "",
    lastGiftPayload: "",
  };

  const giftGrid = document.getElementById("gift-grid");
  const toastEl = document.getElementById("toast");
  const pixModal = document.getElementById("modal-pix");
  const confirmModal = document.getElementById("modal-confirm");
  let toastTimer;

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2800);
  }

  function setText(selector, value, isHtml) {
    document.querySelectorAll(selector).forEach((el) => {
      if (isHtml) el.innerHTML = value;
      else el.textContent = value;
    });
  }

  function openModal(modal) {
    modal.hidden = false;
    const focusable = modal.querySelector("input, button");
    if (focusable) focusable.focus();
  }

  function closeModal(modal) {
    if (modal) modal.hidden = true;
    else {
      pixModal.hidden = true;
      confirmModal.hidden = true;
    }
  }

  function pixOptions(extra) {
    const pix = state.event?.pix || {};
    return {
      key: pix.key,
      name: pix.recipientName || state.event?.couple?.names,
      city: pix.city || state.event?.venue?.city,
      ...extra,
    };
  }

  async function renderQr(imgSelector, payload) {
    const url = await window.PixBR.toDataUrl(payload);
    document.querySelectorAll(imgSelector).forEach((img) => { img.src = url; });
  }

  async function refreshCashQr() {
    try {
      state.lastPayload = window.PixBR.buildPayload(pixOptions());
      await renderQr("[data-pix-qr]", state.lastPayload);
    } catch (err) {
      console.warn(err);
    }
  }

  function startCountdown(iso) {
    const root = document.getElementById("countdown");
    const target = new Date(iso).getTime();
    const daysEl = root.querySelector("[data-days]");
    const hoursEl = root.querySelector("[data-hours]");
    const minutesEl = root.querySelector("[data-minutes]");
    const secondsEl = root.querySelector("[data-seconds]");

    function tick() {
      const diff = target - Date.now();
      if (diff <= 0) {
        root.innerHTML = '<p class="hero-date">É hoje! A celebração começou.</p>';
        return;
      }
      const total = Math.floor(diff / 1000);
      daysEl.textContent = Math.floor(total / 86400);
      hoursEl.textContent = Math.floor((total % 86400) / 3600);
      minutesEl.textContent = Math.floor((total % 3600) / 60);
      secondsEl.textContent = total % 60;
    }
    tick();
    setInterval(tick, 1000);
  }

  function fillEvent(event) {
    const { couple, event: ev, venue, copy, pix } = event;
    document.title = `${ev.title} · ${couple.names}`;
    setText("[data-event-title]", ev.title);
    setText("[data-couple-names]", couple.names);
    setText("[data-hero-date]", `${ev.weekdayDisplay}, ${ev.dateDisplay} · ${ev.timeDisplay}`);
    setText("[data-hero-lead]", copy.heroSubtitle);
    setText("[data-date-full]", `${ev.weekdayDisplay}, ${ev.dateDisplay}`);
    setText("[data-time-full]", `Às ${ev.timeDisplay}`);
    setText("[data-venue-name]", venue.name);
    setText("[data-venue-address]", `${venue.street} — ${venue.neighborhood}<br>${venue.city} — ${venue.state}`, true);
    setText("[data-gifts-intro]", copy.giftsIntro);
    setText("[data-pix-intro]", copy.pixIntro);
    setText("[data-pix-key], [data-modal-key]", pix.key);
    setText("[data-pix-notice], [data-modal-notice]", pix.isPlaceholder ? copy.pixPlaceholderNotice : "");

    document.querySelectorAll("[data-pix-badge]").forEach((el) => {
      el.hidden = !pix.isPlaceholder;
    });
    document.querySelectorAll("[data-maps-link]").forEach((a) => { a.href = venue.googleMapsUrl; });
    document.querySelectorAll("[data-waze-link]").forEach((a) => { a.href = venue.wazeUrl; });
    const iframe = document.getElementById("mapa");
    if (iframe && venue.mapsEmbedUrl) iframe.src = venue.mapsEmbedUrl;

    const banner = document.getElementById("preview-banner");
    if (banner) banner.hidden = !api.isMock();

    startCountdown(ev.datetimeISO);
    renderGifts(event.gifts);
    refreshCashQr();
  }

  function renderGifts(gifts) {
    giftGrid.innerHTML = "";
    gifts.forEach((gift) => {
      const card = document.createElement("article");
      card.className = "gift-card" + (gift.purchased ? " is-purchased" : "");
      card.dataset.id = gift.id;
      card.innerHTML = `
        <div class="gift-image-wrap">
          <img src="${gift.image}" alt="${gift.name}" />
          ${gift.purchased ? '<span class="ribbon">Comprado ✓</span>' : ""}
        </div>
        <div class="gift-body">
          <h3>${gift.name}</h3>
          <p class="gift-desc">${gift.description || ""}</p>
          <p class="gift-price">${money.format(gift.price)}</p>
          ${gift.purchased ? `<p class="purchased-by">Presenteado por ${escapeHtml(gift.purchasedBy || "alguém especial")}</p>` : `
            <div class="gift-actions">
              <button class="btn btn-primary" type="button" data-action="pix"><span class="btn-label-full">Presentear via Pix</span><span class="btn-label-short">Pix</span></button>
              <a class="btn btn-secondary" data-action="store" href="${gift.storeUrl}" target="_blank" rel="noopener noreferrer"><span class="btn-label-full">Comprar na loja</span><span class="btn-label-short">Loja</span></a>
              <button class="gift-confirm-link" type="button" data-action="confirm"><span class="btn-label-full">Já comprei / Já enviei o Pix</span><span class="btn-label-short">Já comprei</span></button>
            </div>
          `}
        </div>
      `;
      if (!gift.purchased) {
        card.querySelector('[data-action="pix"]').addEventListener("click", () => openPixModal(gift));
        card.querySelector('[data-action="store"]').addEventListener("click", () => {
          state.pendingGift = gift;
          state.pendingMethod = "store";
        });
        card.querySelector('[data-action="confirm"]').addEventListener("click", () => openConfirmModal(gift, "store"));
      }
      giftGrid.appendChild(card);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function openPixModal(gift) {
    state.pendingGift = gift;
    state.pendingMethod = "pix";
    pixModal.querySelector("#pix-modal-title").textContent = gift.name;
    pixModal.querySelector("[data-modal-price]").textContent = money.format(gift.price);
    try {
      state.lastGiftPayload = window.PixBR.buildPayload(pixOptions({
        amount: gift.price,
        description: gift.name,
        txid: gift.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***",
      }));
      await renderQr("[data-modal-qr]", state.lastGiftPayload);
    } catch (err) {
      console.warn(err);
    }
    openModal(pixModal);
  }

  function openConfirmModal(gift, method) {
    state.pendingGift = gift;
    state.pendingMethod = method || state.pendingMethod || "pix";
    confirmModal.querySelector("#confirm-modal-title").textContent = `Confirmar: ${gift.name}`;
    document.getElementById("confirm-error").hidden = true;
    confirmModal.querySelector("input[name=name]").value = "";
    closeModal(pixModal);
    openModal(confirmModal);
  }

  async function copyText(text, successMessage) {
    if (!text) return showToast("Nada para copiar ainda.");
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
    } catch {
      showToast("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  document.querySelectorAll("[data-copy-pix]").forEach((btn) => {
    btn.addEventListener("click", () => copyText(state.event?.pix?.key || "", "Chave Pix copiada."));
  });
  document.querySelectorAll("[data-copy-brcode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const payload = btn.closest("#modal-pix") ? state.lastGiftPayload : state.lastPayload;
      copyText(payload, "Código Pix copiado. Cole no app do banco.");
    });
  });
  document.querySelectorAll("[data-modal-copy]").forEach((btn) => {
    btn.addEventListener("click", () => copyText(state.event?.pix?.key || "", "Chave Pix copiada."));
  });
  document.querySelector("[data-modal-confirm]").addEventListener("click", () => {
    if (state.pendingGift) openConfirmModal(state.pendingGift, "pix");
  });
  document.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", () => closeModal());
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  document.getElementById("confirm-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("confirm-error");
    const name = new FormData(e.target).get("name").toString().trim();
    if (!state.pendingGift) return;
    try {
      const result = await api.claimGift(state.pendingGift.id, { name, method: state.pendingMethod });
      const gifts = state.event.gifts.map((g) => (g.id === result.gift.id ? result.gift : g));
      state.event.gifts = gifts;
      renderGifts(gifts);
      closeModal();
      showToast("Presente marcado como comprado. Obrigado!");
    } catch (err) {
      if (err.status === 409 && err.data?.gift) {
        const gifts = state.event.gifts.map((g) => (g.id === err.data.gift.id ? err.data.gift : g));
        state.event.gifts = gifts;
        renderGifts(gifts);
      }
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  document.getElementById("rsvp-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("rsvp-error");
    errorEl.hidden = true;
    const form = e.target;
    const payload = {
      name: form.name.value.trim(),
      guests: Number(form.guests.value),
      attending: form.attending.value === "true",
      message: form.message.value.trim(),
    };
    try {
      const result = await api.submitRsvp(payload);
      form.hidden = true;
      const success = document.getElementById("rsvp-success");
      const text = document.getElementById("rsvp-success-text");
      text.textContent = result.rsvp.attending
        ? `Obrigado, ${result.rsvp.name}! Registramos a presença de ${result.rsvp.guests} ${result.rsvp.guests === 1 ? "pessoa" : "pessoas"}.`
        : `Obrigado, ${result.rsvp.name}! Sentiremos sua falta, mas agradecemos por avisar.`;
      success.hidden = false;
      success.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  toggle.addEventListener("click", () => {
    const open = header.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  });
  document.querySelectorAll(".site-nav a").forEach((a) => {
    a.addEventListener("click", () => {
      header.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });

  api.getEvent().then((event) => {
    state.event = event;
    fillEvent(event);
  }).catch(() => {
    showToast("Não foi possível carregar os dados do evento.");
  });
})();
