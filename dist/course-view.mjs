// D49/P68: the 2~3 courses on the results screen. Each card shows its stops in order with the leg between them, the
// total (an estimate), what fits the traveller's tastes, and how many official benefits match the saved profile.
// "자세히" opens the whole timeline; "이 코스로 출발" hands the course to the following screen (P69).
import { openRouteGuide } from './route-guide.mjs';
import { createProfileStore } from './profile.mjs';
import { selectBenefits, seoulToday } from './benefit-catalog.mjs';
import { rankBenefits } from './benefit-matching.mjs';
import { photoCredit } from './ai-flow.mjs';
import { t, tk, lang, friendText, englishLine, wonLabel } from './i18n.mjs';

const $ = (id) => document.getElementById(id);
const node = (tag, className = '', text) => {
  const result = document.createElement(tag); result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
export function minutesLabel(minutes) {
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return h && m ? tk('약 {h}시간 {m}분(추정)', { h, m }) : h ? tk('약 {h}시간(추정)', { h }) : tk('약 {m}분(추정)', { m });
}
export const legLabel = (leg) => (leg.mode === 'walk' ? tk('걸어서 약 {m}분', { m: leg.minutes }) : tk('대중교통 약 {m}분', { m: leg.minutes }));
// D53: in other languages the kind is told by its tags (Kakao's own category words are Korean).
export const stopKind = (stop) => (lang() !== 'ko' && stop.place.tag_ids?.length ? stop.place.tag_ids.slice(0, 2).map((tag) => t(`tag.${tag}`, tag)).join(' · ') : stop.place.kind || stop.place.tags?.slice(0, 2).join('·') || tk('장소'));
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
  if (stop.taste) list.push(['taste', tk('내 취향')]);
  if (stop.rest) list.push(['rest', tk('쉬어 가기')]);
  if (stop.crowd && BUSY.has(stop.crowd.level)) list.push(['busy', tk('지금 {level}', { level: tk(stop.crowd.level) })]);
  if (friend && stop.friend && !stop.friend.met) list.push(['friend', tk('동네 친구 {name}', { name: friendText(stop.friend).name })]);
  return list.map(([kind, text]) => node('span', `course-badge-${kind}`, text));
}
export function stopRow(stop, index, { compact = true, friend = true } = {}) {
  const li = node('li', 'course-stop');
  const text = node('div', 'course-stop-text');
  const title = node('b', '', `${index + 1}. ${stop.place.name}`);
  const english = englishLine(stop.place); if (english) title.append(english);
  const meta = node('small', '', tk('{kind} · {stay}분 머물기', { kind: stopKind(stop), stay: stop.stay }));
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
    // D55/P79: the in-app guide for this leg.
    const a = node('button', 'course-leg-link', tk('길 안내')); a.type = 'button';
    a.setAttribute('aria-label', tk('{name}까지 길 안내', { name: to.name ?? tk(to.label) }));
    a.addEventListener('click', () => openRouteGuide({ from, to, mode: leg.mode }));
    li.append(a);
  }
  return li;
}
// The stops with the legs between them, from the departure and back to it.
export function courseTimeline(course, { detail = false } = {}) {
  const list = node('ol', detail ? 'trip-timeline detail' : 'trip-timeline');
  let from = course.origin;
  if (detail) { const start = node('li', 'course-end'); start.append(node('b', '', tk('출발 · {label}', { label: tk(course.origin.label) }))); list.append(start); }
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
    const end = node('li', 'course-end'); end.append(node('b', '', tk('돌아오기 · {label}', { label: tk(course.origin.label) }))); list.append(end);
  }
  return list;
}
const modeLine = (course) => (course.stops.every((stop) => stop.leg.mode === 'walk') && course.back.mode === 'walk' ? tk('모두 걸어서') : tk('걷기 + 대중교통'));

// D54/P78: "예상 비용 약 8,000원(추정)", how many places have an unknown admission, and whether it fits the budget.
export function costLine(course) {
  if (!course?.cost) return null;
  const box = node('p', 'course-cost');
  box.append(node('span', '', tk('예상 비용 약 {won}(추정)', { won: wonLabel(course.cost.total) })));
  if (course.cost.unknown) box.append(node('span', 'course-cost-note', tk('입장료 확인 필요 {n}곳', { n: course.cost.unknown })));
  if (course.budgetWon != null) {
    box.append(course.overWon > 0 ? node('span', 'course-badge over', tk('예산보다 약 {won} 넘어요', { won: wonLabel(course.overWon) })) : node('span', 'course-badge fit', tk('예산 안')));
  }
  return box;
}
export function setupCourseView({ goScreen, onStart = () => {} }) {
  let current = null;
  function card(course, index, benefits) {
    const li = node('li', 'course-card'); li.dataset.kind = course.id;
    const head = node('div', 'course-card-head');
    head.append(node('span', 'course-rank', index === 0 ? tk('가장 잘 맞아요') : tk('추천 {n}', { n: index + 1 })), node('h3', '', tk(course.title)), node('p', 'course-blurb', tk(course.blurb)));
    const meta = node('p', 'course-meta', tk('{time} · {n}곳 · {mode}', { time: minutesLabel(course.totalMinutes), n: course.stops.length, mode: modeLine(course) }));
    const body = node('div', 'course-body'); body.append(courseTimeline(course));
    const money = costLine(course);
    const actions = node('div', 'course-actions');
    const more = node('button', 'button subtle', tk('자세히')); more.type = 'button'; more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', () => {
      const open = more.getAttribute('aria-expanded') !== 'true';
      more.setAttribute('aria-expanded', String(open)); more.textContent = open ? tk('간단히') : tk('자세히');
      body.replaceChildren(courseTimeline(course, { detail: open }));
      if (open) body.append(node('p', 'field-help', tk('이동 시간은 직선거리로 계산한 추정치예요. 운영 시간과 길은 출발 전에 확인해 주세요.')), node('p', 'field-help', tk('비용은 대중교통 기본요금과 카페·식사의 보통 가격으로 어림한 값이에요. 실제 요금과 입장료는 다를 수 있어요.')));
    });
    const go = node('button', 'button primary', tk('이 코스로 출발')); go.type = 'button';
    go.addEventListener('click', () => onStart(course, current));
    actions.append(more, go);
    li.append(head, meta, ...(money ? [money] : []), body);
    if (benefits !== null) {
      const link = node('button', 'text-button course-benefits', benefits ? tk('나에게 맞는 혜택 {n}개 보기', { n: benefits }) : tk('혜택 탭에서 조건 확인하기')); link.type = 'button';
      link.addEventListener('click', () => goScreen('benefits'));
      li.append(link);
      // D53: most benefits assume a Korean resident; a visitor reading another language is told to check.
      if (lang() !== 'ko') li.append(node('p', 'field-help', tk('외국인은 신청 조건을 꼭 확인해 주세요.')));
    }
    li.append(actions);
    return li;
  }
  function render(result) {
    current = result;
    const courses = result?.courses ?? [];
    $('ai-courses').hidden = !courses.length;
    $('ai-places-heading').hidden = !courses.length;
    $('ai-results-heading').textContent = courses.length ? tk('이런 코스 어때요?') : tk('이런 곳은 어때요?');
    const benefits = benefitCandidates();
    $('ai-course-cards').replaceChildren(...courses.map((course, index) => card(course, index, benefits)));
  }
  return { render, current: () => current };
}
