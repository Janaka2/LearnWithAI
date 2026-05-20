const DEFAULT_SETTINGS = {
  endpoint: 'http://127.0.0.1:1234/v1/chat/completions',
  model: 'google/gemma-4-e4b',
  temperature: 0.2,
  maxTokens: 550,
  sinhalaStyle: 'simple'
};

const endpoint = document.getElementById('endpoint');
const model = document.getElementById('model');
const temperature = document.getElementById('temperature');
const maxTokens = document.getElementById('maxTokens');
const sinhalaStyle = document.getElementById('sinhalaStyle');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const reviewBtn = document.getElementById('reviewBtn');
const statusEl = document.getElementById('status');

load();

saveBtn.addEventListener('click', saveSettings);
testBtn.addEventListener('click', testLlm);
reviewBtn.addEventListener('click', () => location.href = 'review.html');

async function load() {
  const { flowVocSettings } = await chrome.storage.local.get('flowVocSettings');
  const settings = { ...DEFAULT_SETTINGS, ...(flowVocSettings || {}) };
  endpoint.value = settings.endpoint;
  model.value = settings.model;
  temperature.value = settings.temperature;
  maxTokens.value = settings.maxTokens;
  sinhalaStyle.value = settings.sinhalaStyle;
}

async function saveSettings() {
  const settings = {
    endpoint: endpoint.value.trim() || DEFAULT_SETTINGS.endpoint,
    model: model.value.trim() || DEFAULT_SETTINGS.model,
    temperature: Number(temperature.value || DEFAULT_SETTINGS.temperature),
    maxTokens: Number(maxTokens.value || DEFAULT_SETTINGS.maxTokens),
    sinhalaStyle: sinhalaStyle.value || 'simple'
  };
  await chrome.storage.local.set({ flowVocSettings: settings });
  setStatus('Saved ✓', 'ok');
}

async function testLlm() {
  await saveSettings();
  setStatus('Testing local LLM...', '');
  try {
    const response = await chrome.runtime.sendMessage({ type: 'TEST_LLM' });
    if (!response?.ok) throw new Error(response?.error || 'Test failed.');
    setStatus(`Connected ✓ Example: ${response.data.word} = ${response.data.sinhalaMeaning}`, 'ok');
  } catch (error) {
    setStatus(error.message || String(error), 'error');
  }
}

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = `status ${kind || ''}`;
}
