import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaces, validatePlaces } from '../scripts/places.mjs';
import { createPlaceIndex } from '../scripts/api.mjs';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));

test('data/places.json holds 20-30 valid Seoul and day-trip candidates', async () => {
  const { places, errors } = await loadPlaces(dataDir);
  assert.deepEqual(errors, []);
  assert.ok(places.length >= 20 && places.length <= 30, `${places.length} places`);
  assert.ok(places.filter((place) => place.area.startsWith('서울')).length >= places.length / 2, 'Seoul-centered');
  assert.ok(places.some((place) => place.area.startsWith('경기')), 'includes Gyeonggi day trips');
  for (const place of places) assert.ok(['확인 필요'].includes(place.check.coords) || place.check.coords.startsWith('확인됨'), place.id);
});

test('place validation names each broken field', () => {
  const base = { id: 'ok-place', name: '이름', area: '서울', lat: 37.5, lng: 127, access: '역 앞', tags: ['카페'], walk_level: 1, check: { coords: '확인 필요', access: '확인됨 2026-11-01' } };
  assert.deepEqual(validatePlaces({ places: [base] }).errors, []);
  const { places, errors } = validatePlaces({ places: [base, { ...base }, { ...base, id: 'bad', lat: 35.1, tags: ['놀이공원'], walk_level: 4, check: { coords: '맞음' } }] });
  assert.deepEqual(places, [], 'nothing is used while any entry is broken');
  assert.ok(errors.some((error) => error.includes('중복 id')));
  for (const field of ['lat', 'tags', 'walk_level', 'check']) assert.ok(errors.some((error) => error.includes(field)), field);
});

test('reports can point at both the existing catalog and data/places.json', async () => {
  const ids = await createPlaceIndex(dataDir)();
  assert.ok(ids.has('real-jaraseom'));
  assert.ok(ids.has('seoul-gyeongbokgung'));
  const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'gt-places-'));
  assert.equal((await createPlaceIndex(empty)()).has('seoul-gyeongbokgung'), false, 'places.json is optional');
});
