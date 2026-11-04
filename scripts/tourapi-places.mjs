import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, loadBoundaries } from './places.mjs';
import { kmOutside, distanceKm } from '../dist/geo.mjs';

// D27/P37: compares the draft coordinates in data/places.json with the Korea Tourism Organization TourAPI
// (국문 관광정보 서비스 KorService2, searchKeyword2) and, with --write, takes the API point when the match is
// unambiguous. The key is read from TOURAPI_KEY in .env and is never written or printed.
export const TOURAPI_BASE = 'https://apis.data.go.kr/B551011/KorService2';
const SEOUL_LDONG = '11';
const MAX_MOVE_KM = 2;

export async function searchKeyword(keyword, { key, fetchImpl = fetch }) {
  const url = new URL(`${TOURAPI_BASE}/searchKeyword2`);
  url.search = new URLSearchParams({ serviceKey: key, MobileOS: 'ETC', MobileApp: 'GrowingTravel', _type: 'json', numOfRows: '10', pageNo: '1', arrange: 'A', keyword, lDongRegnCd: SEOUL_LDONG }).toString();
  const response = await fetchImpl(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  // A wrong or unregistered key comes back as XML, not JSON.
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`JSON이 아닌 응답이에요(키 등록·종류 확인): ${text.slice(0, 120).replace(/\s+/g, ' ')}`); }
  const header = body?.response?.header;
  if (header?.resultCode && header.resultCode !== '0000') throw new Error(`${header.resultCode} ${header.resultMsg ?? ''}`.trim());
  const items = body?.response?.body?.items?.item;
  return Array.isArray(items) ? items : items ? [items] : [];
}

// Events, courses and lodging (contenttypeid 15·25·32) borrow a place's name without being the place.
const SKIP_TYPES = new Set(['15', '25', '32']);
// Shops and restaurants (38·39) often carry a nearby name as a branch name, so they count only on an exact title.
const EXACT_ONLY_TYPES = new Set(['38', '39']);

const normalize = (text) => String(text).replace(/[\s·()（）[\]]/g, '').toLowerCase();
// "서울 정릉(신덕황후) [유네스코 세계유산]" → "정릉": notes in brackets and a leading "서울 " are not the name.
const core = (text) => normalize(String(text).replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim().replace(/^서울\s+/, ''));
const nameForms = (text) => [normalize(text), core(text), ...String(text).split(/[·()]/).map(normalize)].filter((form) => form.length >= 2);
const titleForms = (title) => [normalize(title), core(title), ...[...String(title).matchAll(/\(([^)]*)\)/g)].map((match) => normalize(match[1]))];

// The API item for a place: in the place's district (address or outline within 350 m) and at most 2 km from the
// draft point. A title equal to the name, one of its parts or `tourapi_keyword` wins; otherwise a sight whose title
// contains the name, nearest first. Anything else is left for a person.
export function pickMatch(place, items, { district, feature }) {
  const names = nameForms(place.name);
  const exact = new Set([...names, ...(place.tourapi_keyword ? nameForms(place.tourapi_keyword) : [])]);
  const tierOf = (item) => {
    const forms = titleForms(item.title ?? '');
    if (forms.some((form) => exact.has(form))) return 0;
    if (!EXACT_ONLY_TYPES.has(String(item.contenttypeid)) && forms.some((form) => names.some((name) => form.includes(name)))) return 1;
    return null;
  };
  return items
    .filter((item) => !SKIP_TYPES.has(String(item.contenttypeid)))
    .map((item) => ({ item, point: { lat: Number(item.mapy), lng: Number(item.mapx) }, tier: tierOf(item) }))
    .filter(({ point, tier }) => tier !== null && Number.isFinite(point.lat) && Number.isFinite(point.lng) && point.lat !== 0)
    .filter(({ item, point }) => String(item.addr1 ?? '').includes(district.name) || kmOutside(point, feature) <= 0.35)
    .map((entry) => ({ ...entry, exact: entry.tier === 0, km: distanceKm(place, entry.point) }))
    .filter(({ km }) => km <= MAX_MOVE_KM)
    .sort((a, b) => a.tier - b.tier || a.km - b.km)[0] ?? null;
}

// Keeps the file's one-place-per-line layout so a coordinate update reads as a small diff.
export function formatPlacesFile(file) {
  const line = (place) => `{ ${Object.entries(place).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value).replaceAll('","', '", "')}`).join(', ')} }`;
  const rows = file.places.map((place, index) => `${index && place.gu !== file.places[index - 1].gu ? '\n' : ''}    ${line(place)}`);
  const head = Object.entries(file).filter(([key]) => key !== 'places').map(([key, value]) => `  ${JSON.stringify(key)}: ${typeof value === 'object' ? JSON.stringify(value).replaceAll('","', '", "').replace(/^\{/, '{ ').replace(/\}$/, ' }').replaceAll('":"', '": "') : JSON.stringify(value)},`);
  return `{\n${head.join('\n')}\n  "places": [\n${rows.join(',\n')}\n  ]\n}\n`;
}

// `node scripts/tourapi-places.mjs` prints what would change; `--write` updates data/places.json;
// `--all` also re-checks places already taken from TourAPI.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch (error) { if (error.code !== 'ENOENT') console.error(`.env not loaded: ${error.message}`); }
  const key = process.env.TOURAPI_KEY;
  const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
  const catalog = await loadCatalog(dataDir);
  if (!key) { console.error('TOURAPI_KEY가 없어요. 공공데이터포털에서 "한국관광공사_국문 관광정보 서비스_GW" 활용신청 후 받은 일반 인증키(Decoding)를 .env에 넣어 주세요.'); process.exitCode = 1; }
  else if (catalog.errors.length) { console.error(catalog.errors.join('\n')); process.exitCode = 1; }
  else {
    const features = await loadBoundaries(dataDir);
    const file = JSON.parse(await fs.readFile(path.join(dataDir, 'places.json'), 'utf8'));
    const write = process.argv.includes('--write'); const all = process.argv.includes('--all');
    const counts = { matched: 0, unmatched: 0, failed: 0, skipped: 0 };
    for (const place of file.places) {
      if (place.coords_source === 'tourapi' && !all) { counts.skipped += 1; continue; }
      const district = catalog.districts.find((item) => item.id === place.gu);
      const feature = features.find((item) => item.properties.code === district.boundary_code);
      // tourapi_keyword is for places whose name is not how TourAPI titles them (e.g. "최순우옛집" → "최순우 옛집").
      const keyword = place.tourapi_keyword ?? place.name;
      try {
        const match = pickMatch(place, await searchKeyword(keyword, { key }), { district, feature });
        if (!match) { counts.unmatched += 1; console.log(`확인 필요  ${place.id} ${place.name}: "${keyword}" 검색에서 같은 구·2km 안의 결과 없음`); continue; }
        counts.matched += 1;
        console.log(`${match.exact ? '일치' : '이름 일부'}${match.km > 0.5 ? '·이동 큼' : ''}  ${place.id} ${place.name} → ${match.item.title} (${Math.round(match.km * 1000)}m, ${match.item.addr1 ?? ''})`);
        Object.assign(place, { lat: Math.round(match.point.lat * 1e6) / 1e6, lng: Math.round(match.point.lng * 1e6) / 1e6, coords_source: 'tourapi', tourapi_id: String(match.item.contentid), tourapi_title: match.item.title ?? '', address: match.item.addr1 ?? '' });
      } catch (error) {
        counts.failed += 1; console.error(`실패  ${place.id}: ${error.message}`);
        if (counts.failed >= 3 && !counts.matched) { console.error('연속으로 실패해 멈췄어요. 키와 활용신청 상태를 확인해 주세요.'); break; }
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    console.log(`일치 ${counts.matched} · 확인 필요 ${counts.unmatched} · 실패 ${counts.failed} · 이미 TourAPI ${counts.skipped}`);
    if (write && counts.matched) { await fs.writeFile(path.join(dataDir, 'places.json'), formatPlacesFile(file)); console.log('data/places.json 좌표를 바꿨어요. node scripts/places.mjs --check-table로 검사와 확인표를 다시 만드세요.'); }
    else if (counts.matched) console.log('바꾸려면 --write를 붙여 다시 실행하세요. 교통 요약은 바뀌지 않으므로 needs_check는 그대로예요.');
  }
}
