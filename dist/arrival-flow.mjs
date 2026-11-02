import { districtChange, readFriendLog, recordFriend, ANSWERS, FRIENDS_KEY } from './district-arrival.mjs';
import { postReport, reportAge } from './field-reports.mjs';
import { distanceLabel, latestReportLine } from './ai-flow.mjs';
import { josa } from './ai-conditions.mjs';

// Stage 5 (명세 2-5 ⑤·⑥, 단계 5): district arrival → 동네 친구 → one field question → 도감. The device location is
// used for the district check and distances only and is never stored; the 도감 stays in this browser.
const $ = (id) => document.getElementById(id);
const node = (tag, className = '', text) => {
  const result = document.createElement(tag); result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
const button = (label, className, onClick) => { const result = node('button', className, label); result.type = 'button'; result.addEventListener('click', onClick); return result; };
const normalize = (text) => String(text).replace(/\s/g, '').toLowerCase();
const round4 = (value) => Math.round(value * 1e4) / 1e4;
const dateLabel = (iso) => (iso ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso)) : '이전 기록');
const ANSWER_COPY = { ...Object.fromEntries(Object.entries(ANSWERS).map(([key, answer]) => [key, answer.label])), not_near: '후보지 근처가 아니어서 인사만 했어요' };

// A plain teardrop stands in until the team draws the friends (명세 5): every friend is a silhouette for now,
// tinted by region once met. Not an animal, so friends stay apart from the pets.
const SVG = 'http://www.w3.org/2000/svg';
export function friendArt({ region = '', initial = '', met = false } = {}) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `friend-art ${met ? `met region-${region}` : 'unmet'}`);
  const body = document.createElementNS(SVG, 'path');
  body.setAttribute('d', 'M20 3c6 8 14 14 14 22a14 14 0 0 1-28 0C6 17 14 11 20 3Z'); body.setAttribute('class', 'friend-body');
  const mark = document.createElementNS(SVG, 'text');
  mark.setAttribute('x', '20'); mark.setAttribute('y', '30'); mark.setAttribute('text-anchor', 'middle'); mark.setAttribute('class', 'friend-mark');
  mark.textContent = met ? initial : '?';
  svg.append(body, mark);
  return svg;
}

async function json(path, options) {
  let response;
  try { response = await fetch(path, options); }
  catch { throw new Error('서버에 연결하지 못했어요. 서버를 켠 주소로 들어왔는지 확인해 주세요.'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message ?? '잠시 후 다시 시도해 주세요.');
  return body;
}

export function setupArrivalFlow({ goScreen, pets }) {
  const state = { catalog: null, features: null, watchId: null, current: null, point: null, arrivalPoint: null, info: null };
  const guName = (id) => state.catalog?.districts.find((district) => district.id === id)?.name ?? id;
  const say = (text) => document.querySelectorAll('.arrival-status').forEach((element) => { element.textContent = text; });
  const setToggles = (on) => document.querySelectorAll('.arrival-toggle').forEach((element) => {
    element.textContent = on ? '구 도착 알림 끄기' : '구 도착 알림 켜기'; element.setAttribute('aria-pressed', String(on));
  });
  const metEntry = (gu) => readFriendLog().find((entry) => entry.gu === gu) ?? null;

  // ---- tracking ----
  async function start() {
    if (!window.isSecureContext) { say('위치는 HTTPS 주소나 이 컴퓨터 주소(127.0.0.1)에서만 쓸 수 있어요. 휴대폰은 서버를 켠 컴퓨터에 나온 https 주소로 들어와 주세요.'); return; }
    if (!navigator.geolocation) { say('이 브라우저에서는 위치를 쓸 수 없어요.'); return; }
    setToggles(true); say('구 경계를 불러오는 중이에요.');
    try { state.features ??= (await json('/api/boundaries')).features; }
    catch (error) { setToggles(false); say(error.message); return; }
    state.watchId = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    say('위치를 확인하는 중이에요. 위치 권한을 물으면 허용해 주세요.');
  }
  function stop(message = '구 도착 알림을 껐어요.') {
    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null; state.current = null; state.point = null; setToggles(false); say(message);
  }
  function onError(error) {
    if (error.code === 1) stop('위치 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 위치를 허용한 뒤 다시 켜 주세요.');
    else if (error.code === 3) say('위치를 받는 데 시간이 걸리고 있어요. 하늘이 보이는 곳에서 잠시 기다려 주세요.');
    else say('위치를 받지 못했어요. 잠시 뒤 다시 확인할게요.');
  }
  function onFix({ coords }) {
    const point = { lat: coords.latitude, lng: coords.longitude };
    const change = districtChange(point, { accuracy: coords.accuracy, current: state.current, features: state.features });
    if (change.reason === 'inaccurate') { say(`위치 정확도가 낮아요(약 ${Math.round(coords.accuracy)}m). 더 정확해지면 구를 확인할게요.`); return; }
    if (change.reason === 'outside') { state.current = null; say('지금은 서울 25개 구 밖이에요.'); return; }
    state.current = change.gu; state.point = point;
    say(`지금 ${guName(change.gu)}에 있어요.`);
    if (change.arrived) arrive(change.gu, point);
  }
  document.querySelectorAll('.arrival-toggle').forEach((element) => element.addEventListener('click', () => (state.watchId === null ? start() : stop())));

  // ---- arrival ----
  async function loadArrival(gu, point) {
    return json('/api/arrival', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gu, pet: pets.petId(), location: point && { lat: round4(point.lat), lng: round4(point.lng) } }) });
  }
  async function arrive(gu, point) {
    try { state.info = await loadArrival(gu, point); state.arrivalPoint = point; }
    catch (error) { say(error.message); return; }
    renderArrival();
    const { district, friend } = state.info;
    const particle = josa(friend.name, '이', '가').slice(friend.name.length);
    $('arrival-banner-text').textContent = metEntry(gu) ? `${district.name}에 들어왔어요. ${josa(friend.name, '을', '를')} 다시 만나 볼까요?` : `${district.name}에 들어왔어요. 동네 친구 ‘${friend.name}’${particle} 기다려요!`;
    // On the arrival screen the new district is already shown, so only other screens get the banner.
    $('arrival-banner').hidden = document.querySelector('.app-frame')?.dataset.screen === 'arrival';
  }
  async function refreshArrival() {
    if (!state.info) return;
    try { state.info = await loadArrival(state.info.district.id, state.arrivalPoint); renderLists(); } catch { /* keep what is shown */ }
  }
  $('arrival-banner-open').addEventListener('click', () => { $('arrival-banner').hidden = true; goScreen('arrival'); });
  $('arrival-banner-close').addEventListener('click', () => { $('arrival-banner').hidden = true; });

  function placeItem(place) {
    const item = node('li', 'arrival-place');
    const head = node('div', 'arrival-place-head');
    head.append(node('b', '', place.name), node('span', 'muted', place.distanceKm != null ? distanceLabel(place.distanceKm) : ''));
    const open = button('상세·현장 소식', 'button subtle', () => pets.openPlaceDetail({ place, distanceKm: place.distanceKm, reason: '' }, refreshArrival));
    open.setAttribute('aria-label', `${place.name} 상세와 현장 소식 보기`);
    item.append(head, node('p', 'arrival-place-tags', place.tags.join(' · ')), node('p', 'field-help', latestReportLine(place.latest_report)), open);
    return item;
  }
  function renderLists() {
    const { district, pet, places, picks, reports } = state.info;
    const byId = new Map(places.map((place) => [place.id, place]));
    const chosen = picks.length ? picks.map((id) => byId.get(id)) : places.slice(0, 3);
    $('arrival-picks-heading').textContent = pet && picks.length ? `${pet.name}의 ${pet.purpose} 목적에 맞는 근처` : '가까운 후보지';
    const empty = pet && !picks.length && places.length ? [node('li', 'field-help', `이 구에는 ${pet.name}의 ${pet.purpose} 목적에 맞는 후보지가 없어 가까운 곳을 보여 드려요.`)] : [];
    $('arrival-picks').replaceChildren(...empty, ...(chosen.length ? chosen.map(placeItem) : [node('li', 'report-empty', '이 구에는 아직 후보지가 없어요.')]));
    $('arrival-reports').replaceChildren(...(reports.length
      ? reports.map((report) => node('li', 'arrival-report', `${report.place_name} · ${report.categoryLabel} · ${reportAge(report.createdAt)} · ${report.text}`))
      : [node('li', 'report-empty', `아직 ${district.name}의 유효한 현장 소식이 없어요.`)]));
    renderSearch();
  }
  function renderSearch() {
    const { district, places } = state.info;
    const query = normalize($('arrival-search').value);
    if (!query) { $('arrival-search-status').textContent = `${district.name} 후보지 ${places.length}곳에서 이름이나 태그로 찾아요.`; $('arrival-search-results').replaceChildren(); return; }
    const found = places.filter((place) => normalize(place.name).includes(query) || place.tags.some((tag) => normalize(tag).includes(query)));
    $('arrival-search-status').textContent = found.length ? `${found.length}곳을 찾았어요.` : `${district.name} 후보지에서 찾지 못했어요. 다른 이름으로 찾아 보세요.`;
    $('arrival-search-results').replaceChildren(...found.slice(0, 8).map(placeItem));
  }
  $('arrival-search').addEventListener('input', () => { if (state.info) renderSearch(); });

  function renderFriend() {
    const { district, friend } = state.info;
    const met = metEntry(district.id);
    $('arrival-eyebrow').textContent = `${district.regionName} · ${district.name}에 도착`;
    $('arrival-friend-art').replaceChildren(friendArt({ region: district.region, initial: friend.name[0], met: Boolean(met) }));
    $('arrival-heading').textContent = friend.name;
    $('arrival-met').textContent = met ? `다시 만났어요 · 처음 만난 날 ${dateLabel(met.metAt)}` : '처음 만났어요';
    $('arrival-greeting').textContent = `“${friend.greeting}”`;
    $('arrival-concept').textContent = friend.concept;
  }
  function renderArrival() {
    $('arrival-search').value = '';
    renderFriend(); renderQuestion(); renderLists();
  }

  // ---- the friend's question (first meeting only) ----
  function renderQuestion() {
    const section = $('arrival-question');
    const { district, friend, places, question_place_id: placeId } = state.info;
    if (metEntry(district.id)) { section.hidden = true; return; }
    section.hidden = false;
    const heading = node('h3', '', '동네 친구의 현장 질문'); heading.id = 'arrival-question-heading';
    const message = node('p', 'field-error'); message.setAttribute('role', 'alert');
    const place = places.find((item) => item.id === placeId);
    if (!place) {
      section.replaceChildren(heading, node('p', 'friend-says', `${friend.name}: 후보지 500m 안에 가면 지금 상황을 물어볼게요. 오늘은 인사만 하고 도감에 적어 둘까요?`),
        button('인사하고 도감에 등록', 'button primary full', () => register('not_near', null, message)), message);
      return;
    }
    const choices = node('div', 'friend-answers'); choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', `${place.name} 지금 붐비나요?`);
    for (const [key, answer] of Object.entries(ANSWERS)) {
      choices.append(button(answer.label, key === 'unknown' ? 'button subtle' : 'button primary', async () => {
        choices.querySelectorAll('button').forEach((item) => { item.disabled = true; }); message.textContent = '';
        if (answer.category) {
          try { await postReport({ placeId: place.id, category: answer.category, text: answer.text }); }
          catch (error) { message.textContent = `${error.message} 다시 고르거나 ‘잘 모르겠어요’를 눌러 주세요.`; choices.querySelectorAll('button').forEach((item) => { item.disabled = false; }); return; }
        }
        register(key, answer.category ? place : null, message);
      }));
    }
    section.replaceChildren(heading, node('p', 'friend-says', `${friend.name}: ${place.name} 근처에 왔네요. 지금 거기 붐비나요?`), choices,
      node('p', 'field-help', '‘붐비거나 줄을 서요’나 ‘한산해요’를 고르면 이 장소의 현장 소식으로 다른 여행자에게 3시간 동안 보여요. ‘잘 모르겠어요’는 공유하지 않아요.'), message);
  }
  function register(answer, sharedPlace, message) {
    const { district, friend } = state.info;
    try { recordFriend({ gu: district.id, friend: friend.id, metAt: new Date().toISOString(), answer }); }
    catch { message.textContent = '이 브라우저에 저장할 수 없어 도감에 남기지 못했어요. 시크릿 창이 아닌지 확인해 주세요.'; return; }
    renderDex(); renderFriend();
    $('arrival-banner').hidden = true;
    $('arrival-met').textContent = '처음 만났어요 · 도감에 등록했어요';
    const heading = node('h3', '', '도감에 등록했어요'); heading.id = 'arrival-question-heading';
    const done = node('p', 'field-help', `${sharedPlace ? `${sharedPlace.name}의 현장 소식으로 올렸어요. 기여 점수가 올라갔어요. ` : ''}동네 친구 도감 ${metCount()}/25`);
    $('arrival-question').replaceChildren(heading, node('p', 'friend-says', `${friend.name}: 고마워요! 도감에 적어 둘게요.`), done);
    heading.tabIndex = -1; heading.focus();
    if (sharedPlace) refreshArrival();
  }

  // ---- 도감 ----
  function metCount() {
    const met = new Set(readFriendLog().map((entry) => entry.gu));
    return state.catalog ? state.catalog.districts.filter((district) => met.has(district.id)).length : met.size;
  }
  function openFriend(friend, district, region, entry) {
    const content = $('evidence-content');
    const heading = node('h2', '', friend.name); heading.id = 'evidence-heading'; heading.tabIndex = -1;
    const facts = node('dl', 'place-facts');
    for (const [label, text] of [['처음 만난 날', dateLabel(entry.metAt)], ['현장 질문', ANSWER_COPY[entry.answer] ?? '이전 기록']]) facts.append(node('dt', '', label), node('dd', '', text));
    content.replaceChildren(node('span', 'small-label', `${region.name} · ${district.name}`), friendArt({ region: region.id, initial: friend.name[0], met: true }), heading,
      node('p', 'friend-greeting', `“${friend.greeting}”`), node('p', 'intro', friend.concept), facts, node('p', 'field-help', '이름과 설정은 팀이 최종 이름·그림을 정하기 전의 임시안이에요.'));
    $('evidence-dialog').showModal(); heading.focus();
  }
  function renderDex() {
    document.querySelectorAll('.dex-count').forEach((element) => { element.textContent = String(metCount()); });
    if (!state.catalog) return;
    const log = new Map(readFriendLog().map((entry) => [entry.gu, entry]));
    $('dex-regions').replaceChildren(...state.catalog.regions.map((region) => {
      const districts = state.catalog.districts.filter((district) => district.region === region.id);
      const section = node('section', 'dex-region');
      const head = node('div', 'section-heading');
      head.append(node('h3', '', region.name), node('span', 'muted', `${districts.filter((district) => log.has(district.id)).length} / ${districts.length}`));
      const list = node('ul', 'dex-grid');
      for (const district of districts) {
        const friend = state.catalog.friends.find((item) => item.gu === district.id);
        const entry = log.get(district.id);
        const slot = entry ? button('', 'dex-slot met', () => openFriend(friend, district, region, entry)) : node('div', 'dex-slot');
        slot.append(friendArt({ region: region.id, initial: friend.name[0], met: Boolean(entry) }), node('b', '', entry ? friend.name : '???'), node('small', '', district.name));
        if (entry) slot.setAttribute('aria-label', `${district.name} 동네 친구 ${friend.name}, 자세히 보기`);
        else slot.append(node('span', 'visually-hidden', '아직 못 만났어요'));
        const item = node('li'); item.append(slot); list.append(item);
      }
      section.append(head, list);
      return section;
    }));
  }
  window.addEventListener('storage', (event) => { if (event.key === FRIENDS_KEY) { renderDex(); if (state.info) renderFriend(); } });
  pets.catalogReady().then((catalog) => { state.catalog = catalog; renderDex(); });
  renderDex();

  // The living map (stage 6) shows "나" at the last accepted fix and opens on the arrived district.
  return { hasArrival: () => Boolean(state.info), info: () => state.info, position: () => (state.point && state.current ? { gu: state.current, point: state.point } : null) };
}
