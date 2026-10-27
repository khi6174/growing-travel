// Derived display information only. This module never changes eligibility,
// ranking, the official source snapshots, or the user's saved settings.
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : '';

const studentRule = (rule) => record(rule) && rule.required === true
  && Object.keys(rule).every((key) => ['required', 'requiresUndergraduateCheck'].includes(key))
  && (rule.requiresUndergraduateCheck === undefined || typeof rule.requiresUndergraduateCheck === 'boolean');

// "Student route" describes an official alternative, not the user's match.
// In particular, the museum's age route remains valid for non-students.
export function hasStudentRoute(benefit) {
  if (!record(benefit) || benefit.synthetic !== false
    || benefit.sourceType !== 'official_reference' || benefit.verificationLevel !== 'body_read') return false;
  const rules = benefit.matchRules;
  if (!record(rules) || rules.verified !== true) return false;
  if (Object.hasOwn(rules, 'anyOf')) {
    if (!Object.keys(rules).every((key) => ['verified', 'anyOf', 'extraChecks'].includes(key))
      || !Array.isArray(rules.anyOf) || rules.anyOf.length === 0
      || !rules.anyOf.every((branch) => record(branch) && Object.keys(branch).length > 0
        && Object.keys(branch).every((key) => ['age', 'residence', 'student', 'extraChecks'].includes(key)))) return false;
    return rules.anyOf.some((branch) => studentRule(branch.student));
  }
  return Object.keys(rules).every((key) => ['verified', 'age', 'residence', 'student', 'extraChecks'].includes(key))
    && studentRule(rules.student);
}

export function shortReason(match) {
  if (!record(match)) return '비교 이유를 확인할 수 없어요. 공식 안내를 확인해 주세요.';
  const reasons = Array.isArray(match.reasons) ? match.reasons.map(text).filter(Boolean) : [];
  // Period boundaries take priority over a personal match, as in the matcher.
  if (match.status === 'not_current' && reasons.length) return reasons[0];
  const preferred = {candidate:'met', needs_info:'unknown', not_matched:'unmet'}[match.status];
  const check = preferred && Array.isArray(match.checks)
    ? match.checks.find((item) => record(item) && item.result === preferred && text(item.message)) : null;
  return text(check?.message) || reasons[0] || '비교 이유를 확인할 수 없어요. 공식 안내를 확인해 주세요.';
}

export function getBenefitPresentation(benefit, match) {
  return {hasStudentRoute:hasStudentRoute(benefit), shortReason:shortReason(match)};
}
