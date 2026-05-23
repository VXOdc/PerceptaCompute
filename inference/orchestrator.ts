import { OperationalContext, PipelineState } from '@/core/types';
import { InMemoryEventBus } from '@/event-bus/in-memory-event-bus';
import { MetricsRegistry } from '@/observability/metrics';
import { OperatorAlerting } from '@/operator-os/alerting';
import { RiskPipeline } from '@/risk-engine/risk-pipeline';
import { OperationalMemory } from '@/storage/operational-memory';
import { TelemetryIngestion } from '@/telemetry/ingestion';
import { MultiObjectTracker } from '@/temporal/multi-object-tracker';
import { VisionProvider } from './vision-provider';

export class InferenceOrchestrator {
  private readonly ingestion = new TelemetryIngestion();
  private readonly tracker = new MultiObjectTracker();
  private readonly risk = new RiskPipeline();
  private readonly alerts = new OperatorAlerting();
  private readonly memory = new OperationalMemory();

  constructor(
    private readonly provider: VisionProvider,
    private readonly bus = new InMemoryEventBus(),
    private readonly metrics = new MetricsRegistry()
  ) {}

  async processFrame(input: {
    imageBase64: string;
    context: OperationalContext;
    sensitivity?: string;
    width?: number;
    height?: number;
    quality?: number;
  }): Promise<PipelineState> {
    const frame = this.ingestion.frame(input);
    await this.bus.publish('frame.captured', input.context, frame, frame.capturedAt);

    const started = Date.now();
    const detection = await this.provider.detect(input.imageBase64);
    const inferenceMs = detection.inferenceMs ?? Date.now() - started;
    this.metrics.record('inference.latency', inferenceMs, 'ms', { model: detection.model ?? this.provider.model });
    await this.bus.publish('inference.completed', input.context, {
      frameId: frame.frameId,
      objects: detection.objects,
      model: detection.model ?? this.provider.model,
      inferenceMs,
    });

    const tracks = this.tracker.update(detection.objects, frame.capturedAt + inferenceMs);
    await this.bus.publish('tracks.updated', input.context, { frameId: frame.frameId, tracks });

    const assessment = this.risk.assess(tracks, input.context, input.sensitivity);
    await this.bus.publish('risk.assessed', input.context, { frameId: frame.frameId, assessment });

    const state: PipelineState = { frame, detections: detection.objects, tracks, risk: assessment };
    this.memory.remember(state);

    const alert = this.alerts.evaluate(assessment, input.context);
    if (alert) {
      await this.bus.publish('operator.alerted', input.context, {
        frameId: frame.frameId,
        alertId: alert.id,
        assessment,
        message: alert.message,
      });
    }

    if (assessment.risk === 'DANGER') {
      await this.bus.publish('incident.recorded', input.context, { incidentId: `inc_${frame.frameId}`, state });
    }

    return state;
  }

  reset(): void {
    this.tracker.reset();
  }
}
