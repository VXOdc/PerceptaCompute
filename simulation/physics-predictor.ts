/**
 * physics-predictor.ts — T5: Second-Order Kinematic Prediction
 *
 * Replaces constant-velocity linear extrapolation (x = x₀ + v·t) with
 * the SUVAT equation (x = x₀ + v₀t + ½at²).
 *
 * A vehicle braking or a cyclist swerving diverges from linear prediction
 * by ½at² — at 0.5s horizon and 3 m/s² deceleration this is already 0.375 m.
 * Second-order kinematics halves prediction error for accelerating objects.
 *
 * Acceleration is clamped to ±8 m/s² to prevent sensor noise from producing
 * physically impossible trajectories.
 */
import { TrackedObject } from '@/core/types';
import { Acceleration2D } from '@/temporal/multi-object-tracker';

const MAX_ACCEL_MPS2 = 8.0;

export interface PredictedTrack {
  trackId:            string;
  x:                  number;
  y:                  number;
  estimatedDistanceM: number;
  horizonSec:         number;
}

function getAcceleration(track: TrackedObject): Acceleration2D {
  // Acceleration is attached by the tracker (T5 extension) as a non-standard field.
  // Graceful fallback to zero for tracks without it.
  const ext = track as TrackedObject & { acceleration?: Acceleration2D };
  return ext.acceleration ?? { ax: 0, ay: 0 };
}

export class PhysicsPredictor {
  predict(tracks: TrackedObject[], horizonSec = 2): PredictedTrack[] {
    return tracks.map(track => {
      const { ax, ay } = getAcceleration(track);
      const clampedAx  = Math.max(-MAX_ACCEL_MPS2, Math.min(MAX_ACCEL_MPS2, ax));
      const clampedAy  = Math.max(-MAX_ACCEL_MPS2, Math.min(MAX_ACCEL_MPS2, ay));

      // SUVAT: x(t) = x₀ + v₀t + ½at²
      const x = Math.max(0, Math.min(1,
        track.centroid.x + track.velocity.vx * horizonSec + 0.5 * clampedAx * horizonSec * horizonSec
      ));
      const y = Math.max(0, Math.min(1,
        track.centroid.y + track.velocity.vy * horizonSec + 0.5 * clampedAy * horizonSec * horizonSec
      ));

      // 1D closing distance: d(t) = d₀ - v_close·t + ½·a_close·t²
      // a_close is the acceleration component along the approach axis (vy proxy)
      const closingVel   = track.motion === 'approaching' ? track.speedMps : 0;
      const closingAccel = track.motion === 'approaching' ? clampedAy : 0;
      const predictedDist = Math.max(0.5,
        Math.round(
          (track.estimatedDistanceM - closingVel * horizonSec + 0.5 * closingAccel * horizonSec * horizonSec) * 10
        ) / 10
      );

      return {
        trackId:            track.trackId,
        x,
        y,
        estimatedDistanceM: predictedDist,
        horizonSec,
      };
    });
  }
}
