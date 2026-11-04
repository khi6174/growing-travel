import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../scripts/serve.mjs';
import { createReportStore, SCORE } from '../scripts/field-reports.mjs';

const writer = 'writer-0001';
const visitor = 'visitor-0001';
const other = 'visitor-0002';
const tempDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'gt-reports-'));

test('report store validates input, keeps reports per place and blocks self confirmation', async () => {
  const dir = await tempDir();
  const store = createReportStore({ file: path.join(dir, 'reports.json'), isKnownPlace: async (id) => id === 'real-jaraseom' });
  await assert.rejects(store.create({ placeId: 'nowhere', category: 'tip', text: '좋아요', contributorId: writer }), { code: 'UNKNOWN_PLACE' });
  await assert.rejects(store.create({ placeId: 'real-jaraseom', category: 'ads', text: '좋아요', contributorId: writer }), { code: 'INVALID_CATEGORY' });
  await assert.rejects(store.create({ placeId: 'real-jaraseom', category: 'tip', text: ' ', contributorId: writer }), { code: 'INVALID_TEXT' });
  await assert.rejects(store.create({ placeId: 'real-jaraseom', category: 'tip', text: '좋아요', contributorId: 'x' }), { code: 'INVALID_CONTRIBUTOR' });

  const report = await store.create({ placeId: 'real-jaraseom', category: 'crowd', text: '  입구   대기 20분  ', contributorId: writer });
  assert.equal(report.text, '입구 대기 20분');
  assert.equal(report.nickname, '익명 여행자');
  assert.equal(report.status, 'unconfirmed');
  assert.equal(report.mine, true);
  await assert.rejects(store.vote(report.id, writer, 'still'), { code: 'OWN_REPORT' });

  const confirmed = await store.vote(report.id, visitor, 'still');
  assert.deepEqual([confirmed.status, confirmed.votes.still, confirmed.myVote], ['confirmed', 1, 'still']);
  assert.ok(confirmed.lastConfirmedAt);
  const changed = await store.vote(report.id, visitor, 'gone');
  assert.deepEqual(changed.votes, { still: 0, gone: 1 }, 'one vote per contributor; changing replaces it');
  const outdated = await store.vote(report.id, other, 'gone');
  assert.equal(outdated.status, 'outdated');
  assert.deepEqual(await store.recentSummaries(['real-jaraseom']), {}, 'outdated reports are not offered as recent news');

  assert.equal((await store.contribution(writer)).score, SCORE.report);
  assert.equal((await store.contribution(visitor)).score, SCORE.vote);
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'reports.json'), 'utf8'));
  assert.equal(saved.reports.length, 1);
});

test('report store refuses to overwrite a corrupt file', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'reports.json');
  await fs.writeFile(file, '{broken');
  const store = createReportStore({ file, isKnownPlace: async () => true });
  await assert.rejects(store.create({ placeId: 'p', category: 'tip', text: '좋아요', contributorId: writer }), { code: 'STORE_CORRUPT' });
  assert.equal(await fs.readFile(file, 'utf8'), '{broken');
});

test('concurrent reports are all kept', async () => {
  const dir = await tempDir();
  const store = createReportStore({ file: path.join(dir, 'reports.json'), isKnownPlace: async () => true });
  await Promise.all(Array.from({ length: 8 }, (_, index) => store.create({ placeId: 'p', category: 'tip', text: `소식 ${index}`, contributorId: writer })));
  assert.equal((await store.list('p')).length, 8);
});

test('field report API saves, lists, confirms and scores through the local server', async () => {
  const dataDir = await tempDir();
  const server = createServer({ dataDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (route, { as, body, origin } = {}) => fetch(base + route, {
    method: body ? 'POST' : 'GET',
    headers: { ...(as ? { 'X-Contributor-Id': as } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  try {
    assert.equal((await call('/api/reports?place_id=unknown')).status, 404);
    const empty = await (await call('/api/reports?place_id=real-jaraseom', { as: visitor })).json();
    assert.deepEqual(empty.reports, []);
    assert.equal(empty.categories.closed, '휴무·운영 변경');

    const crossSite = await call('/api/reports', { as: writer, origin: 'http://evil.example', body: { placeId: 'real-jaraseom', category: 'tip', text: '좋아요' } });
    assert.equal(crossSite.status, 403);
    const created = await call('/api/reports', { as: writer, origin: base, body: { placeId: 'real-jaraseom', category: 'facility', text: '산책로 일부 공사 중', nickname: '뚜벅이' } });
    assert.equal(created.status, 201);
    const { report } = await created.json();

    assert.equal((await call(`/api/reports/${report.id}/votes`, { as: writer, body: { vote: 'still' } })).status, 409);
    assert.equal((await call(`/api/reports/${report.id}/votes`, { as: visitor, body: { vote: 'still' } })).status, 200);
    const listed = await (await call('/api/reports?place_id=real-jaraseom', { as: visitor })).json();
    assert.equal(listed.reports.length, 1);
    assert.deepEqual([listed.reports[0].nickname, listed.reports[0].myVote, listed.reports[0].mine], ['뚜벅이', 'still', false]);
    assert.equal(Object.hasOwn(listed.reports[0], 'contributorId'), false, 'contributor ids are not exposed');

    const score = await (await call('/api/contributors/me', { as: writer })).json();
    assert.equal(score.score, SCORE.report + SCORE.confirmedByOthers);
    const notJson = await fetch(base + '/api/reports', { method: 'POST', headers: { 'X-Contributor-Id': writer, 'Content-Type': 'text/plain' }, body: 'x' });
    assert.equal(notJson.status, 415);
    const stored = JSON.parse(await fs.readFile(path.join(dataDir, 'runtime', 'reports.json'), 'utf8'));
    assert.equal(stored.reports[0].placeId, 'real-jaraseom');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
