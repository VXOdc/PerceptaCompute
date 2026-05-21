'use client';

import { RiskAssessment } from '@/lib/types';

interface RiskPanelProps {
  assessment: RiskAssessment;
}

const RISK_CONFIG = {
  SAFE: {
    label: 'SAFE',
    color: 'text-safe',
    glow: 'shadow-safe',
    bg: 'bg-safe/10',
    border: 'border-safe/30',
    ring: '#22C55E',
  },
  WARNING: {
    label: 'WARNING',
    color: 'text-warning',
    glow: 'shadow-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    ring: '#FACC15',
  },
  DANGER: {
    label: 'DANGER',
    color: 'text-danger',
    glow: 'shadow-danger',
    bg: 'bg-danger/10',
    border: 'border-danger/30',
    ring: '#EF4444',
  },
};

const DIRECTION_ARROW: Record<string, string> = {
  LEFT: '←',
  RIGHT: '→',
  FRONT: '↑',
  NONE: '·',
};

export default function RiskPanel({ assessment }: RiskPanelProps) {
  const config = RISK_CONFIG[assessment.risk];
  const confidencePct = Math.round(assessment.confidence * 100);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-4 py-6">
      {/* Primary risk indicator */}
      <div
        className={`w-40 h-40 rounded-lg border-2 ${config.bg} ${config.border} flex items-center justify-center transition-all duration-300`}
        style={{ boxShadow: `0 0 32px ${config.ring}26` }}
      >
        <span className={`text-2xl font-mono font-bold tracking-widest ${config.color}`}>
          {config.label}
        </span>
      </div>

      {/* Direction */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-muted font-mono uppercase tracking-widest">Direction</span>
        <span className={`text-4xl font-mono ${config.color} transition-all duration-200`}>
          {DIRECTION_ARROW[assessment.direction]}
        </span>
        <span className="text-sm font-mono text-primary">{assessment.direction}</span>
      </div>

      {/* Confidence bar */}
      <div className="w-full">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-muted font-mono uppercase tracking-wider">Confidence</span>
          <span className={`text-xs font-mono ${config.color}`}>{confidencePct}%</span>
        </div>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-300 rounded-full"
            style={{
              width: `${confidencePct}%`,
              backgroundColor: config.ring,
            }}
          />
        </div>
      </div>
    </div>
  );
}
