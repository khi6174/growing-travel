// D55/P79: the way to the next place, inside the app. A walk comes from the server's own walking graph
// (OpenStreetMap) as a line on the map and turn-by-turn steps; a ride comes from Kakao's transit route as the lines,
// stations and transfer walks. Kakao Map stays only as a small "자세히" link at the bottom.
import { tk, lang } from './i18n.mjs';
import { kakaoSdk } from './kakao-sdk.mjs';
import { legUrl } from './course-plan.mjs';
import { distanceKm } from './geo.mjs';

const $ = (id) => document.getElementById(id);
const node = (tag, className = '', text) => {
  const result = document.createElement(tag); result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
const distance = (m) => (m < 1000 ? `${Math.round(m / 10) * 10 || m}m` : `${(m / 1000).toFixed(1)}km`);
export const COMPASS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
export function compass(from, to) {
  const y = Math.sin((to.lng - from.lng) * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180);
  const x = Math.cos(from.lat * Math.PI / 180) * Math.sin(to.lat * Math.PI / 180) - Math.sin(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) * Math.cos((to.lng - from.lng) * Math.PI / 180);
  const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}
const ARROW = { start: '↑', straight: '↑', left: '↰', right: '↱', back: '↶' };

// One walking step as a sentence in the chosen language (street names stay as OpenStreetMap has them).
export function walkStepText(step) {
  const text = walkStepBase(step);
  return step.stairs ? `${text}${tk(' · 계단 있음')}` : text;
}
function walkStepBase(step) {
  const road = (lang() === 'ko' ? step.name : step.nameEn || step.name) || (step.kind === 'path' ? tk('보행로') : tk('이름 없는 길'));
  const m = distance(step.metres);
  if (step.kind === 'crossing') return tk('횡단보도 건너기');
  if (step.kind === 'steps') return tk('계단 {m}', { m });
  if (step.turn === 'left') return tk('왼쪽으로 꺾어 {road} 따라 {m}', { road, m });
  if (step.turn === 'right') return tk('오른쪽으로 꺾어 {road} 따라 {m}', { road, m });
  if (step.turn === 'back') return tk('되돌아 {road} 따라 {m}', { road, m });
  if (step.turn === 'straight') return tk('그대로 {road} 따라 {m}', { road, m });
  return tk('{road} 따라 {m} 걸어요', { road, m });
}
export function rideStepText(step) {
  if (step.type === 'WALKING') return tk('걷기 {d} · 약 {m}분', { d: distance(step.metres), m: step.minutes });
  const line = step.line ?? tk('대중교통');
  if (step.type === 'BUS') return tk('{line} 타기 · {from} → {to} · 정류장 {n}개 · 약 {m}분', { line, from: step.from ?? '', to: step.to ?? '', n: step.stops, m: step.minutes });
  return tk('{line} 타기 · {from} → {to} · {n}개 역 · 약 {m}분', { line, from: step.from ?? '', to: step.to ?? '', n: step.stops, m: step.minutes });
}

async function drawMap(box, { from, to, path, dashed }) {
  try {
    const kakao = await kakaoSdk();
    if (!box.isConnected) return;
    const LatLng = (point) => new kakao.maps.LatLng(point[0], point[1]);
    const line = path?.length ? path : [[from.lat, from.lng], [to.lat, to.lng]];
    const map = new kakao.maps.Map(box, { center: LatLng(line[0]), level: 4 });
    new kakao.maps.Polyline({ map, path: line.map(LatLng), strokeWeight: 6, strokeColor: '#3651E8', strokeOpacity: 0.85, strokeStyle: dashed ? 'shortdash' : 'solid' });
    for (const [point, className, text] of [[line[0], 'route-pin start', tk('출발')], [line.at(-1), 'route-pin end', tk('도착')]]) {
      new kakao.maps.CustomOverlay({ map, position: LatLng(point), content: node('span', className, text), yAnchor: 1.2 });
    }
    const bounds = new kakao.maps.LatLngBounds(); line.forEach((point) => bounds.extend(LatLng(point)));
    setTimeout(() => { map.relayout(); map.setBounds(bounds, 32, 24, 32, 24); }, 0);
  } catch {
    box.replaceChildren(node('p', 'field-help route-map-off', tk('지도를 불러오지 못해 안내만 보여요.')));
    box.classList.add('off');
  }
}

// from/to: { lat, lng, name | label }; mode: 'walk' | 'transit'.
export async function openRouteGuide({ from, to, mode }) {
  const content = $('route-content');
  const toName = to.name ?? tk(to.label ?? '');
  const fromName = from.name ?? tk(from.label ?? '');
  const heading = node('h2', '', tk('{name}까지 가는 길', { name: toName })); heading.id = 'route-heading'; heading.tabIndex = -1;
  const status = node('p', 'field-help', tk('길을 찾는 중이에요.')); status.setAttribute('role', 'status');
  content.replaceChildren(node('span', 'small-label', tk('{name}에서 출발', { name: fromName })), heading, status);
  $('route-dialog').showModal(); heading.focus();
  let body = null;
  try {
    const response = await fetch('/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, from: { lat: from.lat, lng: from.lng, label: fromName }, to: { lat: to.lat, lng: to.lng, name: toName } }) });
    body = response.ok ? await response.json() : null;
  } catch { body = null; }
  if (!content.contains(heading)) return; // closed or reopened meanwhile
  const kakaoLink = node('a', 'text-button route-kakao', tk('카카오맵에서 자세히 보기')); kakaoLink.href = legUrl(from, to, mode); kakaoLink.target = '_blank'; kakaoLink.rel = 'noopener noreferrer';
  const mapBox = node('div', 'route-map'); mapBox.setAttribute('aria-hidden', 'true');
  const steps = node('ol', 'route-steps');
  const parts = [];
  if (mode === 'walk' && body?.walk) {
    const walk = body.walk;
    status.textContent = tk('걸어서 약 {m}분 · {d}', { m: walk.minutes, d: distance(walk.metres) });
    walk.steps.forEach((step) => { const li = node('li', `route-step ${step.kind}`); li.append(node('span', 'route-arrow', ARROW[step.turn] ?? '↑'), node('span', '', walkStepText(step))); steps.append(li); });
    const end = node('li', 'route-step end'); end.append(node('span', 'route-arrow', '●'), node('span', '', tk('{name} 도착', { name: toName }))); steps.append(end);
    parts.push(mapBox, node('p', 'route-credit', tk('걷는 길 © OpenStreetMap 기여자 · 실제 길 상황은 현장에서 확인해 주세요.')), steps);
    drawMap(mapBox, { from, to, path: walk.path });
  } else if (mode === 'transit' && body?.transit) {
    const ride = body.transit;
    status.textContent = [tk('약 {m}분', { m: ride.minutes }), ride.transfers ? tk('환승 {n}회', { n: ride.transfers }) : tk('환승 없음'), ride.fare && (lang() === 'ko' ? ride.fare : ride.fare.replace(/([\d,]+)원/g, '₩$1'))].filter(Boolean).join(' · ');
    for (const step of ride.steps ?? []) {
      const li = node('li', `route-step ride ${step.type.toLowerCase()}`);
      li.append(node('span', 'route-arrow', step.type === 'WALKING' ? '🚶' : step.type === 'BUS' ? '🚌' : '🚇'), node('span', '', rideStepText(step)));
      if (step.stopNames?.length > 2) { const more = node('details', 'route-stops'); more.append(node('summary', '', tk('지나는 곳 보기')), node('p', '', step.stopNames.join(' · '))); li.append(more); }
      steps.append(li);
    }
    parts.push(mapBox, node('p', 'route-credit', tk('대중교통 안내: 카카오 · 지도의 점선은 두 곳을 이은 선이라 실제 노선이 아니에요.')), steps);
    drawMap(mapBox, { from, to, dashed: true });
  } else {
    // No walking data (the graph was never built) or no Kakao answer: the direction and straight distance only.
    const km = distanceKm(from, to);
    status.textContent = tk('길 자료가 없어 방향만 알려 드려요.');
    const li = node('li', 'route-step'); li.append(node('span', 'route-arrow', '↑'), node('span', '', tk('{dir}쪽으로 직선 {d}', { dir: tk(compass(from, to)), d: distance(km * 1000) })));
    steps.append(li);
    parts.push(mapBox, steps);
    drawMap(mapBox, { from, to, dashed: true });
  }
  content.append(...parts, kakaoLink);
}

export function setupRouteGuide() {
  // The content is replaced when the guide opens again (clearing it on close could wipe a guide reopened at once).
  $('close-route').addEventListener('click', () => $('route-dialog').close());
}
