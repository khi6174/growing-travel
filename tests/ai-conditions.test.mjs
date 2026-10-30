import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConditions, describeConditions, ConditionError, PLACE_TAGS } from '../dist/ai-conditions.mjs';
import { resolveScreen, parentScreen, navigationTab } from '../dist/navigation.mjs';
import { PLACE_TAGS as DATA_TAGS } from '../scripts/places.mjs';

const today = '2026-10-30';
const demo = { departure: 'seoul', date: '2026-11-05', timeSlot: 'full_day', partySize: 2, walkLevel: 2, interests: ['카페', '역사'], ageGroup: '20s_early', studentStatus: 'student' };

test('demo scenario conditions normalize and read as one line', () => {
  const conditions = normalizeConditions(demo, { today });
  assert.deepEqual(conditions, demo);
  assert.equal(describeConditions(conditions), '서울역 출발 · 11/5(목) 하루 종일 · 2명 · 적당히 걷기 · 카페·역사 · 20대 초반 대학생');
  assert.equal(describeConditions({ ...conditions, partySize: 1, ageGroup: '', studentStatus: 'unspecified' }), '서울역 출발 · 11/5(목) 하루 종일 · 혼자 · 적당히 걷기 · 카페·역사');
});

test('optional age and student status default to not answered', () => {
  const { ageGroup, studentStatus, ...required } = demo;
  assert.deepEqual([normalizeConditions(required, { today }).ageGroup, normalizeConditions(required, { today }).studentStatus], ['', 'unspecified']);
});

test('every invalid field is reported together', () => {
  const bad = { departure: 'busan', date: '2026-10-29', timeSlot: 'night', partySize: 0, walkLevel: 4, interests: [], ageGroup: '50s', studentStatus: 'yes' };
  assert.throws(() => normalizeConditions(bad, { today }), (error) => {
    assert.ok(error instanceof ConditionError);
    assert.deepEqual(Object.keys(error.fields).sort(), ['ageGroup', 'date', 'departure', 'interests', 'partySize', 'studentStatus', 'timeSlot', 'walkLevel']);
    return true;
  });
});

test('date window, impossible dates and interest limits are enforced', () => {
  const fieldsOf = (raw) => { try { normalizeConditions({ ...demo, ...raw }, { today }); return {}; } catch (error) { return error.fields; } };
  assert.deepEqual(fieldsOf({ date: today }), {});
  assert.ok(fieldsOf({ date: '2026-02-30' }).date);
  assert.ok(fieldsOf({ date: '2027-03-01' }).date, 'more than 90 days ahead');
  assert.ok(fieldsOf({ interests: ['카페', '시장', '자연', '역사', '문화'] }).interests);
  assert.ok(fieldsOf({ interests: ['놀이공원'] }).interests);
  assert.ok(fieldsOf({ partySize: 2.5 }).partySize);
});

test('AI conditions screen is reachable from home without the course steps', () => {
  const unavailable = { profileValid: false, comparisonReady: false, recommendationsReady: false, hasCourse: false };
  assert.equal(resolveScreen('ai', unavailable), 'ai');
  assert.equal(parentScreen('ai'), 'home');
  assert.equal(navigationTab('ai'), 'discover');
  assert.equal(DATA_TAGS, PLACE_TAGS, 'places.json and the form share one tag list');
});

test('results screen opens only after a recommendation and goes back to the conditions', () => {
  assert.equal(resolveScreen('ai-results'), 'ai');
  assert.equal(resolveScreen('ai-results', { aiResultsReady: true }), 'ai-results');
  assert.equal(parentScreen('ai-results'), 'ai');
  assert.equal(navigationTab('ai-results'), 'discover');
});

test('result copy explains where the picks came from and dates the latest report', async () => {
  const { sourceNote, latestReportLine, kakaoPlaceUrl } = await import('../dist/ai-flow.mjs');
  assert.match(sourceNote({ source: 'ai' }), /AI가 후보지 중에서 고른/);
  assert.match(sourceNote({ source: 'rules', fallbackReason: 'not_configured' }), /설정되지 않아/);
  assert.match(sourceNote({ source: 'rules', fallbackReason: 'timeout' }), /늦어/);
  assert.match(sourceNote({ source: 'mixed', fallbackReason: 'incomplete_response' }), /후보 목록에 없는/);
  const now = Date.parse('2026-10-30T09:00:00Z');
  assert.equal(latestReportLine({ categoryLabel: '붐빔·대기', text: '대기 20분', createdAt: '2026-10-30T06:00:00Z' }, now), '붐빔·대기 · 3시간 전 (10. 30. 15:00) · 대기 20분');
  assert.match(latestReportLine(null), /아직 현장 소식이 없어요/);
  assert.equal(kakaoPlaceUrl({ name: '광장시장', lat: 37.57, lng: 126.9996 }), 'https://map.kakao.com/link/map/%EA%B4%91%EC%9E%A5%EC%8B%9C%EC%9E%A5,37.57,126.9996');
});
