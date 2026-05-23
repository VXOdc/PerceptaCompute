/**
 * metrics.ts — T7: RingBuffer replaces Array.shift() in sample buckets.
 */
import { RingBuffer } from '@/core/ring-buffer';

export interface MetricSample {
  key: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}

export class MetricsRegistry {
  private samples = new Map<string, RingBuffer<MetricSample>>();
  private readonly bucketSize: number;

  constructor(bucketSize = 500) {
    this.bucketSize = bucketSize;
  }

  record(key: string, value: number, unit = 'count', tags?: Record<string, string>, timestamp = Date.now()): void {
    if (!this.samples.has(key)) {
      this.samples.set(key, new RingBuffer<MetricSample>(this.bucketSize));
    }
    this.samples.get(key)!.push({ key, value, unit, timestamp, tags });
  }

  increment(key: string, tags?: Record<string, string>): void {
    this.record(key, 1, 'count', tags);
  }

  latest(key: string): MetricSample | undefined {
    return this.samples.get(key)?.last();
  }

  percentile(key: string, pct: number): number | null {
    const buf = this.samples.get(key);
    if (!buf || buf.length === 0) return null;
    const values = buf.toArray().map(s => s.value).sort((a, b) => a - b);
    const index = Math.min(values.length - 1, Math.max(0, Math.ceil((pct / 100) * values.length) - 1));
    return values[index];
  }

  snapshot(): Record<string, { latest: number; p50: number | null; p95: number | null; count: number; unit: string }> {
    const out: Record<string, { latest: number; p50: number | null; p95: number | null; count: number; unit: string }> = {};
    for (const [key, buf] of this.samples.entries()) {
      const last = buf.last();
      if (!last) continue;
      out[key] = {
        latest: last.value,
        p50: this.percentile(key, 50),
        p95: this.percentile(key, 95),
        count: buf.length,
        unit: last.unit,
      };
    }
    return out;
  }
}
