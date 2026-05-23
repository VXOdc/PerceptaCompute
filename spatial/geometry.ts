/**
 * geometry.ts — T4: 2D Vector TTC added.
 *
 * computeVectorTTC replaces the scalar `distanceM / speedMps` formula.
 * Finds time of closest approach (t_CPA) and minimum separation distance.
 * TTC is non-null only when predicted minimum separation < collisionRadiusM,
 * eliminating false-positive DANGER alerts for crossing traffic that will
 * safely pass.
 *
 * All existing helpers preserved unchanged.
 */
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
  const width  = obj.distance === 'near' ? 0.34 : obj.distance === 'mid' ? 0.21 : 0.12;
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

// ─── T4: 2D Vector Time-to-Collision ─────────────────────────────────────────

export interface TTCResult {
  /** Time to closest approach (seconds). Null if paths won't intersect within collision radius. */
  ttcSec: number | null;
  /** Signed closing velocity (m/s). Positive = approaching, negative = diverging. */
  closingVelocityMps: number;
  /** Predicted minimum separation at t_CPA (metres) */
  minSeparationM: number;
  /** Raw time of closest approach regardless of collision radius */
  tCPA: number;
}

/**
 * Minimum-separation TTC via 2D relative kinematics.
 *
 * For relative position r₀ = p_object - p_operator and relative velocity v_rel:
 *   d²(t) = |r₀ + v_rel·t|²
 *   t_CPA = -(r₀·v_rel) / |v_rel|²
 *   d_min = sqrt(|r₀|² - (r₀·v_rel)² / |v_rel|²)
 *
 * TTC is t_CPA only when d_min < collisionRadiusM. If paths won't intersect,
 * returns ttcSec: null — no false alarm for crossing traffic.
 *
 * @param relativePosition  Object position minus operator position (metres)
 * @param relativeVelocity  Object velocity minus operator velocity (m/s)
 * @param collisionRadiusM  Effective collision zone radius (default 1.2 m)
 */
export function computeVectorTTC(
  relativePosition: GeoPoint,
  relativeVelocity: { vx: number; vy: number },
  collisionRadiusM = 1.2
): TTCResult {
  const r0x = relativePosition.x;
  const r0y = relativePosition.y;
  const vrx = relativeVelocity.vx;
  const vry = relativeVelocity.vy;

  const vRelSq = vrx * vrx + vry * vry;

  if (vRelSq < 1e-6) {
    const dist = Math.hypot(r0x, r0y);
    return { ttcSec: null, closingVelocityMps: 0, minSeparationM: dist, tCPA: Infinity };
  }

  const r0DotVrel = r0x * vrx + r0y * vry;
  const tCPA = -r0DotVrel / vRelSq;

  const currentDistSq = r0x * r0x + r0y * r0y;
  const currentDist   = Math.sqrt(currentDistSq);

  // Signed closing velocity: positive = approaching
  const closingVelocityMps = currentDist > 1e-6 ? -r0DotVrel / currentDist : 0;

  if (tCPA <= 0) {
    // Already past closest approach — diverging
    return { ttcSec: null, closingVelocityMps, minSeparationM: currentDist, tCPA };
  }

  const minSepSq    = Math.max(0, currentDistSq - (r0DotVrel * r0DotVrel) / vRelSq);
  const minSeparationM = Math.sqrt(minSepSq);

  const ttcSec = minSeparationM < collisionRadiusM ? tCPA : null;

  return { ttcSec, closingVelocityMps, minSeparationM, tCPA };
}
