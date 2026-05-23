export interface MetricSample {
  key: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}

export class MetricsRegistry {
  private samples = new Map<string, MetricSample[]>();

  record(key: string, value: number, unit = 'count', tags?: Record<string, string>, timestamp = Date.now()): void {
    const bucket = this.samples.get(key) ?? [];
    bucket.push({ key, value, unit, timestamp, tags });
    if (bucket.length > 500) bucket.shift();
    this.samples.set(key, bucket);
  }

  increment(key: string, tags?: Record<string, string>): void {
    this.record(key, 1, 'count', tags);
  }

  latest(key: string): MetricSample | undefined {
    const bucket = this.samples.get(key);
    return bucket?.[bucket.length - 1];
  }

  percentile(key: string, percentile: number): number | null {
    const values = (this.samples.get(key) ?? []).map(sample => sample.value).sort((a, b) => a - b);
    if (values.length === 0) return null;
    const index = Math.min(values.length - 1, Math.max(0, Math.ceil((percentile / 100) * values.length) - 1));
    return values[index];
  }

  snapshot(): Record<string, { latest: number; p50: number | null; p95: number | null; count: number; unit: string }> {
    const out: Record<string, { latest: number; p50: number | null; p95: number | null; count: number; unit: string }> = {};
    for (const [key, samples] of this.samples.entries()) {
      const latest = samples[samples.length - 1];
      out[key] = {
        latest: latest.value,
        p50: this.percentile(key, 50),
        p95: this.percentile(key, 95),
        count: samples.length,
        unit: latest.unit,
      };
    }
    return out;
  }
}
