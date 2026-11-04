import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './serve.mjs';
import { providerFromEnv } from './ai-provider.mjs';
import { loadCatalog } from './places.mjs';
import { rankCandidates, CANDIDATE_COUNT, MAX_MINUTES } from './recommend.mjs';
import { NEARBY_TAG_LABELS, PET_EXTRA_TAGS } from './nearby.mjs';
import { departurePoint } from '../dist/ai-conditions.mjs';
import { distanceKm } from '../dist/geo.mjs';

// 명세 4장 (단계 4): the ten scenarios, sent through POST /api/recommend like the app does, and the four pass rules
// checked per pick. Runs on a fresh copy of data/*.json with no field reports, so a rerun gives the same input.
export const SCENARIOS = Object.freeze([
  ['golden', 'hongik', 4, 2, 3], ['golden', 'gangnam', 3, 1, 2], ['shiba', 'sinchon', 3, 2, 1], ['shiba', 'jamsil', 2, 1, 1], ['corgi', 'seoul', 3, 3, 2],
  ['corgi', 'konkuk', 2, 2, 1], ['bichon', 'seongsu', 3, 2, 2], ['bichon', 'yeouido', 2, 2, 2, 'evening'], ['baekgu', 'gyeongbokgung', 4, 2, 2], ['baekgu', 'dongnimmun', 2, 1, 1],
]);
export const scenarioConditions = ([pet, departure, hours, partySize, walkLevel, timeOfDay = 'day']) => ({ pet, departure, location: null, hours, partySize, walkLevel, timeOfDay, metFriends: [] });
const DATA_FILES = ['pets.json', 'districts.json', 'gu_friends.json', 'places.json'];

// "이유가 목적과 연결됨" is read as the reason naming a purpose tag of that pet or the purpose itself; whether the
// pet's voice reads well is still a person's call.
// D44: picks found around the point are judged the same way, with "후보 안" read as "inside the search radius" and
// the purpose tags including the extra ones a nearby place can carry (카페, 문화유적 …).
export function checkNearby(conditions, result, catalog) {
  const pet = catalog.pets.find((item) => item.id === conditions.pet);
  const labels = { ...catalog.tagLabels, ...NEARBY_TAG_LABELS };
  const fits = [...pet.tags, ...(PET_EXTRA_TAGS[pet.id] ?? [])].map((tag) => labels[tag]);
  const origin = departurePoint(conditions);
  const items = result.items.map((item) => {
    const checks = {
      purpose: item.place.tags.some((tag) => fits.includes(tag)),
      within60: item.minutes <= MAX_MINUTES && item.minutes * 2 + 10 <= conditions.hours * 60,
      candidate: distanceKm(origin, item.place) <= result.nearby.radiusKm * 1.05,
      reason: [...fits, pet.purpose, item.place.kind].filter(Boolean).some((word) => item.reason.includes(word)),
    };
    return { ...item, checks, pass: Object.values(checks).every(Boolean) };
  });
  const three = items.length === 3 && new Set(items.map((item) => item.place_id)).size === 3;
  return { items, three, pass: three && items.every((item) => item.pass) };
}

export function checkScenario(conditions, result, catalog) {
  if (result.nearby?.used) return checkNearby(conditions, result, catalog);
  const pet = catalog.pets.find((item) => item.id === conditions.pet);
  const candidates = new Set(rankCandidates(conditions, catalog).slice(0, CANDIDATE_COUNT).map(({ place }) => place.id));
  const words = [...pet.tags.map((tag) => catalog.tagLabels[tag]), pet.purpose];
  const items = result.items.map((item) => {
    const place = catalog.places.find((entry) => entry.id === item.place_id);
    const checks = {
      purpose: Boolean(place?.purposes.includes(pet.id) && place.tags.some((tag) => pet.tags.includes(tag))),
      within60: item.minutes <= MAX_MINUTES,
      candidate: candidates.has(item.place_id),
      reason: words.some((word) => item.reason.includes(word)),
    };
    return { ...item, checks, pass: Object.values(checks).every(Boolean) };
  });
  const three = items.length === 3 && new Set(items.map((item) => item.place_id)).size === 3;
  return { items, three, pass: three && items.every((item) => item.pass) };
}

export async function runScenarios({ provider, timeoutMs, catalogOnly = false, dataDir = fileURLToPath(new URL('../data/', import.meta.url)) }) {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'growing-travel-scenarios-'));
  try {
    for (const file of DATA_FILES) await fs.copyFile(path.join(dataDir, file), path.join(work, file));
    const catalog = await loadCatalog(work);
    if (catalog.errors.length) throw new Error(catalog.errors.join('\n'));
    // --catalog turns the nearby search off, so the fallback (data/places.json) gives the same answer every run.
    const server = createServer({ dataDir: work, aiProvider: provider, ...(timeoutMs ? { aiTimeoutMs: timeoutMs } : {}), ...(catalogOnly ? { kakaoRestKey: null, tourKey: null } : {}) });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const rows = [];
    try {
      for (const [index, scenario] of SCENARIOS.entries()) {
        const conditions = scenarioConditions(scenario);
        const started = Date.now();
        const response = await fetch(`${base}/api/recommend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conditions }) });
        const result = await response.json();
        if (!response.ok) throw new Error(`시나리오 ${index + 1}: HTTP ${response.status} ${result.error?.message ?? ''}`);
        rows.push({ index: index + 1, conditions, nearby: Boolean(result.nearby?.used), conditionsText: result.conditionsText, source: result.source, fallbackReason: result.fallbackReason ?? null, dropped: result.dropped ?? 0, elapsedMs: Date.now() - started, ...checkScenario(conditions, result, catalog) });
      }
    } finally { await new Promise((resolve) => server.close(resolve)); }
    return rows;
  } finally { await fs.rm(work, { recursive: true, force: true }); }
}

const mark = (ok) => (ok ? '통과' : '**실패**');
export function scenarioTable(rows) {
  return [
    '| # | 조건 | 추천 3곳 (추정 시간, 걷기 단계) | 목적 태그 | 60분 안 | 후보 안(근처: 반경 안) | 이유-목적 | 결과 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.index} | ${row.conditionsText} | ${row.items.map((item) => `${item.place.name}(${item.minutes}분, ${item.place.walk_level})`).join(' · ')} | ${['purpose', 'within60', 'candidate', 'reason'].map((key) => mark(row.three && row.items.every((item) => item.checks[key]))).join(' | ')} | ${mark(row.pass)} |`),
  ].join('\n');
}

// `node scripts/scenarios.mjs` uses the AI set in .env (rule ranking when none); `--rules` forces rule ranking;
// `--out <file>` also saves every pick, reason and check as JSON evidence.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch (error) { if (error.code !== 'ENOENT') console.error(`.env not loaded: ${error.message}`); }
  const provider = process.argv.includes('--rules') ? providerFromEnv({ AI_PROVIDER: 'none' }) : providerFromEnv();
  const catalogOnly = process.argv.includes('--catalog');
  const rows = await runScenarios({ provider, catalogOnly, timeoutMs: Number(process.env.AI_TIMEOUT_MS) || undefined });
  const around = rows.filter((row) => row.nearby).length;
  console.log(`후보: ${catalogOnly ? '팀이 정리한 장소(--catalog)' : `근처 실시간 검색 ${around}/${rows.length}개, 나머지는 팀이 정리한 장소`}`);
  const passed = rows.filter((row) => row.pass).length;
  console.log(`\nAI: ${provider.configured ? `${provider.name} (${provider.model})` : `${provider.name} 설정 없음, 규칙 정렬`} · 현장 소식 없음\n`);
  console.log(scenarioTable(rows));
  console.log(`\n통과 ${passed} / ${rows.length}`);
  const outArg = process.argv.indexOf('--out');
  if (outArg !== -1) {
    const out = path.resolve(process.argv[outArg + 1]);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, JSON.stringify({ ranAt: new Date().toISOString(), ai: { name: provider.name, configured: provider.configured, model: provider.model ?? null }, fieldReports: 'none', rows }, null, 2) + '\n');
    console.log(`저장: ${path.relative(process.cwd(), out)}`);
  }
  process.exitCode = passed === rows.length ? 0 : 1;
}
