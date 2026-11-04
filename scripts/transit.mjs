// D40/P56: real public-transit time for the three picks, from Kakao Map 대중교통 경로 조회 (S32) with the same REST key
// as the departure search. Only what the card shows (minutes, transfers, fare, line names and Kakao's own route link)
// is kept, for this response only; nothing is stored. Without a key, or when Kakao is slow or has no route, the card
// keeps the straight-line estimate.
const ENDPOINT = 'https://dapi.kakao.com/v2/routing/publictraffic';
const won = (value) => `${Number(value).toLocaleString('ko-KR')}원`;

export function fareLabel(fare = {}) {
  if (fare.value != null) return won(fare.value);
  if (fare.min != null && fare.max != null) return fare.min === fare.max ? won(fare.min) : `${won(fare.min)}~${won(fare.max)}`;
  return null;
}
function lineName(step) {
  const vehicle = step.properties?.vehicles?.[0];
  if (!vehicle?.name) return null;
  return step.properties.type === 'BUS' && vehicle.type ? `${vehicle.type} ${vehicle.name}` : vehicle.name;
}
// The fastest of the routes Kakao offers; its rides in order, e.g. ['3호선', '4호선', '마을 성북02'].
export function summariseRoute(body) {
  if (body?.status !== 'OK' || !body.routes?.length) return null;
  const route = body.routes.reduce((best, item) => (item.properties.totalTime < best.properties.totalTime ? item : best));
  const landing = body.properties?.landingURL;
  return {
    minutes: Math.max(1, Math.round(route.properties.totalTime / 60)),
    transfers: route.properties.transfers ?? 0,
    fare: fareLabel(route.properties.fare),
    lines: (route.steps ?? []).filter((step) => ['SUBWAY', 'BUS'].includes(step.properties?.type)).map(lineName).filter(Boolean),
    landingUrl: typeof landing === 'string' && landing.startsWith('https://map.kakao.com/') ? landing : null,
  };
}
export function transitLine(route) {
  const ride = route.lines.length ? route.lines.join(' → ') : '대중교통';
  return [ride, `약 ${route.minutes}분`, route.transfers ? `환승 ${route.transfers}회` : '환승 없음', route.fare].filter(Boolean).join(' · ');
}

export function createTransit({ key = null, fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  if (!key) return null;
  return async function route(origin, place) {
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({ start_x: String(origin.lng), start_y: String(origin.lat), end_x: String(place.lng), end_y: String(place.lat), s_name: origin.label, e_name: place.name });
    try {
      const response = await fetchImpl(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(timeoutMs) });
      return response.ok ? summariseRoute(await response.json()) : null;
    } catch { return null; }
  };
}
