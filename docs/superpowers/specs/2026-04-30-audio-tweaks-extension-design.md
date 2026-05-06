# Audio Tweaks — Browser Extension Design

**Date:** 2026-04-30
**Target browsers:** Chromium-based (Edge, Chrome) — Manifest V3
**Initial version:** 0.1.0

## Goal

A browser extension that exposes per-tab audio adjustments through its toolbar popup. Version 0.1 ships a single feature — **force mono audio** — and is structured so future features (channel swap, volume boost, equalizer) plug in without architectural change.

## User-facing behavior

- Clicking the extension icon opens a small popup listing audio toggles for the **active tab**.
- Version 0.1 has one active toggle, **Mono audio**, plus three greyed-out, disabled rows (**Swap channels**, **Volume boost**, **Equalizer**) that signal the roadmap.
- Toggling **Mono audio** mixes left and right channels of all audio playing in the tab so both speakers play the same summed signal. Unchecking restores the original stereo output.
- The setting is **per-tab** and lives for the lifetime of the tab. It survives reloads and same-tab navigation. Closing the tab discards it.
- On pages where extensions cannot run (`chrome://`, `edge://`, extension pages, etc.), the popup shows the toggles disabled with a one-line note: "Not available on this page."

Whether a toggle takes effect on audio that is *already playing* vs. only on audio that starts after the toggle is unspecified — whichever the chosen implementation gives us is acceptable.

## Architecture

Four runtime parts:

1. **Popup** (`popup.html` + `popup.js` + `popup.css`)
   The UI shown when the toolbar icon is clicked. On open, queries the background for the active tab's settings and renders the toggle states. On user toggle, sends an update to the background.

2. **Background service worker** (`background.js`)
   Manifest V3 service worker. Holds an in-memory `Map<tabId, settings>`. Routes messages between popup and content scripts, and clears the map entry when a tab closes (`chrome.tabs.onRemoved`).

3. **Content script** (`content.js`)
   Injected into every frame of every page at `document_start`. Runs in the isolated world. Its job is to (a) inject `injected.js` into the page world, (b) relay messages between the background and `injected.js` via `window.postMessage`.

4. **Injected page-world script** (`injected.js`)
   Runs in the page's own JavaScript world (required to monkey-patch `HTMLMediaElement` and `AudioContext`). Discovers `<audio>`/`<video>` elements and `AudioContext` instances, builds an audio graph for each, and exposes a small message API to flip settings.

## Audio graph

For every `<audio>`/`<video>` element and for every page-created `AudioContext`, `injected.js` builds one persistent graph that all current and future features plug into:

```
MediaElementSource (or AudioContext destination tap)
   → MonoNode      (GainNode; channelCount=1, channelCountMode='clamped-max',
                                  channelInterpretation='speakers' when ON;
                                  channelCount=2 when OFF)
   → SwapNode      (ChannelSplitter → ChannelMerger;
                                  straight wiring when OFF, crossed when ON)
   → BoostNode     (GainNode; gain = 1.0 in 0.1)
   → EQNode chain  (BiquadFilters; flat in 0.1)
   → AudioContext.destination
```

All nodes are created up front and are always part of the chain. Toggles do **not** add or remove nodes; they flip parameters between an active and a bypass state. This keeps the graph stable and makes adding the future features a UI + parameter change rather than graph surgery.

**Element discovery.** A `MutationObserver` on `document` catches `<audio>`/`<video>` added later (SPAs, ads, lazy players). For pages that use `AudioContext` directly, `window.AudioContext` and `webkitAudioContext` are proxied so any context the page constructs is wrapped.

**Per-element bookkeeping.** A `WeakMap<HTMLMediaElement, GraphHandle>` ties each element to its graph. Applying a toggle iterates the map and updates each graph.

## Messaging & state flow

State shape in the background service worker:

```js
tabSettings: Map<tabId, { mono: boolean }>
```

Default for a new tab: `{ mono: false }`. Future toggles add more keys to the same object.

**Popup opens:**
1. Popup gets the active tab via `chrome.tabs.query({active: true, currentWindow: true})`.
2. Popup sends `{type: 'getSettings', tabId}` to the background.
3. Background replies with the settings object (or default).
4. Popup renders the toggles from that object.

**User toggles a setting:**
1. Popup sends `{type: 'setSetting', tabId, key: 'mono', value: true}` to the background.
2. Background updates its `Map` entry, then forwards `{type: 'apply', settings}` to the tab via `chrome.tabs.sendMessage`.
3. The content script receives it and forwards via `window.postMessage` to `injected.js` (the only way to cross isolated/page worlds).
4. `injected.js` walks its `WeakMap` and updates each graph's relevant node.

**Tab loads / reloads / SPA-navigates:**
1. Content script runs at `document_start` on every navigation.
2. Content script asks the background for the current settings on startup and applies them via the same path. Settings therefore survive navigation within the tab.

**Tab closes:**
1. Background listens to `chrome.tabs.onRemoved` and deletes the entry from `tabSettings`.

**Iframes.** The manifest sets `all_frames: true`; each frame gets its own content script. The background broadcasts `apply` to the tab; Chrome routes it to all frames.

## Popup UI

A ~280px-wide popup styled to match the neutral browser chrome. The body is a list of feature rows so adding future features means appending more rows.

```
┌────────────────────────────────┐
│ Audio Tweaks                   │
│ ────────────────────────────── │
│ [✓] Mono audio                 │
│                                │
│  (Coming soon)                 │
│  [ ] Swap channels   (greyed)  │
│  [ ] Volume boost    (greyed)  │
│  [ ] Equalizer       (greyed)  │
└────────────────────────────────┘
```

- Each row is a flex container `[checkbox] [label]`.
- "Coming soon" rows are visible-but-disabled with reduced opacity.
- The popup updates the UI optimistically on toggle.
- If the active tab is on a non-injectable scheme (`chrome://`, `edge://`, `chrome-extension://`), all toggles are disabled and a one-line note is shown.

## File layout

```
audio/
├── manifest.json
├── background.js          # service worker: state map + message router
├── content.js             # injected into every frame; relays messages, loads injected.js
├── injected.js            # runs in page world; intercepts media + AudioContext, owns the audio graph
├── popup.html             # popup markup with the toggle list
├── popup.css              # styling
├── popup.js               # popup logic
├── README.md              # install + manual test checklist
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Manifest (v3)

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
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "run_at": "document_start",
    "all_frames": true
  }],
  "web_accessible_resources": [{
    "resources": ["injected.js"],
    "matches": ["<all_urls>"]
  }],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

Notes:
- `<all_urls>` is required because audio can play on any site.
- `web_accessible_resources` lets the content script load `injected.js` via `chrome.runtime.getURL(...)` into the page world.
- The `scripting` permission is included as a fallback path in case the world-injection model changes.
- Placeholder icons (a small speaker glyph) ship with v0.1; they can be replaced later.

## Error handling

The extension must never break a page. Failures fall back to leaving audio unprocessed.

- **`MediaElementSource` throws** (typically on a CORS-tainted element): catch, mark the element as skipped in the `WeakMap` so we don't retry on every mutation, leave that element's audio untouched.
- **AudioContext proxy misses a context**: only contexts created after `injected.js` runs are wrapped. Pre-existing contexts (rare; most sites create theirs post-load) are missed in 0.1. Acceptable.
- **Cross-origin iframe**: content script runs independently in each frame; no special handling needed.
- **Page CSP blocks the injected script**: content script catches the load failure and logs a console warning. The page's audio stays unprocessed.
- **`chrome.tabs.sendMessage` to a tab without a content script** (e.g., `chrome://`, brand-new install on a pre-existing tab): the background catches the rejection and ignores it. The popup also detects non-injectable URL schemes and shows the disabled state up front.
- **Browser restart**: tabIds are fresh, so settings start clean — matches the per-tab session model.

## Testing strategy

Manual only in v0.1. A README documents the checklist:

1. **Smoke**: load unpacked, click icon, popup renders with mono unchecked, three greyed rows.
2. **Plain `<audio>`**: stereo test tone in a bare HTML page; toggle mono; both channels carry the summed signal.
3. **YouTube `<video>`**: stereo content; toggle mono; verify.
4. **Web Audio app**: a page using `new AudioContext()` (e.g., a Tone.js demo); confirm the proxy applies.
5. **Per-tab isolation**: two tabs, mono on in A, off in B; confirm independence.
6. **Persistence within tab**: toggle on, navigate or reload; setting still on.
7. **Tab close cleanup**: service worker logs the `tabSettings` entry being removed.
8. **Non-injectable page**: `chrome://settings`; popup shows disabled toggles with the "Not available" note.
9. **Iframes**: a page embedding a YouTube iframe; mono applies.

No automated tests in v0.1.

## Out of scope (for v0.1)

- Channel swap, volume boost, equalizer — designed for, not implemented.
- Per-origin (rather than per-tab) settings.
- Persistence across browser restart.
- Disabled-origins list.
- Localization.
- Custom icons (placeholders only).
- Firefox / Safari support.
