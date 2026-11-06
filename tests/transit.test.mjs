import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { summariseRoute, fareLabel, transitLine, createTransit } from '../scripts/transit.mjs';
import { recommendPlaces } from '../scripts/recommend.mjs';
import { loadCatalog } from '../scripts/places.mjs';

const step = (type, name, vehicleType) => ({ properties: { type, ...(name ? { vehicles: [{ name, type: vehicleType }] } : {}) } });
const body = {
  status: 'OK',
  properties: { landingURL: 'https://map.kakao.com/link/by/traffic/a/b' },
  routes: [
    { properties: { totalTime: 2250, transfers: 1, fare: { value: 1500 } }, steps: [step('BUS', '272', '간선')] },
    { properties: { totalTime: 1721, transfers: 2, fare: { value: 1550 } }, steps: [step('SUBWAY', '3호선', '일반'), step('WALKING'), step('SUBWAY', '4호선', '일반'), step('BUS', '성북02', '마을')] },
  ],
};

test('D40: the fastest Kakao route becomes minutes, transfers, fare and its rides in order', () => {
  const { steps, ...summary } = summariseRoute(body);
  assert.ok(Array.isArray(steps), 'D55: the ride step by step comes along');
  assert.deepEqual(summary, { minutes: 29, transfers: 2, fare: '1,550원', lines: ['3호선', '4호선', '마을 성북02'], landingUrl: 'https://map.kakao.com/link/by/traffic/a/b' });
  assert.equal(transitLine(summariseRoute(body)), '3호선 → 4호선 → 마을 성북02 · 약 29분 · 환승 2회 · 1,550원');
  assert.deepEqual([fareLabel({ min: 1500, max: 2500 }), fareLabel({ min: 1500, max: 1500 }), fareLabel({})], ['1,500원~2,500원', '1,500원', null]);
  assert.equal(summariseRoute({ status: 'NO_RESULTS' }), null);
  assert.equal(summariseRoute({ ...body, properties: { landingURL: 'javascript:alert(1)' } }).landingUrl, null, 'only Kakao map links are kept');
});

test('D40: without a key there is no transit lookup; a failed or slow call gives no route', async () => {
  assert.equal(createTransit({ key: null }), null);
  const calls = [];
  const ok = createTransit({ key: 'k'.repeat(32), fetchImpl: async (url, options) => { calls.push([url, options.headers.Authorization]); return { ok: true, json: async () => body }; } });
  assert.equal((await ok({ label: '경복궁역', lat: 37.5759, lng: 126.9735 }, { name: '최순우옛집', lat: 37.5937, lng: 127.0004 })).minutes, 29);
  assert.equal(calls[0][0].searchParams.get('start_x'), '126.9735');
  assert.equal(calls[0][1], `KakaoAK ${'k'.repeat(32)}`);
  const down = createTransit({ key: 'k'.repeat(32), fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(await down({ label: 'a', lat: 37.5, lng: 127 }, { name: 'b', lat: 37.6, lng: 127.1 }), null);
});

test('D40: real routes change what the three cards show, never which three; a pick without a route keeps its estimate', async () => {
  const catalog = await loadCatalog(fileURLToPath(new URL('../data/', import.meta.url)));
  const conditions = { pet: 'baekgu', departure: 'gyeongbokgung', location: null, hours: 1, partySize: 2, walkLevel: 2, timeOfDay: 'day', metFriends: [] };
  const plain = await recommendPlaces({ conditions, catalog, provider: null });
  let calls = 0;
  const transit = async () => { calls += 1; return calls === 2 ? null : { minutes: 26, transfers: 1, fare: '1,550원', lines: ['3호선', '4호선'], landingUrl: null }; };
  const real = await recommendPlaces({ conditions, catalog, provider: null, transit });
  assert.deepEqual(real.items.map((item) => item.place_id), plain.items.map((item) => item.place_id));
  assert.deepEqual(real.items.map((item) => item.minutesEstimated), [false, true, false]);
  assert.equal(real.items[0].route_summary, '3호선 → 4호선 · 약 26분 · 환승 1회 · 1,550원');
  assert.equal(real.items[0].transit.tight, true, '26 minutes each way plus 10 minutes there does not fit 1 hour');
  assert.equal(real.items[1].route_summary, plain.items[1].route_summary);
  assert.deepEqual(real.more, plain.more, 'the 더 보기 list keeps its estimates');
});

test('D40: cards say 대중교통 without (추정) only when Kakao answered, and the note says which times are which', async () => {
  const { travelLabel, resultsNote } = await import('../dist/ai-flow.mjs');
  assert.equal(travelLabel({ minutes: 15 }), '약 15분(추정)');
  assert.equal(travelLabel({ minutes: 29, transit: { minutes: 29, transfers: 2 } }), '대중교통 약 29분 · 환승 2회');
  assert.match(resultsNote({ items: [{ transit: {} }, {}] }), /카카오 대중교통 기준.*더 보기의 시간은 직선거리 추정치/);
  assert.match(resultsNote({ items: [{}] }), /^이동 시간은 직선거리로 계산한 추정치예요/);
});
