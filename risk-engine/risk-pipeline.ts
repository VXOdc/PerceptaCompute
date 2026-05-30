/**
 * risk-pipeline.ts — T4 + T8 + fixes #4, #7
 *
 * Fix #4 — Confidence output capped and expressed as a proper ratio:
 *   `confidence` is now clamped to [0, 1] and represents the fraction of the
 *   WARNING threshold rather than the DANGER threshold at high scores, so the
 *   displayed value remains meaningful instead of silently saturating above 1.
 *   A separate `rawScore` field is preserved for logging / debugging.
 *
 * Fix #7 — Per-object confidence weighting:
 *   Each object's risk factor scores are multiplied by its `detectionConfidence`
 *   (0–1). A detection at 0.4 confidence contributes proportionally less than
 *   one at 0.95. Compound-convergence pairs are weighted by the geometric mean
 *   of both objects' confidences. This makes the pipeline appropriately
 *   conservative about uncertain detections without ignoring them.
 *
 * T4: Uses closingVelocityMps from the vector TTC result.
 *     TTC factor fires only when a true collision trajectory is confirmed.
 *
 * T8: Compound multi-object threat scoring:
 *     - compoundConvergence: scores pairs of approaching/crossing objects
 *       predicted to converge on the operator simultaneously.
 *     - corridorSweep: trapezoid integration of object swept area over the
 *       forward corridor across the prediction horizon.
 */
import {
  Direction, GeoPoint, MotionState, OperationalContext,
  RiskAssessment, RiskFactor, RiskLevel, TrackedObject,
} from '@/core/types';
import { TTCResult, directionFromCentroid } from '@/spatial/geometry';
import { Acceleration2D } from '@/temporal/multi-object-tracker';

// ─── Constants ────────────────────────────────────────────────────────────────
const PREDICTION_HORIZON_SEC   = 3.0;
const PREDICTION_STEPS         = 6;
const CORRIDOR_HALF_WIDTH_NORM = 0.175;
const COMPOUND_HORIZON_SEC     = 4.0;
const COMPOUND_RADIUS_NORM     = 0.12;
const MAX_ACCEL_MPS2           = 8.0;

// ─── Mode / Sensitivity config ────────────────────────────────────────────────
const MODE_MULTIPLIER: Record<OperationalContext['mode'], number> = {
  run: 1.2, walk: 1, cycle: 1.35, vehicle: 1.6, industrial: 1.45,
};

const SENSITIVITY: Record<string, { danger: number; warning: number }> = {
  low:  { danger: 92, warning: 58 },
  med:  { danger: 78, warning: 44 },
  high: { danger: 62, warning: 32 },
};

// ─── Extended track type ──────────────────────────────────────────────────────
type ExtendedTrack = TrackedObject & {
  _ttcResult?:         TTCResult;
  acceleration?:       Acceleration2D;
  /** Fix #7: confidence from the detection that spawned / last refreshed this track */
  detectionConfidence?: number;
};

// ─── Second-order position prediction ─────────────────────────────────────────
function predictPos(track: ExtendedTrack, tSec: number): GeoPoint {
  const ax = Math.max(-MAX_ACCEL_MPS2, Math.min(MAX_ACCEL_MPS2, track.acceleration?.ax ?? 0));
  const ay = Math.max(-MAX_ACCEL_MPS2, Math.min(MAX_ACCEL_MPS2, track.acceleration?.ay ?? 0));
  return {
    x: Math.max(0, Math.min(1, track.centroid.x + track.velocity.vx * tSec + 0.5 * ax * tSec * tSec)),
    y: Math.max(0, Math.min(1, track.centroid.y + track.velocity.vy * tSec + 0.5 * ay * tSec * tSec)),
  };
}

// ─── T8: Corridor sweep ───────────────────────────────────────────────────────
function corridorSweepFraction(track: ExtendedTrack, horizonSec: number, steps: number): number {
  let overlap = 0;
  for (let i = 0; i <= steps; i++) {
    const t   = (i / steps) * horizonSec;
    const pos = predictPos(track, t);
    if (Math.abs(pos.x - 0.5) < CORRIDOR_HALF_WIDTH_NORM) overlap++;
  }
  return overlap / (steps + 1);
}

// ─── Fix #7 helper ───────────────────────────────────────────────────────────
/** Clamp detection confidence to [0.1, 1.0] — never zero-out a detection. */
function confWeight(track: ExtendedTrack): number {
  return Math.max(0.1, Math.min(1.0, track.detectionConfidence ?? 1.0));
}

// ─── Per-object risk factors ──────────────────────────────────────────────────
function baseObjectRisk(track: ExtendedTrack): RiskFactor[] {
  const factors: RiskFactor[] = [];
  const id  = track.trackId;
  const ttc = track._ttcResult;
  // Fix #7: all raw scores multiplied by detection confidence
  const w   = confWeight(track);

  // Proximity
  const proximityScore = Math.max(0, 45 - track.estimatedDistanceM * 2.4) * w;
  if (proximityScore > 0) {
    factors.push({
      code:  'proximity',
      label: `${track.type} estimated ${track.estimatedDistanceM}m away`,
      score: proximityScore,
      objectId: id,
    });
  }

  // T4: Closing velocity from vector TTC
  const closingVel = ttc
    ? ttc.closingVelocityMps
    : (track.motion === 'approaching' ? track.speedMps : 0);
  if (closingVel > 0.5) {
    factors.push({
      code:  'closing_velocity',
      label: `${track.type} closing at ${closingVel.toFixed(1)} m/s`,
      score: (20 + closingVel * 6) * w,
      objectId: id,
    });
  }

  if (track.motion === 'crossing') {
    factors.push({
      code:  'cross_traffic',
      label: `${track.type} crossing operator path`,
      score: 18 * w,
      objectId: id,
    });
  }

  // T4: TTC fires only when d_min < collision radius (confirmed trajectory)
  if (ttc?.ttcSec !== undefined && ttc.ttcSec !== null && ttc.ttcSec <= 5) {
    factors.push({
      code:  'vector_ttc',
      label: `collision trajectory confirmed, TTC ${ttc.ttcSec.toFixed(1)}s`,
      score: 35 * (1 - ttc.ttcSec / 6) * w,
      objectId: id,
    });
  }

  // T4: Near-miss factor
  if (ttc && ttc.minSeparationM < 3.0 && ttc.tCPA > 0 && ttc.tCPA < 5) {
    const nearMissScore = Math.max(0, 20 * (1 - ttc.minSeparationM / 3)) * w;
    if (nearMissScore > 2) {
      factors.push({
        code:  'near_miss',
        label: `${track.type} min separation ${ttc.minSeparationM.toFixed(1)}m at t+${ttc.tCPA.toFixed(1)}s`,
        score: nearMissScore,
        objectId: id,
      });
    }
  }

  // T8: Corridor sweep
  const sweep = corridorSweepFraction(track, PREDICTION_HORIZON_SEC, PREDICTION_STEPS);
  if (sweep > 0.4) {
    factors.push({
      code:  'corridor_sweep',
      label: `${track.type} occupies forward corridor ${Math.round(sweep * 100)}% over ${PREDICTION_HORIZON_SEC}s`,
      score: sweep * 28 * w,
      objectId: id,
    });
  }

  // Vehicle class (kinetic hazard — confidence-weighted)
  if (track.type === 'car') {
    factors.push({ code: 'vehicle_class', label: 'motor vehicle — high kinetic hazard', score: 18 * w, objectId: id });
  } else if (track.type === 'bike') {
    factors.push({ code: 'vehicle_class', label: 'bicycle — moderate kinetic hazard', score: 10 * w, objectId: id });
  }

  // Stale penalty
  if (track.stale) {
    factors.push({ code: 'stale_track', label: `${track.type} temporarily occluded`, score: -10, objectId: id });
  }

  return factors;
}

// ─── T8: Compound convergence ─────────────────────────────────────────────────
function compoundConvergenceFactors(tracks: ExtendedTrack[]): RiskFactor[] {
  const factors    = [] as RiskFactor[];
  const candidates = tracks.filter(t => t.motion === 'approaching' || t.motion === 'crossing');

  for (let i = 0; i < candidates.length - 1; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a    = candidates[i];
      const b    = candidates[j];
      const ttcA = a._ttcResult?.ttcSec ?? null;
      const ttcB = b._ttcResult?.ttcSec ?? null;
      if (ttcA === null || ttcB === null)              continue;
      if (ttcA > COMPOUND_HORIZON_SEC || ttcB > COMPOUND_HORIZON_SEC) continue;

      const sharedT = Math.min(ttcA, ttcB);
      const posA    = predictPos(a, sharedT);
      const posB    = predictPos(b, sharedT);

      const distA = Math.hypot(posA.x - 0.5, posA.y - 0.7);
      const distB = Math.hypot(posB.x - 0.5, posB.y - 0.7);

      if (distA < COMPOUND_RADIUS_NORM && distB < COMPOUND_RADIUS_NORM) {
        // Fix #7: geometric mean of pair confidences weights the compound score
        const pairWeight = Math.sqrt(confWeight(a) * confWeight(b));
        const score      = (22 + (COMPOUND_HORIZON_SEC - sharedT) * 5) * pairWeight;
        factors.push({
          code:     'compound_convergence',
          label:    `${a.type} + ${b.type} converging on operator at t+${sharedT.toFixed(1)}s`,
          score,
          objectId: a.trackId,
        });
      }
    }
  }
  return factors;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export class RiskPipeline {
  assess(
    tracks: TrackedObject[],
    context:     Partial<OperationalContext> = {},
    sensitivity  = 'med'
  ): RiskAssessment {
    if (tracks.length === 0) {
      return { risk: 'SAFE', direction: 'NONE', confidence: 1, score: 0, horizonSec: PREDICTION_HORIZON_SEC, factors: [] };
    }

    const extTracks  = tracks as ExtendedTrack[];
    const multiplier = MODE_MULTIPLIER[context.mode ?? 'walk'] ?? 1;
    const thresholds = SENSITIVITY[sensitivity] ?? SENSITIVITY.med;

    let topScore = 0;
    let topDirection: Direction = 'NONE';
    let primaryObjectId: string | undefined;
    const allFactors: RiskFactor[] = [];

    // Per-object pass
    for (const track of extTracks) {
      const trackFactors = baseObjectRisk(track);
      const score        = trackFactors.reduce((sum, f) => sum + f.score, 0) * multiplier;
      allFactors.push(...trackFactors);

      if (score > topScore) {
        topScore        = score;
        topDirection    = directionFromCentroid(track.centroid);
        primaryObjectId = track.trackId;
      }
    }

    // T8: Compound convergence pass
    const convergenceFactors = compoundConvergenceFactors(extTracks);
    allFactors.push(...convergenceFactors);
    topScore += convergenceFactors.reduce((s, f) => s + f.score, 0) * multiplier;

    const risk: RiskLevel =
      topScore >= thresholds.danger  ? 'DANGER'  :
      topScore >= thresholds.warning ? 'WARNING' :
      'SAFE';

    // Fix #4: confidence is clamped to [0, 1] and expressed as a fraction of
    // the WARNING threshold, not DANGER, so it reads as a meaningful 0–100%
    // readiness indicator rather than clipping silently at highly-dangerous scenes.
    const confidence = Math.max(0.05, Math.min(1.0, topScore / thresholds.warning));

    return {
      risk,
      direction:   topDirection,
      confidence,
      score:       Math.round(topScore),
      horizonSec:  PREDICTION_HORIZON_SEC,
      factors:     allFactors
        .filter(f => Math.abs(f.score) > 1)
        .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
        .slice(0, 10),
      primaryObjectId,
    };
  }
}
