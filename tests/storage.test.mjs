import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCourseDraft } from '../dist/domain.mjs';
import { createCourseStore, STORAGE_KEY } from '../dist/storage.mjs';

const context = { availableMinutes: 180, interests: ['nature', 'quiet'], regionText: '', companion: 'any', mobility: 'any', avoidStairs: false };
const draft = (title = '나의 가상 하루', experienceIds = ['demo-garden', 'demo-library']) => buildCourseDraft({ title, experienceIds, context, requestId: 'test-request' });
const code = (expected) => (error) => error.code === expected;
function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}
function serialLock() {
  let queue = Promise.resolve();
  return (action) => {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  };
}
function setup() {
  const storage = memoryStorage();
  const withLock = serialLock();
  return { storage, withLock, store: createCourseStore({ storage, withLock }) };
}
const request = (key, overrides = {}) => ({ draft: draft(), clientSaveKey: key, acknowledgeWarnings: true, ...overrides });

test('AC06: save and new store instance re-read preserve title, order, evidence and fictional markers', async () => {
  const { storage, withLock, store } = setup();
  const saved = await store.save(request('first'));
  assert.equal(saved.version, 1);
  const reopened = createCourseStore({ storage, withLock });
  assert.deepEqual(await reopened.get(saved.id), saved);
  assert.deepEqual((await reopened.list()).map((course) => course.id), [saved.id]);
  assert.equal(saved.synthetic, true);
  assert.ok(saved.orderedItems.every((item) => item.synthetic && item.evidence.every((evidence) => evidence.sourceLabel.includes('가상'))));
  const received = await reopened.get(saved.id);
  received.title = '외부 변경';
  assert.equal((await reopened.get(saved.id)).title, saved.title);
});

test('AC05/AC07: unacknowledged uncertainty cannot save and source draft is preserved', async () => {
  const { store } = setup();
  const payload = request('warning', { acknowledgeWarnings: false });
  const before = JSON.stringify(payload.draft);
  await assert.rejects(store.save(payload), code('WARNINGS_NOT_ACKNOWLEDGED'));
  assert.equal((await store.list()).length, 0);
  assert.equal(JSON.stringify(payload.draft), before);
});

test('AC07: repeated and concurrent identical save keys produce one result', async () => {
  const { store } = setup();
  const results = await Promise.all([store.save(request('same-key')), store.save(request('same-key'))]);
  assert.deepEqual(results[0], results[1]);
  assert.equal((await store.list()).length, 1);
  assert.deepEqual(await store.save(request('same-key')), results[0]);
  await assert.rejects(store.save(request('same-key', { draft: draft('다른 내용') })), code('VERSION_CONFLICT'));
});

test('AC07: stale versions reject without overwriting a newer course from another store', async () => {
  const { storage, withLock, store } = setup();
  const original = await store.save(request('create'));
  const secondTab = createCourseStore({ storage, withLock });
  const updated = await secondTab.save(request('update', { courseId: original.id, expectedVersion: 1, draft: draft('수정한 하루', ['demo-library', 'demo-garden']) }));
  assert.equal(updated.version, 2);
  const staleDraft = draft('다른 탭의 초안');
  await assert.rejects(store.save(request('stale', { courseId: original.id, expectedVersion: 1, draft: staleDraft })), code('VERSION_CONFLICT'));
  assert.deepEqual(await store.get(original.id), updated);
  assert.equal(staleDraft.title, '다른 탭의 초안');
});

test('AC07: two simultaneous updates at one version cannot both overwrite', async () => {
  const { storage, withLock, store } = setup();
  const original = await store.save(request('create'));
  const second = createCourseStore({ storage, withLock });
  const results = await Promise.allSettled([
    store.save(request('one', { courseId: original.id, expectedVersion: 1, draft: draft('첫 수정') })),
    second.save(request('two', { courseId: original.id, expectedVersion: 1, draft: draft('다음 수정') })),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'VERSION_CONFLICT');
  assert.equal((await store.get(original.id)).version, 2);
});

test('AC07: quota/write failure reports SAVE_FAILED and preserves draft and earlier storage', async () => {
  const { storage, withLock, store } = setup();
  await store.save(request('saved'));
  const before = storage.getItem(STORAGE_KEY);
  const failing = { getItem: storage.getItem, setItem() { throw new Error('QuotaExceededError'); } };
  const brokenStore = createCourseStore({ storage: failing, withLock });
  const pending = draft('실패 시 보존할 초안');
  await assert.rejects(brokenStore.save(request('fail', { draft: pending })), code('SAVE_FAILED'));
  assert.equal(storage.getItem(STORAGE_KEY), before);
  assert.equal(pending.title, '실패 시 보존할 초안');
});

test('AC07: corrupt or tampered saved data is visible as an error and is never overwritten', async () => {
  const { storage, withLock, store } = setup();
  storage.setItem(STORAGE_KEY, '{invalid-json');
  await assert.rejects(store.list(), code('STORAGE_CORRUPT'));
  await assert.rejects(store.save(request('overwrite')), code('STORAGE_CORRUPT'));
  assert.equal(storage.getItem(STORAGE_KEY), '{invalid-json');
  const fresh = setup();
  await fresh.store.save(request('valid'));
  const changed = JSON.parse(fresh.storage.getItem(STORAGE_KEY));
  changed.courses[0].synthetic = false;
  fresh.storage.setItem(STORAGE_KEY, JSON.stringify(changed));
  await assert.rejects(fresh.store.list(), code('STORAGE_CORRUPT'));
});

test('AC07: unavailable storage does not silently become an empty collection', async () => {
  const store = createCourseStore({ storage: { getItem() { throw new Error('SecurityError'); } }, withLock: serialLock() });
  await assert.rejects(store.list(), code('STORAGE_UNAVAILABLE'));
});

test('AC07: successful write with failed read-back can safely retry the original save key', async () => {
  const storage = memoryStorage();
  let reads = 0;
  const flaky = { getItem(key) { reads += 1; if (reads === 2) throw new Error('read-back blocked'); return storage.getItem(key); }, setItem: storage.setItem };
  const store = createCourseStore({ storage: flaky, withLock: serialLock() });
  await assert.rejects(store.save(request('retry')), code('SAVE_FAILED'));
  const retried = await store.save(request('retry'));
  assert.equal(retried.version, 1);
  assert.equal((await store.list()).length, 1);
});
