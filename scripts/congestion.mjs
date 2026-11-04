// D44/Q16: live crowding from 서울시 실시간 도시데이터 (S35, citydata_ppltn) for picks near one of the ~120 places it
// covers (data/seoul_hotspots.json). Each place's point comes from Kakao keyword search when the server first needs
// it (memory only, 확인 전); a level is asked at most every 5 minutes per place. The API is plain HTTP with the key
// in the path, so it is only called from this server, never from the browser.
import { distanceKm } from '../dist/geo.mjs';
import { insideSeoul } from '../dist/ai-conditions.mjs';
import { populationUrl, areaOf } from './seoul-hotspots.mjs';

// The four levels the API uses, and how much each moves a pick (a crowded place gives way to a calmer one).
export const CROWD_LEVELS = Object.freeze({ 여유: { rank: 0, score: 0.5 }, 보통: { rank: 1, score: 0 }, '약간 붐빔': { rank: 2, score: -1 }, 붐빔: { rank: 3, score: -2 } });
// Names Kakao search does not resolve to the right spot by themselves (checked 2026-11-04).
const QUERY_FOR = Object.freeze({ POI001: '코엑스', POI006: '종로3가역', POI012: '창덕궁', POI072: '여의도공원', POI079: '창동역', POI081: '경동시장', POI130: '서울특별시의회' });
export function lookupQueries(name, code) {
  const plain = name.replace(/\(.*?\)/g, '').trim();
  return [...new Set([QUERY_FOR[code], name, plain, plain.replace(/\s*관광특구$/, ''), plain.split('·')[0]].filter(Boolean))];
}
export function crowdOf(area, now = Date.now()) {
  const level = area?.AREA_CONGEST_LVL;
  if (!CROWD_LEVELS[level]) return null;
  return { code: area.AREA_CD, area: area.AREA_NM, level, rank: CROWD_LEVELS[level].rank, message: String(area.AREA_CONGEST_MSG ?? '').slice(0, 160), time: String(area.PPLTN_TIME ?? '').slice(11, 16), askedAt: new Date(now).toISOString() };
}

export function createCongestion({ seoulKey = null, kakaoKey = null, areas = async () => [], fetchImpl = fetch, now = () => Date.now(), ttlMs = 5 * 60_000, timeoutMs = 5000, withinKm = 0.8 } = {}) {
  const configured = Boolean(seoulKey && kakaoKey);
  let located = null;
  const levels = new Map();
  async function getJson(url, headers = {}) {
    try {
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      return response.ok ? await response.json() : null;
    } catch { return null; }
  }
  async function locate(area) {
    for (const query of lookupQueries(area.name, area.code)) {
      const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
      url.search = new URLSearchParams({ query, rect: '126.76,37.41,127.19,37.72', size: '5' });
      const body = await getJson(url, { Authorization: `KakaoAK ${kakaoKey}` });
      const doc = body?.documents?.find((item) => String(item.address_name).startsWith('서울'));
      const point = doc && { lat: Number(doc.y), lng: Number(doc.x) };
      if (point && insideSeoul(point)) return { ...area, ...point };
    }
    return null;
  }
  // All points, looked up once (six at a time) and kept for the life of the server.
  function points() {
    located ??= (async () => {
      const list = await areas();
      const found = [];
      for (let start = 0; start < list.length; start += 6) found.push(...await Promise.all(list.slice(start, start + 6).map(locate)));
      return found.filter(Boolean);
    })();
    return located;
  }
  async function level(area) {
    const hit = levels.get(area.code);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = crowdOf(areaOf(await getJson(populationUrl(seoulKey, area.code))), now());
    if (value) levels.set(area.code, { at: now(), value });
    return value ?? hit?.value ?? null;
  }
  // The crowding near each place: the closest covered place within 800 m, at most `limit` distinct ones asked.
  async function forPlaces(places, { limit = 8 } = {}) {
    const result = new Map();
    if (!configured || !places.length) return result;
    const all = await points();
    const nearest = places.map((place) => {
      const best = all.map((area) => ({ area, km: distanceKm(place, area) })).filter((item) => item.km <= withinKm).sort((a, b) => a.km - b.km)[0];
      return best ? { place, ...best } : null;
    }).filter(Boolean);
    const asked = [...new Map(nearest.sort((a, b) => a.km - b.km).map((item) => [item.area.code, item.area])).values()].slice(0, limit);
    const answers = new Map((await Promise.all(asked.map(async (area) => [area.code, await level(area)]))).filter(([, value]) => value));
    for (const item of nearest) if (answers.has(item.area.code)) result.set(item.place.id, { ...answers.get(item.area.code), km: Math.round(item.km * 10) / 10 });
    return result;
  }
  return { configured, forPlaces, points };
}
