# Channel Gain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-channel gain sliders (Left and Right) to the popup. Each slider runs from -40 dB to +12 dB with a midpoint of 0 dB (passthrough). Settings persist per-tab and apply in real time to all `<audio>`/`<video>` elements and `AudioContext`-based audio.

**Architecture:** Two new `GainNode`s slot between the existing splitter and merger in both `buildGraph` (media-element path) and `buildEntryGraph` (AudioContext path) inside `injected.js`. The popup sends dB values via the existing `setSetting` message API; `applyToGraph` converts dB → linear gain and assigns to the nodes' `gain.value`. No new message types, no new background-state structure beyond two extra keys.

**Tech Stack:** Vanilla JS (no build step), Web Audio API, Manifest V3 messaging.

**Spec:** [docs/superpowers/specs/2026-05-05-channel-gain-design.md](../specs/2026-05-05-channel-gain-design.md)
**v0.1 baseline spec:** [docs/superpowers/specs/2026-04-30-audio-tweaks-extension-design.md](../specs/2026-04-30-audio-tweaks-extension-design.md)
**v0.1 plan:** [docs/superpowers/plans/2026-04-30-audio-tweaks-extension.md](./2026-04-30-audio-tweaks-extension.md)

**Notes for the implementer:**
- This project does **not** use git. Skip every commit step. Each task ends with a manual verification step.
- v0.1 is shipped and working. Mono toggle works on `<audio>`/`<video>` (incl. YouTube) and on AudioContext pages. The audio chain is currently `source → splitter → merger → mono → boost → eq → destination` and the splitter→merger pair is currently a passthrough — the new gain nodes go in there.
- Working directory: `c:\Users\Shohei\Dev\personal\ext\audio`.
- All verification is manual via Edge/Chrome with the unpacked extension. After file changes, click reload on the extension's card and reload any open test page.
- The user uses **headphones** to verify L/R behavior.

---

## File Structure

Files modified:

```
audio/
├── background.js          # extend DEFAULTS (Task 1)
├── injected.js            # extend buildGraph, buildEntryGraph, applyToGraph; add dbToLinear (Task 2)
├── popup.html             # add channel-gain section (Task 3)
├── popup.css              # add slider-row styles (Task 3)
├── popup.js               # initialize sliders, wire handlers, debounce, format dB (Task 4)
└── README.md              # append new test rows 13-19 (Task 5)
```

The audio graph in injected.js owns the audio side; the popup owns the UI side. background.js holds the per-tab state and stays mostly untouched (just two more default keys). The `setSetting` message API is already key-agnostic — no message-shape changes.

---

## Task 1: Background — extend DEFAULTS

**Files:**
- Modify: `background.js`

The background's `DEFAULTS` constant currently has only `mono: false`. Add `leftGainDb: 0` and `rightGainDb: 0`. The rest of the message-handling code already accepts arbitrary `(key, value)` pairs, so no other changes here.

- [ ] **Step 1.1: Update DEFAULTS in `background.js`**

Open `c:\Users\Shohei\Dev\personal\ext\audio\background.js`. Find:

```js
const DEFAULTS = Object.freeze({ mono: false });
```

Replace with:

```js
const DEFAULTS = Object.freeze({ mono: false, leftGainDb: 0, rightGainDb: 0 });
```

That's the only change to this file.

- [ ] **Step 1.2: Verify the new defaults**

1. Reload the extension on `edge://extensions`.
2. Open the extension's service-worker DevTools console.
3. Run:

```js
getSettings(999)
```

Expected: `{mono: false, leftGainDb: 0, rightGainDb: 0}`

If you previously stored settings on a real tab during earlier testing and want to clear them:

```js
tabSettings.clear()
```

Then re-run `getSettings(999)` to confirm defaults.

---

## Task 2: Audio graph — add leftGain/rightGain nodes

**Files:**
- Modify: `injected.js`

Add a `dbToLinear` helper, extend `buildGraph` (media-element path) to insert two GainNodes between splitter and merger, do the same in `buildEntryGraph` (AudioContext path), and extend `applyToGraph` to set the gain values from settings.

After this task, mono still works the same on the test pages (regression). The new gain nodes default to 0 dB (passthrough), so audio is unchanged until the popup wires up the sliders in Task 4.

- [ ] **Step 2.1: Add the `dbToLinear` helper**

Open `c:\Users\Shohei\Dev\personal\ext\audio\injected.js`. Inside the IIFE, immediately after the line `let currentSettings = { mono: false };`, add:

```js
  const dbToLinear = (db) => Math.pow(10, db / 20);
```

(One line. The helper is small enough to live next to currentSettings.)

- [ ] **Step 2.2: Update `buildEntryGraph` (AudioContext path)**

Find the entire `buildEntryGraph` function. It currently looks like this:

```js
  function buildEntryGraph(ctx) {
    // Same chain as for media elements, but with a pass-through GainNode as the
    // entry point. Mono lives AFTER the splitter+merger pair (matching the
    // corrected order in buildGraph) so its 1-channel output upmixes correctly
    // to both speakers at ctx.destination.
    const entry = ctx.createGain();
    entry.gain.value = 1.0;

    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);

    const mono = ctx.createGain();
    mono.gain.value = 1.0;
    mono.channelCount = 2;
    mono.channelCountMode = 'explicit';
    mono.channelInterpretation = 'speakers';

    const boost = ctx.createGain();
    boost.gain.value = 1.0;

    const eq = ctx.createBiquadFilter();
    eq.type = 'allpass';

    entry.connect(splitter);
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 1, 1);
    merger.connect(mono);
    mono.connect(boost);
    boost.connect(eq);
    eq.connect(ctx.destination);

    return { entry, mono, splitter, merger, boost, eq };
  }
```

Replace it with this version (adds `leftGain` and `rightGain` between splitter and merger, exposes them in the returned handle):

```js
  function buildEntryGraph(ctx) {
    // Same chain as for media elements, but with a pass-through GainNode as the
    // entry point. Mono lives AFTER the splitter+merger pair so its 1-channel
    // output upmixes correctly to both speakers at ctx.destination.
    const entry = ctx.createGain();
    entry.gain.value = 1.0;

    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);

    // Per-channel gain nodes: one for each channel between splitter and merger.
    const leftGain = ctx.createGain();
    leftGain.gain.value = 1.0;
    const rightGain = ctx.createGain();
    rightGain.gain.value = 1.0;

    const mono = ctx.createGain();
    mono.gain.value = 1.0;
    mono.channelCount = 2;
    mono.channelCountMode = 'explicit';
    mono.channelInterpretation = 'speakers';

    const boost = ctx.createGain();
    boost.gain.value = 1.0;

    const eq = ctx.createBiquadFilter();
    eq.type = 'allpass';

    entry.connect(splitter);
    splitter.connect(leftGain, 0);
    splitter.connect(rightGain, 1);
    leftGain.connect(merger, 0, 0);
    rightGain.connect(merger, 0, 1);
    merger.connect(mono);
    mono.connect(boost);
    boost.connect(eq);
    eq.connect(ctx.destination);

    return { entry, mono, splitter, leftGain, rightGain, merger, boost, eq };
  }
```

- [ ] **Step 2.3: Update `buildGraph` (media-element path)**

Find the entire `buildGraph` function (further down in `injected.js`):

```js
  function buildGraph(ctx, source) {
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);

    const mono = ctx.createGain();
    mono.gain.value = 1.0;
    mono.channelCount = 2;
    mono.channelCountMode = 'explicit';
    mono.channelInterpretation = 'speakers';

    const boost = ctx.createGain();
    boost.gain.value = 1.0;

    const eq = ctx.createBiquadFilter();
    eq.type = 'allpass'; // pass-through placeholder

    source.connect(splitter);
    // straight wiring (swap OFF): L -> 0, R -> 1
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 1, 1);
    merger.connect(mono);
    mono.connect(boost);
    boost.connect(eq);
    eq.connect(ctx.destination);

    return { mono, splitter, merger, boost, eq };
  }
```

Replace it with:

```js
  function buildGraph(ctx, source) {
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);

    // Per-channel gain nodes: one for each channel between splitter and merger.
    const leftGain = ctx.createGain();
    leftGain.gain.value = 1.0;
    const rightGain = ctx.createGain();
    rightGain.gain.value = 1.0;

    const mono = ctx.createGain();
    mono.gain.value = 1.0;
    mono.channelCount = 2;
    mono.channelCountMode = 'explicit';
    mono.channelInterpretation = 'speakers';

    const boost = ctx.createGain();
    boost.gain.value = 1.0;

    const eq = ctx.createBiquadFilter();
    eq.type = 'allpass'; // pass-through placeholder

    source.connect(splitter);
    splitter.connect(leftGain, 0);
    splitter.connect(rightGain, 1);
    leftGain.connect(merger, 0, 0);
    rightGain.connect(merger, 0, 1);
    merger.connect(mono);
    mono.connect(boost);
    boost.connect(eq);
    eq.connect(ctx.destination);

    return { mono, splitter, leftGain, rightGain, merger, boost, eq };
  }
```

- [ ] **Step 2.4: Update `applyToGraph`**

Find the current `applyToGraph`:

```js
  function applyToGraph(graph, settings) {
    graph.mono.channelCount = settings.mono ? 1 : 2;
  }
```

Replace it with:

```js
  function applyToGraph(graph, settings) {
    graph.mono.channelCount = settings.mono ? 1 : 2;
    graph.leftGain.gain.value  = dbToLinear(settings.leftGainDb  ?? 0);
    graph.rightGain.gain.value = dbToLinear(settings.rightGainDb ?? 0);
  }
```

The `?? 0` defaulting means tabs whose stored settings predate this feature continue to work.

- [ ] **Step 2.5: Verify regression — mono still works; no errors**

1. Reload the extension.
2. Open `c:\Users\Shohei\Dev\personal\ext\audio\test-pages\stereo-tone.html`.
3. Open page DevTools → Console. Confirm no red errors related to `connect`, `gain`, or `Cannot read property`.
4. Play the tone. With mono OFF, expect 440 Hz LEFT, 880 Hz RIGHT.
5. Toggle mono ON via popup. Expect both ears get the summed signal (same as v0.1).
6. Toggle mono OFF. Stereo separation returns.
7. Open `webaudio-tone.html`. Click Start. Mono toggle should still work the same way.

If mono still works on both test pages and there are no errors, the new gain nodes are wired correctly and default to passthrough. The sliders themselves don't exist yet — that's Tasks 3-4.

- [ ] **Step 2.6: (Optional) Verify the new gain nodes via SW console**

1. With `stereo-tone.html` playing in a tab, open the service-worker DevTools console.
2. Get the active tab id:

```js
const tabId = (await chrome.tabs.query({active:true, currentWindow:true}))[0].id
```

3. Manually push a left-channel cut via the message API:

```js
await chrome.runtime.sendMessage({type:'setSetting', tabId, key:'leftGainDb', value:-40})
```

Expected: the left ear becomes ~silent (linear gain ≈ 0.01). Right ear unchanged.

4. Restore:

```js
await chrome.runtime.sendMessage({type:'setSetting', tabId, key:'leftGainDb', value:0})
```

Left ear returns. This proves the audio plumbing is in place even before the popup gains the sliders.

---

## Task 3: Popup — HTML and CSS for the channel-gain section

**Files:**
- Modify: `popup.html`
- Modify: `popup.css`

After this task, opening the popup shows the new "Channel gain" section with two sliders centered at 0 dB and dB readouts of `0.0 dB`. The sliders are inert (no JS yet) but visible and styled.

- [ ] **Step 3.1: Update `popup.html`**

Open `c:\Users\Shohei\Dev\personal\ext\audio\popup.html`. Find this block:

```html
    <ul class="rows" id="rows">
      <li class="row" data-key="mono">
        <input type="checkbox" id="mono" />
        <label for="mono">Mono audio</label>
      </li>
    </ul>
    <div class="section-label">Coming soon</div>
```

Replace it with (insert the new section between the existing mono `<ul>` and the "Coming soon" `<div>`):

```html
    <ul class="rows" id="rows">
      <li class="row" data-key="mono">
        <input type="checkbox" id="mono" />
        <label for="mono">Mono audio</label>
      </li>
    </ul>
    <div class="section-label">Channel gain</div>
    <ul class="rows" id="gain-rows">
      <li class="slider-row" data-key="leftGainDb">
        <span class="ch-label">L</span>
        <input type="range" min="-40" max="12" step="0.5" value="0"
               title="Double-click to reset to 0 dB" />
        <span class="db-value">0.0 dB</span>
      </li>
      <li class="slider-row" data-key="rightGainDb">
        <span class="ch-label">R</span>
        <input type="range" min="-40" max="12" step="0.5" value="0"
               title="Double-click to reset to 0 dB" />
        <span class="db-value">0.0 dB</span>
      </li>
    </ul>
    <div class="section-label">Coming soon</div>
```

- [ ] **Step 3.2: Add slider-row styles to `popup.css`**

Open `c:\Users\Shohei\Dev\personal\ext\audio\popup.css`. Append these styles to the end of the file:

```css
.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
}

.slider-row .ch-label {
  width: 14px;
  text-align: center;
  font-weight: 600;
  color: var(--muted);
}

.slider-row input[type="range"] {
  flex: 1;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.slider-row .db-value {
  width: 56px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--muted);
}

.slider-row.disabled-by-page {
  opacity: 0.45;
  cursor: default;
}

.slider-row.disabled-by-page input,
.slider-row.disabled-by-page .ch-label,
.slider-row.disabled-by-page .db-value {
  cursor: default;
}
```

- [ ] **Step 3.3: Verify the popup renders**

1. Reload the extension.
2. Open any normal page (e.g., `https://example.com`). Click the toolbar icon.
3. The popup now shows:
   - Header "Audio Tweaks"
   - Mono row (checkbox)
   - Section label "CHANNEL GAIN"
   - Row: `L` `[─────●─────]` `0.0 dB` (slider centered)
   - Row: `R` `[─────●─────]` `0.0 dB` (slider centered)
   - Section label "COMING SOON"
   - Three greyed-out rows (Swap channels / Volume boost / Equalizer)
4. The sliders ARE draggable but moving them has no effect — JS comes in Task 4. The dB readout stays at `0.0 dB` regardless of slider position. That's expected for now.
5. Open the popup on `chrome://settings`. The mono row is greyed and disabled with the "Not available on this page." status. The new slider rows are still styled normally — the disabled-state integration also lands in Task 4.

If everything looks right structurally, proceed.

---

## Task 4: Popup JS — wire up the sliders

**Files:**
- Modify: `popup.js`

This task adds: slider initialization from settings, live dB readout update, debounced `setSetting` send, double-click reset to 0 dB, and disabled-state handling for non-injectable pages (chrome://, etc.).

After this task, the feature is functional end-to-end.

- [ ] **Step 4.1: Replace `popup.js` with the full updated version**

Open `c:\Users\Shohei\Dev\personal\ext\audio\popup.js`. Replace its entire content with:

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
  const input = row.querySelector('input');
  if (input) input.disabled = !enabled;
}

function showStatus(text) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.classList.remove('hidden');
}

function formatDb(v) {
  const fixed = (Math.round(v * 10) / 10).toFixed(1);
  const num = parseFloat(fixed);
  if (num === 0) return '0.0 dB';
  return (num > 0 ? '+' : '') + fixed + ' dB';
}

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

async function init() {
  const tab = await activeTab();
  const monoRow = document.querySelector('.row[data-key="mono"]');
  const monoBox = document.getElementById('mono');
  const sliderRows = document.querySelectorAll('.slider-row');

  function disableAll() {
    setRowEnabled(monoRow, false);
    sliderRows.forEach(r => setRowEnabled(r, false));
  }

  if (!tab || !tab.url || !isInjectableUrl(tab.url)) {
    showStatus('Not available on this page.');
    disableAll();
    return;
  }

  let resp;
  try {
    resp = await chrome.runtime.sendMessage({ type: 'getSettings', tabId: tab.id });
  } catch (e) {
    showStatus('Extension not ready. Try reloading the page.');
    disableAll();
    return;
  }

  if (!resp?.ok) {
    showStatus('Could not load settings.');
    disableAll();
    return;
  }

  monoBox.checked = !!resp.settings.mono;

  monoBox.addEventListener('change', async () => {
    const value = monoBox.checked;
    const r = await chrome.runtime.sendMessage({
      type: 'setSetting', tabId: tab.id, key: 'mono', value
    });
    if (!r?.ok) {
      monoBox.checked = !value;
      showStatus('Failed to update setting.');
    }
  });

  // Per-channel gain sliders.
  for (const row of sliderRows) {
    const key = row.dataset.key;
    const slider = row.querySelector('input[type="range"]');
    const display = row.querySelector('.db-value');

    const initialValue = resp.settings[key] ?? 0;
    slider.value = String(initialValue);
    display.textContent = formatDb(initialValue);

    const sendValue = (val) => {
      chrome.runtime.sendMessage({ type: 'setSetting', tabId: tab.id, key, value: val });
    };
    const debouncedSend = debounce(sendValue, 50);

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      display.textContent = formatDb(v);
      debouncedSend(v);
    });

    slider.addEventListener('dblclick', () => {
      slider.value = '0';
      display.textContent = formatDb(0);
      sendValue(0); // immediate, not debounced — reset is a discrete event
    });
  }
}

init();
```

Key differences vs. the previous popup.js:

- `setRowEnabled` is now generic — it queries `input` inside the row (works for both checkbox rows and slider rows).
- Added `formatDb`, `debounce` helpers.
- Added a per-slider initialization loop that reads `resp.settings[key]`, sets the slider value, attaches `input` (debounced send + live readout update) and `dblclick` (reset + immediate send).
- `disableAll()` covers both the mono row and all slider rows on non-injectable pages.

- [ ] **Step 4.2: End-to-end verification — sliders work**

Reload the extension. Reload `test-pages/stereo-tone.html` and put on **headphones**.

1. **Default state:** open popup. Both sliders centered, both readouts `0.0 dB`. Mono checkbox unchecked. Hit Play on the audio. With mono OFF: 440 Hz LEFT, 880 Hz RIGHT (unchanged from v0.1).

2. **Drag L slider down to about -12 dB:** the readout shows `-12.0 dB` (or thereabouts). The left ear's tone gets noticeably quieter. The right ear is unchanged.

3. **Drag L slider all the way to the bottom (-40 dB):** the left ear is essentially silent (gain ≈ 0.01). The right ear is unchanged.

4. **Drag R slider up to +12 dB:** the right ear's tone gets noticeably louder.

5. **Double-click L slider:** snaps to center, readout shows `0.0 dB`. Left ear returns to original loudness.

6. **Toggle Mono ON with L = -40 dB, R = +12 dB:** mono mix is dominated by the right channel input (right × 4 vs. left × 0.01, then averaged) — both ears hear primarily the right-channel content (880 Hz tone).

7. **Reset both:** Double-click both sliders to 0 dB, toggle Mono OFF. Audio returns to original stereo state.

- [ ] **Step 4.3: Persistence verification**

1. Set L slider to -6 dB. Close the popup, reopen it. Slider should still show -6 dB and readout `-6.0 dB`.
2. Reload the page (Ctrl+R). Open popup. Slider should still show -6 dB. Audio should still be attenuated on the left.

- [ ] **Step 4.4: Web Audio test page verification**

1. Open `test-pages/webaudio-tone.html`. Click Start.
2. With both sliders at 0 dB: 440 Hz LEFT, 880 Hz RIGHT.
3. Drag L slider down. Left tone (440 Hz) gets quieter.
4. Drag R slider up. Right tone (880 Hz) gets louder.
5. Double-click both. Audio returns to neutral.
6. Click Stop.

- [ ] **Step 4.5: Disabled-state verification**

1. Open a tab on `chrome://settings` (or `edge://settings`). Click the toolbar icon.
2. Status row shows "Not available on this page."
3. Mono checkbox is greyed and disabled.
4. **Both slider rows are also greyed (opacity 0.45) and the sliders are non-interactive.**

If the slider rows are still un-greyed on chrome://, the `disableAll()` integration is broken — re-check the loop in `init()`.

---

## Task 5: README updates and final manual sweep

**Files:**
- Modify: `README.md`

The README's manual test checklist needs new rows that cover the channel-gain feature.

- [ ] **Step 5.1: Append new rows 13-19 to the README test table**

Open `c:\Users\Shohei\Dev\personal\ext\audio\README.md`. Find the existing test table that ends with row 12:

```
| 12 | Page that embeds an iframe with audio (e.g. YouTube embed). | Mono toggle affects the embedded audio too. |
```

Append the following rows immediately after row 12 (inside the same table):

```
| 13 | Open popup. | "Channel gain" section appears between Mono and "Coming soon". Both sliders centered (0 dB). Both readouts show `0.0 dB`. |
| 14 | Drag L slider down. | Left ear gets quieter on stereo content; readout updates (e.g. `-12.0 dB`). |
| 15 | Drag R slider up. | Right ear gets louder; readout updates (e.g. `+6.0 dB`). |
| 16 | Set L = -40 dB, R = +12 dB. Toggle Mono ON. | Mono mix is dominated by the right-channel content. |
| 17 | Double-click L slider. | Snaps to 0 dB; readout updates; left ear returns to neutral. |
| 18 | Set L = -6 dB. Reload the page. | Slider still shows -6 dB on next popup open; audio stays attenuated. |
| 19 | Open `chrome://settings`, click extension icon. | Both gain sliders are greyed and disabled along with Mono row; status shows "Not available on this page." |
```

- [ ] **Step 5.2: Run the new test rows**

Walk through rows 13-19 in a real browser. Note any failure.

- [ ] **Step 5.3: Investigate and fix any failures**

For each failing row, debug and patch the relevant file. Re-run the failing row. Common failure modes:

| Symptom | Likely file |
|---------|-------------|
| Section doesn't appear in popup | `popup.html` (Task 3) |
| Sliders aren't styled / `db-value` text wraps | `popup.css` (Task 3) |
| dB readout doesn't update on drag | `popup.js` `input` handler |
| Audio doesn't change when slider moves | `injected.js` `applyToGraph` or `dbToLinear`; or `setSetting` not reaching the tab |
| Slider value doesn't persist across popup reopen | `popup.js` initialization or `background.js` defaults |
| chrome:// page leaves slider rows un-greyed | `popup.js` `disableAll` loop |

- [ ] **Step 5.4: Update CLAUDE.md state notes (optional)**

If the user is going to pause again here, update `CLAUDE.md`'s "Current state" section to reflect that v0.2 channel-gain has shipped. (Not strictly required; the user may want to do this themselves.)

---

## Self-review summary

This plan covers, in order:

1. **Background defaults** — adds two new keys to the per-tab settings default.
2. **Audio graph** — inserts two GainNodes between splitter and merger in both buildGraph and buildEntryGraph; extends applyToGraph to set them from dB-valued settings.
3. **Popup HTML/CSS** — adds the new "Channel gain" section with two slider rows and the styling for them.
4. **Popup JS** — initializes sliders from settings, wires `input` (debounced send + live readout) and `dblclick` (reset + immediate send), generalizes `setRowEnabled` to cover slider rows, and integrates the new rows into the disabled-state path for non-injectable pages.
5. **README + final sweep** — appends 7 new manual test rows (13-19) and walks them through.

Spec sections mapped to tasks: user-facing behavior → Tasks 3, 4, 5; audio graph change → Task 2; settings shape → Task 1, Task 2 (`?? 0` defaulting), Task 4 (initialization); conversion `dbToLinear` → Task 2; messaging path (no change) → Task 1, Task 4; popup UI markup/styling → Task 3; popup behavior → Task 4; manual verification → Task 5.

Type/name consistency: `leftGain`/`rightGain` (graph node names) and `leftGainDb`/`rightGainDb` (settings keys) used consistently across Tasks 1, 2, and 4. The `data-key` attribute on each slider row matches the settings key, which Task 4's `for (const row of sliderRows)` loop reads via `row.dataset.key`.
