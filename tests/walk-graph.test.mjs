import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph, encodeGraph, decodeGraph, prepare, walkRoute, turnOf, simplify, kindOf, KIND, MAX_SNAP_M } from '../scripts/walk-graph.mjs';
import { waysFromOverpass, TILES } from '../scripts/build-walk-graph.mjs';
import { routeStep, summariseRoute } from '../scripts/transit.mjs';
import { createServer } from '../scripts/serve.mjs';

// A small made-up neighbourhood near Anguk: 율곡로 runs east, 북촌로 turns north at its end, a stair path cuts a
// corner, and one lane stands apart (not joined to anything).
const line = (from, to, count) => Array.from({ length: count }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / (count - 1), from[1] + ((to[1] - from[1]) * i) / (count - 1)]);
const ways = [
  { nodes: line([37.5760, 126.9760], [37.5760, 126.9800], 5), name: '율곡로', nameEn: 'Yulgok-ro', kind: KIND.road },
  { nodes: line([37.5760, 126.9800], [37.5800, 126.9800], 5), name: '북촌로', nameEn: '', kind: KIND.road },
  { nodes: [[37.5760, 126.9790], [37.5770, 126.9790]], name: '', kind: KIND.steps },
  { nodes: [[37.5900, 126.9900], [37.5905, 126.9905]], name: '외딴길', kind: KIND.road },
];
const graph = () => prepare(buildGraph(ways));

test('D55/P79 OSM tags become walking kinds; Overpass JSON becomes ways with names; Seoul is fetched in 8 tiles', () => {
  assert.deepEqual([{ highway: 'steps' }, { highway: 'footway', footway: 'crossing' }, { highway: 'footway' }, { highway: 'residential' }].map(kindOf), [KIND.steps, KIND.crossing, KIND.path, KIND.road]);
  const osm = { elements: [{ type: 'node', id: 1, lat: 37.5, lon: 127 }, { type: 'node', id: 2, lat: 37.501, lon: 127 }, { type: 'way', id: 9, nodes: [1, 2], tags: { highway: 'footway', name: '숲길', 'name:en': 'Forest Path' } }, { type: 'way', id: 10, nodes: [1, 3], tags: {} }] };
  assert.deepEqual(waysFromOverpass(osm), [{ nodes: [[37.5, 127], [37.501, 127]], name: '숲길', nameEn: 'Forest Path', kind: KIND.path }], 'a way missing a node is left out');
  assert.equal(TILES.length, 8);
});

test('D55/P79 only the largest connected part is kept, and the file reads back the same', () => {
  const built = buildGraph(ways);
  assert.equal(built.dropped, 2, 'the lone lane is dropped');
  const back = decodeGraph(encodeGraph(built));
  assert.equal(back.m, built.m); assert.equal(back.edges, built.edges);
  assert.deepEqual([...back.lat], [...built.lat]); assert.deepEqual([...back.edgeKind], [...built.edgeKind]);
  assert.deepEqual(back.names, built.names);
});

test('D55/P79 a walk follows the ways, turns left onto 북촌로 and names each part', () => {
  const g = graph();
  const from = { lat: 37.57602, lng: 126.97601 }; const to = { lat: 37.57998, lng: 126.98001 };
  const walk = walkRoute(g, from, to);
  assert.ok(walk.metres > 780 && walk.metres < 820, `${walk.metres}`); // about 352 m east + 445 m north (the stair cut is longer)
  assert.equal(walk.minutes, Math.round(walk.metres / 67));
  assert.deepEqual(walk.path[0], [37.57602, 126.97601]); assert.deepEqual(walk.path.at(-1), [37.57998, 126.98001]);
  assert.ok(walk.path.length <= 6, 'straight runs are simplified');
  assert.deepEqual(walk.steps.map((step) => [step.turn, step.name, step.kind]), [['start', '율곡로', 'road'], ['left', '북촌로', 'road']]);
  assert.equal(walk.steps[0].nameEn, 'Yulgok-ro');
  const again = walkRoute(prepare(decodeGraph(encodeGraph(buildGraph(ways)))), from, to);
  assert.deepEqual(again, walk, 'the same after a save and load');
});

test('D55/P79 no walk is made up: far from any way, too far apart, or without the graph', () => {
  const g = graph();
  assert.equal(walkRoute(g, { lat: 37.5760, lng: 126.9760 }, { lat: 37.5760 + (MAX_SNAP_M + 100) / 111000, lng: 126.9760 }), null);
  assert.equal(walkRoute(g, { lat: 37.5760, lng: 126.9760 }, { lat: 37.65, lng: 126.9760 }), null);
  assert.equal(walkRoute(null, { lat: 37.576, lng: 126.976 }, { lat: 37.577, lng: 126.977 }), null);
});

test('D55/P79 turns, simplification and Kakao transit steps', () => {
  assert.deepEqual([turnOf(90, 95), turnOf(90, 0), turnOf(90, 180), turnOf(90, 275)], ['straight', 'left', 'right', 'back']);
  assert.equal(simplify(line([37.5, 127], [37.51, 127], 20)).length, 2);
  const kakao = { status: 'OK', routes: [{ properties: { totalTime: 1380, transfers: 1, fare: { value: 1550 } }, steps: [
    { properties: { type: 'SUBWAY', time: 810, distance: 6400, guidance: '2호선 (홍대입구 > 을지로3가)', stops: [{ name: '홍대입구' }, { name: '신촌' }, { name: '을지로3가' }], vehicles: [{ name: '2호선' }] } },
    { properties: { type: 'WALKING', time: 148, distance: 144, guidance: '을지로3가역 환승', stops: [{ name: '을지로3가' }, { name: '을지로3가' }] } },
  ] }] };
  const ride = summariseRoute(kakao);
  assert.deepEqual(ride.steps.map((step) => [step.type, step.line, step.from, step.to, step.stops, step.minutes, step.metres]), [['SUBWAY', '2호선', '홍대입구', '을지로3가', 2, 14, 6400], ['WALKING', null, '을지로3가', '을지로3가', 0, 2, 144]]);
  assert.equal(routeStep({}), null);
});

test('D55/P79 POST /api/route walks with the graph, says when there is none, and keeps to Seoul', async () => {
  const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'growing-travel-walk-'));
  for (const file of ['pets.json', 'districts.json', 'gu_friends.json', 'places.json']) await fs.copyFile(path.join(dataDir, file), path.join(work, file));
  const graphFile = path.join(work, 'walk.bin');
  await fs.writeFile(graphFile, encodeGraph(buildGraph(ways)));
  const start = async (walkGraphFile) => {
    const server = createServer({ dataDir: work, aiProvider: { name: 'none', configured: false }, kakaoRestKey: null, tourKey: null, tourEnKey: null, walkGraphFile });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    return { server, post: (body) => fetch(`${base}/api/route`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) };
  };
  const withGraph = await start(graphFile);
  try {
    const walk = await (await withGraph.post({ mode: 'walk', from: { lat: 37.57602, lng: 126.97601 }, to: { lat: 37.57998, lng: 126.98001 } })).json();
    assert.equal(walk.walkData, true); assert.equal(walk.walk.steps[1].name, '북촌로');
    const ride = await (await withGraph.post({ mode: 'transit', from: { lat: 37.57602, lng: 126.97601, label: '안국역' }, to: { lat: 37.57998, lng: 126.98001, name: '북촌' } })).json();
    assert.equal(ride.transit, null, 'no Kakao key, no ride steps');
    const outside = await withGraph.post({ mode: 'walk', from: { lat: 35.1, lng: 129.0 }, to: { lat: 37.57998, lng: 126.98001 } });
    assert.equal(outside.status, 400);
  } finally { withGraph.server.close(); }
  const without = await start(path.join(work, 'missing.bin'));
  try {
    const walk = await (await without.post({ mode: 'walk', from: { lat: 37.57602, lng: 126.97601 }, to: { lat: 37.57998, lng: 126.98001 } })).json();
    assert.deepEqual(walk, { mode: 'walk', walk: null, walkData: false });
  } finally { without.server.close(); }
});

test('D55/P79 one named way stays one step even where part of it is stairs; tiny bits join the step before', () => {
  const trail = [
    { nodes: line([37.5600, 126.9800], [37.5600, 126.9830], 4), name: '남산길', kind: KIND.path },
    { nodes: line([37.5600, 126.9830], [37.5600, 126.9845], 3), name: '남산길', kind: KIND.steps },
    { nodes: line([37.5600, 126.9845], [37.5600, 126.9870], 4), name: '남산길', kind: KIND.path },
    { nodes: [[37.5600, 126.9870], [37.56005, 126.98705]], name: '', kind: KIND.path },
  ];
  const walk = walkRoute(prepare(buildGraph(trail)), { lat: 37.5600, lng: 126.9800 }, { lat: 37.56005, lng: 126.98705 });
  assert.equal(walk.steps.length, 1);
  assert.deepEqual([walk.steps[0].name, walk.steps[0].kind, walk.steps[0].stairs], ['남산길', 'path', true]);
});
