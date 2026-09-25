const { JSDOM } = require("jsdom");
const path = require("path");
const MailLabel = require(path.join(__dirname, "..", "shared.js"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const gmailList = `
<table>
  <tbody>
    <tr class="zA yO" role="row">
      <td>
        <div role="checkbox" aria-label="Select"></div>
      </td>
      <td>
        <span role="button" aria-label="Not starred"></span>
      </td>
      <td class="yW">
        <span email="ada@example.com" name="Ada Lovelace">Ada Lovelace</span>
      </td>
      <td>
        <span data-thread-id="#thread-a">Engine notes</span>
        <span class="y2"> - preview text</span>
      </td>
    </tr>
    <tr class="zA zE">
      <td class="yW">
        <div data-hovercard-id="grace@hopper.test" name="Grace Hopper">Grace Hopper</div>
      </td>
      <td><span data-legacy-thread-id="legacy123456">COBOL</span></td>
    </tr>
    <tr class="zA">
      <td>
        <span title="Hidden Sender &lt;hidden@mail.test&gt;">Hidden Sender</span>
      </td>
      <td><span data-thread-id="#thread-c">Only title attr</span></td>
    </tr>
    <tr class="zA">
      <td>No address here</td>
      <td><span data-thread-id="#thread-d">Mystery</span></td>
    </tr>
  </tbody>
</table>
`;

const dom = new JSDOM(gmailList);
const { document } = dom.window;
global.document = document;
global.Element = dom.window.Element;

const rows = [...document.querySelectorAll("tr")];
assert(rows.length === 4, "expected 4 rows");

const ada = MailLabel.extractSenderFromRow(rows[0]);
assert(ada.email === "ada@example.com", "ada email, got " + ada.email);
assert(ada.name === "Ada Lovelace", "ada name, got " + ada.name);

const grace = MailLabel.extractSenderFromRow(rows[1]);
assert(grace.email === "grace@hopper.test", "grace email, got " + grace.email);
assert(grace.name === "Grace Hopper", "grace name");

const hidden = MailLabel.extractSenderFromRow(rows[2]);
assert(hidden.email === "hidden@mail.test", "title email, got " + hidden.email);

const missing = MailLabel.extractSenderFromRow(rows[3]);
assert(!missing.email, "missing should have no email");
assert(
  missing.error === "Could not read sender email from this row",
  "missing error message"
);

const fromCheckbox = MailLabel.findThreadRow(document.querySelector('[role="checkbox"]'));
assert(fromCheckbox === rows[0], "walk up from checkbox to row");

assert(MailLabel.isExemptTarget(document.querySelector('[role="checkbox"]'), rows[0]), "checkbox exempt");
assert(MailLabel.isExemptTarget(document.querySelector('[aria-label="Not starred"]'), rows[0]), "star exempt");
assert(
  !MailLabel.isExemptTarget(document.querySelector('[email="ada@example.com"]'), rows[0]),
  "sender cell is not exempt"
);

assert(MailLabel.isThreadRow(rows[0]), "row detected");
assert(!MailLabel.isThreadRow(document.querySelector("table")), "table is not a row");
assert(!MailLabel.isThreadRow(document.querySelector("tbody")), "tbody is not a row");

console.log("extract tests passed");
