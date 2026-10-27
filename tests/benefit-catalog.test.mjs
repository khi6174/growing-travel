import test from 'node:test';
import assert from 'node:assert/strict';
import { BENEFIT_CATALOG, benefitStatus, selectBenefits, seoulToday } from '../dist/benefit-catalog.mjs';
import { evaluateBenefitMatch, rankBenefits } from '../dist/benefit-matching.mjs';

test('published application dates include boundaries and expire independently of use period', () => {
  const item = BENEFIT_CATALOG.find((item) => item.id === 'official-culture-2026');
  assert.equal(benefitStatus(item,'2026-08-09').code,'upcoming');
  for (const day of ['2026-08-10','2026-10-24','2026-11-30']) assert.equal(benefitStatus(item,day).code,'in_period');
  assert.equal(benefitStatus(item,'2026-12-01').code,'ended');
  assert.equal(benefitStatus(item,'2027-10-24').code,'ended');
  assert.match(benefitStatus(item,'2026-10-24').label,/마감 여부 확인/);
});
test('unknown, malformed, index-only and synthetic sources never claim a current application period', () => {
  const item = BENEFIT_CATALOG[0];
  const variants = [
    {...item,period:null}, {...item,period:{start:'2026-02-30',end:'2026-11-08'}},
    {...item,period:{start:'2026-11-08',end:'2026-09-22'}}, {...item,verificationLevel:'search_index_only'},
    {...item,synthetic:true}, {...item,sourceType:'synthetic'},
  ];
  variants.forEach((value) => assert.equal(benefitStatus(value,'2026-10-24').code,'needs_check'));
  assert.equal(benefitStatus(item,'2026-02-30').code,'needs_check');
  assert.equal(benefitStatus(BENEFIT_CATALOG.find((item)=>item.id==='official-kpass'),'2026-10-24').code,'ongoing_info');
});
test('filters exclude synthetic examples and have an honest empty state without mutating the catalog', () => {
  const before = JSON.stringify(BENEFIT_CATALOG);
  assert.equal(selectBenefits({today:'2026-10-24',status:'in_period'}).length,2);
  assert.deepEqual(selectBenefits({today:'2026-10-24',category:'교통',status:'in_period'}),[]);
  assert.equal(selectBenefits({today:'2026-11-09',category:'숙박',status:'in_period'}).length,0);
  assert.equal(selectBenefits({items:[{...BENEFIT_CATALOG[0],synthetic:true}],today:'2026-10-24'}).length,0);
  assert.equal(JSON.stringify(BENEFIT_CATALOG),before);
  for (const item of BENEFIT_CATALOG) assert.ok(item.url.startsWith('https://') && item.checkedAt && item.limitations);
});
test('calendar comparison uses Korea time across the UTC day boundary', () => {
  assert.equal(seoulToday(new Date('2026-10-23T14:59:59Z')),'2026-10-23');
  assert.equal(seoulToday(new Date('2026-10-23T15:00:00Z')),'2026-10-24');
});

test('real catalog ranks supported age/residence candidates above birth-year and unread source uncertainty', () => {
  const profile = {age:23,residenceRegion:'서울',studentStatus:'student'};
  const ranked = rankBenefits(selectBenefits({today:'2026-10-24'}),profile,{today:'2026-10-24'});
  assert.deepEqual(new Set(ranked.filter(({match})=>match.status==='candidate').map(({benefit})=>benefit.id)),new Set(['official-kpass','official-mmca-seoul']));
  assert.ok(ranked.slice(0,2).every(({match})=>match.status==='candidate'));
  assert.equal(ranked.find(({benefit})=>benefit.id==='official-stay-2026').match.status,'needs_info');
  assert.equal(ranked.find(({benefit})=>benefit.id==='official-culture-2026').match.status,'not_matched');
  for (const id of ['official-youth','official-cheerup','official-railro']) assert.equal(ranked.find(({benefit})=>benefit.id===id).match.status,'needs_info');
});
test('real museum student branch preserves undergraduate uncertainty and never requires Seoul residence', () => {
  const item = BENEFIT_CATALOG.find((item)=>item.id==='official-mmca-seoul');
  const compare = (age,studentStatus) => evaluateBenefitMatch(item,{age,residenceRegion:'제주',studentStatus},{today:'2026-10-24'});
  assert.equal(compare(23,'unspecified').status,'candidate');
  assert.equal(compare(27,'student').status,'needs_info');
  assert.ok(compare(27,'student').missingFields.includes('undergraduateStatus'));
  assert.equal(compare(27,'not_student').status,'not_matched');
  assert.equal(compare(70,'not_student').status,'candidate');
});
