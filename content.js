(() => {
  const { MailLabel } = globalThis;
  if (!MailLabel) return;

  const SELECTED_ATTR = "data-mail-label-selected";
  let toastTimer = null;
  let lastHandledAt = 0;

  function showToast(message, isError) {
    let el = document.getElementById("mail-label-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "mail-label-toast";
      el.setAttribute("role", "status");
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle("mail-label-toast-error", Boolean(isError));
    el.classList.add("mail-label-toast-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("mail-label-toast-on");
    }, 2200);
  }

  function markSelected(row) {
    document.querySelectorAll(`[${SELECTED_ATTR}]`).forEach((node) => {
      node.removeAttribute(SELECTED_ATTR);
    });
    row.setAttribute(SELECTED_ATTR, "true");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function looksLikeThreadHash(hash) {
    const clean = String(hash || "").replace(/^#/, "");
    if (!clean) return false;
    const parts = clean.split("/").filter(Boolean);
    if (parts.length < 2) return false;
    const last = decodeURIComponent(parts[parts.length - 1] || "");
    if (last.length < 8) return false;
    if (/^(inbox|starred|snoozed|sent|drafts|imp|all|spam|trash|search|label|category|chats|scheduled)$/i.test(last)) {
      return false;
    }
    return true;
  }

  function revertNavigation(hashBefore) {
    const started = Date.now();
    const tick = () => {
      if (Date.now() - started > 900) return;
      if (location.hash !== hashBefore && looksLikeThreadHash(location.hash)) {
        location.hash = hashBefore;
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
    setTimeout(tick, 0);
    setTimeout(tick, 60);
    setTimeout(tick, 180);
    setTimeout(tick, 400);
  }

  async function captureRow(row) {
    markSelected(row);
    const extracted = MailLabel.extractSenderFromRow(row);
    const selection = {
      email: extracted.email,
      name: extracted.name || "",
      status: extracted.email ? "ok" : "error",
      message: extracted.email ? "" : extracted.error,
      capturedAt: Date.now(),
    };

    try {
      await chrome.storage.local.set({
        [MailLabel.STORAGE_KEYS.selection]: selection,
      });
    } catch (err) {
      showToast("Could not save sender to extension storage.", true);
      return;
    }

    if (!extracted.email) {
      showToast("Could not read sender email from this row", true);
      return;
    }

    const copied = await copyText(extracted.email);
    showToast(copied ? `Copied ${extracted.email}` : `Captured ${extracted.email}`);
  }

  function shouldIgnoreEvent(event) {
    if (event.button != null && event.button !== 0) return true;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return true;
    return false;
  }

  function onPointer(event) {
    if (shouldIgnoreEvent(event)) return;
    const target = event.target;
    if (!target || target.nodeType !== 1) return;

    const row = MailLabel.findThreadRow(target);
    if (!row) return;
    if (MailLabel.isExemptTarget(target, row)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    revertNavigation(location.hash);

    const now = Date.now();
    if (now - lastHandledAt < 350) return;
    lastHandledAt = now;
    captureRow(row);
  }

  function attach() {
    const opts = { capture: true, passive: false };
    window.addEventListener("mousedown", onPointer, opts);
    window.addEventListener("pointerdown", onPointer, opts);
    window.addEventListener("click", onPointer, opts);
    window.addEventListener("dblclick", onPointer, opts);
  }

  attach();
})();
