// D26: conditions for the AI recommendation flow. Shared by the browser form and the local server,
// so this module stays free of DOM access.
export const PLACE_TAGS = Object.freeze(['카페', '시장', '자연', '역사', '문화', '산책', '야경', '사진', '쇼핑']);

// Representative station points for distance ordering only; not exits or boarding points (확인 필요).
export const SEOUL_STATIONS = Object.freeze([
  { id: 'seoul', label: '서울역', lat: 37.5547, lng: 126.9707 },
  { id: 'yongsan', label: '용산역', lat: 37.5299, lng: 126.9648 },
  { id: 'cheongnyangni', label: '청량리역', lat: 37.5806, lng: 127.0483 },
  { id: 'hongik', label: '홍대입구역', lat: 37.5572, lng: 126.9245 },
  { id: 'sinchon', label: '신촌역', lat: 37.5552, lng: 126.9369 },
  { id: 'wangsimni', label: '왕십리역', lat: 37.5612, lng: 127.0371 },
  { id: 'konkuk', label: '건대입구역', lat: 37.5404, lng: 127.0692 },
  { id: 'jamsil', label: '잠실역', lat: 37.5133, lng: 127.1000 },
  { id: 'gangnam', label: '강남역', lat: 37.4979, lng: 127.0276 },
  { id: 'express-terminal', label: '고속터미널역', lat: 37.5049, lng: 127.0049 },
  { id: 'sadang', label: '사당역', lat: 37.4766, lng: 126.9816 },
  { id: 'nowon', label: '노원역', lat: 37.6551, lng: 127.0613 },
]);
export const TIME_SLOTS = Object.freeze([
  { id: 'full_day', label: '하루 종일', hint: '당일치기' },
  { id: 'morning', label: '오전', hint: '9~12시' },
  { id: 'afternoon', label: '오후', hint: '12~18시' },
  { id: 'evening', label: '저녁', hint: '18시 이후' },
]);
export const WALK_CHOICES = Object.freeze([
  { level: 1, label: '가볍게', hint: '평지 위주' },
  { level: 2, label: '적당히', hint: '30~90분' },
  { level: 3, label: '많이', hint: '오르막도 OK' },
]);
export const AGE_GROUPS = Object.freeze([
  { id: '', label: '입력 안 함' },
  { id: 'teen', label: '10대' },
  { id: '20s_early', label: '20대 초반' },
  { id: '20s_late', label: '20대 후반' },
  { id: '30s_plus', label: '30대 이상' },
]);
export const STUDENT_STATUSES = Object.freeze([
  { id: 'unspecified', label: '입력 안 함' },
  { id: 'student', label: '대학생' },
  { id: 'not_student', label: '대학생 아님' },
]);
export const MAX_INTERESTS = 4;
export const MAX_DAYS_AHEAD = 90;

export class ConditionError extends Error {
  constructor(fields) { super(Object.values(fields)[0]); this.name = 'ConditionError'; this.fields = fields; }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

// `today` is the Seoul calendar date (YYYY-MM-DD); the caller supplies it so tests and the server agree.
export function normalizeConditions(raw, { today }) {
  const fields = {};
  const departure = SEOUL_STATIONS.find((station) => station.id === raw?.departure);
  if (!departure) fields.departure = '출발역을 골라 주세요.';
  const date = String(raw?.date ?? '');
  if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || addDays(date, 0) !== date) fields.date = '여행 날짜를 골라 주세요.';
  else if (date < today) fields.date = '오늘 이후 날짜를 골라 주세요.';
  else if (date > addDays(today, MAX_DAYS_AHEAD)) fields.date = `${MAX_DAYS_AHEAD}일 안의 날짜를 골라 주세요.`;
  if (!TIME_SLOTS.some((slot) => slot.id === raw?.timeSlot)) fields.timeSlot = '시간대를 골라 주세요.';
  const partySize = Number(raw?.partySize);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 6) fields.partySize = '인원은 1~6명으로 입력해 주세요.';
  const walkLevel = Number(raw?.walkLevel);
  if (!WALK_CHOICES.some((choice) => choice.level === walkLevel)) fields.walkLevel = '걷기 정도를 골라 주세요.';
  const interests = [...new Set(Array.isArray(raw?.interests) ? raw.interests : [])];
  if (!interests.length || interests.some((tag) => !PLACE_TAGS.includes(tag))) fields.interests = '관심사를 1개 이상 골라 주세요.';
  else if (interests.length > MAX_INTERESTS) fields.interests = `관심사는 ${MAX_INTERESTS}개까지 골라 주세요.`;
  const ageGroup = raw?.ageGroup ?? '';
  if (!AGE_GROUPS.some((group) => group.id === ageGroup)) fields.ageGroup = '나이대를 다시 골라 주세요.';
  const studentStatus = raw?.studentStatus ?? 'unspecified';
  if (!STUDENT_STATUSES.some((status) => status.id === studentStatus)) fields.studentStatus = '학생 여부를 다시 골라 주세요.';
  if (Object.keys(fields).length) throw new ConditionError(fields);
  return { departure: departure.id, date, timeSlot: raw.timeSlot, partySize, walkLevel, interests, ageGroup, studentStatus };
}

const weekday = (date) => '일월화수목금토'[new Date(`${date}T00:00:00Z`).getUTCDay()];
// One-line Korean summary used on screen and in the recommendation prompt.
export function describeConditions(conditions) {
  const label = (list, id, key = 'id') => list.find((item) => item[key] === id)?.label;
  const [, month, day] = conditions.date.split('-').map(Number);
  const parts = [
    `${label(SEOUL_STATIONS, conditions.departure)} 출발`,
    `${month}/${day}(${weekday(conditions.date)}) ${label(TIME_SLOTS, conditions.timeSlot)}`,
    conditions.partySize === 1 ? '혼자' : `${conditions.partySize}명`,
    `${label(WALK_CHOICES, conditions.walkLevel, 'level')} 걷기`,
    conditions.interests.join('·'),
  ];
  const person = [conditions.ageGroup && label(AGE_GROUPS, conditions.ageGroup), conditions.studentStatus !== 'unspecified' && label(STUDENT_STATUSES, conditions.studentStatus)].filter(Boolean).join(' ');
  if (person) parts.push(person);
  return parts.join(' · ');
}
