import { SEOUL_STATIONS, CURRENT_LOCATION, SEARCHED_PLACE, HOUR_CHOICES, WALK_CHOICES, TIME_OF_DAY, MAX_PARTY, insideSeoul, defaultTimeOfDay, normalizeConditions, describeConditions } from './ai-conditions.mjs';
import { CONDITION_STEPS, LAST_STEP, clampStep, stepDirection, nextStep, actionLabel, firstErrorStep, stepErrors, answerLabels, petLine } from './condition-steps.mjs';
import { fieldReportsSection, fetchReports, reportAge } from './field-reports.mjs';
import { readFriendLog } from './district-arrival.mjs';
import { petFace } from './pet-art.mjs';

// D27: the pet recommendation flow (펫 → 조건 → 추천 → 상세·현장 제보). Choices, location and results stay in
// memory for this visit only; the device location is never stored.
const $ = (id) => document.getElementById(id);
const FIELD_IDS = { departure: 'ai-departure-query', hours: 'ai-hours-options', partySize: 'ai-party', walkLevel: 'ai-walk-options', timeOfDay: 'ai-time-options' };
const RULES = '목적·이동 부담·현장 소식 순서의 기준 정렬';
const FALLBACK_COPY = {
  not_configured: `AI 연결이 설정되지 않아 ${RULES}로 골랐어요.`,
  timeout: `AI 응답이 10초를 넘겨 ${RULES}로 골랐어요.`,
  error: `AI에 연결하지 못해 ${RULES}로 골랐어요.`,
  invalid_response: `AI 응답을 읽을 수 없어 ${RULES}로 골랐어요.`,
  incomplete_response: 'AI 응답에 후보 밖의 곳이나 빈 항목이 있어 그 자리는 기준 정렬로 채웠어요.',
  no_candidates: '이 펫의 목적에 맞으면서 쓸 수 있는 시간 안에 다녀올 수 있는 곳을 찾지 못했어요. 시간을 늘리거나 출발 위치·펫을 바꿔 보세요.',
};

export function sourceNote(result) {
  if (result.source === 'ai') return `AI가 가까운 후보 ${result.candidateCount}곳 중에서 고른 곳이에요. 이유와 가는 법은 AI가 ${result.pet.name} 말투로 쓴 설명이에요.`;
  return FALLBACK_COPY[result.fallbackReason] ?? FALLBACK_COPY.error;
}
export function latestReportLine(report, now = Date.now()) {
  if (!report) return '아직 현장 소식이 없어요. 다녀오면 첫 소식을 남겨 주세요.';
  return `${report.categoryLabel} · ${reportAge(report.createdAt, now)} · ${report.text}`;
}
export const minutesLabel = (minutes) => `약 ${minutes}분(추정)`;
// D40: a pick with a Kakao route reads as transit time without (추정); others keep the straight-line estimate.
export const travelLabel = (item) => (item.transit ? `대중교통 약 ${item.transit.minutes}분 · ${item.transit.transfers ? `환승 ${item.transit.transfers}회` : '환승 없음'}`
  : item.walk || item.mode === 'walk' ? `걸어서 약 ${item.walk?.minutes ?? item.minutes}분(추정)` : minutesLabel(item.minutes));
// D44: where the picks were found ("종로구 사직동 근처 · 1.3km 안") and what they came from.
export function whereLabel(result) {
  const nearby = result.nearby;
  if (!nearby?.used) return '';
  const name = nearby.region?.dong ? `${nearby.region.gu} ${nearby.region.dong}`.trim() : nearby.label || '고른 곳';
  // A short trip says how far on foot; a long one only that the nearest come first (its reach is up to 20 km).
  return nearby.radiusKm <= 1.5 ? `${name} 근처 · 걸어서 ${Math.round(nearby.radiusKm * 19.5)}분 안` : `${name} 근처 · 가까운 곳부터`;
}
const NEARBY_MISSING = { NO_KEY: '근처 검색 키가 설정되지 않아', UNAVAILABLE: '근처 검색이 응답하지 않아', NO_MATCH: '이 근처에서 펫의 목적에 맞는 곳을 찾지 못해' };
export function nearbyNote(result) {
  const nearby = result.nearby;
  if (nearby?.used) return `카카오 장소 검색과 한국관광공사 자료에서 지금 찾은 근처 ${nearby.found}곳 가운데 골랐어요. 팀이 확인하지 않은 곳이라 영업시간·휴무는 카카오맵에서 확인해 주세요.`;
  return nearby?.reason ? `${NEARBY_MISSING[nearby.reason] ?? '근처 검색을 쓸 수 없어'} 팀이 정리한 서울 장소에서 골랐어요.` : '';
}
export const eventDates = (start, end) => [start, end].map((day) => `${Number(day.slice(4, 6))}.${Number(day.slice(6, 8))}`).join('~');
const SOURCE_NOTE = { kakao: '카카오 장소 검색 결과라 팀이 확인하지 않았어요. 영업시간·휴무는 카카오맵에서 확인해 주세요.', tourapi: '한국관광공사 자료예요. 팀이 확인하지 않았으니 운영 시간은 출발 전에 확인해 주세요.' };
export const sourceCheckNote = (place) => SOURCE_NOTE[place.source] ?? null;
// Q16: 서울시 실시간 도시데이터 crowding near a pick ("지금 약간 붐빔 · 광화문·덕수궁 16:20").
export const crowdLabel = (crowd) => `지금 ${crowd.level} · ${crowd.area}${crowd.time ? ` ${crowd.time}` : ''}`;
const transitFacts = (transit) => [transit.lines.length ? transit.lines.join(' → ') : '', `약 ${transit.minutes}분`, transit.transfers ? `환승 ${transit.transfers}회` : '환승 없음', transit.fare].filter(Boolean).join(', ');
export function resultsNote(result) {
  const reports = '현장 소식은 여행자가 남긴 당시 상황이니, 운영 시간과 경로는 출발 전에 확인해 주세요.';
  const walk = (result.items.some((item) => item.walk) ? '걸어서 걸리는 시간은 직선거리로 계산한 추정치예요. ' : '')
    + (result.items.some((item) => item.crowd) ? '혼잡도는 서울 열린데이터광장(서울특별시) 실시간 도시데이터예요. ' : '');
  return result.items.some((item) => item.transit)
    ? `추천한 곳의 대중교통 시간·환승·요금은 카카오 대중교통 기준이라 출발 시각에 따라 달라질 수 있어요. ${walk}더 보기의 시간은 직선거리 추정치예요. ${reports}`
    : `${walk || '이동 시간은 직선거리로 계산한 추정치예요. '}${reports}`;
}
export const distanceLabel = (km) => (km < 1 ? `약 ${Math.max(10, Math.round(km * 100) * 10)}m (직선)` : `약 ${km.toFixed(1)}km (직선)`);
export const kakaoPlaceUrl = (place) => `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.lat},${place.lng}`;
// Coordinates and address taken from TourAPI; the station and walking text are still the team's draft.
export const fromTourApi = (place) => place.coords_source === 'tourapi';
export function seoulHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(date));
}
export function metFriends(storage = globalThis.localStorage) {
  return readFriendLog(storage).map((entry) => entry.gu);
}

const node = (tag, className = '', text) => {
  const result = document.createElement(tag); result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
function externalLink(url, label) {
  const link = node('a', 'text-button', `${label} (새 창)`); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
// D42/P58 tiles for the step-by-step conditions: a radio, a face with optional art, the label and a hint.
// The SVG art is fixed markup written here (no user text), so building it from a string is safe.
const ART = Object.freeze({
  pin: '<svg viewBox="0 0 24 24"><path class="pin-body" d="M12 2.4c-3.9 0-7 3-7 6.9 0 5.1 7 12.3 7 12.3s7-7.2 7-12.3c0-3.9-3.1-6.9-7-6.9z"/><circle class="pin-dot" cx="12" cy="9.4" r="2.6"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.6V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.4" fill="currentColor"/><path d="M2.6 20c0-4 2.9-6.6 6.4-6.6s6.4 2.6 6.4 6.6z" fill="currentColor"/><circle cx="16.6" cy="9" r="2.7" fill="currentColor" opacity=".55"/><path d="M15 13.8c3.4-.6 6.4 1.6 6.4 5.6h-4.6" fill="currentColor" opacity=".55"/></svg>',
  paw: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="15.6" rx="4.7" ry="3.9"/><circle cx="6.1" cy="10.1" r="2.05"/><circle cx="9.8" cy="6.5" r="2.05"/><circle cx="14.2" cy="6.5" r="2.05"/><circle cx="17.9" cy="10.1" r="2.05"/></svg>',
  sun: '<svg viewBox="0 0 48 48"><g class="sun-rays">' + Array.from({ length: 8 }, (_, i) => `<rect x="22.6" y="3" width="2.8" height="7" rx="1.4" transform="rotate(${i * 45} 24 24)"/>`).join('') + '</g><circle class="sun-core" cx="24" cy="24" r="9.5"/></svg>',
  moon: '<svg viewBox="0 0 48 48"><path class="moon-body" d="M29.5 8.5a15.5 15.5 0 1 0 10 27.6A13 13 0 0 1 29.5 8.5z"/><circle class="star s1" cx="11" cy="12" r="1.8"/><circle class="star s2" cx="40" cy="12" r="1.3"/><circle class="star s3" cx="13" cy="37" r="1.1"/></svg>',
  person: '<svg viewBox="0 0 20 28"><circle cx="10" cy="7" r="5"/><path d="M1.6 27.4c0-6.4 3.8-10.6 8.4-10.6s8.4 4.2 8.4 10.6z"/></svg>',
});
const art = (name, className = '') => { const span = node('span', `cond-art art-${name} ${className}`.trim()); span.setAttribute('aria-hidden', 'true'); span.innerHTML = ART[name]; return span; };
function tile(container, { name, value, label, hint, checked, figure, className = 'cond-tile', index = 0 }) {
  const wrapper = node('label', className);
  wrapper.style.setProperty('--i', String(index));
  const input = node('input'); input.type = 'radio'; input.name = name; input.value = value; input.checked = checked; input.autocomplete = 'off';
  const face = node('span', 'cond-tile-face');
  if (figure) face.append(figure);
  face.append(node('b', '', label));
  if (hint) face.append(node('small', '', hint));
  wrapper.append(input, face); $(container).append(wrapper);
  return wrapper;
}
// A 한국관광공사 photo of a real place (never a generated one); it disappears quietly if it fails to load.
// P62: or a picture Kakao image search found on a news site or blog, credited to that site and linked to its page
// (it belongs to whoever posted it). A small one (Kakao's thumbnail only) is shown as a square, not stretched.
export const photoCredit = (place) => `사진: ${place.photo_credit || '한국관광공사'}`;
function photoFigure(place, { compact = false } = {}) {
  const small = compact || place.photo_large === false;
  const figure = node('figure', small ? 'place-photo small' : 'place-photo');
  const img = node('img'); img.src = place.photo; img.alt = `${place.name} 사진`; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  // A large original that will not load falls back to Kakao's thumbnail (as a square); only then is the photo dropped.
  img.addEventListener('error', () => {
    if (place.photo_thumb && img.src !== place.photo_thumb) { img.src = place.photo_thumb; figure.classList.add('small'); return; }
    figure.remove();
  });
  const caption = node('figcaption');
  if (place.photo_link) {
    const link = node('a', '', photoCredit(place)); link.href = place.photo_link; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${photoCredit(place)} (새 창에서 원래 글 보기)`);
    caption.append(link);
  } else caption.textContent = photoCredit(place);
  figure.append(img, caption);
  return figure;
}
// Restart a CSS animation by taking its class off and putting it back on the next layout.
function replay(element, className) { element.classList.remove(className); void element.offsetWidth; element.classList.add(className); }

// D35/P51: the pets are drawn in pet-art.mjs; re-exported here for the modules that already import them from this one.
export { petFace };

export function setupAiFlow({ goScreen, showResults }) {
  const state = { catalog: null, petId: null, location: null, searched: null, result: null };
  const catalogWaiters = [];
  const pet = () => state.catalog?.pets.find((item) => item.id === state.petId) ?? null;
  const steps = [...document.querySelectorAll('#ai-form .ai-step')];
  let step = 0;
  let busy = false;
  let autoTimer = 0;
  // D43: while a review row's 바꾸기 is open, returnTo is the review step and edited names the row ('pet' or a step).
  let returnTo = -1;
  let edited = null;
  const endEdit = () => { returnTo = -1; edited = null; $('pet-next').textContent = '조건 정하기'; };

  function selectPet(id) {
    state.petId = id;
    document.querySelectorAll('#pet-options input').forEach((input) => { input.checked = input.value === id; });
    $('pet-error').textContent = '';
    $('cond-pet-face').replaceChildren(petFace(id));
    say(CONDITION_STEPS[step].id, { animate: false });
  }

  function renderCatalog() {
    const { pets } = state.catalog;
    $('home-pet-list').replaceChildren(...pets.map((item) => {
      const li = node('li'); const button = node('button', 'home-pet'); button.type = 'button';
      button.setAttribute('aria-label', `${item.name}, ${item.purpose} 여행으로 시작하기`);
      button.append(petFace(item.id), node('b', '', item.name), node('small', '', item.purpose));
      button.addEventListener('click', () => { endEdit(); selectPet(item.id); goScreen('pet'); });
      li.append(button); return li;
    }));
    $('pet-options').replaceChildren(...pets.map((item) => {
      const label = node('label', 'pet-option');
      const input = node('input'); input.type = 'radio'; input.name = 'pet'; input.value = item.id; input.autocomplete = 'off';
      input.checked = item.id === state.petId;
      input.addEventListener('change', () => selectPet(item.id));
      const card = node('span', 'pet-card');
      const text = node('span', 'pet-card-text');
      text.append(node('b', '', `${item.name} · ${item.purpose}`), node('span', 'pet-card-intro', item.intro), node('small', '', item.tags.join(' · ')));
      card.append(petFace(item.id), text);
      label.append(input, card); return label;
    }));
  }

  async function loadCatalog() {
    $('home-catalog-status').replaceChildren(document.createTextNode('펫 정보를 불러오는 중이에요.'));
    try {
      const response = await fetch('/api/catalog');
      if (!response.ok) throw new Error();
      state.catalog = await response.json();
      $('home-catalog-status').textContent = '';
      renderCatalog();
      catalogWaiters.splice(0).forEach((resolve) => resolve(state.catalog));
    } catch {
      const retry = node('button', 'text-button', '다시 불러오기'); retry.type = 'button'; retry.addEventListener('click', loadCatalog);
      $('home-catalog-status').replaceChildren(document.createTextNode('펫 정보를 불러오지 못했어요. node scripts/serve.mjs로 연 주소인지 확인해 주세요. '), retry);
    }
  }

  // --- Step 1 출발 위치: 현재 위치, a typed place found through the server, or one of the stations. ---
  const checkedValue = (name) => document.querySelector(`#ai-form input[name="${name}"]:checked`)?.value;
  function syncDeparture() {
    const value = checkedValue('ai-departure');
    $('use-location').setAttribute('aria-pressed', String(value === CURRENT_LOCATION));
    document.querySelectorAll('#ai-departure-results .departure-result').forEach((button) => button.setAttribute('aria-pressed', String(value === SEARCHED_PLACE && button.dataset.label === state.searched?.label)));
  }
  function setLocation(point) {
    state.location = point;
    $('ai-departure-current').checked = Boolean(point);
    syncDeparture();
  }
  document.querySelector('#use-location .departure-pin').append(art('pin'));
  SEOUL_STATIONS.forEach(({ id, label }, index) => tile('ai-departure-options', { name: 'ai-departure', value: id, label, checked: false, className: 'cond-chip', index }));
  $('ai-departure-options').addEventListener('change', () => {
    syncDeparture(); $('ai-departure-status').textContent = ''; $('location-status').textContent = '';
  });
  $('use-location').addEventListener('click', () => {
    if (!navigator.geolocation) { $('location-status').textContent = '이 브라우저에서는 위치를 쓸 수 없어요. 출발 위치를 찾거나 역을 골라 주세요.'; return; }
    $('use-location').disabled = true; $('use-location').classList.add('locating'); $('location-status').textContent = '현재 위치를 확인하는 중이에요.';
    const done = () => { $('use-location').disabled = false; $('use-location').classList.remove('locating'); };
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      done();
      const point = { lat: Math.round(coords.latitude * 1000) / 1000, lng: Math.round(coords.longitude * 1000) / 1000 };
      if (!insideSeoul(point)) { setLocation(null); $('location-status').textContent = '현재 위치가 서울 밖이라 쓰지 않았어요. 출발 위치를 찾거나 역을 골라 주세요.'; return; }
      setLocation(point); clearErrors();
      $('location-status').textContent = '지금 있는 곳 근처에서 찾아요. 위치는 근처를 찾는 데만 쓰고 저장하지 않아요.';
      autoNext(0);
    }, (error) => {
      done(); setLocation(null);
      $('location-status').textContent = error.code === 1 ? '위치 권한이 꺼져 있어요. 출발 위치를 찾거나 역을 골라 주세요.' : '위치를 받지 못했어요. 출발 위치를 찾거나 역을 골라 주세요.';
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });

  // D39: a typed departure (주소·역·건물·가게 이름) found through the server; picking a result makes it the 출발 위치.
  function chooseDeparture(item) {
    state.searched = { label: item.label, lat: item.lat, lng: item.lng };
    $('ai-departure-place').checked = true; syncDeparture(); clearErrors();
    $('ai-departure-query').value = item.label;
    $('ai-departure-status').textContent = `‘${item.label}’ 근처에서 찾아요. 이번 추천 계산에만 쓰고 저장하지 않아요.`;
    $('location-status').textContent = '';
    autoNext(0);
  }
  async function findDeparture() {
    const query = $('ai-departure-query').value.trim();
    if (!query) { $('ai-departure-status').textContent = '주소나 역, 건물·가게 이름을 적어 주세요.'; $('ai-departure-query').focus(); return; }
    $('ai-departure-find').disabled = true; $('ai-departure-status').textContent = '찾는 중이에요.';
    try {
      const response = await fetch('/api/places/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
      const { results = [], source, reason } = await response.json();
      $('ai-departure-results').replaceChildren(...results.map((item, index) => {
        const pick = node('button', 'departure-result'); pick.type = 'button'; pick.dataset.label = item.label;
        pick.setAttribute('aria-pressed', 'false'); pick.style.setProperty('--i', String(index));
        pick.append(art('pin'), node('b', '', item.label), node('small', '', item.address));
        pick.addEventListener('click', () => chooseDeparture(item));
        const row = node('li'); row.append(pick); return row;
      }));
      $('ai-departure-results').hidden = !results.length;
      // Kakao found nothing (NO_MATCH), or was not available: the results then come from the app's own list.
      const local = source === 'local';
      const from = !local ? '' : reason === 'NO_MATCH' ? '카카오에 없는 이름이라 앱 안의 역·후보지에서 ' : '카카오 검색을 쓸 수 없어 앱 안의 역·후보지에서 ';
      $('ai-departure-status').textContent = results.length
        ? `${from}${results.length}곳을 찾았어요. 출발할 곳을 골라 주세요.`
        : reason === 'NO_MATCH' ? '찾지 못했어요. 가게·건물 이름이나 도로명 주소로 적어 보세요(예: 합정역, 양화로 55).' : '찾지 못했어요. 아래에서 역을 골라 주세요.';
    } catch { $('ai-departure-status').textContent = '찾지 못했어요. 아래에서 역을 골라 주세요.'; }
    finally { $('ai-departure-find').disabled = false; }
  }
  $('ai-departure-find').addEventListener('click', findDeparture);
  $('ai-departure-query').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); findDeparture(); } });

  // --- Step 2 쓸 수 있는 시간: the ring on each tile fills to its share of 12 hours. ---
  HOUR_CHOICES.forEach(({ hours, label, hint }, index) => {
    const ring = node('span', 'hours-ring'); ring.setAttribute('aria-hidden', 'true'); ring.style.setProperty('--fill', `${Math.round((hours / 12) * 360)}deg`);
    tile('ai-hours-options', { name: 'ai-hours', value: String(hours), label, hint, checked: hours === 3, figure: ring, index });
  });
  const customRing = node('span', 'hours-ring custom'); customRing.setAttribute('aria-hidden', 'true');
  tile('ai-hours-options', { name: 'ai-hours', value: 'custom', label: '직접 입력', checked: false, figure: customRing, index: HOUR_CHOICES.length });
  // D39: a typed time shows its two boxes only while 직접 입력 is picked.
  $('ai-hours-options').addEventListener('change', () => {
    const custom = checkedValue('ai-hours') === 'custom';
    $('ai-hours-custom').hidden = !custom;
    if (custom && !$('ai-hours-h').value && !$('ai-hours-m').value) $('ai-hours-h').focus();
  });
  const customHours = () => ($('ai-hours-h').value === '' && $('ai-hours-m').value === '' ? NaN : Number($('ai-hours-h').value || 0) + Number($('ai-hours-m').value || 0) / 60);

  // --- Step 3 인원·걷기: a −/+ stepper with one figure per person, and paw prints for how much walking. ---
  function renderPeople() {
    const value = Number($('ai-party').value);
    const count = Number.isInteger(value) && value >= 1 && value <= MAX_PARTY ? value : 0;
    const people = $('ai-party-people');
    while (people.children.length > count) people.lastElementChild.remove();
    while (people.children.length < count) people.append(art('person', people.children.length ? '' : 'me'));
    $('ai-party-minus').disabled = !count || value <= 1;
    $('ai-party-plus').disabled = count >= MAX_PARTY;
  }
  function stepParty(delta) {
    const value = Number($('ai-party').value);
    $('ai-party').value = String(Math.min(MAX_PARTY, Math.max(1, (Number.isInteger(value) ? value : 1) + delta)));
    replay($('ai-party').parentElement, 'bump'); renderPeople(); clearErrors();
  }
  $('ai-party-minus').addEventListener('click', () => stepParty(-1));
  $('ai-party-plus').addEventListener('click', () => stepParty(1));
  $('ai-party').addEventListener('input', renderPeople);
  renderPeople();
  WALK_CHOICES.forEach(({ level, label, hint }, index) => {
    const paws = node('span', 'walk-paws'); paws.setAttribute('aria-hidden', 'true');
    for (let n = 0; n < level; n += 1) paws.append(art('paw'));
    tile('ai-walk-options', { name: 'ai-walk', value: String(level), label, hint, checked: level === 2, figure: paws, index });
  });

  // --- Step 4 출발 시간대 and the review before 추천 받기. ---
  const slot = defaultTimeOfDay(seoulHour());
  TIME_OF_DAY.forEach(({ id, label }, index) => tile('ai-time-options', { name: 'ai-time', value: id, label, hint: id === 'day' ? '해 있을 때' : '해 지고 나서', checked: id === slot, figure: art(id === 'day' ? 'sun' : 'moon'), index }));
  $('ai-time-options').addEventListener('change', () => { renderReview(); say('ready'); });

  function rawConditions() {
    const departure = checkedValue('ai-departure') ?? '';
    return {
      pet: state.petId, departure,
      location: departure === SEARCHED_PLACE ? state.searched : state.location,
      departureLabel: departure === SEARCHED_PLACE ? state.searched?.label : undefined,
      hours: checkedValue('ai-hours') === 'custom' ? customHours() : Number(checkedValue('ai-hours')), partySize: $('ai-party').value === '' ? NaN : Number($('ai-party').value),
      walkLevel: Number(checkedValue('ai-walk')), timeOfDay: checkedValue('ai-time'), metFriends: metFriends(),
    };
  }
  function labels() {
    const raw = rawConditions();
    const departure = raw.departure === CURRENT_LOCATION ? (state.location ? '현재 위치' : '')
      : raw.departure === SEARCHED_PLACE ? state.searched?.label ?? '' : SEOUL_STATIONS.find((station) => station.id === raw.departure)?.label ?? '';
    return answerLabels({ ...raw, departure });
  }
  function showErrors(fields = {}) {
    for (const [field, id] of Object.entries(FIELD_IDS)) {
      const message = fields[field] ?? '';
      $(`ai-${field}-error`).textContent = message;
      if (message) $(id).setAttribute('aria-invalid', 'true'); else $(id).removeAttribute('aria-invalid');
    }
    const first = Object.keys(FIELD_IDS).find((field) => fields[field]);
    if (first) { const target = $(FIELD_IDS[first]); (target.matches('input,select') ? target : target.querySelector('input'))?.focus(); }
  }
  function clearErrors() {
    if (!document.querySelector('#ai-form [aria-invalid="true"]') && !$('ai-form-error').textContent) return;
    showErrors(); $('ai-form-error').textContent = ''; say(CONDITION_STEPS[step].id);
  }
  $('ai-form').addEventListener('change', clearErrors);

  // --- The steps: one question on screen, the pet asking it, a progress bar, and answered steps as pills. ---
  function say(moment, { animate = true } = {}) {
    $('ai-pet-line').textContent = petLine(state.petId, moment, labels());
    if (!animate) return;
    replay($('ai-pet-line'), 'speak');
    $('cond-pet-face').classList.remove('hop', 'tilt');
    replay($('cond-pet-face'), moment === 'oops' ? 'tilt' : 'hop');
  }
  const PILL_ART = { departure: 'pin', hours: 'clock', party: 'people' };
  function renderAnswers(direction) {
    const answers = labels();
    const done = step === LAST_STEP ? [] : CONDITION_STEPS.slice(0, step).filter((info) => answers[info.id]);
    $('cond-answers').hidden = !done.length;
    $('cond-answers').replaceChildren(...done.map((info, index) => {
      const button = node('button', 'cond-pill'); button.type = 'button';
      button.setAttribute('aria-label', `${info.question} ${answers[info.id]}, 바꾸기`);
      button.append(art(PILL_ART[info.id]), node('span', '', answers[info.id]));
      button.addEventListener('click', () => showStep(CONDITION_STEPS.indexOf(info)));
      const li = node('li', direction === 'forward' && index === done.length - 1 ? 'fresh' : ''); li.append(button); return li;
    }));
  }
  // 바꾸기 opens that question (or the pet screen); answering it comes straight back here (nextStep).
  function editFromReview(target) {
    returnTo = LAST_STEP; edited = target;
    if (target === 'pet') { $('pet-next').textContent = '바꾸고 돌아가기'; goScreen('pet'); return; }
    showStep(target);
  }
  function renderReview(changed = null) {
    const answers = labels(); const chosen = pet();
    const rows = [['함께 갈 펫', chosen ? `${chosen.name} · ${chosen.purpose}` : '', 'pet'], ['찾을 곳', answers.departure, 0], ['쓸 수 있는 시간', answers.hours, 1], ['인원·걷기', answers.party, 2]];
    $('cond-review-list').replaceChildren(...rows.map(([label, value, target], index) => {
      const row = node('div', target === changed ? 'cond-review-row just-changed' : 'cond-review-row'); row.style.setProperty('--i', String(index));
      const edit = () => editFromReview(target);
      const change = node('button', 'text-button', '바꾸기'); change.type = 'button';
      change.setAttribute('aria-label', `${label} 바꾸기`); change.addEventListener('click', edit);
      const answer = node('dd'); answer.append(node('span', '', value || '아직 안 골랐어요'), change);
      row.append(node('dt', '', label), answer); return row;
    }));
  }
  function showStep(index, { focus = true } = {}) {
    if (busy) return;
    clearTimeout(autoTimer);
    const to = clampStep(index);
    const visible = !$('ai-panel').hidden;
    const changed = returnTo >= 0 && to === returnTo ? edited : null;
    if (to === returnTo || to === LAST_STEP) endEdit();
    const direction = visible ? stepDirection(step, to) : 'none';
    step = to;
    steps.forEach((element, at) => { element.hidden = at !== to; });
    const info = CONDITION_STEPS[to];
    steps[to].classList.remove('shake'); steps[to].dataset.dir = direction; replay(steps[to], 'entering');
    $('ai-heading').textContent = info.question; replay($('ai-heading'), 'swap');
    $('cond-hint').textContent = returnTo >= 0 ? '바꾸면 확인 화면으로 바로 돌아가요.' : info.hint;
    $('cond-progress').setAttribute('aria-valuenow', String(to + 1));
    $('cond-progress').setAttribute('aria-valuetext', `4단계 중 ${to + 1}단계, ${info.question}`);
    $('cond-progress-fill').style.setProperty('--progress', `${((to + 1) / CONDITION_STEPS.length) * 100}%`);
    $('ai-submit').textContent = actionLabel(to, returnTo);
    showErrors(); $('ai-form-error').textContent = '';
    renderAnswers(direction);
    if (to === LAST_STEP) renderReview(changed);
    say(changed !== null ? 'ready' : info.id, { animate: visible });
    if (!visible) return;
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (focus) { $('ai-heading').setAttribute('tabindex', '-1'); $('ai-heading').focus({ preventScroll: true }); }
  }
  function checkStep(index) {
    try { normalizeConditions(rawConditions(), { petIds: state.catalog.pets.map((item) => item.id) }); return {}; }
    catch (error) { if (error.name !== 'ConditionError') throw error; return stepErrors(error.fields, index); }
  }
  function oops(fields) {
    showErrors(fields); say('oops'); steps[step].classList.remove('entering'); replay(steps[step], 'shake');
  }
  function goNext() {
    const errors = checkStep(step);
    if (Object.keys(errors).length) { oops(errors); return; }
    showStep(nextStep(step, returnTo));
  }
  // Steps 1·2 move on by themselves after a tap or a pick (not after keyboard moves between choices).
  function autoNext(from) {
    clearTimeout(autoTimer);
    if (!CONDITION_STEPS[from].auto) return;
    autoTimer = setTimeout(() => { if (step === from && !$('ai-panel').hidden && !busy) goNext(); }, 420);
  }
  for (const [container, from] of [['ai-departure-options', 0], ['ai-hours-options', 1]]) {
    $(container).addEventListener('click', (event) => {
      const label = event.target.closest('label');
      // The radio covers its tile, so a tap lands on the input itself; keyboard picks arrive with detail 0.
      if (!label || event.detail === 0 || label.querySelector('input').value === 'custom') return;
      autoNext(from);
    });
  }
  // The header's back button goes to the previous question first, then (from question 1) to the pet screen.
  // During a 바꾸기 it goes back to the review instead, from the question or from the pet screen.
  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('#app-back') || busy) return;
    const onPet = !$('pet-panel').hidden; const onAi = !$('ai-panel').hidden;
    if (onPet && returnTo >= 0 && state.petId) { event.preventDefault(); event.stopPropagation(); showStep(returnTo, { focus: false }); goScreen('ai'); return; }
    if (!onAi || (step === 0 && returnTo < 0)) return;
    event.preventDefault(); event.stopPropagation();
    showStep(returnTo >= 0 ? returnTo : step - 1);
  }, true);
  // 펫 고르고 출발하기 on the home screen starts over, so an open 바꾸기 ends.
  $('home-ai').addEventListener('click', endEdit);
  $('pet-next').addEventListener('click', () => {
    if (state.petId) { showStep(returnTo >= 0 ? returnTo : 0, { focus: false }); goScreen('ai'); return; }
    $('pet-error').textContent = state.catalog ? '함께 갈 펫을 골라 주세요.' : '펫 정보를 불러오지 못했어요. 홈에서 다시 불러와 주세요.';
    document.querySelector('#pet-options input')?.focus();
  });
  showStep(0, { focus: false });

  function openPlaceDetail(item, onClose) {
    const { place } = item;
    const content = $('evidence-content'); content.replaceChildren();
    const heading = node('h2', '', place.name); heading.id = 'evidence-heading'; heading.tabIndex = -1;
    content.append(node('span', 'small-label', place.guName), heading, node('p', 'intro', place.summary));
    const facts = node('dl', 'place-facts');
    const walk = WALK_CHOICES.find((choice) => choice.level === place.walk_level);
    // An arrival-screen place has a distance from here instead of travel minutes and no friend line.
    if (place.photo) content.append(photoFigure(place));
    else if (!place.photo_checked) loadPhotos([place]).then(() => { if (place.photo && content.isConnected && !content.querySelector('.place-photo')) content.insertBefore(photoFigure(place), content.querySelector('.place-facts')); });
    const moving = item.minutes == null ? null : item.transit ? `${transitFacts(item.transit)} (카카오 대중교통 기준)`
      : item.walk ? `걸어서 약 ${item.walk.minutes}분, 직선 ${distanceLabel(item.walk.km).replace(' (직선)', '')}(추정)` : `${minutesLabel(item.minutes)}, 직선거리로 계산`;
    for (const [label, text] of [['추천 이유', item.reason], ['종류', place.kind], ['주소', place.address], ['가는 방법', place.nearest_station && `${place.nearest_station} ${place.access_summary}`], ['예상 이동', moving], ['지금 혼잡도', item.crowd && `${item.crowd.level}. ${item.crowd.message} (${item.crowd.area}${item.crowd.time ? `, ${item.crowd.time} 기준` : ''}, 서울시 실시간 도시데이터)`], ['여기서 거리', item.distanceKm != null && distanceLabel(item.distanceKm)], ['걷기', walk && `${walk.label} (${walk.hint})`], ['동네 친구', item.friend && (item.friend_hint || `${place.guName}의 동네 친구 ‘${item.friend.name}’는 이미 만났어요.`)]]) if (text) facts.append(node('dt', '', label), node('dd', '', text));
    content.append(facts);
    const sourced = sourceCheckNote(place);
    if (sourced) content.append(node('p', 'field-help', sourced));
    else if (place.needs_check) content.append(node('p', 'field-help', fromTourApi(place) ? '위치·주소는 한국관광공사 TourAPI 자료예요. 가는 방법은 팀이 아직 확인하지 않은 초안이라 지도 앱에서 함께 확인해 주세요.' : '위치와 교통 정보는 팀이 아직 확인하지 않은 초안이에요. 지도 앱에서 함께 확인해 주세요.'));
    else content.append(node('p', 'field-help', `위치·주소는 한국관광공사 TourAPI 자료이고, 가는 방법은 ${place.access_checked_at} 공식 안내로 확인했어요. 당일 출구 공사 등은 다를 수 있어요.`));
    if (place.access_source) content.append(externalLink(place.access_source, '가는 방법 공식 안내'));
    if (item.walk?.url) content.append(externalLink(item.walk.url, '카카오맵 걷기 길찾기'));
    if (place.source_url) content.append(externalLink(place.source_url, '카카오맵 장소 정보'));
    content.append(externalLink(kakaoPlaceUrl(place), '카카오맵에서 위치 보기'), fieldReportsSection(place));
    const dialog = $('evidence-dialog');
    dialog.addEventListener('close', onClose, { once: true });
    dialog.showModal(); heading.focus();
  }

  function resultCard(item, index, result) {
    const card = node('li', 'ai-result-card');
    const head = node('div', 'ai-result-head');
    const title = node('div');
    title.append(node('span', 'ai-result-rank', String(index + 1).padStart(2, '0')), node('h3', '', item.place.name), node('p', 'muted', [item.place.guName, item.place.kind, travelLabel(item)].filter(Boolean).join(' · ')));
    if (item.crowd) { const chip = node('p', `crowd-chip crowd-${item.crowd.rank}`, crowdLabel(item.crowd)); chip.setAttribute('aria-label', `서울시 실시간 혼잡도 ${crowdLabel(item.crowd)}`); title.append(chip); }
    head.append(title);
    if (result.source === 'mixed' && item.source === 'rules') head.append(node('span', 'small-label', '기준 정렬로 채움'));
    const voice = node('div', 'ai-result-voice');
    const said = node('p'); said.append(node('span', 'visually-hidden', `${result.pet.name}의 한마디: `), document.createTextNode(item.reason));
    voice.append(petFace(result.pet.id), said);
    const tags = node('div', 'ai-result-tags'); item.place.tags.forEach((tag) => tags.append(node('span', 'tag', tag)));
    const body = node('dl', 'ai-result-body');
    const report = node('dd', 'ai-result-report', item.live_note || latestReportLine(item.latest_report));
    body.append(node('dt', '', '가는 법'), node('dd', '', item.route_summary), node('dt', '', '현장 소식'), report);
    body.append(node('dt', '', '동네 친구'), node('dd', 'ai-friend-hint', item.friend_hint || '이 구의 동네 친구는 이미 만났어요.'));
    const actions = node('div', 'ai-result-actions');
    const detail = node('button', 'button primary', '상세·현장 소식'); detail.type = 'button';
    detail.setAttribute('aria-label', `${item.place.name} 상세와 현장 소식 보기`);
    // After the dialog closes, the card shows the newest active report so a just-posted one appears right away.
    detail.addEventListener('click', () => openPlaceDetail(item, async () => {
      try {
        const { reports } = await fetchReports(item.place.id);
        item.latest_report = reports.find((entry) => entry.active) ?? null;
        report.textContent = latestReportLine(item.latest_report);
      } catch { /* keep the previous line when the server is unreachable */ }
    }));
    actions.append(detail, externalLink(kakaoPlaceUrl(item.place), '지도'));
    const routeUrl = item.transit?.landingUrl ?? item.walk?.url;
    if (routeUrl) {
      const route = externalLink(routeUrl, item.transit ? '카카오맵 길찾기' : '카카오맵 걷기 길찾기');
      // D41: opening Kakao's route counts toward #길찾기 많은 (only the place id is sent).
      route.addEventListener('click', () => { fetch('/api/stats/route', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId: item.place.id }) }).catch(() => {}); });
      actions.append(route);
    }
    if (item.place.photo && item.place.photo_large !== false) card.append(photoFigure(item.place));
    else if (item.place.photo) head.append(photoFigure(item.place, { compact: true }));
    card.append(head, voice, tags, body);
    if (item.transit?.tight) card.append(node('p', 'field-help ai-result-tight', '실제 대중교통으로는 오가는 시간이 길어 그곳에서 보낼 시간이 빠듯해요. 시간을 늘리거나 다른 곳도 살펴보세요.'));
    if (sourceCheckNote(item.place)) card.append(node('p', 'field-help ai-result-source', item.place.source === 'kakao' ? '카카오 장소 검색에서 지금 찾은 곳 · 팀 확인 전' : '한국관광공사 자료에서 지금 찾은 곳 · 팀 확인 전'));
    else if (item.place.needs_check) card.append(node('p', 'field-help', fromTourApi(item.place) ? '가는 방법은 확인 전 초안이에요.' : '교통·위치 정보는 확인 전 초안이에요.'));
    card.append(actions);
    return card;
  }

  function renderResults(result) {
    $('ai-results-conditions').textContent = result.conditionsText;
    $('ai-results-source').textContent = sourceNote(result);
    $('ai-results-source').dataset.source = result.source;
    $('ai-results-note').textContent = resultsNote(result);
    const where = whereLabel(result);
    $('ai-results-where').hidden = !where;
    $('ai-results-where').replaceChildren(art('pin'), document.createTextNode(where));
    const note = nearbyNote(result);
    if (note) $('ai-results-source').textContent = `${note} ${sourceNote(result)}`;
    renderEvents(result.festivals ?? []);
    $('ai-results-list').replaceChildren(...(result.items.length ? result.items.map((item, index) => resultCard(item, index, result)) : [node('li', 'report-empty', FALLBACK_COPY.no_candidates)]));
    renderMore(result);
  }

  // D44: festivals and events going on today near the point (한국관광공사), nearest first.
  function renderEvents(events) {
    $('ai-results-events').hidden = !events.length;
    $('ai-events-list').replaceChildren(...events.map((event, index) => {
      const item = node('li', 'ai-event'); item.style.setProperty('--i', String(index));
      const text = node('div', 'ai-event-text');
      text.append(node('b', '', event.title), node('span', 'muted', `${eventDates(event.start, event.end)} · ${distanceLabel(event.km)}${event.address ? ` · ${event.address}` : ''}`));
      if (event.photo) { const thumb = node('img', 'ai-event-photo'); thumb.src = event.photo; thumb.alt = ''; thumb.loading = 'lazy'; thumb.decoding = 'async'; thumb.referrerPolicy = 'no-referrer'; thumb.addEventListener('error', () => thumb.remove()); item.append(thumb); }
      item.append(text, externalLink(`https://map.kakao.com/link/map/${encodeURIComponent(event.title)},${event.lat},${event.lng}`, '위치'));
      return item;
    }));
  }

  // D31/P44 "더 보기": the other purpose places within reach in rule order, shown 10 at a time. No scores are shown.
  const MORE_STEP = 10;
  let moreShown = 0;
  // P62: photos for listed places come a few at a time after the list shows, so the list never waits for them.
  async function loadPhotos(places) {
    const wanted = places.filter((place) => !place.photo && !place.photo_checked).slice(0, 10);
    if (!wanted.length) return;
    wanted.forEach((place) => { place.photo_checked = true; });
    try {
      const response = await fetch('/api/places/photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: wanted.map((place) => place.id) }) });
      const { photos = {} } = await response.json();
      for (const place of wanted) Object.assign(place, photos[place.id] ?? {});
    } catch { /* no photo is fine */ }
  }
  function moreItem(entry) {
    const { place } = entry;
    const item = node('li', 'arrival-place more-place');
    const head = node('div', 'arrival-place-head');
    head.append(node('b', '', place.name), node('span', 'muted', [place.guName, place.kind, travelLabel(entry)].filter(Boolean).join(' · ')));
    item.dataset.placeId = place.id;
    if (place.photo) item.append(photoFigure(place, { compact: true }));
    const open = node('button', 'button subtle', '상세·현장 소식'); open.type = 'button';
    open.setAttribute('aria-label', `${place.name} 상세와 현장 소식 보기`);
    open.addEventListener('click', () => openPlaceDetail({ place, minutes: entry.minutes, mode: entry.mode, reason: '' }, () => {}));
    item.append(head, node('p', 'arrival-place-tags', entry.purpose_tags.join(' · ')), node('p', 'field-help', latestReportLine(entry.latest_report)));
    if (sourceCheckNote(place)) item.append(node('p', 'field-help', place.source === 'kakao' ? '카카오 장소 검색 결과 · 팀 확인 전' : '한국관광공사 자료 · 팀 확인 전'));
    else if (place.needs_check) item.append(node('p', 'field-help', fromTourApi(place) ? '가는 방법은 확인 전 초안이에요.' : '교통·위치 정보는 확인 전 초안이에요.'));
    item.append(open);
    return item;
  }
  function showMore() {
    const more = state.result?.more ?? [];
    const batch = more.slice(moreShown, moreShown + MORE_STEP);
    $('ai-more-list').append(...batch.map(moreItem));
    loadPhotos(batch.map((entry) => entry.place)).then(() => {
      for (const entry of batch) {
        const row = $('ai-more-list').querySelector(`[data-place-id="${CSS.escape(entry.place.id)}"]`);
        if (entry.place.photo && row && !row.querySelector('.place-photo')) row.prepend(photoFigure(entry.place, { compact: true }));
      }
    });
    moreShown = Math.min(more.length, moreShown + MORE_STEP);
    const left = more.length - moreShown;
    $('ai-more-next').hidden = left <= 0;
    $('ai-more-next').textContent = `${Math.min(MORE_STEP, left)}곳 더 보기 (${left}곳 남음)`;
  }
  function renderMore(result) {
    const more = result.more ?? [];
    moreShown = 0;
    $('ai-more-list').replaceChildren(); $('ai-more-list').hidden = true; $('ai-more-next').hidden = true;
    $('ai-results-more').hidden = !more.length;
    if (!more.length) return;
    $('ai-more-heading').textContent = `${result.pet.name}의 ${result.pet.purpose} 목적에 맞는 다른 곳 ${more.length}곳`;
    $('ai-more-toggle').textContent = '다른 곳 더 보기'; $('ai-more-toggle').setAttribute('aria-expanded', 'false');
  }
  $('ai-more-toggle').addEventListener('click', () => {
    const open = $('ai-more-toggle').getAttribute('aria-expanded') !== 'true';
    $('ai-more-toggle').setAttribute('aria-expanded', String(open));
    $('ai-more-toggle').textContent = open ? '다른 곳 접기' : '다른 곳 더 보기';
    $('ai-more-list').hidden = !open;
    if (open && !moreShown) showMore();
    $('ai-more-next').hidden = !open || moreShown >= (state.result?.more?.length ?? 0);
  });
  $('ai-more-next').addEventListener('click', showMore);

  async function requestRecommendations(conditions) {
    let response;
    try { response = await fetch('/api/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conditions }) }); }
    catch { throw new Error('서버에 연결하지 못했어요. node scripts/serve.mjs로 연 주소인지 확인해 주세요.'); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body.error?.message ?? '추천을 받지 못했어요. 잠시 후 다시 시도해 주세요.'), { fields: body.error?.fields });
    return body;
  }

  // A failed check (here or on the server) goes back to the earliest question with a problem and points at it.
  function showFieldErrors(fields) {
    const at = firstErrorStep(fields);
    if (at >= 0 && at !== step) showStep(at, { focus: false });
    oops(fields);
  }
  $('ai-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!pet()) { goScreen('pet'); return; }
    // Before the last question, 다음 (or Enter) checks only this question and moves on.
    if (step < LAST_STEP) { goNext(); return; }
    let conditions;
    try { conditions = normalizeConditions(rawConditions(), { petIds: state.catalog.pets.map((item) => item.id) }); }
    catch (error) {
      if (error.name !== 'ConditionError') throw error;
      showFieldErrors(error.fields);
      const count = Object.keys(error.fields).length;
      $('ai-form-error').textContent = count > 1 ? `${count}개 항목을 확인해 주세요.` : ''; return;
    }
    showErrors(); $('ai-form-error').textContent = '';
    busy = true; $('ai-submit').disabled = true; $('ai-submit').textContent = '추천 고르는 중…';
    // The chosen pet walks along a dotted path while the server (and up to 10 s of AI) works.
    $('ai-loading').replaceChildren(petFace(pet().id)); $('ai-loading').hidden = false;
    $('ai-summary').textContent = `${describeConditions(conditions, { petName: pet().name })} 조건으로 후보를 살펴보고 있어요. 10초쯤 걸릴 수 있어요.`;
    try {
      const result = await requestRecommendations(conditions);
      state.result = result; renderResults(result); $('ai-summary').textContent = '';
      showResults(result);
    } catch (error) {
      $('ai-summary').textContent = '';
      busy = false;
      if (error.fields?.pet) goScreen('pet');
      else if (error.fields) showFieldErrors(error.fields);
      $('ai-form-error').textContent = error.message;
    } finally {
      busy = false; $('ai-submit').disabled = false; $('ai-submit').textContent = step === LAST_STEP ? '추천 받기' : '다음';
      $('ai-loading').hidden = true; $('ai-loading').replaceChildren();
    }
  });

  // D44: "이 근처에서 추천 받기" on the map. The point becomes the search centre; with a pet already chosen the
  // conditions open on the review, so 추천 받기 is one tap away (and each answer can still be changed there).
  function pickPoint({ lat, lng, label }) {
    state.searched = { label, lat, lng };
    $('ai-departure-place').checked = true; syncDeparture(); clearErrors();
    $('ai-departure-query').value = label; $('ai-departure-results').hidden = true;
    $('ai-departure-status').textContent = `지도에서 고른 ‘${label}’ 근처에서 찾아요. 이번 추천 계산에만 쓰고 저장하지 않아요.`;
    $('location-status').textContent = '';
    // Without a pet yet, the pet screen comes first and then goes straight to the review (like a 바꾸기 of 출발).
    if (!state.petId) { returnTo = LAST_STEP; edited = 0; $('pet-next').textContent = '조건 확인하기'; goScreen('pet'); return 'pet'; }
    endEdit(); edited = null; showStep(LAST_STEP, { focus: false }); goScreen('ai');
    return 'ai';
  }
  const catalogReady = () => (state.catalog ? Promise.resolve(state.catalog) : new Promise((resolve) => catalogWaiters.push(resolve)));
  loadCatalog();
  // Stage 5 reads the chosen pet and catalog, and opens its places in the same detail view.
  return { hasPet: () => Boolean(pet()), petId: () => state.petId, catalogReady, openPlaceDetail, lastResult: () => state.result, pickPoint };
}
