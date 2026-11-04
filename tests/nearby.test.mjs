import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferTags, fromKakao, fromTour, mergeNearby, searchRadiusKm, walkMinutes, ongoingFestivals, purposesFor, createNearby } from '../scripts/nearby.mjs';
import { createPlaceRegistry } from '../scripts/place-registry.mjs';
import { recommendPlaces, travelEstimate } from '../scripts/recommend.mjs';
import { loadCatalog } from '../scripts/places.mjs';
import { createServer } from '../scripts/serve.mjs';
import { whereLabel, nearbyNote, travelLabel, eventDates } from '../dist/ai-flow.mjs';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
const districts = [{ id: 'jongno', name: '종로구' }, { id: 'jung', name: '중구' }];
const temp = () => fs.mkdtemp(path.join(os.tmpdir(), 'growing-travel-nearby-'));
const kakaoDoc = (id, name, category, group, x, y, address = '서울 종로구 사직동 1') => ({ id: String(id), place_name: name, category_name: category, category_group_code: group, x: String(x), y: String(y), address_name: address, road_address_name: '', place_url: `http://place.map.kakao.com/${id}`, distance: '100' });
const tourItem = (id, title, type, cat, x, y, image = 'http://tong.visitkorea.or.kr/cms/a.jpg') => ({ contentid: String(id), contenttypeid: String(type), title, cat1: cat[0], cat2: cat[1], cat3: cat[2], mapx: String(x), mapy: String(y), addr1: '서울특별시 종로구 사직로 89', firstimage: image });

test('D44 tags come only from what the category or name says; a cafe is never called quiet', () => {
  assert.deepEqual(inferTags({ name: '스타벅스 광화문점', path: '음식점 > 카페 > 커피전문점 > 스타벅스', group: 'CE7' }), ['cafe']);
  assert.deepEqual(inferTags({ name: '통의동마을마당', path: '여행 > 공원 > 도시근린공원' }), ['park']);
  assert.deepEqual(inferTags({ name: '국립고궁박물관', path: '문화,예술 > 문화시설 > 박물관', group: 'CT1' }), ['museum']);
  assert.deepEqual(inferTags({ name: '경복궁', path: '여행 > 관광,명소 > 고궁', group: 'AT4' }), ['palace']);
  assert.deepEqual(inferTags({ name: '어느 빵집', path: '음식점 > 간식 > 제과,베이커리', group: 'FD6' }), ['dessert', 'restaurant']);
  assert.deepEqual(inferTags({ name: '세종대왕 동상', tourType: '12', cat: ['A02', 'A0205', 'A02050400'] }), ['attraction']);
  assert.deepEqual(inferTags({ name: '영화관', path: '문화,예술 > 영화,영상 > 영화관', group: 'CT1' }), [], 'nothing to back a fit');
  assert.ok(!inferTags({ name: '스타벅스', path: '음식점 > 카페', group: 'CE7' }).includes('quiet_cafe'));
});

test('D44 Kakao and TourAPI results become places in the catalog shape, inside Seoul only', () => {
  const place = fromKakao(kakaoDoc(8214304, '국립고궁박물관', '문화,예술 > 문화시설 > 박물관', 'CT1', 126.975, 37.576), districts);
  assert.equal(place.id, 'k8214304'); assert.equal(place.gu, 'jongno'); assert.equal(place.kind, '박물관');
  assert.equal(place.source_url, 'https://place.map.kakao.com/8214304'); assert.equal(place.needs_check, true);
  assert.equal(fromKakao(kakaoDoc(1, '부산 어딘가', '여행 > 공원', 'AT4', 129.07, 35.18, '부산 해운대구 우동'), districts), null);
  assert.equal(fromKakao({ ...kakaoDoc(2, 'x', '여행 > 공원', 'AT4', 126.97, 37.57), id: '../../etc' }, districts), null, 'ids are digits only');
  const tour = fromTour(tourItem(127942, '사직공원(서울)', 12, ['A02', 'A0202', 'A02020700'], 126.968, 37.576), districts);
  assert.equal(tour.id, 't127942'); assert.equal(tour.name, '사직공원'); assert.equal(tour.kind, '공원');
  assert.equal(tour.photo, 'https://tong.visitkorea.or.kr/cms/a.jpg', 'photos only from the 한국관광공사 host, over HTTPS');
  assert.equal(fromTour(tourItem(3, '어딘가', 12, ['A02', 'A0202', 'A02020700'], 126.968, 37.576, 'https://evil.example/x.jpg'), districts).photo, null);
});

test('D44 the same place from both sources is one entry, and a place the team checked stands in for it', () => {
  const kakao = fromKakao(kakaoDoc(9, '사직공원', '여행 > 공원 > 도시근린공원', 'AT4', 126.9681, 37.5761), districts);
  const tour = fromTour(tourItem(127942, '사직공원(서울)', 12, ['A02', 'A0202', 'A02020700'], 126.9683, 37.5762), districts);
  const merged = mergeNearby([kakao, tour]);
  assert.equal(merged.length, 1); assert.equal(merged[0].id, 'k9'); assert.equal(merged[0].photo, tour.photo, 'the TourAPI photo joins its Kakao twin');
  const checked = { id: 'sajik-park', name: '사직공원', gu: 'jongno', lat: 37.5762, lng: 126.9682, tags: ['park'], purposes: ['golden'] };
  const withCatalog = mergeNearby([kakao], [checked]);
  assert.equal(withCatalog[0].id, 'sajik-park'); assert.equal(withCatalog[0].source, 'catalog');
});

test('D44 a short trip looks within walking distance; a long one reaches further, up to 20 km', () => {
  assert.ok(Math.abs(searchRadiusKm(0.5) - 10 / 19.5) < 1e-9); // 10 minutes each way on foot, about 510 m
  assert.ok(Math.abs(searchRadiusKm(1) - 25 / 19.5) < 1e-9);
  assert.ok(searchRadiusKm(2) > 5 && searchRadiusKm(2) < 9);
  assert.equal(searchRadiusKm(8), 20);
  assert.equal(walkMinutes(0.5), 10); assert.deepEqual(travelEstimate(0.5), { minutes: 10, mode: 'walk' });
  assert.equal(travelEstimate(3).mode, 'transit');
  const pets = [{ id: 'shiba', tags: ['quiet_cafe'] }, { id: 'corgi', tags: ['market'] }, { id: 'baekgu', tags: ['museum'] }];
  assert.deepEqual(purposesFor(['cafe'], pets), ['shiba', 'corgi']);
  assert.deepEqual(purposesFor(['museum'], pets), ['baekgu']);
});

test('D44 events going on today, nearest first, within 3 km', () => {
  const at = { lat: 37.5759, lng: 126.9735 };
  const items = [
    { contentid: '1', title: '오늘 하는 축제', eventstartdate: '20261101', eventenddate: '20261110', mapx: '126.975', mapy: '37.577', addr1: '종로' },
    { contentid: '2', title: '끝난 축제', eventstartdate: '20261001', eventenddate: '20261003', mapx: '126.975', mapy: '37.577' },
    { contentid: '3', title: '먼 축제', eventstartdate: '20261101', eventenddate: '20261110', mapx: '127.10', mapy: '37.51' },
  ];
  const now = Date.parse('2026-11-04T03:00:00Z');
  assert.deepEqual(ongoingFestivals(items, at, { now }).map((event) => event.title), ['오늘 하는 축제']);
  assert.equal(eventDates('20261101', '20261110'), '11.1~11.10');
});

function fakeApis({ fail = false } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (fail) throw new Error('down');
    const { pathname, searchParams } = new URL(url);
    const json = (body) => ({ ok: true, json: async () => body });
    if (pathname.endsWith('/category.json') && searchParams.get('category_group_code') === 'CT1') return json({ documents: [kakaoDoc(8214304, '국립고궁박물관', '문화,예술 > 문화시설 > 박물관', 'CT1', 126.9750, 37.5765), kakaoDoc(502284463, '대림미술관', '문화,예술 > 문화시설 > 미술관', 'CT1', 126.9727, 37.5777)] });
    if (pathname.endsWith('/category.json')) return json({ documents: [kakaoDoc(18619, '경복궁', '여행 > 관광,명소 > 고궁', 'AT4', 126.9770, 37.5796)] });
    if (pathname.endsWith('/keyword.json')) return json({ documents: [] });
    if (pathname.endsWith('/coord2regioncode.json')) return json({ documents: [{ region_type: 'H', region_2depth_name: '종로구', region_3depth_name: '사직동' }] });
    if (pathname.endsWith('/searchFestival2')) return json({ response: { header: { resultCode: '0000' }, body: { items: { item: [] } } } });
    if (pathname.endsWith('/locationBasedList2')) return json({ response: { header: { resultCode: '0000' }, body: { items: { item: [tourItem(2733967, '국립고궁박물관', 14, ['A02', 'A0206', 'A02060100'], 126.9751, 37.5764)] } } } });
    return { ok: false, json: async () => ({}) };
  };
  return { fetchImpl, calls };
}

test('D44 a recommendation picks 3 of the places found around the point, walks short hops and keeps no history', async () => {
  const catalog = await loadCatalog(dataDir);
  const { fetchImpl, calls } = fakeApis();
  const nearby = createNearby({ kakaoKey: 'k'.repeat(32), tourKey: 'tour-key', fetchImpl });
  const conditions = { pet: 'baekgu', departure: 'gyeongbokgung', location: null, hours: 1, partySize: 1, walkLevel: 2, timeOfDay: 'day', metFriends: [] };
  const point = { lat: 37.5759, lng: 126.9735, label: '경복궁역' };
  const found = await nearby.places({ point, hours: 1, pet: 'baekgu', pets: catalog.pets, districts: catalog.districts, catalogPlaces: catalog.places });
  assert.ok(found.places.length >= 2, 'museum, gallery and palace around 경복궁역');
  assert.ok(found.places.every((place) => place.purposes.includes('baekgu')));
  assert.equal(found.places.filter((place) => place.name === '국립고궁박물관').length, 1, 'Kakao and TourAPI twins merged');
  assert.ok(calls.some((url) => url.includes('category_group_code=CT1')) && calls.some((url) => url.includes('locationBasedList2')));
  const asked = calls.length;
  await nearby.places({ point, hours: 1, pet: 'baekgu', pets: catalog.pets, districts: catalog.districts, catalogPlaces: catalog.places });
  assert.equal(calls.length, asked, 'a second look within minutes is answered from memory');
  const result = await recommendPlaces({ conditions, catalog, provider: { name: 'none', configured: false }, nearby: { ...found, region: { dong: '사직동', gu: '종로구' }, festivals: [] } });
  assert.equal(result.nearby.used, true);
  assert.equal(result.items.length, 3);
  assert.ok(result.items.every((item) => found.places.some((place) => place.id === item.place_id)), 'the 3 picks are nearby places');
  const walk = result.items.find((item) => item.walk);
  assert.ok(walk && walk.walk.url.startsWith('https://map.kakao.com/link/by/walk/'), 'a short hop links Kakao walking directions');
  assert.match(travelLabel(walk), /^걸어서 약 \d+분\(추정\)$/);
  assert.match(walk.route_summary, /걸어서 약 \d+분/);
  assert.equal(whereLabel(result), '종로구 사직동 근처 · 걸어서 25분 안');
  assert.match(nearbyNote(result), /지금 찾은 근처 \d+곳/);
});

test('D44 without keys, or when the searches fail, the team catalog is the fallback and says why', async () => {
  const catalog = await loadCatalog(dataDir);
  const conditions = { pet: 'baekgu', departure: 'gyeongbokgung', location: null, hours: 4, partySize: 2, walkLevel: 2, timeOfDay: 'day', metFriends: [] };
  const none = createNearby({});
  assert.equal(none.configured, false);
  const down = createNearby({ kakaoKey: 'k'.repeat(32), tourKey: 't', fetchImpl: fakeApis({ fail: true }).fetchImpl });
  const failed = await down.places({ point: { lat: 37.5759, lng: 126.9735 }, hours: 4, pet: 'baekgu', pets: catalog.pets, districts: catalog.districts });
  assert.equal(failed.reason, 'UNAVAILABLE');
  const result = await recommendPlaces({ conditions, catalog, provider: { name: 'none', configured: false }, nearby: { ...failed, region: null, festivals: [] } });
  assert.equal(result.nearby.used, false);
  assert.deepEqual(result.items.map((item) => item.place.name), ['최순우옛집', '간송미술관', '국립중앙박물관'], 'the demo answer from the catalog');
  assert.match(nearbyNote(result), /근처 검색이 응답하지 않아 팀이 정리한 서울 장소에서 골랐어요/);
});

test('D44 shown nearby places stay in memory; only a reported one is written and becomes public', async () => {
  const dir = await temp();
  let clock = 0;
  const registry = createPlaceRegistry({ file: path.join(dir, 'places-seen.json'), now: () => clock, ttlMs: 1000 });
  registry.remember([{ id: 'k1', name: '어느 카페', gu: 'jongno', lat: 37.57, lng: 126.97, tags: ['cafe'], purposes: ['shiba'] }, { id: 'catalog-place', name: 'x' }]);
  assert.equal(await registry.has('k1'), true); assert.equal(await registry.has('catalog-place'), false);
  assert.deepEqual(await registry.saved(), []);
  await registry.keep('k1');
  assert.deepEqual((await registry.saved()).map((place) => place.id), ['k1']);
  clock = 5000;
  assert.equal(await registry.has('k1'), true, 'a reported place survives the memory limit');
  const reread = createPlaceRegistry({ file: path.join(dir, 'places-seen.json') });
  assert.equal((await reread.get('k1')).name, '어느 카페');
});

test('D44 the API recommends around the point, takes reports on a nearby pick and keeps unreported ones off shared screens', async () => {
  const work = await temp();
  for (const file of ['pets.json', 'districts.json', 'gu_friends.json', 'places.json']) await fs.copyFile(path.join(dataDir, file), path.join(work, file));
  await fs.cp(path.join(dataDir, 'boundaries'), path.join(work, 'boundaries'), { recursive: true });
  const server = createServer({ dataDir: work, aiProvider: { name: 'none', configured: false }, kakaoRestKey: 'k'.repeat(32), tourKey: 'tour-key', searchFetch: fakeApis().fetchImpl });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body, headers = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    const result = await (await post('/api/recommend', { conditions: { pet: 'baekgu', departure: 'gyeongbokgung', hours: 1, partySize: 1, walkLevel: 2, timeOfDay: 'day', metFriends: [] } })).json();
    assert.equal(result.nearby.used, true);
    const pick = result.items.find((item) => /^[kt]\d+$/.test(item.place_id));
    assert.ok(pick, 'a nearby pick');
    assert.equal((await fetch(`${base}/api/reports?place_id=${pick.place_id}`)).status, 200, 'its detail can list reports');
    assert.deepEqual(await (await post('/api/stats/route', { placeId: pick.place_id })).json(), { counted: false }, 'not counted while nobody reported on it');
    let map = await (await fetch(`${base}/api/map`)).json();
    assert.ok(!map.places.some((place) => place.id === pick.place_id), 'not on the shared map yet');
    const posted = await post('/api/reports', { placeId: pick.place_id, category: 'calm', text: '확인용 제보예요' }, { 'X-Contributor-Id': 'tester-0000-0000-0009' });
    assert.equal(posted.status, 201);
    map = await (await fetch(`${base}/api/map`)).json();
    assert.ok(map.places.some((place) => place.id === pick.place_id && place.state === 'live'), 'a reported nearby place shows on the map');
    assert.deepEqual(await (await post('/api/stats/route', { placeId: pick.place_id })).json(), { counted: true });
    const region = await (await post('/api/places/region', { lat: 37.5759, lng: 126.9735 })).json();
    assert.deepEqual(region.region, { dong: '사직동', gu: '종로구' });
    assert.equal((await post('/api/places/region', { lat: 35.1, lng: 129.0 })).status, 400);
    const saved = await fs.readFile(path.join(work, 'runtime', 'places-seen.json'), 'utf8');
    assert.doesNotMatch(saved, /37\.5759|126\.9735|tester/, 'the search point and reporter are not in the place file');
  } finally { server.close(); }
});
