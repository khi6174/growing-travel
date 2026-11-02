import { distanceKm } from './geo.mjs';
import { reportAge } from './field-reports.mjs';
import { distanceLabel } from './ai-flow.mjs';
import { josa } from './ai-conditions.mjs';

// Stage 6 (명세 2-5 ④, 단계 6, D30): the living map. Live reports are speech bubbles, expired ones fade, and places
// with no news for 48 hours wait to be woken by the next report. The Kakao map draws them when a key is set
// (KAKAO_JS_KEY); without it, or when the map cannot load, the same places stay usable as lists.
const $ = (id) => document.getElementById(id);
const node = (tag, className = '', text) => {
  const result = document.createElement(tag); result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
const STATE_LABEL = { live: '지금 유효한 소식', fading: '유효시간이 지난 소식', sleeping: '48시간 넘게 소식 없음' };
const SEOUL = { lat: 37.5665, lng: 126.978 };
const SLEEPING_SHOWN = 6;
const POLL_MS = 30000;
// Bubbles appear from this zoom level in (Kakao levels: smaller is closer; 7 ≈ one district across a phone);
// the whole city shows dots only.
const BUBBLE_LEVEL = 7;
const short = (text, size = 22) => (text.length > size ? `${text.slice(0, size - 1)}…` : text);

async function json(path) {
  let response;
  try { response = await fetch(path); }
  catch { throw new Error('서버에 연결하지 못했어요. 서버를 켠 주소로 들어왔는지 확인해 주세요.'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message ?? '잠시 후 다시 시도해 주세요.');
  return body;
}

// Loads the Kakao SDK once. Rejects with 'no-key' when no key is set, or 'load' when Kakao refuses it
// (usually a site address not registered for the key).
function loadKakao() {
  return (async () => {
    const { kakaoJsKey } = await json('/api/map-config');
    if (!kakaoJsKey) throw new Error('no-key');
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(kakaoJsKey)}&autoload=false`;
      script.addEventListener('load', resolve); script.addEventListener('error', () => reject(new Error('load')));
      setTimeout(() => reject(new Error('load')), 8000);
      document.head.append(script);
    });
    if (!globalThis.kakao?.maps?.load) throw new Error('load');
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('load')), 8000); globalThis.kakao.maps.load(() => { clearTimeout(timer); resolve(); }); });
    return globalThis.kakao;
  })();
}

export function setupLivingMap({ goScreen, pets, arrival }) {
  const state = { data: null, focus: {}, previous: new Map(), sdk: null, map: null, overlays: [], timer: null };
  const say = (text) => { $('map-status').textContent = text; };
  const frame = document.querySelector('.app-frame');

  // ---- what is in view ----
  function reference() {
    const here = arrival.position();
    if (state.focus.point) return state.focus.point;
    if (here) return here.point;
    const picked = (state.focus.places ?? []).map((id) => state.data.places.find((place) => place.id === id)).filter(Boolean);
    if (picked.length) return { lat: picked.reduce((sum, place) => sum + place.lat, 0) / picked.length, lng: picked.reduce((sum, place) => sum + place.lng, 0) / picked.length };
    return SEOUL;
  }
  const inScope = (place) => !state.focus.gu || place.gu === state.focus.gu;
  const rankOf = (place) => (state.focus.places ?? []).indexOf(place.id) + 1;

  function openDetail(place) {
    const from = reference();
    pets.openPlaceDetail({ place, reason: '', distanceKm: from === SEOUL ? null : distanceKm(from, place) }, refresh);
  }

  // ---- lists (always shown; the only view without a map key) ----
  function listItem(place, line) {
    const item = node('li', `arrival-place map-item state-${place.state}`);
    const head = node('div', 'arrival-place-head');
    const rank = rankOf(place);
    head.append(node('b', '', `${rank ? `${rank}. ` : ''}${place.name}`), node('span', 'muted', place.guName));
    const open = node('button', 'button subtle', place.state === 'sleeping' ? '소식 남겨 깨우기' : '상세·현장 소식'); open.type = 'button';
    open.setAttribute('aria-label', `${place.name} 상세와 현장 소식 보기`);
    open.addEventListener('click', () => openDetail(place));
    item.append(head, node('p', 'field-help', line), open);
    return item;
  }
  function renderLists() {
    const places = state.data.places.filter(inScope);
    const withNews = places.filter((place) => place.state !== 'sleeping').sort((a, b) => b.report.createdAt.localeCompare(a.report.createdAt));
    $('map-live-list').replaceChildren(...(withNews.length
      ? withNews.map((place) => listItem(place, `${STATE_LABEL[place.state]} · ${place.report.categoryLabel} · ${reportAge(place.report.createdAt)} · ${place.report.text}`))
      : [node('li', 'report-empty', '아직 이 범위에 남겨진 소식이 없어요.')]));
    const from = reference();
    const sleeping = places.filter((place) => place.state === 'sleeping')
      .map((place) => ({ place, km: distanceKm(from, place) }))
      // Recommended places first in their order, then the nearest.
      .sort((a, b) => (rankOf(a.place) || Infinity) - (rankOf(b.place) || Infinity) || a.km - b.km).slice(0, SLEEPING_SHOWN);
    $('map-sleep-list').replaceChildren(...(sleeping.length
      ? sleeping.map(({ place, km }) => listItem(place, `${place.lastNewsAt ? `마지막 소식 ${reportAge(place.lastNewsAt)}` : '아직 소식이 없어요'}${from === SEOUL ? '' : ` · ${distanceLabel(km)}`}`))
      : [node('li', 'report-empty', '이 범위의 모든 곳에 최근 소식이 있어요.')]));
    const district = state.focus.gu && state.data.places.find((place) => place.gu === state.focus.gu)?.guName;
    $('map-heading').textContent = district ? `지금 ${district}의 현장 소식` : '지금 서울의 현장 소식';
    $('map-scope').textContent = state.focus.places?.length
      ? `추천 ${state.focus.places.length}곳을 번호로 표시했어요. 소식 있는 곳 ${withNews.length}곳 · 깨워 줄 곳 ${places.length - withNews.length}곳`
      : `${district ?? '서울 25개 구'} 후보지 ${places.length}곳 · 소식 있는 곳 ${withNews.length}곳 · 깨워 줄 곳 ${places.length - withNews.length}곳`;
  }

  // ---- Kakao map ----
  function pin(place) {
    const rank = rankOf(place);
    const wrap = node('div', `map-pin state-${place.state}${rank ? ' ranked' : ''}${state.woke?.has(place.id) ? ' just-woke' : ''}`);
    if (place.report) wrap.append(node('span', 'map-bubble', short(`${place.report.categoryLabel} · ${place.report.text}`)));
    const dot = node('button', 'map-dot', rank ? String(rank) : place.state === 'sleeping' ? 'z' : ''); dot.type = 'button';
    dot.setAttribute('aria-label', `${place.name}, ${STATE_LABEL[place.state]}`);
    // The whole pin, bubble included, opens the place; the dot is the keyboard-reachable button.
    wrap.addEventListener('click', () => openDetail(place));
    wrap.append(dot);
    return wrap;
  }
  function drawMap(kakao) {
    const container = $('living-map');
    container.hidden = false;
    if (!state.map) {
      // Kakao's own zoom control needs inline styles that this page's CSP blocks, so the page has its own buttons.
      state.map = new kakao.maps.Map(container, { center: new kakao.maps.LatLng(SEOUL.lat, SEOUL.lng), level: 8 });
      kakao.maps.event.addListener(state.map, 'zoom_changed', () => container.classList.toggle('show-bubbles', state.map.getLevel() <= BUBBLE_LEVEL));
      $('map-zoom').hidden = false;
    }
    state.map.relayout();
    state.overlays.forEach((overlay) => overlay.setMap(null));
    const shown = state.data.places.filter(inScope);
    state.overlays = shown.map((place) => new kakao.maps.CustomOverlay({ map: state.map, position: new kakao.maps.LatLng(place.lat, place.lng), content: pin(place), xAnchor: 0.5, yAnchor: 0.5, zIndex: rankOf(place) ? 3 : place.state === 'sleeping' ? 1 : 2, clickable: true }));
    const here = arrival.position();
    if (here) state.overlays.push(new kakao.maps.CustomOverlay({ map: state.map, position: new kakao.maps.LatLng(here.point.lat, here.point.lng), content: node('span', 'map-me', '나'), zIndex: 4 }));
    container.classList.toggle('show-bubbles', state.map.getLevel() <= BUBBLE_LEVEL);
  }
  function fitMap(kakao) {
    const focusPlaces = state.focus.places?.length ? state.data.places.filter((place) => rankOf(place)) : state.focus.gu ? state.data.places.filter(inScope) : [];
    if (!focusPlaces.length) { state.map.setCenter(new kakao.maps.LatLng(SEOUL.lat, SEOUL.lng)); state.map.setLevel(8); return; }
    const bounds = new kakao.maps.LatLngBounds();
    focusPlaces.forEach((place) => bounds.extend(new kakao.maps.LatLng(place.lat, place.lng)));
    // Room for a bubble (up to 160 px wide) above and beside the pins (top, right, bottom, left in px).
    state.map.setBounds(bounds, 60, 80, 24, 80);
  }
  async function showMap({ fit }) {
    state.sdk ??= loadKakao();
    try {
      const kakao = await state.sdk;
      drawMap(kakao);
      // A map just unhidden settles its size after layout, so the bounds are fitted on the next task.
      if (fit) await new Promise((resolve) => setTimeout(() => { state.map.relayout(); fitMap(kakao); resolve(); }, 0));
    } catch (error) {
      $('living-map').hidden = true; $('map-zoom').hidden = true;
      say(error.message === 'no-key' ? '카카오맵 키가 설정되지 않아 지도 대신 목록으로 보여 드려요.'
        : error.message === 'load' ? '카카오맵을 불러오지 못했어요. 이 주소가 카카오 앱의 JavaScript SDK 도메인에 등록됐는지 확인해 주세요. 목록은 그대로 쓸 수 있어요.'
          : error.message);
    }
  }

  // ---- data ----
  async function refresh({ fit = false } = {}) {
    let data;
    try { data = await json('/api/map'); }
    catch (error) { say(error.message); return; }
    // A place that was waiting and now has a valid report has just been woken up.
    state.woke = new Set(data.places.filter((place) => state.previous.get(place.id) === 'sleeping' && place.state === 'live').map((place) => place.id));
    state.previous = new Map(data.places.map((place) => [place.id, place.state]));
    state.data = data;
    renderLists();
    const woke = data.places.filter((place) => state.woke.has(place.id));
    if (woke.length) $('map-news').textContent = `${josa(woke[0].name, '이', '가')} 깨어났어요! 새 현장 소식이 올라왔어요.`;
    await showMap({ fit });
  }
  function startPolling() {
    clearInterval(state.timer);
    state.timer = setInterval(() => { if (frame.dataset.screen === 'map' && !document.hidden) refresh(); }, POLL_MS);
  }
  new MutationObserver(() => {
    if (frame.dataset.screen === 'map') { say(''); $('map-news').textContent = ''; refresh({ fit: true }); startPolling(); }
    else clearInterval(state.timer);
  }).observe(frame, { attributes: true, attributeFilter: ['data-screen'] });

  function open(focus = {}) {
    state.focus = focus;
    if (frame.dataset.screen === 'map') refresh({ fit: true });
    else goScreen('map');
  }
  $('home-map').addEventListener('click', () => open({}));
  $('ai-results-map').addEventListener('click', () => open({ places: (pets.lastResult()?.items ?? []).map((item) => item.place_id) }));
  $('arrival-map').addEventListener('click', () => { const info = arrival.info(); open(info ? { gu: info.district.id } : {}); });
  $('map-refresh').addEventListener('click', () => refresh());
  for (const [id, step] of [['map-zoom-in', -1], ['map-zoom-out', 1]]) {
    $(id).addEventListener('click', () => { if (state.map) state.map.setLevel(Math.min(12, Math.max(1, state.map.getLevel() + step)), { animate: true }); });
  }
  return { open };
}
