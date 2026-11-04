import fs from 'node:fs/promises';
import path from 'node:path';

// D44/P60: places found nearby are not in data/places.json, yet a card, its detail and a field report need to find
// them again by id. Shown places are kept in memory for a day; only a place that someone posted a field report about
// is written to data/runtime/places-seen.json (Git 제외), so the shared map and "뜨는 곳" never list places merely
// because someone searched near their home.
export const NEARBY_ID = /^[kt]\d{1,12}$/;
const KEEP_FIELDS = ['id', 'chain', 'name', 'gu', 'lat', 'lng', 'tags', 'purposes', 'kind', 'nearest_station', 'access_summary', 'walk_level', 'summary', 'needs_check', 'coords_source', 'address', 'source', 'source_url', 'photo', 'tourapi_id'];
const pick = (place) => Object.fromEntries(KEEP_FIELDS.filter((key) => place[key] !== undefined).map((key) => [key, place[key]]));

export function createPlaceRegistry({ file, now = () => Date.now(), ttlMs = 24 * 3600_000, limit = 3000 } = {}) {
  const shown = new Map();
  let saved = null;
  async function load() {
    if (saved) return saved;
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      saved = new Map((Array.isArray(parsed?.places) ? parsed.places : []).filter((place) => NEARBY_ID.test(place?.id)).map((place) => [place.id, place]));
    } catch { saved = new Map(); }
    return saved;
  }
  function prune() {
    for (const [id, entry] of shown) if (now() - entry.at > ttlMs) shown.delete(id);
    while (shown.size > limit) shown.delete(shown.keys().next().value);
  }
  return {
    // Places a recommendation just showed (memory only).
    remember(places) {
      for (const place of places) if (NEARBY_ID.test(place.id)) { shown.delete(place.id); shown.set(place.id, { at: now(), place: pick(place) }); }
      prune();
    },
    async get(id) {
      prune();
      return shown.get(id)?.place ?? (await load()).get(id) ?? null;
    },
    async has(id) { return Boolean(await this.get(id)); },
    // A report makes the place public: written to the file so it survives a restart and can show on the map.
    async keep(id) {
      const place = shown.get(id)?.place;
      const store = await load();
      if (!place || store.has(id)) return;
      store.set(id, place);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(temp, `${JSON.stringify({ version: 1, note: '현장 소식이 올라온 근처 검색 장소(카카오·한국관광공사). 팀이 확인하지 않은 정보예요.', places: [...store.values()] }, null, 2)}\n`);
      await fs.rename(temp, file);
    },
    async saved() { return [...(await load()).values()]; },
  };
}
