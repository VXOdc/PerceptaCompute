'use client';

import { TrackedObject } from '@/lib/types';

interface ObjectListProps {
  objects: TrackedObject[];
  isActive: boolean;
}

const MOTION_STYLE: Record<string, { color: string; label: string }> = {
  approaching: { color: 'var(--red)',    label: 'Approaching' },
  static:      { color: 'var(--text-dim)', label: 'Static' },
  leaving:     { color: 'var(--green)',  label: 'Leaving' },
  crossing:    { color: 'var(--orange)', label: 'Crossing' },
};

const DISTANCE_STYLE: Record<string, { color: string; pct: number }> = {
  near: { color: 'var(--red)',    pct: 100 },
  mid:  { color: 'var(--orange)', pct: 55 },
  far:  { color: 'var(--green)',  pct: 25 },
};

export default function ObjectList({ objects, isActive }: ObjectListProps) {
  if (!isActive) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
        Waiting for camera…
      </div>
    );
  }

  if (objects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-dim)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Clear path
        </span>
        <span style={{ fontSize: 12 }}>Nothing in the current frame.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {objects.map(obj => {
        const motion = MOTION_STYLE[obj.motion] ?? MOTION_STYLE.static;
        const dist   = DISTANCE_STYLE[obj.distance] ?? DISTANCE_STYLE.far;
        return (
          <div
            key={obj.id}
            className="px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14, color: 'var(--text-hi)', textTransform: 'capitalize' }}>
                  {obj.type}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                  {obj.position}
                </span>
              </div>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: motion.color,
                  padding: '2px 8px',
                  border: `1px solid ${motion.color}`,
                  borderRadius: 3,
                  opacity: 0.85,
                }}
              >
                {motion.label}
              </span>
            </div>
            <div className="flex items-center justify-between mb-2" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: dist.color }}>
              <span>{obj.estimatedDistanceM ? `${obj.estimatedDistanceM}m estimated` : `${obj.distance} distance`}</span>
              {obj.timeToImpactSec !== null && obj.timeToImpactSec !== undefined && (
                <span>{obj.timeToImpactSec}s TTI</span>
              )}
            </div>
            <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${dist.pct}%`,
                  background: dist.color,
                  borderRadius: 2,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
