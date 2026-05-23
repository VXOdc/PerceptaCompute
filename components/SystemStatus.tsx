'use client';

interface SystemStatusProps {
  isActive: boolean;
  frameCount: number;
  latency: number;
  mode: string;
  sensitivity: string;
  sessionObjectCount: number;
}

function Row({ label, value, active, accent }: { label: string; value: string; active: boolean; accent?: boolean }) {
  const dotColor = accent
    ? 'var(--amber)'
    : active
      ? 'var(--green)'
      : 'var(--text-dim)';

  return (
    <div
      className="flex items-center justify-between py-2"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span
          className="rounded-full"
          style={{ width: 6, height: 6, background: dotColor }}
        />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-hi)' }}>{value}</span>
      </div>
    </div>
  );
}

export default function SystemStatus({
  isActive,
  frameCount,
  latency,
  mode,
  sensitivity,
  sessionObjectCount,
}: SystemStatusProps) {
  return (
    <div className="flex flex-col">
      <Row label="Vision" value={isActive ? 'Active' : 'Offline'} active={isActive} />
      <Row label="Risk engine" value={isActive ? 'Active' : 'Offline'} active={isActive} />
      <Row label="Mode" value={mode} active={isActive} accent />
      <Row label="Sensitivity" value={sensitivity} active={isActive} accent />
      <Row label="Frames analyzed" value={String(frameCount)} active={isActive} />
      <Row label="Session objects" value={String(sessionObjectCount)} active={sessionObjectCount > 0} />
      <Row label="Latency" value={latency > 0 ? `${latency} ms` : '—'} active={isActive} />
    </div>
  );
}
