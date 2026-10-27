import test from 'node:test';
import assert from 'node:assert/strict';
import { BENEFIT_CATALOG, benefitStatus } from '../dist/benefit-catalog.mjs';
import { evaluateBenefitMatch } from '../dist/benefit-matching.mjs';
import { EXPERIENCES } from '../dist/data.mjs';
import { metaText } from '../dist/ui-copy.mjs';

test('metadata uses comma separators while keeping Korean administrative names intact', () => {
  assert.equal(metaText('만 23세 · 거주 시·도 서울 · 시·군·구 확인 필요'), '만 23세, 거주 시·도 서울, 시·군·구 확인 필요');
  assert.equal(metaText('2026-10-24 자료 확인\t·\t공식 본문 확인'), '2026-10-24 자료 확인, 공식 본문 확인');
  assert.equal(metaText('거주 시·도를 입력해 주세요.'), '거주 시·도를 입력해 주세요.');
  assert.equal(metaText(''), '');
});

test('unspaced metadata enumerations use commas without splitting administrative names', () => {
  assert.equal(metaText('정부·지자체 지원 · 교통·도보 · 거주 시·도 확인'), '정부, 지자체 지원, 교통, 도보, 거주 시·도 확인');
  assert.equal(metaText('시·군·구 확인 · 거주 시·도를 입력해 주세요.'), '시·군·구 확인, 거주 시·도를 입력해 주세요.');
});

test('formatting metadata retains actual route order and its arrows', () => {
  assert.equal(metaText('가상 중앙역 → 가상 온유역 · 도보 8분'), '가상 중앙역 → 가상 온유역, 도보 8분');
});

test('real publication metadata keeps currentness uncertainty and separates it from a personal match', () => {
  const museum = BENEFIT_CATALOG.find((item) => item.id === 'official-mmca-seoul');
  const stay = BENEFIT_CATALOG.find((item) => item.id === 'official-stay-2026');
  assert.equal(metaText(benefitStatus(museum, '2026-10-26').label), '상시 제도 안내, 이용 조건 확인');
  assert.equal(metaText(benefitStatus(stay, '2026-10-26').label), '공고 기간 중, 마감 여부 확인 필요');
  const match = evaluateBenefitMatch(museum, {age:23,residenceRegion:'서울',studentStatus:'not_student'}, {today:'2026-10-26'});
  assert.equal(match.status, 'candidate');
  assert.ok(match.remainingChecks.some((value) => /증빙/.test(value)));
  assert.match(metaText(match.reasons.join(' · ')), /실제 신청 자격이나 수혜 확정이 아닙니다/);
});

test('formatting leaves real official data, evidence, and matching output unchanged', () => {
  const catalogBefore = JSON.stringify(BENEFIT_CATALOG);
  const experiencesBefore = JSON.stringify(EXPERIENCES);
  const matches = BENEFIT_CATALOG.map((item) => evaluateBenefitMatch(item, {age:27,residenceRegion:'부산',studentStatus:'student'}, {today:'2026-10-26'}));
  const matchesBefore = JSON.stringify(matches);
  for (const item of BENEFIT_CATALOG) {
    metaText(item.kind);
    metaText(item.eligibility);
    metaText(benefitStatus(item, '2026-10-26').label);
  }
  for (const match of matches) for (const reason of match.reasons) metaText(reason);
  for (const experience of EXPERIENCES) for (const evidence of experience.evidence) metaText(evidence.sourceLabel);
  assert.equal(JSON.stringify(BENEFIT_CATALOG), catalogBefore);
  assert.equal(JSON.stringify(EXPERIENCES), experiencesBefore);
  assert.equal(JSON.stringify(matches), matchesBefore);
});
