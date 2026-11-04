import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStatsStore } from '../scripts/stats.mjs';
import { createReportStore } from '../scripts/field-reports.mjs';
import { trending } from '../scripts/trending.mjs';
import { loadCatalog } from '../scripts/places.mjs';
import { createServer } from '../scripts/serve.mjs';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
const temp = () => fs.mkdtemp(path.join(os.tmpdir(), 'growing-travel-trending-'));
const writerA = 'tester-0000-0000-0001';
const writerB = 'tester-0000-0000-0002';

test('D41: daily counts add up over the last 7 Seoul days, old days are dropped and nothing else is kept', async () => {
  const dir = await temp();
  let clock = new Date('2026-11-04T03:00:00Z');
  const stats = createStatsStore({ file: path.join(dir, 'stats.json'), now: () => clock });
  await stats.recordPicks('golden', ['a', 'b']);
  await stats.recordPicks('shiba', ['a']);
  await stats.recordRoute('a');
  await stats.recordArrival('jung');
  assert.deepEqual(await stats.totals({ days: 7 }), { picks: { a: 2, b: 1 }, petPicks: { a: { golden: 1, shiba: 1 }, b: { golden: 1 } }, routes: { a: 1 }, arrivals: { jung: 1 } });
  clock = new Date('2026-11-10T03:00:00Z'); // the 7th Seoul day still counts 4 November
  assert.deepEqual((await stats.totals({ days: 7 })).arrivals, { jung: 1 });
  clock = new Date('2026-11-11T03:00:00Z'); // the 8th does not
  assert.deepEqual((await stats.totals({ days: 7 })).arrivals, {});
  clock = new Date('2026-11-13T03:00:00Z'); // the next write drops days older than 8
  await stats.recordArrival('mapo');
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'stats.json'), 'utf8'));
  assert.deepEqual(Object.keys(saved.days), ['2026-11-13']);
  assert.doesNotMatch(JSON.stringify(saved), /tester|lat|lng/, 'counts only');
  await fs.writeFile(path.join(dir, 'stats.json'), 'not json');
  assert.deepEqual(await stats.totals(), { picks: {}, petPicks: {}, routes: {}, arrivals: {} }, 'a broken file reads as empty');
});

test('D41: place activity: newest valid 한산함·붐빔, last week reports and confirmations, and when it woke', async () => {
  const dir = await temp();
  let clock = new Date('2026-11-01T03:00:00Z');
  const store = createReportStore({ file: path.join(dir, 'reports.json'), isKnownPlace: async () => true, now: () => clock });
  await store.create({ placeId: 'p1', category: 'tip', text: '뒷문이 덜 붐벼요', contributorId: writerA });
  clock = new Date('2026-11-04T03:00:00Z'); // 3 days of silence, then news: woke now
  const calm = await store.create({ placeId: 'p1', category: 'calm', text: '지금 한산해요', contributorId: writerA });
  await store.vote(calm.id, writerB, 'still');
  clock = new Date('2026-11-04T04:00:00Z');
  await store.create({ placeId: 'p1', category: 'crowd', text: '입구 대기 20분', contributorId: writerB });
  const { p1 } = await store.activity(['p1', 'p2'], { days: 7 });
  assert.equal(p1.calm.text, '지금 한산해요');
  assert.equal(p1.crowd.text, '입구 대기 20분');
  assert.deepEqual([p1.reports, p1.confirmations, p1.wokeAt], [3, 1, '2026-11-04T03:00:00.000Z']);
  clock = new Date('2026-11-04T08:00:00Z'); // both 3-hour reports have expired
  const later = (await store.activity(['p1'])).p1;
  assert.deepEqual([later.calm, later.crowd], [null, null]);
});

test('D41: one district in seven tabs, each holding only what this server has seen', async () => {
  const catalog = await loadCatalog(dataDir);
  const inJung = catalog.places.filter((place) => place.gu === 'jung').slice(0, 3);
  const now = Date.parse('2026-11-04T05:00:00Z');
  const activity = {
    [inJung[0].id]: { calm: { createdAt: '2026-11-04T04:30:00Z', text: '한산해요' }, crowd: null, reports: 2, confirmations: 3, wokeAt: '2026-11-04T04:30:00Z' },
    [inJung[1].id]: { calm: null, crowd: { createdAt: '2026-11-04T04:50:00Z', text: '대기 20분' }, reports: 1, confirmations: 0, wokeAt: '2026-11-01T00:00:00Z' },
  };
  const totals = { picks: { [inJung[2].id]: 3, [inJung[0].id]: 1 }, petPicks: { [inJung[2].id]: { corgi: 2, golden: 1 } }, routes: { [inJung[0].id]: 2 }, arrivals: { mapo: 4, jung: 2 } };
  const data = trending({ gu: 'jung', catalog, activity, totals, now });
  assert.deepEqual(data.tabs.calm.map((item) => item.place.id), [inJung[0].id]);
  assert.deepEqual(data.tabs.crowd.map((item) => item.text), ['대기 20분']);
  assert.deepEqual(data.tabs.woke.map((item) => item.place.id), [inJung[0].id], 'woke within the last day only');
  assert.deepEqual(data.tabs.reports.map((item) => [item.place.id, item.reports, item.confirmations]), [[inJung[0].id, 2, 3], [inJung[1].id, 1, 0]]);
  assert.deepEqual(data.tabs.picks[0].pets, [{ name: '코기', count: 2 }, { name: '골든', count: 1 }]);
  assert.deepEqual(data.tabs.routes.map((item) => item.routes), [2]);
  assert.deepEqual([data.districts.map((item) => item.name), data.current], [['마포구', '중구'], { arrivals: 2, rank: 2 }]);
  const quiet = trending({ gu: 'jongno', catalog, now });
  assert.ok(Object.values(quiet.tabs).every((list) => list.length === 0) && quiet.current.rank === null, 'no data, no padding');
});

test('D41: the API counts picks, first arrivals and route openings, and serves the tabs for a district', async () => {
  const work = await temp();
  for (const file of ['pets.json', 'districts.json', 'gu_friends.json', 'places.json']) await fs.copyFile(path.join(dataDir, file), path.join(work, file));
  await fs.cp(path.join(dataDir, 'boundaries'), path.join(work, 'boundaries'), { recursive: true });
  const server = createServer({ dataDir: work, aiProvider: { name: 'none', configured: false }, kakaoRestKey: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const picks = await (await post('/api/recommend', { conditions: { pet: 'corgi', departure: 'seoul', hours: 3, partySize: 1, walkLevel: 2, timeOfDay: 'day', metFriends: [] } })).json();
    const picked = picks.items.map((item) => item.place_id);
    const jung = picks.items.find((item) => item.place.gu === 'jung');
    assert.ok(jung, 'a 중구 pick to count');
    assert.equal((await post('/api/stats/route', { placeId: jung.place_id })).status, 200);
    assert.equal((await post('/api/stats/route', { placeId: 'nowhere' })).status, 404);
    await post('/api/arrival', { gu: 'jung', pet: 'corgi', location: null, arrived: true });
    await post('/api/arrival', { gu: 'jung', pet: 'corgi', location: null });
    const data = await (await fetch(`${base}/api/trending?gu=jung`)).json();
    assert.ok(data.tabs.picks.some((item) => item.place.id === jung.place_id && item.picks === 1 && item.pets[0].name === '코기'));
    assert.deepEqual(data.tabs.routes.map((item) => [item.place.id, item.routes]), [[jung.place_id, 1]]);
    assert.deepEqual(data.current, { arrivals: 1, rank: 1 }, 'the refresh without arrived: true is not counted');
    assert.ok(picked.length === 3);
    assert.equal((await fetch(`${base}/api/trending?gu=atlantis`)).status, 404);
  } finally { server.close(); }
});
