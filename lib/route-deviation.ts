export type Coordinate = { latitude: number; longitude: number };

export function decodePolyline(encoded: string): Coordinate[] {
  const points: Coordinate[] = [];
  let index = 0, latitude = 0, longitude = 0;
  while (index < encoded.length) {
    let result = 0, shift = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20 && index < encoded.length);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0; shift = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20 && index < encoded.length);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
}

function projected(point: Coordinate, origin: Coordinate) {
  const radians = Math.PI / 180;
  return { x: (point.longitude - origin.longitude) * radians * 6_371_000 * Math.cos(origin.latitude * radians), y: (point.latitude - origin.latitude) * radians * 6_371_000 };
}

export function distanceToRouteMetres(point: Coordinate, route: Coordinate[]) {
  if (!route.length) return Number.POSITIVE_INFINITY;
  let minimum = Number.POSITIVE_INFINITY;
  const p = projected(point, point);
  for (let index = 0; index < route.length - 1; index += 1) {
    const a = projected(route[index], point), b = projected(route[index + 1], point);
    const dx = b.x - a.x, dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
    minimum = Math.min(minimum, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return Math.round(minimum);
}
