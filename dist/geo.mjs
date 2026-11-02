// Geometry shared by the server, tests and (later) the browser's arrival check. No DOM access.
// Boundaries are GeoJSON Polygon/MultiPolygon features in [lng, lat] order.
export function distanceKm(a, b) {
  const rad = (value) => value * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function polygons(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

// Ray casting on the outer ring minus holes; good enough at city scale.
function inRing({ lat, lng }, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inFeature(point, feature) {
  return polygons(feature.geometry).some(([outer, ...holes]) => inRing(point, outer) && !holes.some((hole) => inRing(point, hole)));
}

// Distance from a point to the feature's outline, in km (0 when inside).
export function kmOutside(point, feature) {
  if (inFeature(point, feature)) return 0;
  const kmPerLng = 111.32 * Math.cos(point.lat * Math.PI / 180);
  let best = Infinity;
  for (const ring of polygons(feature.geometry).flat()) {
    for (let i = 1; i < ring.length; i += 1) {
      const [ax, ay] = ring[i - 1]; const [bx, by] = ring[i];
      const [px, py] = [(point.lng - ax) * kmPerLng, (point.lat - ay) * 110.57];
      const [dx, dy] = [(bx - ax) * kmPerLng, (by - ay) * 110.57];
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(px - t * dx, py - t * dy));
    }
  }
  return best;
}

// The boundary feature containing the point, or null outside every feature.
export function featureAt(point, features) {
  return features.find((feature) => inFeature(point, feature)) ?? null;
}
