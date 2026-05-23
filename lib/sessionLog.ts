import { TrackedObject, ObjectType, Position, Distance, MotionState } from './types';

export interface SessionSighting {
  key: string;
  type: ObjectType;
  position: Position;
  distance: Distance;
  motion: MotionState;
  firstSeenAt: number;
  lastSeenAt: number;
  frames: number;
}

function sightingKey(obj: TrackedObject): string {
  // Use trackId so distinct physical objects are never merged,
  // even when they share the same type and position.
  return `${obj.type}|${obj.trackId}`;
}

/** Merge current frame detections into the running session log. */
export function updateSessionLog(
  log: SessionSighting[],
  objects: TrackedObject[],
  now: number
): SessionSighting[] {
  const map = new Map(log.map(s => [s.key, s]));

  for (const obj of objects) {
    const key = sightingKey(obj);
    const existing = map.get(key);
    if (existing) {
      map.set(key, {
        ...existing,
        distance: obj.distance,
        motion: obj.motion,
        lastSeenAt: now,
        frames: existing.frames + 1,
      });
    } else {
      map.set(key, {
        key,
        type: obj.type,
        position: obj.position,
        distance: obj.distance,
        motion: obj.motion,
        firstSeenAt: now,
        lastSeenAt: now,
        frames: 1,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function clearSessionLog(): SessionSighting[] {
  return [];
}
