import { TrackedObject } from '@/core/types';

export interface PredictedTrack {
  trackId: string;
  x: number;
  y: number;
  estimatedDistanceM: number;
  horizonSec: number;
}

export class PhysicsPredictor {
  predict(tracks: TrackedObject[], horizonSec = 2): PredictedTrack[] {
    return tracks.map(track => {
      const x = Math.max(0, Math.min(1, track.centroid.x + track.velocity.vx * horizonSec));
      const y = Math.max(0, Math.min(1, track.centroid.y + track.velocity.vy * horizonSec));
      const closing = track.motion === 'approaching' ? track.speedMps * horizonSec : 0;
      return {
        trackId: track.trackId,
        x,
        y,
        estimatedDistanceM: Math.max(0.5, Math.round((track.estimatedDistanceM - closing) * 10) / 10),
        horizonSec,
      };
    });
  }
}
