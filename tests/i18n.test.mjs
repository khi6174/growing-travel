import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { LANGS, DICTS, detectLang, t, fill, petText } from '../dist/i18n.mjs';
import { RESIDENCE_REGIONS } from '../dist/profile.mjs';
import { TRAVEL_STYLES } from '../dist/onboarding.mjs';

const pets = JSON.parse(await fs.readFile(new URL('../data/pets.json', import.meta.url), 'utf8'));
const html = await fs.readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const vars = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test('D53 six languages; the stored choice wins, then the browser language, then Korean', () => {
  assert.deepEqual(LANGS.map((item) => item.id), ['ko', 'en', 'zh', 'ja', 'vi', 'my']);
  assert.equal(detectLang('vi', ['en-US']), 'vi');
  assert.equal(detectLang(null, ['fr-FR', 'zh-CN']), 'zh');
  assert.equal(detectLang('xx', ['fr']), 'ko');
  assert.equal(t('nope.key', '한국어 그대로'), '한국어 그대로', 'Korean is the source and the fallback');
  assert.equal(fill('{n} / {total}', { n: 2, total: 8 }), '2 / 8');
});

test('D53 every language has the same keys as English, none empty, with the same {placeholders}', () => {
  const keys = Object.keys(DICTS.en).sort();
  for (const [id, dict] of Object.entries(DICTS)) {
    assert.deepEqual(Object.keys(dict).sort(), keys, `${id} has the same keys`);
    for (const key of keys) {
      assert.ok(String(dict[key]).trim(), `${id} ${key} is empty`);
      assert.deepEqual(vars(dict[key]), vars(DICTS.en[key]), `${id} ${key} placeholders`);
    }
  }
});

test('D53 pets, their tags, travel styles, regions and every marked page text have a translation', () => {
  for (const dict of Object.values(DICTS)) {
    for (const pet of pets.pets) for (const part of ['name', 'purpose', 'intro']) assert.ok(dict[`pet.${pet.id}.${part}`], `pet.${pet.id}.${part}`);
    for (const tag of Object.keys(pets.tag_labels)) assert.ok(dict[`tag.${tag}`], `tag.${tag}`);
    for (const style of TRAVEL_STYLES) assert.ok(dict[`style.${style.id}.label`] && dict[`style.${style.id}.hint`]);
    for (const region of RESIDENCE_REGIONS) assert.ok(dict[`region.${region}`], `region.${region}`);
    for (const [, key] of html.matchAll(/data-i18n(?:-aria|-placeholder|-title)?="([^"]+)"/g)) assert.ok(dict[key], `page key ${key}`);
  }
  const shiba = pets.pets.find((pet) => pet.id === 'shiba');
  assert.deepEqual(petText({ ...shiba, tag_ids: shiba.tags, tags: shiba.tags.map((tag) => pets.tag_labels[tag]) }).tags, shiba.tags.map((tag) => pets.tag_labels[tag]), 'Korean stays Korean');
});

test('D53/P73 the phrase table: six filled cells per row, no repeated Korean, the same {placeholders}, nothing left untranslated', async () => {
  const { PHRASES } = await import('../dist/i18n/phrases.mjs');
  const { missingPhrases } = await import('../scripts/check-i18n.mjs');
  const keys = PHRASES.map((row) => row[0]);
  assert.equal(new Set(keys).size, keys.length, 'each Korean sentence once');
  for (const row of PHRASES) {
    assert.equal(row.length, 6, row[0]);
    for (const cell of row) assert.ok(String(cell).trim(), `${row[0]} has an empty cell`);
    const expected = row[0].startsWith('line.') ? vars(row[1]) : vars(row[0]);
    for (const cell of row.slice(1)) assert.deepEqual(vars(cell), expected, `${row[0]} → ${cell}`);
  }
  assert.deepEqual(await missingPhrases(), [], 'every tk() sentence and screen label has a row');
});
