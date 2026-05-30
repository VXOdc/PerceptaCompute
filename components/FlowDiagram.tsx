const NODES = [
  { id: 'camera', label: 'Camera', sub: 'getUserMedia' },
  { id: 'neurovision', label: 'NeuroVision', sub: 'Mistral Pixtral' },
  { id: 'tracker', label: 'Tracker', sub: 'Motion delta' },
  { id: 'risk', label: 'Risk Engine', sub: 'Rule-based' },
  { id: 'output', label: 'Alert Output', sub: 'UI / HW' },
];

export default function FlowDiagram() {
  return (
    <div className="flex items-center gap-0 overflow-x-auto py-2">
      {NODES.map((node, i) => (
        <div key={node.id} className="flex items-center shrink-0">
          <div className="flex flex-col items-center gap-1 px-4">
            <div className="px-4 py-2 rounded-lg border border-border bg-panel text-center min-w-[96px]">
              <div className="text-sm font-mono text-primary">{node.label}</div>
              <div className="text-xs font-mono text-muted mt-0.5">{node.sub}</div>
            </div>
          </div>

          {i < NODES.length - 1 && (
            <div className="flex items-center shrink-0">
              <div className="w-6 h-px bg-border" />
              <svg width="8" height="10" viewBox="0 0 8 10" className="text-muted shrink-0">
                <path d="M0 0 L8 5 L0 10 Z" fill="currentColor" />
              </svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
