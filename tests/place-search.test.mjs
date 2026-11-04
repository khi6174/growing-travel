import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createPlaceSearch, localMatches } from '../scripts/place-search.mjs';
import { rankCandidates, MIN_STAY_MINUTES } from '../scripts/recommend.mjs';
import { loadCatalog } from '../scripts/places.mjs';
import { createServer } from '../scripts/serve.mjs';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const kakaoFetch = (calls = []) => async (url, options) => {
  calls.push({ url, auth: options.headers.Authorization });
  if (url.pathname.endsWith('/address.json')) return json({ documents: [{ address_name: '서울 마포구 연남동 239-49', x: '126.9253', y: '37.5621', road_address: { address_name: '서울 마포구 동교로 250', building_name: '' } }] });
  return json({ documents: [
    { place_name: '합정역 2호선', road_address_name: '서울 마포구 양화로 55', address_name: '서울 마포구 합정동 411', x: '126.9139', y: '37.5495' },
    { place_name: '합정역 2호선', road_address_name: '서울 마포구 양화로 55', address_name: '서울 마포구 합정동 411', x: '126.9139', y: '37.5495' },
    { place_name: '합정 부산집', road_address_name: '부산 해운대구', address_name: '부산', x: '129.16', y: '35.16' },
  ] });
};

test('D39: Kakao address and keyword results become Seoul points, without duplicates, with the key in the header only', async () => {
  const calls = [];
  const search = createPlaceSearch({ key: 'k'.repeat(32), fetchImpl: kakaoFetch(calls) });
  const { results, source } = await search('  합정역  ');
  assert.equal(source, 'kakao');
  assert.deepEqual(results.map((item) => item.label), ['서울 마포구 연남동 239-49', '합정역 2호선'], 'the Busan hit is outside Seoul and the repeat is dropped');
  assert.deepEqual(results[1], { label: '합정역 2호선', address: '서울 마포구 양화로 55', lat: 37.5495, lng: 126.9139 });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ url, auth }) => auth === `KakaoAK ${'k'.repeat(32)}` && !url.search.includes('kkkk')));
  assert.equal(calls.find(({ url }) => url.pathname.endsWith('/keyword.json')).url.searchParams.get('query'), '합정역');
});

test('D39: without a key, or when Kakao refuses or fails, the app looks through its own stations and places', async () => {
  const places = async () => [{ name: '광장시장', address: '서울 종로구 창경궁로 88', lat: 37.57, lng: 126.9996 }];
  assert.deepEqual((await createPlaceSearch({ places })('광장')).results.map((item) => item.label), ['광장시장']);
  const refused = await createPlaceSearch({ key: 'k'.repeat(32), places, fetchImpl: async () => json({}, 401) })('홍대입구');
  assert.deepEqual([refused.source, refused.reason, refused.results[0].label], ['local', 'KEY_REJECTED', '홍대입구역']);
  const offline = await createPlaceSearch({ key: 'k'.repeat(32), places, fetchImpl: async () => { throw new Error('offline'); } })('서울역');
  assert.deepEqual([offline.source, offline.reason], ['local', 'UNAVAILABLE']);
  assert.deepEqual((await createPlaceSearch({ places })('   ')).results, []);
  assert.deepEqual(localMatches('강남역 근처', []).map((item) => item.label), ['강남역'], 'a station named inside a longer phrase');
});

test('D39: POST /api/places/search answers from the body; the query never goes in the URL', async () => {
  const server = createServer({ kakaoRestKey: 'k'.repeat(32), searchFetch: kakaoFetch() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/places/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '합정역' }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).results.length, 2);
  } finally { server.close(); }
});

test('D39: the way there and back plus 10 minutes there must fit; a place at the departure is not suggested', async () => {
  const catalog = await loadCatalog(fileURLToPath(new URL('../data/', import.meta.url)));
  const base = { pet: 'golden', departure: 'seoul', location: null, partySize: 1, walkLevel: 2, timeOfDay: 'day', metFriends: [] };
  for (const hours of [0.5, 1, 2]) {
    const ranked = rankCandidates({ ...base, hours }, catalog);
    assert.ok(ranked.every((entry) => entry.minutes * 2 + MIN_STAY_MINUTES <= hours * 60), `${hours}h`);
  }
  assert.ok(rankCandidates({ ...base, hours: 0.5 }, catalog).length < rankCandidates({ ...base, hours: 1 }, catalog).length);
  assert.equal(rankCandidates({ ...base, hours: 3 }, catalog).length, rankCandidates({ ...base, hours: 8 }, catalog).length, 'the 60-minute reach still decides from 3 hours');
  const market = catalog.places.find((place) => place.id === 'seoul-gwangjang-market');
  const fromMarket = rankCandidates({ ...base, pet: 'corgi', departure: 'place', departureLabel: '광장시장', location: { lat: market.lat, lng: market.lng }, hours: 2 }, catalog);
  assert.ok(fromMarket.length && !fromMarket.some((entry) => entry.place.id === market.id), 'starting at 광장시장 does not suggest 광장시장');
});

test('D39: when Kakao answers but knows no such name, the app list is tried and says why', async () => {
  const empty = async () => json({ documents: [] });
  const places = async () => [{ name: '연남동 경의선숲길', address: '서울 마포구 연남동', lat: 37.5605, lng: 126.9233 }];
  const result = await createPlaceSearch({ key: 'k'.repeat(32), fetchImpl: empty, places })('연남동');
  assert.deepEqual([result.source, result.reason, result.results.map((item) => item.label)], ['local', 'NO_MATCH', ['연남동 경의선숲길']]);
});
