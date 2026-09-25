const path = require("path");
const fs = require("fs");
const { JSDOM } = require("jsdom");
const MailLabel = require(path.join(__dirname, "..", "shared.js"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const html = `
<!doctype html>
<html>
<body>
  <table>
    <tr class="zA" id="row">
      <td><div id="check" role="checkbox" aria-label="Select"></div></td>
      <td><span id="star" role="button" aria-label="Not starred"></span></td>
      <td class="yW"><span id="sender" email="ada@example.com" name="Ada">Ada</span></td>
      <td><span data-thread-id="#thread-a">Hello</span></td>
    </tr>
  </table>
  <a id="other" href="#inbox">Inbox</a>
</body>
</html>
`;

const store = {};
const chrome = {
  storage: {
    local: {
      async set(patch) {
        Object.assign(store, patch);
      },
    },
  },
};

const virtualConsole = new (require("jsdom").VirtualConsole)();
virtualConsole.sendTo(console, { omitJSDOMErrors: true });

const dom = new JSDOM(html, {
  url: "https://mail.google.com/mail/u/0/#inbox",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole,
});

const window = dom.window;
window.MailLabel = MailLabel;
window.chrome = chrome;
window.navigator.clipboard = {
  writeText: async (text) => {
    window.__copied = text;
  },
};

const script = window.document.createElement("script");
script.textContent = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
window.document.documentElement.appendChild(script);

function fire(el, type, extra = {}) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    view: window,
    ...extra,
  });
  el.dispatchEvent(event);
  return event;
}

(async () => {
  const sender = window.document.getElementById("sender");
  const check = window.document.getElementById("check");
  const other = window.document.getElementById("other");
  const hashBefore = window.location.hash;

  let nav = false;
  window.document.addEventListener(
    "click",
    () => {
      nav = true;
      window.location.hash = "#inbox/FMfcgzThreadOpen123";
    },
    false
  );

  fire(sender, "mousedown");
  fire(sender, "click");
  await new Promise((r) => setTimeout(r, 80));

  assert(window.__copied === "ada@example.com", "copied sender email");
  assert(
    store.currentSelection && store.currentSelection.email === "ada@example.com",
    "stored selection"
  );
  assert(
    window.document.getElementById("row").getAttribute("data-mail-label-selected") === "true",
    "row highlighted"
  );
  assert(window.location.hash === hashBefore || window.location.hash === "#inbox", "did not stay on thread hash");

  nav = false;
  const checkEvent = fire(check, "click");
  assert(!checkEvent.defaultPrevented, "checkbox click not prevented");

  const shift = fire(sender, "click", { shiftKey: true });
  assert(!shift.defaultPrevented, "shift-click not intercepted");

  const otherClick = fire(other, "click");
  assert(!otherClick.defaultPrevented, "non-row click not intercepted");

  console.log("content intercept tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
