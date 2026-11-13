// -----------------------------------------------------------------------------
// Internationalization: every runtime text and every documentation page
// exists in the four supported languages.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { LANGUAGES, MESSAGES, t, truncate } from '../src/i18n.js';

const placeholders = (text) => (text.match(/\{\w+\}/g) ?? []).sort();

test('every message exists in every language, with the same placeholders', () => {
  for (const [key, message] of Object.entries(MESSAGES)) {
    assert.deepEqual(Object.keys(message).sort(), [...LANGUAGES].sort(), key);
    for (const language of LANGUAGES) {
      assert.ok(message[language].trim().length > 0, `${key}.${language} is empty`);
      assert.deepEqual(
        placeholders(message[language]),
        placeholders(message.en),
        `${key}.${language}`,
      );
    }
  }
});

test('t() fills the placeholders in every language', () => {
  assert.deepEqual(t('action.network.ok', { count: 3, watched: 1 }), {
    en: 'Sibelga grid: 3 ongoing outage(s), 1 in your municipalities.',
    fr: 'Réseau Sibelga : 3 panne(s) en cours, dont 1 dans vos communes.',
    de: 'Sibelga-Netz: 3 laufende Störung(en), davon 1 in Ihren Gemeinden.',
    es: 'Red Sibelga: 3 avería(s) en curso, 1 en sus municipios.',
  });
  assert.throws(() => t('nope'), /Unknown message/);
});

test('status and transport messages fit the 200 characters Gladys displays', () => {
  for (const [key, message] of Object.entries(MESSAGES)) {
    if (key.startsWith('status.') || key.startsWith('network.')) {
      for (const language of LANGUAGES) {
        assert.ok(message[language].length <= 200, `${key}.${language}`);
      }
    }
  }
});

test('widget labels fit their tile, row or button', () => {
  // Limits of the widget vocabulary: tile label 24, status label 40,
  // status value 40, button label 24, badge 16, chart name / title 40.
  const limits = {
    'widget.last_day': 24,
    'widget.last_month': 24,
    'widget.average': 24,
    'widget.network.watched': 24,
    'widget.network.total': 24,
    'widget.refresh': 24,
    'widget.network.badge': 16,
    'widget.network.ok': 40,
    'widget.network.outage': 40,
    'widget.network.elsewhere': 40,
    'widget.network.unknown': 40,
    'widget.network.disabled': 40,
    'widget.no_meter': 300,
    'widget.no_data': 80,
  };
  for (const [key, limit] of Object.entries(limits)) {
    for (const language of LANGUAGES) {
      assert.ok(MESSAGES[key][language].length <= limit, `${key}.${language} exceeds ${limit}`);
    }
  }
});

test('truncate() cuts every language', () => {
  assert.deepEqual(truncate({ en: 'abcdef', fr: 'abc' }, 4), { en: 'abc…', fr: 'abc' });
});

test('the user documentation exists in every language, with the same chapters', async () => {
  const files = (await readdir(new URL('../docs/', import.meta.url))).sort();
  assert.deepEqual(files, LANGUAGES.map((language) => `${language}.md`).sort());
  const chapters = await Promise.all(
    LANGUAGES.map(async (language) => {
      const text = await readFile(new URL(`../docs/${language}.md`, import.meta.url), 'utf8');
      return text.split('\n').filter((line) => line.startsWith('## ')).length;
    }),
  );
  assert.ok(chapters[0] >= 6);
  assert.deepEqual(
    chapters,
    chapters.map(() => chapters[0]),
    'same number of chapters',
  );
});
