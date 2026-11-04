import test from 'node:test';
import assert from 'node:assert/strict';
import { START_KEY, TRAVEL_STYLES, NOTE_MAX, normalizeStart, loadStart, saveStart, needsStart, profileWith, courseHints, cleanNote } from '../dist/onboarding.mjs';
import { resolveScreen, parentScreen, SCREENS } from '../dist/navigation.mjs';
import { DEFAULT_PROFILE, normalizeProfile } from '../dist/profile.mjs';

const memory = (initial = null) => { const map = new Map(initial === null ? [] : [[START_KEY, initial]]); return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) }; };
const pets = [{ id: 'shiba', tag_ids: ['quiet_cafe', 'garden', 'bookstore', 'low_crowd'] }, { id: 'corgi', tag_ids: ['market', 'dessert'] }];

test('D50 the first start keeps a known pet, only that pet’s tastes, a known style and short clean notes', () => {
  const start = normalizeStart({ pet: 'shiba', tastes: ['garden', 'market', 'garden', 'BAD!'], tasteNote: '  한옥 카페\n<b>조용한</b> 골목  ', style: 'slow', styleNote: 'x'.repeat(90) }, pets);
  assert.deepEqual(start, { pet: 'shiba', tastes: ['garden'], tasteNote: '한옥 카페 b 조용한 /b 골목', style: 'slow', styleNote: 'x'.repeat(NOTE_MAX), skipped: false });
  assert.deepEqual(normalizeStart({ pet: 'cat', tastes: ['garden'], style: 'fast' }, pets), { pet: null, tastes: [], tasteNote: '', style: '', styleNote: '', skipped: false });
  assert.equal(cleanNote(42), '');
  assert.deepEqual(TRAVEL_STYLES.map((item) => item.id), ['slow', 'packed', 'spontaneous', 'planned']);
});

test('D50 the answers stay in this browser, a broken record asks again, and skipping once is remembered', () => {
  const storage = memory();
  assert.equal(needsStart(storage), true);
  saveStart({ pet: 'corgi', tastes: ['market'], style: 'packed', skipped: true }, { pets, storage, now: () => new Date('2026-11-04T12:00:00Z') });
  assert.equal(needsStart(storage), false);
  assert.deepEqual(loadStart(storage), { pet: 'corgi', tastes: ['market'], tasteNote: '', style: 'packed', styleNote: '', skipped: true, savedAt: '2026-11-04T12:00:00.000Z' });
  assert.equal(needsStart(memory('{not json')), true);
  assert.equal(loadStart(memory(JSON.stringify({ schemaVersion: 2, start: {} }))), null);
  assert.throws(() => saveStart({ pet: 'corgi' }, { pets, storage: { getItem: () => null, setItem() { throw new Error('quota'); } } }));
});

test('D50 benefit answers fill the existing profile without touching its other fields, and skipping all writes nothing', () => {
  const existing = { age: null, residenceRegion: '', interests: ['food'], walkingLimitMinutes: 30, studentStatus: 'unspecified' };
  const merged = profileWith(existing, { age: 22, residenceRegion: '서울', studentStatus: 'student' }, DEFAULT_PROFILE);
  assert.deepEqual(normalizeProfile(merged), { age: 22, residenceRegion: '서울', interests: ['food'], walkingLimitMinutes: 30, studentStatus: 'student' });
  assert.equal(profileWith(existing, {}), null, 'nothing answered, nothing saved');
  assert.deepEqual(normalizeProfile(profileWith(null, { residenceRegion: '경기' }, DEFAULT_PROFILE)).walkingLimitMinutes, DEFAULT_PROFILE.walkingLimitMinutes);
});

test('D50 a course request carries pet, taste tags and style only — never age, region or typed notes', () => {
  const hints = courseHints({ pet: 'shiba', tastes: ['garden'], tasteNote: '비밀', style: 'slow', styleNote: '비밀', age: 22 });
  assert.deepEqual(hints, { pet: 'shiba', tastes: ['garden'], style: 'slow' });
  assert.deepEqual(courseHints(null), { pet: null, tastes: [], style: '' });
});

test('D50 the first-start screen always opens and goes back to home', () => {
  assert.ok(SCREENS.includes('start'));
  assert.equal(resolveScreen('start', {}), 'start');
  assert.equal(parentScreen('start'), 'home');
});
