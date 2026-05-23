import { PipelineState, RiskAssessment, TrackedObject } from '@/core/types';

export interface MemorySnapshot {
  activeTracks: TrackedObject[];
  recentRisks: RiskAssessment[];
  incidents: PipelineState[];
}

export class OperationalMemory {
  private activeTracks = new Map<string, TrackedObject>();
  private recentRisks: RiskAssessment[] = [];
  private incidents: PipelineState[] = [];

  remember(state: PipelineState): void {
    for (const track of state.tracks) {
      if (track.framesMissing > 8) this.activeTracks.delete(track.trackId);
      else this.activeTracks.set(track.trackId, track);
    }

    this.recentRisks.push(state.risk);
    if (this.recentRisks.length > 120) this.recentRisks.shift();

    if (state.risk.risk === 'DANGER') {
      this.incidents.push(state);
      if (this.incidents.length > 50) this.incidents.shift();
    }
  }

  snapshot(): MemorySnapshot {
    return {
      activeTracks: Array.from(this.activeTracks.values()),
      recentRisks: [...this.recentRisks],
      incidents: [...this.incidents],
    };
  }

  reset(): void {
    this.activeTracks.clear();
    this.recentRisks = [];
    this.incidents = [];
  }
}
