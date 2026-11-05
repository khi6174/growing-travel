import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../scripts/serve.mjs';
import { plannedLeft, focusOf } from '../dist/follow-flow.mjs';
import { minutesLabel } from '../dist/course-view.mjs';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));

test('P68·P69 a recommendation brings 2~3 courses that fit the time, and the live help keeps course places out', async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'growing-travel-course-'));
  for (const file of ['pets.json', 'districts.json', 'gu_friends.json', 'places.json']) await fs.copyFile(path.join(dataDir, file), path.join(work, file));
  const server = createServer({ dataDir: work, aiProvider: { name: 'none', configured: false }, kakaoRestKey: null, tourKey: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body) => fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const result = await (await post('/api/recommend', { conditions: { pet: 'baekgu', departure: 'gyeongbokgung', hours: 4, partySize: 1, walkLevel: 2, timeOfDay: 'day', metFriends: [], tastes: ['palace', 'nonsense'], travelStyle: 'slow' } })).json();
    assert.ok(result.courses.length >= 2 && result.courses.length <= 3, `${result.courses.length} courses`);
    assert.equal(result.courses[0].id, 'relaxed', 'a slow traveller sees 여유 first');
    for (const course of result.courses) {
      assert.ok(course.totalMinutes <= 240 && course.stops.length >= 1);
      assert.equal(course.origin.label, '경복궁역');
      for (const stop of course.stops) { assert.ok(stop.place.name && stop.stay > 0 && stop.leg.minutes > 0); assert.ok(['walk', 'transit'].includes(stop.leg.mode)); }
    }
    assert.ok(result.courses.some((course) => course.stops.some((stop) => stop.taste)), 'the liked palaces are marked');
    const course = result.courses[0];
    const live = await (await post('/api/course/live', { point: { lat: course.stops[0].place.lat, lng: course.stops[0].place.lng }, pet: 'baekgu', next: course.stops[1]?.place.id ?? null, exclude: course.stops.map((stop) => stop.place.id) })).json();
    assert.ok(Array.isArray(live.suggestions) && live.suggestions.length <= 4);
    assert.ok(live.suggestions.every((item) => !course.stops.some((stop) => stop.place.id === item.place.id) && item.stay > 0 && item.leg.minutes <= 25));
    assert.equal(live.next?.id ?? null, course.stops[1]?.place.id ?? null);
    assert.equal((await post('/api/course/live', { point: { lat: 35.1, lng: 129 }, pet: 'baekgu' })).status, 400, 'outside Seoul');
    assert.equal((await post('/api/course/live', { point: { lat: 37.57, lng: 126.98 }, pet: 'cat' })).status, 400);
  } finally { server.close(); }
});

test('P69 the following screen counts what is left from where the traveller is', () => {
  const at = (lat) => ({ name: `p${lat}`, lat, lng: 127 });
  const course = { origin: { label: '역', lat: 37.5, lng: 127 }, back: { minutes: 10 }, stops: [{ place: at(37.501), stay: 40, leg: { minutes: 5 } }, { place: at(37.502), stay: 30, leg: { minutes: 6 } }] };
  assert.equal(plannedLeft(course, { index: 0, phase: 'moving' }), 5 + 40 + 6 + 30 + 10);
  assert.equal(plannedLeft(course, { index: 0, phase: 'at' }), 40 + 6 + 30 + 10);
  assert.equal(plannedLeft(course, { index: 1, phase: 'moving' }), 6 + 30 + 10);
  assert.equal(plannedLeft(course, { index: 1, phase: 'done' }), 0);
  assert.equal(focusOf(course, { index: 0, phase: 'moving' }).here, course.origin);
  assert.equal(focusOf(course, { index: 0, phase: 'at' }).next, course.stops[1]);
  assert.equal(focusOf(course, { index: 1, phase: 'at' }).next, null);
  assert.equal(minutesLabel(195), '약 3시간 15분(추정)');
  assert.equal(minutesLabel(120), '약 2시간(추정)');
  assert.equal(minutesLabel(45), '약 45분(추정)');
});
