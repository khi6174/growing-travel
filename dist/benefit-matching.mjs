import { benefitStatus, seoulToday } from './benefit-catalog.mjs';
import { RESIDENCE_REGIONS, STUDENT_STATUSES } from './profile.mjs';

const LABELS = Object.freeze({ candidate:'조건이 맞는 후보', needs_info:'추가 확인 필요', not_matched:'알려진 조건 불일치', not_current:'현재 진행 기간 아님' });
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const validDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;

function matchAlternatives(item, input, rules, today, period) {
  // One level of OR is supported. Nested/mixed schemas fail closed instead of
  // silently dropping a condition or treating OR branches as simultaneous ANDs.
  const valid = Array.isArray(rules.anyOf) && rules.anyOf.length > 0
    && Object.keys(rules).every((key) => ['verified','anyOf','extraChecks'].includes(key))
    && rules.anyOf.every((branch) => record(branch) && Object.keys(branch).length > 0 && Object.keys(branch).every((key) => ['age','residence','student','extraChecks'].includes(key)));
  if (!valid) return evaluateBenefitMatch({...item,matchRules:{verified:false}},input,{today});
  const alternatives = rules.anyOf.map((branch,index) => ({index,match:evaluateBenefitMatch({...item,matchRules:{verified:true,...branch,extraChecks:[...(Array.isArray(rules.extraChecks) ? rules.extraChecks : []),...(Array.isArray(branch.extraChecks) ? branch.extraChecks : [])]}},input,{today})}));
  const candidate = alternatives.find(({match}) => match.status === 'candidate');
  const unknowns = alternatives.filter(({match}) => match.status === 'needs_info');
  const status = ['upcoming','ended'].includes(period.code) ? 'not_current'
    : period.code === 'needs_check' ? 'needs_info'
    : candidate ? 'candidate' : unknowns.length ? 'needs_info' : 'not_matched';
  // Show the successful alternative alone, or unresolved alternatives that could
  // still qualify. This avoids contradictory-looking age pass/fail messages.
  const relevant = candidate && status === 'candidate' ? [candidate] : unknowns.length ? unknowns : alternatives;
  const prefix = (index) => `대안 ${index + 1}: `;
  const lead = status === 'candidate' ? `확인한 ${alternatives.length}가지 대안 중 하나의 입력 조건이 맞아요. 모든 대안을 동시에 충족할 필요는 없어요.`
    : status === 'not_matched' ? '확인한 대안 중 어느 하나와도 현재 입력 조건이 맞지 않아요.'
    : '아래 대안 중 하나가 맞으면 되는 조건입니다. 아직 확인되지 않은 대안을 살펴보세요.';
  return {
    status,label:LABELS[status],
    reasons:[...(status === 'not_current' ? [period.label] : []),lead,...relevant.flatMap(({index,match}) => match.reasons.map((reason) => prefix(index) + reason))],
    missingFields:[...new Set(relevant.flatMap(({match}) => match.missingFields))],
    checks:relevant.flatMap(({index,match}) => match.checks.map((check) => ({...check,message:prefix(index) + check.message}))),
    remainingChecks:[...new Set(relevant.flatMap(({match}) => match.remainingChecks))],
  };
}

// Compares self-reported fields only. A candidate is not approval, authentication,
// current availability, or a promise of a discount. No network or storage writes.
export function evaluateBenefitMatch(benefit, profile = {}, { today = seoulToday() } = {}) {
  const item = record(benefit) ? benefit : {};
  const input = record(profile) ? profile : {};
  const period = benefitStatus(item, today);
  const checks = [];
  const missingFields = [];
  const remainingChecks = ['공식 안내의 신청·인증·잔여 예산·좌석 등 실제 이용 조건을 확인해 주세요.'];
  const add = (field, result, message, missing = false) => {
    checks.push({field,result,message});
    if (missing && !missingFields.includes(field)) missingFields.push(field);
  };
  const supportedRuleKeys = ['verified','age','residence','student','extraChecks','anyOf'];
  const rules = record(item.matchRules) && item.matchRules.verified === true && Object.keys(item.matchRules).every((key) => supportedRuleKeys.includes(key)) ? item.matchRules : null;
  let personalRuleCount = 0;

  if (!rules || item.synthetic !== false || item.sourceType !== 'official_reference' || item.verificationLevel !== 'body_read') {
    add('criteria','unknown','공식 본문에서 개인 조건을 충분히 확인하지 못해 맞는 후보로 확정하지 않았어요.');
  } else {
    if (Object.hasOwn(rules,'anyOf')) return matchAlternatives(item,input,rules,today,period);
    if (Array.isArray(rules.extraChecks)) remainingChecks.push(...rules.extraChecks.filter((value) => typeof value === 'string' && value.trim()));
    if (Object.hasOwn(rules,'age')) {
      personalRuleCount += 1;
      const rule = rules.age;
      const hasYearList = record(rule) && Object.hasOwn(rule,'birthYears');
      const hasYearMax = record(rule) && Object.hasOwn(rule,'birthYearMax');
      const hasYears = hasYearList || hasYearMax;
      const hasRange = record(rule) && (Object.hasOwn(rule,'min') || Object.hasOwn(rule,'max'));
      const rangeValid = record(rule) && (rule.min === undefined || integer(rule.min,0,120)) && (rule.max === undefined || integer(rule.max,0,120)) && (rule.min ?? 0) <= (rule.max ?? 120);
      const yearsValid = (hasYearList && !hasYearMax && Array.isArray(rule.birthYears) && rule.birthYears.length > 0 && rule.birthYears.every((year) => integer(year,1800,9999))) || (hasYearMax && !hasYearList && integer(rule.birthYearMax,1800,9999));
      const supportedKeys = record(rule) && Object.keys(rule).every((key) => ['min','max','birthYears','birthYearMax'].includes(key));
      if (!supportedKeys || !rangeValid || (hasYears && !yearsValid) || (!hasRange && !hasYears) || (hasRange && hasYears)) {
        add('age','unknown','공식 연령 조건을 현재 입력 방식으로 비교하기 어려워 추가 확인이 필요해요.');
      } else if (!integer(input.age,1,120)) {
        add('age','unknown','만 나이를 입력하거나 올바른 값으로 수정해 주세요.',true);
      } else if (hasYears) {
        // At a given calendar date, a reported age permits two birth years.
        // Non-overlap can rule the age out; overlap cannot establish birth year.
        const year = validDay(today) ? Number(today.slice(0,4)) : null;
        const possibleYears = year === null ? [] : [year - input.age - 1, year - input.age];
        const birthDescription = hasYearMax ? `${rule.birthYearMax}년 또는 그 이전 출생` : `${rule.birthYears.join('·')}년생`;
        const possibleMatch = (value) => hasYearMax ? value <= rule.birthYearMax : rule.birthYears.includes(value);
        if (possibleYears.length && possibleYears.every((value) => !possibleMatch(value))) {
          add('age','unmet',`입력 만 나이로 가능한 출생연도가 공고의 ${birthDescription} 조건과 겹치지 않아요.`);
        } else {
          add('age','unknown',`공고는 ${birthDescription} 기준이에요. 만 나이만으로 확정하지 않으며 출생연도 확인이 필요해요.`);
          missingFields.push('birthYear');
        }
      } else {
        const description = rule.min !== undefined && rule.max !== undefined ? `만 ${rule.min}~${rule.max}세` : rule.min !== undefined ? `만 ${rule.min}세 이상` : `만 ${rule.max}세 이하`;
        const met = input.age >= (rule.min ?? 0) && input.age <= (rule.max ?? 120);
        add('age',met ? 'met' : 'unmet',met ? `입력 만 나이가 확인한 ${description} 조건에 들어요.` : `입력 만 나이가 확인한 ${description} 조건과 달라요.`);
      }
    } else add('age','not_used','이 혜택은 확인된 나이 비교 규칙을 적용하지 않았어요.');

    if (Object.hasOwn(rules,'residence')) {
      personalRuleCount += 1;
      const rule = rules.residence;
      const hasRegions = record(rule) && Object.hasOwn(rule,'allowedRegions');
      const regionRuleValid = hasRegions && Array.isArray(rule.allowedRegions) && rule.allowedRegions.length > 0 && rule.allowedRegions.every((region) => RESIDENCE_REGIONS.includes(region));
      const supportedKeys = record(rule) && Object.keys(rule).every((key) => ['allowedRegions','requiresLocalCheck'].includes(key));
      if (!supportedKeys || (hasRegions && !regionRuleValid) || (rule.requiresLocalCheck !== undefined && typeof rule.requiresLocalCheck !== 'boolean') || (!hasRegions && rule.requiresLocalCheck !== true)) {
        add('residenceRegion','unknown','공식 거주 조건을 현재 시·도 입력만으로 비교하기 어려워 추가 확인이 필요해요.');
      } else if (!RESIDENCE_REGIONS.includes(input.residenceRegion)) {
        add('residenceRegion','unknown','혜택 조건을 비교할 거주 시·도를 입력해 주세요. 여행지는 거주지로 대신하지 않아요.',true);
      } else if (hasRegions && !rule.allowedRegions.includes(input.residenceRegion)) {
        add('residenceRegion','unmet',`입력 거주 시·도 ${input.residenceRegion}는 확인한 거주 조건(${rule.allowedRegions.join('·')})과 달라요.`);
      } else if (rule.requiresLocalCheck) {
        add('residenceRegion','unknown',`입력 거주 시·도 ${input.residenceRegion}만으로 세부 거주 조건을 확정할 수 없어요. 참여 시·군·구 등 추가 확인이 필요해요.`);
        missingFields.push('residenceLocality');
      } else {
        add('residenceRegion','met',`입력 거주 시·도 ${input.residenceRegion}가 확인한 거주 조건에 들어요.`);
      }
    } else add('residenceRegion','not_used','여행 지역을 거주 조건으로 해석하지 않았어요. 확인된 거주 비교 규칙은 없어요.');

    if (Object.hasOwn(rules,'student')) {
      const rule = rules.student;
      if (!record(rule) || typeof rule.required !== 'boolean' || Object.keys(rule).some((key) => !['required','requiresUndergraduateCheck'].includes(key)) || (rule.requiresUndergraduateCheck !== undefined && typeof rule.requiresUndergraduateCheck !== 'boolean') || (!rule.required && rule.requiresUndergraduateCheck === true)) {
        personalRuleCount += 1;
        add('studentStatus','unknown','대학생 대상 조건의 범위를 공식 안내에서 추가 확인해야 해요.');
      } else if (!rule.required) {
        add('studentStatus','not_used','이 혜택의 확인된 조건에는 대학생 여부가 필수가 아니에요.');
      } else {
        personalRuleCount += 1;
        if (!STUDENT_STATUSES.includes(input.studentStatus) || input.studentStatus === 'unspecified') add('studentStatus','unknown','대학생 여부를 선택해 주세요. 미입력을 비대학생으로 판단하지 않아요.',true);
        else if (input.studentStatus === 'not_student') add('studentStatus','unmet','대학생 대상 혜택인데 현재 설정은 대학생 아님이에요.');
        else if (rule.requiresUndergraduateCheck) {
          add('studentStatus','unknown','대학생으로 입력했지만 이 조건은 학부 대학생 대상이에요. 대학원생 포함 여부를 추정하지 않으며 학부 재학 여부를 공식 안내에서 확인해야 해요.');
          missingFields.push('undergraduateStatus');
          remainingChecks.push('기관이 인정하는 학부 대학생 범위와 학생 증빙을 확인해 주세요.');
        }
        else {
          add('studentStatus','met','대학생으로 입력했어요. 자기 보고이며 재학 인증은 아니에요.');
          remainingChecks.push('휴학·대학원 포함 여부와 기관이 요구하는 학생 증빙을 확인해 주세요.');
        }
      }
    } else add('studentStatus','not_used','확인된 대학생 전용 조건이 없어 학생 여부로 우선순위를 올리지 않았어요.');
    if (!personalRuleCount) add('criteria','unknown','현재 개인 설정으로 비교할 수 있는 확인된 조건이 없어요.');
  }

  if (period.code === 'needs_check') add('period','unknown','현재 공고 기간·운영 조건을 추가 확인해야 해요.');
  let status;
  if (['upcoming','ended'].includes(period.code)) status = 'not_current';
  else if (period.code === 'needs_check') status = 'needs_info';
  else if (checks.some((check) => check.result === 'unmet')) status = 'not_matched';
  else if (checks.some((check) => check.result === 'unknown')) status = 'needs_info';
  else status = 'candidate';
  const reasons = checks.filter((check) => ['met','unmet','unknown'].includes(check.result)).map((check) => check.message);
  if (status === 'not_current') reasons.unshift(period.label);
  if (status === 'candidate') reasons.push('입력 조건 비교 결과인 후보이며 실제 신청 자격이나 수혜 확정이 아닙니다.');
  return {status,label:LABELS[status],reasons,missingFields:[...new Set(missingFields)],checks,remainingChecks:[...new Set(remainingChecks)]};
}

export function rankBenefits(items, profile, { today = seoulToday() } = {}) {
  const priority = {candidate:0,needs_info:1,not_matched:2,not_current:3};
  return items.map((benefit,index) => ({benefit,match:evaluateBenefitMatch(benefit,profile,{today}),index}))
    .sort((a,b) => priority[a.match.status] - priority[b.match.status] || a.index - b.index)
    .map(({benefit,match}) => ({benefit,match}));
}
