import { DetectedObject, Distance, GeoPoint, NormalizedBBox, Position } from '@/core/types';

const DISTANCE_METERS: Record<Distance, number> = { near: 2.2, mid: 6.5, far: 14 };

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function bboxCentroid(bbox: NormalizedBBox): GeoPoint {
  return { x: clamp01(bbox[0] + bbox[2] / 2), y: clamp01(bbox[1] + bbox[3] / 2) };
}

export function positionToCentroid(position: Position, distance: Distance, index = 0): GeoPoint {
  const x = position === 'left' ? 0.24 : position === 'right' ? 0.76 : 0.5;
  const y = distance === 'near' ? 0.68 : distance === 'mid' ? 0.52 : 0.38;
  return { x: clamp01(x + index * 0.025), y: clamp01(y + index * 0.02) };
}

export function estimateBBox(obj: DetectedObject, index = 0): NormalizedBBox {
  if (obj.bbox) return obj.bbox;

  const centroid = positionToCentroid(obj.position, obj.distance, index);
  const width = obj.distance === 'near' ? 0.34 : obj.distance === 'mid' ? 0.21 : 0.12;
  const height = obj.type === 'person' ? width * 1.9 : width * 1.25;
  const x = clamp01(centroid.x - width / 2);
  const y = clamp01(centroid.y - height / 2);
  return [Math.min(x, 1 - width), Math.min(y, 1 - height), width, height];
}

export function estimateDistanceMeters(distance: Distance, bbox?: NormalizedBBox): number {
  if (!bbox) return DISTANCE_METERS[distance];
  const boxArea = Math.max(0.001, bbox[2] * bbox[3]);
  const visualDistance = Math.max(1.2, Math.min(25, 1.15 / Math.sqrt(boxArea)));
  return Math.round(((DISTANCE_METERS[distance] + visualDistance) / 2) * 10) / 10;
}

export function directionFromCentroid(point: GeoPoint): 'LEFT' | 'RIGHT' | 'FRONT' {
  if (point.x < 0.38) return 'LEFT';
  if (point.x > 0.62) return 'RIGHT';
  return 'FRONT';
}

export function euclidean(a: GeoPoint, b: GeoPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
