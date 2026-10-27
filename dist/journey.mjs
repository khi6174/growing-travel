import { EXPERIENCES } from './data.mjs';
import { normalizeProfile } from './profile.mjs';
import { evaluateBenefits } from './benefits.mjs';

export const JOURNEY_CONTRACT_VERSION = 'local-journey-v1';
export const DEPARTURES = Object.freeze([{ id: 'central', label: '가상 중앙역' }, { id: 'east', label: '가상 동쪽역' }]);
export const REGION_OPTIONS = Object.freeze([
  { id: 'onyu', name: '가상 온유동', station: '가상 온유역', description: '정원과 서가, 작은 식탁이 모인 가상의 동네', synthetic: true },
  { id: 'baram', name: '가상 바람마을', station: '가상 바람역', description: '물길과 만들기 경험을 둘러보는 가상의 마을', synthetic: true },
]);
// All travel, walking, activity-price and regional-benefit values here are invented.
const transit = { central: { onyu: { minutes: 20, fare: 3000 }, baram: { minutes: 45, fare: 5500 } }, east: { onyu: { minutes: 40, fare: 5000 }, baram: { minutes: 20, fare: 2500 } } };
const activity = { 'demo-garden': { price: 0, walking: 30 }, 'demo-library': { price: 0, walking: 0 }, 'demo-table': { price: 12000, walking: 0 }, 'demo-gallery': { price: 5000, walking: 5 }, 'demo-workshop': { price: 18000, walking: 0 }, 'demo-river': { price: 0, walking: 50 } };
const walk = {
  'station|demo-garden': 8, 'station|demo-library': 6, 'station|demo-table': 10, 'station|demo-gallery': 12,
  'demo-garden|demo-library': 5, 'demo-garden|demo-table': 8, 'demo-garden|demo-gallery': 10,
  'demo-library|demo-table': 6, 'demo-library|demo-gallery': 8, 'demo-table|demo-gallery': 5,
  'station|demo-workshop': 8, 'station|demo-river': 15,
  // workshop → river intentionally has no fixture; unknown is not treated as zero.
};
const copy = (value) => JSON.parse(JSON.stringify(value));
const fail = (message, fields = {}) => Object.assign(new Error(message), { name: 'JourneyError', code: 'INVALID_JOURNEY', fields });
const integer = (value) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isInteger(Number(value));
const dateValid = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '2000-01-01' && value <= '2100-12-31' && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function normalizeTrip(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw fail('여행 조건을 확인해 주세요.');
  const fields = {};
  const departureId = raw.departureId;
  if (!DEPARTURES.some((item) => item.id === departureId)) fields.departureId = '시연 출발역을 선택해 주세요.';
  let validDate = false;
  try { validDate = dateValid(raw.date); } catch { /* invalid calendar input */ }
  if (!validDate) fields.date = '여행일을 올바른 날짜로 입력해 주세요(2000~2100년).';
  const values = {};
  for (const [key, min, max, label] of [['availableMinutes', 1, 1440, '여행 가능 시간'], ['budget', 0, 10000000, '1인 예산'], ['partySize', 1, 6, '인원'], ['walkingLimitMinutes', 0, 720, '하루 걷기 허용량']]) {
    values[key] = Number(raw[key]);
    if (!integer(raw[key]) || values[key] < min || values[key] > max) fields[key] = `${label}을 ${min.toLocaleString('ko-KR')}~${max.toLocaleString('ko-KR')} 사이 정수로 입력해 주세요.`;
  }
  if (raw.avoidStairs !== undefined && typeof raw.avoidStairs !== 'boolean') fields.avoidStairs = '계단 제외 조건을 다시 선택해 주세요.';
  if (Object.keys(fields).length) throw fail('여행 조건을 확인해 주세요.', fields);
  return { departureId, date: raw.date, ...values, avoidStairs: raw.avoidStairs ?? false };
}

function walkTime(from, to) { return walk[`${from}|${to}`] ?? walk[`${to}|${from}`] ?? null; }
function selectExperiences(profile, trip, region) {
  return EXPERIENCES.filter((item) => item.synthetic === true && item.accessScope === 'demo-public' && item.region === region.name
    && item.tags.some((id) => profile.interests.includes(id)) && item.companions.includes(trip.partySize === 1 ? 'solo' : 'together')
    && (!trip.avoidStairs || item.stairs === false) && item.durationMinutes <= trip.availableMinutes)
    .sort((a, b) => b.tags.filter((id) => profile.interests.includes(id)).length - a.tags.filter((id) => profile.interests.includes(id)).length || a.durationMinutes - b.durationMinutes || a.id.localeCompare(b.id));
}
const statusFor = (value, limit) => value === null ? 'unknown' : value <= limit ? 'met' : 'unmet';

export function buildJourneySnapshot({ profile: rawProfile, trip: rawTrip, regionId, experienceIds }) {
  const profile = normalizeProfile(rawProfile);
  const trip = normalizeTrip(rawTrip);
  const region = REGION_OPTIONS.find((item) => item.id === regionId);
  if (!region) throw fail('시연 지역을 다시 선택해 주세요.', { regionId: '알 수 없는 지역입니다.' });
  if (!Array.isArray(experienceIds) || !experienceIds.length || new Set(experienceIds).size !== experienceIds.length) throw fail('중복 없이 경험을 하나 이상 선택해 주세요.');
  const possible = selectExperiences(profile, trip, region);
  const selected = experienceIds.map((id) => possible.find((item) => item.id === id));
  if (selected.some((item) => !item)) throw fail('선택한 지역·관심·동행·계단·활동 시간 조건과 다른 경험이 포함되어 있어요.');
  const departure = DEPARTURES.find((item) => item.id === trip.departureId);
  const connection = transit[trip.departureId][regionId];
  const sourceLabel = '가상 동선·시간·가격 설정 · 실제 지도·운행·비용 자료 아님';
  const leg = (from, to, mode, minutes) => ({ from, to, mode, minutes, synthetic: true, sourceLabel });
  const legs = [leg(departure.label, region.station, 'transit', connection.minutes)];
  let previous = 'station';
  let previousLabel = region.station;
  for (const item of selected) { legs.push(leg(previousLabel, item.title, 'walk', walkTime(previous, item.id))); previous = item.id; previousLabel = item.title; }
  legs.push(leg(previousLabel, region.station, 'walk', walkTime(previous, 'station')), leg(region.station, departure.label, 'transit', connection.minutes));
  const missingWalk = legs.some((item) => item.mode === 'walk' && item.minutes === null);
  const activityMinutes = selected.reduce((sum, item) => sum + item.durationMinutes, 0);
  const knownWalkingMinutes = legs.filter((item) => item.mode === 'walk').reduce((sum, item) => sum + (item.minutes ?? 0), 0) + selected.reduce((sum, item) => sum + activity[item.id].walking, 0);
  const walkingMinutes = missingWalk ? null : knownWalkingMinutes;
  const knownTravelMinutes = legs.reduce((sum, item) => sum + (item.minutes ?? 0), 0);
  const travelMinutes = missingWalk ? null : knownTravelMinutes;
  const costPerPerson = connection.fare * 2 + selected.reduce((sum, item) => sum + activity[item.id].price, 0);
  const estimate = { activityMinutes, walkingMinutes, travelMinutes, totalMinutes: travelMinutes === null ? null : activityMinutes + travelMinutes, costPerPerson, totalCost: costPerPerson * trip.partySize, knownWalkingMinutes, knownTravelMinutes, discountApplied: 0 };
  const checks = {
    time: estimate.totalMinutes === null && activityMinutes + knownTravelMinutes > trip.availableMinutes ? 'unmet' : statusFor(estimate.totalMinutes, trip.availableMinutes),
    walking: walkingMinutes === null && knownWalkingMinutes > trip.walkingLimitMinutes ? 'unmet' : statusFor(walkingMinutes, trip.walkingLimitMinutes),
    budget: statusFor(costPerPerson, trip.budget),
  };
  const warnings = ['지역·경험·동선·시간·가격·지역 혜택은 모두 창작한 시연 자료입니다.', '실제 영업·운행·혼자 이용 조건·복귀 가능 여부는 확인되지 않았어요.', '가상 예산은 선택한 활동과 왕복 교통의 설정값만 포함해요. 식사·숙박 등 추가 지출은 별도예요.', '혜택 후보를 실제 수혜로 확정하거나 예상 비용에서 차감하지 않았어요.'];
  if (missingWalk) warnings.unshift('일부 가상 구간의 이동 시간이 없어 총 소요 시간·총 도보량을 계산하지 않았어요.');
  if (checks.time === 'unmet') warnings.unshift(estimate.totalMinutes === null
    ? `확인된 가상 구간과 활동만 최소 ${activityMinutes + knownTravelMinutes}분으로, 여행 가능 시간 ${trip.availableMinutes}분을 이미 초과해요. 미확인 구간은 별도예요.`
    : `가상 총 시간 ${estimate.totalMinutes}분이 여행 가능 시간 ${trip.availableMinutes}분을 초과해요.`);
  if (checks.walking === 'unmet') warnings.unshift(walkingMinutes === null
    ? `확인된 가상 도보량만 최소 ${knownWalkingMinutes}분으로, 걷기 허용량 ${trip.walkingLimitMinutes}분을 이미 초과해요. 미확인 구간은 별도예요.`
    : `가상 도보량 ${walkingMinutes}분이 걷기 허용량 ${trip.walkingLimitMinutes}분을 초과해요.`);
  if (checks.budget === 'unmet') warnings.unshift(`가상 1인 비용 ${costPerPerson.toLocaleString('ko-KR')}원이 입력 예산 ${trip.budget.toLocaleString('ko-KR')}원을 초과해요.`);
  return { contractVersion: JOURNEY_CONTRACT_VERSION, synthetic: true, sourceLabel, profileSnapshot: copy(profile), tripSnapshot: copy(trip), regionId, regionName: region.name, station: region.station, experienceIds: [...experienceIds], legs, estimate, checks, warnings, benefits: evaluateBenefits(profile, trip, regionId) };
}

export function compareRegions(rawProfile, rawTrip, { sort = 'fit' } = {}) {
  const profile = normalizeProfile(rawProfile);
  const trip = normalizeTrip(rawTrip);
  if (!['fit', 'benefits'].includes(sort)) throw fail('지역 정렬 기준을 다시 선택해 주세요.');
  const results = REGION_OPTIONS.map((region) => {
    const eligible = selectExperiences(profile, trip, region);
    let suggested = [];
    let snapshot = null;
    for (const item of eligible) {
      const trial = buildJourneySnapshot({ profile, trip, regionId: region.id, experienceIds: [...suggested, item.id] });
      if (Object.values(trial.checks).every((value) => value === 'met')) { suggested.push(item.id); snapshot = trial; }
      if (suggested.length === 2) break;
    }
    if (!snapshot && eligible.length) snapshot = buildJourneySnapshot({ profile, trip, regionId: region.id, experienceIds: [eligible[0].id] });
    const benefits = evaluateBenefits(profile, trip, region.id);
    const candidateBenefitCount = benefits.filter((item) => item.status === 'candidate').length;
    const fitStatus = !eligible.length ? 'no_match' : suggested.length ? 'within_demo_limits' : Object.values(snapshot.checks).includes('unknown') ? 'unknown' : 'over_limits';
    const reasons = [];
    if (!eligible.length) reasons.push('입력 관심·동행·계단·활동 시간 조건에 맞는 가상 경험이 없어요.');
    else if (suggested.length) reasons.push(`가상 시간·도보·예산 한도 안에서 ${suggested.length}개 경험을 구성했어요.`);
    else reasons.push('현재 조건 안에 맞는 가상 코스를 구성하지 못했어요. 초과 조건을 확인해 주세요.');
    reasons.push(`가상 혜택 중 입력 조건상 후보 ${candidateBenefitCount}개 · 실제 지원금이 아니에요.`);
    if (snapshot) for (const [key, label] of [['time', '시간'], ['walking', '도보'], ['budget', '예산']]) if (snapshot.checks[key] !== 'met') reasons.push(`${label}: ${snapshot.checks[key] === 'unmet' ? '입력 한도 초과' : '구간 정보 부족'}`);
    return { regionId: region.id, name: region.name, station: region.station, description: region.description, synthetic: true, eligibleExperienceIds: eligible.map((item) => item.id), recommendedExperienceIds: suggested, fitStatus, reasons, estimate: snapshot?.estimate ?? null, checks: snapshot?.checks ?? { time: 'unknown', walking: 'unknown', budget: 'unknown' }, benefits, candidateBenefitCount };
  });
  const rank = { within_demo_limits: 0, unknown: 1, over_limits: 2, no_match: 3 };
  return results.sort((a, b) => sort === 'benefits'
    ? b.candidateBenefitCount - a.candidateBenefitCount || rank[a.fitStatus] - rank[b.fitStatus] || a.name.localeCompare(b.name)
    : rank[a.fitStatus] - rank[b.fitStatus] || b.recommendedExperienceIds.length - a.recommendedExperienceIds.length || (a.estimate?.totalMinutes ?? Infinity) - (b.estimate?.totalMinutes ?? Infinity) || a.name.localeCompare(b.name));
}
