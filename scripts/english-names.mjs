// D53/P77: English names for places, from the Korea Tourism Organization's English TourAPI (EngService2, TOURAPI_EN_KEY).
// Its titles read "English (한국어)". The place's Korean name is searched (searchKeyword2 takes Korean); an item counts
// when its Korean part is the same name within MATCH_KM, or shares 3+ letters within NEAR_KM. Nothing is made up:
// a place with no match keeps just its Korean name.
// The key stays on the server; one lookup per place, remembered for a day (a miss for an hour).
const ENG = 'https://apis.data.go.kr/B551011/EngService2';
export const MATCH_KM = 1.5;
export const NEAR_KM = 0.3;
const squash = (text) => String(text ?? '').replace(/[\s·・,.'’()\-&]/g, '').toLowerCase();

// "Gwanghwamun Gate (광화문)" → { en: 'Gwanghwamun Gate', ko: '광화문' }. A title without Korean in brackets has no ko.
export function splitTitle(title) {
  const match = String(title ?? '').trim().match(/^(.*?)\s*\(([^()]*[가-힣][^()]*)\)\s*$/);
  // Shop tags such as "[Tax Refund Shop]" are dropped.
  const clean = (text) => text.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  return match ? { en: clean(match[1]), ko: match[2].trim() } : { en: clean(String(title ?? '')), ko: '' };
}
const km = (a, b) => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad; const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
// The closest item whose Korean name equals the place's, or contains it / is contained in it (3+ letters).
export function matchEnglish(place, items) {
  const own = squash(place.name);
  let best = null;
  for (const item of items) {
    const { en, ko } = splitTitle(item.title);
    if (!en || !ko) continue;
    const theirs = squash(ko);
    const exact = theirs === own;
    const partial = !exact && Math.min(theirs.length, own.length) >= 3 && (theirs.includes(own) || own.includes(theirs));
    if (!exact && !partial) continue;
    const distance = km(place, { lat: Number(item.mapy), lng: Number(item.mapx) });
    if (!(distance <= (exact ? MATCH_KM : NEAR_KM))) continue;
    if (!best || distance < best.distance) best = { name_en: en, address_en: item.addr1 || null, distance };
  }
  return best ? { name_en: best.name_en, address_en: best.address_en } : null;
}

export function createEnglishNames({ key = null, fetchImpl = fetch, now = () => Date.now(), ttlMs = 24 * 3600_000, timeoutMs = 3500 } = {}) {
  const cache = new Map();
  async function around(place) {
    const url = new URL(`${ENG}/searchKeyword2`);
    url.search = new URLSearchParams({ serviceKey: key, MobileOS: 'ETC', MobileApp: 'GrowingTravel', _type: 'json', keyword: String(place.name).replace(/[·()]/g, ' ').trim().slice(0, 30), numOfRows: '20', pageNo: '1' });
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) return null;
      const items = (await response.json())?.response?.body?.items?.item;
      return Array.isArray(items) ? items : items ? [items] : [];
    } catch { return null; }
  }
  async function nameFor(place) {
    if (!key || !Number.isFinite(place?.lat) || !Number.isFinite(place?.lng)) return null;
    const hit = cache.get(place.id);
    if (hit && now() - hit.at < (hit.value ? ttlMs : 3600_000)) return hit.value;
    const items = await around(place);
    const value = items ? matchEnglish(place, items) : null;
    if (items) cache.set(place.id, { at: now(), value });
    if (cache.size > 5000) cache.delete(cache.keys().next().value);
    return value;
  }
  // Adds name_en / address_en to the given place objects in place (6 lookups at a time).
  async function addTo(places) {
    const unique = [...new Map(places.filter(Boolean).map((place) => [place.id, place])).values()].slice(0, 30);
    const found = new Map();
    for (let start = 0; start < unique.length; start += 6) {
      const batch = unique.slice(start, start + 6);
      (await Promise.all(batch.map(nameFor))).forEach((value, index) => { if (value) found.set(batch[index].id, value); });
    }
    for (const place of places) if (place && found.has(place.id)) Object.assign(place, found.get(place.id));
    return found;
  }
  return { configured: Boolean(key), nameFor, addTo };
}
