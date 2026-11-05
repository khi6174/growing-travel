import { phraseIn } from './i18n.mjs';
// A budget in another language: a choice's own label, else ₩ and the amount.
const budgetLabelIn = (lang, won) => (BUDGET_CHOICES.some((item) => item.won === won) ? phraseIn(lang, budgetLabel(won)) : `₩${won.toLocaleString('en-US')}`);
// D27: conditions for the pet recommendation flow (펫 → 출발 위치 → 시간 → 인원 → 걷기). Shared by the
// browser form and the local server, so this module stays free of DOM access.

// Representative station points for the straight-line time estimate only; not exits or platforms (확인 필요).
export const SEOUL_STATIONS = Object.freeze([
  { id: 'seoul', label: '서울역', lat: 37.5547, lng: 126.9707 },
  { id: 'gyeongbokgung', label: '경복궁역', lat: 37.5759, lng: 126.9735 },
  { id: 'dongnimmun', label: '독립문역', lat: 37.5745, lng: 126.9578 },
  { id: 'hongik', label: '홍대입구역', lat: 37.5572, lng: 126.9245 },
  { id: 'sinchon', label: '신촌역', lat: 37.5552, lng: 126.9369 },
  { id: 'yeouido', label: '여의도역', lat: 37.5216, lng: 126.9243 },
  { id: 'yongsan', label: '용산역', lat: 37.5299, lng: 126.9648 },
  { id: 'wangsimni', label: '왕십리역', lat: 37.5612, lng: 127.0371 },
  { id: 'seongsu', label: '성수역', lat: 37.5446, lng: 127.0559 },
  { id: 'konkuk', label: '건대입구역', lat: 37.5404, lng: 127.0692 },
  { id: 'cheongnyangni', label: '청량리역', lat: 37.5806, lng: 127.0483 },
  { id: 'nowon', label: '노원역', lat: 37.6551, lng: 127.0613 },
  { id: 'jamsil', label: '잠실역', lat: 37.5133, lng: 127.1 },
  { id: 'gangnam', label: '강남역', lat: 37.4979, lng: 127.0276 },
  { id: 'express-terminal', label: '고속터미널역', lat: 37.5049, lng: 127.0049 },
  { id: 'sadang', label: '사당역', lat: 37.4766, lng: 126.9816 },
]);
// D53/P75 (4단계): start from a university. Points are each campus's place on Kakao place search (2026-11-05),
// not a gate or a station; the walk out of a large campus is not counted.
export const SEOUL_CAMPUSES = Object.freeze([
  { id: 'campus-snu', label: '서울대', name: '서울대학교 관악캠퍼스', lat: 37.4598, lng: 126.9511 },
  { id: 'campus-yonsei', label: '연세대', name: '연세대학교 신촌캠퍼스', lat: 37.5643, lng: 126.9389 },
  { id: 'campus-korea', label: '고려대', name: '고려대학교 서울캠퍼스', lat: 37.5895, lng: 127.0323 },
  { id: 'campus-skku', label: '성균관대', name: '성균관대학교 인문사회과학캠퍼스', lat: 37.5883, lng: 126.994 },
  { id: 'campus-hanyang', label: '한양대', name: '한양대학교 서울캠퍼스', lat: 37.5566, lng: 127.0445 },
  { id: 'campus-khu', label: '경희대', name: '경희대학교 서울캠퍼스', lat: 37.5972, lng: 127.0517 },
  { id: 'campus-ewha', label: '이화여대', name: '이화여자대학교', lat: 37.5625, lng: 126.9477 },
  { id: 'campus-sogang', label: '서강대', name: '서강대학교', lat: 37.5511, lng: 126.9401 },
  { id: 'campus-hongik', label: '홍익대', name: '홍익대학교 서울캠퍼스', lat: 37.5509, lng: 126.9256 },
  { id: 'campus-konkuk', label: '건국대', name: '건국대학교 서울캠퍼스', lat: 37.5435, lng: 127.0774 },
  { id: 'campus-cau', label: '중앙대', name: '중앙대학교 서울캠퍼스', lat: 37.5051, lng: 126.9572 },
  { id: 'campus-hufs', label: '한국외대', name: '한국외국어대학교 서울캠퍼스', lat: 37.5975, lng: 127.0578 },
  { id: 'campus-dongguk', label: '동국대', name: '동국대학교 서울캠퍼스', lat: 37.5581, lng: 127.0009 },
  { id: 'campus-sookmyung', label: '숙명여대', name: '숙명여자대학교', lat: 37.5464, lng: 126.9647 },
  { id: 'campus-kookmin', label: '국민대', name: '국민대학교', lat: 37.6108, lng: 126.997 },
  { id: 'campus-uos', label: '서울시립대', name: '서울시립대학교', lat: 37.5848, lng: 127.0577 },
]);
// Every fixed departure: stations, then campuses.
export const FIXED_ORIGINS = Object.freeze([...SEOUL_STATIONS, ...SEOUL_CAMPUSES]);
// D54/P78: one person's money for the trip in won (transit, admission, café, meals). null = 상관없음 (no limit).
export const BUDGET_CHOICES = Object.freeze([
  { won: 10000, label: '1만 원 이하', hint: '무료인 곳 위주' },
  { won: 30000, label: '3만 원', hint: '카페 한 번쯤' },
  { won: 50000, label: '5만 원', hint: '식사까지 넉넉히' },
  { won: null, label: '상관없음', hint: '비용은 보기만' },
]);
export const MAX_BUDGET_WON = 1000000;
export const validBudget = (won) => won === null || (Number.isInteger(won) && won >= 0 && won <= MAX_BUDGET_WON && won % 1000 === 0);
// "3만 원", "1만 원 이하", "25,000원", "상관없음".
export function budgetLabel(won) {
  const choice = BUDGET_CHOICES.find((item) => item.won === won);
  if (choice) return choice.label;
  return won % 10000 === 0 ? `${won / 10000}만 원` : `${won.toLocaleString('ko-KR')}원`;
}
export const CURRENT_LOCATION = 'current';
// D39: a place the traveler typed and picked from search results (주소·역·건물·가게 이름).
export const SEARCHED_PLACE = 'place';
// A device location outside this box is not used as a departure point (the app covers Seoul only).
export const SEOUL_BOUNDS = Object.freeze({ lat: [37.41, 37.72], lng: [126.76, 127.19] });
export const HOUR_CHOICES = Object.freeze([
  { hours: 0.5, label: '30분' },
  { hours: 1, label: '1시간' },
  { hours: 2, label: '2시간' },
  { hours: 3, label: '3시간' },
  { hours: 4, label: '4시간' },
  { hours: 6, label: '6시간' },
  { hours: 8, label: '하루', hint: '8시간쯤' },
]);
// D39: or typed in, from 30 minutes to 12 hours in 10-minute steps.
export const CUSTOM_HOURS = Object.freeze({ min: 0.5, max: 12, stepMinutes: 10 });
export function validHours(hours) {
  const steps = (hours * 60) / CUSTOM_HOURS.stepMinutes;
  return Number.isFinite(hours) && hours >= CUSTOM_HOURS.min && hours <= CUSTOM_HOURS.max && Math.abs(steps - Math.round(steps)) < 1e-9;
}
export function durationLabel(hours) {
  const choice = HOUR_CHOICES.find((item) => item.hours === hours);
  if (choice) return choice.label;
  const minutes = Math.round(hours * 60);
  return [Math.floor(minutes / 60) && `${Math.floor(minutes / 60)}시간`, minutes % 60 && `${minutes % 60}분`].filter(Boolean).join(' ');
}
export const WALK_CHOICES = Object.freeze([
  { level: 1, label: '조금만', hint: '평지·역 근처' },
  { level: 2, label: '적당히', hint: '30~90분' },
  { level: 3, label: '많이', hint: '오르막도 OK' },
]);
export const TIME_OF_DAY = Object.freeze([
  { id: 'day', label: '낮' },
  { id: 'evening', label: '저녁' },
]);
export const MAX_PARTY = 6;
const MAX_MET = 25;

export class ConditionError extends Error {
  constructor(fields) { super(Object.values(fields)[0]); this.name = 'ConditionError'; this.fields = fields; }
}

// Seoul hour (0-23) → the default 출발 시간대; evening from 17:00 so a 여의도 저녁 trip reads as night.
export function defaultTimeOfDay(hour) { return hour >= 17 || hour < 5 ? 'evening' : 'day'; }

export function insideSeoul(point) {
  return point?.lat >= SEOUL_BOUNDS.lat[0] && point.lat <= SEOUL_BOUNDS.lat[1] && point?.lng >= SEOUL_BOUNDS.lng[0] && point.lng <= SEOUL_BOUNDS.lng[1];
}
// About 100 m; the exact device position is never needed for a 60-minute estimate.
const round3 = (value) => Math.round(value * 1000) / 1000;

// `petIds` comes from data/pets.json on the server and from /api/catalog in the browser.
const TRAVEL_STYLE_IDS = Object.freeze(['slow', 'packed', 'spontaneous', 'planned']);
export function normalizeConditions(raw, { petIds }) {
  const fields = {};
  const pet = String(raw?.pet ?? '');
  if (!petIds.includes(pet)) fields.pet = '함께 갈 펫을 골라 주세요.';
  let departure = String(raw?.departure ?? '');
  let location = null; let departureLabel = null;
  if (departure === CURRENT_LOCATION) {
    const lat = Number(raw?.location?.lat); const lng = Number(raw?.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) fields.departure = '현재 위치를 다시 받아 오거나 출발역을 골라 주세요.';
    else if (!insideSeoul({ lat, lng })) fields.departure = '서울 밖 위치예요. 출발역을 골라 주세요.';
    else location = { lat: round3(lat), lng: round3(lng) };
  } else if (departure === SEARCHED_PLACE) {
    const lat = Number(raw?.location?.lat); const lng = Number(raw?.location?.lng);
    const label = String(raw?.departureLabel ?? '').trim().slice(0, 40);
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) fields.departure = '출발 위치를 찾아서 결과 중 하나를 골라 주세요.';
    else if (!insideSeoul({ lat, lng })) fields.departure = '서울 밖 위치예요. 서울 안의 출발 위치를 찾아 주세요.';
    else { location = { lat: round3(lat), lng: round3(lng) }; departureLabel = label; }
  } else if (!FIXED_ORIGINS.some((station) => station.id === departure)) fields.departure = '출발 위치를 찾거나 목록에서 골라 주세요.';
  const hours = Number(raw?.hours);
  if (!validHours(hours)) fields.hours = '쓸 수 있는 시간을 고르거나 30분~12시간, 10분 단위로 적어 주세요.';
  const partySize = Number(raw?.partySize);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > MAX_PARTY) fields.partySize = `인원은 1~${MAX_PARTY}명으로 입력해 주세요.`;
  const walkLevel = Number(raw?.walkLevel);
  if (!WALK_CHOICES.some((choice) => choice.level === walkLevel)) fields.walkLevel = '걷기 정도를 골라 주세요.';
  // A missing budget is 상관없음, so conditions saved before D54 still read.
  const budget = raw?.budget === undefined || raw?.budget === null || raw?.budget === '' ? null : Number(raw.budget);
  if (!validBudget(budget)) fields.budget = '예산은 0원~100만 원, 천 원 단위로 적어 주세요.';
  const timeOfDay = String(raw?.timeOfDay ?? '');
  if (!TIME_OF_DAY.some((slot) => slot.id === timeOfDay)) fields.timeOfDay = '출발 시간대를 골라 주세요.';
  // District ids of friends already met (도감). Unknown ids are dropped by the server, which knows the districts.
  const met = Array.isArray(raw?.metFriends) ? raw.metFriends : [];
  if (met.length > MAX_MET || met.some((id) => typeof id !== 'string' || !/^[a-z]{2,20}$/.test(id))) fields.metFriends = '만난 동네 친구 정보를 다시 불러와 주세요.';
  if (Object.keys(fields).length) throw new ConditionError(fields);
  // D50: hints from the first start shape the courses; anything unknown is dropped quietly (they are optional).
  const tastes = Array.isArray(raw?.tastes) ? [...new Set(raw.tastes.filter((tag) => typeof tag === 'string' && /^[a-z][a-z_]{1,29}$/.test(tag)))].slice(0, 8) : [];
  const travelStyle = TRAVEL_STYLE_IDS.includes(raw?.travelStyle) ? raw.travelStyle : '';
  return { pet, departure, location, ...(departureLabel ? { departureLabel } : {}), hours, partySize, walkLevel, timeOfDay, metFriends: [...new Set(met)], ...(budget !== null ? { budget } : {}), ...(tastes.length ? { tastes } : {}), ...(travelStyle ? { travelStyle } : {}) };
}

export function departurePoint(conditions) {
  if (conditions.departure === CURRENT_LOCATION) return { label: '현재 위치', ...conditions.location };
  if (conditions.departure === SEARCHED_PLACE) return { label: conditions.departureLabel, ...conditions.location };
  const { label, lat, lng } = FIXED_ORIGINS.find((station) => station.id === conditions.departure);
  return { label, lat, lng };
}

// Word plus its particle: 받침 decides 과/와, 은/는, 이/가. Non-Hangul endings take the no-받침 form.
export function josa(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? withFinal : withoutFinal);
}

// One-line Korean summary used on screen and in the recommendation prompt.
export function describeConditions(conditions, { petName, lang = 'ko' }) {
  const label = (list, value, key) => list.find((item) => item[key] === value).label;
  // D53/P76: another language reads the same pieces from the phrase table (the AI prompt keeps the Korean line).
  if (lang !== 'ko') {
    const p = (ko, vars) => phraseIn(lang, ko, vars);
    const minutes = Math.round(conditions.hours * 60);
    const choice = HOUR_CHOICES.find((item) => item.hours === conditions.hours);
    const duration = choice ? p(choice.label) : [Math.floor(minutes / 60) && p('{h}시간', { h: Math.floor(minutes / 60) }), minutes % 60 && p('{m}분', { m: minutes % 60 })].filter(Boolean).join(' ');
    return [
      p('{pet}와(과) 함께', { pet: petName }), p('{label} 출발', { label: p(departurePoint(conditions).label) }), duration,
      conditions.partySize === 1 ? p('혼자') : p('{n}명', { n: conditions.partySize }),
      p('{label} 걷기', { label: p(label(WALK_CHOICES, conditions.walkLevel, 'level')) }), p(label(TIME_OF_DAY, conditions.timeOfDay, 'id')),
      ...(conditions.budget != null ? [p('1인 {won}', { won: budgetLabelIn(lang, conditions.budget) })] : []),
    ].join(' · ');
  }
  return [
    `${josa(petName, '과', '와')} 함께`,
    `${departurePoint(conditions).label} 출발`,
    durationLabel(conditions.hours),
    conditions.partySize === 1 ? '혼자' : `${conditions.partySize}명`,
    `${label(WALK_CHOICES, conditions.walkLevel, 'level')} 걷기`,
    label(TIME_OF_DAY, conditions.timeOfDay, 'id'),
    ...(conditions.budget != null ? [`1인 ${budgetLabel(conditions.budget)}`] : []),
  ].join(' · ');
}
