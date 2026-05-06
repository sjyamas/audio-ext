# Channel Gain — Design

**Date:** 2026-05-05
**Project:** Audio Tweaks browser extension (v0.2 feature)
**Spec for v0.1 baseline:** [2026-04-30-audio-tweaks-extension-design.md](./2026-04-30-audio-tweaks-extension-design.md)

## Goal

Add a per-channel gain control to the popup. Two horizontal sliders (Left and Right), each starting at 0 dB (passthrough), each adjusting the gain of its channel independently in a logarithmic dB range from -40 dB to +12 dB. Settings are per-tab and persist for the tab's lifetime, like the existing Mono toggle.

## User-facing behavior

- The popup gains a new section labeled "Channel gain" between the Mono row and the "Coming soon" section.
- Two rows: "L" and "R", each with a horizontal slider and a dB readout (e.g. `0.0 dB`, `+3.5 dB`, `-12.0 dB`).
- Each slider's range is -40 dB (very quiet) to +12 dB (4× boost), step 0.5 dB. Default is 0 dB (1× gain, passthrough).
- Dragging a slider:
  - Updates the dB readout immediately.
  - Sends a `setSetting` message to the background (debounced ~50 ms during drag).
  - The audio in the active tab tracks the slider in near-real time.
- Double-clicking a slider snaps it to 0 dB. A `title` attribute on the slider documents this for discoverability.
- The sliders remain active when **Mono** is ON. With mono on, they weight how much each channel contributes to the summed mono signal (e.g. L=0, R=1, Mono ON ≈ "play right-channel content in both ears").
- On non-injectable pages (`chrome://`, etc.), the sliders are disabled along with the existing Mono row.

## Audio graph change

Two new `GainNode`s slot between the splitter and the merger (the splitter→merger pair is currently a passthrough). The change applies identically to both `buildGraph` (HTMLMediaElement path) and `buildEntryGraph` (AudioContext path):

```
... → splitter → [leftGain, rightGain] → merger → mono → boost → eq → destination
```

Wiring:

- `splitter.connect(leftGain, 0)` — splitter output 0 (left) feeds `leftGain`'s only input.
- `leftGain.connect(merger, 0, 0)` — `leftGain`'s output goes to merger input 0 (left).
- `splitter.connect(rightGain, 1)` — splitter output 1 (right) feeds `rightGain`'s only input.
- `rightGain.connect(merger, 0, 1)` — `rightGain`'s output goes to merger input 1 (right).

Each gain node is constructed with `gain.value = 1.0` (0 dB, passthrough). Since the per-channel gains sit before the merger, downstream nodes (mono, boost, eq, destination) need no changes.

The graph handle returned by `buildGraph` and `buildEntryGraph` adds `leftGain` and `rightGain` fields:

- `buildGraph` returns `{ mono, splitter, leftGain, rightGain, merger, boost, eq }`.
- `buildEntryGraph` returns `{ entry, mono, splitter, leftGain, rightGain, merger, boost, eq }`.

## Settings shape

Per-tab settings expand from `{ mono }` to:

```js
{ mono: boolean, leftGainDb: number, rightGainDb: number }
```

Defaults: `{ mono: false, leftGainDb: 0, rightGainDb: 0 }`.

We store **dB**, not linear gain, because the popup talks in dB and storing the same units everywhere avoids round-trip conversion artifacts. The conversion happens at the audio graph boundary only.

Existing tabs whose stored settings predate this feature have neither key — the audio graph applies `?? 0` defaulting so they continue to work as before.

## Conversion

```js
const dbToLinear = (db) => Math.pow(10, db / 20);
```

Applied at one place only, inside `applyToGraph`:

```js
function applyToGraph(graph, settings) {
  graph.mono.channelCount = settings.mono ? 1 : 2;
  graph.leftGain.gain.value  = dbToLinear(settings.leftGainDb  ?? 0);
  graph.rightGain.gain.value = dbToLinear(settings.rightGainDb ?? 0);
}
```

`applyToGraph` is shape-agnostic (works for both element graphs and context graphs since both shapes contain `mono`, `leftGain`, `rightGain`).

## Messaging path

No change. The existing key/value `setSetting` API and `apply` broadcast handle the new keys without modification:

- Popup sends `{ type: 'setSetting', tabId, key: 'leftGainDb', value: 3.5 }` (or `'rightGainDb'`).
- Background updates `tabSettings`, broadcasts `{ type: 'apply', settings }` to the tab.
- Content script forwards via `postMessage`.
- `injected.js` runs `applyToGraph(g, settings)` on every known graph.

## Popup UI

### Markup

A new `<ul class="rows" id="gain-rows">` block between the existing mono `<ul>` and the "Coming soon" `.section-label`. Preceded by a section label `CHANNEL GAIN` matching the existing label style.

Each row:

```html
<li class="slider-row" data-key="leftGainDb">
  <span class="ch-label">L</span>
  <input type="range" min="-40" max="12" step="0.5" value="0"
         title="Double-click to reset to 0 dB" />
  <span class="db-value">0.0 dB</span>
</li>
```

### Styling

- Row uses flex with three children: fixed-width label, flex-grow slider, fixed-width value readout. Tabular numbers (`font-variant-numeric: tabular-nums`) on the dB value to keep the readout from jumping width as it changes.
- Slider uses native `<input type="range">` with `accent-color: var(--accent)` so the thumb and track match the existing checkbox accent.
- The slider row uses the same vertical padding and horizontal padding as the existing `.row` for visual consistency.

### Behavior (in popup.js)

- On popup open, after the existing `getSettings` round-trip, the popup also initializes both sliders' `value` and the dB readouts from `resp.settings.leftGainDb` and `resp.settings.rightGainDb` (defaulting to 0).
- An `input` event handler on each slider:
  - Updates the local readout immediately.
  - Calls a debounced `setSetting` (debounce ~50 ms) to send the value to the background.
- A `change` event handler additionally fires `setSetting` immediately (covers the case where the user releases the slider; flushes any pending debounced send).
- A `dblclick` handler resets the slider's value to 0, fires `input` (to update readout) and `change` (to flush).
- On non-injectable pages, the slider rows are added to the same `setRowEnabled(row, false)` path that disables the mono row (an extension of the existing helper, or a small variant).

## Order of work

1. Settings defaults — extend `DEFAULTS` in `background.js`.
2. Audio graph — add `leftGain` and `rightGain` to both `buildGraph` and `buildEntryGraph`, update `applyToGraph`, add `dbToLinear`.
3. Popup HTML/CSS — new section, two rows, styling.
4. Popup JS — read settings into sliders, wire `input`/`change`/`dblclick` handlers with debounce, integrate with `setRowEnabled`-equivalent for non-injectable pages.
5. Manual verification.

## Manual verification (additions to README test list)

| # | Test | Expected |
|--:|------|----------|
| 13 | Open popup. | "Channel gain" section appears between Mono and "Coming soon". Both sliders centered (0 dB). Both readouts show `0.0 dB`. |
| 14 | Drag L slider down. | Left ear gets quieter on stereo content; readout shows e.g. `-12.0 dB`. |
| 15 | Drag R slider up. | Right ear gets louder; readout shows e.g. `+6.0 dB`. |
| 16 | Set L = -40 dB, R = +12 dB. Toggle Mono ON. | Mono mix is dominated by the right channel (right input × 4 vs. left input × 0.01, then averaged). |
| 17 | Double-click L slider. | Snaps to 0 dB; readout updates; audio returns to neutral on that channel. |
| 18 | Set L = -6 dB. Reload page. | Slider returns to -6 dB on next popup open; audio stays attenuated. |
| 19 | Open `chrome://settings`, click extension icon. | Both gain sliders disabled along with Mono row; "Not available on this page." status visible. |

## Out of scope

- Coupling left and right (e.g. a "linked" mode that moves both sliders together). Future improvement.
- Visible reset button per slider — double-click is the only reset path.
- Storing gain in linear units rather than dB — design choice locked in.
- Surround / multi-channel audio. The implementation works on the first two channels only (the splitter is `createChannelSplitter(2)`).
