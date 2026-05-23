import { RiskAssessment } from './types';
import { SessionSighting } from './sessionLog';

export interface Award {
  id: string;
  title: string;
  subtitle: string;
  icon: string;           // emoji
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  earnedAt: number;
}

interface AwardSpec {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  tier: Award['tier'];
  check: (state: AwardCheckState) => boolean;
}

interface AwardCheckState {
  frameCount: number;
  sessionLog: SessionSighting[];
  risk: RiskAssessment;
  dangerCount: number;
  sessionStartedAt: number | null;
}

const SPECS: AwardSpec[] = [
  // Frame count milestones
  {
    id: 'frames_100',
    title: '100 Frames',
    subtitle: 'First 100 frames analyzed',
    icon: '🔍',
    tier: 'bronze',
    check: s => s.frameCount >= 100,
  },
  {
    id: 'frames_500',
    title: 'Half Thousand',
    subtitle: '500 frames scanned',
    icon: '📡',
    tier: 'silver',
    check: s => s.frameCount >= 500,
  },
  {
    id: 'frames_1000',
    title: 'Kiloframe',
    subtitle: '1,000 frames analyzed',
    icon: '⚡',
    tier: 'gold',
    check: s => s.frameCount >= 1000,
  },
  {
    id: 'frames_1517',
    title: '1517',
    subtitle: '1,517 frames — the reformation milestone',
    icon: '🏆',
    tier: 'platinum',
    check: s => s.frameCount >= 1517,
  },
  {
    id: 'frames_5000',
    title: 'Five Thousand',
    subtitle: '5,000 frames analyzed',
    icon: '🛰️',
    tier: 'platinum',
    check: s => s.frameCount >= 5000,
  },

  // Object detection milestones
  {
    id: 'objects_1',
    title: 'First Contact',
    subtitle: 'First object detected',
    icon: '👁️',
    tier: 'bronze',
    check: s => s.sessionLog.length >= 1,
  },
  {
    id: 'objects_10',
    title: 'Object Hunter',
    subtitle: '10 unique objects logged',
    icon: '🎯',
    tier: 'silver',
    check: s => s.sessionLog.length >= 10,
  },
  {
    id: 'objects_25',
    title: 'Field Analyst',
    subtitle: '25 unique objects logged',
    icon: '📊',
    tier: 'gold',
    check: s => s.sessionLog.length >= 25,
  },

  // Risk/danger milestones
  {
    id: 'first_warning',
    title: 'On Guard',
    subtitle: 'First WARNING risk detected',
    icon: '⚠️',
    tier: 'bronze',
    check: s => s.risk.risk === 'WARNING' || s.risk.risk === 'DANGER',
  },
  {
    id: 'first_danger',
    title: 'Hazard Detected',
    subtitle: 'First DANGER alert triggered',
    icon: '🚨',
    tier: 'silver',
    check: s => s.dangerCount >= 1,
  },
  {
    id: 'danger_5',
    title: 'Risk Veteran',
    subtitle: '5 DANGER events survived',
    icon: '🛡️',
    tier: 'gold',
    check: s => s.dangerCount >= 5,
  },

  // Session duration milestones
  {
    id: 'session_2m',
    title: 'Sustained Scan',
    subtitle: '2 minutes of continuous monitoring',
    icon: '⏱️',
    tier: 'bronze',
    check: s => s.sessionStartedAt !== null && Date.now() - s.sessionStartedAt >= 2 * 60 * 1000,
  },
  {
    id: 'session_10m',
    title: 'Long Haul',
    subtitle: '10 minutes of continuous monitoring',
    icon: '🏃',
    tier: 'gold',
    check: s => s.sessionStartedAt !== null && Date.now() - s.sessionStartedAt >= 10 * 60 * 1000,
  },
];

export class AwardEngine {
  private earned = new Set<string>();

  /** Check current state and return any newly earned awards. */
  check(state: AwardCheckState): Award[] {
    const newAwards: Award[] = [];
    const now = Date.now();

    for (const spec of SPECS) {
      if (this.earned.has(spec.id)) continue;
      if (spec.check(state)) {
        this.earned.add(spec.id);
        newAwards.push({
          id: spec.id,
          title: spec.title,
          subtitle: spec.subtitle,
          icon: spec.icon,
          tier: spec.tier,
          earnedAt: now,
        });
      }
    }

    return newAwards;
  }

  reset(): void {
    this.earned.clear();
  }

  get earnedIds(): string[] {
    return Array.from(this.earned);
  }
}
