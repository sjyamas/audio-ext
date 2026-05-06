# Audio Tweaks — pickup notes for the next session

## What this is

A Manifest V3 browser extension (Edge/Chrome) that adds per-tab audio controls
through its toolbar popup. **v0.1** shipped the **Mono audio** toggle. **v0.2**
shipped per-channel **gain sliders** (Left and Right, -40 dB to +12 dB,
defaulting to 0 dB / passthrough). The remaining roadmap (channel swap, volume
boost, EQ) is stubbed in the popup as greyed-out rows.

Authoritative docs:
- v0.1 design: [docs/superpowers/specs/2026-04-30-audio-tweaks-extension-design.md](docs/superpowers/specs/2026-04-30-audio-tweaks-extension-design.md)
- v0.1 plan: [docs/superpowers/plans/2026-04-30-audio-tweaks-extension.md](docs/superpowers/plans/2026-04-30-audio-tweaks-extension.md)
- v0.2 channel-gain design: [docs/superpowers/specs/2026-05-05-channel-gain-design.md](docs/superpowers/specs/2026-05-05-channel-gain-design.md)
- v0.2 channel-gain plan: [docs/superpowers/plans/2026-05-05-channel-gain.md](docs/superpowers/plans/2026-05-05-channel-gain.md)
- Install + test checklist: [README.md](README.md)

## Project context (read before editing)

- **No git in this project.** User opted out for v0.1. Don't `git init` unless asked. Don't suggest commits.
- **No automated tests.** Manual verification only. The README has the 12-row checklist.
- **Windows 10**, bash and PowerShell both available. Use Unix paths in bash, forward slashes in scripts.
- The user uses **headphones** to verify mono behavior (left vs. right separation).

## Current state (as of 2026-05-05)

**v0.1 (mono):** all six implementation tasks complete. Mono works on
`<audio>`/`<video>` (incl. YouTube) and on pure-AudioContext pages.

**v0.2 (channel gain):** all five tasks complete. Two horizontal sliders in
the popup (L and R), -40 dB to +12 dB range, step 0.5, default 0 dB. The
slider's geometric midpoint sits at -14 dB (=`(min+max)/2`) — the user
accepted this asymmetry rather than narrow the range or remap non-linearly.
Double-click resets to 0 dB. Settings persist per-tab and survive reloads /
in-tab navigations. Sliders also affect the L/R contributions to the mono
mix when Mono is ON (gains apply BEFORE the merger).

Manual verification status (README rows):

- **Verified passing:** rows 1-6, 8, 9, 11, 13-19.
- **Not yet verified (deferred from v0.1 — user accepted without them):**
  - row 7 — per-tab independence
  - row 10 — tab-close cleanup log
  - row 12 — iframe

If the user wants to close those out, walk them through. Implementation is
expected to pass all three; they're untouched acceptance tests.

## Code-vs-spec divergences (important)

The spec and plan describe the **original** design. The shipped code has three
small corrections the docs do **not** yet reflect. If you're reading the spec
to make changes, double-check against the code first.

1. **Audio chain order** — spec says
   `source → mono → splitter → merger → boost → eq → destination`.
   Code is `source → splitter → merger → mono → boost → eq → destination`
   (mono moved to AFTER the splitter+merger pair).

   Why: `ChannelSplitterNode` has fixed `channelInterpretation = 'discrete'`,
   which zero-fills missing channels rather than duplicating. With the spec's
   order, mono ON would silence the right speaker. Putting mono after the
   merger lets the downstream nodes (whose default is `'speakers'`) upmix the
   single channel to both speakers correctly.

   This applies to BOTH `buildGraph` (media elements) and `buildEntryGraph`
   (AudioContext path) in `injected.js`.

2. **`content.js` initial-settings race** — the original plan had
   `injectPageScript()` and `pullInitialSettings()` running concurrently. They
   raced: the initial `apply` postMessage sometimes fired before
   `injected.js`'s message listener was registered. Code now awaits the script
   `onload` before pulling settings, in an async IIFE at the bottom of
   `content.js`.

3. **AudioContext interception details** — `injected.js`:
   - `getOrCreateContextGraph` uses a `null` sentinel in `contextGraphs` to
     prevent recursion when `eq.connect(ctx.destination)` inside
     `buildEntryGraph` re-enters the patched `connect`. Use
     `contextGraphs.has(ctx)` (not `!g`) to distinguish "in progress" from
     "never built."
   - The patched `connect` drops `inputIndex` when rerouting through `g.entry`
     (which is a GainNode with only input 0). It preserves `outputIndex` from
     the source.
   - `getSharedCtx` registers one-shot capture-phase listeners for
     `click`/`keydown`/`pointerdown`/`touchstart` on `document` to call
     `sharedCtx.resume()`. Without this, Chrome's autoplay policy can leave
     the context suspended forever on pages with no further media element
     additions after the first user gesture.

If the user is touching the audio graph or asks "why isn't this how the spec
says," start with these three.

## Workflow used

The user prefers the superpowers workflow:
- Spec via `superpowers:brainstorming`.
- Plan via `superpowers:writing-plans`.
- Execution via `superpowers:subagent-driven-development` (fresh subagent per
  task + spec-review + code-quality-review per task).

Before each task, the user verified manually in the browser between sub-task
reviews. They want short, direct exchanges — pick option-letter answers for
clarifying questions, terse confirmations.

## How to pick up

When the user returns:

1. Ask whether they want to (a) finish the three deferred v0.1 acceptance
   tests (README rows 7, 10, 12), (b) start on a roadmap feature (channel
   swap, volume boost, or EQ — the splitter+merger pair already has the
   per-channel gain plumbing, so swap is just changing the splitter→merger
   wiring), or (c) something else.
2. If (b), rerun the brainstorming → writing-plans → subagent-driven flow for
   the new feature. Don't shortcut it; the same workflow caught real bugs in
   both v0.1 (the discrete-upmix bug and the AudioContext recursion bug) and
   v0.2 (caught the asymmetric-range UX issue during user verification).

## Repo layout

```
manifest.json          MV3 manifest
background.js          service worker: tabSettings map + message routing
content.js             isolated world: injects injected.js, relays messages
injected.js            page world: audio graph + AudioContext patch + discovery
popup.html / .css / .js
icons/                 placeholder speaker glyphs (regenerable via tools/make-icons.ps1)
test-pages/            stereo-tone.html (audio element), webaudio-tone.html (AudioContext)
tools/make-icons.ps1   regenerates icons
README.md              install + manual test checklist
docs/superpowers/      spec + plan
```
