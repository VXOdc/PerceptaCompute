'use client';

import { TrackedObject } from '@/lib/types';

interface ObjectListProps {
  objects: TrackedObject[];
}

const MOTION_COLOR: Record<string, string> = {
  approaching: 'text-danger',
  static: 'text-muted',
  leaving: 'text-safe',
};

const DISTANCE_COLOR: Record<string, string> = {
  near: 'text-danger',
  mid: 'text-warning',
  far: 'text-muted',
};

export default function ObjectList({ objects }: ObjectListProps) {
  return (
    <div className="flex flex-col gap-0 h-full">
      <div className="grid grid-cols-4 gap-4 px-4 py-2 border-b border-border">
        <span className="text-xs text-muted font-mono uppercase tracking-wider">Type</span>
        <span className="text-xs text-muted font-mono uppercase tracking-wider">Position</span>
        <span className="text-xs text-muted font-mono uppercase tracking-wider">Distance</span>
        <span className="text-xs text-muted font-mono uppercase tracking-wider">Motion</span>
      </div>

      {objects.length === 0 ? (
        <div className="flex items-center justify-center flex-1">
          <span className="text-sm text-muted font-mono">NO OBJECTS DETECTED</span>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border overflow-y-auto flex-1">
          {objects.map((obj) => (
            <div
              key={obj.id}
              className="grid grid-cols-4 gap-4 px-4 py-3 text-sm font-mono transition-opacity duration-300"
            >
              <span className="text-primary capitalize">{obj.type}</span>
              <span className="text-primary capitalize">{obj.position}</span>
              <span className={`capitalize ${DISTANCE_COLOR[obj.distance]}`}>
                {obj.distance}
              </span>
              <span className={`capitalize ${MOTION_COLOR[obj.motion]}`}>
                {obj.motion}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
