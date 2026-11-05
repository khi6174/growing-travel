// D35/P50: the app dresses for Seoul's season and, when the server has it, today's weather (KMA via /api/weather).
// The season sets the palette and the scene in the home hero; the weather sets the sky, clouds and what falls; the
// time of day (from the sun's height over Seoul, P52) turns the sky to dawn, day, dusk or night.
// Anyone can preview another season, weather or time (for the demo, too); a preview lasts until the tab is closed.
import { tk } from './i18n.mjs';
export const SEASONS = Object.freeze([{ id: 'spring', label: '봄' }, { id: 'summer', label: '여름' }, { id: 'autumn', label: '가을' }, { id: 'winter', label: '겨울' }]);
export const WEATHERS = Object.freeze([{ id: 'clear', label: '맑음' }, { id: 'cloudy', label: '구름 많음' }, { id: 'overcast', label: '흐림' }, { id: 'rain', label: '비' }, { id: 'snow', label: '눈' }]);
export const TIMES = Object.freeze([{ id: 'dawn', label: '해 뜰 녘' }, { id: 'day', label: '낮' }, { id: 'dusk', label: '해 질 녘' }, { id: 'night', label: '밤' }]);
export const PREVIEW_KEY = 'growing-travel.sky-preview.v1';
const SEOUL = { lat: 37.5665, lng: 126.978 };
const SVG = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const known = (list, value) => (list.some((item) => item.id === value) ? value : null);
const labelOf = (list, id) => tk(list.find((item) => item.id === id)?.label ?? '');

export function seasonOf(date = new Date()) {
  const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric' }).format(date));
  return month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter';
}
// The sun's height above the horizon in degrees (the usual low-precision solar position, good to a fraction of a degree).
export function sunElevation(date = new Date(), { lat, lng } = SEOUL) {
  const rad = Math.PI / 180;
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (((280.46 + 0.9856474 * n) % 360) + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const epsilon = (23.439 - 0.0000004 * n) * rad;
  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const ascension = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const sidereal = ((18.697374558 + 24.06570982441908 * n) % 24) * 15 * rad + lng * rad;
  return Math.asin(Math.sin(lat * rad) * Math.sin(declination) + Math.cos(lat * rad) * Math.cos(declination) * Math.cos(sidereal - ascension)) / rad;
}
// Night below civil twilight (-6°), dawn or dusk while the sun is low (under 4°), day above.
export function timeOfDay(date = new Date()) {
  const elevation = sunElevation(date);
  if (elevation < -6) return 'night';
  if (elevation >= 4) return 'day';
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(date));
  return hour < 12 ? 'dawn' : 'dusk';
}
// KMA conditions → the five looks. "dry" (no rain, sky unknown) looks clear; sleet shows as rain.
export const lookFor = (condition) => ({ clear: 'clear', dry: 'clear', cloudy: 'cloudy', overcast: 'overcast', rain: 'rain', sleet: 'rain', snow: 'snow' })[condition] ?? null;

// A ?season= / ?weather= / ?time= link wins, then a preview chosen in this tab, then the real season, weather and time.
export function skyState({ search = '', preview = {}, live = null, date = new Date() } = {}) {
  const params = new URLSearchParams(search);
  const season = known(SEASONS, params.get('season')) ?? known(SEASONS, preview.season);
  const weather = known(WEATHERS, params.get('weather')) ?? known(WEATHERS, preview.weather);
  const time = known(TIMES, params.get('time')) ?? known(TIMES, preview.time);
  return { season: season ?? seasonOf(date), weather: weather ?? lookFor(live?.condition) ?? 'clear', time: time ?? timeOfDay(date), previewing: Boolean(season || weather || time) };
}

function readPreview(storage) { try { return JSON.parse(storage.getItem(PREVIEW_KEY) ?? '{}') ?? {}; } catch { return {}; } }
function writePreview(storage, value) { try { if (value.season || value.weather || value.time) storage.setItem(PREVIEW_KEY, JSON.stringify(value)); else storage.removeItem(PREVIEW_KEY); } catch { /* preview stays for this page only */ } }

const svgEl = (className) => {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', className); svg.setAttribute('viewBox', '0 0 360 120'); svg.setAttribute('preserveAspectRatio', 'xMidYMax slice'); svg.setAttribute('aria-hidden', 'true');
  return svg;
};
const add = (parent, tag, attributes) => { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attributes)) el.setAttribute(k, v); parent.append(el); return el; };
// The skyline's blocks as [left, right, top]; the city path below and the lit windows share them.
const BLOCKS = [[0, 10, 86], [10, 18, 80], [18, 27, 88], [27, 39, 78], [39, 47, 88], [47, 57, 83], [63, 72, 82], [72, 79, 74], [89, 100, 87], [106, 118, 80], [162, 172, 84], [172, 181, 78], [189, 201, 89], [208, 218, 76], [226, 238, 87], [247, 255, 82], [267, 276, 90], [284, 295, 86]];

// Seoul seen from across the Han: northern ridges, Namsan with N Seoul Tower, the city, the river and trees on the bank.
function land() {
  const svg = svgEl('scene-land');
  add(svg, 'path', { class: 'scene-far', d: 'M0 66C28 46 52 54 76 42c18-9 30 4 44 0 16-5 26-20 46-14 18 6 28 22 48 18 22-4 34-24 58-18 20 5 30 20 46 22 14 2 26-6 42-4V120H0Z' });
  add(svg, 'path', { class: 'scene-snowcap', d: 'M156 30c6-4 14-4 20 0l-4 3-4-2-4 3-3-2ZM262 31c6-3 12-3 18 1l-4 2-3-2-4 3-3-2ZM66 46c4-3 10-3 14 0l-3 2-3-1-3 2Z' });
  add(svg, 'path', { class: 'scene-hill', d: 'M188 96c14-22 30-30 46-30s34 10 46 30Z' });
  const tower = add(svg, 'g', { class: 'scene-tower' });
  add(tower, 'path', { d: 'M232.6 70h3.2l-.6-22h-2Z' });
  add(tower, 'rect', { x: '228.4', y: '46', width: '11.6', height: '4.6', rx: '2.3' });
  add(tower, 'rect', { x: '230.4', y: '42.4', width: '7.6', height: '4', rx: '1.6' });
  add(tower, 'path', { d: 'M233.6 42.6V30h1.2v12.6Z' });
  add(svg, 'path', { class: 'scene-city', d: `M0 96${BLOCKS.map(([left, right, top]) => `L${left} 96L${left} ${top}L${right} ${top}L${right} 96`).join('')}L360 96Z` });
  add(svg, 'path', { class: 'scene-river', d: 'M0 96h360v9H0Z' });
  add(svg, 'path', { class: 'scene-glint', d: 'M30 99h22M96 101h30M170 99h18M214 102h26M288 99h30M330 102h16' });
  add(svg, 'path', { class: 'scene-bank', d: 'M0 106c40-4 80 2 120 0s80-6 120-2 80 4 120 0V120H0Z' });
  for (const [x, r, kind] of [[22, 11, 'a'], [44, 8, 'b'], [86, 12, 'c'], [120, 9, 'a'], [150, 11, 'b'], [206, 10, 'c'], [252, 12, 'a'], [286, 8, 'c'], [318, 11, 'b'], [346, 9, 'a']]) {
    const tree = add(svg, 'g', { class: `scene-tree tree-${kind}` });
    add(tree, 'path', { class: 'scene-trunk', d: `M${x - 1.2} 112V${103 - r}h2.4V112Z` });
    add(tree, 'circle', { class: 'scene-canopy', cx: x, cy: 102 - r, r });
    add(tree, 'circle', { class: 'scene-canopy-light', cx: x - r * 0.35, cy: 102 - r * 1.35, r: r * 0.45 });
  }
  return svg;
}
// City lights for dusk and night, drawn over the darkened land so they keep their glow.
function lights() {
  const svg = svgEl('scene-lights');
  let windows = ''; let seed = 7;
  for (const [left, right, top] of BLOCKS) {
    for (let y = top + 2.4; y < 93; y += 3.6) for (let x = left + 1.4; x < right - 1.4; x += 3) {
      seed = (seed * 9301 + 49297) % 233280;
      if (seed / 233280 < 0.42) windows += `M${x.toFixed(1)} ${y.toFixed(1)}h1.5v1.7h-1.5Z`;
    }
  }
  add(svg, 'path', { class: 'scene-windows', d: windows });
  add(svg, 'path', { class: 'scene-reflection', d: 'M24 99h14M60 101h10M112 99h16M176 102h12M230 99h8M270 101h18M314 99h12' });
  add(svg, 'ellipse', { class: 'scene-tower-glow', cx: '234.2', cy: '48.3', rx: '7', ry: '3.2' });
  add(svg, 'circle', { class: 'scene-beacon', cx: '234.2', cy: '30', r: '1.1' });
  return svg;
}
function layer(className, count) {
  const element = document.createElement('div'); element.className = className; element.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i += 1) element.append(document.createElement('i'));
  return element;
}

export function setupSky({ root = document.documentElement, storage = globalThis.sessionStorage } = {}) {
  const hero = document.querySelector('.home-hero');
  const backdrop = document.createElement('div'); backdrop.className = 'sky-scene'; backdrop.setAttribute('aria-hidden', 'true');
  backdrop.append(layer('sky-stars', 14), layer('sky-sun', 1), layer('sky-clouds', 3), land(), lights(), layer('sky-season', 10), layer('sky-precip', 18));
  hero.prepend(backdrop);
  let live = null; let preview = readPreview(storage);
  const field = { 'sky-season': 'season', 'sky-weather': 'weather', 'sky-time': 'time' };

  function apply() {
    const state = skyState({ search: location.search, preview, live });
    root.dataset.season = state.season; root.dataset.weather = state.weather; root.dataset.time = state.time;
    const temp = !state.previewing && live?.tempC != null ? ` ${live.tempC}°` : '';
    $('sky-summary').textContent = `${labelOf(SEASONS, state.season)} · ${labelOf(WEATHERS, state.weather)}${temp}`;
    $('sky-summary').classList.toggle('previewing', state.previewing);
    $('sky-source').textContent = state.previewing ? tk('미리 보기 중이에요. 실제 날씨로 돌아가려면 아래 버튼을 누르세요.')
      : live ? tk('서울 날씨 자료: 기상청 ({time} 관측, {label})', { time: live.observedAt?.slice(11, 16) ?? '', label: tk(live.label) }) : tk('실제 날씨를 받지 못해 계절만 반영했어요.');
    for (const input of document.querySelectorAll('#sky-preview input')) input.checked = input.value === (preview[field[input.name]] ?? 'auto');
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--sky-top').trim() || '#3651E8');
  }
  for (const [name, list, autoLabel] of [['sky-season', SEASONS, tk('지금 계절')], ['sky-weather', WEATHERS, tk('실제 날씨')], ['sky-time', TIMES, tk('지금 시간')]]) {
    const box = $(`${name}-options`);
    for (const { id, label } of [{ id: 'auto', label: autoLabel }, ...list]) {
      const option = document.createElement('label'); option.className = 'interest-option';
      const input = document.createElement('input'); input.type = 'radio'; input.name = name; input.value = id;
      input.addEventListener('change', () => { preview = { ...preview, [field[name]]: id === 'auto' ? undefined : id }; writePreview(storage, preview); apply(); });
      option.append(input, Object.assign(document.createElement('span'), { textContent: tk(label) })); box.append(option);
    }
  }
  $('sky-reset').addEventListener('click', () => { preview = {}; writePreview(storage, preview); apply(); });
  const refresh = () => fetch('/api/weather').then((response) => response.json()).then((body) => { live = body.weather ?? null; apply(); }).catch(() => {});
  apply(); refresh();
  // The sky follows the clock while the page stays open: the time of day every minute, the weather every 10 minutes.
  setInterval(() => { if (!document.hidden) apply(); }, 60_000);
  setInterval(() => { if (!document.hidden) refresh(); }, 10 * 60_000);
  return { state: () => skyState({ search: location.search, preview, live }) };
}
