import { PipelineState } from '@/core/types';

export interface ReplayFrame {
  offsetMs: number;
  state: PipelineState;
}

export class IncidentReplay {
  private frames: ReplayFrame[] = [];
  private startedAt: number | null = null;

  append(state: PipelineState): void {
    if (this.startedAt === null) this.startedAt = state.frame.capturedAt;
    this.frames.push({ offsetMs: state.frame.capturedAt - this.startedAt, state });
    if (this.frames.length > 900) this.frames.shift();
  }

  export(): ReplayFrame[] {
    return [...this.frames];
  }

  riskWindow(beforeMs: number, afterMs: number, incidentFrameId: string): ReplayFrame[] {
    const target = this.frames.find(frame => frame.state.frame.frameId === incidentFrameId);
    if (!target) return [];
    return this.frames.filter(frame => frame.offsetMs >= target.offsetMs - beforeMs && frame.offsetMs <= target.offsetMs + afterMs);
  }
}
