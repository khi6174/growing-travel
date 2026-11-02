import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../scripts/places.mjs';
import { recommendPlaces, rankCandidates, parseRecommendations, buildPrompt, systemPrompt, estimateMinutes, oneWayBudget, RESPONSE_SCHEMA, CANDIDATE_COUNT, MAX_MINUTES } from '../scripts/recommend.mjs';
import { providerFromEnv } from '../scripts/ai-provider.mjs';
import { createServer } from '../scripts/serve.mjs';
import { SCENARIOS, scenarioConditions, checkScenario, runScenarios, scenarioTable } from '../scripts/scenarios.mjs';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
const catalog = await loadCatalog(dataDir);
const conditionsOf = (pet, departure, hours, partySize, walkLevel, timeOfDay = 'day') => ({ pet, departure, location: null, hours, partySize, walkLevel, timeOfDay, metFriends: [] });
const demo = conditionsOf('golden', 'hongik', 4, 2, 3);
const fake = (reply) => ({ name: 'fake', model: 'fake-1', configured: true, calls: [], async complete(request) { this.calls.push(request); return typeof reply === 'function' ? reply(request) : reply; } });
const item = (place_id, extra = {}) => ({ place_id, reason: `${place_id} 이유`, route_summary: '홍대입구역에서 약 10분(추정)', live_note: '', friend_hint: '', ...extra });
const top = (conditions, reports = {}) => rankCandidates(conditions, catalog, reports).slice(0, CANDIDATE_COUNT);
const report = (category, hours = 1, extra = {}) => ({ category, categoryLabel: { crowd: '붐빔·대기', facility: '시설·공사', tip: '현장 팁' }[category], text: `${category} 소식`, createdAt: new Date(Date.now() - hours * 3600_000).toISOString(), votes: { still: 0, gone: 0 }, lastConfirmedAt: null, active: true, ...extra });

// 명세 4: the ten scenarios. Pass = 3 picks, all purpose-tagged, all within 60 minutes, none outside the
// candidates, and a reason tied to the purpose. This runs the rule path; the AI path needs a key (명세 5).

test('travel time is a rounded straight-line estimate and the one-way budget is a quarter of the time', () => {
  assert.deepEqual([estimateMinutes(0), estimateMinutes(2), estimateMinutes(10), estimateMinutes(20)], [10, 15, 35, 60]);
  assert.deepEqual([oneWayBudget(2), oneWayBudget(3), oneWayBudget(4), oneWayBudget(8)], [30, 45, 60, 60]);
});

test('candidates are the top 20 places for the pet’s purpose within 60 minutes (app filter, not AI)', () => {
  const candidates = top(demo);
  assert.equal(candidates.length, CANDIDATE_COUNT);
  for (const { place, minutes, matched } of candidates) {
    assert.ok(place.purposes.includes('golden') && matched.length, place.id);
    assert.ok(minutes <= MAX_MINUTES, `${place.id} ${minutes}`);
  }
  assert.ok(candidates.every((entry, index) => index === 0 || candidates[index - 1].score >= entry.score), 'sorted by score');
  assert.ok(rankCandidates(demo, catalog).every(({ minutes }) => minutes <= MAX_MINUTES));
});

test('ranking follows purpose, then movement burden, then live reports, then unmet friends', () => {
  const easy = conditionsOf('baekgu', 'dongnimmun', 2, 1, 1);
  assert.ok(top(easy).slice(0, 3).some(({ place }) => place.id === 'seodaemun-prison-history'), 'a light-walk museum by the station is near the top');
  const first = top(demo)[0];
  const pushed = rankCandidates(demo, catalog, { [first.place.id]: [report('crowd')] });
  assert.ok(pushed.findIndex(({ place }) => place.id === first.place.id) > 2, 'an active long wait moves a place out of the top 3');
  const stale = top(demo, { [first.place.id]: [report('crowd', 5, { active: false })] });
  assert.equal(stale[0].place.id, first.place.id, 'an expired wait report no longer counts');
  const tip = top(demo, { [first.place.id]: [report('tip')] });
  assert.equal(tip[0].place.id, first.place.id, 'a tip is not a caution');
  const met = rankCandidates({ ...demo, metFriends: [first.place.gu] }, catalog).find(({ place }) => place.id === first.place.id);
  assert.equal(Number((first.score - met.score).toFixed(6)), 0.5, 'an unmet friend only adds a tie-breaking half point');
  const evening = top(conditionsOf('bichon', 'yeouido', 2, 2, 2, 'evening')).slice(0, 5);
  assert.ok(evening.some(({ place }) => place.tags.includes('night_view')), 'evening favors night views for 비숑');
});

for (const [index, [pet, departure, hours, partySize, walkLevel, timeOfDay]] of SCENARIOS.entries()) {
  test(`spec scenario ${index + 1}: ${pet} from ${departure} passes on the rule path`, async () => {
    const conditions = conditionsOf(pet, departure, hours, partySize, walkLevel, timeOfDay);
    const result = await recommendPlaces({ conditions, catalog, provider: providerFromEnv({ AI_PROVIDER: 'none' }) });
    const candidates = new Set(top(conditions).map(({ place }) => place.id));
    const tags = catalog.pets.find((item) => item.id === pet).tags.map((tag) => catalog.tagLabels[tag]);
    assert.equal(result.items.length, 3);
    for (const entry of result.items) {
      assert.ok(candidates.has(entry.place_id), `${entry.place_id} is a candidate`);
      assert.ok(catalog.places.find((place) => place.id === entry.place_id).purposes.includes(pet), `${entry.place_id} fits ${pet}`);
      assert.ok(entry.minutes <= 60 && entry.minutesEstimated, `${entry.place_id} ${entry.minutes}`);
      assert.ok(tags.some((label) => entry.reason.includes(label)), `reason names the purpose: ${entry.reason}`);
      assert.ok(entry.route_summary.includes(`약 ${entry.minutes}분(추정)`) || entry.route_summary.startsWith(entry.place.nearest_station), entry.route_summary);
      assert.match(entry.friend_hint, /동네 친구 ‘.+’(을|를) 만날 수 있어요\.$/);
    }
  });
}

test('the 단계 4 runner sends all ten scenarios through the API and reports each pass rule', async () => {
  const rows = await runScenarios({ provider: providerFromEnv({ AI_PROVIDER: 'none' }) });
  assert.equal(rows.length, 10);
  assert.ok(rows.every((row) => row.pass && row.source === 'rules' && row.fallbackReason === 'not_configured'), JSON.stringify(rows.filter((row) => !row.pass).map((row) => row.index)));
  const table = scenarioTable(rows);
  assert.equal(table.split('\n').length, 12);
  assert.ok(!table.includes('실패'));
});

test('the scenario check catches a pick of another purpose, one too far, one outside the 20 and a reason without the purpose', () => {
  const conditions = scenarioConditions(SCENARIOS[4]);
  const fits = top(conditions);
  const other = catalog.places.find((place) => !place.purposes.includes('corgi'));
  const outside = rankCandidates(conditions, catalog).at(-1).place;
  const picks = [
    { place_id: other.id, minutes: 20, reason: '시장 냄새가 나요' },
    { place_id: fits[0].place.id, minutes: 75, reason: '시장 구경' },
    { place_id: outside.id, minutes: 30, reason: '노포 맛집' },
  ];
  const { items, pass } = checkScenario(conditions, { items: picks }, catalog);
  assert.equal(pass, false);
  assert.deepEqual(items.map((item) => Object.entries(item.checks).filter(([, ok]) => !ok).map(([key]) => key)), [['purpose', 'candidate'], ['within60'], ['candidate']]);
  assert.equal(checkScenario(conditions, { items: [{ ...picks[1], minutes: 20, reason: '오늘은 쉬어요' }] }, catalog).items[0].checks.reason, false);
});

test('AI picks are kept in order with the pet’s voice, reports and friends offered as data', async () => {
  const candidates = top(demo);
  const [a, b, c] = candidates.map(({ place }) => place.id);
  const reports = { [b]: [report('tip')] };
  const provider = fake(JSON.stringify({ recommendations: [item(a), item(b, { live_note: '최근 제보에 따르면 한산했어요' }), item(c, { live_note: '지어낸 소식', friend_hint: '엉뚱한 친구를 만나요' })] }));
  const result = await recommendPlaces({ conditions: demo, catalog, provider, reportSummaries: reports });
  assert.equal(result.source, 'ai');
  assert.deepEqual(result.items.map((entry) => entry.place_id), [a, b, c]);
  assert.equal(result.items[1].live_note, '최근 제보에 따르면 한산했어요');
  assert.equal(result.items[2].live_note, '', 'no active report, no live note');
  assert.equal(result.items[2].friend_hint.includes(candidates[2].friend.name), true, 'a friend the data does not back is replaced');
  const { system, user, schema } = provider.calls[0];
  assert.equal(schema, RESPONSE_SCHEMA);
  assert.equal(system, systemPrompt(catalog.pets[0]));
  assert.match(system, /골든.*활동.*신나고 에너지 넘침/s);
  assert.match(system, /1\. 여행 목적.*2\. 이동 부담.*3\. 현장 소식.*4\. 아직 못 만난 동네 친구/s);
  assert.match(user, /골든과 함께 · 홍대입구역 출발 · 4시간 · 2명 · 많이 걷기 · 낮/);
  const offered = JSON.parse(user.split('\n').find((line) => line.startsWith('[')));
  assert.equal(offered.length, CANDIDATE_COUNT, 'only the 20 candidates are sent');
  assert.ok(offered.every((entry) => entry.minutes_est <= 60 && entry.friend.name));
  assert.equal(offered.find((entry) => entry.place_id === b).live_reports[0].text, 'tip 소식');
});

test('ids outside the 20 candidates, duplicates and empty items are dropped and rules fill the rest', async () => {
  const candidates = new Set(top(demo).map(({ place }) => place.id));
  const outside = catalog.places.find((place) => place.purposes.includes('golden') && !candidates.has(place.id)).id;
  const first = [...candidates][0];
  const provider = fake(JSON.stringify([item(first), item(outside), item('busan-haeundae'), item(first), { place_id: [...candidates][1], reason: '' }]));
  const result = await recommendPlaces({ conditions: demo, catalog, provider });
  assert.deepEqual([result.source, result.dropped, result.fallbackReason, result.items.length], ['mixed', 4, 'incomplete_response', 3]);
  assert.deepEqual(result.items.map((entry) => entry.source), ['ai', 'rules', 'rules']);
  assert.ok(result.items.every((entry) => candidates.has(entry.place_id)));
  assert.equal(new Set(result.items.map((entry) => entry.place_id)).size, 3);
  assert.equal(parseRecommendations('```json\n{"recommendations":[]}\n```', candidates).invalid, false);
  assert.equal(parseRecommendations('not json', candidates).invalid, true);
});

test('timeouts, provider errors, bad JSON and a missing key all fall back to rule ranking', async () => {
  const hanging = { name: 'slow', configured: true, complete: ({ signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) };
  const started = Date.now();
  const timedOut = await recommendPlaces({ conditions: demo, catalog, provider: hanging, timeoutMs: 50 });
  assert.ok(Date.now() - started < 2000);
  assert.deepEqual([timedOut.source, timedOut.fallbackReason, timedOut.items.length], ['rules', 'timeout', 3]);
  assert.equal((await recommendPlaces({ conditions: demo, catalog, provider: fake(() => { throw new Error('HTTP 500'); }) })).fallbackReason, 'error');
  assert.equal((await recommendPlaces({ conditions: demo, catalog, provider: fake('죄송해요, 추천할 수 없어요') })).fallbackReason, 'invalid_response');
  const noKey = providerFromEnv({ AI_PROVIDER: 'anthropic' });
  assert.equal(noKey.configured, false);
  const offline = await recommendPlaces({ conditions: demo, catalog, provider: noKey });
  assert.deepEqual([offline.source, offline.fallbackReason], ['rules', 'not_configured']);
  assert.match(offline.items[0].reason, /^우와, .+! .+ 코스라 몸 풀기 딱이야\. 신나게 같이 걸어 보자!$/, 'the rule reason keeps the pet’s voice');
});

test('rule notes come from data: active reports only, no invented legs from the departure station', async () => {
  const conditions = conditionsOf('golden', 'hongik', 2, 1, 2);
  const first = top(conditions)[0];
  const withTip = await recommendPlaces({ conditions, catalog, provider: null, reportSummaries: { [first.place.id]: [report('tip')] } });
  assert.equal(withTip.items[0].live_note, '최근 제보: 현장 팁 · tip 소식');
  assert.equal(withTip.items[0].latest_report.text, 'tip 소식');
  const near = withTip.items.find((entry) => entry.place.nearest_station.startsWith('홍대입구역'));
  if (near) assert.equal(near.route_summary, `${near.place.nearest_station} ${near.place.access_summary}`);
  const met = await recommendPlaces({ conditions: { ...conditions, metFriends: catalog.districts.map((district) => district.id) }, catalog, provider: null });
  assert.ok(met.items.every((entry) => entry.friend_hint === '' && entry.friend.met));
});

test('no candidates within 60 minutes returns an empty, explained result', async () => {
  const farCatalog = { ...catalog, places: catalog.places.filter((place) => place.gu === 'gangdong') };
  const result = await recommendPlaces({ conditions: { ...demo, pet: 'corgi', departure: 'current', location: { lat: 37.575, lng: 126.79 } }, catalog: farCatalog, provider: fake('{}') });
  assert.deepEqual([result.items.length, result.fallbackReason, result.candidateCount], [0, 'no_candidates', 0]);
});

test('the prompt stays small and provider selection reads only environment variables', () => {
  assert.ok(buildPrompt(demo, catalog, top(demo)).length < 20000, 'prompt stays small');
  assert.deepEqual([providerFromEnv({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }).name, providerFromEnv({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }).model], ['anthropic', 'claude-opus-5-5']);
  assert.equal(providerFromEnv({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }).configured, false, 'OpenAI needs a model name');
  assert.equal(providerFromEnv({ AI_PROVIDER: 'school', SCHOOL_AI_BASE_URL: 'https://ai.example.ac.kr/v1', SCHOOL_AI_API_KEY: 'k', SCHOOL_AI_MODEL: 'm' }).configured, true);
  assert.throws(() => providerFromEnv({ AI_PROVIDER: 'gemini' }), /Unknown AI_PROVIDER/);
});

test('GET /api/catalog and POST /api/recommend validate and answer without exposing keys or places', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'gt-recommend-'));
  for (const file of ['pets.json', 'districts.json', 'gu_friends.json', 'places.json']) await fs.copyFile(path.join(dataDir, file), path.join(temp, file));
  const first = top(demo)[0].place.id;
  const provider = fake(JSON.stringify({ recommendations: [item(first)] }));
  const server = createServer({ dataDir: temp, aiProvider: provider });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(`${base}/api/recommend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const catalogBody = await (await fetch(`${base}/api/catalog`)).json();
    assert.deepEqual([catalogBody.pets.length, catalogBody.districts.length, catalogBody.friends.length], [5, 25, 25]);
    assert.equal(catalogBody.places, undefined);
    assert.deepEqual(catalogBody.pets[0].tags, ['공원', '한강', '산책로', '전망 산책']);
    const invalid = await post({ conditions: { ...demo, pet: 'cat' } });
    assert.equal(invalid.status, 400);
    assert.ok((await invalid.json()).error.fields.pet);
    const ok = await post({ conditions: { ...demo, metFriends: ['jongno', 'nowhere'] } });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.deepEqual([body.items.length, body.items[0].place_id, body.source, body.pet.name], [3, first, 'mixed', '골든']);
    assert.equal(JSON.stringify(body).includes('ANTHROPIC'), false);
    assert.equal(provider.calls.length, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
