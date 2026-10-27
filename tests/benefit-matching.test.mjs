import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBenefitMatch, rankBenefits } from '../dist/benefit-matching.mjs';

// Contract fixtures only: these fictional rules never enter the public catalog.
const today = '2026-10-24';
const makeBenefit = (matchRules, overrides = {}) => ({
  id:'contract-fixture',synthetic:false,sourceType:'official_reference',verificationLevel:'body_read',schedule:'bounded',
  period:{start:'2026-10-01',end:'2026-11-30'},matchRules:{verified:true,...matchRules},...overrides,
});
const profile = {age:24,residenceRegion:'서울',studentStatus:'student'};
const evaluate = (item,input = profile,day = today) => evaluateBenefitMatch(item,input,{today:day});

test('inclusive age bounds yield candidates but never eligibility approval and preserve remaining checks', () => {
  const item = makeBenefit({age:{min:19,max:24},extraChecks:['회원 인증 필요']});
  for (const age of [19,24]) {
    const result = evaluate(item,{...profile,age});
    assert.equal(result.status,'candidate');
    assert.deepEqual(result.missingFields,[]);
    assert.ok(result.remainingChecks.includes('회원 인증 필요'));
    assert.match(result.reasons.join(' '),/수혜 확정이 아닙니다/);
  }
  for (const age of [18,25]) assert.equal(evaluate(item,{...profile,age}).status,'not_matched');
});

test('missing and invalid required age stay unknown rather than becoming zero or a failed condition', () => {
  const item = makeBenefit({age:{min:19}});
  for (const age of [null,undefined,'',0,-1,'24',NaN,121]) {
    const result = evaluate(item,{...profile,age});
    assert.equal(result.status,'needs_info');
    assert.ok(result.missingFields.includes('age'));
    assert.equal(result.checks.find((check)=>check.field==='age').result,'unknown');
  }
});

test('birth-year cohorts use age only for certain non-overlap, never as birth-year verification', () => {
  const item = makeBenefit({age:{birthYears:[2006,2007]}});
  for (const age of [18,19,20]) {
    const result = evaluate(item,{...profile,age});
    assert.equal(result.status,'needs_info');
    assert.ok(result.missingFields.includes('birthYear'));
  }
  for (const age of [17,21,30]) assert.equal(evaluate(item,{...profile,age}).status,'not_matched');
  assert.equal(evaluate(item,{...profile,age:19},'invalid').status,'needs_info');
});

test('birth-year upper bound preserves uncertainty for all plausible earlier years', () => {
  const item = makeBenefit({age:{birthYearMax:2006}});
  for (const age of [19,20,60,120]) assert.equal(evaluate(item,{...profile,age}).status,'needs_info');
  assert.equal(evaluate(item,{...profile,age:18}).status,'not_matched');
  assert.equal(evaluate(makeBenefit({age:{birthYearMax:2006,birthYears:[2006]}})).status,'needs_info');
});

test('residence rules read residence only and do not substitute a destination or invent locality', () => {
  const item = makeBenefit({residence:{allowedRegions:['서울']}});
  assert.equal(evaluate(item,{...profile,residenceRegion:'서울',destination:'부산'}).status,'candidate');
  assert.equal(evaluate(item,{...profile,residenceRegion:'부산',destination:'서울'}).status,'not_matched');
  assert.equal(evaluate(item,{age:24,studentStatus:'student',destination:'서울'}).status,'needs_info');
  const local = evaluate(makeBenefit({age:{min:19},residence:{requiresLocalCheck:true}}));
  assert.equal(local.status,'needs_info');
  assert.ok(local.missingFields.includes('residenceLocality'));
});

test('known residence mismatch takes precedence over another missing personal condition', () => {
  const item = makeBenefit({age:{min:19},residence:{allowedRegions:['서울'],requiresLocalCheck:true}});
  const result = evaluate(item,{...profile,age:null,residenceRegion:'부산'});
  assert.equal(result.status,'not_matched');
  assert.ok(result.missingFields.includes('age'));
  assert.equal(result.checks.find((check)=>check.field==='residenceRegion').result,'unmet');
});

test('student self-report distinguishes omission, no and yes without inferring from age', () => {
  const item = makeBenefit({student:{required:true}});
  for (const studentStatus of [undefined,'unspecified','verified',null]) {
    const result = evaluate(item,{...profile,studentStatus});
    assert.equal(result.status,'needs_info');
    assert.ok(result.missingFields.includes('studentStatus'));
  }
  assert.equal(evaluate(item,{...profile,studentStatus:'not_student'}).status,'not_matched');
  const candidate = evaluate(item,{...profile,age:null,residenceRegion:''});
  assert.equal(candidate.status,'candidate');
  assert.match(candidate.reasons.join(' '),/재학 인증은 아니에요/);
  assert.ok(candidate.remainingChecks.some((text)=>text.includes('휴학·대학원')));
});

test('unused profile fields are not requested and missing all fields cannot invent a match', () => {
  const item = makeBenefit({age:{min:19},student:{required:false}});
  const result = evaluate(item,{age:24,residenceRegion:'',studentStatus:'unspecified'});
  assert.equal(result.status,'candidate');
  assert.deepEqual(result.missingFields,[]);
  assert.equal(result.checks.find((check)=>check.field==='studentStatus').result,'not_used');
  assert.equal(evaluate(makeBenefit({}),{}).status,'needs_info');
  assert.equal(evaluate(makeBenefit({student:{required:false}}),{}).status,'needs_info');
});

test('unverified or malformed criteria never make a candidate or reject users using unsupported conditions', () => {
  const item = makeBenefit({age:{min:19,max:24}});
  for (const variant of [
    {...item,matchRules:undefined}, {...item,matchRules:{verified:false,age:{max:18}}},
    {...item,verificationLevel:'search_index_only'}, {...item,synthetic:true},
    makeBenefit({age:{min:30,max:19}}), makeBenefit({age:{minimum:19}}),
    makeBenefit({residence:{allowedRegions:['가상도']}}), makeBenefit({student:{required:'yes'}}),
  ]) assert.equal(evaluate(variant).status,'needs_info');
});

test('unsupported top-level AND criteria cannot silently qualify or exclude a user', () => {
  for (const age of [18,23]) {
    const item = makeBenefit({age:{min:19},studentStatus:{required:true}});
    const result = evaluate(item,{...profile,age,studentStatus:'not_student'});
    assert.equal(result.status,'needs_info');
    assert.ok(result.checks.some((check)=>check.field==='criteria' && check.result==='unknown'));
    assert.equal(result.checks.some((check)=>check.result==='met' || check.result==='unmet'),false);
  }
});

test('period is separate from personal fit: future and ended are not current, unknown dates stay uncertain', () => {
  const item = makeBenefit({age:{min:19,max:24}});
  assert.equal(evaluate(item,profile,'2026-09-30').status,'not_current');
  assert.equal(evaluate(item,{...profile,age:30},'2026-12-01').status,'not_current');
  assert.equal(evaluate({...item,schedule:'unverified'}).status,'needs_info');
  assert.equal(evaluate({...item,schedule:'unverified'},{...profile,age:30}).status,'needs_info');
  assert.equal(evaluate({...item,schedule:'ongoing'}).status,'candidate');
  assert.equal(evaluate(item,{...profile,age:30},'2026-02-30').status,'needs_info');
});

test('ranking groups candidates before unknowns, mismatches and dates while preserving stable source order', () => {
  const items = [
    makeBenefit({age:{max:18}},{id:'mismatch'}),
    makeBenefit({age:{min:19}},{id:'future',period:{start:'2026-11-01',end:'2026-11-30'}}),
    makeBenefit({age:{min:19},residence:{requiresLocalCheck:true}},{id:'unknown'}),
    makeBenefit({age:{min:19}},{id:'candidate-a'}),
    makeBenefit({student:{required:true}},{id:'candidate-b'}),
  ];
  const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  freeze(items); const frozenProfile = freeze({...profile}); const before = JSON.stringify(items);
  const ranked = rankBenefits(items,frozenProfile,{today});
  assert.deepEqual(ranked.map(({benefit})=>benefit.id),['candidate-a','candidate-b','unknown','mismatch','future']);
  assert.equal(JSON.stringify(items),before);
  assert.equal(ranked[0].benefit,items[3]);
  assert.notEqual(ranked,items);
});

const alternatives = () => makeBenefit({anyOf:[{age:{max:24}},{age:{min:65}},{student:{required:true,requiresUndergraduateCheck:true}}],extraChecks:['공식 증빙 조건 확인']},{schedule:'ongoing'});
test('OR age alternatives qualify independently of student input and explain only the matching branch', () => {
  for (const [age,studentStatus] of [[23,'unspecified'],[24,'not_student'],[65,'not_student'],[70,'not_student']]) {
    const result = evaluate(alternatives(),{...profile,age,studentStatus});
    assert.equal(result.status,'candidate');
    assert.deepEqual(result.missingFields,[]);
    assert.ok(result.checks.every((check) => check.result !== 'unmet' && check.result !== 'unknown'));
    assert.match(result.reasons[0],/동시에 충족할 필요는 없어요/);
    assert.ok(result.remainingChecks.includes('공식 증빙 조건 확인'));
  }
});
test('OR student alternative distinguishes no, unknown and unverified undergraduate status', () => {
  assert.equal(evaluate(alternatives(),{...profile,age:27,studentStatus:'not_student'}).status,'not_matched');
  const unspecified = evaluate(alternatives(),{...profile,age:27,studentStatus:'unspecified'});
  assert.equal(unspecified.status,'needs_info');
  assert.deepEqual(unspecified.missingFields,['studentStatus']);
  const student = evaluate(alternatives(),{...profile,age:27,studentStatus:'student'});
  assert.equal(student.status,'needs_info');
  assert.deepEqual(student.missingFields,['undergraduateStatus']);
  assert.match(student.reasons.join(' '),/학부/);
  assert.equal(student.checks.some((check)=>check.result==='unmet'),false);
});
test('OR keeps publication boundaries and fails closed on unsupported alternative schemas', () => {
  const item = alternatives();
  assert.equal(evaluate({...item,schedule:'bounded'},profile,'2026-12-01').status,'not_current');
  assert.equal(evaluate({...item,schedule:'unverified'}).status,'needs_info');
  for (const anyOf of [[],[null],[{anyOf:[{age:{max:24}}]}]]) assert.equal(evaluate(makeBenefit({anyOf})).status,'needs_info');
  assert.equal(evaluate(makeBenefit({age:{max:24},anyOf:[{student:{required:true}}]})).status,'needs_info');
  const frozen = Object.freeze({...profile,age:27});
  const before = JSON.stringify(item);
  evaluate(item,frozen);
  assert.equal(JSON.stringify(item),before);
});
