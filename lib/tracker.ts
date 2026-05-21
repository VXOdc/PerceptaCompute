import { DetectedObject, TrackedObject, MotionState } from './types';

let previousObjects: DetectedObject[] = [];

const POSITION_ORDER: Record<string, number> = { left: 0, center: 1, right: 2 };
const DISTANCE_ORDER: Record<string, number> = { far: 0, mid: 1, near: 2 };

/**
 * Compares current frame objects against previous frame.
 * Refines motion direction based on positional/distance deltas.
 */
export function updateTracker(current: DetectedObject[]): TrackedObject[] {
  const tracked: TrackedObject[] = current.slice(0, 7).map((obj, i) => {
    const prev = previousObjects[i];
    let motion: MotionState = obj.motion;

    if (prev) {
      const dPos = POSITION_ORDER[obj.position] - POSITION_ORDER[prev.position];
      const dDist = DISTANCE_ORDER[obj.distance] - DISTANCE_ORDER[prev.distance];

      if (dDist > 0) motion = 'approaching';
      else if (dDist < 0) motion = 'leaving';
      else if (dPos !== 0) motion = 'static'; // lateral movement, not a collision vector
    }

    return {
      ...obj,
      motion,
      id: `${obj.type}-${obj.position}-${i}`,
      prevPosition: prev?.position,
    };
  });

  previousObjects = current;
  return tracked;
}

export function resetTracker(): void {
  previousObjects = [];
}
