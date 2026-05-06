(() => {
  const TAG = '[Audio Tweaks]';
  let currentSettings = { mono: false };
  const dbToLinear = (db) => Math.pow(10, db / 20);

  // === AudioContext interception ============================================
  // For every page-created AudioContext, we install one graph between any node
  // the page connects to ctx.destination and the actual destination.
  const contextGraphs = new Map(); // AudioContext -> graph handle (entry node + chain)

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

  function getOrCreateContextGraph(ctx) {
    if (contextGraphs.has(ctx)) return contextGraphs.get(ctx); // null sentinel or built graph
    // Mark as in-progress so the re-entrant `eq.connect(ctx.destination)` call
    // inside buildEntryGraph sees a non-undefined value and falls through to
    // origConnect rather than recursing into another buildEntryGraph.
    contextGraphs.set(ctx, null);
    try {
      const g = buildEntryGraph(ctx);
      contextGraphs.set(ctx, g);
      applyToGraph(g, currentSettings);
      return g;
    } catch (e) {
      // Remove the sentinel so a subsequent call could retry (e.g. if the page
      // re-uses the context after a transient failure). buildEntryGraph
      // failures are not expected in practice.
      contextGraphs.delete(ctx);
      console.warn(TAG, 'failed to install AudioContext graph', e);
      return null;
    }
  }

  function patchConnect() {
    if (typeof AudioNode === 'undefined' || AudioNode.prototype.__audioTweaksPatched) return;
    const origConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function patchedConnect(target, ...rest) {
      try {
        if (target && typeof AudioDestinationNode !== 'undefined' && target instanceof AudioDestinationNode) {
          const g = getOrCreateContextGraph(this.context);
          if (g) {
            // g.entry is a GainNode with only input 0, so we drop any inputIndex
            // the page passed (which addressed the destination, not the entry).
            // outputIndex (rest[0]) addresses the SOURCE node and is preserved.
            const outputIndex = rest[0];
            return outputIndex !== undefined
              ? origConnect.call(this, g.entry, outputIndex)
              : origConnect.call(this, g.entry);
          }
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

  // One AudioContext per page is enough for HTMLMediaElement sources.
  // We construct it lazily on the first <audio>/<video> we see — creating one
  // before any user gesture can leave it suspended on some browsers, but for
  // an already-playing media element resume() works without a gesture.
  let sharedCtx = null;
  function getSharedCtx() {
    if (!sharedCtx) {
      sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Chrome's autoplay policy starts the context suspended until a user gesture.
      // Wake it up on the first interaction so audio plays on autoplay pages too.
      const resumeOnGesture = () => { sharedCtx.resume().catch(() => {}); };
      const events = ['click', 'keydown', 'pointerdown', 'touchstart'];
      events.forEach(ev =>
        document.addEventListener(ev, resumeOnGesture, { capture: true, once: true })
      );
    }
    if (sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => {});
    return sharedCtx;
  }

  // For each media element, we keep a graph handle whose nodes we mutate.
  const elementGraphs = new WeakMap();
  // Elements that threw during attachment (e.g. CORS-tainted) are skipped forever.
  const skippedElements = new WeakSet();

  // Build the fixed graph: source -> splitter -> merger -> mono -> boost -> eq -> destination.
  // The splitter+merger pair is currently passthrough and is the future home for channel-swap.
  // Mono lives AFTER the splitter+merger so its 1-channel output is carried through the
  // remaining nodes (which use channelInterpretation='speakers') and upmixed correctly to
  // both speakers at ctx.destination.
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

  // Apply current settings to a graph. Mono ON: GainNode downmixes 2->1 and the
  // downstream stereo path upmixes back to 2 by duplicating, so both speakers
  // carry (L+R) — perceived as mono.
  function applyToGraph(graph, settings) {
    graph.mono.channelCount = settings.mono ? 1 : 2;
    graph.leftGain.gain.value  = dbToLinear(settings.leftGainDb  ?? 0);
    graph.rightGain.gain.value = dbToLinear(settings.rightGainDb ?? 0);
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
    document.querySelectorAll('audio, video').forEach((el) => {
      const g = elementGraphs.get(el);
      if (g) applyToGraph(g, settings);
      else attachToElement(el);
    });
    for (const g of contextGraphs.values()) applyToGraph(g, settings);
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
