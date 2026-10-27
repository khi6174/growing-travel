import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REAL_PLACES, REAL_REGIONS } from '../dist/real-catalog.mjs';
import { DEFAULT_PROFILE } from '../dist/profile.mjs';
import { buildCourseDraft, validateCourseDraft, recommend, normalizeContext, validateRecommendation } from '../dist/travel-domain.mjs';
import { buildCourseDraft as oldDraft } from '../dist/domain.mjs';
import { buildJourneySnapshot, compareRegions, normalizeTrip, closedOn } from '../dist/travel-journey.mjs';
import { mapRoute } from '../dist/travel-links.mjs';
import { createCourseStore, STORAGE_KEY } from '../dist/storage.mjs';

const profile = { ...DEFAULT_PROFILE, interests: ['nature', 'quiet', 'culture', 'food', 'craft', 'photo'] };
const trip = { departureId: 'cheongnyangni', date: '2026-10-28', availableMinutes: 720, budget: 100000, partySize: 1, walkingLimitMinutes: 120, avoidStairs: false };
const clone = (value) => structuredClone(value);
function setup() {
  const comparison = compareRegions(profile, trip).find((region) => region.recommendedExperienceIds.length >= 2);
  assert.ok(comparison, 'catalog must provide at least two selectable places');
  const regionId = comparison.regionId;
  const context = { availableMinutes: trip.availableMinutes, interests: profile.interests, regionText: comparison.name, companion: 'solo', mobility: 'walk_transit', avoidStairs: false };
  return { title: '실제 장소 여행', experienceIds: comparison.recommendedExperienceIds, context, requestId: 'real-test', journey: { profile, trip, regionId } };
}
test('real null aggregates never become zero and selected places form round trip', () => {
  const draft = buildCourseDraft(setup());
  const journey = draft.journeySnapshot;
  assert.equal(draft.synthetic, false);
  assert.equal(journey.legs.length, draft.orderedItems.length + 3);
  assert.equal(journey.legs[0].fromId, trip.departureId);
  assert.equal(journey.legs.at(-1).toId, trip.departureId);
  for (const key of ['totalMinutes', 'travelMinutes', 'walkingMinutes', 'costPerPerson', 'totalCost']) assert.equal(journey.estimate[key], null);
  assert.equal(journey.estimate.discountApplied, 0);
  assert.ok(journey.legs.every((leg) => leg.minutes === null && leg.fare === null));
  assert.equal(validateCourseDraft(draft).contractVersion, 'real-travel-v1');
});
test('user times apply only to matching directed legs; reorder discards obsolete overrides', () => {
  const input = setup();
  const base = buildJourneySnapshot({ ...input.journey, experienceIds: input.experienceIds });
  const travelOverrides = Object.fromEntries(base.legs.map((leg) => [leg.id, { minutes: 10 }]));
  const complete = buildJourneySnapshot({ ...input.journey, experienceIds: input.experienceIds, travelOverrides });
  assert.equal(complete.estimate.travelMinutes, base.legs.length * 10);
  assert.equal(complete.estimate.totalMinutes, complete.estimate.activityMinutes + base.legs.length * 10);
  assert.ok(complete.legs.every((leg) => leg.sourceLabel === '직접 입력'));
  const reordered = buildJourneySnapshot({ ...input.journey, experienceIds: [...input.experienceIds].reverse(), travelOverrides });
  assert.equal(reordered.estimate.totalMinutes, null);
  assert.equal(reordered.estimate.knownTravelMinutes, 20);
  assert.equal(Object.keys(reordered.travelOverrides).length, 2);
  assert.equal(reordered.estimate.walkingMinutes, null);
});
test('regular closure is excluded; unknown stairs do not become accessible', () => {
  const place = REAL_PLACES.find((item) => item.opening.closedWeekdays.length);
  assert.ok(place, 'catalog includes verified weekly closure');
  const date = Array.from({ length: 7 }, (_, index) => `2026-10-${25 + index}`).find((day) => closedOn(place, day));
  const context = { availableMinutes: 720, interests: place.tags, regionText: place.region, companion: 'solo', mobility: 'walk_transit', avoidStairs: false };
  assert.equal(recommend(context, { date, candidates: [place] }).recommendations.length, 0);
  assert.equal(recommend({ ...context, avoidStairs: true }, { candidates: [{ ...place, stairs: null }] }).recommendations.length, 0);
});
test('map links encode names and use explicit search fallback when coordinates unknown', () => {
  const from = { title: '서울/역 & 출발', location: { lat: 37.55, lng: 126.97 } };
  const to = { title: '춘천 역', location: { lat: 37.88, lng: 127.71 } };
  assert.equal(mapRoute(from, to).url, `https://map.kakao.com/link/by/traffic/${encodeURIComponent(from.title)},37.55,126.97/${encodeURIComponent(to.title)},37.88,127.71`);
  assert.ok(mapRoute(from, to, 'walk').url.includes('/by/walk/'));
  assert.equal(mapRoute(from, { ...to, location: null }).kind, 'search');
  assert.match(mapRoute(from, { ...to, location: null }).label, /검색/);
});
test('snapshot validator rejects tampered sums, order, references, URLs and coordinates', () => {
  const original = buildCourseDraft(setup());
  for (const mutate of [
    (draft) => { draft.journeySnapshot.estimate.totalMinutes = 0; },
    (draft) => { draft.orderedItems[0].order = 1; },
    (draft) => { draft.journeySnapshot.legs[0].toId = 'other'; },
    (draft) => { draft.orderedItems[0].displaySnapshot.source.url = 'javascript:alert(1)'; },
    (draft) => { draft.orderedItems[0].displaySnapshot.opening.sourceUrl = 'javascript:alert(1)'; },
    (draft) => { draft.orderedItems[0].displaySnapshot.evidence[0].url = 'javascript:alert(1)'; },
    (draft) => { draft.orderedItems[0].displaySnapshot.location = { lat: 200, lng: 128 }; },
    (draft) => { draft.journeySnapshot.travelOverrides = { 'leg:bad>route': { minutes: 10 } }; },
  ]) {
    const changed = clone(original);
    mutate(changed);
    const journey = changed.journeySnapshot;
    journey.placeSnapshots = changed.orderedItems.map((item) => clone(item.displaySnapshot));
    changed.orderedItems.forEach((item) => { item.evidence = clone(item.displaySnapshot.evidence); });
    const station = { title: journey.station, location: journey.regionSnapshot.stationLocation };
    const points = [journey.departureSnapshot, station, ...journey.placeSnapshots, station, journey.departureSnapshot];
    journey.legs.forEach((leg, index) => {
      const route = mapRoute(points[index], points[index + 1]);
      leg.routeUrl = route.url;
      leg.linkKind = route.kind;
      leg.walkUrl = index > 0 && index < points.length - 2 ? mapRoute(points[index], points[index + 1], 'walk').url : null;
    });
    assert.throws(() => validateCourseDraft(changed), { code: 'INVALID_COURSE' });
  }
});
test('historical official description is validated from saved snapshot without catalog rebuild', () => {
  const draft = buildCourseDraft(setup());
  draft.orderedItems[0].displaySnapshot.summary = '저장 당시의 공식 안내 요약';
  draft.journeySnapshot.placeSnapshots[0].summary = '저장 당시의 공식 안내 요약';
  assert.deepEqual(validateCourseDraft(draft), draft);
});
test('optional geoSource validates safe links, labels and calendar dates on all saved point types', () => {
  const original = buildCourseDraft(setup());
  const targets = [
    (draft) => [draft.journeySnapshot.departureSnapshot],
    (draft) => [draft.journeySnapshot.regionSnapshot],
    (draft) => [draft.orderedItems[0].displaySnapshot, draft.journeySnapshot.placeSnapshots[0]],
  ];
  const valid = { url: 'https://example.org/coordinates', label: '저장 당시 좌표 출처', checkedAt: '2026-10-27' };
  for (const target of targets) {
    const absent = clone(original);
    target(absent).forEach((point) => { delete point.geoSource; });
    assert.deepEqual(validateCourseDraft(absent), absent);
    const supplied = clone(absent);
    target(supplied).forEach((point) => { point.geoSource = clone(valid); });
    assert.deepEqual(validateCourseDraft(supplied), supplied);
    for (const source of [null, { ...valid, url: 'javascript:alert(1)' }, { ...valid, label: ' ' }, { ...valid, checkedAt: '2026-02-30' }, { ...valid, checkedAt: 'unknown' }]) {
      const invalid = clone(absent);
      target(invalid).forEach((point) => { point.geoSource = clone(source); });
      assert.throws(() => validateCourseDraft(invalid), { code: 'INVALID_COURSE' });
    }
  }
});
test('input bounds, dates, duplicate selections and references fail before saving', () => {
  const input = setup();
  assert.throws(() => normalizeTrip({ ...trip, departureId: 'unknown' }));
  assert.throws(() => normalizeContext({ ...input.context, date: '2026-02-30' }));
  assert.throws(() => buildCourseDraft({ ...input, experienceIds: [input.experienceIds[0], input.experienceIds[0]] }));
  assert.throws(() => buildJourneySnapshot({ ...input.journey, experienceIds: input.experienceIds, travelOverrides: { 'leg:a>b': { minutes: -1 } } }));
  const run = recommend(input.context, { date: trip.date });
  assert.equal(validateRecommendation(run), true);
  run.recommendations[0].reasons[0].evidenceRefs = ['invented'];
  assert.throws(() => validateRecommendation(run));
});
test('mixed real and legacy store preserves old request history and idempotence', async () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const withLock = async (action) => action();
  const store = createCourseStore({ storage, withLock });
  const legacy = oldDraft({ title: '예전 코스', experienceIds: ['demo-garden'], context: { availableMinutes: 180, interests: ['nature'], regionText: '', companion: 'any', mobility: 'any', avoidStairs: false }, requestId: 'old-request' });
  const oldRequest = { draft: legacy, clientSaveKey: 'old', acknowledgeWarnings: true };
  const old = await store.save(oldRequest);
  const oldHistory = clone(JSON.parse(storage.getItem(STORAGE_KEY)).requests[0]);
  const request = { draft: buildCourseDraft(setup()), clientSaveKey: 'real', acknowledgeWarnings: true };
  const real = await store.save(request);
  assert.deepEqual(await store.save(request), real);
  const reopened = createCourseStore({ storage, withLock });
  assert.equal((await reopened.list()).length, 2);
  assert.deepEqual(await reopened.get(old.id), old);
  assert.deepEqual(await reopened.save(oldRequest), old);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)).requests[0], oldHistory);
  const update = { ...request, draft: { ...request.draft, title: '수정 코스' }, clientSaveKey: 'updated', courseId: real.id, expectedVersion: 1 };
  assert.equal((await reopened.save(update)).version, 2);
  assert.deepEqual(await reopened.save(request), real);
});
test('pre-student historical request bytes coexist unchanged with new real course', async () => {
  const historic = JSON.parse(fs.readFileSync(new URL('./fixtures/course-journey-before-student.json', import.meta.url), 'utf8'));
  const historicDraft = clone(historic);
  for (const key of ['id', 'version', 'savedAt']) delete historicDraft[key];
  const history = { key: 'historical', signature: JSON.stringify({ draft: historicDraft, courseId: null, expectedVersion: null }), result: historic };
  let bytes = JSON.stringify({ schemaVersion: 1, courses: [historic], requests: [history] });
  const storage = { getItem: () => bytes, setItem: (_key, value) => { bytes = value; } };
  const store = createCourseStore({ storage, withLock: (action) => action() });
  const before = bytes;
  assert.deepEqual(await store.get(historic.id), historic);
  assert.equal(bytes, before);
  await store.save({ draft: buildCourseDraft(setup()), clientSaveKey: 'real-after-history', acknowledgeWarnings: true });
  assert.deepEqual(await store.save({ draft: historicDraft, clientSaveKey: 'historical', acknowledgeWarnings: true }), historic);
  assert.deepEqual(JSON.parse(bytes).requests[0], history);
  assert.equal((await store.list()).length, 2);
});
