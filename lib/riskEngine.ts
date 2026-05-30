import { OperationalContext, RiskAssessment, TrackedObject } from './types';
import { RiskPipeline } from '@/risk-engine/risk-pipeline';

const pipeline = new RiskPipeline();

export function computeRisk(
  objects: TrackedObject[],
  sensitivity: string = 'med',
  context: Partial<OperationalContext> = { mode: 'walk' }
): RiskAssessment {
  return pipeline.assess(objects, context, sensitivity);
}
