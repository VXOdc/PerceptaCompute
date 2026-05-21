'use client';

interface SystemStatusProps {
  isActive: boolean;
  frameCount: number;
  latency: number;
}

interface StatusRowProps {
  label: string;
  value: string;
  active: boolean;
}

function StatusRow({ label, value, active }: StatusRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-xs font-mono text-muted uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-safe' : 'bg-danger'}`}
          style={active ? { boxShadow: '0 0 6px #22C55E' } : undefined}
        />
        <span className="text-xs font-mono text-primary">{value}</span>
      </div>
    </div>
  );
}

export default function SystemStatus({ isActive, frameCount, latency }: SystemStatusProps) {
  return (
    <div className="flex flex-col gap-0">
      <StatusRow label="NeuroVision" value={isActive ? 'ACTIVE' : 'OFFLINE'} active={isActive} />
      <StatusRow label="PhysicsOne" value={isActive ? 'ACTIVE' : 'OFFLINE'} active={isActive} />
      <StatusRow label="EdgeNode" value={isActive ? 'CONNECTED' : 'DISCONNECTED'} active={isActive} />
      <StatusRow label="Frames" value={String(frameCount)} active={isActive} />
      <StatusRow label="Latency" value={latency > 0 ? `${latency}ms` : '--'} active={isActive} />
    </div>
  );
}
