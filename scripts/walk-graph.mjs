// D55/P79: walking directions computed here, from OpenStreetMap's walkable ways in Seoul (ODbL, © OpenStreetMap
// contributors). `node scripts/build-walk-graph.mjs` makes data/walk/seoul-walk.bin once; the server loads it (about
// 30 MB of memory) and finds the shortest walk between two points in a few milliseconds. Nothing is sent anywhere.
import fs from 'node:fs';

export const WALK_M_PER_MIN = 67; // about 4 km/h
export const MAX_SNAP_M = 300; // a point farther than this from any walkable way is not routed
export const MAX_ROUTE_KM = 6;
export const KIND = Object.freeze({ road: 0, path: 1, steps: 2, crossing: 3 });
const KIND_NAME = ['road', 'path', 'steps', 'crossing'];
const MAGIC = 0x47545731; // "GTW1"
const R = 6371000; const rad = Math.PI / 180;
export function metres(aLat, aLng, bLat, bLng) {
  const dLat = (bLat - aLat) * rad; const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function kindOf(tags = {}) {
  if (tags.highway === 'steps') return KIND.steps;
  if (tags.footway === 'crossing' || tags.highway === 'crossing' || tags.path === 'crossing') return KIND.crossing;
  if (['footway', 'path', 'pedestrian', 'cycleway', 'corridor', 'bridleway'].includes(tags.highway)) return KIND.path;
  return KIND.road;
}

// Ways ({ nodes: [[lat, lng], …], name, nameEn, kind }) → the largest connected part as typed arrays, both directions.
export function buildGraph(ways) {
  const index = new Map(); const lat = []; const lng = [];
  const idOf = ([la, ln]) => {
    const key = `${Math.round(la * 1e6)},${Math.round(ln * 1e6)}`;
    let i = index.get(key);
    if (i === undefined) { i = lat.length; index.set(key, i); lat.push(la); lng.push(ln); }
    return i;
  };
  const names = [['', '']]; const nameIndex = new Map([['\u0000', 0]]);
  const nameOf = (name = '', nameEn = '') => {
    const key = `${name}\u0000${nameEn}`;
    let i = nameIndex.get(key);
    if (i === undefined) { i = names.length; nameIndex.set(key, i); names.push([name, nameEn]); }
    return i;
  };
  const from = []; const to = []; const edgeName = []; const edgeKind = [];
  for (const way of ways) {
    const nm = way.name || way.nameEn ? nameOf(way.name ?? '', way.nameEn ?? '') : 0;
    for (let k = 1; k < way.nodes.length; k += 1) {
      const a = idOf(way.nodes[k - 1]); const b = idOf(way.nodes[k]);
      if (a === b) continue;
      from.push(a); to.push(b); edgeName.push(nm); edgeKind.push(way.kind ?? KIND.road);
    }
  }
  const n = lat.length;
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let e = 0; e < from.length; e += 1) { const a = find(from[e]); const b = find(to[e]); if (a !== b) parent[a] = b; }
  const size = new Map();
  for (let i = 0; i < n; i += 1) { const r = find(i); size.set(r, (size.get(r) ?? 0) + 1); }
  const mainRoot = [...size].sort((x, y) => y[1] - x[1])[0]?.[0];
  const keep = new Int32Array(n).fill(-1); let m = 0;
  for (let i = 0; i < n; i += 1) if (find(i) === mainRoot) keep[i] = m++;
  const degree = new Uint32Array(m); let edges = 0;
  for (let e = 0; e < from.length; e += 1) if (keep[from[e]] >= 0 && keep[to[e]] >= 0) { degree[keep[from[e]]]++; degree[keep[to[e]]]++; edges += 2; }
  const offsets = new Uint32Array(m + 1);
  for (let i = 0; i < m; i += 1) offsets[i + 1] = offsets[i] + degree[i];
  const targets = new Uint32Array(edges); const weights = new Float32Array(edges); const names32 = new Uint32Array(edges); const kinds = new Uint8Array(edges);
  const fill = offsets.slice(0, m);
  for (let e = 0; e < from.length; e += 1) {
    const ka = keep[from[e]]; const kb = keep[to[e]]; if (ka < 0 || kb < 0) continue;
    const w = metres(lat[from[e]], lng[from[e]], lat[to[e]], lng[to[e]]);
    for (const [x, y] of [[ka, kb], [kb, ka]]) { const at = fill[x]++; targets[at] = y; weights[at] = w; names32[at] = edgeName[e]; kinds[at] = edgeKind[e]; }
  }
  const latI = new Int32Array(m); const lngI = new Int32Array(m);
  for (let i = 0; i < n; i += 1) if (keep[i] >= 0) { latI[keep[i]] = Math.round(lat[i] * 1e6); lngI[keep[i]] = Math.round(lng[i] * 1e6); }
  return { m, edges, lat: latI, lng: lngI, offsets, targets, weights, edgeName: names32, edgeKind: kinds, names, dropped: n - m };
}

export function encodeGraph(graph) {
  const kindsPadded = new Uint8Array(Math.ceil(graph.edges / 4) * 4); kindsPadded.set(graph.edgeKind);
  const names = Buffer.from(JSON.stringify(graph.names), 'utf8');
  const header = new Uint32Array([MAGIC, graph.m, graph.edges, names.length]);
  const namesPadded = Buffer.alloc(Math.ceil(names.length / 4) * 4); names.copy(namesPadded);
  return Buffer.concat([header, graph.lat, graph.lng, graph.offsets, graph.targets, graph.weights, graph.edgeName, kindsPadded].map((arr) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)).concat(namesPadded));
}
export function decodeGraph(buf) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const [magic, m, edges, namesLength] = new Uint32Array(ab, 0, 4);
  if (magic !== MAGIC) throw new Error('not a walk graph');
  let at = 16;
  const take = (Type, count) => { const arr = new Type(ab, at, count); at += count * Type.BYTES_PER_ELEMENT; return arr; };
  const g = { m, edges, lat: take(Int32Array, m), lng: take(Int32Array, m), offsets: take(Uint32Array, m + 1), targets: take(Uint32Array, edges), weights: take(Float32Array, edges), edgeName: take(Uint32Array, edges) };
  g.edgeKind = new Uint8Array(ab, at, edges); at += Math.ceil(edges / 4) * 4;
  g.names = JSON.parse(Buffer.from(ab, at, namesLength).toString('utf8'));
  return g;
}

// Ready-to-route graph: a grid for snapping (cells of 0.002°) and reusable search arrays.
const CELL = 2000;
export function prepare(g) {
  const grid = new Map();
  for (let i = 0; i < g.m; i += 1) { const key = Math.floor(g.lat[i] / CELL) * 100000 + Math.floor(g.lng[i] / CELL); let list = grid.get(key); if (!list) grid.set(key, list = []); list.push(i); }
  return { ...g, grid, dist: new Float64Array(g.m), prevEdge: new Int32Array(g.m), prevNode: new Int32Array(g.m), stamp: new Uint32Array(g.m), closed: new Uint32Array(g.m), round: 0 };
}
export function loadWalkGraph(file) {
  try { return prepare(decodeGraph(fs.readFileSync(file))); } catch { return null; }
}
const latOf = (g, i) => g.lat[i] / 1e6; const lngOf = (g, i) => g.lng[i] / 1e6;
export function snap(g, point) {
  const cy = Math.floor(Math.round(point.lat * 1e6) / CELL); const cx = Math.floor(Math.round(point.lng * 1e6) / CELL);
  let best = -1; let bestD = Infinity;
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    for (const i of g.grid.get((cy + dy) * 100000 + cx + dx) ?? []) { const d = metres(point.lat, point.lng, latOf(g, i), lngOf(g, i)); if (d < bestD) { bestD = d; best = i; } }
  }
  return bestD <= MAX_SNAP_M ? { node: best, metres: bestD } : null;
}
class Heap {
  constructor() { this.f = []; this.n = []; }
  get size() { return this.n.length; }
  push(f, n) { const a = this.f; const b = this.n; a.push(f); b.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p] <= a[i]) break; [a[p], a[i]] = [a[i], a[p]]; [b[p], b[i]] = [b[i], b[p]]; i = p; } }
  pop() { const a = this.f; const b = this.n; const top = b[0]; const lf = a.pop(); const ln = b.pop(); if (b.length) { a[0] = lf; b[0] = ln; let i = 0; for (;;) { const l = 2 * i + 1; const r = l + 1; let s = i; if (l < a.length && a[l] < a[s]) s = l; if (r < a.length && a[r] < a[s]) s = r; if (s === i) break; [a[s], a[i]] = [a[i], a[s]]; [b[s], b[i]] = [b[i], b[s]]; i = s; } } return top; }
}
// Steps count a little more (×1.6) so a level way of about the same length is preferred.
const COST = [1, 1, 1.6, 1];

// The bearing in degrees from north, and the turn between two bearings.
const bearing = (aLat, aLng, bLat, bLng) => {
  const y = Math.sin((bLng - aLng) * rad) * Math.cos(bLat * rad);
  const x = Math.cos(aLat * rad) * Math.sin(bLat * rad) - Math.sin(aLat * rad) * Math.cos(bLat * rad) * Math.cos((bLng - aLng) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
};
export function turnOf(before, after) {
  const delta = ((after - before + 540) % 360) - 180;
  if (Math.abs(delta) < 35) return 'straight';
  if (Math.abs(delta) > 150) return 'back';
  return delta < 0 ? 'left' : 'right';
}
// Douglas–Peucker on [lat, lng] in metres (flat enough over a walk).
export function simplify(points, tolerance = 4) {
  if (points.length < 3) return points;
  const toXY = ([la, ln]) => [ln * 88200, la * 111000];
  const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop(); const [x1, y1] = toXY(points[s]); const [x2, y2] = toXY(points[e]);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    let far = -1; let farD = 0;
    for (let i = s + 1; i < e; i += 1) { const [x, y] = toXY(points[i]); const d = Math.abs((x2 - x1) * (y1 - y) - (x1 - x) * (y2 - y1)) / len; if (d > farD) { farD = d; far = i; } }
    if (farD > tolerance) { keep[far] = 1; stack.push([s, far], [far, e]); }
  }
  return points.filter((_, i) => keep[i]);
}

// Shortest walk (A*) → { metres, minutes, path: [[lat, lng], …], steps: [{ turn, kind, name, nameEn, metres }] } or null.
export function walkRoute(g, from, to) {
  if (!g) return null;
  const s = snap(g, from); const t = snap(g, to);
  if (!s || !t || metres(from.lat, from.lng, to.lat, to.lng) > MAX_ROUTE_KM * 1000) return null;
  const round = ++g.round; const tLat = latOf(g, t.node); const tLng = lngOf(g, t.node);
  const h = (i) => metres(latOf(g, i), lngOf(g, i), tLat, tLng);
  const heap = new Heap(); g.dist[s.node] = 0; g.prevEdge[s.node] = -1; g.prevNode[s.node] = -1; g.stamp[s.node] = round; heap.push(h(s.node), s.node);
  while (heap.size) {
    const u = heap.pop();
    if (g.closed[u] === round) continue; g.closed[u] = round;
    if (u === t.node) break;
    for (let e = g.offsets[u]; e < g.offsets[u + 1]; e += 1) {
      const v = g.targets[e]; const d = g.dist[u] + g.weights[e] * COST[g.edgeKind[e]];
      if (g.stamp[v] !== round || d < g.dist[v]) { g.stamp[v] = round; g.dist[v] = d; g.prevEdge[v] = e; g.prevNode[v] = u; heap.push(d + h(v), v); }
    }
  }
  if (g.closed[t.node] !== round) return null;
  const nodes = []; const edges = [];
  for (let i = t.node; i >= 0; i = g.prevNode[i]) { nodes.push(i); if (g.prevEdge[i] >= 0) edges.push(g.prevEdge[i]); }
  nodes.reverse(); edges.reverse();
  // Group the edges into steps: one per way name and kind, short unnamed bits folded into their neighbour.
  const raw = [];
  for (let k = 0; k < edges.length; k += 1) {
    const e = edges[k]; const a = nodes[k]; const b = nodes[k + 1];
    const [name, nameEn] = g.names[g.edgeName[e]] ?? ['', ''];
    const kind = KIND_NAME[g.edgeKind[e]];
    const last = raw.at(-1);
    const head = bearing(latOf(g, a), lngOf(g, a), latOf(g, b), lngOf(g, b));
    if (last && last.name === name && last.kind === kind) { last.metres += g.weights[e]; last.endHead = head; continue; }
    raw.push({ name, nameEn, kind, metres: g.weights[e], startHead: head, endHead: head });
  }
  const steps = [];
  for (const step of raw) {
    const prev = steps.at(-1);
    if (prev && step.metres < 25 && step.kind !== 'steps' && step.kind !== 'crossing') { prev.metres += step.metres; prev.endHead = step.endHead; continue; }
    if (prev && prev.metres < 25 && prev.kind !== 'steps' && prev.kind !== 'crossing' && !prev.name) { step.metres += prev.metres; step.startHead = prev.startHead; steps.pop(); }
    steps.push({ ...step });
  }
  // The same street (or a run of stairs) broken by a short bit in between reads as one step.
  // A named way keeps one step even where part of it is stairs (marked `stairs`); a bit under 15 m joins the step before.
  for (const step of steps) step.stairs = step.kind === 'steps';
  for (let k = steps.length - 1; k > 0; k -= 1) {
    const a = steps[k - 1]; const b = steps[k];
    const sameRoad = (a.name && a.name === b.name) || (!a.name && !b.name && a.kind === 'steps' && b.kind === 'steps');
    const tiny = b.metres < 15 && b.kind !== 'crossing';
    if (sameRoad || tiny) {
      a.metres += b.metres; a.endHead = b.endHead; a.stairs = a.stairs || b.stairs;
      if (sameRoad && a.kind !== b.kind && a.name) a.kind = 'path';
      steps.splice(k, 1);
    }
  }
  const total = edges.reduce((sum, e) => sum + g.weights[e], 0);
  const walked = total + s.metres + t.metres;
  const points = [[from.lat, from.lng], ...nodes.map((i) => [latOf(g, i), lngOf(g, i)]), [to.lat, to.lng]];
  return {
    metres: Math.round(walked), minutes: Math.max(1, Math.round(walked / WALK_M_PER_MIN)),
    path: simplify(points).map(([la, ln]) => [Math.round(la * 1e5) / 1e5, Math.round(ln * 1e5) / 1e5]),
    steps: steps.map((step, index) => ({ turn: index === 0 ? 'start' : turnOf(steps[index - 1].endHead, step.startHead), kind: step.kind, name: step.name, nameEn: step.nameEn, metres: Math.max(1, Math.round(step.metres)), ...(step.stairs && step.kind !== 'steps' ? { stairs: true } : {}) })),
  };
}
