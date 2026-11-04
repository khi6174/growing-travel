// D49/P68: the 2~3 courses on the results screen. Each card shows its stops in order with the leg between them, the
// total (an estimate), what fits the traveller's tastes, and how many official benefits match the saved profile.
// "자세히" opens the whole timeline; "이 코스로 출발" hands the course to the following screen (P69).
import { legUrl } from './course-plan.mjs';
import { createProfileStore } from './profile.mjs';
import { selectBenefits, seoulToday } from './benefit-catalog.mjs';
import { rankBenefits } from './benefit-matching.mjs';
import { photoCredit } from './ai-flow.mjs';

const $ = (id) => document.getElementById(id);
const node = (tag, className = '', text) => {
  const result = document.createElement(tag); result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
export function minutesLabel(minutes) {
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return `약 ${h ? `${h}시간` : ''}${h && m ? ' ' : ''}${m || !h ? `${m}분` : ''}(추정)`;
}
export const legLabel = (leg) => `${leg.mode === 'walk' ? '걸어서' : '대중교통'} 약 ${leg.minutes}분`;
export const stopKind = (stop) => stop.place.kind || stop.place.tags?.slice(0, 2).join('·') || '장소';
// How many official benefits are candidates for the saved profile (P21); null when nothing is saved or readable.
export function benefitCandidates({ store = createProfileStore(), today = seoulToday() } = {}) {
  try {
    const profile = store.load();
    if (!profile) return null;
    return rankBenefits(selectBenefits({ today }), profile, { today }).filter(({ match }) => match.status === 'candidate').length;
  } catch { return null; }
}
const BUSY = new Set(['붐빔', '약간 붐빔']);
function thumb(place) {
  const src = place.photo_thumb || place.photo;
  const box = node('span', 'course-thumb');
  if (!src) { box.classList.add('empty'); return box; }
  const img = node('img'); img.src = src; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => { box.classList.add('empty'); img.remove(); });
  box.append(img); box.title = photoCredit(place);
  return box;
}
function badges(stop, { friend = true } = {}) {
  const list = [];
  if (stop.taste) list.push(['taste', '내 취향']);
  if (stop.rest) list.push(['rest', '쉬어 가기']);
  if (stop.crowd && BUSY.has(stop.crowd.level)) list.push(['busy', `지금 ${stop.crowd.level}`]);
  if (friend && stop.friend && !stop.friend.met) list.push(['friend', `동네 친구 ${stop.friend.name}`]);
  return list.map(([kind, text]) => node('span', `course-badge-${kind}`, text));
}
export function stopRow(stop, index, { compact = true, friend = true } = {}) {
  const li = node('li', 'course-stop');
  const text = node('div', 'course-stop-text');
  const title = node('b', '', `${index + 1}. ${stop.place.name}`);
  const meta = node('small', '', `${stopKind(stop)} · ${stop.stay}분 머물기`);
  const tags = node('span', 'course-badges'); tags.append(...badges(stop, { friend }));
  text.append(title, meta);
  if (tags.childElementCount) text.append(tags);
  if (!compact && stop.place.summary) text.append(node('small', 'course-stop-summary', stop.place.summary));
  li.append(thumb(stop.place), text);
  return li;
}
function legRow(leg, from, to, { link = false } = {}) {
  const li = node('li', `course-leg ${leg.mode}`);
  li.append(node('span', 'course-leg-line'), node('span', 'course-leg-text', legLabel(leg)));
  if (link) {
    const a = node('a', 'course-leg-link', '길찾기'); a.href = legUrl(from, to, leg.mode); a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', `${to.name ?? to.label}까지 카카오맵 ${leg.mode === 'walk' ? '걷기' : '대중교통'} 길찾기 (새 창)`);
    li.append(a);
  }
  return li;
}
// The stops with the legs between them, from the departure and back to it.
export function courseTimeline(course, { detail = false } = {}) {
  const list = node('ol', detail ? 'trip-timeline detail' : 'trip-timeline');
  let from = course.origin;
  if (detail) { const start = node('li', 'course-end'); start.append(node('b', '', `출발 · ${course.origin.label}`)); list.append(start); }
  // A district's friend is named on the first stop in that district only.
  const named = new Set();
  course.stops.forEach((stop, index) => {
    const friend = Boolean(stop.friend) && !named.has(stop.place.gu);
    if (stop.friend) named.add(stop.place.gu);
    if (detail || index > 0) list.append(legRow(stop.leg, from, stop.place, { link: detail }));
    list.append(stopRow(stop, index, { compact: !detail, friend }));
    from = stop.place;
  });
  if (detail) {
    list.append(legRow(course.back, from, course.origin, { link: true }));
    const end = node('li', 'course-end'); end.append(node('b', '', `돌아오기 · ${course.origin.label}`)); list.append(end);
  }
  return list;
}
const modeLine = (course) => (course.stops.every((stop) => stop.leg.mode === 'walk') && course.back.mode === 'walk' ? '모두 걸어서' : '걷기 + 대중교통');

export function setupCourseView({ goScreen, onStart = () => {} }) {
  let current = null;
  function card(course, index, benefits) {
    const li = node('li', 'course-card'); li.dataset.kind = course.id;
    const head = node('div', 'course-card-head');
    head.append(node('span', 'course-rank', index === 0 ? '가장 잘 맞아요' : `추천 ${index + 1}`), node('h3', '', course.title), node('p', 'course-blurb', course.blurb));
    const meta = node('p', 'course-meta', `${minutesLabel(course.totalMinutes)} · ${course.stops.length}곳 · ${modeLine(course)}`);
    const body = node('div', 'course-body'); body.append(courseTimeline(course));
    const actions = node('div', 'course-actions');
    const more = node('button', 'button subtle', '자세히'); more.type = 'button'; more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', () => {
      const open = more.getAttribute('aria-expanded') !== 'true';
      more.setAttribute('aria-expanded', String(open)); more.textContent = open ? '간단히' : '자세히';
      body.replaceChildren(courseTimeline(course, { detail: open }));
      if (open) body.append(node('p', 'field-help', '이동 시간은 직선거리로 계산한 추정치예요. 운영 시간과 길은 출발 전에 확인해 주세요.'));
    });
    const go = node('button', 'button primary', '이 코스로 출발'); go.type = 'button';
    go.addEventListener('click', () => onStart(course, current));
    actions.append(more, go);
    li.append(head, meta, body);
    if (benefits !== null) {
      const link = node('button', 'text-button course-benefits', benefits ? `나에게 맞는 혜택 ${benefits}개 보기` : '혜택 탭에서 조건 확인하기'); link.type = 'button';
      link.addEventListener('click', () => goScreen('benefits'));
      li.append(link);
    }
    li.append(actions);
    return li;
  }
  function render(result) {
    current = result;
    const courses = result?.courses ?? [];
    $('ai-courses').hidden = !courses.length;
    $('ai-places-heading').hidden = !courses.length;
    $('ai-results-heading').textContent = courses.length ? '이런 코스 어때요?' : '이런 곳은 어때요?';
    const benefits = benefitCandidates();
    $('ai-course-cards').replaceChildren(...courses.map((course, index) => card(course, index, benefits)));
  }
  return { render, current: () => current };
}
