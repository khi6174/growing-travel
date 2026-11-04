import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { lookupQueries, crowdOf, createCongestion, CROWD_LEVELS } from '../scripts/congestion.mjs';
import { recommendPlaces } from '../scripts/recommend.mjs';
import { loadCatalog } from '../scripts/places.mjs';
import { seoulKeyFrom } from '../scripts/serve.mjs';
import { crowdLabel, resultsNote } from '../dist/ai-flow.mjs';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
const area = (code, name, level) => ({ 'SeoulRtd.citydata_ppltn': [{ AREA_CD: code, AREA_NM: name, AREA_CONGEST_LVL: level, AREA_CONGEST_MSG: '사람이 몰려 있을 수 있어요.', PPLTN_TIME: '2026-11-04 16:20' }] });

test('Q16 names that Kakao search would miss get a set query; levels read only the four the API uses', () => {
  assert.equal(lookupQueries('시의회 앞', 'POI130')[0], '서울특별시의회');
  assert.deepEqual(lookupQueries('광화문·덕수궁', 'POI009'), ['광화문·덕수궁', '광화문']);
  assert.deepEqual(lookupQueries('홍대 관광특구', 'POI007'), ['홍대 관광특구', '홍대']);
  assert.deepEqual(Object.keys(CROWD_LEVELS), ['여유', '보통', '약간 붐빔', '붐빔']);
  const crowd = crowdOf(area('POI009', '광화문·덕수궁', '약간 붐빔')['SeoulRtd.citydata_ppltn'][0]);
  assert.equal(crowd.level, '약간 붐빔'); assert.equal(crowd.rank, 2); assert.equal(crowd.time, '16:20');
  assert.equal(crowdOf({ AREA_CONGEST_LVL: '모름' }), null);
  assert.equal(crowdLabel(crowd), '지금 약간 붐빔 · 광화문·덕수궁 16:20');
  assert.equal(seoulKeyFrom('a'.repeat(30)), 'a'.repeat(30)); assert.equal(seoulKeyFrom('a b'), null); assert.equal(seoulKeyFrom(undefined), null);
});

function fakeApis(levels) {
  const calls = { seoul: 0, kakao: 0 };
  const fetchImpl = async (url) => {
    const text = String(url);
    const json = (body) => ({ ok: true, json: async () => body });
    if (text.startsWith('https://dapi.kakao.com/v2/local/search/keyword.json')) {
      calls.kakao += 1;
      const query = new URL(text).searchParams.get('query');
      const spots = { 경복궁: [37.5788, 126.9770], 광화문: [37.5726, 126.9769], 고양: [37.658, 126.8316] };
      const hit = Object.entries(spots).find(([name]) => query.startsWith(name));
      return json({ documents: hit ? [{ y: String(hit[1][0]), x: String(hit[1][1]), address_name: hit[0] === '고양' ? '경기 고양시' : '서울 종로구' }] : [] });
    }
    if (text.startsWith('http://openapi.seoul.go.kr:8088/')) {
      calls.seoul += 1;
      const code = decodeURIComponent(text.split('/').at(-1));
      return json(area(code, code === 'POI008' ? '경복궁' : '광화문·덕수궁', levels[code]));
    }
    return { ok: false, json: async () => ({}) };
  };
  return { fetchImpl, calls };
}

test('Q16 a pick near a covered place gets its live level, asked once per 5 minutes; places outside Seoul are dropped', async () => {
  let clock = 0;
  const { fetchImpl, calls } = fakeApis({ POI008: '붐빔', POI009: '여유' });
  const areas = async () => [{ code: 'POI008', name: '경복궁' }, { code: 'POI009', name: '광화문·덕수궁' }, { code: 'POI130', name: '고양' }];
  const congestion = createCongestion({ seoulKey: 'k'.repeat(30), kakaoKey: 'k'.repeat(32), areas, fetchImpl, now: () => clock });
  assert.equal((await congestion.points()).length, 2, 'the place Kakao puts outside Seoul is not used');
  const places = [{ id: 'a', lat: 37.5796, lng: 126.9770 }, { id: 'b', lat: 37.5720, lng: 126.9760 }, { id: 'far', lat: 37.50, lng: 127.10 }];
  const first = await congestion.forPlaces(places);
  assert.equal(first.get('a').level, '붐빔'); assert.equal(first.get('b').level, '여유'); assert.equal(first.has('far'), false);
  const asked = calls.seoul;
  await congestion.forPlaces(places);
  assert.equal(calls.seoul, asked, 'within 5 minutes the level comes from memory');
  clock = 6 * 60_000;
  await congestion.forPlaces(places);
  assert.ok(calls.seoul > asked, 'after 5 minutes it is asked again');
  assert.equal(createCongestion({ seoulKey: null, kakaoKey: 'k' }).configured, false);
});

test('Q16 a crowded candidate gives way to a calmer one, and the card names the source', async () => {
  const catalog = await loadCatalog(dataDir);
  const conditions = { pet: 'baekgu', departure: 'gyeongbokgung', location: null, hours: 4, partySize: 2, walkLevel: 2, timeOfDay: 'day', metFriends: [] };
  const provider = { name: 'none', configured: false };
  const plain = await recommendPlaces({ conditions, catalog, provider });
  const top = plain.items[0].place_id;
  const crowded = await recommendPlaces({ conditions, catalog, provider, crowd: async (places) => new Map(places.filter((place) => place.id === top).map((place) => [place.id, { level: '붐빔', rank: 3, area: '테스트', time: '16:20', message: '' }])) });
  assert.notEqual(crowded.items[0].place_id, top, 'the crowded first pick moved down');
  assert.ok(!crowded.items.some((item) => item.place_id === top && item.crowd === null));
  const calm = await recommendPlaces({ conditions, catalog, provider, crowd: async (places) => new Map([[places[0].id, { level: '여유', rank: 0, area: '테스트', time: '16:20', message: '' }]]) });
  assert.equal(calm.items[0].crowd.level, '여유');
  assert.match(resultsNote(calm), /서울 열린데이터광장\(서울특별시\) 실시간 도시데이터/);
  const broken = await recommendPlaces({ conditions, catalog, provider, crowd: async () => { throw new Error('down'); } });
  assert.deepEqual(broken.items.map((item) => item.place_id), plain.items.map((item) => item.place_id), 'a failed crowd lookup changes nothing');
});
