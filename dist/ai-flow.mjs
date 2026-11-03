import { SEOUL_STATIONS, CURRENT_LOCATION, HOUR_CHOICES, WALK_CHOICES, TIME_OF_DAY, insideSeoul, defaultTimeOfDay, normalizeConditions, describeConditions, josa } from './ai-conditions.mjs';
import { fieldReportsSection, fetchReports, reportAge } from './field-reports.mjs';
import { readFriendLog } from './district-arrival.mjs';
import { petFace } from './pet-art.mjs';

// D27: the pet recommendation flow (펫 → 조건 → 추천 → 상세·현장 제보). Choices, location and results stay in
// memory for this visit only; the device location is never stored.
const $ = (id) => document.getElementById(id);
const FIELD_IDS = { departure: 'ai-departure', hours: 'ai-hours-options', partySize: 'ai-party', walkLevel: 'ai-walk-options', timeOfDay: 'ai-time-options' };
const RULES = '목적·이동 부담·현장 소식 순서의 기준 정렬';
const FALLBACK_COPY = {
  not_configured: `AI 연결이 설정되지 않아 ${RULES}로 골랐어요.`,
  timeout: `AI 응답이 10초를 넘겨 ${RULES}로 골랐어요.`,
  error: `AI에 연결하지 못해 ${RULES}로 골랐어요.`,
  invalid_response: `AI 응답을 읽을 수 없어 ${RULES}로 골랐어요.`,
  incomplete_response: 'AI 응답에 후보 밖의 곳이나 빈 항목이 있어 그 자리는 기준 정렬로 채웠어요.',
  no_candidates: '이 펫의 목적에 맞으면서 60분 안에 갈 수 있는 곳을 찾지 못했어요. 출발 위치나 펫을 바꿔 보세요.',
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
function chip(container, { type, name, value, label, hint, checked }) {
  const wrapper = node('label', 'interest-option');
  const input = node('input'); input.type = type; input.name = name; input.value = value; input.checked = checked; input.autocomplete = 'off';
  const text = node('span', '', label);
  if (hint) text.append(node('small', '', hint));
  wrapper.append(input, text); $(container).append(wrapper);
}

// D35/P51: the pets are drawn in pet-art.mjs; re-exported here for the modules that already import them from this one.
export { petFace };

export function setupAiFlow({ goScreen, showResults }) {
  const state = { catalog: null, petId: null, location: null, result: null };
  const catalogWaiters = [];
  const pet = () => state.catalog?.pets.find((item) => item.id === state.petId) ?? null;

  function selectPet(id) {
    state.petId = id;
    document.querySelectorAll('#pet-options input').forEach((input) => { input.checked = input.value === id; });
    $('pet-error').textContent = '';
    const chosen = pet();
    $('ai-pet-line').textContent = chosen ? `${josa(chosen.name, '과', '와')} 함께하는 ${chosen.purpose} 여행이에요. ${chosen.intro}` : '';
  }

  function renderCatalog() {
    const { pets } = state.catalog;
    $('home-pet-list').replaceChildren(...pets.map((item) => {
      const li = node('li'); const button = node('button', 'home-pet'); button.type = 'button';
      button.setAttribute('aria-label', `${item.name}, ${item.purpose} 여행으로 시작하기`);
      button.append(petFace(item.id), node('b', '', item.name), node('small', '', item.purpose));
      button.addEventListener('click', () => { selectPet(item.id); goScreen('pet'); });
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

  function setLocation(point) {
    state.location = point;
    const current = $('ai-departure').querySelector(`option[value="${CURRENT_LOCATION}"]`);
    current.disabled = !point;
    if (point) $('ai-departure').value = CURRENT_LOCATION;
    else if ($('ai-departure').value === CURRENT_LOCATION) $('ai-departure').value = '';
  }
  $('use-location').addEventListener('click', () => {
    if (!navigator.geolocation) { $('location-status').textContent = '이 브라우저에서는 위치를 쓸 수 없어요. 다음 화면에서 출발역을 골라 주세요.'; return; }
    $('use-location').disabled = true; $('location-status').textContent = '현재 위치를 확인하는 중이에요.';
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      $('use-location').disabled = false;
      const point = { lat: Math.round(coords.latitude * 1000) / 1000, lng: Math.round(coords.longitude * 1000) / 1000 };
      if (!insideSeoul(point)) { setLocation(null); $('location-status').textContent = '현재 위치가 서울 밖이라 쓰지 않았어요. 다음 화면에서 출발역을 골라 주세요.'; return; }
      setLocation(point); $('location-status').textContent = '현재 위치를 출발 위치로 쓸게요. 이번 추천 계산에만 쓰고 저장하지 않아요.';
    }, (error) => {
      $('use-location').disabled = false; setLocation(null);
      $('location-status').textContent = error.code === 1 ? '위치 권한이 꺼져 있어요. 다음 화면에서 출발역을 골라 주세요.' : '위치를 받지 못했어요. 다음 화면에서 출발역을 골라 주세요.';
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });
  $('pet-next').addEventListener('click', () => {
    if (state.petId) { goScreen('ai'); return; }
    $('pet-error').textContent = state.catalog ? '함께 갈 펫을 골라 주세요.' : '펫 정보를 불러오지 못했어요. 홈에서 다시 불러와 주세요.';
    document.querySelector('#pet-options input')?.focus();
  });

  const placeholder = node('option', '', '출발 위치를 골라 주세요'); placeholder.value = '';
  const current = node('option', '', '현재 위치'); current.value = CURRENT_LOCATION; current.disabled = true;
  $('ai-departure').append(placeholder, current, ...SEOUL_STATIONS.map(({ id, label }) => { const option = node('option', '', label); option.value = id; return option; }));
  HOUR_CHOICES.forEach(({ hours, label, hint }) => chip('ai-hours-options', { type: 'radio', name: 'ai-hours', value: String(hours), label, hint, checked: hours === 3 }));
  WALK_CHOICES.forEach(({ level, label, hint }) => chip('ai-walk-options', { type: 'radio', name: 'ai-walk', value: String(level), label, hint, checked: level === 2 }));
  const slot = defaultTimeOfDay(seoulHour());
  TIME_OF_DAY.forEach(({ id, label }) => chip('ai-time-options', { type: 'radio', name: 'ai-time', value: id, label, checked: id === slot }));

  function rawConditions() {
    const checked = (name) => document.querySelector(`#ai-form input[name="${name}"]:checked`)?.value;
    return {
      pet: state.petId, departure: $('ai-departure').value, location: state.location,
      hours: Number(checked('ai-hours')), partySize: $('ai-party').value === '' ? NaN : Number($('ai-party').value),
      walkLevel: Number(checked('ai-walk')), timeOfDay: checked('ai-time'), metFriends: metFriends(),
    };
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

  function openPlaceDetail(item, onClose) {
    const { place } = item;
    const content = $('evidence-content'); content.replaceChildren();
    const heading = node('h2', '', place.name); heading.id = 'evidence-heading'; heading.tabIndex = -1;
    content.append(node('span', 'small-label', place.guName), heading, node('p', 'intro', place.summary));
    const facts = node('dl', 'place-facts');
    const walk = WALK_CHOICES.find((choice) => choice.level === place.walk_level);
    // An arrival-screen place has a distance from here instead of travel minutes and no friend line.
    for (const [label, text] of [['추천 이유', item.reason], ['주소', place.address], ['가는 방법', `${place.nearest_station} ${place.access_summary}`], ['예상 이동', item.minutes != null && `${minutesLabel(item.minutes)}, 직선거리로 계산`], ['여기서 거리', item.distanceKm != null && distanceLabel(item.distanceKm)], ['걷기', `${walk.label} (${walk.hint})`], ['동네 친구', item.friend && (item.friend_hint || `${place.guName}의 동네 친구 ‘${item.friend.name}’는 이미 만났어요.`)]]) if (text) facts.append(node('dt', '', label), node('dd', '', text));
    content.append(facts);
    if (place.needs_check) content.append(node('p', 'field-help', fromTourApi(place) ? '위치·주소는 한국관광공사 TourAPI 자료예요. 가는 방법은 팀이 아직 확인하지 않은 초안이라 지도 앱에서 함께 확인해 주세요.' : '위치와 교통 정보는 팀이 아직 확인하지 않은 초안이에요. 지도 앱에서 함께 확인해 주세요.'));
    else content.append(node('p', 'field-help', `위치·주소는 한국관광공사 TourAPI 자료이고, 가는 방법은 ${place.access_checked_at} 공식 안내로 확인했어요. 당일 출구 공사 등은 다를 수 있어요.`));
    if (place.access_source) content.append(externalLink(place.access_source, '가는 방법 공식 안내'));
    content.append(externalLink(kakaoPlaceUrl(place), '카카오맵에서 위치 보기'), fieldReportsSection(place));
    const dialog = $('evidence-dialog');
    dialog.addEventListener('close', onClose, { once: true });
    dialog.showModal(); heading.focus();
  }

  function resultCard(item, index, result) {
    const card = node('li', 'ai-result-card');
    const head = node('div', 'ai-result-head');
    const title = node('div');
    title.append(node('span', 'ai-result-rank', String(index + 1).padStart(2, '0')), node('h3', '', item.place.name), node('p', 'muted', `${item.place.guName} · ${minutesLabel(item.minutes)}`));
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
    card.append(head, voice, tags, body);
    if (item.place.needs_check) card.append(node('p', 'field-help', fromTourApi(item.place) ? '가는 방법은 확인 전 초안이에요.' : '교통·위치 정보는 확인 전 초안이에요.'));
    card.append(actions);
    return card;
  }

  function renderResults(result) {
    $('ai-results-conditions').textContent = result.conditionsText;
    $('ai-results-source').textContent = sourceNote(result);
    $('ai-results-source').dataset.source = result.source;
    $('ai-results-list').replaceChildren(...(result.items.length ? result.items.map((item, index) => resultCard(item, index, result)) : [node('li', 'report-empty', FALLBACK_COPY.no_candidates)]));
    renderMore(result);
  }

  // D31/P44 "더 보기": the other purpose places within reach in rule order, shown 10 at a time. No scores are shown.
  const MORE_STEP = 10;
  let moreShown = 0;
  function moreItem(entry) {
    const { place } = entry;
    const item = node('li', 'arrival-place');
    const head = node('div', 'arrival-place-head');
    head.append(node('b', '', place.name), node('span', 'muted', `${place.guName} · ${minutesLabel(entry.minutes)}`));
    const open = node('button', 'button subtle', '상세·현장 소식'); open.type = 'button';
    open.setAttribute('aria-label', `${place.name} 상세와 현장 소식 보기`);
    open.addEventListener('click', () => openPlaceDetail({ place, minutes: entry.minutes, reason: '' }, () => {}));
    item.append(head, node('p', 'arrival-place-tags', entry.purpose_tags.join(' · ')), node('p', 'field-help', latestReportLine(entry.latest_report)));
    if (place.needs_check) item.append(node('p', 'field-help', fromTourApi(place) ? '가는 방법은 확인 전 초안이에요.' : '교통·위치 정보는 확인 전 초안이에요.'));
    item.append(open);
    return item;
  }
  function showMore() {
    const more = state.result?.more ?? [];
    $('ai-more-list').append(...more.slice(moreShown, moreShown + MORE_STEP).map(moreItem));
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

  let busy = false;
  $('ai-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!pet()) { goScreen('pet'); return; }
    let conditions;
    try { conditions = normalizeConditions(rawConditions(), { petIds: state.catalog.pets.map((item) => item.id) }); }
    catch (error) {
      if (error.name !== 'ConditionError') throw error;
      showErrors(error.fields); $('ai-form-error').textContent = `${Object.keys(error.fields).length}개 항목을 확인해 주세요.`; return;
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
      $('ai-form-error').textContent = error.message;
      if (error.fields?.pet) goScreen('pet');
      else if (error.fields) showErrors(error.fields);
    } finally { busy = false; $('ai-submit').disabled = false; $('ai-submit').textContent = '추천 받기'; $('ai-loading').hidden = true; $('ai-loading').replaceChildren(); }
  });

  const catalogReady = () => (state.catalog ? Promise.resolve(state.catalog) : new Promise((resolve) => catalogWaiters.push(resolve)));
  loadCatalog();
  // Stage 5 reads the chosen pet and catalog, and opens its places in the same detail view.
  return { hasPet: () => Boolean(pet()), petId: () => state.petId, catalogReady, openPlaceDetail, lastResult: () => state.result };
}
