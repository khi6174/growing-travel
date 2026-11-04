import test from 'node:test';
import assert from 'node:assert/strict';
import { toKmaGrid, baseTimes, conditionFrom, createWeather } from '../scripts/weather.mjs';
import { createServer } from '../scripts/serve.mjs';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const kma = (item) => json({ response: { header: { resultCode: '00' }, body: { items: { item } } } });
const ncst = (pty, t1h) => kma([{ baseDate: '20261103', baseTime: '1600', category: 'PTY', obsrValue: String(pty) }, { baseDate: '20261103', baseTime: '1600', category: 'T1H', obsrValue: String(t1h) }]);
const fcst = (sky) => kma([{ category: 'SKY', fcstDate: '20261103', fcstTime: '1800', fcstValue: '1' }, { category: 'SKY', fcstDate: '20261103', fcstTime: '1700', fcstValue: String(sky) }]);
const now = () => new Date('2026-11-03T07:20:00Z'); // 16:20 in Seoul

test('D35: Seoul City Hall maps to KMA grid 60·127 and base times step back across midnight', () => {
  assert.deepEqual(toKmaGrid(37.5665, 126.978), { nx: 60, ny: 127 });
  const times = baseTimes(new Date('2026-11-02T15:50:00Z')); // 00:50 in Seoul
  assert.deepEqual(times.ncst.map((t) => `${t.base_date} ${t.base_time}`), ['20261103 0000', '20261102 2300', '20261102 2200']);
  assert.deepEqual(times.fcst.map((t) => `${t.base_date} ${t.base_time}`), ['20261103 0030', '20261102 2330'], 'the :30 forecast before :45 is not out yet');
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((pty) => conditionFrom({ pty, sky: 4 })), ['overcast', 'rain', 'sleet', 'snow', 'rain', 'rain', 'sleet', 'snow']);
  assert.deepEqual([1, 3, 4, null].map((sky) => conditionFrom({ pty: 0, sky })), ['clear', 'cloudy', 'overcast', 'dry']);
});

test('D35: observed rain wins over the sky, the nearest sky hour is used, and one reading is shared for 10 minutes', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return url.pathname.endsWith('getUltraSrtNcst') ? ncst(1, 9.6) : fcst(3); };
  const current = createWeather({ key: 'k-secret', fetchImpl, now });
  const first = await current();
  assert.equal(first.weather.condition, 'rain');
  assert.equal(first.weather.tempC, 10);
  assert.equal(first.weather.observedAt, '2026-11-03T16:00:00+09:00');
  assert.doesNotMatch(JSON.stringify(first), /k-secret/, 'the key never reaches the browser');
  assert.equal(calls[0].searchParams.get('nx'), '60');
  await current();
  assert.equal(calls.length, 2, 'cached');
  const dry = createWeather({ key: 'k', now, fetchImpl: async (url) => (url.pathname.endsWith('getUltraSrtNcst') ? ncst(0, 12) : fcst(3)) });
  assert.equal((await dry()).weather.condition, 'cloudy', 'SKY 1700 (구름 많음) is nearer than 1800');
});

test('D35: no key, a service not yet approved and missing data fall back to the season only', async () => {
  assert.equal((await createWeather({ key: null })()).reason, 'NO_KEY');
  const unregistered = createWeather({ key: 'k', now, fetchImpl: async () => json({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' } } }, 403) });
  const result = await unregistered();
  assert.equal(result.weather, null); assert.equal(result.reason, 'NOT_REGISTERED');
  let tries = 0;
  const late = createWeather({ key: 'k', now, fetchImpl: async (url) => {
    if (url.pathname.endsWith('getUltraSrtFcst')) return fcst(1);
    tries += 1; return tries === 1 ? json({ response: { header: { resultCode: '03' } } }) : ncst(3, -2);
  } });
  assert.equal((await late()).weather.condition, 'snow', 'the previous hour is used when the newest is not out yet');
  const offline = createWeather({ key: 'k', now, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal((await offline()).reason, 'UNAVAILABLE');
});

test('D35: /api/weather returns only the summary', async () => {
  const server = createServer({ weather: async () => ({ weather: { condition: 'snow', label: '눈', tempC: -1 } }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/weather`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { weather: { condition: 'snow', label: '눈', tempC: -1 } });
  } finally { server.close(); }
});
