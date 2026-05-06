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
