'use client';

import { RiskAssessment } from '@/lib/types';

interface RiskPanelProps {
  assessment: RiskAssessment;
  showConfidence?: boolean;
}

const RISK_CONFIG = {
  SAFE: {
    label: 'Clear',
    sublabel: 'Path is safe',
    color: 'var(--green)',
    bg: 'var(--green-lo)',
    border: 'rgba(74,222,128,0.25)',
  },
  WARNING: {
    label: 'Alert',
    sublabel: 'Object nearby',
    color: 'var(--orange)',
    bg: 'rgba(251,146,60,0.08)',
    border: 'rgba(251,146,60,0.25)',
  },
  DANGER: {
    label: 'Danger',
    sublabel: 'Collision risk',
    color: 'var(--red)',
    bg: 'var(--red-lo)',
    border: 'rgba(248,113,113,0.3)',
  },
};

const DIR_LABELS: Record<string, string> = {
  LEFT:  'Left',
  RIGHT: 'Right',
  FRONT: 'Ahead',
  NONE:  'None',
};

export default function RiskPanel({ assessment, showConfidence = true }: RiskPanelProps) {
  const config = RISK_CONFIG[assessment.risk];
  const pct = Math.round(assessment.confidence * 100);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-4 py-6">
      <div
        className="flex flex-col items-center justify-center gap-1"
        style={{
          width: 120,
          height: 120,
          background: config.bg,
          border: `1px solid ${config.border}`,
          borderRadius: 6,
        }}
      >
        <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20, color: config.color, letterSpacing: '0.02em' }}>
          {config.label}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: config.color, opacity: 0.7 }}>
          {config.sublabel}
        </span>
      </div>

      <div className="flex flex-col items-center gap-1">
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Direction
        </span>
        <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 18, color: config.color }}>
          {DIR_LABELS[assessment.direction] ?? assessment.direction}
        </span>
      </div>

      {showConfidence && (
        <div className="w-full max-w-[200px]">
          <div className="flex justify-between mb-2">
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>Confidence</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: config.color }}>{pct}%</span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: config.color,
                borderRadius: 2,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {assessment.factors.length > 0 && (
        <div className="w-full max-w-[260px] flex flex-col gap-1">
          {assessment.factors.slice(0, 3).map(factor => (
            <div
              key={`${factor.code}-${factor.objectId ?? 'global'}`}
              className="flex items-center justify-between gap-3"
              style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}
            >
              <span className="truncate">{factor.label}</span>
              <span style={{ color: factor.score >= 0 ? config.color : 'var(--green)' }}>
                {Math.round(factor.score)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
