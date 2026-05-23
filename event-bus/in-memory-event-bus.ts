/**
 * in-memory-event-bus.ts — T6 + T7
 *
 * T6: Two-tier dispatch — sync (critical path) vs deferred (side effects).
 *     publish() fires sync handlers inline, then schedules deferred handlers
 *     via queueMicrotask so they never block the pipeline.
 *     All telemetry/logging subscribers should use mode:'deferred'.
 *     Only the operator.alerted handler should use mode:'sync'.
 *
 * T7: Event log uses O(1) RingBuffer instead of Array.shift().
 */
import { createId } from '@/core/ids';
import { RingBuffer } from '@/core/ring-buffer';
import { OperationalContext } from '@/core/types';
import { EventHandler, EventName, EventOf, PerceptaEvent } from './events';

export type HandlerMode = 'sync' | 'deferred';

type HandlerEntry = { handler: EventHandler; mode: HandlerMode };

export interface EventBus {
  publish<TName extends EventName>(
    name: TName,
    context: OperationalContext,
    payload: EventOf<TName>['payload'],
    timestamp?: number
  ): EventOf<TName>;
  subscribe<TName extends EventName>(
    name: TName,
    handler: EventHandler<EventOf<TName>>,
    mode?: HandlerMode
  ): () => void;
  drain(): PerceptaEvent[];
}

export class InMemoryEventBus implements EventBus {
  private handlers = new Map<EventName, Set<HandlerEntry>>();
  private log: RingBuffer<PerceptaEvent>;

  constructor(maxLogSize = 1_000) {
    this.log = new RingBuffer<PerceptaEvent>(maxLogSize);
  }

  /**
   * Publish an event.
   * Sync handlers execute inline (critical path — no await).
   * Deferred handlers are scheduled via queueMicrotask (off hot path).
   * Returns the event synchronously — callers should NOT await this.
   */
  publish<TName extends EventName>(
    name: TName,
    context: OperationalContext,
    payload: EventOf<TName>['payload'],
    timestamp = Date.now()
  ): EventOf<TName> {
    const event = {
      id: createId('evt', timestamp),
      name,
      timestamp,
      context,
      payload,
    } as EventOf<TName>;

    this.log.push(event);

    const entries = this.handlers.get(name);
    if (!entries) return event;

    const entriesSnapshot = Array.from(entries);

    // Fire sync handlers inline — these are on the critical path
    for (const { handler, mode } of entriesSnapshot) {
      if (mode === 'sync') {
        try { handler(event); } catch (e) { console.error('[EventBus] sync handler error', e); }
      }
    }

    // Schedule deferred handlers off the hot path
    const deferred = entriesSnapshot.filter(e => e.mode === 'deferred');
    if (deferred.length > 0) {
      queueMicrotask(() => {
        for (const { handler } of deferred) {
          try { handler(event); } catch (e) { console.error('[EventBus] deferred handler error', e); }
        }
      });
    }

    return event;
  }

  subscribe<TName extends EventName>(
    name: TName,
    handler: EventHandler<EventOf<TName>>,
    mode: HandlerMode = 'sync'
  ): () => void {
    const entries = this.handlers.get(name) ?? new Set<HandlerEntry>();
    const entry: HandlerEntry = { handler: handler as EventHandler, mode };
    entries.add(entry);
    this.handlers.set(name, entries);

    return () => {
      entries.delete(entry);
      if (entries.size === 0) this.handlers.delete(name);
    };
  }

  drain(): PerceptaEvent[] {
    return this.log.toArray();
  }
}
