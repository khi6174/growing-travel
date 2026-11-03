// D35/P49: Seoul's weather right now, from KMA 단기예보 (data.go.kr "기상청_단기예보 조회서비스"). Observed rain/snow
// comes from 초단기실황 (PTY, T1H) and the sky from 초단기예보 (SKY). The key stays on the server; the browser only
// gets the summarised condition. Without a key, or while the service is not approved, the app shows the season only.
const BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
const FRESH_MS = 10 * 60 * 1000;
const RETRY_MS = 2 * 60 * 1000;

// KMA's Lambert conformal conic grid (5 km): the standard conversion from the API guide.
export function toKmaGrid(lat, lng) {
  const RE = 6371.00877 / 5.0; const rad = Math.PI / 180;
  const [slat1, slat2, olon, olat] = [30 * rad, 60 * rad, 126 * rad, 38 * rad];
  const sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(Math.tan(Math.PI / 4 + slat2 / 2) / Math.tan(Math.PI / 4 + slat1 / 2));
  const sf = (Math.tan(Math.PI / 4 + slat1 / 2) ** sn * Math.cos(slat1)) / sn;
  const ro = (RE * sf) / Math.tan(Math.PI / 4 + olat / 2) ** sn;
  const ra = (RE * sf) / Math.tan(Math.PI / 4 + lat * rad / 2) ** sn;
  let theta = lng * rad - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + 43 + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + 136 + 0.5) };
}
export const SEOUL = Object.freeze({ name: '서울시청', lat: 37.5665, lng: 126.978 });

// Seoul wall-clock parts for a moment, without depending on the machine's time zone.
function seoulParts(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((part) => [part.type, part.value]));
  return { date: `${parts.year}${parts.month}${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}
// Base times to try, newest first. 초단기실황 is issued on the hour and 초단기예보 at half past; each is published a
// little later, so the newest one may not exist yet and the caller falls back to the next.
export function baseTimes(now = new Date()) {
  const at = (msAgo, minute) => { const { date, hour } = seoulParts(new Date(now.getTime() - msAgo)); return { base_date: date, base_time: `${String(hour).padStart(2, '0')}${minute}` }; };
  const hour = 60 * 60 * 1000; const { minute } = seoulParts(now);
  return {
    ncst: [0, hour, 2 * hour].map((ago) => at(ago, '00')),
    fcst: (minute >= 45 ? [0, hour] : [hour, 2 * hour]).map((ago) => at(ago, '30')),
  };
}

// PTY 0 none, 1 rain, 2 rain/snow, 3 snow, 4 shower, 5 drizzle, 6 drizzle/snow flurries, 7 snow flurries; SKY 1 clear,
// 3 mostly cloudy, 4 overcast (2 was folded into 1 in 2019).
const RAIN = { 1: 'rain', 4: 'rain', 5: 'rain', 2: 'sleet', 6: 'sleet', 3: 'snow', 7: 'snow' };
const SKY = { 1: 'clear', 2: 'clear', 3: 'cloudy', 4: 'overcast' };
export const CONDITION_LABELS = Object.freeze({ clear: '맑음', cloudy: '구름 많음', overcast: '흐림', rain: '비', sleet: '비 또는 눈', snow: '눈', dry: '비·눈 없음' });
export function conditionFrom({ pty, sky }) {
  if (RAIN[pty]) return RAIN[pty];
  return SKY[sky] ?? 'dry';
}

const items = (body) => body?.response?.body?.items?.item ?? [];
export function summarise(ncst, fcst) {
  const observed = Object.fromEntries(items(ncst).map((item) => [item.category, item]));
  const skies = items(fcst).filter((item) => item.category === 'SKY').sort((a, b) => `${a.fcstDate}${a.fcstTime}`.localeCompare(`${b.fcstDate}${b.fcstTime}`));
  const pty = Number(observed.PTY?.obsrValue ?? 0);
  const sky = skies.length ? Number(skies[0].fcstValue) : null;
  const condition = conditionFrom({ pty, sky });
  const base = observed.PTY ?? observed.T1H;
  const temp = Number(observed.T1H?.obsrValue);
  return {
    condition, label: CONDITION_LABELS[condition], tempC: Number.isFinite(temp) ? Math.round(temp) : null,
    observedAt: base ? `${base.baseDate.slice(0, 4)}-${base.baseDate.slice(4, 6)}-${base.baseDate.slice(6)}T${base.baseTime.slice(0, 2)}:${base.baseTime.slice(2)}:00+09:00` : null,
    source: '기상청 초단기실황·초단기예보',
  };
}

export class WeatherError extends Error {
  constructor(code, message) { super(message); this.name = 'WeatherError'; this.code = code; }
}
async function call(fetchImpl, key, operation, grid, candidates) {
  for (const time of candidates) {
    const url = new URL(`${BASE}/${operation}`);
    url.search = new URLSearchParams({ serviceKey: key, pageNo: '1', numOfRows: '60', dataType: 'JSON', ...time, nx: String(grid.nx), ny: String(grid.ny) });
    let response;
    try { response = await fetchImpl(url, { signal: AbortSignal.timeout(4000) }); }
    catch { throw new WeatherError('UNAVAILABLE', '기상청에 연결하지 못했어요.'); }
    const body = await response.json().catch(() => null);
    const reason = body?.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg;
    if (reason === 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR') throw new WeatherError('NOT_REGISTERED', '공공데이터포털에서 기상청_단기예보 조회서비스 활용신청이 필요해요.');
    if (!response.ok || reason) throw new WeatherError('UNAVAILABLE', `기상청 응답 오류(${reason ?? response.status})`);
    const code = body?.response?.header?.resultCode;
    if (code === '00' && items(body).length) return body;
    if (code !== '03' && code !== '00') throw new WeatherError('UNAVAILABLE', `기상청 응답 오류(${code})`);
  }
  throw new WeatherError('UNAVAILABLE', '기상청 자료가 아직 올라오지 않았어요.');
}

// One shared reading for every visitor, refreshed at most every 10 minutes (failures are retried after 2).
export function createWeather({ key = null, fetchImpl = fetch, now = () => new Date(), grid = toKmaGrid(SEOUL.lat, SEOUL.lng) } = {}) {
  let cache = null;
  return async function current() {
    if (!key) return { weather: null, reason: 'NO_KEY' };
    if (cache && now().getTime() - cache.at < (cache.value.weather ? FRESH_MS : RETRY_MS)) return cache.value;
    let value;
    try {
      const times = baseTimes(now());
      const ncst = await call(fetchImpl, key, 'getUltraSrtNcst', grid, times.ncst);
      const fcst = await call(fetchImpl, key, 'getUltraSrtFcst', grid, times.fcst).catch(() => null);
      value = { weather: { ...summarise(ncst, fcst), place: SEOUL.name } };
    } catch (error) {
      if (error.name !== 'WeatherError') throw error;
      value = { weather: null, reason: error.code, message: error.message };
    }
    cache = { at: now().getTime(), value };
    return value;
  };
}
