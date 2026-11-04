import test from 'node:test';
import assert from 'node:assert/strict';
import { legEstimate, stayMinutes, buildCourse, buildCourses, retime, insertStop, replaceStop, dropStop, dropCandidate, legUrl, timeline, COURSE_KINDS } from '../dist/course-plan.mjs';
import { travelEstimate } from '../scripts/recommend.mjs';

const origin = { label: '안국역', lat: 37.5765, lng: 126.9855 };
// Places east of the station, about 0.3 km apart, then one far away.
const place = (id, km, tags, extra = {}) => ({ id, name: `장소 ${id}`, lat: origin.lat, lng: origin.lng + km / 88.2, tags, gu: 'jongno', ...extra });
const entry = (p, score = 10, crowd = null) => ({ place: p, score, matched: p.tags, crowd });
const pool = [
  entry(place('a', 0.3, ['palace']), 12), entry(place('b', 0.6, ['museum']), 11), entry(place('c', 0.9, ['hanok']), 10),
  entry(place('d', 1.2, ['exhibition']), 10, { level: '붐빔' }), entry(place('e', 1.5, ['museum']), 9.5), entry(place('far', 9, ['palace']), 11),
];

test('P67 a leg is the same estimate the place cards use, and stays follow the kind of place and the usual pace', () => {
  for (const km of [0.1, 0.5, 1, 1.2, 3, 8]) assert.deepEqual({ minutes: legEstimate(km).minutes, mode: legEstimate(km).mode }, travelEstimate(km), `${km} km`);
  assert.equal(stayMinutes(['palace']), 70);
  assert.equal(stayMinutes(['photo_spot']), 20);
  assert.equal(stayMinutes(['palace'], { style: 'slow' }), 90, 'a slow traveller stays longer');
  assert.equal(stayMinutes(['palace'], { style: 'packed' }), 60);
  assert.equal(stayMinutes([]), 40);
});

test('P67 every course fits the time with the way back, 걸어서 walks every leg, 여유 has fewer and longer stops', () => {
  const budget = 240;
  const full = buildCourse('full', { origin, pool, budgetMinutes: budget });
  const relaxed = buildCourse('relaxed', { origin, pool, budgetMinutes: budget });
  const walk = buildCourse('walk', { origin, pool, budgetMinutes: budget });
  for (const course of [full, relaxed, walk]) {
    assert.ok(course.totalMinutes <= budget, `${course.id} ${course.totalMinutes}`);
    assert.equal(course.totalMinutes, timeline(origin, course.stops).total);
    assert.ok(new Set(course.stops.map((stop) => stop.place.id)).size === course.stops.length, 'no place twice');
  }
  assert.ok(walk.stops.every((stop) => stop.leg.mode === 'walk'));
  assert.ok(!walk.stops.some((stop) => stop.place.id === 'far'));
  assert.ok(relaxed.stops.length <= COURSE_KINDS.relaxed.maxStops && relaxed.stops.length <= full.stops.length);
  assert.ok(relaxed.stops[0].stay > full.stops[0].stay, 'longer stays');
  assert.ok(!relaxed.stops.some((stop) => stop.place.id === 'd'), 'a busy place is left out of 여유 when others fit');
  assert.equal(buildCourse('full', { origin, pool, budgetMinutes: 20 }), null, 'nothing fits 20 minutes');
});

test('P67 tastes come first, a long day gets a nearby café, and the usual way of travelling orders 2~3 different courses', () => {
  // Two places the same way off, room for one: the better score wins, unless the other is what the traveller likes.
  const pair = [entry(place('x', 0.5, ['museum']), 10), entry(place('y', 0.5, ['hanok']), 9)];
  assert.equal(buildCourse('full', { origin, pool: pair, budgetMinutes: 90 }).stops[0].place.id, 'x');
  assert.equal(buildCourse('full', { origin, pool: pair, budgetMinutes: 90, tastes: ['hanok'] }).stops[0].place.id, 'y', 'the liked kind of place is taken');
  const cafe = place('cafe', 0.65, ['cafe']);
  const withRest = buildCourse('full', { origin, pool, rests: [cafe, place('chain', 0.62, ['cafe'], { chain: true })], budgetMinutes: 300 });
  assert.equal(withRest.stops[2].place.id, 'cafe', 'a café after the second stop, never a chain branch');
  assert.equal(withRest.stops[2].rest, true);
  assert.ok(withRest.totalMinutes <= 300);
  assert.ok(!buildCourse('full', { origin, pool, rests: [cafe], budgetMinutes: 150 }).stops.some((stop) => stop.rest), 'no break under 3 hours');
  const slow = buildCourses({ origin, pool, budgetMinutes: 240, style: 'slow' });
  assert.equal(slow[0].id, 'relaxed');
  assert.equal(buildCourses({ origin, pool, budgetMinutes: 240, style: 'packed' })[0].id, 'full');
  assert.ok(slow.length >= 2 && slow.length <= 3);
  const keys = slow.map((course) => course.stops.map((stop) => stop.place.id).join('|'));
  assert.equal(new Set(keys).size, keys.length, 'no two courses with the same stops');
});

test('P67 putting a place in or swapping one re-times the course and offers the last unvisited stop when it runs over', () => {
  const course = buildCourse('full', { origin, pool, budgetMinutes: 240 });
  const added = { place: place('new', 0.4, ['garden']), stay: 40 };
  const inserted = retime(insertStop(course, added, 1), origin, 240);
  assert.equal(inserted.stops[1].place.id, 'new');
  assert.equal(inserted.stops[1].added, true);
  assert.equal(inserted.stops.length, course.stops.length + 1);
  assert.equal(inserted.totalMinutes, timeline(origin, inserted.stops).total);
  assert.equal(inserted.overBy, Math.max(0, inserted.totalMinutes - 240));
  const swapped = retime(replaceStop(course, 0, added), origin, 240);
  assert.equal(swapped.stops[0].place.id, 'new'); assert.equal(swapped.stops.length, course.stops.length);
  assert.equal(dropCandidate(inserted, { done: 1, keep: 1 }), inserted.stops.length - 1);
  assert.equal(dropCandidate({ stops: [{}, {}] }, { done: 2 }), -1, 'visited stops are never offered');
  assert.equal(dropStop(inserted, 1).stops.length, course.stops.length);
  assert.match(legUrl(origin, added.place, 'walk'), /^https:\/\/map\.kakao\.com\/link\/by\/walk\//);
  assert.match(legUrl(origin, added.place, 'transit'), /\/link\/by\/traffic\//);
});
