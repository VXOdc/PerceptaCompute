/**
 * geometry.ts — T4 + fix #2
 *
 * Fix #2 — Calibration-aware distance estimation:
 *   `estimateDistanceMeters` now accepts an optional `calibration` object that
 *   overrides the hard-coded 2.2 / 6.5 / 14 m lookup table per camera profile.
 *   A `CameraCalibration` type is exported so the rest of the app can persist
 *   and supply per-scene tuning. The spatial reasoner and SpatialTracker accept
 *   an optional calibration argument that is forwarded transparently.
 *
 *   When no calibration is supplied the function falls back to the original
 *   blended (categorical + bbox-area) heuristic so existing behaviour is unchanged.
 *
 * T4: computeVectorTTC — 2D minimum-separation TTC model.
 */
import { DetectedObject, Distance, GeoPoint, NormalizedBBox, Position } from '@/core/types';

// ─── Calibration ─────────────────────────────────────────────────────────────

/**
 * Per-camera distance calibration.
 * Override the built-in near/mid/far lookup table to match the actual
 * field-of-view of a specific lens + mounting height combination.
 *
 * Obtain values by placing a known object at measured distances and reading
 * the label the model returns, then adjusting until the distance output
 * matches reality.
 */
export interface CameraCalibration {
  /** True metric distance (metres) when the model returns "near". Default 2.2 m. */
  nearM: number;
  /** True metric distance when the model returns "mid". Default 6.5 m. */
  midM:  number;
  /** True metric distance when the model returns "far". Default 14 m. */
  farM:  number;
}

export const DEFAULT_CALIBRATION: CameraCalibration = {
  nearM: 2.2,
  midM:  6.5,
  farM:  14,
};

function distanceLookup(distance: Distance, cal: CameraCalibration): number {
  if (distance === 'near') return cal.nearM;
  if (distance === 'mid')  return cal.midM;
  return cal.farM;
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function bboxCentroid(bbox: NormalizedBBox): GeoPoint {
  return { x: clamp01(bbox[0] + bbox[2] / 2), y: clamp01(bbox[1] + bbox[3] / 2) };
}

export function positionToCentroid(position: Position, distance: Distance, index = 0): GeoPoint {
  const x = position === 'left' ? 0.24 : position === 'right' ? 0.76 : 0.5;
  const y = distance === 'near' ? 0.68  : distance === 'mid'   ? 0.52  : 0.38;
  return { x: clamp01(x + index * 0.025), y: clamp01(y + index * 0.02) };
}

export function estimateBBox(obj: DetectedObject, index = 0): NormalizedBBox {
  if (obj.bbox) return obj.bbox;
  const centroid = positionToCentroid(obj.position, obj.distance, index);
  const width    = obj.distance === 'near' ? 0.34 : obj.distance === 'mid' ? 0.21 : 0.12;
  const height   = obj.type === 'person' ? width * 1.9 : width * 1.25;
  const x = clamp01(centroid.x - width / 2);
  const y = clamp01(centroid.y - height / 2);
  return [Math.min(x, 1 - width), Math.min(y, 1 - height), width, height];
}

/**
 * Estimate metric distance from a detection.
 *
 * Fix #2: Accepts an optional `calibration` argument.
 * When supplied, the categorical lookup uses calibrated values instead of
 * the hard-coded defaults, making the blended estimate accurate for the
 * actual lens in use.
 */
export function estimateDistanceMeters(
  distance:     Distance,
  bbox?:        NormalizedBBox,
  calibration?: CameraCalibration
): number {
  const cal       = calibration ?? DEFAULT_CALIBRATION;
  const catDist   = distanceLookup(distance, cal);
  if (!bbox) return catDist;

  const boxArea      = Math.max(0.001, bbox[2] * bbox[3]);
  const visualDist   = Math.max(1.2, Math.min(25, 1.15 / Math.sqrt(boxArea)));
  return Math.round(((catDist + visualDist) / 2) * 10) / 10;
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
  ttcSec:              number | null;
  /** Signed closing velocity (m/s). Positive = approaching, negative = diverging. */
  closingVelocityMps:  number;
  /** Predicted minimum separation at t_CPA (metres) */
  minSeparationM:      number;
  /** Raw time of closest approach regardless of collision radius */
  tCPA:                number;
}

/**
 * Minimum-separation TTC via 2D relative kinematics.
 *
 * For relative position r₀ = p_object − p_operator and relative velocity v_rel:
 *   d²(t) = |r₀ + v_rel·t|²
 *   t_CPA = −(r₀·v_rel) / |v_rel|²
 *   d_min = sqrt(|r₀|² − (r₀·v_rel)² / |v_rel|²)
 *
 * TTC is t_CPA only when d_min < collisionRadiusM. If paths won't intersect
 * returns ttcSec: null — no false alarm for crossing traffic.
 */
export function computeVectorTTC(
  relativePosition: GeoPoint,
  relativeVelocity: { vx: number; vy: number },
  collisionRadiusM  = 1.2
): TTCResult {
  const r0x  = relativePosition.x;
  const r0y  = relativePosition.y;
  const vrx  = relativeVelocity.vx;
  const vry  = relativeVelocity.vy;
  const vRelSq = vrx * vrx + vry * vry;

  if (vRelSq < 1e-6) {
    const dist = Math.hypot(r0x, r0y);
    return { ttcSec: null, closingVelocityMps: 0, minSeparationM: dist, tCPA: Infinity };
  }

  const r0DotVrel  = r0x * vrx + r0y * vry;
  const tCPA       = -r0DotVrel / vRelSq;
  const currentDistSq  = r0x * r0x + r0y * r0y;
  const currentDist    = Math.sqrt(currentDistSq);
  const closingVelocityMps = currentDist > 1e-6 ? -r0DotVrel / currentDist : 0;

  if (tCPA <= 0) {
    return { ttcSec: null, closingVelocityMps, minSeparationM: currentDist, tCPA };
  }

  const minSepSq      = Math.max(0, currentDistSq - (r0DotVrel * r0DotVrel) / vRelSq);
  const minSeparationM = Math.sqrt(minSepSq);
  const ttcSec         = minSeparationM < collisionRadiusM ? tCPA : null;

  return { ttcSec, closingVelocityMps, minSeparationM, tCPA };
}
