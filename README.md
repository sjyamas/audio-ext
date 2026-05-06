# Audio Tweaks

A Manifest V3 browser extension (Edge/Chrome) that adds per-tab audio adjustments
through its toolbar popup. v0.1 shipped **Mono audio**; v0.2 adds **per-channel
gain sliders** (Left/Right, -40 dB to +12 dB). Channel swap, volume boost, and EQ
are stubbed in the UI for later versions.

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
| 13 | Open popup. | "Channel gain" section appears between Mono and "Coming soon". Both sliders show the 0 dB position; both readouts show `0.0 dB`. |
| 14 | Drag L slider down. | Left ear gets quieter on stereo content; readout updates live (e.g. `-12.0 dB`). |
| 15 | Drag R slider up. | Right ear gets louder; readout updates (e.g. `+6.0 dB`). |
| 16 | Set L = -40 dB, R = +12 dB. Toggle Mono ON. | Mono mix is dominated by the right-channel content. |
| 17 | Double-click L slider. | Snaps to 0 dB; readout updates; left ear returns to neutral. |
| 18 | Set L = -6 dB. Reload the page. | Slider still shows -6 dB on next popup open; audio stays attenuated. |
| 19 | Open `chrome://settings`, click extension icon. | Both gain sliders are greyed and disabled along with the Mono row; status shows "Not available on this page." |

## Project layout

See `docs/superpowers/specs/2026-04-30-audio-tweaks-extension-design.md` for the
v0.1 design and `docs/superpowers/specs/2026-05-05-channel-gain-design.md` for
the v0.2 channel-gain feature.
