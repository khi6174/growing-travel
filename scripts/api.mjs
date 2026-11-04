import path from 'node:path';
import { REAL_PLACES } from '../dist/real-catalog.mjs';
import { loadCatalog, loadPlaces, loadBoundaries } from './places.mjs';
import { createReportStore, ReportError, REPORT_CATEGORIES } from './field-reports.mjs';
import { recommendPlaces } from './recommend.mjs';
import { arrivalInfo, normalizeArrival } from './arrival.mjs';
import { livingMap } from './living-map.mjs';
import { normalizeConditions } from '../dist/ai-conditions.mjs';
import { createPlaceSearch } from './place-search.mjs';
import { createTransit } from './transit.mjs';

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
    pets: pets.map(({ id, name, purpose, tags, intro }) => ({ id, name, purpose, intro, tags: tags.map((tag) => tagLabels[tag]) })),
    regions, districts: districts.map(({ id, name, region }) => ({ id, name, region })),
    friends: friends.map(({ id, gu, name, concept, greeting }) => ({ id, gu, name, concept, greeting })),
  };
}

export function createApi({ dataDir, aiProvider = null, aiTimeoutMs = 10000, kakaoJsKey = null, weather = async () => ({ weather: null, reason: 'NO_KEY' }), kakaoRestKey = null, searchFetch = fetch }) {
  // D39: typed departures; the app's own places are the fallback when Kakao is not set up or does not answer.
  const placeSearch = createPlaceSearch({ key: kakaoRestKey, fetchImpl: searchFetch, places: async () => (await loadCatalog(dataDir)).places });
  // D40: real transit times for the three picks, with the same REST key; null without one (cards keep the estimate).
  const transit = createTransit({ key: kakaoRestKey, fetchImpl: searchFetch });
  const placeIds = createPlaceIndex(dataDir);
  const reports = createReportStore({ file: path.join(dataDir, 'runtime', 'reports.json'), isKnownPlace: async (id) => (await placeIds()).has(id) });

  async function handle(req, res, pathname, searchParams) {
    const viewer = req.headers['x-contributor-id'] || null;
    try {
      if (req.method === 'POST' && !sameOrigin(req)) throw new ReportError('FORBIDDEN_ORIGIN', '다른 사이트의 요청은 받을 수 없어요.', 403);
      if (pathname === '/api/reports' && req.method === 'GET') {
        const placeId = searchParams.get('place_id') ?? '';
        if (!(await placeIds()).has(placeId)) throw new ReportError('UNKNOWN_PLACE', '알 수 없는 장소예요.', 404);
        return send(res, 200, { categories: REPORT_CATEGORIES, reports: await reports.list(placeId, viewer) });
      }
      if (pathname === '/api/reports' && req.method === 'POST') {
        const body = await readJson(req);
        return send(res, 201, { report: await reports.create({ ...body, contributorId: viewer }) });
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
        try { conditions = normalizeConditions(body?.conditions, { petIds: catalog.pets.map((pet) => pet.id) }); }
        catch (error) { if (error.name !== 'ConditionError') throw error; return send(res, 400, { error: { code: 'INVALID_CONDITIONS', message: error.message, fields: error.fields } }); }
        const districtIds = new Set(catalog.districts.map((district) => district.id));
        conditions.metFriends = conditions.metFriends.filter((id) => districtIds.has(id));
        const reportSummaries = await reports.recentSummaries(catalog.places.map((place) => place.id));
        return send(res, 200, await recommendPlaces({ conditions, catalog, reportSummaries, provider: aiProvider, timeoutMs: aiTimeoutMs, transit }));
      }
      if (pathname === '/api/map' && req.method === 'GET') {
        const catalog = await loadCatalog(dataDir);
        if (catalog.errors.length) throw new ReportError('CATALOG_INVALID', '데이터 파일 형식을 먼저 고쳐 주세요.', 503);
        return send(res, 200, livingMap(catalog, await reports.recentSummaries(catalog.places.map((place) => place.id)), Date.now()));
      }
      // The Kakao JavaScript key is meant for browsers and only works on the domains registered for it; it lives in
      // .env (KAKAO_JS_KEY) so it never enters the repository.
      if (pathname === '/api/map-config' && req.method === 'GET') return send(res, 200, { kakaoJsKey });
      // D35: the season backdrop blends in Seoul's current weather (KMA). Only the summary reaches the browser.
      if (pathname === '/api/weather' && req.method === 'GET') return send(res, 200, await weather());
      // The typed departure travels in the body (it may be a home address), never in the URL.
      if (pathname === '/api/places/search' && req.method === 'POST') return send(res, 200, await placeSearch((await readJson(req))?.query));
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
        const reportSummaries = await reports.recentSummaries(catalog.places.filter((place) => place.gu === request.gu).map((place) => place.id));
        return send(res, 200, arrivalInfo(request, catalog, reportSummaries));
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
