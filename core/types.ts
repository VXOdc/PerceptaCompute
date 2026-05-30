export type ObjectType = 'person' | 'bike' | 'car' | 'obstacle' | 'unknown';
export type Position = 'left' | 'center' | 'right';
export type Distance = 'near' | 'mid' | 'far';
export type MotionState = 'static' | 'approaching' | 'leaving' | 'crossing';
export type RiskLevel = 'SAFE' | 'WARNING' | 'DANGER';
export type Direction = 'LEFT' | 'RIGHT' | 'FRONT' | 'NONE';
export type ConfidenceBand = 'low' | 'medium' | 'high';

export type NormalizedBBox = [x: number, y: number, width: number, height: number];

export interface GeoPoint {
  x: number;
  y: number;
}

export interface Velocity2D {
  vx: number;
  vy: number;
}

export interface OperationalContext {
  siteId: string;
  zoneId: string;
  cameraId: string;
  operatorId?: string;
  mode: 'run' | 'walk' | 'cycle' | 'vehicle' | 'industrial';
}

export interface DetectedObject {
  type: ObjectType;
  position: Position;
  distance: Distance;
  motion: MotionState;
  confidence?: number;
  bbox?: NormalizedBBox;
  label?: string;
}

export interface TrackedObject extends DetectedObject {
  id: string;
  trackId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  ageMs: number;
  framesSeen: number;
  framesMissing: number;
  prevPosition?: Position;
  centroid: GeoPoint;
  velocity: Velocity2D;
  speedMps: number;
  estimatedDistanceM: number;
  timeToImpactSec: number | null;
  stale: boolean;
}

export interface RiskFactor {
  code: string;
  label: string;
  score: number;
  objectId?: string;
}

export interface RiskAssessment {
  risk: RiskLevel;
  direction: Direction;
  confidence: number;
  score: number;
  horizonSec: number;
  factors: RiskFactor[];
  primaryObjectId?: string;
}

export interface DetectionResponse {
  objects: DetectedObject[];
  model?: string;
  inferenceMs?: number;
}

export interface FrameTelemetry {
  frameId: string;
  capturedAt: number;
  context: OperationalContext;
  imageBytes?: number;
  width?: number;
  height?: number;
  quality?: number;
}

export interface PipelineState {
  frame: FrameTelemetry;
  detections: DetectedObject[];
  tracks: TrackedObject[];
  risk: RiskAssessment;
}
