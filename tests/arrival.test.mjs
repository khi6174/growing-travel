import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { districtChange, readFriendLog, recordFriend, ANSWERS, FRIENDS_KEY, MAX_ACCURACY_M } from '../dist/district-arrival.mjs';
import { resolveScreen, parentScreen } from '../dist/navigation.mjs';
import { metFriends } from '../dist/ai-flow.mjs';
import { arrivalInfo, normalizeArrival, QUESTION_RADIUS_KM } from '../scripts/arrival.mjs';
import { loadCatalog, loadBoundaries } from '../scripts/places.mjs';
import { createServer, lanAddresses, isPrivateAddress } from '../scripts/serve.mjs';
import { REPORT_CATEGORIES, REPORT_VALID_HOURS, CAUTION_CATEGORIES } from '../scripts/field-reports.mjs';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
const catalog = await loadCatalog(dataDir);
const codeToGu = new Map(catalog.districts.map((district) => [district.boundary_code, district.id]));
const features = (await loadBoundaries(dataDir)).map((feature) => ({ ...feature, properties: { gu: codeToGu.get(feature.properties.code) } }));
const place = (id) => catalog.places.find((item) => item.id === id);
const memory = (initial = null) => { const data = new Map(initial === null ? [] : [[FRIENDS_KEY, initial]]); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data }; };

test('the first fix inside Seoul is an arrival, staying is not, and a new district is', () => {
  const palace = place('seoul-gyeongbokgung');
  assert.deepEqual(districtChange(palace, { features }), { gu: 'jongno', arrived: true });
  assert.deepEqual(districtChange(palace, { features, current: 'jongno' }), { gu: 'jongno', arrived: false });
  assert.deepEqual(districtChange(place('seoul-national-museum'), { features, current: 'jongno' }), { gu: 'yongsan', arrived: true });
});

test('vague fixes, border jitter and points outside Seoul do not announce a district', () => {
  const palace = place('seoul-gyeongbokgung');
  assert.equal(districtChange(palace, { features, accuracy: MAX_ACCURACY_M + 1, current: 'jung' }).arrived, false, 'a 300 m+ fix cannot tell districts apart');
  assert.equal(districtChange(palace, { features, accuracy: Number.NaN }).reason, 'inaccurate');
  // 청계광장 sits on the 종로·중구 line: within 200 m of 종로 it stays 종로 even if the point falls in 중구.
  const plaza = place('jung-cheonggyecheon');
  assert.equal(districtChange(plaza, { features, current: 'jongno' }).arrived, false);
  assert.deepEqual(districtChange({ lat: 37.8813, lng: 127.7298 }, { features, current: 'jongno' }), { gu: null, arrived: false, reason: 'outside' });
});

test('the 도감 keeps the first meeting, reads older entries and refuses nothing silently', () => {
  const storage = memory('["jongno",{"gu":"mapo"},{"gu":"jongno"},7]');
  assert.deepEqual(readFriendLog(storage).map((entry) => entry.gu), ['jongno', 'mapo']);
  const first = recordFriend({ gu: 'gangnam', friend: 'yuribit', metAt: '2026-11-02T10:00:00.000Z', answer: 'calm' }, storage);
  assert.equal(first.added, true);
  assert.equal(recordFriend({ gu: 'gangnam', friend: 'yuribit', metAt: '2026-11-03T10:00:00.000Z', answer: 'busy' }, storage).added, false);
  assert.deepEqual(readFriendLog(storage).at(-1), { gu: 'gangnam', friend: 'yuribit', metAt: '2026-11-02T10:00:00.000Z', answer: 'calm' });
  assert.deepEqual(metFriends(storage), ['jongno', 'mapo', 'gangnam'], 'the recommendation reads the same log');
  assert.throws(() => recordFriend({ gu: 'jung' }, { getItem: () => null, setItem() { throw new Error('quota'); } }));
  assert.deepEqual(readFriendLog({ getItem() { throw new Error('blocked'); } }), []);
});

test('answers map to shared reports only when they say something, and 한산함 is not a caution', () => {
  assert.deepEqual(Object.values(ANSWERS).map((answer) => answer.category), ['crowd', 'calm', null]);
  assert.equal(REPORT_CATEGORIES.calm, '한산함');
  assert.equal(REPORT_VALID_HOURS.calm, 3);
  assert.ok(!CAUTION_CATEGORIES.includes('calm'));
});

test('arrival and 도감 screens open only when they have something to show', () => {
  assert.equal(resolveScreen('arrival', {}), 'home');
  assert.equal(resolveScreen('arrival', { arrivalReady: true }), 'arrival');
  assert.equal(resolveScreen('dex', {}), 'dex');
  assert.deepEqual([parentScreen('arrival'), parentScreen('dex')], ['home', 'home']);
});

test('arrival info: the friend, purpose picks nearest first, a question only within 500 m, active reports only', () => {
  const at = place('seoul-gwangjang-market');
  const now = new Date().toISOString();
  const reports = { [at.id]: [{ category: 'crowd', categoryLabel: '붐빔·대기', text: '대기 40분', createdAt: now, active: true }], 'seoul-changdeokgung': [{ category: 'tip', categoryLabel: '현장 팁', text: '오래된 소식', createdAt: now, active: false }] };
  const info = arrivalInfo(normalizeArrival({ gu: 'jongno', pet: 'corgi', location: { lat: at.lat, lng: at.lng } }, catalog), catalog, reports);
  assert.equal(info.friend.name, catalog.friends.find((friend) => friend.gu === 'jongno').name);
  assert.deepEqual([info.district.name, info.district.region, info.district.regionName], ['종로구', 'dosim', '도심권']);
  assert.equal(info.places.length, catalog.places.filter((item) => item.gu === 'jongno').length);
  assert.ok(info.places.every((item, index) => index === 0 || item.distanceKm >= info.places[index - 1].distanceKm), 'nearest first');
  assert.equal(info.picks[0], at.id);
  assert.ok(info.picks.every((id) => place(id).purposes.includes('corgi')));
  assert.equal(info.question_place_id, at.id);
  assert.deepEqual(info.reports.map((report) => [report.place_name, report.text]), [['광장시장', '대기 40분']]);
  assert.equal(info.places[0].latest_report.text, '대기 40분');
  const far = arrivalInfo(normalizeArrival({ gu: 'jongno', location: { lat: 37.6, lng: 126.958 } }, catalog), catalog, {});
  assert.ok(far.places[0].distanceKm > QUESTION_RADIUS_KM);
  assert.equal(far.question_place_id, null, 'too far from every place to ask what it looks like now');
  assert.deepEqual(far.picks, [], 'no pet, no purpose picks');
  for (const bad of [{ gu: 'busan' }, { gu: 'jongno', pet: 'cat' }, { gu: 'jongno', location: { lat: 35.1, lng: 129 } }, { gu: 'jongno', location: { lat: 'x', lng: 1 } }]) {
    assert.throws(() => normalizeArrival(bad, catalog), { name: 'ArrivalError' });
  }
});

test('the API serves district outlines and arrival info, and takes a 한산함 report', async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'growing-travel-arrival-'));
  for (const file of ['pets.json', 'districts.json', 'gu_friends.json', 'places.json']) await fs.copyFile(path.join(dataDir, file), path.join(work, file));
  await fs.mkdir(path.join(work, 'boundaries'));
  await fs.copyFile(path.join(dataDir, 'boundaries', 'seoul_gu_kostat2013_simple.geojson'), path.join(work, 'boundaries', 'seoul_gu_kostat2013_simple.geojson'));
  const server = createServer({ dataDir: work });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body, headers = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    const outlines = await (await fetch(`${base}/api/boundaries`)).json();
    assert.equal(outlines.features.length, 25);
    assert.deepEqual(new Set(outlines.features.map((feature) => feature.properties.gu)), new Set(catalog.districts.map((district) => district.id)));
    const at = place('seoul-gwangjang-market');
    const created = await post('/api/reports', { placeId: at.id, category: 'calm', text: ANSWERS.calm.text }, { 'X-Contributor-Id': 'tester-0001' });
    assert.equal(created.status, 201);
    const info = await (await post('/api/arrival', { gu: 'jongno', pet: 'corgi', location: { lat: at.lat, lng: at.lng } })).json();
    assert.equal(info.question_place_id, at.id);
    assert.equal(info.reports[0].categoryLabel, '한산함');
    const bad = await post('/api/arrival', { gu: 'busan' });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error.code, 'INVALID_ARRIVAL');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(work, { recursive: true, force: true });
  }
});

// Calls the server's request handler directly so the remote address can be a phone on the same Wi-Fi.
async function call(server, { url = '/', host, remoteAddress = '192.168.0.23', cookie } = {}) {
  const [handler] = server.listeners('request');
  return new Promise((resolve) => {
    const headers = {};
    const res = { statusCode: 200, setHeader: (key, value) => { headers[key.toLowerCase()] = value; }, writeHead(status, extra = {}) { this.statusCode = status; for (const [key, value] of Object.entries(extra)) headers[key.toLowerCase()] = value; }, end: (body) => resolve({ status: res.statusCode, headers, body: String(body ?? '') }) };
    handler({ url, method: 'GET', headers: { host, ...(cookie ? { cookie } : {}) }, socket: { remoteAddress } }, res);
  });
}

test('the phone demo answers only on this computer’s addresses and only after the access code', async () => {
  const server = createServer({ hosts: ['127.0.0.1', 'localhost', '192.168.0.10'], accessCode: 'code1234' });
  assert.equal((await call(server, { host: 'evil.example:4443' })).status, 403, 'another host name is refused');
  assert.equal((await call(server, { host: '192.168.0.10:4443' })).status, 403, 'no code yet');
  const entered = await call(server, { host: '192.168.0.10:4443', url: '/?code=code1234' });
  assert.equal(entered.status, 303);
  assert.equal(entered.headers.location, '/');
  assert.match(entered.headers['set-cookie'], /^gt_access=code1234; Path=\/; HttpOnly; SameSite=Strict/);
  assert.equal((await call(server, { host: '192.168.0.10:4443', url: '/?code=wrong' })).status, 403);
  const page = await call(server, { host: '192.168.0.10:4443', cookie: 'other=1; gt_access=code1234' });
  assert.equal(page.status, 200);
  assert.equal((await call(server, { host: '127.0.0.1:4443', remoteAddress: '127.0.0.1' })).status, 200, 'this computer needs no code');
  assert.equal((await call(createServer(), { host: '192.168.0.10:4173', remoteAddress: '127.0.0.1' })).status, 403, 'the default server keeps loopback names only');
  assert.deepEqual(lanAddresses({ lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }], wifi: [{ family: 'IPv6', internal: false, address: 'fe80::1' }, { family: 'IPv4', internal: false, address: '192.168.0.10' }] }), ['192.168.0.10']);
  assert.deepEqual(['192.168.0.10', '10.1.2.3', '172.20.0.1', '172.121.245.162'].map(isPrivateAddress), [true, true, true, false]);
});
