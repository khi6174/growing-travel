import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPERIENCES } from '../dist/data.mjs';
import { normalizeContext, recommend, validateRecommendation, buildCourseDraft, validateCourseDraft } from '../dist/domain.mjs';

const raw = (overrides = {}) => ({ availableMinutes: 180, interests: ['nature', 'quiet'], regionText: '', companion: 'any', mobility: 'any', avoidStairs: false, ...overrides });
const clone = (value) => JSON.parse(JSON.stringify(value));
const code = (expected) => (error) => error.code === expected;

test('AC01: destination undecided is valid, input is copied and duplicates normalized', () => {
  const input = raw({ interests: ['quiet', 'quiet'] });
  const context = normalizeContext(input);
  assert.equal(context.destinationStatus, 'undecided');
  assert.deepEqual(context.interests, ['quiet']);
  input.interests.push('food');
  assert.deepEqual(context.interests, ['quiet']);
});

test('AC01: missing, negative, fractional and out-of-range time and unknown interests fail by field', () => {
  for (const availableMinutes of ['', undefined, -1, 0, 1.5, 1441, 'not-time']) {
    assert.throws(() => normalizeContext(raw({ availableMinutes })), (error) => Boolean(error.fields.availableMinutes));
  }
  assert.throws(() => normalizeContext(raw({ interests: [] })), (error) => Boolean(error.fields.interests));
  assert.throws(() => normalizeContext(raw({ interests: ['invented-interest'] })), code('INVALID_CONTEXT'));
  assert.throws(() => normalizeContext(raw({ regionText: '실제 도시처럼 쓰지 않음' })), code('INVALID_CONTEXT'));
});

test('AC02: rules-based recommendations connect context to known synthetic evidence', () => {
  const run = recommend(raw(), { requestId: 'request-known' });
  assert.equal(run.requestId, 'request-known');
  assert.equal(run.engineKind, 'rules');
  assert.equal(run.status, 'partial');
  assert.ok(run.recommendations.length > 0 && run.recommendations.length <= 4);
  assert.equal(validateRecommendation(run), true);
  for (const result of run.recommendations) {
    assert.equal(result.synthetic, true);
    assert.ok(result.reasons.every((reason) => reason.evidenceRefs.length > 0));
    assert.ok(result.uncertainties.some((text) => text.includes('실제 방문')));
  }
});

test('AC03: empty or constraint-incompatible candidates produce no-match, never fallback fiction', () => {
  assert.equal(recommend(raw(), { candidates: [] }).status, 'no_match');
  assert.equal(recommend(raw({ availableMinutes: 1 })).recommendations.length, 0);
  const unavailable = raw({ interests: ['craft'], companion: 'solo' });
  assert.equal(recommend(unavailable).status, 'no_match');
  assert.throws(() => recommend(raw(), { candidates: null }), code('ENGINE_UNAVAILABLE'));
});

test('AC03: unknown experience and evidence references are rejected', () => {
  const run = recommend(raw());
  const badExperience = clone(run);
  badExperience.recommendations[0].experienceId = 'made-up';
  assert.throws(() => validateRecommendation(badExperience), code('INVALID_REFERENCE'));
  const badEvidence = clone(run);
  badEvidence.recommendations[0].reasons[0].evidenceRefs = ['not-an-evidence'];
  assert.throws(() => validateRecommendation(badEvidence), code('INVALID_REFERENCE'));
  const badField = clone(run);
  badField.recommendations[0].reasons[0].contextFields = ['unknown-field'];
  assert.throws(() => validateRecommendation(badField), code('INVALID_REFERENCE'));
});

test('AC04/AC08: all fixture records are explicitly synthetic and private/non-demo candidates are excluded', () => {
  assert.equal(EXPERIENCES.length, 6);
  for (const item of EXPERIENCES) {
    assert.equal(item.synthetic, true);
    assert.equal(item.provenance.sourceType, 'synthetic');
    assert.equal(item.provenance.observedAt, null);
    assert.ok(item.region.startsWith('가상'));
    assert.ok(item.evidence.every((evidence) => evidence.sourceLabel.includes('가상')));
  }
  const privateCandidate = { ...clone(EXPERIENCES[0]), accessScope: 'private' };
  const realCandidate = { ...clone(EXPERIENCES[1]), synthetic: false };
  assert.equal(recommend(raw(), { candidates: [privateCandidate, realCandidate] }).status, 'no_match');
  const run = recommend(raw(), { candidates: [EXPERIENCES[0]] });
  assert.throws(() => validateRecommendation(run, [privateCandidate]), code('INVALID_REFERENCE'));
});

test('AC03: a structurally valid but constraint-violating response is rejected at the boundary', () => {
  const run = recommend(raw(), { candidates: [EXPERIENCES[0]] });
  run.contextSnapshot.availableMinutes = 5;
  assert.throws(() => validateRecommendation(run), code('INVALID_REFERENCE'));
  const regionRun = recommend(raw(), { candidates: [EXPERIENCES[0]] });
  regionRun.contextSnapshot.regionText = '가상 바람마을';
  assert.throws(() => validateRecommendation(regionRun), code('INVALID_REFERENCE'));
});

test('AC05: order, evidence and labels survive draft construction; transitions remain unknown', () => {
  const draft = buildCourseDraft({ title: '  잠깐 쉬는 하루  ', experienceIds: ['demo-library', 'demo-garden'], context: raw(), requestId: 'context-1' });
  assert.equal(draft.title, '잠깐 쉬는 하루');
  assert.deepEqual(draft.orderedItems.map((item) => item.experienceId), ['demo-library', 'demo-garden']);
  assert.equal(draft.estimate.activityMinutes, 95);
  assert.equal(draft.estimate.transitionMinutes, null);
  assert.equal(draft.estimate.totalMinutes, null);
  assert.equal(draft.feasibility, 'unknown');
  assert.ok(draft.orderedItems.every((item) => item.synthetic && item.evidence.length && item.transitionEstimate === null));
  assert.ok(draft.orderedItems.every((item) => item.reasons.length > 0 && item.reasons.every((reason) => reason.evidenceRefs.length > 0)));
  assert.deepEqual(validateCourseDraft(draft), draft);
  assert.equal(draft.visibility, 'private');
});

test('AC05: empty/unknown/duplicate selections fail; over-budget draft is marked rather than fabricated feasible', () => {
  for (const experienceIds of [[], ['unknown'], ['demo-garden', 'demo-garden']]) {
    assert.throws(() => buildCourseDraft({ title: '하루', experienceIds, context: raw() }));
  }
  const draft = buildCourseDraft({ title: '긴 하루', experienceIds: ['demo-garden', 'demo-library'], context: raw({ availableMinutes: 60 }) });
  assert.equal(draft.feasibility, 'over_budget');
  assert.equal(draft.estimate.overBudget, true);
  assert.ok(draft.estimate.warnings.some((warning) => warning.includes('초과')));
});

test('AC04: removing a saved draft synthetic marker or editing evidence fails validation', () => {
  const draft = buildCourseDraft({ title: '시연', experienceIds: ['demo-garden'], context: raw() });
  const missingLabel = clone(draft);
  missingLabel.orderedItems[0].synthetic = false;
  assert.throws(() => validateCourseDraft(missingLabel), code('INVALID_COURSE'));
  const alteredEvidence = clone(draft);
  alteredEvidence.orderedItems[0].evidence[0].claim = '실제 방문으로 검증됨';
  assert.throws(() => validateCourseDraft(alteredEvidence), code('INVALID_COURSE'));
});

test('AC08: recommendation does not mutate inputs or perform storage writes', () => {
  const input = raw();
  const before = JSON.stringify(input);
  const dataBefore = JSON.stringify(EXPERIENCES);
  recommend(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(JSON.stringify(EXPERIENCES), dataBefore);
});
