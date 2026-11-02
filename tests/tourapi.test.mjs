import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchKeyword, pickMatch, formatPlacesFile, TOURAPI_BASE } from '../scripts/tourapi-places.mjs';
import { loadCatalog, loadBoundaries } from '../scripts/places.mjs';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
const catalog = await loadCatalog(dataDir);
const features = await loadBoundaries(dataDir);
const where = (gu) => { const district = catalog.districts.find((item) => item.id === gu); return { district, feature: features.find((item) => item.properties.code === district.boundary_code) }; };
const reply = (body, status = 200) => async (url) => { reply.last = url; return { ok: status < 400, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }; };

test('searchKeyword asks KorService2 for Seoul and reads one, many or no items', async () => {
  const one = await searchKeyword('경복궁', { key: 'k', fetchImpl: reply({ response: { header: { resultCode: '0000' }, body: { items: { item: { title: '경복궁', mapx: '126.977', mapy: '37.5796' } } } } }) });
  assert.equal(one.length, 1);
  const url = new URL(reply.last);
  assert.equal(`${url.origin}${url.pathname}`, `${TOURAPI_BASE}/searchKeyword2`);
  assert.deepEqual([url.searchParams.get('keyword'), url.searchParams.get('lDongRegnCd'), url.searchParams.get('_type')], ['경복궁', '11', 'json']);
  assert.deepEqual(await searchKeyword('없는곳', { key: 'k', fetchImpl: reply({ response: { header: { resultCode: '0000' }, body: { items: '' } } }) }), []);
  await assert.rejects(searchKeyword('x', { key: 'k', fetchImpl: reply('<OpenAPI_ServiceResponse><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></OpenAPI_ServiceResponse>') }), /JSON이 아닌 응답/);
  await assert.rejects(searchKeyword('x', { key: 'k', fetchImpl: reply({ response: { header: { resultCode: '22', resultMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR' } } }) }), /^Error: 22 LIMITED/);
});

test('a match must share the name, sit in the same district and stay within 2 km of the draft point', () => {
  const place = catalog.places.find((item) => item.id === 'seoul-gyeongbokgung');
  const items = [
    { title: '경복궁 별빛야행', addr1: '서울특별시 종로구 사직로 161', mapx: '126.9770', mapy: '37.5788', contentid: '2' },
    { title: '경복궁', addr1: '서울특별시 종로구 사직로 161', mapx: '126.97689', mapy: '37.57961', contentid: '1' },
    { title: '경복궁역 맛집', addr1: '서울특별시 중구', mapx: '126.98', mapy: '37.56', contentid: '3' },
  ];
  assert.equal(pickMatch(place, items, where('jongno')).item.contentid, '1', 'the nearest same-district title wins');
  assert.equal(pickMatch(place, [{ title: '창경궁', addr1: '서울특별시 종로구', mapx: '126.995', mapy: '37.579' }], where('jongno')), null, 'another name is not a match');
  assert.equal(pickMatch(place, [{ title: '경복궁', addr1: '서울특별시 종로구', mapx: '127.05', mapy: '37.60' }], where('jongno')), null, 'more than 2 km away needs a person');
  const split = catalog.places.find((item) => item.id === 'seoul-seochon-tongin');
  assert.equal(pickMatch(split, [{ title: '통인시장', addr1: '서울특별시 종로구 자하문로15길 18', mapx: '126.9701', mapy: '37.5806', contentid: '9' }], where('jongno')).item.contentid, '9', 'either part of a joined name matches');
});

// Items placed a few metres north of a place, so only the title and type decide.
const at = (place, title, contenttypeid, metres, contentid = title) => ({ title, contenttypeid, contentid, addr1: '', mapx: String(place.lng), mapy: String(place.lat + metres / 111000) });

test('an exact title beats a nearer event, branch shop or sub-sight', () => {
  const market = catalog.places.find((item) => item.id === 'seoul-gwangjang-market');
  const picked = pickMatch(market, [at(market, '광장시장 야시장', '15', 5), at(market, '로우로우 광장시장점', '38', 10), at(market, '광장시장 365일장', '38', 20), at(market, '광장시장', '38', 150)], where('jongno'));
  assert.deepEqual([picked.item.title, picked.exact], ['광장시장', true]);
  assert.equal(pickMatch(market, [at(market, '로우로우 광장시장점', '38', 10), at(market, '광장시장 맛집', '39', 10)], where('jongno')), null, 'a shop or restaurant only counts on an exact title');
  const palace = catalog.places.find((item) => item.id === 'seoul-gyeongbokgung');
  assert.equal(pickMatch(palace, [at(palace, '경복궁 생과방', '15', 5), at(palace, '경복궁 별빛야행', '15', 5)], where('jongno')), null, 'events are never a place');
});

test('notes in brackets, a leading "서울" and tourapi_keyword still make an exact title', () => {
  const tomb = catalog.places.find((item) => item.id === 'seongbuk-jeongneung');
  assert.equal(pickMatch(tomb, [at(tomb, '정릉시장', '38', 30), at(tomb, '서울 정릉(신덕황후) [유네스코 세계유산]', '12', 250)], where('seongbuk')).item.title, '서울 정릉(신덕황후) [유네스코 세계유산]');
  const forest = { ...catalog.places.find((item) => item.id === 'dongdaemun-hongneung-forest'), tourapi_keyword: '국립산림과학원' };
  assert.equal(pickMatch(forest, [at(forest, '국립산림과학원(홍릉시험림)', '12', 150)], where('dongdaemun')).exact, true);
  assert.equal(pickMatch({ ...forest, tourapi_keyword: undefined }, [at(forest, '국립산림과학원(홍릉시험림)', '12', 150)], where('dongdaemun')), null, 'without the keyword the title shares nothing with "홍릉숲"');
});

test('with no exact title, a sight containing the name is taken and marked as partial', () => {
  const street = catalog.places.find((item) => item.id === 'gangnam-garosu-gil');
  const picked = pickMatch(street, [at(street, '사뿐 가로수길플래그십스토어', '38', 10), at(street, '신사동 가로수길', '12', 90)], where('gangnam'));
  assert.deepEqual([picked.item.title, picked.exact], ['신사동 가로수길', false]);
});

test('every TourAPI point names its entry, and a keyword is never blank', async () => {
  const fromApi = catalog.places.filter((place) => place.coords_source === 'tourapi');
  assert.ok(fromApi.every((place) => place.tourapi_id && place.tourapi_title && place.needs_check), 'transit text is still a draft, so needs_check stays true');
  const raw = JSON.parse(await fs.readFile(path.join(dataDir, 'places.json'), 'utf8'));
  const { validateCatalog } = await import('../scripts/places.mjs');
  const files = { pets: JSON.parse(await fs.readFile(path.join(dataDir, 'pets.json'), 'utf8')), districts: JSON.parse(await fs.readFile(path.join(dataDir, 'districts.json'), 'utf8')), friends: JSON.parse(await fs.readFile(path.join(dataDir, 'gu_friends.json'), 'utf8')) };
  const broken = { ...raw, places: [{ ...raw.places[0], coords_source: 'tourapi', tourapi_id: undefined }, { ...raw.places[1], tourapi_keyword: ' ' }] };
  const { errors } = validateCatalog({ ...files, places: broken });
  assert.ok(errors.some((error) => error.includes('tourapi_id·tourapi_title')));
  assert.ok(errors.some((error) => error.includes('tourapi_keyword')));
});

test('rewriting places.json keeps the layout so a coordinate update is a small diff', async () => {
  const text = await fs.readFile(path.join(dataDir, 'places.json'), 'utf8');
  assert.equal(formatPlacesFile(JSON.parse(text)), text.replace(/\r\n/g, '\n'));
});
