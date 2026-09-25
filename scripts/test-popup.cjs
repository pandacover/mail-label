const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeChrome() {
  const store = {
    currentSelection: {
      email: "ada@example.com",
      name: "Ada Lovelace",
      status: "ok",
      message: "",
      capturedAt: Date.now(),
    },
    labels: [],
    assignments: {},
  };
  const listeners = [];
  return {
    store,
    storage: {
      local: {
        async get(defaults) {
          const out = { ...defaults };
          for (const key of Object.keys(defaults)) {
            if (key in store) out[key] = store[key];
          }
          return out;
        },
        async set(patch) {
          const changes = {};
          for (const [key, value] of Object.entries(patch)) {
            changes[key] = { oldValue: store[key], newValue: value };
            store[key] = value;
          }
          for (const fn of listeners) fn(changes, "local");
        },
      },
      onChanged: {
        addListener(fn) {
          listeners.push(fn);
        },
      },
    },
  };
}

(async () => {
  const html = fs.readFileSync(path.join(root, "popup.html"), "utf8");
  const chrome = makeChrome();
  const writes = [];

  const virtualConsole = new (require("jsdom").VirtualConsole)();
  virtualConsole.sendTo(console, { omitJSDOMErrors: true });

  const dom = new JSDOM(html, {
    url: "file://" + path.join(root, "popup.html"),
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.chrome = chrome;
      window.navigator.clipboard = {
        writeText: async (text) => {
          writes.push(text);
        },
      };
    },
  });

  await new Promise((resolve, reject) => {
    dom.window.addEventListener("load", resolve);
    setTimeout(() => reject(new Error("popup load timed out")), 4000);
  });

  const document = dom.window.document;
  await new Promise((r) => setTimeout(r, 50));

  assert(
    document.getElementById("sender-email").textContent === "ada@example.com",
    "shows captured email"
  );
  assert(
    document.getElementById("sender-name").textContent === "Ada Lovelace",
    "shows display name"
  );

  document.getElementById("new-label").value = "Clients";
  document.getElementById("new-label-form").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true })
  );
  await new Promise((r) => setTimeout(r, 50));

  assert(chrome.store.labels.length === 1, "created a label");
  assert(chrome.store.labels[0].name === "Clients", "label name");

  const toggle = document.querySelector("[data-label-id]");
  assert(toggle, "label toggle exists");
  toggle.click();
  await new Promise((r) => setTimeout(r, 50));

  const assigned = chrome.store.assignments["ada@example.com"] || [];
  assert(assigned.length === 1, "assigned sender to label");
  assert(
    document.querySelector(".on-sender"),
    "shows On sender for assigned label"
  );

  document.querySelector("[data-label-id]").click();
  await new Promise((r) => setTimeout(r, 50));
  assert(
    !(chrome.store.assignments["ada@example.com"] || []).length,
    "removed sender from label"
  );

  document.getElementById("copy-btn").click();
  await new Promise((r) => setTimeout(r, 20));
  assert(writes[0] === "ada@example.com", "copy button writes email");

  chrome.store.currentSelection = {
    email: null,
    name: "Mystery",
    status: "error",
    message: "Could not read sender email from this row",
    capturedAt: Date.now(),
  };
  chrome.storage.local.set({ currentSelection: chrome.store.currentSelection });
  await new Promise((r) => setTimeout(r, 50));
  const err = document.getElementById("sender-error");
  assert(!err.hidden, "error visible");
  assert(
    err.textContent === "Could not read sender email from this row",
    "error copy"
  );

  console.log("popup tests passed");
  dom.window.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
