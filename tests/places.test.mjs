import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, validateCatalog, loadBoundaries } from '../scripts/places.mjs';
import { createPlaceIndex } from '../scripts/api.mjs';
import { inFeature, kmOutside, featureAt } from '../dist/geo.mjs';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
const catalog = await loadCatalog(dataDir);
const readRaw = async (file) => JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));

test('data/*.json pass validation', () => {
  assert.deepEqual(catalog.errors, []);
});

test('pets are the five confirmed purposes with their place tags (명세 2-1)', () => {
  const spec = {
    golden: ['골든', '활동', ['park', 'hangang', 'trail', 'view_walk']],
    shiba: ['시바', '여유·힐링', ['quiet_cafe', 'garden', 'bookstore', 'low_crowd']],
    corgi: ['코기', '맛집 탐방', ['market', 'old_restaurant', 'dessert', 'food_street']],
    bichon: ['비숑', '사진·감성', ['photo_spot', 'aesthetic_alley', 'night_view']],
    baekgu: ['백구', '역사·문화', ['palace', 'museum', 'exhibition', 'hanok']],
  };
  assert.deepEqual(catalog.pets.map((pet) => pet.id), Object.keys(spec));
  for (const pet of catalog.pets) assert.deepEqual([pet.name, pet.purpose, pet.tags], spec[pet.id], pet.id);
});

test('25 districts sit in the confirmed five regions (명세 2-2)', () => {
  const spec = { dosim: '종로구 중구 용산구', seobuk: '은평구 서대문구 마포구', dongbuk: '성동구 광진구 동대문구 중랑구 성북구 강북구 도봉구 노원구', seonam: '양천구 강서구 구로구 금천구 영등포구 동작구 관악구', dongnam: '서초구 강남구 송파구 강동구' };
  assert.deepEqual(catalog.regions.map((region) => region.name), ['도심권', '서북권', '동북권', '서남권', '동남권']);
  for (const [region, names] of Object.entries(spec)) assert.deepEqual(catalog.districts.filter((district) => district.region === region).map((district) => district.name), names.split(' '), region);
});

test('each district has one neighborhood friend that is not an animal (명세 2-3, heuristic word check)', () => {
  assert.equal(catalog.friends.length, 25);
  assert.deepEqual(new Set(catalog.friends.map((friend) => friend.gu)), new Set(catalog.districts.map((district) => district.id)));
  const animalWords = ['강아지', '고양이', '호랑이', '토끼', '여우', '사슴', '까치', '비둘기', '물고기', '동물', '드래곤'];
  for (const friend of catalog.friends) for (const word of animalWords) assert.ok(!`${friend.name} ${friend.concept} ${friend.greeting} ${friend.look} ${friend.pal?.note ?? ''}`.includes(word), `${friend.id}: ${word}`);
});

test('D46 every friend has its own name, personality, catchphrase and look, and pals name each other', async () => {
  for (const key of ['name', 'personality', 'catchphrase', 'look']) assert.equal(new Set(catalog.friends.map((friend) => friend[key])).size, 25, `${key} is not shared`);
  const byId = new Map(catalog.friends.map((friend) => [friend.id, friend]));
  const pals = catalog.friends.filter((friend) => friend.pal);
  assert.ok(pals.length >= 2);
  for (const friend of pals) assert.equal(byId.get(friend.pal.id)?.pal?.id, friend.id, `${friend.id} ↔ ${friend.pal.id}`);
  const raw = { pets: await readRaw('pets.json'), districts: await readRaw('districts.json'), friends: await readRaw('gu_friends.json'), places: await readRaw('places.json') };
  const [first, second] = raw.friends.friends;
  const same = validateCatalog({ ...raw, friends: { friends: [{ ...first }, { ...second, personality: first.personality }, ...raw.friends.friends.slice(2)] } });
  assert.ok(same.errors.some((error) => error.includes('personality')), 'two friends may not share a personality');
  const oneSided = validateCatalog({ ...raw, friends: { friends: [{ ...first, pal: { id: second.id, note: '한쪽만' } }, ...raw.friends.friends.slice(1)] } });
  assert.ok(oneSided.errors.some((error) => error.includes('pal')), 'a pal is written on both sides');
  const bare = validateCatalog({ ...raw, friends: { friends: [{ ...first, look: '' }, ...raw.friends.friends.slice(1)] } });
  assert.ok(bare.errors.some((error) => error.includes('look')));
});

test('places cover every district with 5-10 candidates and each pet has enough to fill 20', () => {
  for (const district of catalog.districts) {
    const count = catalog.places.filter((place) => place.gu === district.id).length;
    assert.ok(count >= 5 && count <= 10, `${district.name} ${count}곳`);
  }
  for (const pet of catalog.pets) assert.ok(catalog.places.filter((place) => place.purposes.includes(pet.id)).length >= 30, pet.id);
  assert.ok(catalog.places.every((place) => place.coords_source !== 'draft' || place.needs_check), 'remembered coordinates stay marked for a check');
});

test('existing Seoul place ids are kept so earlier field reports still point at a place', () => {
  const kept = ['seoul-gyeongbokgung', 'seoul-changdeokgung', 'seoul-bukchon', 'seoul-ikseondong', 'seoul-seochon-tongin', 'seoul-gwangjang-market', 'seoul-deoksugung-jeongdong', 'seoul-seoullo7017', 'seoul-namsan-tower', 'seoul-national-museum', 'seoul-nodeul-island', 'seoul-ddp', 'seoul-naksan-ihwa', 'seoul-seongsu', 'seoul-seoul-forest', 'seoul-yeonnam-forest-road', 'seoul-mangwon-market', 'seoul-yeouido-hangang', 'seoul-mullae', 'seoul-seokchon-lake'];
  const ids = new Set(catalog.places.map((place) => place.id));
  for (const id of kept) assert.ok(ids.has(id), id);
});

test('a place leaves the draft list only with a TourAPI point and an officially checked route', async () => {
  const files = { pets: await readRaw('pets.json'), districts: await readRaw('districts.json'), friends: await readRaw('gu_friends.json') };
  const base = catalog.places.find((place) => place.coords_source === 'tourapi');
  const check = (place) => validateCatalog({ ...files, places: { places: [place] } }).errors.join('\n');
  assert.equal(check({ ...base, needs_check: false, access_source: 'https://example.org/visit', access_checked_at: '2026-11-02' }), '');
  assert.match(check({ ...base, needs_check: false }), /access_source·access_checked_at/);
  assert.match(check({ ...base, coords_source: 'draft', needs_check: false, access_source: 'https://example.org', access_checked_at: '2026-11-02' }), /초안 좌표/);
  assert.match(check({ ...base, access_source: 'example.org' }), /access_source는 http/);
  assert.match(check({ ...base, access_checked_at: '11/2' }), /YYYY-MM-DD/);
});

test('the boundary file has the 25 districts and every coordinate lands in its own district', async () => {
  const features = await loadBoundaries(dataDir);
  assert.equal(features.length, 25);
  const byCode = new Map(features.map((feature) => [feature.properties.code, feature]));
  for (const district of catalog.districts) assert.equal(byCode.get(district.boundary_code)?.properties.name, district.name, district.id);
  const outside = [];
  for (const place of catalog.places) {
    const district = catalog.districts.find((item) => item.id === place.gu);
    const own = byCode.get(district.boundary_code);
    // The simplified 2013 outline is coarse; 350 m covers places on a border street or river bank.
    if (inFeature(place, own)) continue;
    outside.push(place.id);
    assert.ok(kmOutside(place, own) <= 0.35, `${place.id} ${kmOutside(place, own).toFixed(2)}km`);
    // A TourAPI point just past that outline still has its official address in the district.
    if (place.coords_source === 'tourapi') assert.ok(place.address.includes(district.name), `${place.id} ${place.address}`);
  }
  const draftOutside = outside.filter((id) => catalog.places.find((place) => place.id === id).coords_source === 'draft');
  assert.ok(draftOutside.length <= 10, `${draftOutside.length} near-border draft places`);
  assert.equal(featureAt({ lat: 37.5796, lng: 126.977 }, features).properties.name, '종로구');
  assert.equal(featureAt({ lat: 37.8813, lng: 127.7298 }, features), null, 'Chuncheon is outside Seoul');
});

test('validation names each broken field and offers nothing while broken', async () => {
  const raw = { pets: await readRaw('pets.json'), districts: await readRaw('districts.json'), friends: await readRaw('gu_friends.json'), places: await readRaw('places.json') };
  const place = raw.places.places[0];
  const broken = { ...raw, places: { places: [place, { ...place }, { ...place, id: 'bad-place', gu: 'busan', lat: 35.1, tags: ['beach'], purposes: ['cat'], walk_level: 4, coords_source: 'draft', needs_check: false }] } };
  const result = validateCatalog(broken);
  assert.deepEqual(result.places, []);
  for (const fragment of ['중복 id', 'gu는', 'lat/lng', 'tags는', 'purposes는', 'walk_level', '초안 좌표']) assert.ok(result.errors.some((error) => error.includes(fragment)), fragment);
  const mismatched = validateCatalog({ ...raw, places: { places: [{ ...place, purposes: ['corgi'] }] } });
  assert.ok(mismatched.errors.some((error) => error.includes('purposes는')), 'a purpose needs one of that pet’s tags');
  const missingFriend = validateCatalog({ ...raw, friends: { friends: raw.friends.friends.slice(1) } });
  assert.ok(missingFriend.errors.some((error) => error.includes('jongno의 동네 친구')));
});

test('reports can point at both the existing catalog and data/places.json', async () => {
  const ids = await createPlaceIndex(dataDir)();
  assert.ok(ids.has('real-jaraseom'));
  assert.ok(ids.has('seoul-gyeongbokgung'));
  assert.ok(ids.has('gangdong-amsa-prehistoric'));
  const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'gt-places-'));
  assert.equal((await createPlaceIndex(empty)()).has('seoul-gyeongbokgung'), false, 'the catalog is optional');
});
