/**
 * kernel.ts — T10: PerceptaKernel
 *
 * Composes only PAL-clean modules: MultiObjectTracker → RiskPipeline → PhysicsPredictor.
 * Zero browser imports. Can be compiled to WASM via AssemblyScript or wrapped
 * in a React Native module with an OpenCV frame provider.
 *
 * All browser-specific code (Canvas, Web Audio, fetch, requestAnimationFrame)
 * remains exclusively in components/ and lib/.
 *
 * @pure — imports only from core/ and PAL-clean modules.
 */
import { DetectedObject, OperationalContext, PipelineState, RiskAssessment, TrackedObject, Velocity2D } from './types';
import { PerceptaPlatform, BrowserPlatform } from './platform';
import { MultiObjectTracker, TrackerOptions } from '@/temporal/multi-object-tracker';
import { RiskPipeline } from '@/risk-engine/risk-pipeline';
import { PhysicsPredictor } from '@/simulation/physics-predictor';

export interface KernelOptions {
  tracker?:    Partial<TrackerOptions>;
  platform?:   PerceptaPlatform;
}

export interface KernelResult {
  tracks:     TrackedObject[];
  risk:       RiskAssessment;
  predictions: ReturnType<PhysicsPredictor['predict']>;
  processedAt: number;
}

export class PerceptaKernel {
  private readonly tracker:   MultiObjectTracker;
  private readonly risk:      RiskPipeline;
  private readonly predictor: PhysicsPredictor;
  private readonly platform:  PerceptaPlatform;

  constructor(options: KernelOptions = {}) {
    this.tracker   = new MultiObjectTracker(options.tracker ?? {});
    this.risk      = new RiskPipeline();
    this.predictor = new PhysicsPredictor();
    this.platform  = options.platform ?? BrowserPlatform;
  }

  /**
   * Process one frame's worth of detections through the full kernel pipeline.
   * No I/O — pure computation.
   */
  process(
    detections:   DetectedObject[],
    context:      Partial<OperationalContext>,
    sensitivity   = 'med',
    operatorVel:  Velocity2D = { vx: 0, vy: 0 },
    timestamp     = this.platform.now()
  ): KernelResult {
    const tracks      = this.tracker.update(detections, timestamp, operatorVel);
    const risk        = this.risk.assess(tracks, context, sensitivity);
    const predictions = this.predictor.predict(tracks);
    return { tracks, risk, predictions, processedAt: timestamp };
  }

  reset(): void {
    this.tracker.reset();
  }
}
