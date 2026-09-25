# Mail Label

Chrome extension that lets you tag Gmail **senders** from the inbox list without opening the thread.

Click a thread row. The sender email is copied and stored. Open the toolbar popup to create labels and assign that sender.

No Gmail API and no OAuth. Everything stays in `chrome.storage.local`.

## Load unpacked

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder (the clone that contains `manifest.json`).

The toolbar icon is a blue tag with an envelope. Pin it if you want the popup one click away.

## Use it

1. Open [Gmail](https://mail.google.com).
2. **Left-click a thread row** in the inbox or another list view.
   - The thread does **not** open.
   - The sender email is copied to the clipboard.
   - A short toast confirms the copy (or says the email could not be read).
3. Click the **Mail Label** toolbar icon.
4. Check the captured sender (name + email).
5. Type a label name and click **Add**.
6. Click a label to assign it to the current sender. Click again to remove that sender from the label.
7. **Delete** removes the label itself.

### Opening a thread anyway

- **Shift / Alt / Ctrl / Cmd + click** uses Gmail’s normal open.
- Keyboard shortcuts (`Enter` / `o`) still open a thread.
- Checkboxes, stars, important markers, and row hover actions (archive, delete, snooze, …) still work.

## What is stored

In `chrome.storage.local` only:

- latest captured sender (`email`, `name`, status)
- label list (name + id)
- sender email → label ids

If Gmail’s DOM does not expose an address for a row, the popup shows:

`Could not read sender email from this row`

## Files

```
manifest.json
shared.js          extract helpers + storage keys
content.js         Gmail click intercept
content.css
popup.html / popup.js / popup.css
icons/
scripts/           icon generator + optional tests
```

No build step. After you edit files, click **Reload** on `chrome://extensions`.

## Verified in this environment

- Chrome packed the extension (`--pack-extension`) with no manifest errors.
- Sender extraction against Gmail-like rows: `email` attribute, `data-hovercard-id`, `title` with a hidden address, and the missing-email error string.
- Click intercept: row click copies the sender and writes `chrome.storage.local`; checkbox clicks and Shift-click are left alone; thread-hash navigation is reverted.
- Popup: create a label, assign it to the captured sender, remove the sender, copy email, and show `Could not read sender email from this row`.
- Popup UI: dark near-black, ~360px, empty state and assigned-label state.

Not exercised here: a signed-in live Gmail inbox. After Load unpacked, click a real thread row to confirm intercept on your account.

Optional tests (needs `jsdom`):

```bash
node scripts/test-extract.cjs
node scripts/test-popup.cjs
node scripts/test-content.cjs
```
