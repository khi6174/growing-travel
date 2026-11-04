import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConditions, describeConditions, departurePoint, defaultTimeOfDay, josa, ConditionError, SEOUL_STATIONS, CURRENT_LOCATION, SEARCHED_PLACE, durationLabel } from '../dist/ai-conditions.mjs';
import { resolveScreen, parentScreen, navigationTab } from '../dist/navigation.mjs';

const petIds = ['golden', 'shiba', 'corgi', 'bichon', 'baekgu'];
const demo = { pet: 'golden', departure: 'hongik', hours: 4, partySize: 2, walkLevel: 3, timeOfDay: 'day', metFriends: [] };

test('spec scenario conditions normalize and read as one line with the right particle', () => {
  const conditions = normalizeConditions(demo, { petIds });
  assert.deepEqual(conditions, { ...demo, location: null });
  assert.equal(describeConditions(conditions, { petName: '골든' }), '골든과 함께 · 홍대입구역 출발 · 4시간 · 2명 · 많이 걷기 · 낮');
  assert.equal(describeConditions({ ...conditions, pet: 'shiba', partySize: 1, hours: 8, walkLevel: 1, timeOfDay: 'evening' }, { petName: '시바' }), '시바와 함께 · 홍대입구역 출발 · 하루 · 혼자 · 조금만 걷기 · 저녁');
  assert.deepEqual([josa('비숑', '과', '와'), josa('코기', '과', '와'), josa('기와단', '을', '를'), josa('봉수등', '을', '를')], ['비숑과', '코기와', '기와단을', '봉수등을']);
});

test('every spec test departure station is offered', () => {
  const labels = SEOUL_STATIONS.map((station) => station.label);
  for (const label of ['홍대입구역', '강남역', '신촌역', '잠실역', '서울역', '건대입구역', '성수역', '여의도역', '경복궁역', '독립문역']) assert.ok(labels.includes(label), label);
});

test('current location is rounded to about 100 m and must be inside Seoul', () => {
  const here = normalizeConditions({ ...demo, departure: CURRENT_LOCATION, location: { lat: 37.566535, lng: 126.977969 } }, { petIds });
  assert.deepEqual(here.location, { lat: 37.567, lng: 126.978 });
  assert.equal(departurePoint(here).label, '현재 위치');
  const fieldsOf = (raw) => { try { normalizeConditions({ ...demo, ...raw }, { petIds }); return {}; } catch (error) { return error.fields; } };
  assert.match(fieldsOf({ departure: CURRENT_LOCATION, location: { lat: 37.87, lng: 127.73 } }).departure, /서울 밖/, 'Chuncheon is outside');
  assert.ok(fieldsOf({ departure: CURRENT_LOCATION, location: null }).departure);
  assert.ok(fieldsOf({ departure: 'busan' }).departure);
});

test('every invalid field is reported together', () => {
  const bad = { pet: 'cat', departure: '', hours: 12.5, partySize: 0, walkLevel: 4, timeOfDay: 'night', metFriends: ['종로구'] };
  assert.throws(() => normalizeConditions(bad, { petIds }), (error) => {
    assert.ok(error instanceof ConditionError);
    assert.deepEqual(Object.keys(error.fields).sort(), ['departure', 'hours', 'metFriends', 'partySize', 'pet', 'timeOfDay', 'walkLevel']);
    return true;
  });
  assert.deepEqual(normalizeConditions({ ...demo, metFriends: ['jongno', 'jongno', 'mapo'] }, { petIds }).metFriends, ['jongno', 'mapo']);
});

test('the default departure time slot follows the Seoul clock', () => {
  assert.deepEqual([defaultTimeOfDay(9), defaultTimeOfDay(16), defaultTimeOfDay(17), defaultTimeOfDay(23), defaultTimeOfDay(3)], ['day', 'day', 'evening', 'evening', 'evening']);
});

test('pet flow screens open in order: 펫 → 조건 → 추천', () => {
  const nothing = { profileValid: false, comparisonReady: false, recommendationsReady: false, hasCourse: false };
  assert.equal(resolveScreen('pet', nothing), 'pet');
  assert.equal(resolveScreen('ai', nothing), 'pet', 'conditions need a pet');
  assert.equal(resolveScreen('ai', { petChosen: true }), 'ai');
  assert.equal(resolveScreen('ai-results', { petChosen: true }), 'ai');
  assert.equal(resolveScreen('ai-results', { petChosen: true, aiResultsReady: true }), 'ai-results');
  assert.deepEqual(['pet', 'ai', 'ai-results'].map(parentScreen), ['home', 'pet', 'ai']);
  assert.deepEqual(['pet', 'ai', 'ai-results'].map(navigationTab), ['discover', 'discover', 'discover']);
});

test('result copy says where the picks came from, marks times as estimates and dates reports', async () => {
  const { sourceNote, latestReportLine, kakaoPlaceUrl, minutesLabel, metFriends, seoulHour } = await import('../dist/ai-flow.mjs');
  assert.match(sourceNote({ source: 'ai', candidateCount: 20, pet: { name: '골든' } }), /후보 20곳 중에서 고른.*골든 말투/);
  assert.match(sourceNote({ source: 'rules', fallbackReason: 'not_configured' }), /설정되지 않아 목적·이동 부담·현장 소식 순서/);
  assert.match(sourceNote({ source: 'rules', fallbackReason: 'timeout' }), /10초를 넘겨/);
  assert.match(sourceNote({ source: 'mixed', fallbackReason: 'incomplete_response' }), /후보 밖의 곳/);
  assert.match(sourceNote({ source: 'rules', fallbackReason: 'no_candidates' }), /쓸 수 있는 시간 안에 다녀올 수 있는 곳을 찾지 못했어요/);
  assert.equal(minutesLabel(25), '약 25분(추정)');
  const now = Date.parse('2026-11-02T09:00:00Z');
  assert.equal(latestReportLine({ categoryLabel: '붐빔·대기', text: '대기 20분', createdAt: '2026-11-02T06:00:00Z' }, now), '붐빔·대기 · 3시간 전 (11. 2. 15:00) · 대기 20분');
  assert.match(latestReportLine(null), /아직 현장 소식이 없어요/);
  assert.equal(kakaoPlaceUrl({ name: '광장시장', lat: 37.57, lng: 126.9996 }), 'https://map.kakao.com/link/map/%EA%B4%91%EC%9E%A5%EC%8B%9C%EC%9E%A5,37.57,126.9996');
  const storage = (value) => ({ getItem: () => value });
  assert.deepEqual(metFriends(storage('["jongno",{"gu":"mapo"},{"gu":"jongno"},7]')), ['jongno', 'mapo'], 'ids or { gu } entries from the 도감');
  assert.deepEqual(metFriends(storage('not json')), []);
  assert.deepEqual(metFriends({ getItem() { throw new Error('blocked'); } }), []);
  assert.equal(seoulHour(new Date('2026-11-02T09:30:00Z')), 18);
});

test('D39: 30 minutes, 1 hour and a typed time from 30 minutes to 12 hours in 10-minute steps', () => {
  const fieldsOf = (raw) => { try { normalizeConditions({ ...demo, ...raw }, { petIds }); return {}; } catch (error) { return error.fields; } };
  for (const hours of [0.5, 1, 1 + 10 / 60, 5, 12]) assert.deepEqual(fieldsOf({ hours }), {}, String(hours));
  for (const hours of [0, 0.25, 1 + 5 / 60, 12.5, NaN]) assert.ok(fieldsOf({ hours }).hours, String(hours));
  assert.deepEqual([0.5, 1, 1.5, 2 + 10 / 60, 5, 8].map(durationLabel), ['30분', '1시간', '1시간 30분', '2시간 10분', '5시간', '하루']);
});

test('D39: a searched departure needs its name and a point inside Seoul, and reads with its own name', () => {
  const fieldsOf = (raw) => { try { normalizeConditions({ ...demo, ...raw }, { petIds }); return {}; } catch (error) { return error.fields; } };
  const here = normalizeConditions({ ...demo, departure: SEARCHED_PLACE, departureLabel: '  연남동 카페거리 ', location: { lat: 37.56212, lng: 126.92531 } }, { petIds });
  assert.deepEqual([here.departureLabel, here.location], ['연남동 카페거리', { lat: 37.562, lng: 126.925 }]);
  assert.deepEqual(departurePoint(here), { label: '연남동 카페거리', lat: 37.562, lng: 126.925 });
  assert.match(describeConditions(here, { petName: '골든' }), /연남동 카페거리 출발/);
  assert.ok(fieldsOf({ departure: SEARCHED_PLACE, location: { lat: 37.56, lng: 126.92 } }).departure, 'a name is needed');
  assert.match(fieldsOf({ departure: SEARCHED_PLACE, departureLabel: '부산역', location: { lat: 35.115, lng: 129.041 } }).departure, /서울 밖/);
});
