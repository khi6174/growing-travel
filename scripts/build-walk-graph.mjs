// D55/P79: `node scripts/build-walk-graph.mjs` downloads Seoul's walkable ways from OpenStreetMap (Overpass API) and
// writes data/walk/seoul-walk.bin for the in-app walking directions. Run it once, and again now and then to refresh.
// The file is not in Git (about 20 MB); without it the app keeps its straight-line estimates.
// Data © OpenStreetMap contributors, ODbL 1.0 — the guide screen shows that credit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph, encodeGraph, kindOf } from './walk-graph.mjs';

export const WALK_HIGHWAYS = 'footway|path|pedestrian|steps|living_street|residential|service|unclassified|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|track|cycleway|corridor|crossing';
// Seoul in 8 tiles [south, west, north, east] so each request stays small enough for the public servers.
export const TILES = [];
for (const [south, north] of [[37.41, 37.565], [37.565, 37.72]]) {
  for (const [west, east] of [[126.76, 126.87], [126.87, 126.98], [126.98, 127.09], [127.09, 127.19]]) TILES.push([south, west, north, east]);
}
export const overpassQuery = ([south, west, north, east]) => `[out:json][timeout:300];
area["name"="서울특별시"]["admin_level"="4"]->.seoul;
way(area.seoul)(${south},${west},${north},${east})["highway"~"^(${WALK_HIGHWAYS})$"]["foot"!~"^(no|private)$"]["access"!~"^(no|private)$"]["area"!="yes"];
out body qt;
>;
out skel qt;`;

// Overpass JSON → ways with coordinates, names and kinds.
export function waysFromOverpass(osm) {
  const nodes = new Map();
  for (const el of osm.elements) if (el.type === 'node') nodes.set(el.id, [el.lat, el.lon]);
  const ways = [];
  for (const el of osm.elements) {
    if (el.type !== 'way') continue;
    const coords = el.nodes.map((id) => nodes.get(id)).filter(Boolean);
    if (coords.length < 2) continue;
    const tags = el.tags ?? {};
    ways.push({ nodes: coords, name: tags.name ?? '', nameEn: tags['name:en'] ?? '', kind: kindOf(tags) });
  }
  return ways;
}

const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// One tile; public servers are busy at times, so each failure waits a little and tries the next server.
async function fetchTile(tile, label) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const server = SERVERS[attempt % SERVERS.length];
    const host = new URL(server).host;
    try {
      const response = await fetch(server, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'growing-travel/0.1 (walk graph build)' }, body: new URLSearchParams({ data: overpassQuery(tile) }), signal: AbortSignal.timeout(180_000) });
      if (response.ok) return await response.json();
      console.log(`${label}: ${host} 응답 ${response.status}`);
    } catch (error) { console.log(`${label}: ${host} 연결 실패(${error.message})`); }
    await wait(5000 * (attempt + 1));
  }
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const out = fileURLToPath(new URL('../data/walk/seoul-walk.bin', import.meta.url));
  const started = Date.now();
  console.log(`OpenStreetMap에서 서울 걷는 길을 ${TILES.length}칸으로 나눠 받는 중이에요(몇 분 걸려요).`);
  const elements = new Map(); let base = null;
  for (const [index, tile] of TILES.entries()) {
    const label = `칸 ${index + 1}/${TILES.length}`;
    const part = await fetchTile(tile, label);
    if (!part) { console.error('OpenStreetMap 자료를 받지 못했어요. 잠시 뒤 다시 실행해 주세요.'); process.exit(1); }
    base ??= part.osm3s?.timestamp_osm_base ?? null;
    for (const el of part.elements) elements.set(`${el.type}${el.id}`, el);
    console.log(`${label} 받음 (${part.elements.length}개)`);
  }
  const graph = buildGraph(waysFromOverpass({ elements: [...elements.values()] }));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encodeGraph(graph));
  fs.writeFileSync(out.replace(/\.bin$/, '.json'), JSON.stringify({ builtAt: new Date().toISOString(), osmBase: base, nodes: graph.m, edges: graph.edges, names: graph.names.length, dropped: graph.dropped, license: 'ODbL 1.0, © OpenStreetMap contributors' }, null, 2));
  console.log(`완료: 지점 ${graph.m}개, 길 조각 ${graph.edges / 2}개, 길 이름 ${graph.names.length}개, 끊긴 지점 ${graph.dropped}개 제외, ${(fs.statSync(out).size / 1e6).toFixed(1)}MB, ${Math.round((Date.now() - started) / 1000)}초 → ${path.relative(process.cwd(), out)}`);
}
