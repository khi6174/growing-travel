import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeState, livingMap, WAKE_HOURS } from '../scripts/living-map.mjs';
import { loadCatalog } from '../scripts/places.mjs';
import { createServer, contentSecurityPolicy, kakaoKeyFrom } from '../scripts/serve.mjs';
import { resolveScreen, parentScreen } from '../dist/navigation.mjs';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
const catalog = await loadCatalog(dataDir);
const now = Date.parse('2026-11-02T12:00:00.000Z');
const hoursAgo = (hours) => new Date(now - hours * 3600_000).toISOString();
const report = (extra) => ({ category: 'crowd', categoryLabel: '붐빔·대기', text: '대기 20분', createdAt: hoursAgo(1), lastConfirmedAt: null, expiresAt: hoursAgo(-2), active: true, votes: { still: 0, gone: 0 }, ...extra });
const KEY = '0123456789abcdef0123456789abcdef';

test('a valid report is live, an expired one fades for 48 hours, then the place sleeps until the next report', () => {
  assert.equal(placeState([report()], now).state, 'live');
  const expired = report({ createdAt: hoursAgo(5), expiresAt: hoursAgo(2), active: false });
  assert.deepEqual([placeState([expired], now).state, placeState([expired], now).report.text], ['fading', '대기 20분']);
  assert.equal(placeState([report({ createdAt: hoursAgo(WAKE_HOURS + 1), active: false })], now).state, 'sleeping');
  assert.deepEqual(placeState([], now), { state: 'sleeping', report: null, lastNewsAt: null });
  assert.equal(placeState(undefined, now).state, 'sleeping', 'never reported');
  // "아직 그래요" keeps news fresh: the newest of created and confirmed times counts.
  const confirmed = report({ createdAt: hoursAgo(60), lastConfirmedAt: hoursAgo(10), active: false });
  assert.deepEqual([placeState([confirmed], now).state, placeState([confirmed], now).lastNewsAt], ['fading', hoursAgo(10)]);
  // A long-lived tip stays a bubble while valid; the latest active report wins over an older expired one.
  const tip = report({ category: 'tip', categoryLabel: '현장 팁', text: '뒷문이 덜 붐벼요', createdAt: hoursAgo(100), expiresAt: hoursAgo(-500) });
  assert.equal(placeState([report({ createdAt: hoursAgo(4), active: false }), tip], now).report.text, '뒷문이 덜 붐벼요');
});

test('the living map lists every place with its state and only the report fields it shows', () => {
  const at = catalog.places[0];
  const map = livingMap(catalog, { [at.id]: [report()] }, now);
  assert.equal(map.places.length, catalog.places.length);
  assert.equal(map.wakeHours, 48);
  const first = map.places.find((place) => place.id === at.id);
  assert.equal(first.state, 'live');
  assert.deepEqual(Object.keys(first.report).sort(), ['active', 'category', 'categoryLabel', 'createdAt', 'expiresAt', 'text']);
  assert.ok(first.guName && first.purposes.length && typeof first.lat === 'number');
  assert.ok(map.places.filter((place) => place.id !== at.id).every((place) => place.state === 'sleeping' && place.report === null));
});

test('map screen always opens and goes back home', () => {
  assert.equal(resolveScreen('map', {}), 'map');
  assert.equal(parentScreen('map'), 'home');
});

test('Kakao hosts and the origin referrer are allowed only when a valid key is set', async () => {
  assert.equal(kakaoKeyFrom(KEY), KEY);
  for (const bad of [undefined, '', 'short', `${KEY}0`, 'g'.repeat(32)]) assert.equal(kakaoKeyFrom(bad), null, String(bad));
  assert.doesNotMatch(contentSecurityPolicy(null), /kakao|daumcdn/);
  assert.match(contentSecurityPolicy(KEY), /script-src 'self' dapi\.kakao\.com \*\.kakaocdn\.net \*\.daumcdn\.net;/);
  assert.match(contentSecurityPolicy(KEY), /img-src 'self' data: dapi\.kakao\.com \*\.kakaocdn\.net \*\.daumcdn\.net;/);
  assert.match(contentSecurityPolicy(KEY), /style-src 'self';/);

  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'growing-travel-map-'));
  for (const file of ['pets.json', 'districts.json', 'gu_friends.json', 'places.json']) await fs.copyFile(path.join(dataDir, file), path.join(work, file));
  const withKey = createServer({ dataDir: work, kakaoJsKey: KEY });
  const without = createServer({ dataDir: work, kakaoJsKey: null });
  await Promise.all([withKey, without].map((server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))));
  const base = (server) => `http://127.0.0.1:${server.address().port}`;
  try {
    const keyed = await fetch(`${base(withKey)}/api/map-config`);
    assert.deepEqual(await keyed.json(), { kakaoJsKey: KEY });
    assert.equal(keyed.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.match(keyed.headers.get('content-security-policy'), /dapi\.kakao\.com/);
    const plain = await fetch(`${base(without)}/api/map-config`);
    assert.deepEqual(await plain.json(), { kakaoJsKey: null });
    assert.equal(plain.headers.get('referrer-policy'), 'no-referrer');

    const at = catalog.places.find((place) => place.id === 'seoul-gwangjang-market');
    const created = await fetch(`${base(without)}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Contributor-Id': 'tester-0002' }, body: JSON.stringify({ placeId: at.id, category: 'calm', text: '지금 한산해요.' }) });
    assert.equal(created.status, 201);
    const map = await (await fetch(`${base(without)}/api/map`)).json();
    const market = map.places.find((place) => place.id === at.id);
    assert.deepEqual([market.state, market.report.categoryLabel], ['live', '한산함'], 'a new report wakes the place up');
    assert.equal(map.places.filter((place) => place.state === 'live').length, 1);
  } finally {
    await Promise.all([withKey, without].map((server) => new Promise((resolve) => server.close(resolve))));
    await fs.rm(work, { recursive: true, force: true });
  }
});
