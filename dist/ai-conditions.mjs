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
  } else if (!SEOUL_STATIONS.some((station) => station.id === departure)) fields.departure = '출발 위치를 찾거나 목록에서 골라 주세요.';
  const hours = Number(raw?.hours);
  if (!validHours(hours)) fields.hours = '쓸 수 있는 시간을 고르거나 30분~12시간, 10분 단위로 적어 주세요.';
  const partySize = Number(raw?.partySize);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > MAX_PARTY) fields.partySize = `인원은 1~${MAX_PARTY}명으로 입력해 주세요.`;
  const walkLevel = Number(raw?.walkLevel);
  if (!WALK_CHOICES.some((choice) => choice.level === walkLevel)) fields.walkLevel = '걷기 정도를 골라 주세요.';
  const timeOfDay = String(raw?.timeOfDay ?? '');
  if (!TIME_OF_DAY.some((slot) => slot.id === timeOfDay)) fields.timeOfDay = '출발 시간대를 골라 주세요.';
  // District ids of friends already met (도감). Unknown ids are dropped by the server, which knows the districts.
  const met = Array.isArray(raw?.metFriends) ? raw.metFriends : [];
  if (met.length > MAX_MET || met.some((id) => typeof id !== 'string' || !/^[a-z]{2,20}$/.test(id))) fields.metFriends = '만난 동네 친구 정보를 다시 불러와 주세요.';
  if (Object.keys(fields).length) throw new ConditionError(fields);
  // D50: hints from the first start shape the courses; anything unknown is dropped quietly (they are optional).
  const tastes = Array.isArray(raw?.tastes) ? [...new Set(raw.tastes.filter((tag) => typeof tag === 'string' && /^[a-z][a-z_]{1,29}$/.test(tag)))].slice(0, 8) : [];
  const travelStyle = TRAVEL_STYLE_IDS.includes(raw?.travelStyle) ? raw.travelStyle : '';
  return { pet, departure, location, ...(departureLabel ? { departureLabel } : {}), hours, partySize, walkLevel, timeOfDay, metFriends: [...new Set(met)], ...(tastes.length ? { tastes } : {}), ...(travelStyle ? { travelStyle } : {}) };
}

export function departurePoint(conditions) {
  if (conditions.departure === CURRENT_LOCATION) return { label: '현재 위치', ...conditions.location };
  if (conditions.departure === SEARCHED_PLACE) return { label: conditions.departureLabel, ...conditions.location };
  const { label, lat, lng } = SEOUL_STATIONS.find((station) => station.id === conditions.departure);
  return { label, lat, lng };
}

// Word plus its particle: 받침 decides 과/와, 은/는, 이/가. Non-Hangul endings take the no-받침 form.
export function josa(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? withFinal : withoutFinal);
}

// One-line Korean summary used on screen and in the recommendation prompt.
export function describeConditions(conditions, { petName }) {
  const label = (list, value, key) => list.find((item) => item[key] === value).label;
  return [
    `${josa(petName, '과', '와')} 함께`,
    `${departurePoint(conditions).label} 출발`,
    durationLabel(conditions.hours),
    conditions.partySize === 1 ? '혼자' : `${conditions.partySize}명`,
    `${label(WALK_CHOICES, conditions.walkLevel, 'level')} 걷기`,
    label(TIME_OF_DAY, conditions.timeOfDay, 'id'),
  ].join(' · ');
}
