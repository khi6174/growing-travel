import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCourseDraft, validateCourseDraft, recommend } from '../dist/domain.mjs';
import { createCourseStore, STORAGE_KEY } from '../dist/storage.mjs';
import { DEFAULT_PROFILE } from '../dist/profile.mjs';
import { compareRegions } from '../dist/journey.mjs';

const legacy = JSON.parse(fs.readFileSync(new URL('./fixtures/course-v1.json', import.meta.url), 'utf8'));
// Generated and validated with the pre-student implementation before changing
// normalizeProfile, so this fixture catches accidental retroactive migration.
const beforeStudent = JSON.parse(fs.readFileSync(new URL('./fixtures/course-journey-before-student.json', import.meta.url), 'utf8'));
const profile = { ...DEFAULT_PROFILE, age: 24, residenceRegion: '서울' };
const trip = { departureId: 'central', date: '2026-10-24', availableMinutes: 300, budget: 50000, partySize: 1, walkingLimitMinutes: 60, avoidStairs: false };
const context = { availableMinutes: 300, interests: profile.interests, regionText: '가상 온유동', companion: 'solo', mobility: 'walk_transit', avoidStairs: false };
const draft = () => buildCourseDraft({ title: '조건을 담은 가상 여행', experienceIds: ['demo-garden', 'demo-library'], context, requestId: 'journey-test', journey: { profile, trip, regionId: 'onyu' } });
function storageWithLegacy() {
  const values = new Map([[STORAGE_KEY, JSON.stringify({ schemaVersion: 1, courses: [legacy], requests: [] })]]);
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
const options = (storage) => ({ storage, withLock: (action) => action() });

test('pre-extension v1 fixture opens unchanged; new journey course coexists and reopens with input, evidence and benefit status', async () => {
  const storage = storageWithLegacy();
  const before = storage.getItem(STORAGE_KEY);
  const store = createCourseStore(options(storage));
  assert.deepEqual(await store.get(legacy.id), legacy);
  assert.equal(storage.getItem(STORAGE_KEY), before);
  const saved = await store.save({ draft: draft(), clientSaveKey: 'new-journey', acknowledgeWarnings: true });
  const reopened = await createCourseStore(options(storage)).get(saved.id);
  assert.deepEqual(reopened, saved);
  assert.equal(reopened.journeySnapshot.profileSnapshot.age, 24);
  assert.equal(reopened.journeySnapshot.profileSnapshot.residenceRegion, '서울');
  assert.equal(reopened.journeySnapshot.estimate.discountApplied, 0);
  assert.ok(reopened.journeySnapshot.benefits.every((benefit) => benefit.synthetic));
  assert.deepEqual(await store.get(legacy.id), legacy);
  assert.equal((await store.list()).length, 2);
});

test('legacy course can still be edited without fabricating new profile or journey fields', async () => {
  const storage = storageWithLegacy();
  const store = createCourseStore(options(storage));
  const legacyDraft = buildCourseDraft({ title: '기존 코스 수정', experienceIds: legacy.orderedItems.map((item) => item.experienceId), context: legacy.contextSnapshot, requestId: legacy.sourceRequestId });
  const saved = await store.save({ draft: legacyDraft, courseId: legacy.id, expectedVersion: 1, clientSaveKey: 'legacy-edit', acknowledgeWarnings: true });
  assert.equal(saved.version, 2); assert.equal(saved.title, '기존 코스 수정');
  assert.equal(Object.hasOwn(saved, 'journeySnapshot'), false);
  assert.deepEqual(saved.orderedItems, legacy.orderedItems);
});

test('pre-student journey snapshot and request history remain byte-for-byte intact on read and coexist with student courses', async () => {
  const storage = storageWithLegacy();
  const oldDraft = { ...beforeStudent };
  for (const key of ['id', 'version', 'savedAt']) delete oldDraft[key];
  const signature = JSON.stringify({ draft: oldDraft, courseId: null, expectedVersion: null });
  const bytes = JSON.stringify({ schemaVersion: 1, courses: [legacy, beforeStudent], requests: [{ key: 'before-student-save', signature, result: beforeStudent }] });
  storage.setItem(STORAGE_KEY, bytes);
  const store = createCourseStore(options(storage));
  assert.deepEqual(await store.get(beforeStudent.id), beforeStudent);
  assert.equal(storage.getItem(STORAGE_KEY), bytes);
  const replay = await store.save({ draft: oldDraft, clientSaveKey: 'before-student-save', acknowledgeWarnings: true });
  assert.deepEqual(replay, beforeStudent);
  assert.equal(storage.getItem(STORAGE_KEY), bytes);

  const studentDraft = buildCourseDraft({ title: '대학생 선택 가상 여행', experienceIds: ['demo-garden', 'demo-library'], context, requestId: 'student-test', journey: { profile: { ...profile, studentStatus: 'student' }, trip, regionId: 'onyu' } });
  const saved = await store.save({ draft: studentDraft, clientSaveKey: 'student-save', acknowledgeWarnings: true });
  const reopened = createCourseStore(options(storage));
  assert.equal((await reopened.get(saved.id)).journeySnapshot.profileSnapshot.studentStatus, 'student');
  assert.deepEqual(await reopened.get(beforeStudent.id), beforeStudent);
  assert.deepEqual(await reopened.get(legacy.id), legacy);
  assert.equal((await reopened.list()).length, 3);
});

test('pre-student journey can be edited and reopened without inferring university status', async () => {
  const storage = storageWithLegacy();
  storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, courses: [beforeStudent], requests: [] }));
  const journey = beforeStudent.journeySnapshot;
  const edited = buildCourseDraft({ title: '대학생 여부 미입력 유지', experienceIds: [...journey.experienceIds].reverse(), context: beforeStudent.contextSnapshot, requestId: beforeStudent.sourceRequestId, journey: { profile: journey.profileSnapshot, trip: journey.tripSnapshot, regionId: journey.regionId } });
  assert.equal(edited.journeySnapshot.profileSnapshot.studentStatus, 'unspecified');
  const store = createCourseStore(options(storage));
  const saved = await store.save({ draft: edited, courseId: beforeStudent.id, expectedVersion: 1, clientSaveKey: 'old-journey-edit', acknowledgeWarnings: true });
  assert.equal(saved.version, 2);
  assert.deepEqual(await createCourseStore(options(storage)).get(saved.id), saved);
  assert.equal(saved.journeySnapshot.profileSnapshot.studentStatus, 'unspecified');
  assert.equal(Object.hasOwn(beforeStudent.journeySnapshot.profileSnapshot, 'studentStatus'), false);
  const tampered = structuredClone(edited);
  tampered.journeySnapshot.profileSnapshot.studentStatus = 'verified';
  assert.throws(() => validateCourseDraft(tampered));
});

test('journey/course disagreement and tampered costs, synthetic flags, benefit state and legs are rejected', () => {
  assert.throws(() => buildCourseDraft({ title: 'mismatch', experienceIds: ['demo-garden'], context: { ...context, availableMinutes: 200 }, journey: { profile, trip, regionId: 'onyu' } }));
  for (const change of [
    (value) => { value.journeySnapshot.estimate.discountApplied = 5000; },
    (value) => { value.journeySnapshot.synthetic = false; },
    (value) => { value.journeySnapshot.benefits[0].status = 'confirmed'; },
    (value) => { value.journeySnapshot.legs[0].minutes = 0; },
    (value) => { value.journeySnapshot = null; },
  ]) { const value = draft(); change(value); assert.throws(() => validateCourseDraft(value)); }
});

test('station transit plus walking-only experience remains consistent between region and experience recommendation', () => {
  const walkingProfile = { ...profile, interests: ['nature'] };
  const walkingTrip = { ...trip, walkingLimitMinutes: 120 };
  const region = compareRegions(walkingProfile, walkingTrip).find((value) => value.regionId === 'baram');
  const run = recommend({ ...context, interests: walkingProfile.interests, regionText: region.name });
  assert.deepEqual(region.recommendedExperienceIds, ['demo-river']);
  assert.deepEqual(run.recommendations.map((value) => value.experienceId), ['demo-river']);
  const course = buildCourseDraft({ title:'도보 연결', experienceIds:region.recommendedExperienceIds, context:run.contextSnapshot, journey:{ profile:walkingProfile, trip:walkingTrip, regionId:'baram' } });
  assert.equal(validateCourseDraft(course).journeySnapshot.checks.walking, 'met');
});
