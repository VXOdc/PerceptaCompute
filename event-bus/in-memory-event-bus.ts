import { createId } from '@/core/ids';
import { OperationalContext } from '@/core/types';
import { EventHandler, EventName, EventOf, PerceptaEvent } from './events';

export interface EventBus {
  publish<TName extends EventName>(
    name: TName,
    context: OperationalContext,
    payload: EventOf<TName>['payload'],
    timestamp?: number
  ): Promise<EventOf<TName>>;
  subscribe<TName extends EventName>(name: TName, handler: EventHandler<EventOf<TName>>): () => void;
  drain(): PerceptaEvent[];
}

export class InMemoryEventBus implements EventBus {
  private handlers = new Map<EventName, Set<EventHandler>>();
  private log: PerceptaEvent[] = [];

  constructor(private readonly maxLogSize = 1_000) {}

  async publish<TName extends EventName>(
    name: TName,
    context: OperationalContext,
    payload: EventOf<TName>['payload'],
    timestamp = Date.now()
  ): Promise<EventOf<TName>> {
    const event = {
      id: createId('evt', timestamp),
      name,
      timestamp,
      context,
      payload,
    } as EventOf<TName>;

    this.log.push(event);
    if (this.log.length > this.maxLogSize) this.log.shift();

    const handlers = this.handlers.get(name);
    if (handlers) {
      await Promise.all(Array.from(handlers).map(handler => handler(event)));
    }

    return event;
  }

  subscribe<TName extends EventName>(name: TName, handler: EventHandler<EventOf<TName>>): () => void {
    const handlers = this.handlers.get(name) ?? new Set<EventHandler>();
    handlers.add(handler as EventHandler);
    this.handlers.set(name, handlers);

    return () => {
      handlers.delete(handler as EventHandler);
      if (handlers.size === 0) this.handlers.delete(name);
    };
  }

  drain(): PerceptaEvent[] {
    return [...this.log];
  }
}
