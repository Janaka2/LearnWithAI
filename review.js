let allWords = {};
let hiddenDone = new Set();

const statsEl = document.getElementById('stats');
const reviewArea = document.getElementById('reviewArea');
const searchInput = document.getElementById('searchInput');
const filterSelect = document.getElementById('filterSelect');
const optionsBtn = document.getElementById('optionsBtn');
const exportBtn = document.getElementById('exportBtn');
const importFile = document.getElementById('importFile');
const clearDoneBtn = document.getElementById('clearDoneBtn');

load();

searchInput.addEventListener('input', render);
filterSelect.addEventListener('change', render);
optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
exportBtn.addEventListener('click', exportBackup);
importFile.addEventListener('change', importBackup);
clearDoneBtn.addEventListener('click', () => {
  hiddenDone = new Set(Object.values(allWords).filter((w) => w.dueAt > Date.now()).map((w) => w.id));
  render();
});

async function load() {
  const { flowVocWords } = await chrome.storage.local.get('flowVocWords');
  allWords = flowVocWords || {};
  render();
}

async function save() {
  await chrome.storage.local.set({ flowVocWords: allWords });
}

function render() {
  const now = Date.now();
  const words = Object.values(allWords);
  const due = words.filter((w) => (w.dueAt || 0) <= now);
  const newWords = words.filter((w) => (w.repetitions || 0) === 0);
  const strong = words.filter((w) => (w.intervalDays || 0) >= 21);

  statsEl.innerHTML = `
    <div class="stat"><strong>${due.length}</strong><span>Due</span></div>
    <div class="stat"><strong>${words.length}</strong><span>Total</span></div>
    <div class="stat"><strong>${strong.length}</strong><span>Strong</span></div>
  `;

  let list = words;
  const filter = filterSelect.value;
  if (filter === 'due') list = due;
  if (filter === 'new') list = newWords;
  if (filter === 'mastered') list = strong;

  const q = searchInput.value.trim().toLowerCase();
  if (q) {
    list = list.filter((w) => [w.word, w.baseForm, w.englishMeaning, w.sinhalaMeaning, w.exampleEnglish, w.exampleSinhala]
      .some((field) => String(field || '').toLowerCase().includes(q)));
  }

  list = list
    .filter((w) => !hiddenDone.has(w.id))
    .sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0) || String(a.word).localeCompare(String(b.word)));

  if (list.length === 0) {
    reviewArea.innerHTML = `<div class="empty">No words here now. Select unknown words while reading and save them for review.</div>`;
    return;
  }

  reviewArea.innerHTML = list.map(renderWordCard).join('');
  reviewArea.querySelectorAll('[data-show]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.card');
      card.querySelector('.meaning').classList.toggle('visible');
      btn.textContent = btn.textContent === 'Show meaning' ? 'Hide meaning' : 'Show meaning';
    });
  });
  reviewArea.querySelectorAll('[data-grade]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await gradeWord(btn.dataset.id, btn.dataset.grade);
    });
  });
}

function renderWordCard(w) {
  const dueText = formatDue(w.dueAt || Date.now());
  const example = w.exampleEnglish ? `<div class="block"><div class="label">Example</div>${escapeHtml(w.exampleEnglish)}${w.exampleSinhala ? `<br><span class="meta">${escapeHtml(w.exampleSinhala)}</span>` : ''}</div>` : '';
  const tip = w.memoryTip ? `<div class="block"><div class="label">Memory tip</div>${escapeHtml(w.memoryTip)}</div>` : '';
  const synonyms = Array.isArray(w.synonyms) && w.synonyms.length ? `<div class="block"><div class="label">Synonyms</div>${w.synonyms.map(escapeHtml).join(', ')}</div>` : '';

  return `
    <article class="card">
      <div class="card-top">
        <div>
          <div class="word">${escapeHtml(w.word || w.baseForm)}</div>
          <div class="meta">${escapeHtml(w.partOfSpeech || 'word')} · ${escapeHtml(w.cefrLevel || 'level unknown')} · interval ${Number(w.intervalDays || 0)}d</div>
        </div>
        <div class="due">${dueText}</div>
      </div>

      <button class="secondary" data-show="${escapeHtml(w.id)}" style="margin-top:12px; width:100%;">Show meaning</button>

      <div class="meaning">
        <div class="block"><div class="label">English</div>${escapeHtml(w.englishMeaning || '')}</div>
        <div class="block"><div class="label">සිංහල</div>${escapeHtml(w.sinhalaMeaning || '')}</div>
        ${example}
        ${synonyms}
        ${tip}
        <div class="actions">
          <button class="again" data-id="${escapeHtml(w.id)}" data-grade="again">Again</button>
          <button class="hard" data-id="${escapeHtml(w.id)}" data-grade="hard">Hard</button>
          <button class="good" data-id="${escapeHtml(w.id)}" data-grade="good">Good</button>
          <button class="easy" data-id="${escapeHtml(w.id)}" data-grade="easy">Easy</button>
        </div>
      </div>
    </article>
  `;
}

async function gradeWord(id, grade) {
  const word = allWords[id];
  if (!word) return;

  const now = Date.now();
  const currentInterval = Number(word.intervalDays || 0);
  let ease = Number(word.ease || 2.5);
  let reps = Number(word.repetitions || 0);
  let lapses = Number(word.lapses || 0);
  let intervalDays = 1;
  let dueAt = now + dayMs();

  if (grade === 'again') {
    reps = 0;
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
    intervalDays = 0;
    dueAt = now + 10 * 60 * 1000;
  }

  if (grade === 'hard') {
    reps += 1;
    ease = Math.max(1.3, ease - 0.15);
    intervalDays = currentInterval < 1 ? 1 : Math.max(1, Math.ceil(currentInterval * 1.2));
    dueAt = now + intervalDays * dayMs();
  }

  if (grade === 'good') {
    reps += 1;
    if (reps <= 1) intervalDays = 1;
    else if (reps === 2) intervalDays = 3;
    else intervalDays = Math.max(4, Math.round(Math.max(currentInterval, 1) * ease));
    dueAt = now + intervalDays * dayMs();
  }

  if (grade === 'easy') {
    reps += 1;
    ease = Math.min(3.2, ease + 0.15);
    if (reps <= 1) intervalDays = 3;
    else intervalDays = Math.max(5, Math.round(Math.max(currentInterval, 1) * ease * 1.5));
    dueAt = now + intervalDays * dayMs();
  }

  allWords[id] = {
    ...word,
    ease,
    repetitions: reps,
    lapses,
    intervalDays,
    dueAt,
    updatedAt: now,
    reviewHistory: [
      ...(word.reviewHistory || []).slice(-50),
      { at: now, grade, intervalDays, ease }
    ]
  };

  await save();
  render();
}

function formatDue(ts) {
  const diff = ts - Date.now();
  if (diff <= 0) return 'Due now';
  const mins = Math.ceil(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.ceil(diff / 3600000);
  if (hours < 24) return `${hours}h`;
  const days = Math.ceil(diff / dayMs());
  return `${days}d`;
}

function dayMs() {
  return 24 * 60 * 60 * 1000;
}

function exportBackup() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), words: allWords }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flowvoc-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const words = data.words || data.flowVocWords || data;
    if (!words || typeof words !== 'object') throw new Error('Invalid backup file.');
    allWords = { ...allWords, ...words };
    await save();
    render();
  } catch (error) {
    alert(error.message || String(error));
  } finally {
    event.target.value = '';
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
