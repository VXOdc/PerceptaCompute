export type ObjectType = 'person' | 'bike' | 'car' | 'obstacle' | 'unknown';
export type Position = 'left' | 'center' | 'right';
export type Distance = 'near' | 'mid' | 'far';
export type MotionState = 'static' | 'approaching' | 'leaving';
export type RiskLevel = 'SAFE' | 'WARNING' | 'DANGER';
export type Direction = 'LEFT' | 'RIGHT' | 'FRONT' | 'NONE';

export interface DetectedObject {
  type: ObjectType;
  position: Position;
  distance: Distance;
  motion: MotionState;
}

export interface TrackedObject extends DetectedObject {
  id: string;
  prevPosition?: Position;
}

export interface RiskAssessment {
  risk: RiskLevel;
  direction: Direction;
  confidence: number;
}

export interface DetectionResponse {
  objects: DetectedObject[];
}
