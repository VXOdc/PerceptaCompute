/**
 * ring-buffer.ts — T7: O(1) Fixed-Size Circular Buffer
 *
 * Replaces all Array.shift() patterns in InMemoryEventBus,
 * MetricsRegistry, and OperationalMemory. Every push is O(1)
 * with no element re-indexing and no incremental heap growth.
 */
export class RingBuffer<T> {
  private readonly buf: Array<T | undefined>;
  private head = 0;
  private size = 0;

  constructor(private readonly capacity: number) {
    this.buf = new Array(capacity);
  }

  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  toArray(): T[] {
    if (this.size < this.capacity) {
      return this.buf.slice(0, this.size) as T[];
    }
    return [
      ...(this.buf.slice(this.head) as T[]),
      ...(this.buf.slice(0, this.head) as T[]),
    ];
  }

  get length(): number { return this.size; }

  last(): T | undefined {
    if (this.size === 0) return undefined;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.buf[idx] as T;
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }
}
