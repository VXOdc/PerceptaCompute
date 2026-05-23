/**
 * multi-object-tracker.ts — T4 + T5
 *
 * T4: Replaces scalar timeToImpact (distanceM / speedMps) with
 *     computeVectorTTC from spatial/geometry — 2D minimum-separation model.
 *
 * T5: Tracks per-object acceleration via frame-over-frame velocity delta,
 *     low-pass filtered (α=0.25) to suppress bbox jitter noise.
 *     Acceleration clamped to ±8 m/s² (≈0.8g).
 */
import { createId } from '@/core/ids';
import { DetectedObject, GeoPoint, MotionState, TrackedObject, Velocity2D } from '@/core/types';
import { computeVectorTTC, euclidean } from '@/spatial/geometry';
import { SpatialObservation, SpatialReasoner } from '@/spatial/spatial-reasoner';

const ACCEL_ALPHA     = 0.25;   // Low-pass filter coefficient for acceleration
const MAX_ACCEL_MPS2  = 8.0;    // Physical clamp: ~0.8g

export interface Acceleration2D {
  ax: number;
  ay: number;
}

interface TrackState extends TrackedObject {
  signature: string;
  acceleration: Acceleration2D;
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

function inferMotion(prev: TrackState | undefined, observation: SpatialObservation, velocity: Velocity2D): MotionState {
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

export class MultiObjectTracker {
  private tracks = new Map<string, TrackState>();
  private readonly reasoner = new SpatialReasoner();
  private readonly options: TrackerOptions;

  constructor(options: Partial<TrackerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * @param detections   Raw detections from inference provider
   * @param timestamp    Frame timestamp (ms)
   * @param operatorVel  Operator's own velocity vector (m/s) — used for relative TTC.
   *                     Default {vx:0, vy:0} (stationary operator).
   */
  update(
    detections: DetectedObject[],
    timestamp = Date.now(),
    operatorVel: Velocity2D = { vx: 0, vy: 0 }
  ): TrackedObject[] {
    const observations  = this.reasoner.normalize(detections);
    const next          = new Map<string, TrackState>();
    const usedTrackIds  = new Set<string>();

    observations.forEach((observation, index) => {
      const previous  = this.findBestTrack(observation, usedTrackIds);
      const trackId   = previous?.trackId ?? createId('trk', timestamp);
      usedTrackIds.add(trackId);

      const dt = previous ? Math.max(0.05, (timestamp - previous.lastSeenAt) / 1000) : 0.3;

      // ── Velocity ──────────────────────────────────────────────────────────
      const velocity: Velocity2D = previous
        ? {
            vx: (observation.centroid.x - previous.centroid.x) / dt,
            vy: (observation.centroid.y - previous.centroid.y) / dt,
          }
        : { vx: 0, vy: 0 };

      const speedMps = Math.round(Math.hypot(velocity.vx, velocity.vy) * 6 * 10) / 10;

      // ── T5: Acceleration (low-pass filtered) ──────────────────────────────
      let acceleration: Acceleration2D = { ax: 0, ay: 0 };
      if (previous) {
        const rawAx = clampAccel((velocity.vx - previous.velocity.vx) / dt);
        const rawAy = clampAccel((velocity.vy - previous.velocity.vy) / dt);
        acceleration = {
          ax: ACCEL_ALPHA * rawAx + (1 - ACCEL_ALPHA) * previous.acceleration.ax,
          ay: ACCEL_ALPHA * rawAy + (1 - ACCEL_ALPHA) * previous.acceleration.ay,
        };
      }

      const motion     = inferMotion(previous, observation, velocity);
      const firstSeenAt = previous?.firstSeenAt ?? timestamp;

      // ── T4: 2D Vector TTC ─────────────────────────────────────────────────
      // Convert normalised centroid delta to metric space using estimated distance.
      // Scale factor: 1 normalised unit ≈ estimatedDistanceM metres (rough but consistent).
      const scale       = observation.estimatedDistanceM;
      const relPosMetric: GeoPoint = {
        x: (observation.centroid.x - 0.5) * scale,
        y: (observation.centroid.y - 0.7) * scale,
      };
      // Object velocity in metric (normalised/s × scale → m/s proxy)
      const objVelMetric = { vx: velocity.vx * scale, vy: velocity.vy * scale };
      const relVelMetric = { vx: objVelMetric.vx - operatorVel.vx, vy: objVelMetric.vy - operatorVel.vy };

      const ttcResult   = computeVectorTTC(relPosMetric, relVelMetric);

      next.set(trackId, {
        ...observation.object,
        bbox:               observation.bbox,
        id:                 trackId,
        trackId,
        signature:          `${observation.object.type}:${index}`,
        firstSeenAt,
        lastSeenAt:         timestamp,
        ageMs:              timestamp - firstSeenAt,
        framesSeen:         (previous?.framesSeen ?? 0) + 1,
        framesMissing:      0,
        prevPosition:       previous?.position,
        centroid:           observation.centroid,
        velocity,
        speedMps,
        estimatedDistanceM: observation.estimatedDistanceM,
        // T4: store full TTCResult data via timeToImpactSec
        timeToImpactSec:    ttcResult.ttcSec,
        // Extended fields consumed by risk pipeline
        _ttcResult:         ttcResult,
        motion,
        stale:              false,
        acceleration,
      } as TrackState & { _ttcResult: typeof ttcResult });
    });

    for (const track of this.tracks.values()) {
      if (usedTrackIds.has(track.trackId)) continue;
      if (track.framesMissing >= this.options.maxMissingFrames) continue;
      next.set(track.trackId, {
        ...track,
        framesMissing: track.framesMissing + 1,
        lastSeenAt:    timestamp,
        stale:         true,
        motion:        track.motion === 'approaching' ? 'approaching' : 'static',
      });
    }

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

  private findBestTrack(observation: SpatialObservation, usedTrackIds: Set<string>): TrackState | undefined {
    let best:      TrackState | undefined;
    let bestScore  = Number.POSITIVE_INFINITY;

    for (const track of this.tracks.values()) {
      if (usedTrackIds.has(track.trackId))              continue;
      if (track.type !== observation.object.type)        continue;
      const distance = euclidean(track.centroid, observation.centroid);
      const score    = distance + track.framesMissing * 0.04;
      if (score < bestScore && distance <= this.options.associationRadius) {
        best      = track;
        bestScore = score;
      }
    }

    return best;
  }
}
