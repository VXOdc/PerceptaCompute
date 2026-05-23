'use client';

import { SessionSighting } from '@/lib/sessionLog';

interface SessionLogProps {
  sightings: SessionSighting[];
  isActive: boolean;
}

const DISTANCE_COLOR: Record<string, string> = {
  near: 'var(--red)',
  mid:  'var(--orange)',
  far:  'var(--green)',
};

const MOTION_LABEL: Record<string, string> = {
  approaching: 'Approaching',
  static:      'Static',
  leaving:     'Leaving',
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function SessionLog({ sightings, isActive }: SessionLogProps) {
  if (!isActive) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-dim)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.08em' }}>Camera offline</span>
        <span style={{ fontSize: 12 }}>Start the camera to begin logging detections.</span>
      </div>
    );
  }

  if (sightings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-dim)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          No objects logged yet
        </span>
        <span style={{ fontSize: 12, textAlign: 'center', maxWidth: 220 }}>
          Objects appear here as soon as the vision model reports them.
        </span>
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {sightings.map(s => {
        const age = now - s.lastSeenAt;
        const isRecent = age < 2000;
        return (
          <div
            key={s.key}
            className="px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full shrink-0"
                    style={{
                      width: 6,
                      height: 6,
                      background: isRecent ? 'var(--amber)' : 'var(--border-hi)',
                    }}
                  />
                  <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13, color: 'var(--text-hi)', textTransform: 'capitalize' }}>
                    {s.type}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                    {s.position}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                  {MOTION_LABEL[s.motion] ?? s.motion} · {s.frames} frame{s.frames !== 1 ? 's' : ''}
                </div>
              </div>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: isRecent ? 'var(--amber)' : 'var(--text-dim)',
                  padding: '2px 6px',
                  border: `1px solid ${isRecent ? 'rgba(245,158,11,0.25)' : 'var(--border)'}`,
                  borderRadius: 3,
                }}
              >
                {isRecent ? 'In view' : `${Math.round(age / 1000)}s ago`}
              </span>
            </div>
            <div className="flex items-center justify-between" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
              <span style={{ color: DISTANCE_COLOR[s.distance] ?? 'var(--text)' }}>{s.distance}</span>
              <span>{formatTime(s.firstSeenAt)} – {formatTime(s.lastSeenAt)} ({formatDuration(s.lastSeenAt - s.firstSeenAt)})</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
