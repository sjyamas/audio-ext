# Audio Tweaks Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 browser extension (Edge/Chrome) whose toolbar popup exposes a per-tab "Mono audio" toggle, structured for future channel-swap, boost, and EQ features.

**Architecture:** Four runtime parts — popup, background service worker, content script (isolated world), injected page-world script. The page-world script intercepts `<audio>`/`<video>` elements and `AudioContext` instances and routes them through a fixed Web Audio graph whose node parameters are flipped between active and bypass when settings change. Per-tab state lives in the service worker's memory, keyed by `tabId`, for the lifetime of the tab.

**Tech Stack:** Manifest V3, vanilla JS (no build step), Web Audio API, `chrome.runtime` messaging, `chrome.tabs` events.

**Spec:** [docs/superpowers/specs/2026-04-30-audio-tweaks-extension-design.md](../specs/2026-04-30-audio-tweaks-extension-design.md)

**Notes for the implementer:**
- This project does **not** use git (per the user's preference for v0.1). Commit steps are omitted; each task ends with a manual verification step instead. If git is added later, retroactive commits per task are fine.
- Testing is **manual only** for v0.1. There is no test runner. Each task includes a "verify" step that loads the unpacked extension and exercises the new behavior in a real browser. The implementer needs Edge or Chrome installed to verify.
- Working directory throughout: `c:\Users\Shohei\Dev\personal\ext\audio`.
- "Load unpacked" instructions: open `edge://extensions` (or `chrome://extensions`) → enable Developer Mode → click "Load unpacked" → pick the `audio` directory. After file changes, click the reload icon on the extension's card and reload the test page.

---

## File Structure

```
audio/
├── manifest.json          # MV3 manifest
├── background.js          # service worker: tabSettings map + message router
├── content.js             # isolated-world script: injects injected.js, relays messages
├── injected.js            # page-world script: audio graph + media discovery + AudioContext proxy
├── popup.html             # popup markup
├── popup.css              # popup styling
├── popup.js               # popup logic: query state, render rows, send toggles
├── README.md              # install + manual test checklist
├── tools/
│   └── make-icons.ps1     # PowerShell script to (re)generate placeholder icons
├── test-pages/
│   ├── stereo-tone.html   # bare <audio> stereo test page (manual test asset)
│   └── webaudio-tone.html # AudioContext-based stereo test page (manual test asset)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

Responsibilities:
- **manifest.json** — declares MV3 config: action popup, content scripts, web-accessible resources, permissions.
- **background.js** — owns `tabSettings: Map<tabId, {mono: boolean}>`. Handles `getSettings`, `setSetting` from the popup. Forwards `apply` to content scripts. Cleans up on `chrome.tabs.onRemoved`.
- **content.js** — runs in every frame at `document_start`. Loads `injected.js` into the page world via a `<script>` tag with `src = chrome.runtime.getURL('injected.js')`. Relays `apply` messages from background → page world via `window.postMessage`. On startup, asks background for current settings.
- **injected.js** — runs in the page's own JS world. Owns the `WeakMap<HTMLMediaElement, GraphHandle>` and the `Map<AudioContext, GraphHandle>`. Patches `AudioNode.prototype.connect` so any connection to a destination is rerouted through our graph. Listens for `window.postMessage` settings updates and applies them.
- **popup.{html,css,js}** — the toolbar popup. Renders the toggle list, communicates with the background. Detects non-injectable URL schemes and shows a disabled state.
- **icons/** — placeholder icons sized 16/48/128.
- **tools/make-icons.ps1** — regenerates the placeholder icons (used in Task 1, kept for future).
- **test-pages/** — local HTML used by the manual verification steps.
- **README.md** — install instructions and the manual test checklist.

---

## Task 1: Scaffold project (manifest, icons, stubs, README, test pages)

**Files:**
- Create: `manifest.json`
- Create: `background.js` (stub)
- Create: `content.js` (stub)
- Create: `injected.js` (stub)
- Create: `popup.html` (stub)
- Create: `popup.css` (empty)
- Create: `popup.js` (stub)
- Create: `tools/make-icons.ps1`
- Create: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png` (generated)
- Create: `test-pages/stereo-tone.html`
- Create: `test-pages/webaudio-tone.html`
- Create: `README.md`

- [ ] **Step 1.1: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Audio Tweaks",
  "version": "0.1.0",
  "description": "Per-tab audio adjustments (mono today; swap, boost, EQ later).",
  "permissions": ["tabs", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_start",
      "all_frames": true
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["injected.js"],
      "matches": ["<all_urls>"]
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 1.2: Create stub `background.js`**

```js
console.log('[Audio Tweaks] background service worker booted');
```

- [ ] **Step 1.3: Create stub `content.js`**

```js
console.log('[Audio Tweaks] content script loaded in', location.href);
```

- [ ] **Step 1.4: Create stub `injected.js`**

```js
console.log('[Audio Tweaks] injected script loaded in', location.href);
```

- [ ] **Step 1.5: Create stub `popup.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="popup.css" />
    <title>Audio Tweaks</title>
  </head>
  <body>
    <div id="root">Audio Tweaks (loading...)</div>
    <script src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 1.6: Create empty `popup.css`**

(Empty file. Styling lands in Task 3.)

- [ ] **Step 1.7: Create stub `popup.js`**

```js
console.log('[Audio Tweaks] popup loaded');
```

- [ ] **Step 1.8: Create `tools/make-icons.ps1`**

```powershell
# Regenerate placeholder icons. Run from the repo root with:
#   powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot "..\icons"
New-Item -ItemType Directory -Force -Path $out | Out-Null

foreach ($size in 16, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(255, 28, 100, 200))

  # Simple "speaker" glyph: a filled rectangle on the left + a triangle wedge on the right.
  $pad = [int]($size * 0.18)
  $bodyW = [int]($size * 0.30)
  $bodyH = [int]($size * 0.45)
  $bodyX = $pad
  $bodyY = [int](($size - $bodyH) / 2)
  $brush = [System.Drawing.Brushes]::White
  $g.FillRectangle($brush, $bodyX, $bodyY, $bodyW, $bodyH)

  $tri = New-Object 'System.Drawing.Point[]' 3
  $tri[0] = New-Object System.Drawing.Point ($bodyX + $bodyW), ($bodyY + [int]($bodyH * 0.15))
  $tri[1] = New-Object System.Drawing.Point ($bodyX + $bodyW + [int]($size * 0.22)), ($bodyY - [int]($bodyH * 0.15))
  $tri[2] = New-Object System.Drawing.Point ($bodyX + $bodyW + [int]($size * 0.22)), ($bodyY + $bodyH + [int]($bodyH * 0.15))
  $g.FillPolygon($brush, $tri)

  $bmp.Save((Join-Path $out "icon$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

Write-Host "Wrote icons to $out"
```

- [ ] **Step 1.9: Generate the icons**

Run from the repo root (`c:\Users\Shohei\Dev\personal\ext\audio`):

```powershell
powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
```

Expected output: `Wrote icons to ...\icons`. Verify three files exist: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`.

- [ ] **Step 1.10: Create `test-pages/stereo-tone.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Stereo Tone Test (HTMLAudioElement)</title>
  <style>body{font-family:sans-serif;padding:2rem;max-width:40rem}</style>
</head>
<body>
  <h1>Stereo Tone Test (&lt;audio&gt;)</h1>
  <p>440 Hz sine in the LEFT channel, 880 Hz sine in the RIGHT channel.
     With mono OFF, you hear two tones split across speakers.
     With mono ON, both speakers carry the sum (both tones in both ears).</p>
  <button id="play">Play</button>
  <audio id="a" controls></audio>
  <script>
    const ctx = new OfflineAudioContext(2, 44100 * 5, 44100);
    const buf = ctx.createBuffer(2, 44100 * 5, 44100);
    const left = buf.getChannelData(0);
    const right = buf.getChannelData(1);
    for (let i = 0; i < buf.length; i++) {
      left[i]  = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.3;
      right[i] = Math.sin(2 * Math.PI * 880 * i / 44100) * 0.3;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    ctx.startRendering().then(rendered => {
      // Encode as WAV in memory and assign to <audio>.
      const wav = encodeWav(rendered);
      document.getElementById('a').src = URL.createObjectURL(new Blob([wav], {type: 'audio/wav'}));
    });

    function encodeWav(buffer) {
      const numCh = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
      const ab = new ArrayBuffer(44 + len * numCh * 2);
      const v = new DataView(ab);
      let p = 0;
      const w = (s) => { for (let i = 0; i < s.length; i++) v.setUint8(p++, s.charCodeAt(i)); };
      const w32 = (n) => { v.setUint32(p, n, true); p += 4; };
      const w16 = (n) => { v.setUint16(p, n, true); p += 2; };
      w('RIFF'); w32(36 + len * numCh * 2); w('WAVE'); w('fmt '); w32(16); w16(1);
      w16(numCh); w32(sr); w32(sr * numCh * 2); w16(numCh * 2); w16(16); w('data'); w32(len * numCh * 2);
      const chs = [];
      for (let c = 0; c < numCh; c++) chs.push(buffer.getChannelData(c));
      for (let i = 0; i < len; i++) {
        for (let c = 0; c < numCh; c++) {
          let s = Math.max(-1, Math.min(1, chs[c][i]));
          v.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true); p += 2;
        }
      }
      return ab;
    }
  </script>
</body>
</html>
```

- [ ] **Step 1.11: Create `test-pages/webaudio-tone.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Stereo Tone Test (Web Audio API)</title>
  <style>body{font-family:sans-serif;padding:2rem;max-width:40rem}</style>
</head>
<body>
  <h1>Stereo Tone Test (AudioContext)</h1>
  <p>440 Hz sine LEFT, 880 Hz sine RIGHT — emitted directly via <code>AudioContext</code> (no &lt;audio&gt; element).</p>
  <button id="start">Start</button>
  <button id="stop">Stop</button>
  <script>
    let ctx, merger, oL, oR;
    document.getElementById('start').onclick = () => {
      if (ctx) return;
      ctx = new AudioContext();
      merger = ctx.createChannelMerger(2);
      oL = ctx.createOscillator(); oL.frequency.value = 440;
      oR = ctx.createOscillator(); oR.frequency.value = 880;
      const gL = ctx.createGain(); gL.gain.value = 0.3;
      const gR = ctx.createGain(); gR.gain.value = 0.3;
      oL.connect(gL).connect(merger, 0, 0);
      oR.connect(gR).connect(merger, 0, 1);
      merger.connect(ctx.destination);
      oL.start(); oR.start();
    };
    document.getElementById('stop').onclick = () => {
      if (!ctx) return;
      oL.stop(); oR.stop(); ctx.close(); ctx = null;
    };
  </script>
</body>
</html>
```

- [ ] **Step 1.12: Create `README.md`**

````markdown
# Audio Tweaks

A Manifest V3 browser extension (Edge/Chrome) that adds per-tab audio adjustments
through its toolbar popup. Version 0.1.0 ships **Mono audio**; channel swap,
volume boost, and EQ are stubbed in the UI for later versions.

## Install (developer mode)

1. Open `edge://extensions` (or `chrome://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `audio` directory.
4. The "Audio Tweaks" icon appears in the toolbar.

After editing files, click the reload icon on the extension's card, then reload
any open test pages.

## Manual test checklist

Open the test pages by dragging the HTML files into a browser tab, or via
`file:///` URLs. (Note: `file://` requires "Allow access to file URLs" on the
extension's details page.) For YouTube tests, use any stereo music video.

| # | Test | Expected |
|--:|------|----------|
| 1 | Click the toolbar icon. | Popup opens, mono row enabled, three "Coming soon" rows greyed. |
| 2 | Open `test-pages/stereo-tone.html`, play it, **mono OFF**. | 440 Hz left ear only, 880 Hz right ear only. |
| 3 | Toggle **mono ON**, replay. | Both ears carry the summed signal (both tones audible in both ears). |
| 4 | Open YouTube stereo content, toggle mono. | Stereo separation collapses with mono ON. |
| 5 | Open `test-pages/webaudio-tone.html`, click Start, **mono OFF**. | 440 Hz left, 880 Hz right. |
| 6 | Toggle **mono ON**. | Both ears carry summed signal. |
| 7 | Two tabs, mono ON in tab A, OFF in tab B. | Independent: each tab keeps its own state. |
| 8 | Toggle mono ON, reload the tab. | Mono stays ON after reload. |
| 9 | Toggle mono ON, navigate within the tab. | Mono stays ON on the new page. |
| 10 | Close a tab. | Service worker logs `[Audio Tweaks] cleared settings for tab N`. |
| 11 | Open `chrome://settings` (or `edge://settings`), click toolbar icon. | Popup shows toggles disabled with "Not available on this page." |
| 12 | Page that embeds an iframe with audio (e.g. YouTube embed). | Mono toggle affects the embedded audio too. |

## Project layout

See `docs/superpowers/specs/2026-04-30-audio-tweaks-extension-design.md` for the
full design.

````

- [ ] **Step 1.13: Verify the extension loads**

1. Open `edge://extensions` (or `chrome://extensions`).
2. Enable Developer Mode.
3. Click "Load unpacked" and select `c:\Users\Shohei\Dev\personal\ext\audio`.
4. Confirm: extension card appears titled "Audio Tweaks", no red error badges.
5. Click the toolbar icon. The popup opens showing "Audio Tweaks (loading...)".
6. Open any web page (e.g., `https://example.com`) and open DevTools → Console. Confirm: `[Audio Tweaks] content script loaded in https://example.com/` appears.
7. Click the extension card's "Service worker" link to open the service-worker DevTools. Console shows `[Audio Tweaks] background service worker booted`.

If any of these fail, fix before proceeding. Common issues: missing icon files cause the manifest to reject; misspelled keys in `manifest.json`.

---

## Task 2: Background service worker — state map and messaging

**Files:**
- Modify: `background.js`

- [ ] **Step 2.1: Replace `background.js` with full implementation**

```js
// In-memory per-tab settings. Lost on service-worker restart and on tab close.
const tabSettings = new Map(); // tabId -> { mono: boolean }

const DEFAULTS = Object.freeze({ mono: false });

function getSettings(tabId) {
  return tabSettings.get(tabId) ?? { ...DEFAULTS };
}

function setSetting(tabId, key, value) {
  const current = getSettings(tabId);
  const next = { ...current, [key]: value };
  tabSettings.set(tabId, next);
  return next;
}

async function broadcastApply(tabId, settings) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'apply', settings });
  } catch (_) {
    // Tab has no content script (e.g. chrome:// page, freshly-installed extension
    // on a pre-existing tab). Silently ignore.
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Resolve tabId: popup messages carry an explicit tabId; content-script messages
  // come from sender.tab.
  const tabId = msg.tabId ?? sender.tab?.id;
  if (typeof tabId !== 'number') {
    sendResponse({ ok: false, error: 'no tabId' });
    return false;
  }

  if (msg.type === 'getSettings') {
    sendResponse({ ok: true, settings: getSettings(tabId) });
    return false;
  }

  if (msg.type === 'setSetting') {
    const next = setSetting(tabId, msg.key, msg.value);
    broadcastApply(tabId, next); // fire-and-forget
    sendResponse({ ok: true, settings: next });
    return false;
  }

  sendResponse({ ok: false, error: 'unknown message type' });
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabSettings.delete(tabId)) {
    console.log('[Audio Tweaks] cleared settings for tab', tabId);
  }
});

console.log('[Audio Tweaks] background service worker booted');
```

- [ ] **Step 2.2: Verify the message API**

1. Reload the extension on `edge://extensions`.
2. Click the extension's "Service worker" link to open service-worker DevTools.
3. In its Console, run:

```js
await chrome.runtime.sendMessage({ type: 'getSettings', tabId: 1 })
```

Expected: `{ok: true, settings: {mono: false}}` (the tabId may not exist; the handler still returns defaults).

4. Run:

```js
await chrome.runtime.sendMessage({ type: 'setSetting', tabId: 1, key: 'mono', value: true })
```

Expected: `{ok: true, settings: {mono: true}}`. (You'll likely also see a "no content script" silent failure on the broadcast — that's fine.)

5. Run again:

```js
await chrome.runtime.sendMessage({ type: 'getSettings', tabId: 1 })
```

Expected: `{ok: true, settings: {mono: true}}` — the value persisted in the map.

6. Open a normal browsing tab (e.g., `https://example.com`) and find its tabId via `chrome.tabs.query({active:true, currentWindow:true})` in the service-worker console. Note the id.
7. Close that tab. The service-worker console logs `[Audio Tweaks] cleared settings for tab <id>` (only if you'd previously stored settings under that id; otherwise nothing — that's fine).

---

## Task 3: Popup UI — render mono toggle and disabled rows

**Files:**
- Modify: `popup.html`
- Modify: `popup.css`
- Modify: `popup.js`

- [ ] **Step 3.1: Replace `popup.html` with the full markup**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="popup.css" />
    <title>Audio Tweaks</title>
  </head>
  <body>
    <header>Audio Tweaks</header>
    <div id="status" class="status hidden"></div>
    <ul class="rows" id="rows">
      <li class="row" data-key="mono">
        <input type="checkbox" id="mono" />
        <label for="mono">Mono audio</label>
      </li>
    </ul>
    <div class="section-label">Coming soon</div>
    <ul class="rows roadmap">
      <li class="row disabled">
        <input type="checkbox" disabled />
        <label>Swap channels</label>
      </li>
      <li class="row disabled">
        <input type="checkbox" disabled />
        <label>Volume boost</label>
      </li>
      <li class="row disabled">
        <input type="checkbox" disabled />
        <label>Equalizer</label>
      </li>
    </ul>
    <script src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 3.2: Replace `popup.css` with full styling**

```css
:root {
  --bg: #ffffff;
  --fg: #1f2328;
  --muted: #6b7280;
  --border: #e5e7eb;
  --accent: #1c64c8;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1f2328;
    --fg: #e6edf3;
    --muted: #8d96a0;
    --border: #30363d;
    --accent: #6aa6ff;
  }
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px;
  color: var(--fg);
  background: var(--bg);
  width: 280px;
}

header {
  padding: 12px 14px 10px;
  font-weight: 600;
  font-size: 14px;
  border-bottom: 1px solid var(--border);
}

.section-label {
  padding: 12px 14px 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 6px 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
}

.row label {
  cursor: pointer;
  flex: 1;
}

.row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.row.disabled {
  cursor: default;
  opacity: 0.45;
}

.row.disabled label,
.row.disabled input {
  cursor: default;
}

.status {
  padding: 8px 14px;
  font-size: 12px;
  color: var(--muted);
  background: rgba(127, 127, 127, 0.08);
  border-bottom: 1px solid var(--border);
}

.hidden { display: none; }

#rows .row.disabled-by-page {
  opacity: 0.45;
  cursor: default;
}
#rows .row.disabled-by-page label,
#rows .row.disabled-by-page input {
  cursor: default;
}
```

- [ ] **Step 3.3: Replace `popup.js` with the full popup logic**

```js
const NON_INJECTABLE_SCHEMES = ['chrome:', 'edge:', 'chrome-extension:', 'about:', 'devtools:', 'view-source:'];
const NON_INJECTABLE_HOSTS = ['chrome.google.com', 'microsoftedge.microsoft.com'];

function isInjectableUrl(url) {
  try {
    const u = new URL(url);
    if (NON_INJECTABLE_SCHEMES.includes(u.protocol)) return false;
    if (NON_INJECTABLE_HOSTS.includes(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setRowEnabled(row, enabled) {
  row.classList.toggle('disabled-by-page', !enabled);
  row.querySelector('input').disabled = !enabled;
}

function showStatus(text) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.classList.remove('hidden');
}

async function init() {
  const tab = await activeTab();
  const monoRow = document.querySelector('.row[data-key="mono"]');
  const monoBox = document.getElementById('mono');

  if (!tab || !tab.url || !isInjectableUrl(tab.url)) {
    showStatus('Not available on this page.');
    setRowEnabled(monoRow, false);
    return;
  }

  let resp;
  try {
    resp = await chrome.runtime.sendMessage({ type: 'getSettings', tabId: tab.id });
  } catch (e) {
    showStatus('Extension not ready. Try reloading the page.');
    setRowEnabled(monoRow, false);
    return;
  }

  if (!resp?.ok) {
    showStatus('Could not load settings.');
    setRowEnabled(monoRow, false);
    return;
  }

  monoBox.checked = !!resp.settings.mono;

  monoBox.addEventListener('change', async () => {
    const value = monoBox.checked;
    const r = await chrome.runtime.sendMessage({
      type: 'setSetting', tabId: tab.id, key: 'mono', value
    });
    if (!r?.ok) {
      // Revert on failure.
      monoBox.checked = !value;
      showStatus('Failed to update setting.');
    }
  });
}

init();
```

- [ ] **Step 3.4: Verify the popup**

1. Reload the extension on `edge://extensions`.
2. Open `https://example.com`.
3. Click the extension icon. Popup shows:
   - Header "Audio Tweaks"
   - One enabled checkbox row: "Mono audio" (unchecked)
   - Section label "Coming soon"
   - Three greyed-out rows: "Swap channels", "Volume boost", "Equalizer"
4. Toggle the mono checkbox ON. Close the popup, reopen it. The checkbox is still ON — settings round-tripped through the background.
5. In the service worker DevTools console, run `tabSettings` (after a `console.log(tabSettings)` if needed) — confirm the active tab's id is in the map with `mono: true`. (Or: send `{type:'getSettings', tabId: <activeTabId>}` and confirm.)
6. Open a new tab and navigate to `chrome://settings` (or `edge://settings`). Click the extension icon. Popup shows the toggle disabled, status row reads "Not available on this page."
7. Open a fresh tab on `https://example.com`. Click the icon. Mono is unchecked (per-tab default), confirming tabs are independent.

---

## Task 4: Content script + injected.js bootstrap

**Files:**
- Modify: `content.js`
- Modify: `injected.js`

This task wires up the message path **but does no audio processing yet**. After it, an `apply` message starting at the popup arrives in the page world. Audio processing lands in Task 5.

- [ ] **Step 4.1: Replace `content.js` with the relay implementation**

```js
const TAG = '[Audio Tweaks]';

// Inject the page-world script. <script src=...> works because injected.js
// is listed in manifest.web_accessible_resources.
function injectPageScript() {
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    s.async = false;
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {
    console.warn(TAG, 'failed to inject page script:', e);
  }
}

// Forward background -> page world.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'apply') {
    window.postMessage({ source: 'audio-tweaks', type: 'apply', settings: msg.settings }, '*');
  }
});

// Ask for current settings on (re)load and forward them in.
async function pullInitialSettings() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'getSettings' });
    if (resp?.ok) {
      window.postMessage({ source: 'audio-tweaks', type: 'apply', settings: resp.settings }, '*');
    }
  } catch (_) {
    // Background not ready yet on extension install / first run; ignore.
  }
}

injectPageScript();
pullInitialSettings();
```

- [ ] **Step 4.2: Replace `injected.js` with the bootstrap stub**

```js
(() => {
  const TAG = '[Audio Tweaks]';
  let currentSettings = { mono: false };

  function applySettings(settings) {
    currentSettings = settings;
    console.log(TAG, 'apply settings (no graph yet)', settings);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.source !== 'audio-tweaks') return;
    if (data.type === 'apply') applySettings(data.settings);
  });

  console.log(TAG, 'injected script ready in', location.href);
})();
```

- [ ] **Step 4.3: Verify the message path end-to-end**

1. Reload the extension.
2. Open `https://example.com` and DevTools → Console.
3. Confirm `[Audio Tweaks] injected script ready in https://example.com/` is logged.
4. Confirm `[Audio Tweaks] apply settings (no graph yet) {mono: false}` is logged shortly after (from `pullInitialSettings`).
5. Click the toolbar icon, toggle Mono ON.
6. The page console immediately logs: `[Audio Tweaks] apply settings (no graph yet) {mono: true}`.
7. Toggle OFF — same path, `{mono: false}`.

If step 3 fails: the injected script wasn't loaded. Check DevTools → Network for `injected.js` (filter "JS"). A 404 means `web_accessible_resources` is missing or the path is wrong in `manifest.json`.

If step 4 fails but the toggle works (step 6): `pullInitialSettings` race; not blocking.

If steps 5-6 fail: the popup → background → content-script → injected hop is broken. Check service-worker console for errors and the page console for postMessage logs.

---

## Task 5: Injected script — audio graph for `<audio>` and `<video>`

**Files:**
- Modify: `injected.js`

After this task, mono works on plain `<audio>`/`<video>` elements (Task 5 verification uses `test-pages/stereo-tone.html` and YouTube). `AudioContext`-based pages still bypass the graph; they're handled in Task 6.

- [ ] **Step 5.1: Replace `injected.js` with the media-element graph implementation**

```js
(() => {
  const TAG = '[Audio Tweaks]';
  let currentSettings = { mono: false };

  // One AudioContext per page is enough for HTMLMediaElement sources.
  // We construct it lazily on the first <audio>/<video> we see — creating one
  // before any user gesture can leave it suspended on some browsers, but for
  // an already-playing media element resume() works without a gesture.
  let sharedCtx = null;
  function getSharedCtx() {
    if (!sharedCtx) {
      sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => {});
    return sharedCtx;
  }

  // For each media element, we keep a graph handle whose nodes we mutate.
  const elementGraphs = new WeakMap();
  // Elements that threw during attachment (e.g. CORS-tainted) are skipped forever.
  const skippedElements = new WeakSet();

  // Build the fixed graph: source -> mono -> splitter -> merger -> boost -> eq -> destination.
  // All nodes always exist; toggles flip parameters.
  function buildGraph(ctx, source) {
    const mono = ctx.createGain();
    mono.gain.value = 1.0;
    mono.channelCount = 2;
    mono.channelCountMode = 'explicit';
    mono.channelInterpretation = 'speakers';

    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);

    const boost = ctx.createGain();
    boost.gain.value = 1.0;

    const eq = ctx.createBiquadFilter();
    eq.type = 'allpass'; // pass-through placeholder

    source.connect(mono);
    mono.connect(splitter);
    // straight wiring (swap OFF): L -> 0, R -> 1
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 1, 1);
    merger.connect(boost);
    boost.connect(eq);
    eq.connect(ctx.destination);

    return { mono, splitter, merger, boost, eq };
  }

  // Apply current settings to a graph. Mono ON: GainNode downmixes 2->1 and the
  // downstream stereo path upmixes back to 2 by duplicating, so both speakers
  // carry (L+R) — perceived as mono.
  function applyToGraph(graph, settings) {
    graph.mono.channelCount = settings.mono ? 1 : 2;
  }

  function attachToElement(el) {
    if (elementGraphs.has(el) || skippedElements.has(el)) return;
    let ctx, source, graph;
    try {
      ctx = getSharedCtx();
      source = ctx.createMediaElementSource(el);
      graph = buildGraph(ctx, source);
      elementGraphs.set(el, graph);
      applyToGraph(graph, currentSettings);
    } catch (e) {
      // Most common: "HTMLMediaElement already connected to a different
      // MediaElementSourceNode" or CORS-tainted media. Skip permanently.
      skippedElements.add(el);
      console.warn(TAG, 'skip element', el, e);
    }
  }

  function scanAll(root) {
    root.querySelectorAll?.('audio, video').forEach(attachToElement);
  }

  function applyToAllElements(settings) {
    // WeakMap has no iteration; we re-scan the document. New elements without a
    // graph attach lazily anyway, so this also covers them.
    document.querySelectorAll('audio, video').forEach((el) => {
      const g = elementGraphs.get(el);
      if (g) applyToGraph(g, settings);
      else attachToElement(el);
    });
  }

  // Discover existing elements once the DOM is parseable.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scanAll(document), { once: true });
  } else {
    scanAll(document);
  }

  // Discover new elements as the page mutates.
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('audio, video')) attachToElement(n);
        if (n.querySelectorAll) scanAll(n);
      }
    }
  });
  mo.observe(document.documentElement || document, { childList: true, subtree: true });

  // Receive settings from the content script.
  function applySettings(settings) {
    currentSettings = settings;
    applyToAllElements(settings);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.source !== 'audio-tweaks') return;
    if (data.type === 'apply') applySettings(data.settings);
  });

  console.log(TAG, 'injected script ready in', location.href);
})();
```

- [ ] **Step 5.2: Verify mono on a plain `<audio>` element**

1. Reload the extension.
2. Open `c:\Users\Shohei\Dev\personal\ext\audio\test-pages\stereo-tone.html` in a browser tab (drag-and-drop, or `file:///c:/Users/Shohei/Dev/personal/ext/audio/test-pages/stereo-tone.html`).
3. If using `file://`, ensure "Allow access to file URLs" is enabled on the extension's details page.
4. Wait for the `<audio>` element's controls to populate (a couple seconds for the WAV to render).
5. Click Play. With **mono OFF** (popup), confirm: 440 Hz only in the LEFT speaker, 880 Hz only in the RIGHT speaker.
6. Toggle **mono ON** in the popup. Without restarting playback, both speakers should now carry both tones (the summed signal). If you don't hear an immediate change, pause and resume — some browsers re-route on next playback event.
7. Toggle **mono OFF** again. Stereo separation returns.

- [ ] **Step 5.3: Verify mono on YouTube (real-world `<video>` element)**

1. Open a YouTube video with stereo content (any music video).
2. With **mono OFF**, confirm normal stereo separation (use headphones).
3. Toggle **mono ON**. Stereo separation collapses; both ears hear the summed signal.
4. Toggle **mono OFF**. Stereo returns.
5. Reload the YouTube page. Mono setting persists (the `apply` is sent on content-script startup).

- [ ] **Step 5.4: Verify Web Audio test page does NOT yet work**

1. Open `test-pages/webaudio-tone.html`.
2. Click Start. With **mono ON**, separation is **still** present — this is expected; AudioContext-based audio is intercepted in Task 6, not here.
3. Click Stop.

(This is a pre-condition check before Task 6 lands.)

---

## Task 6: Injected script — AudioContext proxy for Web Audio applications

**Files:**
- Modify: `injected.js`

`AudioContext.destination` is read-only and per-instance, so we can't simply replace it. The robust trick is to monkey-patch `AudioNode.prototype.connect`: any time *any* node tries to connect to a `AudioDestinationNode`, we transparently insert our graph between them. The first such call per `AudioContext` lazily builds and installs the graph.

- [ ] **Step 6.1: Add the AudioContext-side graph at the top of the IIFE in `injected.js`**

Insert the following block in `injected.js` immediately after `let currentSettings = { mono: false };` and before `let sharedCtx = null;`:

```js
  // === AudioContext interception ============================================
  // For every page-created AudioContext, we install one graph between any node
  // the page connects to ctx.destination and the actual destination.
  const contextGraphs = new Map(); // AudioContext -> graph handle (entry node + chain)

  function buildEntryGraph(ctx) {
    // Same chain as for media elements, but the "source" here is a pass-through
    // GainNode that we expose as the entry point.
    const entry = ctx.createGain();
    entry.gain.value = 1.0;

    const mono = ctx.createGain();
    mono.gain.value = 1.0;
    mono.channelCount = 2;
    mono.channelCountMode = 'explicit';
    mono.channelInterpretation = 'speakers';

    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);

    const boost = ctx.createGain();
    boost.gain.value = 1.0;

    const eq = ctx.createBiquadFilter();
    eq.type = 'allpass';

    entry.connect(mono);
    mono.connect(splitter);
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 1, 1);
    merger.connect(boost);
    boost.connect(eq);
    eq.connect(ctx.destination);

    return { entry, mono, splitter, merger, boost, eq };
  }

  function getOrCreateContextGraph(ctx) {
    let g = contextGraphs.get(ctx);
    if (!g) {
      try {
        g = buildEntryGraph(ctx);
        contextGraphs.set(ctx, g);
        applyToGraph(g, currentSettings);
      } catch (e) {
        console.warn(TAG, 'failed to install AudioContext graph', e);
        return null;
      }
    }
    return g;
  }

  function patchConnect() {
    if (typeof AudioNode === 'undefined' || AudioNode.prototype.__audioTweaksPatched) return;
    const origConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function patchedConnect(target, ...rest) {
      try {
        if (target && typeof AudioDestinationNode !== 'undefined' && target instanceof AudioDestinationNode) {
          const g = getOrCreateContextGraph(this.context);
          if (g) return origConnect.call(this, g.entry, ...rest);
        }
      } catch (e) {
        console.warn(TAG, 'connect patch error, falling back', e);
      }
      return origConnect.call(this, target, ...rest);
    };
    Object.defineProperty(AudioNode.prototype, '__audioTweaksPatched', {
      value: true, enumerable: false, configurable: false, writable: false
    });
  }

  patchConnect();
  // === end AudioContext interception ========================================
```

- [ ] **Step 6.2: Update `applyToAllElements` to also iterate context graphs**

Replace the `applyToAllElements` function in `injected.js` with:

```js
  function applyToAllElements(settings) {
    document.querySelectorAll('audio, video').forEach((el) => {
      const g = elementGraphs.get(el);
      if (g) applyToGraph(g, settings);
      else attachToElement(el);
    });
    for (const g of contextGraphs.values()) applyToGraph(g, settings);
  }
```

- [ ] **Step 6.3: Verify Web Audio test page now respects mono**

1. Reload the extension. Reload `test-pages/webaudio-tone.html`.
2. Click Start. With **mono OFF**, confirm 440 Hz LEFT, 880 Hz RIGHT.
3. Toggle **mono ON**. Both speakers carry the summed signal.
4. Toggle **mono OFF**. Stereo separation returns.
5. Click Stop, click Start again. Behavior consistent — the graph is re-used because the page reuses the same `AudioContext`.

- [ ] **Step 6.4: Regression check — make sure `<audio>` path still works**

1. Reload `test-pages/stereo-tone.html`.
2. Toggle mono ON/OFF; behavior matches Task 5.2.

- [ ] **Step 6.5: Regression check — patch tolerates pages without `AudioContext` use**

1. Open `https://example.com` (a page that uses no Web Audio).
2. DevTools console shows the injected-script log line and no errors.
3. Toggle mono ON/OFF; the page console should show no warnings related to the connect patch.

---

## Task 7: Polish — full manual test sweep, README finalization

**Files:**
- Modify: `README.md` (only if any of the manual tests reveal a gap)

This task has no new code; it's the final acceptance pass for v0.1.

- [ ] **Step 7.1: Run the full manual test checklist**

Execute every row in the table in `README.md` (12 rows). Note any failure.

- [ ] **Step 7.2: Investigate and fix any failures**

For each failure, debug and patch the relevant file. Re-run the failing test and any related row in the checklist.

Common failure modes and where to look:
| Symptom | Likely file |
|---------|-------------|
| Popup doesn't open / blank | `popup.html`, `popup.js` (script error in console) |
| Toggle doesn't persist across popup reopen | `background.js` message handlers |
| Mono toggle has no audio effect on `<audio>` | `injected.js` element graph (Task 5) |
| Mono toggle has no effect on Web Audio | `injected.js` AudioContext patch (Task 6) |
| Setting lost on tab reload | `content.js` `pullInitialSettings` |
| Setting lost on navigation within tab | same — content script runs at `document_start` on every navigation |
| chrome:// page popup not disabled | `popup.js` `isInjectableUrl` |

- [ ] **Step 7.3: Update README if anything was learned**

If any test required extra setup steps (e.g., "Allow access to file URLs" toggle), add a note in the README's install section.

- [ ] **Step 7.4: Final smoke**

1. Disable the extension, then re-enable it.
2. Reload `https://example.com`.
3. Click the icon. Popup loads with mono OFF.
4. Toggle ON, hear mono on a YouTube tab.
5. Done.

---

## Self-review summary

This plan covers, in order:

1. **Project scaffolding + manifest + icons + test pages + README** — extension loads.
2. **Background service worker state and messaging** — `getSettings`/`setSetting` work; tab close clears.
3. **Popup UI** — full UI with mono enabled, three roadmap rows greyed; non-injectable scheme detection.
4. **Content script + injected.js bootstrap** — message path verified end-to-end without audio.
5. **`<audio>`/`<video>` graph and mono activation** — mono works on plain media elements and YouTube.
6. **AudioContext proxy via `AudioNode.prototype.connect` patch** — mono works on Web Audio apps.
7. **Final manual test sweep and README polish** — all 12 checklist rows pass.

Spec sections mapped to tasks: user-facing behavior → Tasks 3, 5, 6, 7; architecture → Tasks 2, 4, 5, 6; audio graph → Tasks 5, 6; messaging & state flow → Tasks 2, 4; popup UI → Task 3; file layout → Task 1; manifest → Task 1; error handling → Tasks 2, 4 (silent broadcast failure), 5 (skipped elements), 6 (try/catch in patched connect); testing strategy → Task 1 (test pages + README checklist) and Task 7 (final sweep).
