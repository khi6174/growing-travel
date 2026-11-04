// D44/P60: places around a point, found at request time (like a map app's "이 근처"): Kakao Local category and
// keyword search (S33) and 한국관광공사 TourAPI 위치기반 관광정보·행사 (S34). Only the server holds the keys. Results
// stay in memory for a few minutes so a second look does not ask again; nothing about the traveler is stored.
import { distanceKm } from '../dist/geo.mjs';
import { insideSeoul } from '../dist/ai-conditions.mjs';

const KAKAO = 'https://dapi.kakao.com';
const TOUR = 'https://apis.data.go.kr/B551011/KorService2';
const SEOUL_LDONG = '11';

// Tags that only nearby places use, next to the catalog's own (data/pets.json tag_labels).
// The pets a place fits: its tags meet the pet's own tags or the extra ones above.
export function purposesFor(tags, pets) {
  return pets.filter((pet) => tags.some((tag) => pet.tags.includes(tag) || PET_EXTRA_TAGS[pet.id]?.includes(tag))).map((pet) => pet.id);
}
export const NEARBY_TAG_LABELS = Object.freeze({ cafe: '카페', restaurant: '음식점', attraction: '관광명소', heritage: '문화유적', leisure: '레포츠' });
// What each pet looks for around the point (its 여행 목적), and the extra tags that count as a fit for it.
export const PET_SEARCHES = Object.freeze({
  golden: [{ keyword: '공원' }, { kakao: 'AT4' }, { tour: '28' }, { tour: '12' }],
  shiba: [{ kakao: 'CE7' }, { keyword: '공원' }, { keyword: '서점' }, { tour: '12' }],
  corgi: [{ kakao: 'FD6' }, { kakao: 'CE7' }, { keyword: '시장' }, { tour: '39' }],
  bichon: [{ kakao: 'CE7' }, { kakao: 'AT4' }, { keyword: '전시' }, { tour: '12' }],
  baekgu: [{ kakao: 'CT1' }, { kakao: 'AT4' }, { tour: '14' }, { tour: '12' }],
});
export const PET_EXTRA_TAGS = Object.freeze({ golden: ['leisure'], shiba: ['cafe', 'park'], corgi: ['restaurant', 'cafe'], bichon: ['cafe', 'attraction', 'exhibition'], baekgu: ['heritage'] });

const TOUR_TYPES = Object.freeze({ 12: '관광지', 14: '문화시설', 28: '레포츠', 39: '음식점' });
const TOUR_KINDS = Object.freeze({ A02020700: '공원', A02060100: '박물관', A02060200: '기념관', A02060300: '미술관', A05020900: '카페' });
const has = (text, words) => words.some((word) => text.includes(word));

// Tags only from what the category path or the name says; a cafe is never called quiet without evidence.
export function inferTags({ name = '', path = '', group = '', tourType = '', cat = [] }) {
  const text = `${path} ${name}`;
  const tags = new Set();
  if (has(text, ['공원'])) tags.add('park');
  if (name.includes('한강')) tags.add('hangang');
  if (has(text, ['산책로', '둘레길', '등산로', '숲길', '산책길'])) tags.add('trail');
  if (has(text, ['수목원', '식물원', '정원'])) tags.add('garden');
  if (has(text, ['전망대'])) tags.add('view_walk');
  if (has(text, ['서점', '책방', '북카페', '도서관'])) tags.add('bookstore');
  if (has(text, ['시장'])) tags.add('market');
  if (has(path, ['디저트', '제과', '베이커리', '아이스크림', '떡,한과', '도넛', '와플', '빙수'])) tags.add('dessert');
  if (has(name, ['먹자골목', '음식거리', '먹거리'])) tags.add('food_street');
  if (has(text, ['박물관', '기념관', '역사관'])) tags.add('museum');
  if (has(text, ['미술관', '갤러리', '전시'])) tags.add('exhibition');
  if (has(path, ['고궁', '궁궐', '왕릉']) || /궁(\(|$)/.test(name)) tags.add('palace');
  if (has(text, ['한옥'])) tags.add('hanok');
  if (has(path, ['문화유적', '사적', '유적'])) tags.add('heritage');
  if (has(path, ['테마거리', '카페거리'])) tags.add('aesthetic_alley');
  if (group === 'CE7' || cat[2] === 'A05020900') tags.add('cafe');
  else if (group === 'FD6' || tourType === '39') tags.add('restaurant');
  if (tourType === '28' || has(path, ['스포츠,레저', '레저'])) tags.add('leisure');
  if (cat[1] === 'A0201') tags.add('heritage');
  if (cat[0] === 'A02' && cat[1] === 'A0206' && !tags.has('museum') && !tags.has('exhibition')) tags.add(cat[2] === 'A02060300' ? 'exhibition' : 'museum');
  if (!tags.size && (group === 'AT4' || tourType === '12')) tags.add('attraction');
  return [...tags];
}
const walkLevelOf = (tags, path) => (has(path, ['> 산', '등산']) ? 3 : tags.some((tag) => ['park', 'trail', 'hangang', 'leisure', 'garden'].includes(tag)) ? 2 : 1);
const guOf = (address, districts) => districts.find((district) => district.name === String(address).split(/\s+/)[1])?.id ?? null;
const kindOf = (path) => (path.split('>').map((part) => part.trim()).filter(Boolean).at(-1) ?? '').replaceAll(',', '·');
const httpsOnly = (url) => (typeof url === 'string' && /^https?:\/\/tong\.visitkorea\.or\.kr\//.test(url) ? url.replace(/^http:/, 'https:') : null);
const kakaoPage = (url) => (typeof url === 'string' && /^https?:\/\/place\.map\.kakao\.com\/\d+$/.test(url) ? url.replace(/^http:/, 'https:') : null);

// Rooms and games that share the 카페 category are not trips (방탈출, 보드게임 등).
const NOT_A_TRIP = ['방탈출', '보드카페', '룸카페', 'PC방', '노래방', '키즈카페', '만화카페', '스터디카페', '멀티방', '파티룸', '사주카페', '흡연카페'];
// Water parks only in summer, ice and snow only in winter (Seoul months).
export function inSeason(name, month) {
  if (has(name, ['수영장', '물놀이장', '워터파크', '분수'])) return month >= 6 && month <= 8;
  if (has(name, ['눈썰매', '스케이트장', '아이스링크'])) return month === 12 || month <= 2;
  return true;
}
const seoulMonth = (now) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric' }).format(new Date(now)));

// Each place has the catalog's shape (scripts/places.mjs) plus what it came from; none of it is checked by the team.
export function fromKakao(doc, districts) {
  const lat = Number(doc.y); const lng = Number(doc.x);
  const address = doc.road_address_name || doc.address_name || '';
  const gu = guOf(doc.address_name || address, districts);
  if (!/^\d{1,12}$/.test(String(doc.id)) || !doc.place_name || !insideSeoul({ lat, lng }) || !gu) return null;
  const path = doc.category_name ?? '';
  if (has(path, NOT_A_TRIP)) return null;
  const tags = inferTags({ name: doc.place_name, path, group: doc.category_group_code });
  if (!tags.length) return null;
  // Kakao puts a franchise's brand as the last step of the category ("… > 커피전문점 > 스타벅스").
  const segments = path.split('>').map((part) => part.trim()).filter(Boolean);
  const chain = segments.length >= 3 && segments.at(-1).length >= 2 && String(doc.place_name).startsWith(segments.at(-1));
  return {
    chain, id: `k${doc.id}`, name: String(doc.place_name).slice(0, 60), gu, lat, lng, tags, kind: kindOf(path) || doc.category_group_name || '장소',
    nearest_station: '', access_summary: '', walk_level: walkLevelOf(tags, path), summary: path.replaceAll(' > ', ' · '),
    needs_check: true, coords_source: 'kakao', address, source: 'kakao', source_url: kakaoPage(doc.place_url), photo: null,
  };
}
export function fromTour(item, districts) {
  const lat = Number(item.mapy); const lng = Number(item.mapx);
  const gu = guOf(item.addr1, districts);
  if (!/^\d{1,12}$/.test(String(item.contentid)) || !item.title || !insideSeoul({ lat, lng }) || !gu) return null;
  const cat = [item.cat1, item.cat2, item.cat3];
  const tags = inferTags({ name: item.title, tourType: String(item.contenttypeid), cat });
  if (!tags.length) return null;
  return {
    id: `t${item.contentid}`, name: String(item.title).replace(/^\[[^\]]*\]\s*/, '').replace(/\(서울\)$/, '').slice(0, 60), gu, lat, lng, tags,
    kind: TOUR_KINDS[item.cat3] ?? TOUR_TYPES[item.contenttypeid] ?? '관광지', nearest_station: '', access_summary: '',
    walk_level: walkLevelOf(tags, ''), summary: `${TOUR_TYPES[item.contenttypeid] ?? '관광 정보'} · 한국관광공사`, needs_check: true,
    coords_source: 'tourapi', address: [item.addr1, item.addr2].filter(Boolean).join(' '), source: 'tourapi', source_url: null,
    photo: httpsOnly(item.firstimage || item.firstimage2), tourapi_id: String(item.contentid),
  };
}

const norm = (name) => String(name).replace(/\(.*?\)|\s|서울/g, '');
// The same name within 1 km (a big market has several entrances), a part of a place ("경복궁 연생전", "○○ 별관")
// within 600 m, or one name inside the other within 150 m.
export function samePlace(a, b) {
  const [x, y] = [norm(a.name), norm(b.name)];
  if (x.length < 2 || y.length < 2) return false;
  const km = distanceKm(a, b);
  if (x === y) return km <= 1;
  const [short, long] = x.length <= y.length ? [a, b] : [b, a];
  if (String(long.name).startsWith(`${String(short.name).replace(/\(.*?\)/g, '').trim()} `) && km <= 0.6) return true;
  return (x.includes(y) || y.includes(x)) && km <= 0.15;
}
// One entry per real place: Kakao first, a TourAPI photo joins its Kakao twin, and a place the team already checked
// (data/places.json) stands in for both so its checked access notes and field reports stay attached.
export function mergeNearby(found, catalogPlaces = []) {
  const merged = [];
  for (const place of found) {
    const twin = merged.find((other) => other.id === place.id || samePlace(other, place));
    if (!twin) { merged.push({ ...place }); continue; }
    // The main place (the shorter name) keeps its name and point; a Kakao entry keeps its id and page link.
    if (norm(place.name).length < norm(twin.name).length) Object.assign(twin, { name: place.name, lat: place.lat, lng: place.lng, kind: place.kind, ...(place.source === 'kakao' || twin.source !== 'kakao' ? { id: place.id, source: place.source, source_url: place.source_url, chain: place.chain } : {}) });
    if (!twin.photo && place.photo) twin.photo = place.photo;
    const tags = new Set([...twin.tags, ...place.tags]);
    if (tags.size > 1) tags.delete('attraction');
    twin.tags = [...tags];
  }
  const seen = new Set();
  return merged.map((place) => {
    const checked = catalogPlaces.find((other) => samePlace(other, place));
    return checked ? { ...checked, kind: place.kind, photo: place.photo, source: 'catalog', source_url: place.source_url } : place;
  }).filter((place) => !seen.has(place.id) && seen.add(place.id));
}

// How far to look: a short trip stays within walking distance of the point, a long one reaches further (D44).
export const WALK_MIN_PER_KM = 19.5; // 4 km/h with 30 % detour on the straight line
export function searchRadiusKm(hours) {
  const oneWay = Math.max(5, (hours * 60 - 10) / 2);
  if (hours <= 1) return Math.min(1.5, Math.max(0.4, oneWay / WALK_MIN_PER_KM));
  return Math.min(20, Math.max(1.5, (Math.min(60, hours * 15) - 8) / 2.6));
}
export const walkMinutes = (km) => Math.max(1, Math.round(km * WALK_MIN_PER_KM));

const today = (now) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(now)).replaceAll('-', '');
export function ongoingFestivals(items, point, { now = Date.now(), withinKm = 3, limit = 5 } = {}) {
  const day = today(now);
  return items.filter((item) => item.eventstartdate <= day && day <= item.eventenddate)
    .map((item) => ({ item, lat: Number(item.mapy), lng: Number(item.mapx) }))
    .filter(({ lat, lng }) => insideSeoul({ lat, lng }))
    .map(({ item, lat, lng }) => ({ id: `t${item.contentid}`, title: String(item.title).slice(0, 80), start: item.eventstartdate, end: item.eventenddate, address: item.addr1 ?? '', lat, lng, km: Math.round(distanceKm(point, { lat, lng }) * 10) / 10, photo: httpsOnly(item.firstimage) }))
    .filter((event) => event.km <= withinKm).sort((a, b) => a.km - b.km).slice(0, limit);
}

export function createNearby({ kakaoKey = null, tourKey = null, fetchImpl = fetch, timeoutMs = 4000, ttlMs = 10 * 60_000, now = () => Date.now() } = {}) {
  const cache = new Map();
  async function cached(key, ttl, load) {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttl) return hit.value;
    const value = await load();
    if (value !== null) { cache.set(key, { at: now(), value }); if (cache.size > 300) cache.delete(cache.keys().next().value); }
    return value;
  }
  async function getJson(url, headers = {}) {
    try {
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      return response.ok ? await response.json() : null;
    } catch { return null; }
  }
  // Nearest first; a longer trip also reads Kakao's second page (up to 30 places per search).
  async function kakaoSearch(search, point, radiusM, pages) {
    if (!kakaoKey) return null;
    const docs = [];
    for (let page = 1; page <= pages; page += 1) {
      const url = new URL(`${KAKAO}/v2/local/search/${search.kakao ? 'category' : 'keyword'}.json`);
      url.search = new URLSearchParams({ ...(search.kakao ? { category_group_code: search.kakao } : { query: search.keyword }), x: String(point.lng), y: String(point.lat), radius: String(radiusM), sort: 'distance', size: '15', page: String(page) });
      const body = await getJson(url, { Authorization: `KakaoAK ${kakaoKey}` });
      if (!Array.isArray(body?.documents)) return page === 1 ? null : docs;
      docs.push(...body.documents);
      if (body.meta?.is_end !== false) break;
    }
    return docs;
  }
  async function tourSearch(search, point, radiusM) {
    if (!tourKey) return null;
    const url = new URL(`${TOUR}/locationBasedList2`);
    url.search = new URLSearchParams({ serviceKey: tourKey, MobileOS: 'ETC', MobileApp: 'GrowingTravel', _type: 'json', mapX: String(point.lng), mapY: String(point.lat), radius: String(radiusM), arrange: 'E', numOfRows: '30', pageNo: '1', contentTypeId: search.tour });
    const body = await getJson(url);
    if (body?.response?.header?.resultCode !== '0000') return null;
    const items = body.response.body?.items?.item;
    return Array.isArray(items) ? items : items ? [items] : [];
  }

  // All of one pet's searches around a point, merged; `reason` says why nothing came back.
  async function places({ point, hours, pet, pets, districts, catalogPlaces = [] }) {
    if (!kakaoKey && !tourKey) return { places: [], reason: 'NO_KEY', radiusKm: 0 };
    const radiusKm = searchRadiusKm(hours);
    const radiusM = Math.round(radiusKm * 1000);
    const pages = hours >= 2 ? 2 : 1;
    const at = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
    const searches = PET_SEARCHES[pet] ?? [];
    const answers = await Promise.all(searches.map((search) => cached(`${JSON.stringify(search)}|${at}|${radiusM}|${pages}`, ttlMs, async () => {
      if (search.tour) { const items = await tourSearch(search, point, radiusM); return items && items.map((item) => fromTour(item, districts)).filter(Boolean); }
      const docs = await kakaoSearch(search, point, radiusM, pages);
      return docs && docs.map((doc) => fromKakao(doc, districts)).filter(Boolean);
    })));
    const ok = answers.filter(Boolean);
    const month = seoulMonth(now());
    // The team's own places inside the radius join too: they are near, fit the pet and carry checked access notes.
    const local = ok.length ? catalogPlaces.filter((place) => place.purposes.includes(pet) && distanceKm(point, place) <= radiusKm).map((place) => ({ ...place, source: 'catalog' })) : [];
    const found = mergeNearby([...ok.flat(), ...local], catalogPlaces).filter((place) => distanceKm(point, place) <= radiusKm * 1.05 && inSeason(place.name, month))
      .map((place) => (place.source === 'catalog' ? place : { ...place, purposes: purposesFor(place.tags, pets) })).filter((place) => place.purposes.includes(pet));
    return { places: found, radiusKm, reason: !ok.length ? 'UNAVAILABLE' : !found.length ? 'NO_MATCH' : null, answered: ok.length, asked: searches.length };
  }
  // 행사·축제 going on today in Seoul, from one list fetched at most every 6 hours.
  async function festivals(point, { withinKm = 3 } = {}) {
    if (!tourKey) return [];
    const day = today(now());
    const items = await cached(`festivals|${day}`, 6 * 3600_000, async () => {
      const url = new URL(`${TOUR}/searchFestival2`);
      url.search = new URLSearchParams({ serviceKey: tourKey, MobileOS: 'ETC', MobileApp: 'GrowingTravel', _type: 'json', eventStartDate: String(Number(day) - 10000), numOfRows: '500', pageNo: '1', arrange: 'A', lDongRegnCd: SEOUL_LDONG });
      const body = await getJson(url);
      if (body?.response?.header?.resultCode !== '0000') return null;
      const list = body.response.body?.items?.item;
      return Array.isArray(list) ? list : list ? [list] : [];
    });
    return items ? ongoingFestivals(items, point, { now: now(), withinKm }) : [];
  }
  // The 행정동 (and its 구) for a point, to name "○○동 근처".
  async function region(point) {
    if (!kakaoKey) return null;
    return cached(`region|${point.lat.toFixed(3)},${point.lng.toFixed(3)}`, 24 * 3600_000, async () => {
      const url = new URL(`${KAKAO}/v2/local/geo/coord2regioncode.json`);
      url.search = new URLSearchParams({ x: String(point.lng), y: String(point.lat) });
      const body = await getJson(url, { Authorization: `KakaoAK ${kakaoKey}` });
      const doc = body?.documents?.find((item) => item.region_type === 'H') ?? body?.documents?.[0];
      return doc ? { dong: doc.region_3depth_name || '', gu: doc.region_2depth_name || '' } : null;
    });
  }
  return { places, festivals, region, configured: Boolean(kakaoKey || tourKey) };
}
