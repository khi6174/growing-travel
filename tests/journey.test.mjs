import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfile } from '../dist/profile.mjs';
import { normalizeTrip, compareRegions, buildJourneySnapshot, REGION_OPTIONS, DEPARTURES } from '../dist/journey.mjs';
import { evaluateBenefits, OFFICIAL_BENEFITS, SYNTHETIC_BENEFITS } from '../dist/benefits.mjs';

const profile = (overrides = {}) => normalizeProfile({ age: 23, residenceRegion: '서울', interests: ['quiet', 'nature'], walkingLimitMinutes: 60, ...overrides });
const trip = (overrides = {}) => normalizeTrip({ departureId: 'central', date: '2026-10-24', availableMinutes: 240, budget: 50000, partySize: 1, walkingLimitMinutes: 60, avoidStairs: false, ...overrides });
const snapshot = (overrides = {}) => buildJourneySnapshot({ profile: profile(), trip: trip(), regionId: 'onyu', experienceIds: ['demo-library', 'demo-garden'], ...overrides });

test('trip requires a valid calendar day, departure and integer limits; optional identity is not required', () => {
  for (const date of ['', '2026-02-29', '2026-13-01', '2026-01-32', '24/10/2026', '1999-12-31']) assert.throws(() => trip({ date }), (error) => Boolean(error.fields.date));
  assert.equal(trip({ date: '2028-02-29' }).date, '2028-02-29');
  for (const [field, value] of [['departureId', '서울'], ['availableMinutes', 0], ['budget', -1], ['partySize', 0], ['partySize', 7], ['walkingLimitMinutes', -1], ['walkingLimitMinutes', ''], ['avoidStairs', 'true']]) assert.throws(() => trip({ [field]: value }), (error) => Boolean(error.fields[field]));
  assert.ok(compareRegions(profile({ age: null, residenceRegion: '' }), trip()).length);
});

test('region comparison uses solo and stair constraints and never invents compatible experiences', () => {
  const result = compareRegions(profile(), trip({ avoidStairs: true }));
  assert.equal(result[0].regionId, 'onyu');
  assert.equal(result[0].fitStatus, 'within_demo_limits');
  assert.deepEqual(result.find((item) => item.regionId === 'baram').eligibleExperienceIds, []);
  assert.deepEqual(compareRegions(profile({ interests: ['craft'] }), trip()).map((item) => item.fitStatus), ['no_match', 'no_match']);
  const together = compareRegions(profile({ interests: ['craft'] }), trip({ partySize: 2 }));
  assert.deepEqual(together.find((item) => item.regionId === 'baram').eligibleExperienceIds, ['demo-workshop']);
});

test('walking, total time and per-person budget change suitability without silently relaxing inputs', () => {
  const long = compareRegions(profile({ interests: ['nature'] }), trip({ availableMinutes: 50, walkingLimitMinutes: 0, budget: 0 }));
  const onyu = long.find((item) => item.regionId === 'onyu');
  assert.equal(onyu.fitStatus, 'over_limits');
  assert.deepEqual(onyu.recommendedExperienceIds, []);
  assert.deepEqual(onyu.checks, { time: 'unmet', walking: 'unmet', budget: 'unmet' });
  assert.equal(onyu.estimate.costPerPerson, 6000);
  assert.ok(onyu.reasons.some((text) => text.includes('한도 초과')));
});

test('fictional itinerary includes both station connections, preserves order, totals party costs without a benefit deduction', () => {
  const result = snapshot({ trip: trip({ partySize: 2 }) });
  assert.deepEqual(result.experienceIds, ['demo-library', 'demo-garden']);
  assert.equal(result.legs[0].from, '가상 중앙역');
  assert.equal(result.legs[0].to, '가상 온유역');
  assert.equal(result.legs.at(-1).to, '가상 중앙역');
  assert.equal(result.estimate.activityMinutes, 95);
  assert.equal(result.estimate.travelMinutes, 59);
  assert.equal(result.estimate.walkingMinutes, 49);
  assert.equal(result.estimate.totalMinutes, 154);
  assert.equal(result.estimate.costPerPerson, 6000);
  assert.equal(result.estimate.totalCost, 12000);
  assert.equal(result.estimate.discountApplied, 0);
  assert.ok(result.legs.every((leg) => leg.synthetic && leg.sourceLabel.includes('가상')));
  assert.ok(result.benefits.every((benefit) => benefit.synthetic));
  assert.deepEqual(result, snapshot({ trip: trip({ partySize: 2 }) }));
});

test('missing route data remains unknown and is never counted as a zero-minute complete journey', () => {
  const result = snapshot({ profile: profile({ interests: ['craft', 'nature'] }), trip: trip({ partySize: 2, availableMinutes: 600, walkingLimitMinutes: 300 }), regionId: 'baram', experienceIds: ['demo-workshop', 'demo-river'] });
  assert.equal(result.legs.find((leg) => leg.from.includes('종이공방') && leg.to.includes('바람 물길')).minutes, null);
  assert.equal(result.estimate.walkingMinutes, null);
  assert.equal(result.estimate.totalMinutes, null);
  assert.equal(result.checks.time, 'unknown');
  assert.equal(result.checks.walking, 'unknown');
  assert.ok(result.estimate.knownWalkingMinutes > 0);
  assert.ok(result.warnings.some((text) => text.includes('정보') || text.includes('없어')));
});

test('known lower bounds expose exceeded limits even when another route segment is missing', () => {
  const request = { profile: profile({ interests: ['craft', 'nature'] }), regionId: 'baram', experienceIds: ['demo-workshop', 'demo-river'] };
  const exceeded = snapshot({ ...request, trip: trip({ partySize: 2, availableMinutes: 180, walkingLimitMinutes: 60 }) });
  assert.equal(exceeded.estimate.totalMinutes, null);
  assert.equal(exceeded.estimate.walkingMinutes, null);
  assert.equal(exceeded.estimate.activityMinutes + exceeded.estimate.knownTravelMinutes, 273);
  assert.equal(exceeded.estimate.knownWalkingMinutes, 73);
  assert.equal(exceeded.checks.time, 'unmet');
  assert.equal(exceeded.checks.walking, 'unmet');
  assert.ok(exceeded.warnings.some((text) => text.includes('최소 273분') && text.includes('초과')));
  assert.ok(exceeded.warnings.some((text) => text.includes('최소 73분') && text.includes('초과')));
  assert.ok(exceeded.warnings.every((text) => !text.includes('null분')));
  const boundary = snapshot({ ...request, trip: trip({ partySize: 2, availableMinutes: 273, walkingLimitMinutes: 73 }) });
  assert.equal(boundary.checks.time, 'unknown');
  assert.equal(boundary.checks.walking, 'unknown');
});

test('selection rejects other-region, unknown, duplicate, solo-incompatible and stair-incompatible items', () => {
  for (const experienceIds of [[], ['missing'], ['demo-river'], ['demo-garden', 'demo-garden']]) assert.throws(() => snapshot({ experienceIds }));
  assert.throws(() => snapshot({ regionId: 'baram', experienceIds: ['demo-workshop'], profile: profile({ interests: ['craft'] }) }));
  assert.throws(() => snapshot({ experienceIds: ['demo-gallery'], profile: profile({ interests: ['culture'] }), trip: trip({ avoidStairs: true }) }));
});

test('synthetic benefits differentiate missing personal inputs, age boundaries, residence mismatch and travel-date periods', () => {
  assert.equal(evaluateBenefits(profile({ age: null, residenceRegion: '' }), trip(), 'onyu')[0].status, 'needs_info');
  for (const age of [19, 29]) assert.equal(evaluateBenefits(profile({ age }), trip(), 'onyu')[0].status, 'candidate');
  for (const age of [18, 30]) assert.equal(evaluateBenefits(profile({ age }), trip(), 'onyu')[0].status, 'ineligible');
  assert.equal(evaluateBenefits(profile({ residenceRegion: '' }), trip(), 'onyu')[1].status, 'needs_info');
  assert.equal(evaluateBenefits(profile({ residenceRegion: '부산' }), trip(), 'onyu')[1].status, 'ineligible');
  assert.equal(evaluateBenefits(profile(), trip({ date: '2027-01-01' }), 'onyu')[0].status, 'expired');
  assert.equal(evaluateBenefits(profile(), trip({ date: '2026-09-30' }), 'onyu')[1].status, 'not_started');
  assert.equal(evaluateBenefits(profile(), trip({ date: '2026-11-30' }), 'onyu')[1].status, 'candidate');
  assert.equal(evaluateBenefits(profile(), trip(), 'baram')[1].status, 'ineligible');
});

test('benefits-first sorting uses candidate count without labelling unavailable travel suitable', () => {
  const results = compareRegions(profile({ age: 25, interests: ['nature'] }), trip({ date: '2026-12-01', walkingLimitMinutes: 0 }), { sort: 'benefits' });
  assert.equal(results[0].regionId, 'onyu');
  assert.equal(results[0].candidateBenefitCount, 1);
  assert.equal(results[0].fitStatus, 'over_limits');
  assert.throws(() => compareRegions(profile(), trip(), { sort: 'unknown' }));
});

test('official references stay separate from synthetic matches and expose source age and verification limits', () => {
  assert.equal(OFFICIAL_BENEFITS.length, 5);
  for (const source of OFFICIAL_BENEFITS) {
    assert.equal(source.synthetic, false);
    assert.equal(source.sourceType, 'official_reference');
    assert.equal(source.regionApplicability, 'not_evaluated');
    assert.equal(source.checkedAt, '2026-10-24');
    assert.ok(source.url.startsWith('https://'));
    assert.ok(source.limitations.length);
    assert.equal(Object.hasOwn(source, 'discountAmount'), false);
  }
  assert.ok(SYNTHETIC_BENEFITS.every((item) => item.synthetic && item.sourceType === 'synthetic'));
  assert.deepEqual(new Set(SYNTHETIC_BENEFITS.map((item) => item.category)), new Set(['교통', '문화', '여행', '숙박']));
  assert.ok(REGION_OPTIONS.every((region) => region.name.startsWith('가상')));
  assert.ok(DEPARTURES.every((station) => station.label.startsWith('가상')));
});

test('normalization and comparisons leave caller inputs unchanged', () => {
  const first = profile(), second = trip();
  const initial = JSON.stringify({ first, second });
  compareRegions(first, second);
  snapshot({ profile: first, trip: second });
  assert.equal(JSON.stringify({ first, second }), initial);
});
