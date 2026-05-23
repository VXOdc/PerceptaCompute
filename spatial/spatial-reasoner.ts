import { DetectedObject, TrackedObject } from '@/core/types';
import { bboxCentroid, directionFromCentroid, estimateBBox, estimateDistanceMeters } from './geometry';

export interface SpatialObservation {
  object: DetectedObject;
  bbox: [number, number, number, number];
  centroid: { x: number; y: number };
  estimatedDistanceM: number;
  operatorDirection: 'LEFT' | 'RIGHT' | 'FRONT';
}

export class SpatialReasoner {
  normalize(objects: DetectedObject[]): SpatialObservation[] {
    return objects.slice(0, 12).map((object, index) => {
      const bbox = estimateBBox(object, index);
      const centroid = bboxCentroid(bbox);
      return {
        object: { ...object, bbox },
        bbox,
        centroid,
        estimatedDistanceM: estimateDistanceMeters(object.distance, bbox),
        operatorDirection: directionFromCentroid(centroid),
      };
    });
  }

  corridorOccupancy(tracks: TrackedObject[]): number {
    const weighted = tracks.reduce((sum, track) => {
      const centerBias = 1 - Math.min(1, Math.abs(track.centroid.x - 0.5) / 0.5);
      const proximity = Math.max(0, 1 - track.estimatedDistanceM / 18);
      return sum + centerBias * proximity;
    }, 0);
    return Math.min(1, weighted / 3);
  }
}
