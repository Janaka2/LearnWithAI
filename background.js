const DEFAULT_SETTINGS = {
  endpoint: 'http://127.0.0.1:1234/v1/chat/completions',
  model: 'google/gemma-4-e4b',
  temperature: 0.2,
  maxTokens: 300,
  sinhalaStyle: 'simple',
  autoAddContext: true
};

const LOOKUP_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const lookupCache = new Map();
const inFlightLookups = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  const { flowVocSettings } = await chrome.storage.local.get('flowVocSettings');
  if (!flowVocSettings) {
    await chrome.storage.local.set({ flowVocSettings: DEFAULT_SETTINGS });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'LOOKUP_WORD') {
    lookupWord(message.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: humanError(error) }));
    return true;
  }

  if (message?.type === 'TEST_LLM') {
    lookupWord({ word: 'improve', context: 'I always would like to improve my English vocabulary.' })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: humanError(error) }));
    return true;
  }

  if (message?.type === 'OPEN_REVIEW') {
    chrome.tabs.create({ url: chrome.runtime.getURL('review.html') })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: humanError(error) }));
    return true;
  }
});

async function getSettings() {
  const { flowVocSettings } = await chrome.storage.local.get('flowVocSettings');
  return { ...DEFAULT_SETTINGS, ...(flowVocSettings || {}) };
}

async function lookupWord({ word, context = '' }) {
  const settings = await getSettings();
  const cleanWord = String(word || '').trim().replace(/\s+/g, ' ');
  const cleanContext = String(context || '').trim().slice(0, 320);

  if (!cleanWord) throw new Error('No word selected.');

  const cacheKey = buildCacheKey(cleanWord, cleanContext, settings);
  const cached = lookupCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  if (inFlightLookups.has(cacheKey)) {
    return inFlightLookups.get(cacheKey);
  }

  const prompt = buildPrompt(cleanWord, cleanContext, settings.sinhalaStyle);
  const lookupPromise = runLookupRequest(cleanWord, prompt, settings)
    .then((result) => {
      lookupCache.set(cacheKey, { value: result, expiresAt: Date.now() + LOOKUP_CACHE_TTL_MS });
      return result;
    })
    .finally(() => inFlightLookups.delete(cacheKey));

  inFlightLookups.set(cacheKey, lookupPromise);
  return lookupPromise;
}

async function runLookupRequest(cleanWord, prompt, settings) {
  const response = await fetch(settings.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer lm-studio'
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: Number(settings.temperature ?? 0.2),
      max_tokens: Number(settings.maxTokens ?? 300),
      messages: [
        {
          role: 'system',
          content: 'You are a concise English vocabulary teacher for a Sinhala-speaking learner. Return only valid JSON. No markdown.'
        },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const text = await safeText(response);
    throw new Error(`Local LLM error ${response.status}: ${text || response.statusText}`);
  }

  const json = await response.json();
  const raw = json?.choices?.[0]?.message?.content || json?.choices?.[0]?.text || '';
  return normalizeResult(cleanWord, raw);
}

function buildPrompt(word, context, sinhalaStyle) {
  return `Explain this English word or short phrase for a Sinhala-speaking learner.\n\nSelected text: "${escapePrompt(word)}"\nReading context: "${escapePrompt(context)}"\n\nReturn exactly this JSON shape. Keep every field short and practical. Sinhala must be natural and simple.\n{\n  "word": "selected word",\n  "baseForm": "dictionary form",\n  "partOfSpeech": "noun | verb | adjective | adverb | phrase | other",\n  "cefrLevel": "A1 | A2 | B1 | B2 | C1 | C2 | unknown",\n  "englishMeaning": "one clear simple English meaning based on context",\n  "sinhalaMeaning": "${sinhalaStyle === 'simple' ? 'simple Sinhala meaning' : 'Sinhala meaning'}",\n  "exampleEnglish": "one short natural English sentence",\n  "exampleSinhala": "Sinhala translation of the example",\n  "synonyms": ["1 to 3 simple synonyms"],\n  "opposite": "one common opposite or empty string",\n  "memoryTip": "tiny memory hook in English or Sinhala"\n}`;
}

function buildCacheKey(word, context, settings) {
  return JSON.stringify({
    word: word.toLowerCase(),
    context: context.toLowerCase(),
    model: settings.model,
    style: settings.sinhalaStyle
  });
}

function normalizeResult(selectedWord, raw) {
  const parsed = parseJsonFromModel(raw);
  return {
    word: stringOr(parsed.word, selectedWord),
    baseForm: stringOr(parsed.baseForm, selectedWord),
    partOfSpeech: stringOr(parsed.partOfSpeech, 'unknown'),
    cefrLevel: stringOr(parsed.cefrLevel, 'unknown'),
    englishMeaning: stringOr(parsed.englishMeaning, 'Meaning not available. Try again or check the local LLM server.'),
    sinhalaMeaning: stringOr(parsed.sinhalaMeaning, 'සිංහල අර්ථය ලබාගැනීමට නැවත උත්සාහ කරන්න.'),
    exampleEnglish: stringOr(parsed.exampleEnglish, ''),
    exampleSinhala: stringOr(parsed.exampleSinhala, ''),
    synonyms: Array.isArray(parsed.synonyms) ? parsed.synonyms.slice(0, 3).map(String) : [],
    opposite: stringOr(parsed.opposite, ''),
    memoryTip: stringOr(parsed.memoryTip, '')
  };
}

function parseJsonFromModel(raw) {
  const text = String(raw || '').trim();
  try { return JSON.parse(text); } catch (_) {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch (_) {}
  }

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch (_) {}
  }

  return {
    englishMeaning: text.slice(0, 500)
  };
}

function escapePrompt(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function stringOr(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

async function safeText(response) {
  try { return await response.text(); } catch (_) { return ''; }
}

function humanError(error) {
  const message = String(error?.message || error || 'Unknown error');
  if (message.includes('Failed to fetch')) {
    return 'Cannot connect to the local LLM. Open LM Studio, load the model, and start the server at http://127.0.0.1:1234.';
  }
  return message;
}
