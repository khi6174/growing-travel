// D35/P51: the five pets as small toy-like characters: a big head on a small body, lit from the upper left with soft
// gradients, glossy eyes and a ground shadow. Each breed keeps its own ears, tail and markings, and CSS makes them
// breathe, blink, tilt their heads and wag (traveler.css, "P51"). Drawn in SVG so they stay sharp and light; the team
// may replace them with rendered art later (D35).
const SVG = 'http://www.w3.org/2000/svg';
const PALETTES = {
  golden: { hi: '#ffe6ad', base: '#efb75c', shade: '#c47f2c', ear: ['#e3a24a', '#b06c22'], light: '#fff1d6', inner: '#f3c39a', line: '#9a5f1f' },
  shiba: { hi: '#ffc896', base: '#eb8b3d', shade: '#b5561b', ear: ['#e07a2f', '#a84c14'], light: '#fff6ea', inner: '#fde3cf', line: '#8f4413' },
  corgi: { hi: '#ffd29b', base: '#f0a250', shade: '#bf6d22', ear: ['#e8913f', '#ad5d18'], light: '#ffffff', inner: '#ffd3c4', line: '#93541a' },
  bichon: { hi: '#ffffff', base: '#f8f4ee', shade: '#d6ccbd', ear: ['#fdfaf5', '#e4dacb'], light: '#ffffff', inner: '#f6d5cc', line: '#b3a691' },
  baekgu: { hi: '#ffffff', base: '#f4ede1', shade: '#cdbfa8', ear: ['#efe6d6', '#c9b99f'], light: '#fffaf2', inner: '#f6d0c4', line: '#ad9d84' },
};
const BREEDS = {
  golden: { ears: 'floppy', tail: 'plume', tongue: true },
  shiba: { ears: 'pointy', tail: 'curl', mask: true, brows: true },
  corgi: { ears: 'big', tail: 'stub', mask: true, blaze: true, tongue: true },
  bichon: { ears: 'puff', tail: 'pom', fluffy: true },
  baekgu: { ears: 'pointy', tail: 'curl' },
};
const f = (n) => Number(n.toFixed(2));
const mirror = (d) => d.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_, x, y) => `${f(48 - Number(x))} ${y}`);
// A cloud-like outline: arcs bulging out between points on an ellipse (the bichon's fur).
function bumpy(cx, cy, rx, ry, count, bump) {
  let d = '';
  for (let i = 0; i <= count; i += 1) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const [x, y] = [f(cx + rx * Math.cos(a)), f(cy + ry * Math.sin(a))];
    d += i === 0 ? `M${x} ${y}` : `A${bump} ${bump} 0 0 1 ${x} ${y}`;
  }
  return `${d}Z`;
}
const EARS = {
  floppy: { d: 'M13.2 10.5 C8.6 10.6 6.2 16 6.6 22.5 C6.9 26.6 9.8 28.4 12.2 26.6 C14.4 25 14.6 20.4 15.6 15.6 Z', front: true, hang: true },
  pointy: { d: 'M12 14.5 L12.6 3.6 Q13 2.6 14 3.2 L21.2 9.6 Z', inner: 'M13.4 12.4 L13.8 5.8 L18.6 9.8 Z' },
  big: { d: 'M11 15 L9.6 1.6 Q9.8 0.6 10.9 1 L21 9 Z', inner: 'M12.2 12.6 L11.4 4.2 L18.2 9.4 Z' },
};
const TAILS = {
  plume: 'M31.5 39.5 C36.8 39.4 40.6 35.4 41.4 30.2 C42.9 32.4 42.9 37.4 40 40.6 C37.6 43.2 34 43.2 31.2 42.6 Z',
  curl: 'M31.4 37.6 C33.4 33.4 39.6 32.6 40.8 36.6 C41.8 40 38.4 42.6 35.6 41.4 C37.8 41 38.8 39.2 38 37.6 C37 35.8 34 36.2 32.4 39.6 Z',
  stub: 'M31.2 40.4 C31.2 38.6 36.4 38.4 36.4 40.4 C36.4 42.4 31.2 42.4 31.2 40.4 Z',
  pom: bumpy(35, 34.5, 3.4, 3.4, 7, 1.9),
};

function el(tag, attributes = {}, parent) {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  parent?.append(node);
  return node;
}
// Shared gradients, added to the page once.
function ensureDefs() {
  if (document.getElementById('pet-defs')) return;
  const svg = el('svg', { id: 'pet-defs', class: 'pet-defs', width: '0', height: '0', 'aria-hidden': 'true', focusable: 'false' });
  const defs = el('defs', {}, svg);
  const radial = (id, stops, at = { cx: '.36', cy: '.3', r: '.8' }) => { const g = el('radialGradient', { id, ...at }, defs); for (const [offset, color] of stops) el('stop', { offset, 'stop-color': color }, g); };
  for (const [id, p] of Object.entries(PALETTES)) {
    radial(`pet-${id}-fur`, [[0, p.hi], [0.55, p.base], [1, p.shade]]);
    radial(`pet-${id}-ear`, [[0, p.ear[0]], [1, p.ear[1]]]);
    radial(`pet-${id}-light`, [[0, '#ffffff'], [1, p.light]], { cx: '.4', cy: '.3', r: '.9' });
  }
  radial('pet-eye', [[0, '#5a4740'], [0.55, '#241c19'], [1, '#110c0a']], { cx: '.4', cy: '.35', r: '.75' });
  document.body.append(svg);
}

export function petFace(id) {
  const breed = BREEDS[id] ?? BREEDS.shiba;
  const p = PALETTES[id] ?? PALETTES.shiba;
  const key = PALETTES[id] ? id : 'shiba';
  if (globalThis.document?.body) ensureDefs();
  const fur = `url(#pet-${key}-fur)`; const light = `url(#pet-${key}-light)`; const earFill = `url(#pet-${key}-ear)`;
  const svg = el('svg', { viewBox: '0 0 48 48', class: `pet-face pet3d pet-${key}`, 'aria-hidden': 'true', focusable: 'false' });
  el('ellipse', { class: 'pet-shadow', cx: '24', cy: '45.6', rx: '12', ry: '2' }, svg);
  const rig = el('g', { class: 'pet-rig' }, svg);
  el('path', { d: TAILS[breed.tail], fill: fur, stroke: p.line, 'stroke-width': '.6' }, el('g', { class: 'pet-tail' }, rig));
  el('path', { class: 'pet-body', d: breed.fluffy ? bumpy(24, 38.6, 9.4, 6.4, 10, 3.1) : 'M15.2 44.6 C13.4 39 14.8 31.4 24 31.4 C33.2 31.4 34.6 39 32.8 44.6 Z', fill: fur, stroke: p.line, 'stroke-width': '.6' }, rig);
  el('ellipse', { cx: '24', cy: '38.8', rx: '5.2', ry: '4.6', fill: light }, rig);
  for (const cx of ['19.6', '28.4']) el('ellipse', { class: 'pet-paw', cx, cy: '44.4', rx: '3.2', ry: '2', fill: light, stroke: p.line, 'stroke-width': '.5' }, rig);

  const head = el('g', { class: 'pet-head' }, rig);
  const ears = () => {
    const shape = EARS[breed.ears];
    for (const side of [0, 1]) {
      const ear = el('g', { class: `pet-ear ${shape.hang ? 'ear-down' : 'ear-up'}` }, head);
      el('path', { d: side ? mirror(shape.d) : shape.d, fill: shape.hang ? earFill : fur, stroke: p.line, 'stroke-width': '.6', 'stroke-linejoin': 'round' }, ear);
      if (shape.inner) el('path', { d: side ? mirror(shape.inner) : shape.inner, fill: p.inner }, ear);
    }
  };
  if (EARS[breed.ears] && !EARS[breed.ears].front) ears();
  el('path', { class: 'pet-skull', d: breed.fluffy ? bumpy(24, 19, 13.6, 12.6, 12, 4.1) : 'M24 7 C32.6 7 37.2 12.6 37.2 19.4 C37.2 26.8 31.4 31.4 24 31.4 C16.6 31.4 10.8 26.8 10.8 19.4 C10.8 12.6 15.4 7 24 7 Z', fill: fur, stroke: p.line, 'stroke-width': '.6' }, head);
  if (EARS[breed.ears]?.front) ears();
  if (breed.ears === 'puff') for (const cx of [11.4, 36.6]) el('path', { class: 'pet-ear ear-down', d: bumpy(cx, 22.6, 4.2, 5, 7, 2.2), fill: earFill, stroke: p.line, 'stroke-width': '.5' }, head);
  if (breed.mask) el('path', { d: 'M12.4 21.5 C13.2 27.5 18 31 24 31 C30 31 34.8 27.5 35.6 21.5 C32.6 23.8 28.4 23.6 24 21.6 C19.6 23.6 15.4 23.8 12.4 21.5 Z', fill: light }, head);
  if (breed.blaze) el('path', { d: 'M24 8.4 C25.7 12 25.8 16.6 25 20.8 L23 20.8 C22.2 16.6 22.3 12 24 8.4 Z', fill: light }, head);
  if (breed.brows) for (const cx of ['19.4', '28.6']) el('ellipse', { cx, cy: '13.6', rx: '1.6', ry: '1', fill: p.light }, head);
  el('ellipse', { cx: '24', cy: '24.8', rx: '5.6', ry: '4.2', fill: light }, head);
  for (const cx of ['14.6', '33.4']) el('ellipse', { class: 'pet-blush', cx, cy: '23.8', rx: '2.3', ry: '1.4' }, head);
  const eyes = el('g', { class: 'pet-eyes' }, head);
  for (const x of [19, 29]) {
    const eye = el('g', { class: 'pet-eye' }, el('g', { transform: `translate(${x} 19.4)` }, eyes));
    el('ellipse', { rx: '2.2', ry: '2.6', fill: 'url(#pet-eye)' }, eye);
    el('circle', { cx: '-.75', cy: '-1', r: '.85', fill: '#fff' }, eye);
    el('circle', { cx: '.7', cy: '.95', r: '.38', fill: '#ffffffcc' }, eye);
  }
  el('path', { class: 'pet-happy', d: 'M16.8 20 Q19 17.4 21.2 20 M26.8 20 Q29 17.4 31.2 20' }, head);
  el('path', { d: 'M21.9 22.6 C21.9 21.6 26.1 21.6 26.1 22.6 C26.1 23.6 24.9 24.7 24 24.7 C23.1 24.7 21.9 23.6 21.9 22.6 Z', fill: '#2a211e' }, head);
  el('ellipse', { cx: '23.2', cy: '22.3', rx: '.75', ry: '.35', fill: '#ffffffcc' }, head);
  el('path', { class: 'pet-mouth', d: 'M24 24.7 L24 25.5 M21.9 25.6 Q22.95 26.9 24 25.6 Q25.05 26.9 26.1 25.6' }, head);
  el('path', { class: 'pet-tongue', d: 'M23.1 26.3 L24.9 26.3 L24.9 27.4 A0.9 0.9 0 0 1 23.1 27.4 Z' }, head);
  el('ellipse', { class: 'pet-sheen', cx: '17.4', cy: '11.2', rx: '4.4', ry: '1.9', transform: 'rotate(-28 17.4 11.2)' }, head);
  return svg;
}
