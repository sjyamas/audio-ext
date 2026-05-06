const TAG = '[Audio Tweaks]';

// Inject the page-world script. <script src=...> works because injected.js
// is listed in manifest.web_accessible_resources. Resolves once the script
// has finished executing so callers can safely postMessage afterward.
function injectPageScript() {
  return new Promise((resolve) => {
    try {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('injected.js');
      s.async = false;
      s.onload = () => { s.remove(); resolve(); };
      s.onerror = (e) => { console.warn(TAG, 'failed to load page script:', e); resolve(); };
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {
      console.warn(TAG, 'failed to inject page script:', e);
      resolve();
    }
  });
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

(async () => {
  await injectPageScript();
  await pullInitialSettings();
})();
