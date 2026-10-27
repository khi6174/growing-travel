import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfile, createProfileStore, PROFILE_STORAGE_KEY, DEFAULT_PROFILE } from '../dist/profile.mjs';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (key) => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}
const code = (expected) => (error) => error.code === expected;

test('personal settings are optional except interests; age and residence are separate from a trip departure', () => {
  assert.deepEqual(normalizeProfile(), DEFAULT_PROFILE);
  const raw = { age: '23', residenceRegion: '서울', interests: ['quiet', 'quiet'], walkingLimitMinutes: '0', gender: 'not-collected', address: 'not-collected' };
  assert.deepEqual(normalizeProfile(raw), { age: 23, residenceRegion: '서울', interests: ['quiet'], walkingLimitMinutes: 0, studentStatus: 'unspecified' });
  assert.deepEqual(normalizeProfile({ age: '', residenceRegion: '' }).age, null);
  assert.equal(Object.hasOwn(normalizeProfile(raw), 'gender'), false);
});

test('student status is optional self-report, never inferred from age or residence and rejects unsupported values', () => {
  assert.equal(normalizeProfile({ age: 20, residenceRegion: '서울' }).studentStatus, 'unspecified');
  for (const studentStatus of ['unspecified', 'student', 'not_student']) {
    const raw = { age: 45, studentStatus, universityName: 'not-collected', studentId: 'not-collected' };
    const normalized = normalizeProfile(raw);
    assert.equal(normalized.studentStatus, studentStatus);
    assert.equal(Object.hasOwn(normalized, 'universityName'), false);
    assert.equal(Object.hasOwn(normalized, 'studentId'), false);
    const storage = memoryStorage();
    createProfileStore({ storage }).save(normalized);
    assert.deepEqual(createProfileStore({ storage }).load(), normalized);
    assert.equal(raw.age, 45);
  }
  for (const studentStatus of [null, true, false, '', 'yes', 'graduate', 1, [], {}]) {
    assert.throws(() => normalizeProfile({ studentStatus }), (error) => Boolean(error.fields.studentStatus));
  }
});

test('pre-student v1 settings load without rewriting storage and gain unspecified status only on explicit save', () => {
  const oldProfile = { age: 23, residenceRegion: '서울', interests: ['quiet'], walkingLimitMinutes: 60 };
  const bytes = JSON.stringify({ schemaVersion: 1, profile: oldProfile });
  const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: bytes, 'growing-travel.local-demo.v1': 'existing-courses' });
  const store = createProfileStore({ storage });
  const loaded = store.load();
  assert.deepEqual(loaded, { ...oldProfile, studentStatus: 'unspecified' });
  assert.equal(storage.getItem(PROFILE_STORAGE_KEY), bytes);
  store.save({ ...loaded, studentStatus: 'student' });
  assert.equal(createProfileStore({ storage }).load().studentStatus, 'student');
  assert.equal(storage.getItem('growing-travel.local-demo.v1'), 'existing-courses');
});

test('profile validation catches unsupported ages, residences, interests and walking limits by field', () => {
  for (const age of [-1, 0, 1.5, 121, false, ' ']) assert.throws(() => normalizeProfile({ age }), (error) => Boolean(error.fields.age));
  assert.throws(() => normalizeProfile({ residenceRegion: '가상 중앙역' }), (error) => Boolean(error.fields.residenceRegion));
  for (const interests of [[], ['invented'], 'nature']) assert.throws(() => normalizeProfile({ interests }), (error) => Boolean(error.fields.interests));
  for (const walkingLimitMinutes of [-1, 721, false, '']) assert.throws(() => normalizeProfile({ walkingLimitMinutes }), (error) => Boolean(error.fields.walkingLimitMinutes));
});

test('profile store saves only on explicit save, round-trips and deletes its own key without touching courses', () => {
  const storage = memoryStorage({ 'growing-travel.local-demo.v1': 'preserved-course-data' });
  const store = createProfileStore({ storage });
  assert.equal(store.load(), null);
  assert.equal(storage.data.size, 1);
  const profile = normalizeProfile({ age: 24, residenceRegion: '경기' });
  store.save(profile);
  const reread = createProfileStore({ storage }).load();
  assert.deepEqual(reread, profile);
  reread.interests.push('food');
  assert.deepEqual(store.load(), profile);
  store.clear();
  assert.equal(store.load(), null);
  assert.equal(storage.getItem('growing-travel.local-demo.v1'), 'preserved-course-data');
});

test('profile parse errors and invalid envelopes are preserved on load and save', () => {
  for (const value of ['{broken', JSON.stringify({ schemaVersion: 2, profile: DEFAULT_PROFILE }), JSON.stringify({ schemaVersion: 1, profile: { ...DEFAULT_PROFILE, age: 999 } }), JSON.stringify({ schemaVersion: 1, profile: { ...DEFAULT_PROFILE, studentStatus: 'verified' } })]) {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: value });
    const store = createProfileStore({ storage });
    assert.throws(() => store.load(), code('PROFILE_CORRUPT'));
    assert.throws(() => store.save(DEFAULT_PROFILE), code('PROFILE_CORRUPT'));
    assert.equal(storage.getItem(PROFILE_STORAGE_KEY), value);
  }
});

test('profile storage read, quota, read-back and delete errors never claim success', () => {
  assert.throws(() => createProfileStore({ storage: null }).load(), code('PROFILE_UNAVAILABLE'));
  assert.throws(() => createProfileStore({ storage: { getItem() { throw new Error('Denied'); } } }).save(DEFAULT_PROFILE), code('PROFILE_UNAVAILABLE'));
  const full = memoryStorage(); full.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => createProfileStore({ storage: full }).save(DEFAULT_PROFILE), code('PROFILE_SAVE_FAILED'));
  const dropped = memoryStorage(); dropped.setItem = () => {};
  assert.throws(() => createProfileStore({ storage: dropped }).save(DEFAULT_PROFILE), code('PROFILE_SAVE_FAILED'));
  const locked = memoryStorage(); locked.removeItem = () => { throw new Error('Denied'); };
  assert.throws(() => createProfileStore({ storage: locked }).clear(), code('PROFILE_DELETE_FAILED'));
});
