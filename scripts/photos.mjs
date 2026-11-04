// P62: a photo for every place a recommendation shows (D45). First a 한국관광공사 photo (TourAPI, 공공누리) when the
// place is in its data; otherwise Kakao image search (S36), which finds pictures posted on news sites and blogs: the
// card shows Kakao's thumbnail (or the original when it sits on Kakao/Daum's own image servers) with "사진: 출처" and
// a link to the page it came from. Those pictures belong to whoever posted them and may show a different spot.
import { distanceKm } from '../dist/geo.mjs';

const TOUR = 'https://apis.data.go.kr/B551011/KorService2';
const KAKAO_CDN = /^https?:\/\/([a-z0-9-]+\.)*(daumcdn\.net|kakaocdn\.net)\//i;
const TOUR_IMAGE = /^https?:\/\/tong\.visitkorea\.or\.kr\//;
const https = (url) => String(url).replace(/^http:/, 'https:');
const norm = (name) => String(name).replace(/\(.*?\)|\[.*?\]|\s|서울/g, '');
// Cafés, restaurants and shops are rarely in the tourism data, so they skip that lookup.
const TOURISM_SKIP = new Set(['cafe', 'restaurant', 'dessert']);

export function tourPhoto(items, place) {
  const key = norm(place.name);
  const hit = items.find((item) => item.firstimage && TOUR_IMAGE.test(item.firstimage) && (norm(item.title).includes(key) || key.includes(norm(item.title)))
    && distanceKm(place, { lat: Number(item.mapy), lng: Number(item.mapx) }) <= 0.5);
  return hit ? { photo: https(hit.firstimage), photo_credit: '한국관광공사', photo_link: null, photo_large: true } : null;
}
export function webPhoto(documents = []) {
  const usable = documents.filter((doc) => KAKAO_CDN.test(doc.thumbnail_url ?? ''));
  const large = usable.find((doc) => KAKAO_CDN.test(doc.image_url ?? '') && Number(doc.width) >= 400);
  const pick = large ?? usable[0];
  if (!pick) return null;
  const link = /^https?:\/\//.test(pick.doc_url ?? '') ? pick.doc_url : null;
  // The thumbnail always comes from Kakao's own search servers, so it is the fallback when the original will not load.
  return { photo: https(large ? pick.image_url : pick.thumbnail_url), photo_thumb: https(pick.thumbnail_url), photo_credit: String(pick.display_sitename || '웹 검색').slice(0, 30), photo_link: link, photo_large: Boolean(large) };
}

export function createPhotos({ tourKey = null, kakaoKey = null, fetchImpl = fetch, now = () => Date.now(), ttlMs = 24 * 3600_000, timeoutMs = 3500 } = {}) {
  const cache = new Map();
  async function getJson(url, headers = {}) {
    try {
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      return response.ok ? await response.json() : null;
    } catch { return null; }
  }
  async function fromTour(place) {
    if (!tourKey || place.tags?.every((tag) => TOURISM_SKIP.has(tag))) return null;
    const url = new URL(`${TOUR}/searchKeyword2`);
    url.search = new URLSearchParams({ serviceKey: tourKey, MobileOS: 'ETC', MobileApp: 'GrowingTravel', _type: 'json', numOfRows: '5', pageNo: '1', arrange: 'A', keyword: norm(place.name).slice(0, 30), lDongRegnCd: '11' });
    const body = await getJson(url);
    const items = body?.response?.body?.items?.item;
    return tourPhoto(Array.isArray(items) ? items : items ? [items] : [], place);
  }
  async function fromWeb(place, guName) {
    if (!kakaoKey) return null;
    const url = new URL('https://dapi.kakao.com/v2/search/image');
    url.search = new URLSearchParams({ query: `${place.name} ${guName ?? '서울'}`.trim().slice(0, 60), size: '6', sort: 'accuracy' });
    const body = await getJson(url, { Authorization: `KakaoAK ${kakaoKey}` });
    return webPhoto(body?.documents);
  }
  // One photo per place, remembered for a day (a miss for an hour), so a place is looked up at most once a day.
  async function photoFor(place, guName) {
    if (place.photo && TOUR_IMAGE.test(place.photo)) return { photo: place.photo, photo_credit: '한국관광공사', photo_link: null, photo_large: true };
    const hit = cache.get(place.id);
    if (hit && now() - hit.at < (hit.value ? ttlMs : 3600_000)) return hit.value;
    const value = (await fromTour(place)) ?? (await fromWeb(place, guName));
    cache.set(place.id, { at: now(), value });
    if (cache.size > 5000) cache.delete(cache.keys().next().value);
    return value;
  }
  async function forPlaces(places, guNames = new Map()) {
    const result = new Map();
    for (let start = 0; start < places.length; start += 6) {
      const batch = places.slice(start, start + 6);
      (await Promise.all(batch.map((place) => photoFor(place, guNames.get(place.gu))))).forEach((value, index) => { if (value) result.set(batch[index].id, value); });
    }
    return result;
  }
  return { configured: Boolean(tourKey || kakaoKey), photoFor, forPlaces };
}
