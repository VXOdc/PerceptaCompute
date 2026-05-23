export interface FrameSchedulerOptions {
  minIntervalMs: number;
  maxIntervalMs: number;
  targetLatencyMs: number;
}

export interface SchedulerDecision {
  intervalMs: number;
  shouldDropFrame: boolean;
  reason: string;
}

export class AdaptiveFrameScheduler {
  private intervalMs: number;
  private consecutiveSlowFrames = 0;

  constructor(private readonly options: FrameSchedulerOptions) {
    this.intervalMs = options.minIntervalMs;
  }

  observe(lastInferenceMs: number, queueDepth: number): SchedulerDecision {
    const overloaded = lastInferenceMs > this.options.targetLatencyMs || queueDepth > 1;
    if (overloaded) {
      this.consecutiveSlowFrames += 1;
      this.intervalMs = Math.min(this.options.maxIntervalMs, Math.round(this.intervalMs * 1.25));
    } else {
      this.consecutiveSlowFrames = 0;
      this.intervalMs = Math.max(this.options.minIntervalMs, Math.round(this.intervalMs * 0.92));
    }

    return {
      intervalMs: this.intervalMs,
      shouldDropFrame: this.consecutiveSlowFrames >= 3,
      reason: overloaded ? 'backpressure' : 'healthy',
    };
  }
}
