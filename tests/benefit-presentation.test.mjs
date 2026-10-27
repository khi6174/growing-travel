import test from 'node:test';
import assert from 'node:assert/strict';
import { BENEFIT_CATALOG } from '../dist/benefit-catalog.mjs';
import { evaluateBenefitMatch, rankBenefits } from '../dist/benefit-matching.mjs';
import { hasStudentRoute, shortReason, getBenefitPresentation } from '../dist/benefit-presentation.mjs';

const today = '2026-10-26';
const museum = BENEFIT_CATALOG.find((item) => item.id === 'official-mmca-seoul');
const evaluate = (item, input) => evaluateBenefitMatch(item, input, {today});
const profile = {age:23, residenceRegion:'서울', studentStatus:'not_student'};

test('only the verified museum student alternative receives a student-route indicator in the real catalog', () => {
  assert.deepEqual(BENEFIT_CATALOG.filter(hasStudentRoute).map((item) => item.id), ['official-mmca-seoul']);
  assert.equal(hasStudentRoute({...museum, matchRules:{verified:true, student:{required:true}}}), true);
  assert.equal(hasStudentRoute({...museum, matchRules:{verified:true, student:{required:false}}}), false);
});

test('student-route indicators fail closed for unverified, synthetic and unsupported rule schemas', () => {
  for (const variant of [
    null, {}, {...museum, synthetic:true}, {...museum, sourceType:'synthetic'},
    {...museum, verificationLevel:'search_index_only'},
    {...museum, matchRules:{verified:false, student:{required:true}}},
    {...museum, matchRules:{verified:true, student:{required:'true'}}},
    {...museum, matchRules:{verified:true, student:{required:true, unsupported:true}}},
    {...museum, matchRules:{verified:true, student:{required:true, requiresUndergraduateCheck:'yes'}}},
    {...museum, matchRules:{verified:true, student:{required:true}, nationality:'KR'}},
    {...museum, matchRules:{verified:true, age:{max:24}, anyOf:[{student:{required:true}}]}},
    {...museum, matchRules:{verified:true, anyOf:[]}},
    {...museum, matchRules:{verified:true, anyOf:[null]}},
    {...museum, matchRules:{verified:true, anyOf:[{anyOf:[{student:{required:true}}]}]}},
    {...museum, matchRules:{verified:true, anyOf:[{student:{required:true}}, {nationality:'KR'}]}},
  ]) assert.equal(hasStudentRoute(variant), false);
});

test('a student route does not claim that a young non-student qualified through the student alternative', () => {
  const match = evaluate(museum, profile);
  const presentation = getBenefitPresentation(museum, match);
  assert.equal(match.status, 'candidate');
  assert.equal(presentation.hasStudentRoute, true);
  assert.match(presentation.shortReason, /대안 1:.*만 24세 이하/);
  assert.doesNotMatch(presentation.shortReason, /대학생/);
  assert.ok(match.remainingChecks.some((value) => value.includes('증빙')));
});

test('unknown undergraduate status and a known mismatch keep their actual reasons', () => {
  const needsInfo = evaluate(museum, {...profile, age:27, studentStatus:'student'});
  assert.equal(needsInfo.status, 'needs_info');
  assert.match(shortReason(needsInfo), /학부.*공식 안내에서 확인/);
  const mismatch = evaluate(museum, {...profile, age:27});
  assert.equal(mismatch.status, 'not_matched');
  assert.match(shortReason(mismatch), /조건과 달라요/);
  assert.ok(mismatch.checks.some((check) => check.message === shortReason(mismatch) && check.result === 'unmet'));
});

test('short summaries retain publication boundary priority and never invent fallback eligibility', () => {
  const item = BENEFIT_CATALOG.find((benefit) => benefit.id === 'official-stay-2026');
  const ended = evaluateBenefitMatch(item, profile, {today:'2026-12-01'});
  assert.equal(shortReason(ended), '공고 기간 종료');
  const unknown = evaluate(BENEFIT_CATALOG.find((benefit) => benefit.id === 'official-youth'), profile);
  assert.match(shortReason(unknown), /공식 본문/);
  for (const empty of [null, undefined, {}, {reasons:[null, '', '  ']}]) {
    assert.match(shortReason(empty), /확인할 수 없어요/);
  }
});

test('presentation and student filtering do not mutate matches, source data, input, or ranking', () => {
  const before = JSON.stringify(BENEFIT_CATALOG);
  const ranked = rankBenefits(BENEFIT_CATALOG, Object.freeze({...profile}), {today});
  const rankedBefore = JSON.stringify(ranked);
  for (const {benefit, match} of ranked) {
    getBenefitPresentation(benefit, match);
    hasStudentRoute(benefit);
  }
  assert.equal(JSON.stringify(BENEFIT_CATALOG), before);
  assert.equal(JSON.stringify(ranked), rankedBefore);
  assert.equal(ranked.filter(({benefit}) => hasStudentRoute(benefit))[0].match.status, 'candidate');
});
