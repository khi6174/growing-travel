import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tourPhoto, webPhoto, createPhotos } from '../scripts/photos.mjs';
import { createServer, contentSecurityPolicy } from '../scripts/serve.mjs';
import { photoCredit } from '../dist/ai-flow.mjs';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
const doc = (over = {}) => ({ thumbnail_url: 'https://search1.kakaocdn.net/argon/130x130_85_c/abc', image_url: 'http://t1.daumcdn.net/news/a.jpg', width: 800, height: 533, display_sitename: '한겨레', doc_url: 'https://v.daum.net/v/1', ...over });

test('P62 a 한국관광공사 photo needs the same name nearby; a web photo keeps its site and page', () => {
  const place = { name: '광장시장', lat: 37.5701, lng: 126.9997 };
  const items = [{ title: '광장시장', firstimage: 'http://tong.visitkorea.or.kr/cms/a.jpg', mapx: '126.9996', mapy: '37.5700' }, { title: '광장시장', firstimage: 'http://tong.visitkorea.or.kr/cms/far.jpg', mapx: '127.10', mapy: '37.50' }];
  assert.deepEqual(tourPhoto(items, place), { photo: 'https://tong.visitkorea.or.kr/cms/a.jpg', photo_credit: '한국관광공사', photo_link: null, photo_large: true });
  assert.equal(tourPhoto([items[1]], place), null, 'a same-named place far away is not this one');
  assert.deepEqual(webPhoto([doc()]), { photo: 'https://t1.daumcdn.net/news/a.jpg', photo_thumb: 'https://search1.kakaocdn.net/argon/130x130_85_c/abc', photo_credit: '한겨레', photo_link: 'https://v.daum.net/v/1', photo_large: true });
  const blog = webPhoto([doc({ image_url: 'http://postfiles.pstatic.net/x.jpg', display_sitename: '네이버블로그', doc_url: 'http://blog.naver.com/a/1' })]);
  assert.equal(blog.photo, 'https://search1.kakaocdn.net/argon/130x130_85_c/abc', 'an image on another site is shown through Kakao\'s thumbnail only');
  assert.equal(blog.photo_large, false); assert.equal(blog.photo_link, 'http://blog.naver.com/a/1');
  assert.equal(webPhoto([doc({ thumbnail_url: 'https://evil.example/x.jpg' })]), null, 'only Kakao/Daum image servers');
  assert.equal(webPhoto([]), null);
  assert.equal(photoCredit({ photo_credit: '한겨레' }), '사진: 한겨레'); assert.equal(photoCredit({}), '사진: 한국관광공사');
});

test('P62 tourism data first, Kakao image search next, cafés skip the tourism lookup, and each place is asked once a day', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const text = String(url); calls.push(text);
    const json = (body) => ({ ok: true, json: async () => body });
    if (text.includes('searchKeyword2')) return json({ response: { body: { items: { item: [{ title: '광장시장', firstimage: 'http://tong.visitkorea.or.kr/cms/a.jpg', mapx: '126.9996', mapy: '37.5700' }] } } } });
    if (text.includes('/v2/search/image')) return json({ documents: [doc()] });
    return { ok: false, json: async () => ({}) };
  };
  const photos = createPhotos({ tourKey: 't', kakaoKey: 'k'.repeat(32), fetchImpl });
  const market = { id: 'k1', name: '광장시장', gu: 'jongno', lat: 37.5701, lng: 126.9997, tags: ['market'] };
  const cafe = { id: 'k2', name: '어느 카페', gu: 'mapo', lat: 37.55, lng: 126.92, tags: ['cafe'] };
  const found = await photos.forPlaces([market, cafe], new Map([['jongno', '종로구'], ['mapo', '마포구']]));
  assert.equal(found.get('k1').photo_credit, '한국관광공사');
  assert.equal(found.get('k2').photo_credit, '한겨레');
  assert.equal(calls.filter((url) => url.includes('searchKeyword2')).length, 1, 'the café never asks the tourism data');
  assert.match(decodeURIComponent(calls.find((url) => url.includes('/v2/search/image'))), /query=어느\+카페\+마포구|query=어느 카페 마포구/);
  const asked = calls.length;
  await photos.forPlaces([market, cafe]);
  assert.equal(calls.length, asked, 'remembered for a day');
  const tour = await photos.photoFor({ id: 't9', name: 'x', photo: 'https://tong.visitkorea.or.kr/cms/b.jpg' });
  assert.equal(tour.photo, 'https://tong.visitkorea.or.kr/cms/b.jpg', 'a TourAPI photo already on the place is used as is');
  assert.equal(createPhotos({}).configured, false);
});

test('P62 the photo endpoint takes up to 10 known ids, and the page may load photos only from the expected hosts', async () => {
  const policy = contentSecurityPolicy(null, { photos: true, webPhotos: true });
  assert.match(policy, /img-src 'self' data: https:\/\/tong\.visitkorea\.or\.kr https:\/\/\*\.kakaocdn\.net https:\/\/\*\.daumcdn\.net;/);
  assert.doesNotMatch(contentSecurityPolicy(null), /kakaocdn|visitkorea/);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'growing-travel-photos-'));
  for (const file of ['pets.json', 'districts.json', 'gu_friends.json', 'places.json']) await fs.copyFile(path.join(dataDir, file), path.join(work, file));
  const fetchImpl = async (url) => ({ ok: true, json: async () => (String(url).includes('/v2/search/image') ? { documents: [doc()] } : { documents: [], response: { header: { resultCode: '0000' }, body: { items: '' } } }) });
  const server = createServer({ dataDir: work, aiProvider: { name: 'none', configured: false }, kakaoRestKey: 'k'.repeat(32), tourKey: null, searchFetch: fetchImpl });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(`${base}/api/places/photos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const catalog = JSON.parse(await fs.readFile(path.join(work, 'places.json'), 'utf8'));
    const id = (catalog.places ?? catalog)[0].id;
    const answer = await (await post({ ids: [id, 'nowhere'] })).json();
    assert.equal(answer.photos[id].photo_credit, '한겨레'); assert.equal(answer.photos.nowhere, undefined);
    assert.equal((await post({ ids: Array.from({ length: 11 }, (_, n) => `p${n}`) })).status, 400);
    assert.equal((await post({ ids: 'x' })).status, 400);
    const result = await (await fetch(`${base}/api/recommend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conditions: { pet: 'baekgu', departure: 'gyeongbokgung', hours: 4, partySize: 2, walkLevel: 2, timeOfDay: 'day', metFriends: [] } }) })).json();
    assert.ok(result.items.every((item) => item.place.photo && item.place.photo_credit), 'every pick comes with a photo and its source');
  } finally { server.close(); }
});
