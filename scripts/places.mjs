import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Stage 1 data: pets (= travel purposes), 25 districts, one neighborhood friend per district and the
// candidate places, kept in data/*.json so the team can verify and edit them. Nothing is used while broken.
export const WALK_LEVELS = Object.freeze([1, 2, 3]);
export const COORD_SOURCES = Object.freeze(['draft', 'tourapi']);
// Seoul with a small margin; a point outside is almost certainly a typo.
export const SEOUL_BOX = Object.freeze({ lat: [37.4, 37.72], lng: [126.75, 127.2] });
const FILES = Object.freeze({ pets: 'pets.json', districts: 'districts.json', friends: 'gu_friends.json', places: 'places.json' });
export const BOUNDARY_FILE = 'boundaries/seoul_gu_kostat2013_simple.geojson';
const ID = /^[a-z0-9-]{3,64}$/;
const text = (value) => typeof value === 'string' && value.trim().length > 0;

export function validateCatalog({ pets: petFile, districts: districtFile, friends: friendFile, places: placeFile }) {
  const errors = [];
  const tagLabels = petFile?.tag_labels ?? {};
  const pets = Array.isArray(petFile?.pets) ? petFile.pets : [];
  if (!pets.length) errors.push('pets.json: pets 배열이 없어요.');
  pets.forEach((pet, index) => {
    const at = `pets[${index}]${pet?.id ? ` (${pet.id})` : ''}`;
    if (!text(pet?.id) || !text(pet?.name) || !text(pet?.purpose) || !text(pet?.tone)) errors.push(`${at}: id·name·purpose·tone 필요`);
    if (!Array.isArray(pet?.tags) || !pet.tags.length || pet.tags.some((tag) => !text(tagLabels[tag]))) errors.push(`${at}: tags는 tag_labels에 있는 태그 1개 이상`);
    if (!text(pet?.reason_template) || !pet.reason_template.includes('{place}') || !pet.reason_template.includes('{tags}')) errors.push(`${at}: reason_template에 {place}와 {tags} 필요`);
  });
  const petIds = new Set(pets.map((pet) => pet.id));

  const regions = new Set((districtFile?.regions ?? []).map((region) => region.id));
  const districts = Array.isArray(districtFile?.districts) ? districtFile.districts : [];
  if (districts.length !== 25) errors.push(`districts.json: 자치구는 25개여야 해요 (${districts.length}개).`);
  const districtIds = new Set();
  districts.forEach((district, index) => {
    const at = `districts[${index}]${district?.id ? ` (${district.id})` : ''}`;
    if (!/^[a-z]+$/.test(district?.id ?? '') || districtIds.has(district.id)) errors.push(`${at}: id는 중복 없는 영문 소문자`);
    districtIds.add(district?.id);
    if (!text(district?.name) || !regions.has(district?.region) || !/^\d{5}$/.test(district?.boundary_code ?? '')) errors.push(`${at}: name·region·boundary_code 확인`);
  });

  const friends = Array.isArray(friendFile?.friends) ? friendFile.friends : [];
  const friendGu = new Set();
  friends.forEach((friend, index) => {
    const at = `friends[${index}]${friend?.id ? ` (${friend.id})` : ''}`;
    if (!ID.test(friend?.id ?? '') || !districtIds.has(friend?.gu) || friendGu.has(friend.gu)) errors.push(`${at}: id와 아직 친구가 없는 gu 필요`);
    friendGu.add(friend?.gu);
    if (!text(friend?.name) || !text(friend?.concept) || !text(friend?.greeting)) errors.push(`${at}: name·concept·greeting 필요`);
    // D46: each friend carries its own personality, catchphrase and look (for whoever draws it).
    if (!text(friend?.personality) || !text(friend?.catchphrase) || !text(friend?.look)) errors.push(`${at}: personality·catchphrase·look 필요`);
  });
  for (const id of districtIds) if (!friendGu.has(id)) errors.push(`gu_friends.json: ${id}의 동네 친구가 없어요.`);
  const friendById = new Map(friends.map((friend) => [friend?.id, friend]));
  for (const key of ['name', 'personality']) {
    const counted = new Map();
    for (const friend of friends) counted.set(friend?.[key], (counted.get(friend?.[key]) ?? 0) + 1);
    for (const [value, count] of counted) if (count > 1) errors.push(`gu_friends.json: ${key} "${value}"가 ${count}명에게 겹쳐요.`);
  }
  // A pal is written on both sides, so either friend can mention the other.
  for (const friend of friends) {
    if (friend?.pal === undefined) continue;
    const pal = friendById.get(friend.pal?.id);
    if (!pal || pal === friend || !text(friend.pal?.note) || pal.pal?.id !== friend.id) errors.push(`friends (${friend?.id}): pal은 다른 친구 id와 note가 필요하고 양쪽에 적어야 해요.`);
  }

  const places = Array.isArray(placeFile?.places) ? placeFile.places : [];
  if (!places.length) errors.push('places.json: places 배열이 없어요.');
  const placeIds = new Set();
  places.forEach((place, index) => {
    const at = `places[${index}]${place?.id ? ` (${place.id})` : ''}`;
    if (!ID.test(place?.id ?? '')) errors.push(`${at}: id는 소문자·숫자·하이픈 3~64자`);
    else if (placeIds.has(place.id)) errors.push(`${at}: 중복 id`);
    placeIds.add(place?.id);
    for (const key of ['name', 'nearest_station', 'access_summary', 'summary']) if (!text(place?.[key])) errors.push(`${at}: ${key} 필요`);
    if (!districtIds.has(place?.gu)) errors.push(`${at}: gu는 districts.json의 id`);
    if (!(place?.lat >= SEOUL_BOX.lat[0] && place.lat <= SEOUL_BOX.lat[1]) || !(place?.lng >= SEOUL_BOX.lng[0] && place.lng <= SEOUL_BOX.lng[1])) errors.push(`${at}: lat/lng가 서울 범위 밖`);
    if (!Array.isArray(place?.tags) || !place.tags.length || place.tags.some((tag) => !text(tagLabels[tag]))) errors.push(`${at}: tags는 tag_labels에 있는 태그 1개 이상`);
    const purposes = Array.isArray(place?.purposes) ? place.purposes : [];
    // A purpose must be backed by one of that pet's tags, so the first ranking rule stays checkable.
    if (!purposes.length || purposes.some((id) => !petIds.has(id) || !pets.find((pet) => pet.id === id).tags.some((tag) => place.tags?.includes(tag)))) errors.push(`${at}: purposes는 태그가 맞는 펫 id 1개 이상`);
    if (!WALK_LEVELS.includes(place?.walk_level)) errors.push(`${at}: walk_level은 1~3`);
    if (typeof place?.needs_check !== 'boolean') errors.push(`${at}: needs_check는 true/false`);
    if (!COORD_SOURCES.includes(place?.coords_source)) errors.push(`${at}: coords_source는 ${COORD_SOURCES.join('/')}`);
    // A remembered coordinate is never presented as checked.
    else if (place.coords_source === 'draft' && place.needs_check === false) errors.push(`${at}: 초안 좌표(draft)는 needs_check가 true여야 해요`);
    // A TourAPI point names the entry it came from, so a person can tell a near-miss (e.g. a renamed hall).
    else if (place.coords_source === 'tourapi' && (!text(place.tourapi_id) || !text(place.tourapi_title))) errors.push(`${at}: TourAPI 좌표는 tourapi_id·tourapi_title 필요`);
    if (place?.tourapi_keyword !== undefined && !text(place.tourapi_keyword)) errors.push(`${at}: tourapi_keyword는 빈 글자가 아니어야 해요`);
    // The route text is checked against an official "오시는 길" page; both the page and the day are kept.
    if (place?.access_source !== undefined && !/^https?:\/\/\S+$/.test(place.access_source)) errors.push(`${at}: access_source는 http(s) 주소`);
    if (place?.access_checked_at !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(place.access_checked_at)) errors.push(`${at}: access_checked_at은 YYYY-MM-DD`);
    // A place leaves the draft list only with a TourAPI point and an officially checked route.
    if (place?.needs_check === false && (place.coords_source !== 'tourapi' || !place.access_source || !place.access_checked_at)) errors.push(`${at}: needs_check를 false로 하려면 TourAPI 좌표와 access_source·access_checked_at이 필요해요`);
  });

  if (errors.length) return { errors, pets: [], tagLabels: {}, regions: [], districts: [], friends: [], places: [] };
  return { errors, pets, tagLabels, regions: districtFile.regions, districts, friends, places };
}

async function readJson(dataDir, file) {
  let raw;
  try { raw = await fs.readFile(path.join(dataDir, file), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return { missing: true }; throw error; }
  try { return { value: JSON.parse(raw) }; }
  catch (error) { return { error: `${file}을 읽을 수 없어요: ${error.message}` }; }
}

export async function loadCatalog(dataDir) {
  const loaded = {}; const errors = [];
  for (const [key, file] of Object.entries(FILES)) {
    const result = await readJson(dataDir, file);
    if (result.missing) errors.push(`${file}이 없어요.`);
    else if (result.error) errors.push(result.error);
    else loaded[key] = result.value;
  }
  if (errors.length) return { errors, pets: [], tagLabels: {}, regions: [], districts: [], friends: [], places: [] };
  return validateCatalog(loaded);
}

// Field reports may point at any catalog place; a missing or broken catalog simply offers none.
export async function loadPlaces(dataDir) {
  const { places, errors } = await loadCatalog(dataDir);
  return { places, errors };
}

export async function loadBoundaries(dataDir) {
  const result = await readJson(dataDir, BOUNDARY_FILE);
  return Array.isArray(result.value?.features) ? result.value.features : [];
}

const kakao = (kind, place, withPoint) => `https://map.kakao.com/link/${kind}/${encodeURIComponent(place.name)}${withPoint ? `,${place.lat},${place.lng}` : ''}`;
export function checkTable(catalog) {
  const byId = new Map(catalog.districts.map((district) => [district.id, district]));
  const rows = catalog.places.map((place, index) => `| ${index + 1} | ${place.name} | ${byId.get(place.gu).name} | [이 좌표의 핀](${kakao('map', place, true)}) · [이름으로 검색](${kakao('search', place, false)}) | ${place.coords_source === 'tourapi' ? `TourAPI: ${place.tourapi_title}` : '초안'} | ${place.nearest_station} · ${place.access_summary}${place.access_source ? ` ([공식 안내](${place.access_source}), ${place.access_checked_at})` : ''} | ${place.walk_level} | ${place.needs_check ? '☐' : '☑'} |`);
  const fromApi = catalog.places.filter((place) => place.coords_source === 'tourapi').length;
  const sourced = catalog.places.filter((place) => place.access_source).length;
  const cleared = catalog.places.filter((place) => !place.needs_check).length;
  return [
    '# 후보지 확인표 (data/places.json)',
    '',
    `\`node scripts/places.mjs --check-table\`로 만든 표다. 서울 25개 구 ${catalog.places.length}곳 중 좌표 출처가 "TourAPI"인 ${fromApi}곳은 한국관광공사 TourAPI 검색 결과의 좌표이고, "초안"인 ${catalog.places.length - fromApi}곳은 작업자 기억으로 쓴 좌표다. 가까운 역·교통 요약은 "공식 안내" 링크가 있는 ${sourced}곳만 그 안내 문구로 고쳤고, 나머지는 작업자 기억으로 쓴 **초안**이다. 확인 완료(${cleared}곳)는 TourAPI 좌표와 공식 안내로 확인한 교통 요약을 모두 갖춘 곳이다. 대조 기록은 [서울 펫 MVP 기록](../plans/15_SEOUL_PET_MVP.md)에 있다.`,
    '',
    '확인 방법',
    '1. 좌표 출처가 초안인 곳은 `node scripts/tourapi-places.mjs`로 다시 대조할 수 있다. 이름이 TourAPI 제목과 달라 검색되지 않으면 places.json에 `tourapi_keyword`를 넣는다.',
    '2. "이 좌표의 핀"과 "이름으로 검색" 결과가 같은 곳인지 본다. TourAPI 좌표도 시설 대표점이라 입구와 다를 수 있다. 대표 입구에서 300m 이상 벗어나면 좌표를 고친다.',
    '3. 가까운 역·출구·도보 시간은 카카오맵 길찾기나 운영기관 안내로 확인한다.',
    '4. 좌표와 교통 정보를 모두 확인한 곳만 places.json의 needs_check를 false로 바꾸고 `node scripts/places.mjs`로 검사한다.',
    '',
    '| # | 이름 | 구 | 좌표 확인 | 좌표 출처 | 가까운 역·교통 요약 | 걷기 | 확인 완료 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

// `node scripts/places.mjs` checks data/*.json; `--check-table` also rewrites data/PLACES_CHECK.md.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
  const catalog = await loadCatalog(dataDir);
  if (catalog.errors.length) { console.error(catalog.errors.join('\n')); process.exitCode = 1; }
  else {
    const pending = catalog.places.filter((place) => place.needs_check).length;
    const fromApi = catalog.places.filter((place) => place.coords_source === 'tourapi').length;
    console.log(`펫 ${catalog.pets.length}종 · 자치구 ${catalog.districts.length}곳 · 동네 친구 ${catalog.friends.length}종 · 후보지 ${catalog.places.length}곳 형식 통과.`);
    console.log(`TourAPI 좌표 ${fromApi}곳 · 사람 확인이 남은 곳 ${pending}곳.`);
    if (process.argv.includes('--check-table')) {
      await fs.writeFile(path.join(dataDir, 'PLACES_CHECK.md'), checkTable(catalog));
      console.log('data/PLACES_CHECK.md를 다시 만들었어요.');
    }
  }
}
