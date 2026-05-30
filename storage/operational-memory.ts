/**
 * operational-memory.ts — T7: RingBuffer replaces Array.shift().
 */
import { RingBuffer } from '@/core/ring-buffer';
import { PipelineState, RiskAssessment, TrackedObject } from '@/core/types';

export interface MemorySnapshot {
  activeTracks: TrackedObject[];
  recentRisks: RiskAssessment[];
  incidents: PipelineState[];
}

export class OperationalMemory {
  private activeTracks = new Map<string, TrackedObject>();
  private recentRisks  = new RingBuffer<RiskAssessment>(120);
  private incidents    = new RingBuffer<PipelineState>(50);

  remember(state: PipelineState): void {
    for (const track of state.tracks) {
      if (track.framesMissing > 8) this.activeTracks.delete(track.trackId);
      else this.activeTracks.set(track.trackId, track);
    }

    this.recentRisks.push(state.risk);

    if (state.risk.risk === 'DANGER') {
      this.incidents.push(state);
    }
  }

  snapshot(): MemorySnapshot {
    return {
      activeTracks: Array.from(this.activeTracks.values()),
      recentRisks:  this.recentRisks.toArray(),
      incidents:    this.incidents.toArray(),
    };
  }

  reset(): void {
    this.activeTracks.clear();
    this.recentRisks.clear();
    this.incidents.clear();
  }
}
