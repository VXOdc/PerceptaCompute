import { SessionSighting } from './sessionLog';

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportToCSV(sightings: SessionSighting[]): void {
  if (sightings.length === 0) return;

  const headers = [
    'Type',
    'Position',
    'Distance',
    'Motion',
    'First Seen',
    'Last Seen',
    'Frames',
  ];

  const rows = sightings.map(sighting => [
    sighting.type,
    sighting.position,
    sighting.distance,
    sighting.motion,
    new Date(sighting.firstSeenAt).toISOString(),
    new Date(sighting.lastSeenAt).toISOString(),
    sighting.frames,
  ]);

  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map(row => row.map(csvEscape).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `percepta-session-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
