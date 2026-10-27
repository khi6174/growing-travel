import * as legacy from './journey.mjs';
import { normalizeProfile } from './profile.mjs';
import { REAL_PLACES, REAL_REGIONS, REAL_DEPARTURES } from './real-catalog.mjs';
import { mapRoute } from './travel-links.mjs';

export const JOURNEY_CONTRACT_VERSION = 'real-journey-v1';
export const DEPARTURES = REAL_DEPARTURES;
export const REGION_OPTIONS = REAL_REGIONS;
const copy = (value) => JSON.parse(JSON.stringify(value));
const fail = (message, fields = {}) => Object.assign(new Error(message), { name: 'JourneyError', code: 'INVALID_JOURNEY', fields });
export function normalizeTrip(raw = {}) {
  if (legacy.DEPARTURES.some((item) => item.id === raw?.departureId)) return legacy.normalizeTrip(raw);
  if (!REAL_DEPARTURES.some((item) => item.id === raw?.departureId)) throw fail('출발역을 선택해 주세요.', { departureId: '서울의 출발역을 선택해 주세요.' });
  return { ...legacy.normalizeTrip({ ...raw, departureId: 'central' }), departureId: raw.departureId };
}
export function closedOn(place, date) {
  if (!date) return false;
  return (place.opening?.closedWeekdays ?? []).includes(new Date(`${date}T00:00:00Z`).getUTCDay());
}
export function eligiblePlaces(profile, trip, regionId) {
  return REAL_PLACES.filter((place) => place.regionId === regionId && !closedOn(place, trip.date)
    && place.tags.some((tag) => profile.interests.includes(tag)) && place.durationMinutes <= trip.availableMinutes
    && place.companions.includes(trip.partySize === 1 ? 'solo' : 'together') && (!trip.avoidStairs || place.stairs === false))
    .sort((a, b) => b.tags.filter((tag) => profile.interests.includes(tag)).length - a.tags.filter((tag) => profile.interests.includes(tag)).length || a.durationMinutes - b.durationMinutes || a.id.localeCompare(b.id));
}
export function normalizeOverrides(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 100) throw fail('이동 시간을 확인해 주세요.');
  const result = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!/^leg:[a-z0-9-]+>[a-z0-9-]+$/.test(id) || !value || Object.keys(value).length !== 1 || !Number.isInteger(value.minutes) || value.minutes < 1 || value.minutes > 1440) throw fail('구간 시간은 1~1,440분의 정수로 입력해 주세요.', { travelMinutes: '구간 시간을 확인해 주세요.' });
    result[id] = { minutes: value.minutes };
  }
  return result;
}
export function journeyTotals(places, legs, trip) {
  const activityMinutes = places.reduce((sum, place) => sum + place.durationMinutes, 0);
  const knownTravelMinutes = legs.reduce((sum, leg) => sum + (leg.minutes ?? 0), 0);
  const travelMinutes = legs.some((leg) => leg.minutes === null) ? null : knownTravelMinutes;
  const knownAdmissionCost = places.reduce((sum, place) => sum + (place.admission.amount ?? 0), 0);
  const estimate = { activityMinutes, walkingMinutes: null, travelMinutes, totalMinutes: travelMinutes === null ? null : activityMinutes + travelMinutes,
    costPerPerson: null, totalCost: null, knownWalkingMinutes: 0, knownTravelMinutes, knownAdmissionCost, discountApplied: 0 };
  const checks = { time: activityMinutes + knownTravelMinutes > trip.availableMinutes ? 'unmet' : travelMinutes === null ? 'unknown' : 'met', walking: 'unknown', budget: knownAdmissionCost > trip.budget ? 'unmet' : 'unknown' };
  return { estimate, checks };
}
export function buildJourneySnapshot(input) {
  if (legacy.REGION_OPTIONS.some((region) => region.id === input.regionId)) return legacy.buildJourneySnapshot(input);
  const profile = normalizeProfile(input.profile);
  const trip = normalizeTrip(input.trip);
  const region = REAL_REGIONS.find((item) => item.id === input.regionId);
  const departure = REAL_DEPARTURES.find((item) => item.id === trip.departureId);
  if (!region || !departure) throw fail('출발역과 지역을 다시 선택해 주세요.');
  const { experienceIds } = input;
  if (!Array.isArray(experienceIds) || !experienceIds.length || experienceIds.length > 20 || new Set(experienceIds).size !== experienceIds.length) throw fail('중복 없이 장소를 선택해 주세요.');
  const eligible = eligiblePlaces(profile, trip, region.id);
  const selected = experienceIds.map((id) => eligible.find((place) => place.id === id));
  if (selected.some((place) => !place)) throw fail('선택일 휴무 또는 관심·계단·체류 시간 조건을 확인해 주세요.');
  const overrides = normalizeOverrides(input.travelOverrides);
  const station = { id: `${region.id}-station`, title: region.station, location: region.stationLocation };
  const points = [departure, station, ...selected, station, departure];
  const legs = points.slice(1).map((to, index) => {
    const from = points[index];
    const id = `leg:${from.id}>${to.id}`;
    const route = mapRoute(from, to);
    const walk = mapRoute(from, to, 'walk');
    const minutes = overrides[id]?.minutes ?? null;
    return { id, fromId: from.id, toId: to.id, toExperienceId: experienceIds.includes(to.id) ? to.id : null,
      from: from.title ?? from.label, to: to.title ?? to.label, mode: 'transit', minutes, fare: null,
      routeUrl: route.url, walkUrl: index > 0 && index < points.length - 2 ? walk.url : null, linkKind: route.kind,
      source: minutes === null ? 'unconfirmed' : 'user', sourceLabel: minutes === null ? '지도에서 이동 시간 확인 필요' : '직접 입력', synthetic: false };
  });
  const travelOverrides = Object.fromEntries(legs.filter((leg) => leg.minutes !== null).map((leg) => [leg.id, { minutes: leg.minutes }]));
  return { contractVersion: JOURNEY_CONTRACT_VERSION, synthetic: false, sourceLabel: '공식 장소 안내 · 이동 시간은 직접 확인', profileSnapshot: copy(profile), tripSnapshot: copy(trip),
    regionId: region.id, regionName: region.name, station: region.station, regionSnapshot: copy(region), departureSnapshot: copy(departure), placeSnapshots: copy(selected), experienceIds: [...experienceIds], legs, travelOverrides,
    ...journeyTotals(selected, legs, trip), benefits: [], warnings: ['체류 시간은 계획값이며, 교통편·운임·환승·복귀 시각은 지도와 코레일에서 확인해 주세요.', '장소 운영과 계단·보행 여건은 방문 전에 다시 확인해 주세요. 혜택은 비용에서 차감하지 않아요.'] };
}
export function compareRegions(rawProfile, rawTrip, { sort = 'fit' } = {}) {
  if (legacy.DEPARTURES.some((item) => item.id === rawTrip?.departureId)) return legacy.compareRegions(rawProfile, rawTrip, { sort });
  if (!['fit', 'benefits'].includes(sort)) throw fail('지역 정렬 기준을 확인해 주세요.');
  const profile = normalizeProfile(rawProfile);
  const trip = normalizeTrip(rawTrip);
  return REAL_REGIONS.map((region) => {
    const eligible = eligiblePlaces(profile, trip, region.id);
    const suggested = [];
    let planned = 0;
    for (const place of eligible) if (suggested.length < 2 && planned + place.durationMinutes <= trip.availableMinutes) { suggested.push(place.id); planned += place.durationMinutes; }
    const snapshot = suggested.length ? buildJourneySnapshot({ profile, trip, regionId: region.id, experienceIds: suggested }) : null;
    return { regionId: region.id, name: region.name, station: region.station, description: region.description, railLabel: region.railLabel, synthetic: false,
      eligibleExperienceIds: eligible.map((place) => place.id), recommendedExperienceIds: suggested, fitStatus: suggested.length ? 'unknown' : 'no_match',
      reasons: [suggested.length ? `관심과 선택일을 고려한 장소 ${suggested.length}곳 · 왕복 이동 시간은 확인이 필요해요.` : '선택일 휴무와 관심·체류 시간·계단 조건에 맞는 장소가 없어요.'],
      estimate: snapshot?.estimate ?? null, checks: snapshot?.checks ?? { time: 'unknown', walking: 'unknown', budget: 'unknown' }, benefits: [], candidateBenefitCount: 0 };
  });
}
