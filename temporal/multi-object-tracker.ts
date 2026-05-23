import { createId } from '@/core/ids';
import { DetectedObject, MotionState, TrackedObject, Velocity2D } from '@/core/types';
import { euclidean } from '@/spatial/geometry';
import { SpatialObservation, SpatialReasoner } from '@/spatial/spatial-reasoner';

interface TrackState extends TrackedObject {
  signature: string;
}

export interface TrackerOptions {
  maxMissingFrames: number;
  associationRadius: number;
  maxTracks: number;
}

const DEFAULT_OPTIONS: TrackerOptions = {
  maxMissingFrames: 5,
  associationRadius: 0.22,
  maxTracks: 32,
};

const DISTANCE_RANK = { far: 0, mid: 1, near: 2 };

function inferMotion(prev: TrackState | undefined, observation: SpatialObservation, velocity: Velocity2D): MotionState {
  if (!prev) return observation.object.motion;
  const distanceDelta = DISTANCE_RANK[observation.object.distance] - DISTANCE_RANK[prev.distance];
  if (distanceDelta > 0 || velocity.vy > 0.18) return 'approaching';
  if (distanceDelta < 0 || velocity.vy < -0.18) return 'leaving';
  if (Math.abs(velocity.vx) > 0.2) return 'crossing';
  return observation.object.motion === 'approaching' ? 'approaching' : 'static';
}

function timeToImpact(distanceM: number, speedMps: number, motion: MotionState): number | null {
  if (motion !== 'approaching' || speedMps <= 0.15) return null;
  return Math.round((distanceM / speedMps) * 10) / 10;
}

export class MultiObjectTracker {
  private tracks = new Map<string, TrackState>();
  private readonly reasoner = new SpatialReasoner();
  private readonly options: TrackerOptions;

  constructor(options: Partial<TrackerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  update(detections: DetectedObject[], timestamp = Date.now()): TrackedObject[] {
    const observations = this.reasoner.normalize(detections);
    const next = new Map<string, TrackState>();
    const usedTrackIds = new Set<string>();

    observations.forEach((observation, index) => {
      const previous = this.findBestTrack(observation, usedTrackIds);
      const trackId = previous?.trackId ?? createId('trk', timestamp);
      usedTrackIds.add(trackId);

      const dt = previous ? Math.max(0.05, (timestamp - previous.lastSeenAt) / 1000) : 0.3;
      const velocity = previous
        ? {
            vx: (observation.centroid.x - previous.centroid.x) / dt,
            vy: (observation.centroid.y - previous.centroid.y) / dt,
          }
        : { vx: 0, vy: 0 };
      const speedMps = Math.round(Math.hypot(velocity.vx, velocity.vy) * 6 * 10) / 10;
      const motion = inferMotion(previous, observation, velocity);
      const firstSeenAt = previous?.firstSeenAt ?? timestamp;

      next.set(trackId, {
        ...observation.object,
        bbox: observation.bbox,
        id: trackId,
        trackId,
        signature: `${observation.object.type}:${index}`,
        firstSeenAt,
        lastSeenAt: timestamp,
        ageMs: timestamp - firstSeenAt,
        framesSeen: (previous?.framesSeen ?? 0) + 1,
        framesMissing: 0,
        prevPosition: previous?.position,
        centroid: observation.centroid,
        velocity,
        speedMps,
        estimatedDistanceM: observation.estimatedDistanceM,
        timeToImpactSec: timeToImpact(observation.estimatedDistanceM, speedMps, motion),
        motion,
        stale: false,
      });
    });

    for (const track of this.tracks.values()) {
      if (usedTrackIds.has(track.trackId)) continue;
      if (track.framesMissing >= this.options.maxMissingFrames) continue;
      next.set(track.trackId, {
        ...track,
        framesMissing: track.framesMissing + 1,
        lastSeenAt: timestamp,
        stale: true,
        motion: track.motion === 'approaching' ? 'approaching' : 'static',
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
    let best: TrackState | undefined;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const track of this.tracks.values()) {
      if (usedTrackIds.has(track.trackId)) continue;
      if (track.type !== observation.object.type) continue;
      const distance = euclidean(track.centroid, observation.centroid);
      const score = distance + track.framesMissing * 0.04;
      if (score < bestScore && distance <= this.options.associationRadius) {
        best = track;
        bestScore = score;
      }
    }

    return best;
  }
}
