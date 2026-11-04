// D34/P48: the 동네 친구 도감 as a game board of Seoul's 25 districts, drawn from the real outlines (/api/boundaries,
// KOSTAT 2013, simplified). Every district is a block; met districts stand taller in their region colour, and a
// sideways drag turns the board. It is one SVG redrawn in JavaScript, so it stays sharp and light on phones.
const SVG = 'http://www.w3.org/2000/svg';
export const BOARD = Object.freeze({ width: 360, pad: 14, squash: 0.56, low: 5, high: 18, turn: -0.35 });

const outerRings = (geometry) => (geometry.type === 'MultiPolygon' ? geometry.coordinates.map((polygon) => polygon[0]) : [geometry.coordinates[0]]);
const pt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;
function signedArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) { const [a, b] = [ring[i], ring[(i + 1) % ring.length]]; area += a[0] * b[1] - b[0] * a[1]; }
  return area / 2;
}
function centroid(ring) {
  let [x, y, area] = [0, 0, 0];
  for (let i = 0; i < ring.length; i += 1) {
    const [a, b] = [ring[i], ring[(i + 1) % ring.length]]; const cross = a[0] * b[1] - b[0] * a[1];
    x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross; area += cross;
  }
  return area ? [x / (3 * area), y / (3 * area)] : ring[0];
}

// Lng/lat → a flat plane centred on Seoul (equirectangular with the latitude correction), y pointing south.
export function boardPlane(features) {
  const points = features.flatMap((feature) => outerRings(feature.geometry).flat());
  const mid = (i) => (Math.min(...points.map((point) => point[i])) + Math.max(...points.map((point) => point[i]))) / 2;
  const [lng0, lat0] = [mid(0), mid(1)];
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const shapes = features.map((feature) => ({ gu: feature.properties.gu, rings: outerRings(feature.geometry).map((ring) => ring.map(([lng, lat]) => [(lng - lng0) * kx, lat0 - lat])) }));
  const radius = Math.max(...shapes.flatMap((shape) => shape.rings.flat().map(([x, y]) => Math.hypot(x, y))));
  return { shapes, radius };
}

// Turn the plane, squash it into a three-quarter view and fit it to a box that does not change size while turning.
// Districts come back in painter's order: the ones further up the screen are drawn first.
export function projectBoard({ shapes, radius }, turn = BOARD.turn, { width, pad, squash, high } = BOARD) {
  const scale = (width - 2 * pad) / (2 * radius);
  const height = Math.ceil(2 * radius * scale * squash + high + 2 * pad);
  const [cx, cy] = [width / 2, pad + high + radius * scale * squash];
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  const project = ([x, y]) => [cx + (x * cos - y * sin) * scale, cy + (x * sin + y * cos) * scale * squash];
  const districts = shapes.map((shape) => {
    const rings = shape.rings.map((ring) => ring.map(project));
    const largest = rings.reduce((best, ring) => (Math.abs(signedArea(ring)) > Math.abs(signedArea(best)) ? ring : best));
    return { gu: shape.gu, rings, centre: centroid(largest) };
  });
  districts.sort((a, b) => a.centre[1] - b.centre[1]);
  return { width, height, centre: [cx, cy], rx: radius * scale, ry: radius * scale * squash, districts };
}

// A district raised by h: its top face, and the walls that face the viewer (down the screen), split by the way
// they face so light seems to come from the left.
export function prism(rings, h) {
  const faces = { top: '', l: '', m: '', r: '' };
  for (const ring of rings) {
    const outward = signedArea(ring) > 0 ? ([dx, dy]) => [dy, -dx] : ([dx, dy]) => [-dy, dx];
    faces.top += `M${ring.map(([x, y]) => pt([x, y - h])).join('L')}Z`;
    for (let i = 0; i < ring.length; i += 1) {
      const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const [nx, ny] = outward([b[0] - a[0], b[1] - a[1]]);
      if (!length || ny <= 0) continue;
      const side = nx < -0.5 * length ? 'l' : nx > 0.5 * length ? 'r' : 'm';
      faces[side] += `M${pt(a)}L${pt(b)}L${pt([b[0], b[1] - h])}L${pt([a[0], a[1] - h])}Z`;
    }
  }
  return faces;
}

const el = (tag, attributes = {}) => {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
};
const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

export function createSeoulBoard(host, { onPick = () => {} } = {}) {
  const svg = el('svg', { class: 'board-svg', 'aria-hidden': 'true', focusable: 'false' });
  const shadow = el('ellipse', { class: 'board-shadow' });
  host.replaceChildren(svg);
  const state = { plane: null, turn: BOARD.turn, regions: new Map(), met: new Map(), current: null, pet: null, heights: new Map(), rising: new Set(), groups: new Map(), frame: 0, drag: null };

  function group(gu) {
    if (state.groups.has(gu)) return state.groups.get(gu);
    const parts = { g: el('g', { 'data-gu': gu }), l: el('path', { class: 'wall wall-l' }), m: el('path', { class: 'wall wall-m' }), r: el('path', { class: 'wall wall-r' }), top: el('path', { class: 'gu-top' }), token: el('g'), at: el('g') };
    const face = el('g', { class: 'gu-token' });
    face.append(el('circle', { r: '9' }), el('text', { 'text-anchor': 'middle', y: '4' }));
    parts.token.append(face);
    parts.g.append(parts.l, parts.m, parts.r, parts.top, parts.token, parts.at);
    state.groups.set(gu, parts);
    return parts;
  }
  function draw() {
    state.frame = 0;
    if (!state.plane) return;
    const board = projectBoard(state.plane, state.turn);
    svg.setAttribute('viewBox', `0 0 ${board.width} ${board.height}`);
    shadow.setAttribute('cx', board.centre[0].toFixed(1)); shadow.setAttribute('cy', (board.centre[1] + 10).toFixed(1));
    shadow.setAttribute('rx', (board.rx * 0.98).toFixed(1)); shadow.setAttribute('ry', (board.ry * 0.98).toFixed(1));
    const order = board.districts.map((district) => {
      const parts = group(district.gu);
      const met = state.met.get(district.gu);
      const h = state.heights.get(district.gu) ?? (met ? BOARD.high : BOARD.low);
      const faces = prism(district.rings, h);
      for (const key of ['l', 'm', 'r', 'top']) parts[key].setAttribute('d', faces[key]);
      parts.g.setAttribute('class', `gu region-${state.regions.get(district.gu) ?? 'none'} ${met ? 'met' : 'unmet'}${state.rising.has(district.gu) ? ' rising' : ''}`);
      const [x, y] = district.centre;
      parts.token.setAttribute('display', met ? 'inline' : 'none');
      parts.token.setAttribute('transform', `translate(${x.toFixed(1)} ${(y - h - 2).toFixed(1)})`);
      if (met) parts.token.querySelector('text').textContent = met.initial;
      // The chosen pet stands on the district the phone is in while arrival tracking is on.
      if (state.pet && state.current === district.gu) {
        if (!parts.at.firstChild) {
          const face = state.pet(); face.setAttribute('width', '30'); face.setAttribute('height', '30');
          const bob = el('g', { class: 'board-pet' }); bob.append(face); parts.at.replaceChildren(bob);
        }
        parts.at.setAttribute('transform', `translate(${(x - 15).toFixed(1)} ${(y - h - (met ? 42 : 30)).toFixed(1)})`);
      } else parts.at.replaceChildren();
      return parts.g;
    });
    // Move only the groups whose place changed: re-inserting a node restarts its CSS animations (token pop, pet bob).
    [shadow, ...order].forEach((node, index) => { if (svg.children[index] !== node) svg.insertBefore(node, svg.children[index] ?? null); });
  }
  const schedule = () => { state.frame ||= requestAnimationFrame(draw); };

  // Pointer: a sideways drag turns the board (vertical drags still scroll the page); a tap on a met district opens it.
  svg.addEventListener('pointerdown', (event) => {
    state.drag = { id: event.pointerId, x: event.clientX, turn: state.turn, moved: false };
  });
  svg.addEventListener('pointermove', (event) => {
    if (state.drag?.id !== event.pointerId) return;
    const dx = event.clientX - state.drag.x;
    if (!state.drag.moved && Math.abs(dx) > 6) {
      state.drag.moved = true; svg.classList.add('turning');
      try { svg.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone; keep turning without capture */ }
    }
    if (state.drag.moved) { state.turn = state.drag.turn + dx * 0.012; schedule(); }
  });
  const end = (event) => {
    if (state.drag?.id !== event.pointerId) return;
    const { moved } = state.drag; state.drag = null; svg.classList.remove('turning');
    if (!moved && event.type === 'pointerup') {
      const gu = event.target.closest?.('.gu.met')?.dataset.gu;
      if (gu) onPick(gu);
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  return {
    update({ features, districts, met, current = null, pet = null }) {
      if (features && !state.plane) state.plane = boardPlane(features);
      state.regions = new Map(districts.map((district) => [district.id, district.region]));
      state.met = met; state.current = current; state.pet = pet;
      for (const parts of state.groups.values()) parts.at.replaceChildren();
      draw();
    },
    // A district met just now grows from the board with a little overshoot, then its token pops up.
    rise(gu) {
      const parts = state.groups.get(gu);
      if (!parts || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const started = performance.now();
      state.rising.add(gu); state.heights.set(gu, BOARD.low); draw();
      // The frame timestamp can lag behind performance.now(), so progress is read fresh and kept within 0..1.
      const step = () => {
        const t = Math.min(1, Math.max(0, (performance.now() - started) / 900));
        state.heights.set(gu, BOARD.low + (BOARD.high - BOARD.low) * easeOutBack(t));
        draw();
        if (t < 1) requestAnimationFrame(step);
        else { state.heights.delete(gu); setTimeout(() => { state.rising.delete(gu); draw(); }, 800); }
      };
      requestAnimationFrame(step);
    },
  };
}
