# FlowVoc AI - English Vocabulary Helper

A local-first Chrome extension for English vocabulary learning.

## What it does

- Select an unknown English word while reading any article.
- A small `AI` button appears near the selected word.
- Click it to get:
  - simple English meaning
  - Sinhala meaning
  - example sentence
  - Sinhala example translation
  - synonyms/opposite
  - memory tip
- Save the word to your review list.
- Review words later using a spaced-repetition memory pattern: Again, Hard, Good, Easy.

## Local LLM setup

Default endpoint:

```text
http://127.0.0.1:1234/v1/chat/completions
```

Default model:

```text
google/gemma-4-e4b
```

This is designed for LM Studio's OpenAI-compatible local server. Start the server in LM Studio before using lookup.

## Install in Chrome

1. Unzip the extension folder.
2. Open Chrome and go to:

```text
chrome://extensions
```

3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the unzipped `flowvoc-ai-extension` folder.
6. Open an article, select a word, and click the small `AI` button.

## Review words

Click the extension icon in Chrome to open the review page.

Memory buttons:

- **Again**: I forgot it. Show again soon.
- **Hard**: I remembered with difficulty.
- **Good**: I remembered it normally.
- **Easy**: I know it well.

## Backup

Use **Export backup** from the review page to save your vocabulary list as JSON.
Use **Import backup** to restore it later.

## Settings

Right-click the extension icon or open the settings page to change:

- local endpoint
- model name
- temperature
- max tokens
- Sinhala explanation style

## Privacy

Words are sent only to your local LLM endpoint. Saved words are stored locally in Chrome extension storage.
