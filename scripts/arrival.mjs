import { distanceKm } from '../dist/geo.mjs';
import { insideSeoul } from '../dist/ai-conditions.mjs';
import { publicPlace } from './recommend.mjs';

// Stage 5 (명세 2-5 ⑤): what the 구 도착 screen shows — the friend and district, nearby places for the pet's purpose,
// every place of the district for "내가 찾는 곳", and its latest live reports. The location is used for distances
// only and never stored.
export const NEARBY_COUNT = 3;
// The friend asks about a place only when the traveler is this close to it, so an answer describes what they see.
export const QUESTION_RADIUS_KM = 0.5;
export const RECENT_REPORTS = 5;

export class ArrivalError extends Error {
  constructor(message) { super(message); this.name = 'ArrivalError'; }
}

export function normalizeArrival(raw, catalog) {
  const gu = typeof raw?.gu === 'string' ? raw.gu : '';
  if (!catalog.districts.some((district) => district.id === gu)) throw new ArrivalError('알 수 없는 자치구예요.');
  const pet = raw?.pet == null || raw.pet === '' ? null : raw.pet;
  if (pet !== null && !catalog.pets.some((item) => item.id === pet)) throw new ArrivalError('알 수 없는 펫이에요.');
  let location = null;
  if (raw?.location != null) {
    const point = { lat: Number(raw.location.lat), lng: Number(raw.location.lng) };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || !insideSeoul(point)) throw new ArrivalError('서울 안의 위치만 쓸 수 있어요.');
    location = point;
  }
  return { gu, pet, location };
}

export function arrivalInfo({ gu, pet: petId, location }, catalog, reportSummaries = {}) {
  const district = catalog.districts.find((item) => item.id === gu);
  const friend = catalog.friends.find((item) => item.gu === gu);
  const pet = catalog.pets.find((item) => item.id === petId) ?? null;
  const entries = catalog.places.filter((place) => place.gu === gu).map((place) => ({
    raw: place,
    distanceKm: location ? Math.round(distanceKm(location, place) * 100) / 100 : null,
    latest: (reportSummaries[place.id] ?? []).find((report) => report.active) ?? null,
  })).sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0) || a.raw.name.localeCompare(b.raw.name, 'ko'));
  const nearest = entries[0];
  const reports = entries.flatMap(({ raw }) => (reportSummaries[raw.id] ?? []).filter((report) => report.active).map((report) => ({ ...report, place_id: raw.id, place_name: raw.name })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, RECENT_REPORTS);
  return {
    district: { id: district.id, name: district.name, region: district.region, regionName: catalog.regions.find((region) => region.id === district.region)?.name ?? '' },
    friend: { id: friend.id, name: friend.name, concept: friend.concept, greeting: friend.greeting },
    pet: pet && { id: pet.id, name: pet.name, purpose: pet.purpose },
    places: entries.map(({ raw, distanceKm: km, latest }) => ({ ...publicPlace(raw, catalog), purposes: raw.purposes, distanceKm: km, latest_report: latest })),
    picks: pet ? entries.filter(({ raw }) => raw.purposes.includes(pet.id)).slice(0, NEARBY_COUNT).map(({ raw }) => raw.id) : [],
    question_place_id: location && nearest && nearest.distanceKm <= QUESTION_RADIUS_KM ? nearest.raw.id : null,
    reports,
  };
}
