import { EXPERIENCES, INTERESTS, REGIONS } from './data.mjs';
import { buildJourneySnapshot } from './journey.mjs';

export const CONTRACT_VERSION = 'local-demo-v1';
export class DomainError extends Error {
  constructor(code, message, fields = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.fields = fields;
  }
}
const copy = (value) => JSON.parse(JSON.stringify(value));
const interestLabels = new Map(INTERESTS.map(({ id, label }) => [id, label]));
const allowed = (candidate) => candidate?.synthetic === true && candidate?.accessScope === 'demo-public';
const mobilityMatches = (candidate, mobility) => mobility === 'any' || (mobility === 'walk_transit' ? candidate.mobility.some((mode) => ['walk', 'transit'].includes(mode)) : candidate.mobility.includes(mobility));

export function normalizeContext(raw = {}) {
  const fields = {};
  const availableMinutes = Number(raw.availableMinutes);
  if (!Number.isInteger(availableMinutes) || availableMinutes < 1 || availableMinutes > 1440) {
    fields.availableMinutes = '가능 시간을 1~1,440분 사이의 정수로 입력해 주세요.';
  }
  const interests = Array.isArray(raw.interests) ? [...new Set(raw.interests)] : [];
  if (!interests.length || interests.some((id) => !interestLabels.has(id))) fields.interests = '원하는 경험을 하나 이상 선택해 주세요.';
  const regionText = typeof raw.regionText === 'string' ? raw.regionText.trim() : '';
  if (regionText && !REGIONS.includes(regionText)) fields.regionText = '시연 지역을 선택하거나 목적지를 미정으로 두세요.';
  const companion = raw.companion ?? 'any';
  const mobility = raw.mobility ?? 'any';
  if (!['any', 'solo', 'together'].includes(companion)) fields.companion = '동행 조건을 다시 선택해 주세요.';
  if (!['any', 'walk', 'transit', 'walk_transit'].includes(mobility)) fields.mobility = '이동 방식을 다시 선택해 주세요.';
  if (raw.avoidStairs !== undefined && typeof raw.avoidStairs !== 'boolean') fields.avoidStairs = '계단 제외 조건을 다시 선택해 주세요.';
  if (Object.keys(fields).length) throw new DomainError('INVALID_CONTEXT', '여행 상황을 확인해 주세요.', fields);
  return { availableMinutes, interests, regionText, destinationStatus: regionText ? 'selected' : 'undecided', companion, mobility, avoidStairs: raw.avoidStairs ?? false };
}

function checkCandidate(candidate) {
  if (!candidate || typeof candidate.id !== 'string' || !Array.isArray(candidate.tags)
    || !Array.isArray(candidate.companions) || !Array.isArray(candidate.mobility)
    || !Number.isFinite(candidate.durationMinutes) || candidate.durationMinutes <= 0
    || !Array.isArray(candidate.evidence) || candidate.evidence.length < 1
    || candidate.evidence.some((evidence) => typeof evidence.id !== 'string' || !evidence.claim || !evidence.sourceLabel)) {
    throw new DomainError('INVALID_REFERENCE', '경험 자료의 근거가 올바르지 않습니다. 다시 시도해 주세요.');
  }
  const evidenceIds = candidate.evidence.map((evidence) => evidence.id);
  if (new Set(evidenceIds).size !== evidenceIds.length) throw new DomainError('INVALID_REFERENCE', '중복된 근거 식별자가 있습니다.');
}

export function recommend(rawContext, { requestId = globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now()}`, candidates = EXPERIENCES } = {}) {
  const context = normalizeContext(rawContext);
  if (!Array.isArray(candidates)) throw new DomainError('ENGINE_UNAVAILABLE', '추천 자료를 읽을 수 없습니다. 입력은 유지됩니다.');
  const eligible = candidates.filter(allowed);
  const ids = new Set();
  for (const candidate of eligible) {
    checkCandidate(candidate);
    if (ids.has(candidate.id)) throw new DomainError('INVALID_REFERENCE', '중복된 경험 식별자가 있습니다.');
    ids.add(candidate.id);
  }
  const matches = eligible.filter((candidate) => candidate.tags.some((tag) => context.interests.includes(tag))
    && candidate.durationMinutes <= context.availableMinutes
    && (!context.regionText || candidate.region === context.regionText)
    && (context.companion === 'any' || candidate.companions.includes(context.companion))
    && mobilityMatches(candidate, context.mobility)
    && (!context.avoidStairs || candidate.stairs === false))
    .map((candidate) => ({ candidate, score: candidate.tags.filter((tag) => context.interests.includes(tag)).length }))
    .sort((a, b) => b.score - a.score || a.candidate.durationMinutes - b.candidate.durationMinutes || a.candidate.id.localeCompare(b.candidate.id))
    .slice(0, 4);
  const recommendations = matches.map(({ candidate }) => {
    const relevant = candidate.tags.filter((tag) => context.interests.includes(tag));
    const reasons = [
      { summary: `선택한 ${relevant.map((tag) => interestLabels.get(tag)).join(' · ')} 관심과 연결되는 가상 경험이에요.`, contextFields: ['interests'], evidenceRefs: [`${candidate.id}-activity`] },
      { summary: `시연용 활동 시간 ${candidate.durationMinutes}분은 입력한 ${context.availableMinutes}분 이내예요. 이동 시간은 포함하지 않았어요.`, contextFields: ['availableMinutes'], evidenceRefs: [`${candidate.id}-duration`] },
    ];
    if (context.companion !== 'any') reasons.push({ summary: `${context.companion === 'solo' ? '혼자' : '함께'} 하는 조건이 가상 카드의 방문 조건에 포함돼요.`, contextFields: ['companion'], evidenceRefs: [`${candidate.id}-context`] });
    if (context.avoidStairs) reasons.push({ summary: '계단이 없는 가상 설정만 골랐어요. 실제 접근성은 별도 확인이 필요해요.', contextFields: ['avoidStairs'], evidenceRefs: [`${candidate.id}-access`] });
    return {
      experienceId: candidate.id, synthetic: true, reasons,
      constraintChecks: [
        { constraintKey: 'activityMinutes', result: 'met', evidenceRefs: [`${candidate.id}-duration`] },
        { constraintKey: 'travelFeasibility', result: 'unknown', evidenceRefs: [], note: '실제 이동 시간과 현재 운영정보는 확인되지 않았습니다.' },
      ],
      uncertainties: ['가상 장소·경험이며 실제 방문 자료가 아닙니다.', '현재 영업·가격·대기·이동 시간·방문 안전은 확인되지 않았습니다.'],
    };
  });
  const run = { requestId: String(requestId), contractVersion: CONTRACT_VERSION, generatedAt: new Date().toISOString(), contextSnapshot: context, engineKind: 'rules', status: recommendations.length ? 'partial' : 'no_match', recommendations, warnings: recommendations.length ? ['가상 자료를 규칙으로 연결한 시연입니다. 실제 AI 모델을 호출하지 않았습니다.'] : ['이 조건에 맞는 가상 경험이 없어요. 시간·관심·지역 조건을 직접 바꿔 다시 찾아보세요.'] };
  validateRecommendation(run, candidates);
  return run;
}

export function validateRecommendation(run, candidates = EXPERIENCES) {
  if (!run || run.contractVersion !== CONTRACT_VERSION || run.engineKind !== 'rules' || typeof run.requestId !== 'string' || !run.requestId
    || !['ok', 'partial', 'no_match', 'unavailable'].includes(run.status) || !Array.isArray(run.recommendations)) {
    throw new DomainError('INVALID_REFERENCE', '추천 응답 형식이 올바르지 않습니다.');
  }
  const context = normalizeContext(run.contextSnapshot);
  const sources = new Map(candidates.filter(allowed).map((candidate) => [candidate.id, candidate]));
  const seen = new Set();
  for (const item of run.recommendations) {
    const source = sources.get(item.experienceId);
    if (!source || seen.has(item.experienceId) || item.synthetic !== true) throw new DomainError('INVALID_REFERENCE', '허용되지 않은 경험 참조를 차단했습니다.');
    checkCandidate(source);
    if (source.durationMinutes > context.availableMinutes
      || !source.tags.some((tag) => context.interests.includes(tag))
      || (context.regionText && source.region !== context.regionText)
      || (context.companion !== 'any' && !source.companions.includes(context.companion))
      || !mobilityMatches(source, context.mobility)
      || (context.avoidStairs && source.stairs !== false)) {
      throw new DomainError('INVALID_REFERENCE', '입력 조건을 만족하지 않는 추천 응답을 차단했습니다.');
    }
    seen.add(item.experienceId);
    const evidenceIds = new Set(source.evidence.map((evidence) => evidence.id));
    if (!Array.isArray(item.reasons) || !item.reasons.length || !Array.isArray(item.constraintChecks)) throw new DomainError('INVALID_REFERENCE', '추천 근거가 비어 있습니다.');
    for (const reason of item.reasons) {
      if (!reason.summary || !Array.isArray(reason.contextFields) || !reason.contextFields.length
        || reason.contextFields.some((field) => !Object.hasOwn(run.contextSnapshot, field))
        || !Array.isArray(reason.evidenceRefs) || !reason.evidenceRefs.length
        || reason.evidenceRefs.some((id) => !evidenceIds.has(id))) throw new DomainError('INVALID_REFERENCE', '존재하지 않는 추천 근거를 차단했습니다.');
    }
    for (const check of item.constraintChecks) {
      if (!['met', 'unmet', 'unknown'].includes(check.result) || !Array.isArray(check.evidenceRefs) || check.evidenceRefs.some((id) => !evidenceIds.has(id))) throw new DomainError('INVALID_REFERENCE', '제약 검사 근거가 올바르지 않습니다.');
    }
  }
  if (run.status === 'no_match' && run.recommendations.length) throw new DomainError('INVALID_REFERENCE', '빈 결과 상태와 추천 항목이 일치하지 않습니다.');
  return true;
}

export function buildCourseDraft({ title, experienceIds, context, requestId, journey }) {
  const contextSnapshot = normalizeContext(context);
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  if (!cleanTitle || cleanTitle.length > 80) throw new DomainError('INVALID_COURSE', '코스 이름을 1~80자로 입력해 주세요.', { title: '코스 이름을 1~80자로 입력해 주세요.' });
  if (!Array.isArray(experienceIds) || !experienceIds.length || new Set(experienceIds).size !== experienceIds.length) throw new DomainError('INVALID_COURSE', '경험을 하나 이상 선택하고 중복 없이 구성해 주세요.');
  const selected = experienceIds.map((id) => EXPERIENCES.find((experience) => experience.id === id && allowed(experience)));
  if (selected.some((experience) => !experience)) throw new DomainError('INVALID_REFERENCE', '알 수 없는 경험은 코스에 저장할 수 없습니다.');
  const activityMinutes = selected.reduce((total, experience) => total + experience.durationMinutes, 0);
  const overBudget = activityMinutes > contextSnapshot.availableMinutes;
  const warnings = ['활동 시간은 가상 설정값이며 실제 이동 시간은 포함되지 않았어요.', '현재 운영정보·가격·방문 안전을 확인하지 않은 시연용 초안이에요.'];
  if (overBudget) warnings.unshift(`활동만 ${activityMinutes}분으로, 가능한 ${contextSnapshot.availableMinutes}분을 초과해요.`);
  if (new Set(selected.map((item) => item.region)).size > 1) warnings.push('서로 다른 가상 지역을 포함해요. 지역 간 이동 가능 여부는 확인되지 않았어요.');
  const draft = {
    contractVersion: CONTRACT_VERSION, title: cleanTitle, ownerRef: 'local-browser', visibility: 'private', synthetic: true,
    sourceRequestId: String(requestId || 'manual-local'), contextSnapshot,
    orderedItems: selected.map((experience, order) => ({
      experienceId: experience.id, order,
      displaySnapshot: copy({ title: experience.title, summary: experience.summary, region: experience.region, visitContext: experience.visitContext, positives: experience.positives, drawbacks: experience.drawbacks, art: experience.art }),
      evidenceRefs: experience.evidence.map((evidence) => evidence.id), evidence: copy(experience.evidence), synthetic: true,
      reasons: recommend(contextSnapshot, { requestId: String(requestId || 'manual-local'), candidates: [experience] }).recommendations[0]?.reasons ?? [],
      durationEstimate: experience.durationMinutes, transitionEstimate: null,
    })),
    estimate: { activityMinutes, transitionMinutes: null, totalMinutes: null, overBudget, warnings },
    feasibility: overBudget ? 'over_budget' : 'unknown',
  };
  if (journey !== undefined && journey !== null) {
    const snapshot = buildJourneySnapshot({ ...journey, experienceIds });
    if (snapshot.regionName !== contextSnapshot.regionText
      || snapshot.tripSnapshot.availableMinutes !== contextSnapshot.availableMinutes
      || JSON.stringify(snapshot.profileSnapshot.interests) !== JSON.stringify(contextSnapshot.interests)
      || contextSnapshot.companion !== (snapshot.tripSnapshot.partySize === 1 ? 'solo' : 'together')
      || contextSnapshot.mobility !== 'walk_transit'
      || snapshot.tripSnapshot.avoidStairs !== contextSnapshot.avoidStairs) {
      throw new DomainError('INVALID_COURSE', '여행 조건과 추천 조건이 달라졌어요. 같은 조건으로 다시 추천받아 주세요.');
    }
    draft.journeySnapshot = snapshot;
  }
  return draft;
}

export function validateCourseDraft(draft) {
  if (!draft || !Array.isArray(draft.orderedItems)) throw new DomainError('INVALID_COURSE', '저장할 코스 형식이 올바르지 않습니다.');
  if (Object.hasOwn(draft, 'journeySnapshot') && (!draft.journeySnapshot || typeof draft.journeySnapshot !== 'object')) throw new DomainError('INVALID_COURSE', '여행 조건 저장본이 올바르지 않습니다.');
  const journey = draft.journeySnapshot ? { profile: draft.journeySnapshot.profileSnapshot, trip: draft.journeySnapshot.tripSnapshot, regionId: draft.journeySnapshot.regionId } : undefined;
  const rebuilt = buildCourseDraft({ title: draft.title, experienceIds: draft.orderedItems.map((item) => item.experienceId), context: draft.contextSnapshot, requestId: draft.sourceRequestId, journey });
  // The optional student field was absent from earlier journey snapshots. Keep
  // those snapshots canonical and unchanged rather than migrating on a read.
  if (journey?.profile && !Object.hasOwn(journey.profile, 'studentStatus')) delete rebuilt.journeySnapshot.profileSnapshot.studentStatus;
  for (const [key, value] of Object.entries(rebuilt)) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(value)) throw new DomainError('INVALID_COURSE', '코스의 가상 표시·근거·시간 정보가 변경되었습니다. 초안을 다시 구성해 주세요.');
  }
  return rebuilt;
}
