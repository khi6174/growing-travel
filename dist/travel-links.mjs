export const RAIL_BOOKING_URL = 'https://www.korail.com/';
export function validLocation(location) {
  return location !== null && typeof location === 'object' && Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180;
}
export function safeUrl(value) {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch (error) { if (error instanceof TypeError) return false; throw error; }
}
export function mapRoute(from, to, mode = 'traffic') {
  if (!['traffic', 'walk'].includes(mode)) throw new TypeError('Unknown route mode');
  const label = (point) => point.title ?? point.label ?? point.name;
  if (![from, to].every((point) => typeof label(point) === 'string' && label(point).length > 0)) throw new TypeError('Route names required');
  if (![from, to].every((point) => validLocation(point.location))) {
    return { url: `https://map.kakao.com/link/search/${encodeURIComponent(label(to))}`, kind: 'search', label: '도착 장소 검색 · 경로는 지도에서 지정' };
  }
  const part = (point) => `${encodeURIComponent(label(point))},${point.location.lat},${point.location.lng}`;
  return { url: `https://map.kakao.com/link/by/${mode}/${part(from)}/${part(to)}`, kind: 'route', label: mode === 'walk' ? '도보 길찾기' : '대중교통 길찾기' };
}
