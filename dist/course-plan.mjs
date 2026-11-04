// D49/P67: courses built from the places found around the departure (P60) by rules, until an AI key is approved (D28).
// One module for the server (making 2~3 courses) and the app (re-timing a course after a stop is put in or swapped),
// so both count minutes the same way. Times are straight-line estimates, always shown as "약 N분(추정)".
import { distanceKm } from './geo.mjs';

export const WALK_MIN_PER_KM = 19.5;
export const WALK_LIMIT_MINUTES = 20;
// The same estimate as the place cards (scripts/recommend.mjs travelEstimate): on foot up to 20 minutes, else transit
// (8 minutes to the platform and waiting, 2.6 minutes a straight-line km, 5-minute steps).
export function legEstimate(km) {
  const walk = Math.max(1, Math.ceil(km * WALK_MIN_PER_KM));
  if (walk <= WALK_LIMIT_MINUTES) return { minutes: walk, mode: 'walk', km: Math.round(km * 100) / 100 };
  return { minutes: Math.min(walk, Math.max(10, Math.round((8 + km * 2.6) / 5) * 5)), mode: 'transit', km: Math.round(km * 100) / 100 };
}
export const legBetween = (from, to) => legEstimate(distanceKm(from, to));

// Minutes at a place by what it is (the first known tag wins); the usual way of travelling stretches or shortens it.
export const STAY_MINUTES = Object.freeze({
  palace: 70, museum: 60, exhibition: 50, hanok: 40, park: 40, hangang: 45, trail: 50, view_walk: 30,
  quiet_cafe: 40, garden: 40, bookstore: 40, low_crowd: 30, market: 40, old_restaurant: 50, dessert: 30, food_street: 45,
  photo_spot: 20, aesthetic_alley: 30, night_view: 30, cafe: 35, restaurant: 50, attraction: 40, heritage: 40, leisure: 50,
});
const STYLE_STAY = Object.freeze({ slow: 1.25, packed: 0.85, spontaneous: 1, planned: 1 });
const round5 = (minutes) => Math.max(15, Math.round(minutes / 5) * 5);
export function stayMinutes(tags = [], { factor = 1, style = '' } = {}) {
  const base = tags.map((tag) => STAY_MINUTES[tag]).find(Boolean) ?? 40;
  return round5(base * factor * (STYLE_STAY[style] ?? 1));
}
export const REST_TAGS = Object.freeze(['quiet_cafe', 'cafe', 'dessert', 'restaurant', 'old_restaurant']);

// The three kinds of course (D49): 알찬 has the most stops, 여유 fewer and longer ones (quiet places first), 걸어서
// only legs a person walks. The usual way of travelling (D50) decides which comes first.
export const COURSE_KINDS = Object.freeze({
  full: { title: '알찬 코스', blurb: '시간 안에 여러 곳을 부지런히', maxStops: 4, stayFactor: 0.85, crowdWeight: 1, walkOnly: false },
  relaxed: { title: '여유 코스', blurb: '적게, 오래, 한산한 곳 먼저', maxStops: 3, stayFactor: 1.25, crowdWeight: 3, walkOnly: false },
  walk: { title: '걸어서 코스', blurb: '걸어서 닿는 곳만 이어서', maxStops: 4, stayFactor: 1, crowdWeight: 1, walkOnly: true },
});
export const KIND_ORDER = Object.freeze({ slow: ['relaxed', 'walk', 'full'], packed: ['full', 'walk', 'relaxed'], spontaneous: ['walk', 'relaxed', 'full'], planned: ['full', 'relaxed', 'walk'], '': ['full', 'relaxed', 'walk'] });
const CROWD_SCORE = Object.freeze({ 여유: 1, 보통: 0, '약간 붐빔': -1, 붐빔: -2 });
const sameName = (a, b) => a.name.replace(/\s/g, '') === b.name.replace(/\s/g, '');

// Total minutes of a list of stops from `origin` and back to it.
export function timeline(origin, stops) {
  let at = origin; let total = 0;
  const legs = stops.map((stop) => { const leg = legBetween(at, stop.place); total += leg.minutes + stop.stay; at = stop.place; return leg; });
  const back = stops.length ? legBetween(at, origin) : { minutes: 0, mode: 'walk', km: 0 };
  return { legs, back, total: total + back.minutes };
}
// A course object from stops: legs, the way back and totals worked out again (used after every change).
export function retime(course, origin, budgetMinutes) {
  const stops = course.stops.map((stop) => ({ ...stop }));
  const { legs, back, total } = timeline(origin, stops);
  stops.forEach((stop, index) => { stop.leg = legs[index]; });
  return { ...course, stops, back, totalMinutes: total, budgetMinutes, overBy: Math.max(0, total - budgetMinutes) };
}

// Greedy: from the departure, take the best next place that still leaves time to get back; tastes and quiet places
// (for 여유) count more, a far leg counts against it, and a kind of place already taken counts a little less.
export function buildCourse(kindId, { origin, pool, rests = [], budgetMinutes, tastes = [], style = '', seen = new Map() }) {
  const kind = COURSE_KINDS[kindId];
  const liked = new Set(tastes);
  const stops = [];
  const used = [];
  let at = origin; let spent = 0;
  const fits = (place, stay, from) => {
    const leg = legBetween(from, place);
    if (kind.walkOnly && leg.mode !== 'walk') return null;
    const back = legBetween(place, origin);
    if (kind.walkOnly && back.mode !== 'walk' && back.minutes > WALK_LIMIT_MINUTES * 2) return null;
    return spent + leg.minutes + stay + back.minutes <= budgetMinutes ? leg : null;
  };
  while (stops.length < kind.maxStops) {
    let best = null;
    for (const entry of pool) {
      const { place } = entry;
      if (used.some((other) => other.id === place.id || sameName(other, place))) continue;
      const stay = stayMinutes(place.tags, { factor: kind.stayFactor, style });
      const leg = fits(place, stay, at);
      if (!leg) continue;
      const taste = place.tags.some((tag) => liked.has(tag)) ? 2.5 : 0;
      const crowd = (CROWD_SCORE[entry.crowd?.level] ?? 0) * kind.crowdWeight;
      // The same kind of place again counts 3 less each time (P67: three bookstores or four bakeries in a row).
      const repeat = stops.filter((stop) => stop.place.tags[0] === place.tags[0]).length * 3;
      // A place an earlier course already took counts 2.5 less, so the 2~3 courses offer different days out.
      const value = entry.score + taste + crowd - repeat - leg.minutes / 8 - (seen.get(place.id) ?? 0) * 2.5;
      if (!best || value > best.value) best = { entry, stay, leg, value };
    }
    if (!best) break;
    stops.push({ place: best.entry.place, stay: best.stay, crowd: best.entry.crowd ?? null, matched: best.entry.matched ?? [], rest: false });
    used.push(best.entry.place); spent += best.leg.minutes + best.stay; at = best.entry.place;
  }
  // A long day (3 hours or more, not on foot only) gets one café or meal after the second stop when one is close.
  if (budgetMinutes >= 180 && stops.length >= 2 && !stops.some((stop) => stop.place.tags.some((tag) => REST_TAGS.includes(tag)))) {
    const after = stops[1].place;
    const rest = rests.filter((place) => !used.some((other) => other.id === place.id || sameName(other, place)) && !place.chain)
      .map((place) => ({ place, leg: legBetween(after, place) })).filter(({ leg }) => leg.mode === 'walk' && leg.minutes <= 10)
      .sort((a, b) => a.leg.minutes - b.leg.minutes)[0];
    if (rest) {
      const restStop = { place: rest.place, stay: stayMinutes(rest.place.tags, { style }), crowd: null, matched: [], rest: true };
      const trial = [...stops.slice(0, 2), restStop, ...stops.slice(2)];
      // Room is made by dropping the last stop if the café would not fit otherwise.
      let fitted = trial;
      while (fitted.length > 2 && timeline(origin, fitted).total > budgetMinutes) fitted = fitted.slice(0, -1);
      if (timeline(origin, fitted).total <= budgetMinutes && fitted.includes(restStop)) stops.splice(0, stops.length, ...fitted);
    }
  }
  if (!stops.length) return null;
  return retime({ id: kindId, title: kind.title, blurb: kind.blurb, stops }, origin, budgetMinutes);
}

// 2~3 courses in the order the usual way of travelling suggests; one that repeats another's stops is left out.
export function buildCourses({ origin, pool, rests = [], budgetMinutes, tastes = [], style = '' }) {
  const courses = [];
  const seen = new Map();
  for (const kindId of KIND_ORDER[style] ?? KIND_ORDER['']) {
    const course = buildCourse(kindId, { origin, pool, rests, budgetMinutes, tastes, style, seen });
    if (!course) continue;
    for (const stop of course.stops) seen.set(stop.place.id, (seen.get(stop.place.id) ?? 0) + 1);
    const key = course.stops.map((stop) => stop.place.id).join('|');
    if (courses.some((other) => other.stops.map((stop) => stop.place.id).join('|') === key)) continue;
    courses.push(course);
  }
  return courses.slice(0, 3);
}

// Changes made while following a course (D49): the stops already visited (`done`) stay as they are.
export function insertStop(course, { place, stay }, at) {
  const stops = [...course.stops];
  stops.splice(at, 0, { place, stay, crowd: null, matched: [], rest: false, added: true });
  return { ...course, stops };
}
export function replaceStop(course, index, { place, stay }) {
  const stops = [...course.stops];
  stops[index] = { place, stay, crowd: null, matched: [], rest: false, added: true };
  return { ...course, stops };
}
export function dropStop(course, index) { return { ...course, stops: course.stops.filter((_, at) => at !== index) }; }
// Which stop to offer dropping when a change runs over: the last one not yet visited and not the one just added.
export function dropCandidate(course, { done = 0, keep = -1 } = {}) {
  for (let index = course.stops.length - 1; index >= done; index -= 1) if (index !== keep) return index;
  return -1;
}
// Kakao Map links for one leg (its own link scheme; nothing is asked of Kakao).
export function legUrl(from, to, mode) {
  const point = (place) => `${encodeURIComponent(place.name ?? place.label ?? '출발')},${place.lat},${place.lng}`;
  return `https://map.kakao.com/link/by/${mode === 'walk' ? 'walk' : 'traffic'}/${point(from)}/${point(to)}`;
}
