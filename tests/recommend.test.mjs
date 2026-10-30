import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaces } from '../scripts/places.mjs';
import { recommendPlaces, parseRecommendations, rankByRules, buildPrompt, RESPONSE_SCHEMA } from '../scripts/recommend.mjs';
import { providerFromEnv } from '../scripts/ai-provider.mjs';
import { createServer } from '../scripts/serve.mjs';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
const { places } = await loadPlaces(dataDir);
const demo = { departure: 'seoul', date: '2026-11-05', timeSlot: 'full_day', partySize: 2, walkLevel: 2, interests: ['카페', '역사'], ageGroup: '', studentStatus: 'unspecified' };
const fake = (reply) => ({ name: 'fake', model: 'fake-1', configured: true, calls: [], async complete(request) { this.calls.push(request); return typeof reply === 'function' ? reply(request) : reply; } });
const item = (place_id) => ({ place_id, reason: `${place_id} 이유`, route_summary: '서울역에서 3호선', caution: '출발 전 확인' });

test('AI picks are kept in order and enriched with place details', async () => {
  const provider = fake(JSON.stringify({ recommendations: ['seoul-ikseondong', 'seoul-bukchon', 'seoul-gyeongbokgung'].map(item) }));
  const result = await recommendPlaces({ conditions: demo, places, provider, reportSummaries: { 'seoul-bukchon': [{ categoryLabel: '현장 팁', text: '골목 조용해요', createdAt: '2026-10-30T01:00:00Z' }] } });
  assert.equal(result.source, 'ai');
  assert.deepEqual(result.items.map((entry) => entry.place_id), ['seoul-ikseondong', 'seoul-bukchon', 'seoul-gyeongbokgung']);
  assert.equal(result.items[0].place.name, '익선동 한옥거리');
  assert.equal(result.items[0].place.needs_check, true);
  assert.equal(result.items[1].latest_report.text, '골목 조용해요');
  const { user, system, schema } = provider.calls[0];
  assert.equal(schema, RESPONSE_SCHEMA);
  assert.match(system, /후보지 목록의 place_id 중에서만/);
  assert.match(user, /서울역 출발 · 11\/5\(목\) 하루 종일 · 2명/);
  assert.match(user, /골목 조용해요/, 'recent field reports go into the prompt');
  assert.ok(places.every((place) => user.includes(place.id)), 'every candidate is offered');
});

test('unknown or duplicate place ids are dropped and the rest is filled by rules', async () => {
  const provider = fake(JSON.stringify([item('seoul-ikseondong'), item('busan-haeundae'), item('seoul-ikseondong'), { place_id: 'seoul-bukchon', reason: '' }]));
  const result = await recommendPlaces({ conditions: demo, places, provider });
  assert.equal(result.source, 'mixed');
  assert.equal(result.dropped, 3);
  assert.equal(result.fallbackReason, 'incomplete_response');
  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items.map((entry) => entry.source), ['ai', 'rules', 'rules']);
  assert.equal(new Set(result.items.map((entry) => entry.place_id)).size, 3);
});

test('timeouts, provider errors, bad JSON and a missing key all fall back to rule ranking', async () => {
  const hanging = { name: 'slow', configured: true, complete: ({ signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) };
  const started = Date.now();
  const timedOut = await recommendPlaces({ conditions: demo, places, provider: hanging, timeoutMs: 50 });
  assert.ok(Date.now() - started < 2000);
  assert.deepEqual([timedOut.source, timedOut.fallbackReason, timedOut.items.length], ['rules', 'timeout', 3]);
  const failing = fake(() => { throw new Error('HTTP 500'); });
  assert.equal((await recommendPlaces({ conditions: demo, places, provider: failing })).fallbackReason, 'error');
  assert.equal((await recommendPlaces({ conditions: demo, places, provider: fake('죄송해요, 추천할 수 없어요') })).fallbackReason, 'invalid_response');
  const noKey = providerFromEnv({ AI_PROVIDER: 'anthropic' });
  assert.equal(noKey.configured, false);
  const offline = await recommendPlaces({ conditions: demo, places, provider: noKey });
  assert.deepEqual([offline.source, offline.fallbackReason], ['rules', 'not_configured']);
  assert.ok(offline.items.every((entry) => entry.reason && entry.route_summary && entry.caution));
  assert.match(offline.items[0].route_summary, /^서울역 출발 → .+지도 앱 길찾기로 확인해 주세요\.$/, 'the leg from the departure station is not invented');
  const nearStation = await recommendPlaces({ conditions: { ...demo, interests: ['야경'], walkLevel: 1 }, places: places.filter((place) => place.id === 'seoul-seoullo7017'), provider: noKey });
  assert.equal(nearStation.items[0].route_summary, places.find((place) => place.id === 'seoul-seoullo7017').access);
});

test('rule ranking follows interests, walking level and distance', () => {
  const top = rankByRules(demo, places).slice(0, 3).map(({ place }) => place);
  for (const place of top) assert.ok(place.tags.some((tag) => ['카페', '역사'].includes(tag)), place.id);
  assert.ok(top.every((place) => place.area.startsWith('서울')), 'nearby Seoul places beat far day trips with the same tags');
  const evening = rankByRules({ ...demo, timeSlot: 'evening', interests: ['야경'], walkLevel: 1 }, places).slice(0, 3).map(({ place }) => place);
  assert.ok(evening.every((place) => place.tags.includes('야경') && place.walk_level <= 2), evening.map((place) => place.id).join());
  const halfDay = rankByRules({ ...demo, timeSlot: 'morning', interests: ['자연'] }, places).slice(0, 3);
  assert.ok(halfDay.every(({ km }) => km <= 25), 'half-day slots skip far day trips');
});

test('parser accepts fenced JSON and rejects non-JSON', () => {
  assert.equal(parseRecommendations('```json\n{"recommendations":[]}\n```', places).invalid, false);
  assert.equal(parseRecommendations('not json', places).invalid, true);
  assert.ok(buildPrompt(demo, places, {}).length < 20000, 'prompt stays small');
});

test('provider selection reads only environment variables', () => {
  assert.deepEqual([providerFromEnv({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }).name, providerFromEnv({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }).model], ['anthropic', 'claude-opus-5-5']);
  assert.equal(providerFromEnv({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }).configured, false, 'OpenAI needs a model name');
  assert.equal(providerFromEnv({ AI_PROVIDER: 'school', SCHOOL_AI_BASE_URL: 'https://ai.example.ac.kr/v1', SCHOOL_AI_API_KEY: 'k', SCHOOL_AI_MODEL: 'm' }).configured, true);
  assert.throws(() => providerFromEnv({ AI_PROVIDER: 'gemini' }), /Unknown AI_PROVIDER/);
});

test('POST /api/recommend validates conditions and returns three places', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'gt-recommend-'));
  await fs.copyFile(path.join(dataDir, 'places.json'), path.join(temp, 'places.json'));
  const provider = fake(JSON.stringify({ recommendations: [item('seoul-ikseondong')] }));
  const server = createServer({ dataDir: temp, aiProvider: provider });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(`${base}/api/recommend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const invalid = await post({ conditions: { ...demo, interests: [] } });
    assert.equal(invalid.status, 400);
    assert.ok((await invalid.json()).error.fields.interests);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    const ok = await post({ conditions: { ...demo, date: today } });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.items.length, 3);
    assert.equal(body.items[0].place_id, 'seoul-ikseondong');
    assert.equal(body.source, 'mixed');
    assert.equal(JSON.stringify(body).includes('ANTHROPIC'), false);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
