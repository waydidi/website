// Map-shape helpers shared by pricing areas and route inclusion zones.
export type Point = { lat: number; lng: number };

export function validPolygon(points: Point[]) {
  return (
    points.length >= 3 &&
    points.length <= 500 &&
    points.every(
      (point) =>
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lng) &&
        point.lat >= 5 &&
        point.lat <= 21 &&
        point.lng >= 96 &&
        point.lng <= 106,
    )
  );
}

export function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current++
  ) {
    const a = polygon[current];
    const b = polygon[previous];
    const intersects =
      a.lng > point.lng !== b.lng > point.lng &&
      point.lat <
        ((b.lat - a.lat) * (point.lng - a.lng)) /
          (b.lng - a.lng || Number.EPSILON) +
          a.lat;
    if (intersects) inside = !inside;
  }
  return inside;
}
