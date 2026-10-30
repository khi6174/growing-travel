import path from 'node:path';
import { REAL_PLACES } from '../dist/real-catalog.mjs';
import { loadPlaces } from './places.mjs';
import { createReportStore, ReportError, REPORT_CATEGORIES } from './field-reports.mjs';
import { recommendPlaces } from './recommend.mjs';
import { normalizeConditions } from '../dist/ai-conditions.mjs';
import { seoulToday } from '../dist/benefit-catalog.mjs';

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
  return !origin || origin === `http://${req.headers.host}`;
}

export function createApi({ dataDir, aiProvider = null, aiTimeoutMs = 20000 }) {
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
      if (pathname === '/api/recommend' && req.method === 'POST') {
        const body = await readJson(req);
        let conditions;
        try { conditions = normalizeConditions(body?.conditions, { today: seoulToday() }); }
        catch (error) { if (error.name !== 'ConditionError') throw error; return send(res, 400, { error: { code: 'INVALID_CONDITIONS', message: error.message, fields: error.fields } }); }
        const { places, errors } = await loadPlaces(dataDir);
        if (!places.length) throw new ReportError('NO_CANDIDATES', errors.length ? '후보지 파일 형식을 먼저 고쳐 주세요.' : '후보지 목록이 없어요.', 503);
        const reportSummaries = await reports.recentSummaries(places.map((place) => place.id));
        return send(res, 200, await recommendPlaces({ conditions, places, reportSummaries, provider: aiProvider, timeoutMs: aiTimeoutMs }));
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
