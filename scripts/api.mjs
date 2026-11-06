import { langOr } from '../dist/i18n.mjs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { REAL_PLACES } from '../dist/real-catalog.mjs';
import { loadCatalog, loadPlaces, loadBoundaries } from './places.mjs';
import { createReportStore, ReportError, REPORT_CATEGORIES } from './field-reports.mjs';
import { recommendPlaces, publicPlace } from './recommend.mjs';
import { legBetween, stayMinutes } from '../dist/course-plan.mjs';
import { distanceKm } from '../dist/geo.mjs';
import { arrivalInfo, normalizeArrival } from './arrival.mjs';
import { livingMap } from './living-map.mjs';
import { normalizeConditions, departurePoint, insideSeoul } from '../dist/ai-conditions.mjs';
import { createNearby, NEARBY_TAG_LABELS, PET_EXTRA_TAGS } from './nearby.mjs';
import { createPlaceRegistry, NEARBY_ID } from './place-registry.mjs';
import { createCongestion } from './congestion.mjs';
import { createPhotos } from './photos.mjs';
import { createPlaceSearch } from './place-search.mjs';
import { createTransit } from './transit.mjs';
import { createStatsStore } from './stats.mjs';
import { trending, TRENDING_DAYS } from './trending.mjs';
import { createEnglishNames } from './english-names.mjs';
import { loadWalkGraph, walkRoute } from './walk-graph.mjs';
import { fileURLToPath } from 'node:url';

export const WALK_GRAPH_FILE = fileURLToPath(new URL('../data/walk/seoul-walk.bin', import.meta.url));

const MAX_BODY = 4096;

// Places a report may point at: the existing real catalog plus the validated data/places.json.
export function createPlaceIndex(dataDir) {
  return async function placeIds() {
    const { places } = await loadPlaces(dataDir);
    return new Set([...REAL_PLACES, ...places].map((place) => place.id));
  };
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (!/^application\/json\b/.test(req.headers['content-type'] ?? '')) throw new ReportError('UNSUPPORTED_MEDIA', 'JSON으로 보내 주세요.', 415);
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new ReportError('TOO_LARGE', '요청이 너무 커요.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ReportError('INVALID_JSON', '요청 형식을 읽을 수 없어요.'); }
}

// Writes only from this demo's own pages: browsers send Origin on POST, so a different origin is refused.
function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
}

// District outlines for the browser's arrival check, keyed by district id instead of the census code.
async function districtOutlines(dataDir, districts) {
  const byCode = new Map(districts.map((district) => [district.boundary_code, district.id]));
  const features = await loadBoundaries(dataDir);
  return { type: 'FeatureCollection', features: features.filter((feature) => byCode.has(feature.properties.code)).map((feature) => ({ type: 'Feature', properties: { gu: byCode.get(feature.properties.code) }, geometry: feature.geometry })) };
}

// What the browser needs to draw the pet and friend screens; places stay on the server until the map stage.
function publicCatalog({ pets, tagLabels, regions, districts, friends }) {
  return {
    pets: pets.map(({ id, name, purpose, tags, intro }) => ({ id, name, purpose, intro, tags: tags.map((tag) => tagLabels[tag]), tag_ids: tags })),
    regions, districts: districts.map(({ id, name, region }) => ({ id, name, region })),
    friends: friends.map(({ id, gu, name, concept, greeting, personality, catchphrase, look, pal }) => ({ id, gu, name, concept, greeting, personality, catchphrase, look, pal })),
  };
}

export function createApi({ dataDir, aiProvider = null, aiTimeoutMs = 10000, kakaoJsKey = null, weather = async () => ({ weather: null, reason: 'NO_KEY' }), kakaoRestKey = null, tourKey = null, seoulKey = null, tourEnKey = null, walkGraphFile = WALK_GRAPH_FILE, searchFetch = fetch }) {
  // D39: typed departures; the app's own places are the fallback when Kakao is not set up or does not answer.
  const placeSearch = createPlaceSearch({ key: kakaoRestKey, fetchImpl: searchFetch, places: async () => (await loadCatalog(dataDir)).places });
  // D40: real transit times for the three picks, with the same REST key; null without one (cards keep the estimate).
  const transit = createTransit({ key: kakaoRestKey, fetchImpl: searchFetch });
  const catalogIds = createPlaceIndex(dataDir);
  // D44: places around the chosen point (Kakao, TourAPI) and the ones a recommendation showed (memory) or someone
  // reported on (data/runtime/places-seen.json).
  const nearby = createNearby({ kakaoKey: kakaoRestKey, tourKey, fetchImpl: searchFetch });
  const registry = createPlaceRegistry({ file: path.join(dataDir, 'runtime', 'places-seen.json') });
  // Q16: 서울시 실시간 도시데이터 crowding for picks near the places it covers (data/seoul_hotspots.json).
  const congestion = createCongestion({ seoulKey, kakaoKey: kakaoRestKey, fetchImpl: searchFetch, areas: async () => {
    try { return JSON.parse(await fs.readFile(path.join(dataDir, 'seoul_hotspots.json'), 'utf8')).areas ?? []; } catch { return []; }
  } });
  // P62: a photo for each shown place (한국관광공사 first, then Kakao image search with its source).
  const photos = createPhotos({ tourKey, kakaoKey: kakaoRestKey, fetchImpl: searchFetch });
  // D53/P77: English names from the English TourAPI, shown beside the Korean name in languages other than Korean.
  const englishNames = createEnglishNames({ key: tourEnKey, fetchImpl: searchFetch });
  // D55/P79: the walking graph is read on the first guide request (about 30 MB); null when it was never built.
  let walkGraph;
  const walkGraphOnce = () => (walkGraph === undefined ? (walkGraph = loadWalkGraph(walkGraphFile)) : walkGraph);
  async function placeById(id, catalog) {
    return catalog.places.find((place) => place.id === id) ?? (NEARBY_ID.test(id) ? await registry.get(id) : null);
  }
  // Looking ~120 names up takes a few seconds, so it starts with the server instead of the first recommendation.
  if (congestion.configured) congestion.points().catch(() => {});
  const known = async (id) => (await catalogIds()).has(id) || (NEARBY_ID.test(id) && (await registry.has(id)));
  // Shared screens (map, 뜨는 곳, counts) only use places that are public: the catalog and reported nearby places.
  const isPublic = async (id) => (await catalogIds()).has(id) || (await registry.saved()).some((place) => place.id === id);
  const placeIds = async () => new Set([...(await catalogIds()), ...(await registry.saved()).map((place) => place.id)]);
  async function withSaved(catalog) {
    const saved = (await registry.saved()).filter((place) => catalog.districts.some((district) => district.id === place.gu) && Array.isArray(place.purposes));
    return { ...catalog, places: [...catalog.places, ...saved], tagLabels: { ...catalog.tagLabels, ...NEARBY_TAG_LABELS } };
  }
  const reports = createReportStore({ file: path.join(dataDir, 'runtime', 'reports.json'), isKnownPlace: known });
  // D41: counts for the "뜨는 곳" tabs (picks, 길찾기 openings, arrivals); never who or where from.
  const stats = createStatsStore({ file: path.join(dataDir, 'runtime', 'stats.json') });

  async function handle(req, res, pathname, searchParams) {
    const viewer = req.headers['x-contributor-id'] || null;
    try {
      if (req.method === 'POST' && !sameOrigin(req)) throw new ReportError('FORBIDDEN_ORIGIN', '다른 사이트의 요청은 받을 수 없어요.', 403);
      if (pathname === '/api/reports' && req.method === 'GET') {
        const placeId = searchParams.get('place_id') ?? '';
        if (!(await known(placeId))) throw new ReportError('UNKNOWN_PLACE', '알 수 없는 장소예요.', 404);
        return send(res, 200, { categories: REPORT_CATEGORIES, reports: await reports.list(placeId, viewer) });
      }
      if (pathname === '/api/reports' && req.method === 'POST') {
        const body = await readJson(req);
        const report = await reports.create({ ...body, contributorId: viewer });
        // A report on a nearby place keeps that place (name, point, kind) so the report stays findable and mappable.
        if (NEARBY_ID.test(report.placeId)) await registry.keep(report.placeId);
        return send(res, 201, { report });
      }
      const vote = pathname.match(/^\/api\/reports\/([A-Za-z0-9-]{1,64})\/votes$/);
      if (vote && req.method === 'POST') {
        const body = await readJson(req);
        return send(res, 200, { report: await reports.vote(vote[1], viewer, body?.vote) });
      }
      if (pathname === '/api/contributors/me' && req.method === 'GET') return send(res, 200, await reports.contribution(viewer));
      if (pathname === '/api/catalog' && req.method === 'GET') {
        const catalog = await loadCatalog(dataDir);
        if (catalog.errors.length) throw new ReportError('CATALOG_INVALID', '데이터 파일 형식을 먼저 고쳐 주세요.', 503);
        return send(res, 200, publicCatalog(catalog));
      }
      if (pathname === '/api/recommend' && req.method === 'POST') {
        const body = await readJson(req);
        const catalog = await loadCatalog(dataDir);
        if (catalog.errors.length) throw new ReportError('NO_CANDIDATES', '후보지 파일 형식을 먼저 고쳐 주세요.', 503);
        let conditions;
        const lang = langOr(body?.lang);
        try { conditions = normalizeConditions(body?.conditions, { petIds: catalog.pets.map((pet) => pet.id) }); }
        catch (error) { if (error.name !== 'ConditionError') throw error; return send(res, 400, { error: { code: 'INVALID_CONDITIONS', message: error.message, fields: error.fields } }); }
        const districtIds = new Set(catalog.districts.map((district) => district.id));
        conditions.metFriends = conditions.metFriends.filter((id) => districtIds.has(id));
        // D44: the candidates are places found around the chosen point right now; data/places.json is the fallback.
        let found = null;
        if (nearby.configured) {
          const point = departurePoint(conditions);
          const [around, region, festivals, rests] = await Promise.all([
            nearby.places({ point, hours: conditions.hours, pet: conditions.pet, pets: catalog.pets, districts: catalog.districts, catalogPlaces: catalog.places }),
            nearby.region(point), nearby.festivals(point),
            // D49/P67: cafés and meals for a long course's break.
            conditions.hours >= 3 ? nearby.rests({ point, hours: conditions.hours, districts: catalog.districts }) : [],
          ]);
          found = { ...around, region, festivals, rests };
          registry.remember(around.places);
        }
        const pool = found?.places?.length ? found.places : catalog.places;
        const reportSummaries = await reports.recentSummaries(pool.map((place) => place.id));
        const result = await recommendPlaces({ lang,  conditions, catalog, reportSummaries, provider: aiProvider, timeoutMs: aiTimeoutMs, transit, rests: found?.rests ?? [], nearby: found, crowd: congestion.configured ? (places) => congestion.forPlaces(places) : null });
        if (photos.configured) {
          const found = await photos.forPlaces(result.items.map((item) => item.place), new Map(catalog.districts.map((district) => [district.id, district.name])));
          for (const item of result.items) Object.assign(item.place, found.get(item.place.id) ?? {});
          // Every stop of every course gets a photo too (one lookup per place, remembered for a day).
          const stops = result.courses.flatMap((course) => course.stops.map((stop) => stop.place));
          const unique = [...new Map(stops.map((place) => [place.id, place])).values()].slice(0, 12);
          const more = await photos.forPlaces(unique, new Map(catalog.districts.map((district) => [district.id, district.name])));
          for (const place of stops) Object.assign(place, found.get(place.id) ?? more.get(place.id) ?? {});
        }
        if (lang !== 'ko' && englishNames.configured) {
          await englishNames.addTo([...result.items.map((item) => item.place), ...result.courses.flatMap((course) => course.stops.map((stop) => stop.place)), ...result.more.map((entry) => entry.place)]);
        }
        const counted = [];
        for (const item of result.items) if (await isPublic(item.place_id)) counted.push(item.place_id);
        await stats.recordPicks(conditions.pet, counted);
        return send(res, 200, result);
      }
      if (pathname === '/api/stats/route' && req.method === 'POST') {
        const placeId = String((await readJson(req))?.placeId ?? '');
        if (!(await known(placeId))) throw new ReportError('UNKNOWN_PLACE', '알 수 없는 장소예요.', 404);
        // A nearby place nobody reported on is not counted: the counts would trace where people searched.
        if (!(await isPublic(placeId))) return send(res, 200, { counted: false });
        await stats.recordRoute(placeId);
        return send(res, 200, { counted: true });
      }
      if (pathname === '/api/trending' && req.method === 'GET') {
        const catalog = await loadCatalog(dataDir);
        if (catalog.errors.length) throw new ReportError('CATALOG_INVALID', '데이터 파일 형식을 먼저 고쳐 주세요.', 503);
        const gu = searchParams.get('gu') ?? '';
        if (!catalog.districts.some((district) => district.id === gu)) return send(res, 404, { error: { code: 'UNKNOWN_DISTRICT', message: '알 수 없는 구예요.' } });
        const all = await withSaved(catalog);
        const inGu = all.places.filter((place) => place.gu === gu).map((place) => place.id);
        return send(res, 200, trending({ gu, catalog: all, activity: await reports.activity(inGu, { days: TRENDING_DAYS }), totals: await stats.totals({ days: TRENDING_DAYS }) }));
      }
      if (pathname === '/api/map' && req.method === 'GET') {
        const catalog = await loadCatalog(dataDir);
        if (catalog.errors.length) throw new ReportError('CATALOG_INVALID', '데이터 파일 형식을 먼저 고쳐 주세요.', 503);
        const all = await withSaved(catalog);
        return send(res, 200, livingMap(all, await reports.recentSummaries(all.places.map((place) => place.id)), Date.now()));
      }
      // The Kakao JavaScript key is meant for browsers and only works on the domains registered for it; it lives in
      // .env (KAKAO_JS_KEY) so it never enters the repository.
      if (pathname === '/api/map-config' && req.method === 'GET') return send(res, 200, { kakaoJsKey });
      // D35: the season backdrop blends in Seoul's current weather (KMA). Only the summary reaches the browser.
      if (pathname === '/api/weather' && req.method === 'GET') return send(res, 200, await weather());
      // The typed departure travels in the body (it may be a home address), never in the URL.
      if (pathname === '/api/places/search' && req.method === 'POST') return send(res, 200, await placeSearch((await readJson(req))?.query));
      // P62: photos for places the screen lists later ("더 보기"), up to 10 known places per call.
      if (pathname === '/api/places/photos' && req.method === 'POST') {
        const ids = (await readJson(req))?.ids;
        if (!Array.isArray(ids) || ids.length > 10 || ids.some((id) => typeof id !== 'string' || id.length > 64)) return send(res, 400, { error: { code: 'INVALID_IDS', message: '장소를 10곳까지 보내 주세요.' } });
        const catalog = await loadCatalog(dataDir);
        const places = (await Promise.all(ids.map((id) => placeById(id, catalog)))).filter(Boolean);
        const found = photos.configured ? await photos.forPlaces(places, new Map(catalog.districts.map((district) => [district.id, district.name]))) : new Map();
        return send(res, 200, { photos: Object.fromEntries(found) });
      }
      // D49/P69: live help while following a course, asked after each step. The next stop's crowding and latest field
      // report, up to 4 places around the traveller (or the stop just left) that fit the pet and are not in the course,
      // and events nearby. The point travels in the body, never the URL, and is not stored.
      if (pathname === '/api/course/live' && req.method === 'POST') {
        const body = await readJson(req);
        const catalog = await loadCatalog(dataDir);
        const point = { lat: Number(body?.point?.lat), lng: Number(body?.point?.lng) };
        const pet = catalog.pets.find((item) => item.id === body?.pet);
        const exclude = Array.isArray(body?.exclude) ? body.exclude.filter((id) => typeof id === 'string').slice(0, 20) : [];
        const tastes = Array.isArray(body?.tastes) ? body.tastes.filter((tag) => typeof tag === 'string').slice(0, 8) : [];
        if (!insideSeoul(point) || !pet) return send(res, 400, { error: { code: 'INVALID_LIVE', message: '위치와 펫을 다시 확인해 주세요.' } });
        const tagLabels = { ...catalog.tagLabels, ...NEARBY_TAG_LABELS };
        const guNames = new Map(catalog.districts.map((district) => [district.id, district.name]));
        const nextPlace = typeof body?.next === 'string' ? await placeById(body.next, catalog) : null;
        const [around, festivals, nextCrowd, nextReports] = await Promise.all([
          nearby.configured ? nearby.places({ point, hours: 1, pet: pet.id, pets: catalog.pets, districts: catalog.districts, catalogPlaces: catalog.places }) : { places: catalog.places.filter((place) => place.purposes.includes(pet.id)) },
          nearby.festivals(point, { withinKm: 1.5 }),
          nextPlace && congestion.configured ? congestion.forPlaces([nextPlace]).catch(() => new Map()) : new Map(),
          nextPlace ? reports.recentSummaries([nextPlace.id]) : {},
        ]);
        const own = new Set([...pet.tags, ...(PET_EXTRA_TAGS[pet.id] ?? [])]);
        const liked = new Set(tastes);
        const picks = (around.places ?? []).filter((place) => !exclude.includes(place.id) && distanceKm(point, place) >= 0.05)
          .map((place) => {
            const leg = legBetween(point, place);
            const fit = place.tags.filter((tag) => own.has(tag)).length;
            return { place, leg, value: (fit ? 10 : 8) + (place.tags.some((tag) => liked.has(tag)) ? 2.5 : 0) - leg.minutes / 4 - (place.chain ? 2 : 0) };
          }).filter(({ leg }) => leg.minutes <= 25).sort((a, b) => b.value - a.value).slice(0, 4);
        registry.remember(picks.map(({ place }) => place));
        const crowds = congestion.configured && picks.length ? await congestion.forPlaces(picks.map(({ place }) => place)).catch(() => new Map()) : new Map();
        const photoMap = photos.configured && picks.length ? await photos.forPlaces(picks.map(({ place }) => place), guNames) : new Map();
        const latest = nextPlace ? (nextReports[nextPlace.id] ?? []).find((report) => report.active) ?? null : null;
        const suggestions = picks.map(({ place, leg }) => ({ place: { ...publicPlace(place, { ...catalog, tagLabels }), ...(photoMap.get(place.id) ?? {}) }, leg, stay: stayMinutes(place.tags), crowd: crowds.get(place.id) ?? null, taste: place.tags.some((tag) => liked.has(tag)), guName: guNames.get(place.gu) ?? null }));
        if (langOr(body?.lang) !== 'ko' && englishNames.configured) await englishNames.addTo(suggestions.map((item) => item.place));
        return send(res, 200, {
          next: nextPlace ? { id: nextPlace.id, crowd: nextCrowd.get(nextPlace.id) ?? null, latest_report: latest } : null,
          suggestions,
          festivals: festivals.slice(0, 2),
        });
      }
      // D44: the 행정동 of a point picked on the map ("○○동 근처"); the point travels in the body, never the URL.
      // D55/P79: the way between two points of a course for the in-app guide: a walk computed here from
      // OpenStreetMap, or Kakao's transit ride step by step. Points travel in the body, never in the URL.
      if (pathname === '/api/route' && req.method === 'POST') {
        const body = await readJson(req);
        const point = (value) => ({ lat: Number(value?.lat), lng: Number(value?.lng) });
        const from = point(body?.from); const to = point(body?.to);
        if (!insideSeoul(from) || !insideSeoul(to)) return send(res, 400, { error: { code: 'OUTSIDE_SEOUL', message: '서울 안의 위치를 골라 주세요.' } });
        const mode = body?.mode === 'transit' ? 'transit' : 'walk';
        const graph = walkGraphOnce();
        if (mode === 'walk') return send(res, 200, { mode, walk: walkRoute(graph, from, to), walkData: Boolean(graph) });
        const label = String(body?.from?.label ?? '').slice(0, 40) || '출발'; const name = String(body?.to?.name ?? '').slice(0, 40) || '도착';
        const ride = transit ? await transit({ ...from, label }, { ...to, name }) : null;
        return send(res, 200, { mode, transit: ride, walkData: Boolean(graph) });
      }
      if (pathname === '/api/places/region' && req.method === 'POST') {
        const body = await readJson(req);
        const point = { lat: Number(body?.lat), lng: Number(body?.lng) };
        if (!insideSeoul(point)) return send(res, 400, { error: { code: 'OUTSIDE_SEOUL', message: '서울 안의 위치를 골라 주세요.' } });
        return send(res, 200, { region: await nearby.region(point) });
      }
      if (pathname === '/api/boundaries' && req.method === 'GET') {
        const catalog = await loadCatalog(dataDir);
        if (catalog.errors.length) throw new ReportError('CATALOG_INVALID', '데이터 파일 형식을 먼저 고쳐 주세요.', 503);
        const outlines = await districtOutlines(dataDir, catalog.districts);
        if (outlines.features.length !== catalog.districts.length) throw new ReportError('BOUNDARIES_MISSING', '자치구 경계 파일을 찾을 수 없어요.', 503);
        return send(res, 200, outlines);
      }
      // POST so the traveler's location travels in the body, not in a URL that may be logged.
      if (pathname === '/api/arrival' && req.method === 'POST') {
        const body = await readJson(req);
        const catalog = await loadCatalog(dataDir);
        if (catalog.errors.length) throw new ReportError('CATALOG_INVALID', '데이터 파일 형식을 먼저 고쳐 주세요.', 503);
        let request;
        try { request = normalizeArrival(body, catalog); }
        catch (error) { if (error.name !== 'ArrivalError') throw error; return send(res, 400, { error: { code: 'INVALID_ARRIVAL', message: error.message } }); }
        const all = await withSaved(catalog);
        const reportSummaries = await reports.recentSummaries(all.places.filter((place) => place.gu === request.gu).map((place) => place.id));
        // Only the arrival itself counts (the screen sends arrived: true then), not the refreshes after it.
        if (body?.arrived === true) await stats.recordArrival(request.gu);
        return send(res, 200, arrivalInfo(request, all, reportSummaries));
      }
      return send(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
    } catch (error) {
      if (error instanceof ReportError) return send(res, error.status, { error: { code: error.code, message: error.message } });
      console.error(error);
      return send(res, 500, { error: { code: 'INTERNAL', message: '잠시 후 다시 시도해 주세요.' } });
    }
  }
  return { handle, reports, placeIds };
}
