// D49/P69: following a course. One stop at a time: on the way to it (next leg, its crowding and latest field report,
// directions), then at it (how long to stay), then on to the next. "도착했어요" moves on, so a demo on stage works
// without walking. After each step the app asks /api/course/live for places around the traveller (their position
// when the 구 도착 switch is on, else the stop just reached) that can be put in or swapped in (P70). The course lives
// in this browser only.
import { retime, insertStop, replaceStop, dropStop, dropCandidate, legUrl } from './course-plan.mjs';
import { minutesLabel, legLabel, stopRow, stopKind } from './course-view.mjs';
import { loadStart, courseHints } from './onboarding.mjs';
import { photoCredit } from './ai-flow.mjs';

export const FOLLOW_KEY = 'growing-travel.follow.v1';
const $ = (id) => document.getElementById(id);
const node = (tag, className = '', text) => {
  const result = document.createElement(tag); result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
const button = (label, className, onClick) => { const result = node('button', className, label); result.type = 'button'; result.addEventListener('click', onClick); return result; };
const BUSY = new Set(['붐빔', '약간 붐빔']);

// Minutes still planned from where the traveller is: the leg to the next stop (when on the way), every stay left and
// the legs between, and the way back.
export function plannedLeft(course, { index, phase }) {
  if (phase === 'done') return 0;
  let total = course.back.minutes;
  course.stops.forEach((stop, at) => {
    if (at < index) return;
    total += stop.stay;
    if (at > index || phase === 'moving') total += stop.leg.minutes;
  });
  return total;
}
// The stop the next live call is about, and the point to look around.
export function focusOf(course, { index, phase }) {
  const nextIndex = phase === 'moving' ? index : index + 1;
  const here = phase === 'moving' ? (index === 0 ? course.origin : course.stops[index - 1].place) : course.stops[index].place;
  return { nextIndex, next: course.stops[nextIndex] ?? null, here };
}
export function loadFollow(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(FOLLOW_KEY) ?? 'null');
    return saved?.schemaVersion === 1 && saved.course?.stops?.length && ['moving', 'at', 'done'].includes(saved.phase) ? saved : null;
  } catch { return null; }
}

export function setupFollowFlow({ goScreen, arrival = null, now = () => Date.now() }) {
  let state = loadFollow();
  let live = null;
  let pending = null;
  let liveToken = 0;
  const save = () => { try { localStorage.setItem(FOLLOW_KEY, JSON.stringify(state)); } catch {} };
  const clear = () => { state = null; try { localStorage.removeItem(FOLLOW_KEY); } catch {} };

  function start(course, result) {
    const hints = courseHints(loadStart());
    state = { schemaVersion: 1, course, pet: result?.pet ?? null, tastes: hints.pet === result?.pet?.id ? hints.tastes : [], startedAt: new Date(now()).toISOString(), index: 0, phase: 'moving', changes: 0 };
    live = null; pending = null; save();
    goScreen('follow');
    render(); refreshLive();
  }

  function timeLine() {
    const elapsed = Math.max(0, Math.round((now() - Date.parse(state.startedAt)) / 60000));
    const left = state.course.budgetMinutes - elapsed;
    const planned = plannedLeft(state.course, state);
    const text = `남은 일정 ${minutesLabel(planned)} · 쓸 수 있는 시간 ${left > 0 ? `${left}분` : '끝'} 남음`;
    const late = planned - left;
    return { text, late: late > 5 ? late : 0 };
  }
  function nextInfo(stop) {
    const box = node('div', 'follow-next-live');
    const info = live?.next && live.next.id === stop.place.id ? live.next : null;
    const crowd = info?.crowd ?? stop.crowd;
    if (crowd) box.append(node('span', `crowd-chip crowd-${['여유', '보통', '약간 붐빔', '붐빔'].indexOf(crowd.level)}`, `지금 ${crowd.level}`));
    if (info?.latest_report) box.append(node('p', 'follow-report', `최근 제보: ${info.latest_report.categoryLabel} · ${info.latest_report.text}`));
    if (crowd && BUSY.has(crowd.level)) box.append(node('p', 'follow-busy', '지금 붐벼요. 아래 추천지로 바꿔 볼까요?'));
    if (!box.childElementCount) box.append(node('p', 'field-help', live ? '아직 올라온 현장 소식이 없어요.' : '현장 소식을 불러오는 중이에요.'));
    return box;
  }
  function renderNow() {
    const box = $('follow-now');
    const { course, index, phase } = state;
    if (phase === 'done') {
      const minutes = Math.round((now() - Date.parse(state.startedAt)) / 60000);
      box.replaceChildren(node('p', 'small-label', '코스 끝'), node('h3', '', '코스를 다 돌았어요!'), node('p', 'panel-intro', `${course.stops.length}곳을 ${minutes}분 동안 다녔어요.${state.changes ? ` 가는 길에 코스를 ${state.changes}번 고쳤어요.` : ''}`));
      $('follow-main').textContent = '홈으로';
      return;
    }
    const stop = course.stops[index];
    const from = index === 0 ? course.origin : course.stops[index - 1].place;
    const list = node('ul', 'trip-timeline'); list.append(stopRow(stop, index, { compact: false }));
    if (phase === 'moving') {
      const leg = node('p', 'follow-leg', `${from.name ?? from.label}에서 ${legLabel(stop.leg)}(추정)`);
      const link = node('a', 'button subtle follow-route', '카카오맵 길찾기'); link.href = legUrl(from, stop.place, stop.leg.mode); link.target = '_blank'; link.rel = 'noopener noreferrer';
      box.replaceChildren(node('p', 'small-label', index === 0 ? '첫 장소로 가는 중' : '다음 장소로 가는 중'), list, leg, link, nextInfo(stop));
      $('follow-main').textContent = '도착했어요';
    } else {
      const last = index === course.stops.length - 1;
      box.replaceChildren(node('p', 'small-label', '지금 여기 있어요'), list, node('p', 'follow-leg', `약 ${stop.stay}분 머물기 · ${stopKind(stop)}`));
      if (stop.friend && !stop.friend.met) box.append(node('p', 'field-help', `${stop.guName ?? '이 구'}의 동네 친구 ‘${stop.friend.name}’을(를) 만날 수 있어요. 구 도착 알림을 켜 두세요.`));
      $('follow-main').textContent = last ? '코스 마치기' : '다음 장소로 출발';
    }
  }
  function renderTimeline() {
    const list = $('follow-timeline'); list.replaceChildren();
    state.course.stops.forEach((stop, at) => {
      if (at > 0) list.append(Object.assign(node('li', `course-leg ${stop.leg.mode}`), { textContent: legLabel(stop.leg) }));
      const row = stopRow(stop, at);
      const status = state.phase === 'done' || at < state.index ? 'done' : at === state.index ? 'current' : 'upcoming';
      row.classList.add(status);
      if (stop.added) row.querySelector('.course-badges, .course-stop-text')?.append(node('span', 'course-badge-added', '가는 길에 넣음'));
      // A stop not reached yet can be taken out (the course is re-timed).
      if (status === 'upcoming' && state.course.stops.length > 1) row.append(button('빼기', 'text-button follow-drop', () => change(dropStop(state.course, at), { label: `‘${stop.place.name}’을(를) 뺐어요.` })));
      list.append(row);
    });
  }
  function renderConfirm() {
    const box = $('follow-confirm');
    box.hidden = !pending;
    if (!pending) return;
    const drop = pending.drop >= 0 ? pending.course.stops[pending.drop] : null;
    box.replaceChildren(node('p', '', `이렇게 바꾸면 ${pending.course.overBy}분 넘쳐요.${drop ? ` 마지막 ‘${drop.place.name}’을(를) 뺄까요?` : ''}`));
    const actions = node('div', 'follow-confirm-actions');
    if (drop) actions.append(button('빼고 바꾸기', 'button primary', () => { const next = retime(dropStop(pending.course, pending.drop), state.course.origin, state.course.budgetMinutes); apply(next, pending.label); }));
    actions.append(button('그래도 바꾸기', 'button subtle', () => apply(pending.course, pending.label)), button('취소', 'text-button', () => { pending = null; renderConfirm(); }));
    box.append(actions);
    box.querySelector('button')?.focus();
  }
  function render() {
    if (!state) return;
    $('follow-heading').textContent = state.course.title;
    const total = state.course.stops.length;
    const doneCount = state.phase === 'done' ? total : state.index + (state.phase === 'at' ? 1 : 0);
    $('follow-count').textContent = state.phase === 'done' ? `${total}곳 모두 다녀왔어요` : `${state.index + 1} / ${total}곳`;
    $('follow-progress').setAttribute('aria-valuenow', String(doneCount)); $('follow-progress').setAttribute('aria-valuemax', String(total));
    $('follow-progress').firstElementChild.style.setProperty('--progress', `${(doneCount / total) * 100}%`);
    const time = timeLine();
    $('follow-time').textContent = state.phase === 'done' ? '' : time.text;
    $('follow-late').hidden = !time.late || state.phase === 'done';
    $('follow-late').textContent = `예정보다 약 ${time.late}분 늦어지고 있어요. 남은 장소 하나를 빼도 돼요.`;
    $('follow-live').hidden = state.phase === 'done';
    renderNow(); renderTimeline(); renderConfirm(); renderSuggestions();
  }

  // D49/P70: put a place in as the next stop, or swap it for the next stop. Over the time, the traveller decides.
  function change(course, { label, keep = -1 }) {
    const next = retime(course, state.course.origin, state.course.budgetMinutes);
    if (next.overBy > 0) { pending = { course: next, drop: dropCandidate(next, { done: state.phase === 'moving' ? state.index : state.index + 1, keep }), label }; renderConfirm(); return; }
    apply(next, label);
  }
  function apply(course, label) {
    pending = null; state.course = course; state.changes += 1; save();
    $('follow-message').textContent = label;
    render(); refreshLive();
  }
  function suggestionItem(item) {
    const li = node('li', 'follow-suggestion');
    const media = node('span', 'course-thumb');
    const src = item.place.photo_thumb || item.place.photo;
    if (src) { const img = node('img'); img.src = src; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.title = photoCredit(item.place); img.addEventListener('error', () => img.remove()); media.append(img); }
    const text = node('div', 'course-stop-text');
    text.append(node('b', '', item.place.name), node('small', '', `${item.place.kind || item.place.tags.slice(0, 2).join('·')} · ${legLabel(item.leg)} · ${item.stay}분 머물기`));
    const tags = node('span', 'course-badges');
    if (item.taste) tags.append(node('span', 'course-badge-taste', '내 취향'));
    if (item.crowd) tags.append(node('span', BUSY.has(item.crowd.level) ? 'course-badge-busy' : 'course-badge-taste', `지금 ${item.crowd.level}`));
    if (tags.childElementCount) text.append(tags);
    const { nextIndex, next } = focusOf(state.course, state);
    const actions = node('div', 'follow-suggestion-actions');
    const stop = { place: item.place, stay: item.stay };
    actions.append(button('다음에 넣기', 'button subtle', () => change(insertStop(state.course, stop, nextIndex), { label: `‘${item.place.name}’을(를) 다음 장소로 넣었어요.`, keep: nextIndex })));
    if (next) actions.append(button(`${next.place.name} 대신`, 'button subtle', () => change(replaceStop(state.course, nextIndex, stop), { label: `‘${next.place.name}’ 대신 ‘${item.place.name}’에 가요.`, keep: nextIndex })));
    li.append(media, text, actions);
    return li;
  }
  function renderSuggestions() {
    const list = $('follow-suggestions');
    if (!live) { list.replaceChildren(); return; }
    const inCourse = new Set(state.course.stops.map((stop) => stop.place.id));
    const items = (live.suggestions ?? []).filter((item) => !inCourse.has(item.place.id));
    list.replaceChildren(...items.map(suggestionItem));
    $('follow-live-status').textContent = items.length ? '' : '지금 근처에서 더 넣을 만한 곳을 찾지 못했어요.';
    const events = live.festivals ?? [];
    $('follow-events').hidden = !events.length;
    $('follow-events-list').replaceChildren(...events.map((event) => { const li = node('li', 'ai-event'); li.append(node('b', '', event.title), node('small', '', `${event.place ?? ''} · ${Math.round((event.km ?? 0) * 10) / 10}km`)); return li; }));
  }
  async function refreshLive() {
    if (!state || state.phase === 'done') return;
    const token = ++liveToken;
    const { next, here } = focusOf(state.course, state);
    const position = arrival?.position?.()?.point ?? null;
    const point = position ?? { lat: here.lat, lng: here.lng };
    $('follow-live-status').textContent = position ? '지금 위치 근처를 찾고 있어요.' : `${here.name ?? here.label} 근처를 찾고 있어요.`;
    try {
      const response = await fetch('/api/course/live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ point, pet: state.pet?.id, next: next?.place.id ?? null, exclude: state.course.stops.map((stop) => stop.place.id), tastes: state.tastes }) });
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (token !== liveToken) return;
      live = body; render();
    } catch {
      if (token === liveToken) $('follow-live-status').textContent = '실시간 정보를 불러오지 못했어요. 코스는 그대로 따라갈 수 있어요.';
    }
  }

  $('follow-main').addEventListener('click', () => {
    if (!state) { goScreen('home'); return; }
    if (state.phase === 'done') { clear(); goScreen('home'); return; }
    $('follow-message').textContent = '';
    if (state.phase === 'moving') state.phase = 'at';
    else if (state.index < state.course.stops.length - 1) { state.index += 1; state.phase = 'moving'; }
    else state.phase = 'done';
    live = live && { ...live, next: null }; save(); render(); refreshLive();
    $('follow-heading').focus({ preventScroll: true });
  });
  $('follow-end').addEventListener('click', () => { clear(); goScreen('home'); });
  $('follow-refresh').addEventListener('click', refreshLive);
  new MutationObserver(() => { if (document.querySelector('.app-frame')?.dataset.screen === 'follow' && state) { render(); if (!live) refreshLive(); } }).observe(document.querySelector('.app-frame'), { attributes: true, attributeFilter: ['data-screen'] });
  return { start, active: () => Boolean(state && state.phase !== 'done') };
}
