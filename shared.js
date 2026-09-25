/* Shared helpers for Mail Label (content script + popup). */
(function (root) {
  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
  const EMAIL_GLOBAL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const EMAIL_ONLY_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

  const EXEMPT_SELECTOR = [
    '[role="checkbox"]',
    "input",
    "textarea",
    "select",
    "button",
    '[aria-checked]',
    '[data-tooltip="Select"]',
    '[aria-label="Select"]',
    '[aria-label^="Select "]',
    '[aria-label*="Starred"]',
    '[aria-label*="Not starred"]',
    '[aria-label*="Add star"]',
    '[aria-label*="Star "]',
    '[aria-label="Important"]',
    '[aria-label="Not important"]',
    '[aria-label="Archive"]',
    '[aria-label="Delete"]',
    '[aria-label="Mark as unread"]',
    '[aria-label="Mark as read"]',
    '[aria-label="Snooze"]',
    '[aria-label="Move to"]',
    '[aria-label="Labels"]',
    '[aria-label="More"]',
    ".bqY",
    "td.oZ-x3",
    "td.apU",
    "td.WA",
    "td.oZ-jc",
  ].join(",");

  function isElement(node) {
    return Boolean(node) && node.nodeType === 1;
  }

  const MailLabel = {
    STORAGE_KEYS: {
      selection: "currentSelection",
      labels: "labels",
      assignments: "assignments",
    },

    normalizeEmail(value) {
      if (!value || typeof value !== "string") return null;
      const trimmed = value.trim().replace(/^mailto:/i, "");
      const match = trimmed.match(EMAIL_ONLY_RE) || trimmed.match(EMAIL_RE);
      if (!match) return null;
      const email = (Array.isArray(match) ? match[0] : match).toLowerCase();
      if (email.endsWith(".png") || email.endsWith(".gif") || email.endsWith(".jpg")) {
        return null;
      }
      return email;
    },

    emailsInText(text) {
      if (!text) return [];
      const found = String(text).match(EMAIL_GLOBAL_RE) || [];
      return found
        .map((item) => MailLabel.normalizeEmail(item))
        .filter(Boolean);
    },

    displayNameFromText(text, email) {
      if (!text) return "";
      let name = String(text).replace(/\s+/g, " ").trim();
      if (!name) return "";
      if (email) {
        const re = new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
        name = name.replace(re, "").replace(/[<>]/g, " ").replace(/\s+/g, " ").trim();
      }
      if (!name || EMAIL_ONLY_RE.test(name)) return "";
      return name;
    },

    isThreadRow(el) {
      if (!el || el.nodeType !== 1) return false;
      const tag = el.tagName;
      if (tag === "TABLE" || tag === "TBODY" || tag === "THEAD") return false;

      const threadMarks = el.querySelectorAll("[data-thread-id], [data-legacy-thread-id]");
      const emailMarks = el.querySelectorAll("[email], [data-hovercard-id]");
      const hasRowSignal = emailMarks.length > 0 || threadMarks.length > 0;
      if (!hasRowSignal) return false;
      if (threadMarks.length > 4) return false;

      if (tag === "TR") return true;
      if (el.classList && el.classList.contains("zA")) return true;

      const role = el.getAttribute("role");
      if (role === "row" || role === "listitem") {
        return emailMarks.length > 0 || threadMarks.length === 1;
      }
      return false;
    },

    findThreadRow(start) {
      if (!isElement(start)) return null;
      const doc = start.ownerDocument;
      let node = start;
      while (node && node !== doc.body && node !== doc.documentElement) {
        if (MailLabel.isThreadRow(node)) return node;
        node = node.parentElement;
      }
      return null;
    },

    isExemptTarget(target, row) {
      if (!isElement(target) || !row) return false;
      const hit = target.closest(EXEMPT_SELECTOR);
      if (hit && row.contains(hit) && hit !== row) return true;

      const labeled = target.closest("[aria-label], [data-tooltip], [role='button']");
      if (labeled && row.contains(labeled) && labeled !== row) {
        const label = (
          labeled.getAttribute("aria-label") ||
          labeled.getAttribute("data-tooltip") ||
          ""
        ).toLowerCase();
        if (
          /star|important|archive|delete|snooze|unread|select|checkbox|move to|label/.test(
            label
          )
        ) {
          return true;
        }
      }
      return false;
    },

    attrCandidates(el) {
      if (!isElement(el)) return [];
      return [
        el.getAttribute("email"),
        el.getAttribute("data-hovercard-id"),
        el.getAttribute("data-email"),
        el.getAttribute("title"),
        el.getAttribute("aria-label"),
        el.getAttribute("data-tooltip"),
        el.getAttribute("name"),
      ].filter(Boolean);
    },

    extractSenderFromRow(row) {
      const fail = {
        email: null,
        name: "",
        error: "Could not read sender email from this row",
      };
      if (!isElement(row)) return fail;

      const preferScopes = [];
      const senderCol = row.querySelector(".yW, .bA4");
      if (senderCol) preferScopes.push(senderCol);
      preferScopes.push(row);

      function fromEmailNodes(scope) {
        const nodes = scope.querySelectorAll("[email], [data-hovercard-id]");
        for (const el of nodes) {
          const email =
            MailLabel.normalizeEmail(el.getAttribute("email")) ||
            MailLabel.normalizeEmail(el.getAttribute("data-hovercard-id"));
          if (!email) continue;
          const name =
            (el.getAttribute("name") || "").trim() ||
            MailLabel.displayNameFromText(el.textContent, email);
          return { email, name, error: null };
        }
        return null;
      }

      for (const scope of preferScopes) {
        const found = fromEmailNodes(scope);
        if (found) return found;
      }

      const attrEls = row.querySelectorAll(
        "[email], [data-hovercard-id], [data-email], [title], [aria-label], [data-tooltip]"
      );
      for (const el of attrEls) {
        for (const raw of MailLabel.attrCandidates(el)) {
          const emails = MailLabel.emailsInText(raw);
          if (!emails.length) continue;
          const email = emails[0];
          const name =
            (el.getAttribute("name") || "").trim() ||
            MailLabel.displayNameFromText(raw, email) ||
            MailLabel.displayNameFromText(el.textContent, email);
          return { email, name, error: null };
        }
      }

      const textRoot = senderCol || row;
      const emails = MailLabel.emailsInText(textRoot.innerText || textRoot.textContent || "");
      if (emails.length) {
        const email = emails[0];
        const name = MailLabel.displayNameFromText(textRoot.innerText, email);
        return { email, name, error: null };
      }

      const visibleName = MailLabel.displayNameFromText(
        (senderCol || row).innerText || "",
        null
      );
      return { email: null, name: visibleName, error: fail.error };
    },

    emailKey(email) {
      return String(email || "").trim().toLowerCase();
    },

    newLabelId() {
      return "lbl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    },
  };

  root.MailLabel = MailLabel;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = MailLabel;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
