(() => {
  const { MailLabel } = globalThis;
  const keys = MailLabel.STORAGE_KEYS;

  const els = {
    empty: document.getElementById("sender-empty"),
    error: document.getElementById("sender-error"),
    card: document.getElementById("sender-card"),
    name: document.getElementById("sender-name"),
    email: document.getElementById("sender-email"),
    assigned: document.getElementById("sender-labels"),
    copyBtn: document.getElementById("copy-btn"),
    copyStatus: document.getElementById("copy-status"),
    form: document.getElementById("new-label-form"),
    input: document.getElementById("new-label"),
    hint: document.getElementById("label-hint"),
    list: document.getElementById("label-list"),
  };

  let state = {
    currentSelection: null,
    labels: [],
    assignments: {},
  };

  function currentEmail() {
    const selection = state.currentSelection;
    if (!selection || selection.status !== "ok" || !selection.email) return null;
    return MailLabel.emailKey(selection.email);
  }

  function setCopyStatus(text) {
    els.copyStatus.hidden = !text;
    els.copyStatus.textContent = text || "";
  }

  function renderSender() {
    const selection = state.currentSelection;
    els.empty.hidden = Boolean(selection);
    els.error.hidden = true;
    els.card.hidden = true;
    els.copyBtn.disabled = true;
    setCopyStatus("");

    if (!selection) return;

    if (selection.status === "error" || !selection.email) {
      els.error.hidden = false;
      els.error.textContent =
        selection.message || "Could not read sender email from this row";
      return;
    }

    els.card.hidden = false;
    els.name.hidden = !selection.name;
    els.name.textContent = selection.name || "";
    els.email.textContent = selection.email;
    els.copyBtn.disabled = false;
    const assignedNames = (state.assignments[MailLabel.emailKey(selection.email)] || [])
      .map((id) => state.labels.find((label) => label.id === id))
      .filter(Boolean)
      .map((label) => label.name);
    els.assigned.textContent = assignedNames.length
      ? "Labels: " + assignedNames.join(", ")
      : "No labels on this sender.";
  }

  function renderLabels() {
    const email = currentEmail();
    const assigned = new Set(email ? state.assignments[email] || [] : []);
    els.list.replaceChildren();

    if (!state.labels.length) {
      els.hint.hidden = false;
      els.hint.textContent = "No labels yet.";
      return;
    }

    if (email) {
      els.hint.hidden = true;
      els.hint.textContent = "";
    } else {
      els.hint.hidden = false;
      els.hint.textContent = "Capture a sender to assign labels.";
    }

    for (const label of state.labels) {
      const li = document.createElement("li");
      const pressed = assigned.has(label.id);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "label-toggle";
      toggle.setAttribute("aria-pressed", pressed ? "true" : "false");
      toggle.disabled = !email;
      toggle.dataset.labelId = label.id;
      toggle.title = email
        ? pressed
          ? `Remove sender from ${label.name}`
          : `Assign ${label.name}`
        : "Capture a sender first";

      const check = document.createElement("span");
      check.className = "check";
      check.textContent = pressed ? "✓" : "";

      const name = document.createElement("span");
      name.className = "label-name";
      name.textContent = label.name;

      toggle.append(check, name);
      if (pressed && email) {
        const mark = document.createElement("span");
        mark.className = "on-sender";
        mark.textContent = "On sender";
        toggle.append(mark);
      }

      const removeLabel = document.createElement("button");
      removeLabel.type = "button";
      removeLabel.className = "danger";
      removeLabel.dataset.deleteId = label.id;
      removeLabel.setAttribute("aria-label", `Delete label ${label.name}`);
      removeLabel.textContent = "Delete";

      li.append(toggle, removeLabel);
      els.list.append(li);
    }
  }

  function render() {
    renderSender();
    renderLabels();
  }

  async function loadState() {
    const data = await chrome.storage.local.get({
      [keys.selection]: null,
      [keys.labels]: [],
      [keys.assignments]: {},
    });
    state = {
      currentSelection: data[keys.selection],
      labels: Array.isArray(data[keys.labels]) ? data[keys.labels] : [],
      assignments: data[keys.assignments] && typeof data[keys.assignments] === "object"
        ? data[keys.assignments]
        : {},
    };
    render();
  }

  async function savePartial(patch) {
    await chrome.storage.local.set(patch);
    await loadState();
  }

  async function copyEmail() {
    const email = state.currentSelection && state.currentSelection.email;
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  async function addLabel(name) {
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    const exists = state.labels.some(
      (label) => label.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      els.hint.hidden = false;
      els.hint.textContent = "That label already exists.";
      return;
    }
    const labels = state.labels.concat({
      id: MailLabel.newLabelId(),
      name: trimmed,
      createdAt: Date.now(),
    });
    await savePartial({ [keys.labels]: labels });
    els.input.value = "";
  }

  async function toggleAssignment(labelId) {
    const email = currentEmail();
    if (!email) return;
    const current = new Set(state.assignments[email] || []);
    if (current.has(labelId)) current.delete(labelId);
    else current.add(labelId);
    const assignments = { ...state.assignments, [email]: Array.from(current) };
    if (!assignments[email].length) delete assignments[email];
    await savePartial({ [keys.assignments]: assignments });
  }

  async function deleteLabel(labelId) {
    const labels = state.labels.filter((label) => label.id !== labelId);
    const assignments = {};
    for (const [email, ids] of Object.entries(state.assignments)) {
      const next = (ids || []).filter((id) => id !== labelId);
      if (next.length) assignments[email] = next;
    }
    await savePartial({
      [keys.labels]: labels,
      [keys.assignments]: assignments,
    });
  }

  els.copyBtn.addEventListener("click", copyEmail);
  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    addLabel(els.input.value);
  });
  els.list.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const del = target.closest("[data-delete-id]");
    if (del) {
      deleteLabel(del.getAttribute("data-delete-id"));
      return;
    }
    const toggle = target.closest("[data-label-id]");
    if (toggle && !toggle.disabled) {
      toggleAssignment(toggle.getAttribute("data-label-id"));
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    loadState();
  });

  loadState();
})();
