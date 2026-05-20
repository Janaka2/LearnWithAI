(() => {
  let selectedText = '';
  let selectedContext = '';
  let selectionRect = null;
  let lastResult = null;
  let suppressUntil = 0;

  const button = document.createElement('div');
  button.id = 'flowvoc-btn';
  button.textContent = 'AI';
  button.title = 'Explain word';

  const card = document.createElement('div');
  card.id = 'flowvoc-card';

  document.documentElement.appendChild(button);
  document.documentElement.appendChild(card);

  document.addEventListener('mouseup', handleSelectionSoon, true);
  document.addEventListener('keyup', handleSelectionSoon, true);
  document.addEventListener('scroll', hideButtonOnly, true);
  document.addEventListener('mousedown', handleOutsideClick, true);
  window.addEventListener('resize', hideAll, true);

  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await openLookup();
  });

  function handleSelectionSoon() {
    window.setTimeout(handleSelection, 40);
  }

  function handleSelection() {
    if (Date.now() < suppressUntil) return;

    const selection = window.getSelection();
    const text = normalizeSelection(selection?.toString() || '');

    if (!isGoodSelection(text) || !selection?.rangeCount) {
      hideButtonOnly();
      return;
    }

    const range = selection.getRangeAt(0).cloneRange();
    const rect = getBestRect(range);
    if (!rect) {
      hideButtonOnly();
      return;
    }

    selectedText = text;
    selectedContext = collectContext(range);
    selectionRect = rect;
    lastResult = null;
    showButton(rect);
  }

  function normalizeSelection(text) {
    return String(text || '')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/^['"`.,;:!?()\[\]{}]+|['"`.,;:!?()\[\]{}]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isGoodSelection(text) {
    if (!text || text.length > 60) return false;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 4) return false;
    return /[A-Za-z]/.test(text);
  }

  function getBestRect(range) {
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    const rect = rects[0] || range.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      left: rect.left + window.scrollX,
      top: rect.top + window.scrollY,
      right: rect.right + window.scrollX,
      bottom: rect.bottom + window.scrollY,
      width: rect.width,
      height: rect.height
    };
  }

  function showButton(rect) {
    const x = clamp(rect.left + rect.width / 2 - 19, window.scrollX + 8, window.scrollX + window.innerWidth - 48);
    const y = Math.max(window.scrollY + 8, rect.top - 38);
    button.style.left = `${x}px`;
    button.style.top = `${y}px`;
    button.style.display = 'flex';
  }

  function hideButtonOnly() {
    button.style.display = 'none';
  }

  function hideAll() {
    hideButtonOnly();
    card.style.display = 'none';
  }

  function handleOutsideClick(event) {
    if (button.contains(event.target) || card.contains(event.target)) return;
    if (card.style.display === 'block') {
      card.style.display = 'none';
      suppressUntil = Date.now() + 200;
    }
  }

  async function openLookup() {
    hideButtonOnly();
    positionCard(selectionRect);
    renderLoading(selectedText);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'LOOKUP_WORD',
        payload: { word: selectedText, context: selectedContext }
      });

      if (!response?.ok) throw new Error(response?.error || 'Lookup failed.');
      lastResult = response.data;
      renderResult(lastResult);
    } catch (error) {
      renderError(selectedText, error?.message || String(error));
    }
  }

  function positionCard(rect) {
    const cardWidth = Math.min(360, window.innerWidth - 24);
    const left = clamp(rect.left, window.scrollX + 12, window.scrollX + window.innerWidth - cardWidth - 12);
    const preferredTop = rect.bottom + 10;
    const top = preferredTop - window.scrollY + 520 > window.innerHeight
      ? Math.max(window.scrollY + 12, rect.top - 470)
      : preferredTop;

    card.style.width = `${cardWidth}px`;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.display = 'block';
  }

  function renderLoading(word) {
    card.innerHTML = `
      <div class="flowvoc-top">
        <div>
          <div class="flowvoc-title"></div>
          <div class="flowvoc-subtitle">Asking your local LLM...</div>
        </div>
        <button class="flowvoc-close" title="Close">×</button>
      </div>
      <div class="flowvoc-section"><div class="flowvoc-muted">Loading meaning for “${escapeHtml(word)}”...</div></div>
    `;
    card.querySelector('.flowvoc-title').textContent = word;
    card.querySelector('.flowvoc-close').addEventListener('click', () => card.style.display = 'none');
  }

  function renderError(word, message) {
    card.innerHTML = `
      <div class="flowvoc-top">
        <div>
          <div class="flowvoc-title">${escapeHtml(word)}</div>
          <div class="flowvoc-subtitle">Lookup problem</div>
        </div>
        <button class="flowvoc-close" title="Close">×</button>
      </div>
      <div class="flowvoc-error">${escapeHtml(message)}</div>
      <div class="flowvoc-actions">
        <button class="flowvoc-secondary" data-action="options">Settings</button>
      </div>
    `;
    card.querySelector('.flowvoc-close').addEventListener('click', () => card.style.display = 'none');
    card.querySelector('[data-action="options"]').addEventListener('click', () => chrome.runtime.openOptionsPage());
  }

  function renderResult(result) {
    const synonyms = (result.synonyms || []).map((s) => `<span class="flowvoc-tag">${escapeHtml(s)}</span>`).join('');
    card.innerHTML = `
      <div class="flowvoc-top">
        <div>
          <div class="flowvoc-title">${escapeHtml(result.word || selectedText)}</div>
          <div class="flowvoc-subtitle">${escapeHtml(result.partOfSpeech || 'word')} · ${escapeHtml(result.cefrLevel || 'level unknown')}</div>
        </div>
        <button class="flowvoc-close" title="Close">×</button>
      </div>

      <div class="flowvoc-section">
        <div class="flowvoc-label">English</div>
        <div class="flowvoc-text">${escapeHtml(result.englishMeaning || '')}</div>
      </div>

      <div class="flowvoc-section">
        <div class="flowvoc-label">සිංහල</div>
        <div class="flowvoc-text">${escapeHtml(result.sinhalaMeaning || '')}</div>
      </div>

      ${result.exampleEnglish ? `
        <div class="flowvoc-section">
          <div class="flowvoc-label">Example</div>
          <div class="flowvoc-text">${escapeHtml(result.exampleEnglish)}</div>
          ${result.exampleSinhala ? `<div class="flowvoc-muted" style="margin-top:6px;">${escapeHtml(result.exampleSinhala)}</div>` : ''}
        </div>` : ''}

      ${(synonyms || result.opposite) ? `
        <div class="flowvoc-section">
          <div class="flowvoc-label">Useful links</div>
          ${synonyms ? `<div class="flowvoc-tags">${synonyms}</div>` : ''}
          ${result.opposite ? `<div class="flowvoc-muted" style="margin-top:8px;">Opposite: ${escapeHtml(result.opposite)}</div>` : ''}
        </div>` : ''}

      ${result.memoryTip ? `
        <div class="flowvoc-section">
          <div class="flowvoc-label">Memory tip</div>
          <div class="flowvoc-text">${escapeHtml(result.memoryTip)}</div>
        </div>` : ''}

      <div class="flowvoc-actions">
        <button class="flowvoc-primary" data-action="save">Add to review</button>
        <button class="flowvoc-secondary" data-action="open-review">Review</button>
      </div>
    `;

    card.querySelector('.flowvoc-close').addEventListener('click', () => card.style.display = 'none');
    card.querySelector('[data-action="save"]').addEventListener('click', saveCurrentWord);
    card.querySelector('[data-action="open-review"]').addEventListener('click', async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'OPEN_REVIEW' });
        if (!response?.ok) throw new Error(response?.error || 'Cannot open review page.');
      } catch (_) {
        window.open(chrome.runtime.getURL('review.html'));
      }
    });
  }

  async function saveCurrentWord() {
    if (!lastResult) return;

    const button = card.querySelector('[data-action="save"]');
    const existing = await getWords();
    const id = makeWordId(lastResult.baseForm || lastResult.word || selectedText);
    const now = Date.now();
    const previous = existing[id];

    existing[id] = {
      id,
      word: lastResult.word || selectedText,
      baseForm: lastResult.baseForm || lastResult.word || selectedText,
      partOfSpeech: lastResult.partOfSpeech || '',
      cefrLevel: lastResult.cefrLevel || '',
      englishMeaning: lastResult.englishMeaning || '',
      sinhalaMeaning: lastResult.sinhalaMeaning || '',
      exampleEnglish: lastResult.exampleEnglish || '',
      exampleSinhala: lastResult.exampleSinhala || '',
      synonyms: Array.isArray(lastResult.synonyms) ? lastResult.synonyms : [],
      opposite: lastResult.opposite || '',
      memoryTip: lastResult.memoryTip || '',
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      dueAt: previous?.dueAt || now,
      intervalDays: previous?.intervalDays || 0,
      ease: previous?.ease || 2.5,
      repetitions: previous?.repetitions || 0,
      lapses: previous?.lapses || 0,
      reviewHistory: previous?.reviewHistory || []
    };

    await chrome.storage.local.set({ flowVocWords: existing });
    button.textContent = previous ? 'Updated ✓' : 'Saved ✓';
    button.disabled = true;
    button.style.opacity = '0.85';
  }

  async function getWords() {
    const { flowVocWords } = await chrome.storage.local.get('flowVocWords');
    return flowVocWords || {};
  }

  function collectContext(range) {
    const node = range.commonAncestorContainer;
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const container = element?.closest?.('p, li, article, section, main, div') || element;
    const text = (container?.innerText || container?.textContent || document.body.innerText || '').replace(/\s+/g, ' ').trim();
    const index = text.toLowerCase().indexOf(selectedText.toLowerCase());
    if (index < 0) return text.slice(0, 700);
    return text.slice(Math.max(0, index - 350), Math.min(text.length, index + selectedText.length + 350));
  }

  function makeWordId(word) {
    return String(word || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `word-${Date.now()}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
