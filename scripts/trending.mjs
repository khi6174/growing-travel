// D41/P57: "지금 이 구에서 뜨는 곳" for one district, in seven tabs: still-valid 한산함·붐빔 reports, places that woke up
// in the last day, and the last week's reports, picks, 길찾기 openings and arrivals by district. Lists hold only what
// this server has seen; a tab with nothing yet stays empty instead of being padded.
import { publicPlace } from './recommend.mjs';

export const TRENDING_DAYS = 7;
export const WOKE_WITHIN_HOURS = 24;
const PER_TAB = 5;
const top = (list, value) => list.filter((item) => value(item) > 0).sort((a, b) => value(b) - value(a)).slice(0, PER_TAB);

export function trending({ gu, catalog, activity = {}, totals = {}, now = Date.now() }) {
  const places = catalog.places.filter((place) => place.gu === gu);
  const card = (place) => publicPlace(place, catalog);
  const petName = new Map(catalog.pets.map((pet) => [pet.id, pet.name]));
  const byLatest = (key) => places.map((place) => ({ place, report: activity[place.id]?.[key] })).filter((item) => item.report)
    .sort((a, b) => b.report.createdAt.localeCompare(a.report.createdAt)).slice(0, PER_TAB)
    .map(({ place, report }) => ({ place: card(place), at: report.createdAt, text: report.text }));
  const woke = places.map((place) => ({ place, at: activity[place.id]?.wokeAt })).filter((item) => item.at && now - Date.parse(item.at) <= WOKE_WITHIN_HOURS * 3_600_000)
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, PER_TAB).map(({ place, at }) => ({ place: card(place), at }));
  const busy = top(places, (place) => (activity[place.id]?.reports ?? 0) * 100 + (activity[place.id]?.confirmations ?? 0))
    .map((place) => ({ place: card(place), reports: activity[place.id].reports, confirmations: activity[place.id].confirmations }));
  const picked = top(places, (place) => totals.picks?.[place.id] ?? 0).map((place) => ({
    place: card(place), picks: totals.picks[place.id],
    pets: Object.entries(totals.petPicks?.[place.id] ?? {}).sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, name: petName.get(id) ?? id, count })),
  }));
  const routed = top(places, (place) => totals.routes?.[place.id] ?? 0).map((place) => ({ place: card(place), routes: totals.routes[place.id] }));
  const ranked = catalog.districts.map((district) => ({ gu: district.id, name: district.name, arrivals: totals.arrivals?.[district.id] ?? 0 }))
    .sort((a, b) => b.arrivals - a.arrivals || a.name.localeCompare(b.name, 'ko'));
  const here = ranked.findIndex((district) => district.gu === gu);
  return {
    gu, windowDays: TRENDING_DAYS, generatedAt: new Date(now).toISOString(),
    tabs: { calm: byLatest('calm'), crowd: byLatest('crowd'), woke, reports: busy, picks: picked, routes: routed },
    districts: ranked.filter((district) => district.arrivals > 0).slice(0, PER_TAB),
    current: { arrivals: ranked[here]?.arrivals ?? 0, rank: ranked[here]?.arrivals ? here + 1 : null },
  };
}
