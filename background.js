// In-memory per-tab settings. Lost on service-worker restart and on tab close.
const tabSettings = new Map(); // tabId -> { mono: boolean }

const DEFAULTS = Object.freeze({ mono: false, leftGainDb: 0, rightGainDb: 0 });

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
