/**
 * multi-object-tracker.ts — T4 + T5 + fixes #1, #6, #7
 *
 * Fix #1 — Hungarian assignment:
 *   Replaces greedy findBestTrack with optimal O(n³) bipartite matching.
 *   Each detection gets exactly one track, each track at most one detection.
 *   Eliminates identity swaps when two people of the same type walk close together.
 *
 * Fix #6 — Kinematic extrapolation for stale tracks:
 *   When a track misses a frame its position is predicted forward using the
 *   stored velocity + acceleration (second-order kinematics) rather than frozen.
 *   The predicted centroid feeds the risk pipeline so a person briefly occluded
 *   behind a pillar doesn't lose their risk contribution.
 *
 * Fix #7 — Confidence weighting in risk factors:
 *   Detection confidence (0–1) is attached to every track as `detectionConfidence`
 *   and forwarded to the risk pipeline where it multiplies per-object factor scores.
 *   Low-confidence detections are down-weighted rather than ignored.
 *
 * T4: computeVectorTTC — 2D minimum-separation model replaces scalar TTC.
 * T5: Per-object acceleration tracked via low-pass filtered frame-over-frame
 *     velocity delta. α=0.25, clamped ±8 m/s².
 */
import { createId } from '@/core/ids';
import { DetectedObject, GeoPoint, MotionState, TrackedObject, Velocity2D } from '@/core/types';
import { CameraCalibration, computeVectorTTC, euclidean, TTCResult } from '@/spatial/geometry';
import { SpatialObservation, SpatialReasoner } from '@/spatial/spatial-reasoner';
import { hungarianAssign, INF } from './hungarian';

const ACCEL_ALPHA     = 0.25;   // Low-pass filter coefficient for acceleration
const MAX_ACCEL_MPS2  = 8.0;    // Physical clamp: ~0.8g

export interface Acceleration2D {
  ax: number;
  ay: number;
}

// ─── Extended track state ─────────────────────────────────────────────────────
interface TrackState extends TrackedObject {
  signature:           string;
  acceleration:        Acceleration2D;
  /** Raw detection confidence forwarded from the vision provider (fix #7). */
  detectionConfidence: number;
  /** Full TTC result forwarded to risk pipeline (fix #6 / T4). */
  _ttcResult?:         TTCResult;
}

export interface TrackerOptions {
  maxMissingFrames:   number;
  associationRadius:  number;
  maxTracks:          number;
}

const DEFAULT_OPTIONS: TrackerOptions = {
  maxMissingFrames:  5,
  associationRadius: 0.22,
  maxTracks:         32,
};

const DISTANCE_RANK = { far: 0, mid: 1, near: 2 };

function inferMotion(
  prev: TrackState | undefined,
  observation: SpatialObservation,
  velocity: Velocity2D
): MotionState {
  if (!prev) return observation.object.motion;
  const distanceDelta = DISTANCE_RANK[observation.object.distance] - DISTANCE_RANK[prev.distance];
  if (distanceDelta > 0 || velocity.vy > 0.18)  return 'approaching';
  if (distanceDelta < 0 || velocity.vy < -0.18) return 'leaving';
  if (Math.abs(velocity.vx) > 0.2)              return 'crossing';
  return observation.object.motion === 'approaching' ? 'approaching' : 'static';
}

function clampAccel(a: number): number {
  return Math.max(-MAX_ACCEL_MPS2, Math.min(MAX_ACCEL_MPS2, a));
}

// ─── Fix #6: Second-order position prediction ─────────────────────────────────
/**
 * Project a track's centroid forward by `tSec` seconds using stored
 * velocity and acceleration. Used for stale-track position extrapolation.
 */
function predictCentroid(track: TrackState, tSec: number): GeoPoint {
  const ax = Math.max(-MAX_ACCEL_MPS2, Math.min(MAX_ACCEL_MPS2, track.acceleration.ax));
  const ay = Math.max(-MAX_ACCEL_MPS2, Math.min(MAX_ACCEL_MPS2, track.acceleration.ay));
  return {
    x: Math.max(0, Math.min(1, track.centroid.x + track.velocity.vx * tSec + 0.5 * ax * tSec * tSec)),
    y: Math.max(0, Math.min(1, track.centroid.y + track.velocity.vy * tSec + 0.5 * ay * tSec * tSec)),
  };
}

export class MultiObjectTracker {
  private tracks = new Map<string, TrackState>();
  private readonly reasoner: SpatialReasoner;
  private readonly options: TrackerOptions;

  constructor(options: Partial<TrackerOptions> = {}, calibration?: CameraCalibration) {
    this.options  = { ...DEFAULT_OPTIONS, ...options };
    this.reasoner = new SpatialReasoner(calibration);
  }

  /**
   * @param detections   Raw detections from inference provider
   * @param timestamp    Frame timestamp (ms)
   * @param operatorVel  Operator's own velocity (m/s). Default {vx:0,vy:0}.
   */
  update(
    detections: DetectedObject[],
    timestamp  = Date.now(),
    operatorVel: Velocity2D = { vx: 0, vy: 0 }
  ): TrackedObject[] {
    const observations = this.reasoner.normalize(detections);
    const trackList    = Array.from(this.tracks.values());

    // ── Fix #1: Hungarian assignment ─────────────────────────────────────────
    // Build cost matrix: rows = existing tracks, cols = new observations.
    // Cost = Euclidean centroid distance, clamped to INF when type mismatches
    // or distance exceeds associationRadius (gates out implausible pairings).
    const costMatrix: number[][] = trackList.map(track =>
      observations.map(obs => {
        if (track.type !== obs.object.type) return INF;
        const dist = euclidean(track.centroid, obs.centroid);
        return dist <= this.options.associationRadius
          ? dist + track.framesMissing * 0.04
          : INF;
      })
    );

    // assignment[i] = j  →  trackList[i] is matched to observations[j]
    // assignment[i] = -1 →  no valid match (track goes stale this frame)
    const assignment = trackList.length > 0 && observations.length > 0
      ? hungarianAssign(costMatrix)
      : new Array<number>(trackList.length).fill(-1);

    // Which observations got claimed by an existing track?
    const claimedObsIndices = new Set(assignment.filter(j => j >= 0));

    const next = new Map<string, TrackState>();

    // ── Update matched tracks ──────────────────────────────────────────────
    trackList.forEach((track, i) => {
      const j = assignment[i];
      if (j < 0 || costMatrix[i][j] >= INF) return; // unmatched — handled below

      const observation = observations[j];
      const dt = Math.max(0.05, (timestamp - track.lastSeenAt) / 1000);

      // Velocity
      const velocity: Velocity2D = {
        vx: (observation.centroid.x - track.centroid.x) / dt,
        vy: (observation.centroid.y - track.centroid.y) / dt,
      };
      const speedMps = Math.round(Math.hypot(velocity.vx, velocity.vy) * 6 * 10) / 10;

      // T5: Acceleration (low-pass filtered)
      const rawAx = clampAccel((velocity.vx - track.velocity.vx) / dt);
      const rawAy = clampAccel((velocity.vy - track.velocity.vy) / dt);
      const acceleration: Acceleration2D = {
        ax: ACCEL_ALPHA * rawAx + (1 - ACCEL_ALPHA) * track.acceleration.ax,
        ay: ACCEL_ALPHA * rawAy + (1 - ACCEL_ALPHA) * track.acceleration.ay,
      };

      const motion = inferMotion(track, observation, velocity);

      // T4: 2D Vector TTC
      const scale        = observation.estimatedDistanceM;
      const relPosMetric: GeoPoint = {
        x: (observation.centroid.x - 0.5) * scale,
        y: (observation.centroid.y - 0.7) * scale,
      };
      const objVelMetric = { vx: velocity.vx * scale, vy: velocity.vy * scale };
      const relVelMetric = { vx: objVelMetric.vx - operatorVel.vx, vy: objVelMetric.vy - operatorVel.vy };
      const ttcResult    = computeVectorTTC(relPosMetric, relVelMetric);

      // Fix #7: confidence from this detection frame (fall back to previous)
      const detectionConfidence = observation.object.confidence ?? track.detectionConfidence;

      next.set(track.trackId, {
        ...observation.object,
        bbox:                observation.bbox,
        id:                  track.trackId,
        trackId:             track.trackId,
        signature:           `${observation.object.type}:${j}`,
        firstSeenAt:         track.firstSeenAt,
        lastSeenAt:          timestamp,
        ageMs:               timestamp - track.firstSeenAt,
        framesSeen:          track.framesSeen + 1,
        framesMissing:       0,
        prevPosition:        track.position,
        centroid:            observation.centroid,
        velocity,
        speedMps,
        estimatedDistanceM:  observation.estimatedDistanceM,
        timeToImpactSec:     ttcResult.ttcSec,
        _ttcResult:          ttcResult,
        motion,
        stale:               false,
        acceleration,
        detectionConfidence,
      } as TrackState & { _ttcResult: typeof ttcResult });
    });

    // ── Spawn new tracks for unmatched observations ────────────────────────
    observations.forEach((observation, j) => {
      if (claimedObsIndices.has(j)) return;

      const trackId = createId('trk', timestamp);
      const scale   = observation.estimatedDistanceM;
      const relPos: GeoPoint = {
        x: (observation.centroid.x - 0.5) * scale,
        y: (observation.centroid.y - 0.7) * scale,
      };
      const ttcResult = computeVectorTTC(relPos, { vx: 0, vy: 0 });

      next.set(trackId, {
        ...observation.object,
        bbox:                observation.bbox,
        id:                  trackId,
        trackId,
        signature:           `${observation.object.type}:${j}`,
        firstSeenAt:         timestamp,
        lastSeenAt:          timestamp,
        ageMs:               0,
        framesSeen:          1,
        framesMissing:       0,
        prevPosition:        undefined,
        centroid:            observation.centroid,
        velocity:            { vx: 0, vy: 0 },
        speedMps:            0,
        estimatedDistanceM:  observation.estimatedDistanceM,
        timeToImpactSec:     ttcResult.ttcSec,
        _ttcResult:          ttcResult,
        motion:              observation.object.motion,
        stale:               false,
        acceleration:        { ax: 0, ay: 0 },
        detectionConfidence: observation.object.confidence ?? 0.7,
      } as TrackState & { _ttcResult: typeof ttcResult });
    });

    // ── Fix #6: Stale tracks — kinematic extrapolation ─────────────────────
    // For tracks not assigned a detection this frame, predict position forward
    // using the kinematic model rather than freezing the last known position.
    for (const track of trackList) {
      const wasMatched = assignment[trackList.indexOf(track)] >= 0 &&
                         costMatrix[trackList.indexOf(track)][assignment[trackList.indexOf(track)]] < INF;
      if (wasMatched) continue;
      if (track.framesMissing >= this.options.maxMissingFrames) continue;

      const missedFrames  = track.framesMissing + 1;
      const dtSec         = 0.1 * missedFrames; // assume ~100 ms per frame
      const predictedCentroid = predictCentroid(track, dtSec);

      // Recompute TTC from predicted position so downstream risk stays live
      const scale   = track.estimatedDistanceM;
      const relPos: GeoPoint = {
        x: (predictedCentroid.x - 0.5) * scale,
        y: (predictedCentroid.y - 0.7) * scale,
      };
      const relVel = { vx: track.velocity.vx * scale, vy: track.velocity.vy * scale };
      const ttcResult = computeVectorTTC(relPos, relVel);

      next.set(track.trackId, {
        ...track,
        centroid:         predictedCentroid,          // extrapolated, not frozen
        timeToImpactSec:  ttcResult.ttcSec,
        _ttcResult:       ttcResult,
        framesMissing:    missedFrames,
        lastSeenAt:       timestamp,
        stale:            true,
        // Decay confidence slightly per missing frame so stale risk tapers naturally
        detectionConfidence: Math.max(0.1, track.detectionConfidence * 0.85),
        motion: track.motion === 'approaching' ? 'approaching' : 'static',
      });
    }

    // ── Prune to maxTracks by proximity ───────────────────────────────────
    this.tracks = new Map(
      Array.from(next.values())
        .sort((a, b) => a.estimatedDistanceM - b.estimatedDistanceM)
        .slice(0, this.options.maxTracks)
        .map(track => [track.trackId, track])
    );

    return Array.from(this.tracks.values());
  }

  reset(): void {
    this.tracks.clear();
  }
}
