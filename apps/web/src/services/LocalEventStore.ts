import {
  ConcurrencyError,
  EncryptedEvent,
  EventFilter,
  IEventStore,
} from '@mo/application';

const STORAGE_KEY = 'mo-local-events';

type StoredEvent = {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: string;
  version: number;
  occurredAt: number;
  sequence: number;
};

type PersistedState = {
  events: StoredEvent[];
  globalSequence: number;
};

const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

const fromBase64 = (value: string): Uint8Array =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

const loadState = (): PersistedState => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { events: [], globalSequence: 0 };
  try {
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      events: parsed.events ?? [],
      globalSequence: parsed.globalSequence ?? 0,
    };
  } catch {
    return { events: [], globalSequence: 0 };
  }
};

const persistState = (state: PersistedState): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

/**
 * LocalStorage-backed event store that enforces monotonic versions and sequences.
 */
export class LocalEventStore implements IEventStore {
  private events: StoredEvent[];
  private globalSequence: number;

  constructor() {
    const state = loadState();
    this.events = state.events;
    this.globalSequence = state.globalSequence;
  }

  private persist(): void {
    persistState({ events: this.events, globalSequence: this.globalSequence });
  }

  async append(aggregateId: string, events: EncryptedEvent[]): Promise<void> {
    if (events.length === 0) return;
    const current = this.events.filter((e) => e.aggregateId === aggregateId);
    const expectedStart = current.length + 1;

    events.forEach((event, idx) => {
      const expectedVersion = expectedStart + idx;
      if (event.version !== expectedVersion) {
        throw new ConcurrencyError(
          `Expected version ${expectedVersion} but received ${event.version} for ${aggregateId}`
        );
      }
    });

    const stored = events.map((event) => {
      this.globalSequence += 1;
      return {
        id: event.id,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: toBase64(event.payload),
        version: event.version,
        occurredAt: event.occurredAt,
        sequence: this.globalSequence,
      };
    });

    this.events = [...this.events, ...stored];
    this.persist();
  }

  async getEvents(
    aggregateId: string,
    fromVersion = 1
  ): Promise<EncryptedEvent[]> {
    return this.events
      .filter((e) => e.aggregateId === aggregateId && e.version >= fromVersion)
      .sort((a, b) => a.version - b.version)
      .map((e) => ({
        id: e.id,
        aggregateId: e.aggregateId,
        eventType: e.eventType,
        payload: fromBase64(e.payload),
        version: e.version,
        occurredAt: e.occurredAt,
        sequence: e.sequence,
      }));
  }

  async getAllEvents(filter?: EventFilter): Promise<EncryptedEvent[]> {
    return this.events
      .filter((e) => {
        if (filter?.aggregateId && e.aggregateId !== filter.aggregateId)
          return false;
        if (filter?.eventType && e.eventType !== filter.eventType) return false;
        if (filter?.since && e.sequence <= filter.since) return false;
        return true;
      })
      .sort((a, b) => a.sequence - b.sequence)
      .map((e) => ({
        id: e.id,
        aggregateId: e.aggregateId,
        eventType: e.eventType,
        payload: fromBase64(e.payload),
        version: e.version,
        occurredAt: e.occurredAt,
        sequence: e.sequence,
      }));
  }
}
