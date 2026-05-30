import { CameraCalibration } from '@/spatial/geometry';
import { DetectedObject, TrackedObject } from './types';
import { MultiObjectTracker } from '@/temporal/multi-object-tracker';

export class SpatialTracker {
  private readonly tracker: MultiObjectTracker;

  constructor(calibration?: CameraCalibration) {
    this.tracker = new MultiObjectTracker(
      {
        maxMissingFrames:  5,
        associationRadius: 0.24,
        maxTracks:         16,
      },
      calibration
    );
  }

  update(current: DetectedObject[], timestamp = Date.now()): TrackedObject[] {
    return this.tracker.update(current, timestamp);
  }

  reset(): void {
    this.tracker.reset();
  }
}

const trackerInstance = new SpatialTracker();
export const updateTracker = (objs: DetectedObject[]) => trackerInstance.update(objs);
export const resetTracker  = () => trackerInstance.reset();
