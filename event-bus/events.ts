import {
  DetectedObject,
  FrameTelemetry,
  OperationalContext,
  PipelineState,
  RiskAssessment,
  TrackedObject,
} from '@/core/types';

export type EventName =
  | 'frame.captured'
  | 'inference.completed'
  | 'tracks.updated'
  | 'risk.assessed'
  | 'operator.alerted'
  | 'incident.recorded'
  | 'telemetry.metric';

export interface BaseEvent<TName extends EventName, TPayload> {
  id: string;
  name: TName;
  timestamp: number;
  context: OperationalContext;
  payload: TPayload;
}

export type PerceptaEvent =
  | BaseEvent<'frame.captured', FrameTelemetry>
  | BaseEvent<'inference.completed', { frameId: string; objects: DetectedObject[]; model: string; inferenceMs: number }>
  | BaseEvent<'tracks.updated', { frameId: string; tracks: TrackedObject[] }>
  | BaseEvent<'risk.assessed', { frameId: string; assessment: RiskAssessment }>
  | BaseEvent<'operator.alerted', { frameId: string; alertId: string; assessment: RiskAssessment; message: string }>
  | BaseEvent<'incident.recorded', { incidentId: string; state: PipelineState }>
  | BaseEvent<'telemetry.metric', { key: string; value: number; unit: string; tags?: Record<string, string> }>;

export type EventHandler<TEvent extends PerceptaEvent = PerceptaEvent> = (event: TEvent) => void | Promise<void>;

export type EventOf<TName extends EventName> = Extract<PerceptaEvent, { name: TName }>;
