import * as legacy from './domain.mjs';
import { REAL_PLACES, REAL_REGIONS } from './real-catalog.mjs';
import { buildJourneySnapshot, closedOn, journeyTotals, normalizeOverrides, normalizeTrip } from './travel-journey.mjs';
import { normalizeProfile } from './profile.mjs';
import { safeUrl, validLocation, mapRoute } from './travel-links.mjs';

export const CONTRACT_VERSION = 'real-travel-v1';
export const DomainError = legacy.DomainError;
const copy = (value) => JSON.parse(JSON.stringify(value));
const fail = () => { throw new DomainError('INVALID_COURSE', '코스 자료의 장소·동선·시간 정보를 확인해 주세요.'); };
const text = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 5000;
const idValid = (value) => typeof value === 'string' && /^[a-z0-9-]{1,100}$/.test(value);
const integer = (value, max = 1440) => Number.isInteger(value) && value >= 0 && value <= max;
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const legacyContext = (raw) => typeof raw?.regionText === 'string' && raw.regionText.startsWith('가상 ');
function validGeoSource(source) {
  if (source === undefined) return true;
  if (!source || !safeUrl(source.url) || !text(source.label) || typeof source.checkedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt)) return false;
  const date = new Date(`${source.checkedAt}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === source.checkedAt;
}
export function normalizeContext(raw = {}) {
  if (legacyContext(raw)) return legacy.normalizeContext(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new DomainError('INVALID_CONTEXT', '여행 조건을 확인해 주세요.');
  if (raw.date !== undefined) normalizeTrip({ departureId: 'cheongnyangni', date: raw.date, availableMinutes: 1, budget: 0, partySize: 1, walkingLimitMinutes: 0 });
  const region = REAL_REGIONS.find((item) => item.name === raw.regionText || item.id === raw.regionId);
  if ((raw.regionText || raw.regionId) && (!region || (raw.regionText && raw.regionText !== region.name))) throw new DomainError('INVALID_CONTEXT', '여행 지역을 다시 선택해 주세요.', { regionText: '춘천·가평·강릉에서 선택해 주세요.' });
  const normalized = legacy.normalizeContext({ ...raw, regionText: '' });
  return { ...normalized, regionText: region?.name ?? '', destinationStatus: region ? 'selected' : 'undecided', ...(region ? { regionId: region.id } : {}), ...(raw.date ? { date: raw.date } : {}) };
}
function checkPlace(place) {
  if (!place || !idValid(place.id) || place.synthetic !== false || place.accessScope !== 'official-public' || !idValid(place.regionId)
    || ![place.title, place.summary, place.region, place.address].every(text) || !(place.location === null || validLocation(place.location))
    || !safeUrl(place.source?.url) || !text(place.source?.label) || !/^\d{4}-\d{2}-\d{2}$/.test(place.source?.checkedAt)
    || !validGeoSource(place.geoSource)
    || !integer(place.durationMinutes) || place.durationMinutes < 1 || place.durationKind !== 'planning'
    || !place.admission || !(place.admission.amount === null || integer(place.admission.amount, 10000000)) || !text(place.admission.label)
    || !text(place.opening?.label) || !Array.isArray(place.opening.closedWeekdays) || place.opening.closedWeekdays.some((day) => !integer(day, 6))
    || (place.opening.sourceUrl !== undefined && !safeUrl(place.opening.sourceUrl))
    || !text(place.visitContext) || !text(place.art) || !Array.isArray(place.positives) || !place.positives.every(text) || !Array.isArray(place.drawbacks) || !place.drawbacks.every(text)
    || ![true, false, null].includes(place.stairs) || !Array.isArray(place.tags) || !place.tags.length || !place.tags.every(text)
    || !Array.isArray(place.companions) || !Array.isArray(place.mobility) || !Array.isArray(place.evidence) || !place.evidence.length
    || place.evidence.some((item) => !idValid(item.id) || !text(item.claim) || !text(item.sourceLabel) || (item.url !== undefined && !safeUrl(item.url)))
    || new Set(place.evidence.map((item) => item.id)).size !== place.evidence.length) fail();
}
function matches(place, context) {
  return place.tags.some((tag) => context.interests.includes(tag)) && place.durationMinutes <= context.availableMinutes
    && (!context.regionText || place.region === context.regionText) && (!context.avoidStairs || place.stairs === false)
    && (context.companion === 'any' || place.companions.includes(context.companion)) && !closedOn(place, context.date);
}
export function recommend(rawContext, options = {}) {
  if (legacyContext(rawContext) || options.contractVersion === legacy.CONTRACT_VERSION) return legacy.recommend(rawContext, options);
  const context = normalizeContext({ ...rawContext, ...(options.date ? { date: options.date } : {}) });
  const candidates = options.candidates ?? REAL_PLACES;
  if (!Array.isArray(candidates)) throw new DomainError('ENGINE_UNAVAILABLE', '장소 자료를 읽을 수 없어요.');
  const eligible = candidates.filter((place) => place.synthetic === false && place.accessScope === 'official-public');
  eligible.forEach(checkPlace);
  if (new Set(eligible.map((place) => place.id)).size !== eligible.length) fail();
  const recommendations = eligible.filter((place) => matches(place, context)).sort((a, b) => b.tags.filter((tag) => context.interests.includes(tag)).length - a.tags.filter((tag) => context.interests.includes(tag)).length || a.durationMinutes - b.durationMinutes || a.id.localeCompare(b.id)).slice(0, 4).map((place) => ({
    experienceId: place.id, synthetic: false, reasons: [{ summary: `관심에 맞는 장소예요. ${place.durationMinutes}분 머무는 계획이며 이동 시간은 별도예요.`, contextFields: ['interests', 'availableMinutes'], evidenceRefs: [place.evidence[0].id] }],
    constraintChecks: [{ constraintKey: 'activityMinutes', result: 'met', evidenceRefs: [place.evidence[0].id] }, { constraintKey: 'travelFeasibility', result: 'unknown', evidenceRefs: [], note: '교통편과 당일 운영 확인 필요' }],
    uncertainties: ['당일 운영과 이동 시간·운임은 출발 전에 확인해 주세요.'],
  }));
  return { requestId: String(options.requestId ?? globalThis.crypto.randomUUID()), contractVersion: CONTRACT_VERSION, generatedAt: new Date().toISOString(), contextSnapshot: context, engineKind: 'rules', status: recommendations.length ? 'partial' : 'no_match', recommendations, warnings: recommendations.length ? ['왕복 이동 시간을 확인한 뒤 일정을 확정해 주세요.'] : ['선택일과 관심·체류 시간·계단 조건에 맞는 장소가 없어요.'] };
}
export function validateRecommendation(run, candidates = REAL_PLACES) {
  if (run?.contractVersion === legacy.CONTRACT_VERSION) return legacy.validateRecommendation(run);
  if (!run || run.contractVersion !== CONTRACT_VERSION || run.engineKind !== 'rules' || !text(run.requestId) || !Array.isArray(run.recommendations) || !['partial', 'no_match'].includes(run.status)) fail();
  const context = normalizeContext(run.contextSnapshot);
  const seen = new Set();
  for (const item of run.recommendations) {
    const place = candidates.find((candidate) => candidate.id === item.experienceId);
    checkPlace(place);
    if (!matches(place, context) || item.synthetic !== false || seen.has(item.experienceId) || !Array.isArray(item.reasons) || !item.reasons.length || !Array.isArray(item.constraintChecks)) fail();
    seen.add(item.experienceId);
    for (const reason of item.reasons) if (!text(reason.summary) || !Array.isArray(reason.contextFields) || !reason.contextFields.length || reason.contextFields.some((key) => !Object.hasOwn(context, key)) || !Array.isArray(reason.evidenceRefs) || !reason.evidenceRefs.length || reason.evidenceRefs.some((id) => !place.evidence.some((e) => e.id === id))) fail();
    for (const check of item.constraintChecks) if (!['met', 'unmet', 'unknown'].includes(check.result) || !Array.isArray(check.evidenceRefs) || check.evidenceRefs.some((id) => !place.evidence.some((e) => e.id === id))) fail();
  }
  if ((run.status === 'no_match') !== (run.recommendations.length === 0)) fail();
  return true;
}
export function buildCourseDraft(input) {
  if (legacyContext(input.context) || input.experienceIds?.every((id) => id.startsWith('demo-'))) return legacy.buildCourseDraft(input);
  const context = normalizeContext(input.context);
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 80) throw new DomainError('INVALID_COURSE', '코스 이름을 1~80자로 입력해 주세요.', { title: '코스 이름을 입력해 주세요.' });
  if (!input.journey) fail();
  const snapshot = buildJourneySnapshot({ ...input.journey, experienceIds: input.experienceIds });
  const draft = { contractVersion: CONTRACT_VERSION, title, ownerRef: 'local-browser', visibility: 'private', synthetic: false, sourceRequestId: String(input.requestId || 'manual-local'), contextSnapshot: context,
    orderedItems: snapshot.placeSnapshots.map((place, order) => ({ experienceId: place.id, order, displaySnapshot: copy(place), evidenceRefs: place.evidence.map((e) => e.id), evidence: copy(place.evidence), synthetic: false,
      reasons: recommend({ ...context, date: snapshot.tripSnapshot.date }, { candidates: [place] }).recommendations[0]?.reasons ?? [], durationEstimate: place.durationMinutes, transitionEstimate: null })),
    estimate: { activityMinutes: snapshot.estimate.activityMinutes, transitionMinutes: snapshot.estimate.travelMinutes, totalMinutes: snapshot.estimate.totalMinutes, overBudget: snapshot.checks.time === 'unmet', warnings: [...snapshot.warnings] },
    feasibility: snapshot.checks.time === 'unmet' ? 'over_budget' : 'unknown', journeySnapshot: snapshot };
  return validateCourseDraft(draft);
}
function validateJourney(snapshot, items) {
  if (!snapshot || snapshot.contractVersion !== 'real-journey-v1' || snapshot.synthetic !== false || !Array.isArray(snapshot.placeSnapshots) || !Array.isArray(snapshot.legs)) fail();
  const trip = normalizeTrip(snapshot.tripSnapshot);
  const profile = normalizeProfile(snapshot.profileSnapshot);
  if (!equal(trip, snapshot.tripSnapshot) || !equal(profile, snapshot.profileSnapshot)) fail();
  const region = snapshot.regionSnapshot;
  const departure = snapshot.departureSnapshot;
  if (!region || region.id !== snapshot.regionId || region.name !== snapshot.regionName || region.station !== snapshot.station || !idValid(region.id) || !text(region.name) || !text(region.station) || !safeUrl(region.source?.url)
    || !validGeoSource(region.geoSource) || !(region.stationLocation === null || validLocation(region.stationLocation)) || !departure || departure.id !== trip.departureId || !text(departure.label) || !validGeoSource(departure.geoSource) || !(departure.location === null || validLocation(departure.location))) fail();
  if (!equal(snapshot.placeSnapshots, items.map((item) => item.displaySnapshot)) || !equal(snapshot.experienceIds, items.map((item) => item.experienceId))) fail();
  const points = [departure, { id: `${region.id}-station`, title: region.station, location: region.stationLocation }, ...snapshot.placeSnapshots, { id: `${region.id}-station`, title: region.station, location: region.stationLocation }, departure];
  if (snapshot.legs.length !== points.length - 1) fail();
  const overrides = normalizeOverrides(snapshot.travelOverrides);
  for (const [index, leg] of snapshot.legs.entries()) {
    const from = points[index]; const to = points[index + 1];
    const route = mapRoute(from, to);
    const walkUrl = index > 0 && index < points.length - 2 ? mapRoute(from, to, 'walk').url : null;
    if (leg.id !== `leg:${from.id}>${to.id}` || leg.fromId !== from.id || leg.toId !== to.id || leg.from !== (from.title ?? from.label) || leg.to !== (to.title ?? to.label)
      || leg.toExperienceId !== (snapshot.experienceIds.includes(to.id) ? to.id : null) || leg.synthetic !== false || leg.mode !== 'transit' || leg.fare !== null
      || leg.routeUrl !== route.url || leg.linkKind !== route.kind || leg.walkUrl !== walkUrl || leg.minutes !== (overrides[leg.id]?.minutes ?? null)
      || leg.source !== (leg.minutes === null ? 'unconfirmed' : 'user') || leg.sourceLabel !== (leg.minutes === null ? '지도에서 이동 시간 확인 필요' : '직접 입력')) fail();
  }
  if (Object.keys(overrides).some((id) => !snapshot.legs.some((leg) => leg.id === id))) fail();
  const totals = journeyTotals(snapshot.placeSnapshots, snapshot.legs, trip);
  if (!equal(totals.estimate, snapshot.estimate) || !equal(totals.checks, snapshot.checks) || !equal(snapshot.benefits, []) || !Array.isArray(snapshot.warnings) || !snapshot.warnings.length || !snapshot.warnings.every(text)) fail();
  return { trip, profile };
}
export function validateCourseDraft(draft) {
  if (draft?.contractVersion === legacy.CONTRACT_VERSION) return legacy.validateCourseDraft(draft);
  if (!draft || draft.contractVersion !== CONTRACT_VERSION || draft.synthetic !== false || draft.ownerRef !== 'local-browser' || draft.visibility !== 'private' || !text(draft.title) || draft.title.length > 80 || draft.title !== draft.title.trim() || !text(draft.sourceRequestId)
    || !Array.isArray(draft.orderedItems) || !draft.orderedItems.length || draft.orderedItems.length > 20) fail();
  const savedContext = draft.contextSnapshot;
  if (!savedContext || !text(savedContext.regionText) || !idValid(savedContext.regionId)) fail();
  const context = { ...legacy.normalizeContext({ ...savedContext, regionText: '' }), regionText: savedContext.regionText, destinationStatus: 'selected', regionId: savedContext.regionId, ...(savedContext.date ? { date: savedContext.date } : {}) };
  if (!equal(context, draft.contextSnapshot)) fail();
  const seen = new Set();
  for (const [order, item] of draft.orderedItems.entries()) {
    checkPlace(item.displaySnapshot);
    const place = item.displaySnapshot;
    if (item.order !== order || item.experienceId !== place.id || seen.has(place.id) || item.synthetic !== false || item.durationEstimate !== place.durationMinutes || item.transitionEstimate !== null
      || !equal(item.evidence, place.evidence) || !equal(item.evidenceRefs, place.evidence.map((e) => e.id)) || !Array.isArray(item.reasons)) fail();
    for (const reason of item.reasons) if (!text(reason.summary) || !Array.isArray(reason.evidenceRefs) || !reason.evidenceRefs.length || reason.evidenceRefs.some((id) => !item.evidenceRefs.includes(id))) fail();
    seen.add(place.id);
  }
  const { trip, profile } = validateJourney(draft.journeySnapshot, draft.orderedItems);
  const snapshot = draft.journeySnapshot;
  if (context.regionText !== snapshot.regionName || context.regionId !== snapshot.regionId || (context.date && context.date !== trip.date) || context.availableMinutes !== trip.availableMinutes || !equal(context.interests, profile.interests) || context.companion !== (trip.partySize === 1 ? 'solo' : 'together') || context.mobility !== 'walk_transit' || context.avoidStairs !== trip.avoidStairs
    || snapshot.placeSnapshots.some((place) => place.regionId !== snapshot.regionId || !matches(place, { ...context, date: trip.date }))) fail();
  const estimate = { activityMinutes: snapshot.estimate.activityMinutes, transitionMinutes: snapshot.estimate.travelMinutes, totalMinutes: snapshot.estimate.totalMinutes, overBudget: snapshot.checks.time === 'unmet', warnings: [...snapshot.warnings] };
  if (!equal(estimate, draft.estimate) || draft.feasibility !== (snapshot.checks.time === 'unmet' ? 'over_budget' : 'unknown')) fail();
  const result = copy(draft);
  for (const key of ['id', 'version', 'savedAt']) delete result[key];
  return result;
}
