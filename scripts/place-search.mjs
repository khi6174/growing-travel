// D39/P55: turn a typed departure (주소·역·건물·가게 이름) into a point in Seoul. With KAKAO_REST_KEY the server asks
// Kakao Local (address search plus keyword search limited to the Seoul box); without a key, or when Kakao fails,
// it looks through the app's own stations and candidate places. The query is neither logged nor stored.
import { SEOUL_STATIONS, SEOUL_BOUNDS, insideSeoul } from '../dist/ai-conditions.mjs';

const BASE = 'https://dapi.kakao.com/v2/local/search';
const RECT = `${SEOUL_BOUNDS.lng[0]},${SEOUL_BOUNDS.lat[0]},${SEOUL_BOUNDS.lng[1]},${SEOUL_BOUNDS.lat[1]}`;
export const MAX_QUERY = 60;
const MAX_RESULTS = 7;
const squash = (text) => String(text ?? '').replace(/\s/g, '').toLowerCase();

export function localMatches(query, places = []) {
  const q = squash(query);
  if (q.length < 1) return [];
  const pool = [
    ...SEOUL_STATIONS.map((station) => ({ label: station.label, address: '역 대표 지점', lat: station.lat, lng: station.lng })),
    ...places.map((place) => ({ label: place.name, address: place.address ?? '', lat: place.lat, lng: place.lng })),
  ];
  return pool.filter((item) => squash(item.label).includes(q) || (q.length >= 2 && q.includes(squash(item.label).replace(/역$/, '')))).slice(0, MAX_RESULTS);
}

export class PlaceSearchError extends Error {
  constructor(code) { super(code); this.name = 'PlaceSearchError'; this.code = code; }
}
async function kakao(fetchImpl, key, kind, query) {
  const url = new URL(`${BASE}/${kind}.json`);
  url.search = new URLSearchParams(kind === 'keyword' ? { query, rect: RECT, size: String(MAX_RESULTS) } : { query, size: '5' });
  let response;
  try { response = await fetchImpl(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(4000) }); }
  catch { throw new PlaceSearchError('UNAVAILABLE'); }
  if (!response.ok) throw new PlaceSearchError(response.status === 401 || response.status === 403 ? 'KEY_REJECTED' : 'UNAVAILABLE');
  return (await response.json().catch(() => ({}))).documents ?? [];
}
const fromAddress = (doc) => ({ label: doc.road_address?.building_name || doc.address_name, address: doc.road_address?.address_name || doc.address_name, lat: Number(doc.y), lng: Number(doc.x) });
const fromKeyword = (doc) => ({ label: doc.place_name, address: doc.road_address_name || doc.address_name, lat: Number(doc.y), lng: Number(doc.x) });

export function createPlaceSearch({ key = null, fetchImpl = fetch, places = async () => [] } = {}) {
  return async function search(rawQuery) {
    const query = String(rawQuery ?? '').trim().slice(0, MAX_QUERY);
    if (!query) return { results: [], source: 'none' };
    let reason = 'NO_KEY';
    if (key) {
      try {
        const [addresses, keywords] = await Promise.all([kakao(fetchImpl, key, 'address', query), kakao(fetchImpl, key, 'keyword', query)]);
        const seen = new Set();
        const results = [...addresses.map(fromAddress), ...keywords.map(fromKeyword)]
          .filter((item) => item.label && insideSeoul(item))
          .filter((item) => { const id = `${item.label}|${item.lat.toFixed(4)}|${item.lng.toFixed(4)}`; return !seen.has(id) && seen.add(id); })
          .slice(0, MAX_RESULTS);
        if (results.length) return { results, source: 'kakao' };
        // Kakao knows names and addresses, not descriptions such as "연남동 카페거리"; the app's own list may.
        reason = 'NO_MATCH';
      } catch (error) {
        if (error.name !== 'PlaceSearchError') throw error;
        reason = error.code;
      }
    }
    return { results: localMatches(query, await places()), source: 'local', reason };
  };
}
