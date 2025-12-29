import { describe, expect, it, vi } from 'vitest';
import type {
  ChangeHint,
  SqliteBatchResult,
  SqliteDbPort,
  SqliteStatement,
  SqliteValue,
} from '@mo/eventstore-web';
import { ProjectionOrderings } from '@mo/eventstore-core';
import {
  ProjectionRuntime,
  type ProjectionProcessor,
} from '../../src/platform/derived-state/runtime/ProjectionRuntime';

type EventRow = {
  commit_sequence: number;
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload_encrypted: Uint8Array;
  keyring_update: Uint8Array | null;
  version: number;
  occurred_at: number;
  actor_id: string | null;
  causation_id: string | null;
  correlation_id: string | null;
  epoch: number | null;
};

type ProjectionMetaRow = {
  projection_id: string;
  ordering: string;
  last_global_seq: number;
  last_pending_commit_seq: number;
  last_commit_sequence: number;
  phase: string;
  updated_at: number;
};

class FakeDb implements SqliteDbPort {
  private readonly events: EventRow[] = [];
  private readonly projectionMeta = new Map<string, ProjectionMetaRow>();
  private readonly syncMap = new Map<string, number>();

  constructor(seed?: {
    events?: ReadonlyArray<EventRow>;
    syncMap?: Map<string, number>;
  }) {
    if (seed?.events) {
      this.events.push(...seed.events);
    }
    if (seed?.syncMap) {
      seed.syncMap.forEach((value, key) => this.syncMap.set(key, value));
    }
  }

  async query<T extends Readonly<Record<string, unknown>>>(
    sql: string,
    params: ReadonlyArray<SqliteValue> = []
  ): Promise<ReadonlyArray<T>> {
    const normalized = sql.trim().toUpperCase();
    if (normalized.includes('FROM PROJECTION_META')) {
      if (normalized.includes('WHERE PROJECTION_ID')) {
        const [projectionId] = params as [string];
        const row = this.projectionMeta.get(projectionId);
        return row ? ([row] as unknown as T[]) : ([] as unknown as T[]);
      }
      return [...this.projectionMeta.values()] as unknown as T[];
    }

    if (normalized.includes('FROM EVENTS E')) {
      const [aggregateType, sinceGlobal, sincePending, limit] = params as [
        string,
        number,
        number,
        number,
      ];
      const rows = this.events
        .filter((row) => row.aggregate_type === aggregateType)
        .map((row) => ({
          ...row,
          global_seq: this.syncMap.get(row.id) ?? null,
        }))
        .filter((row) => {
          if (row.global_seq !== null) {
            return row.global_seq > Number(sinceGlobal);
          }
          return row.commit_sequence > Number(sincePending);
        })
        .sort((a, b) => {
          const aSynced = a.global_seq !== null ? 0 : 1;
          const bSynced = b.global_seq !== null ? 0 : 1;
          if (aSynced !== bSynced) return aSynced - bSynced;
          if (a.global_seq !== null && b.global_seq !== null) {
            return a.global_seq - b.global_seq;
          }
          return a.commit_sequence - b.commit_sequence;
        })
        .slice(0, Number(limit));
      return rows as unknown as T[];
    }

    if (normalized.includes('FROM EVENTS')) {
      const [aggregateType, sinceCommit, limit] = params as [
        string,
        number,
        number,
      ];
      const rows = this.events
        .filter(
          (row) =>
            row.aggregate_type === aggregateType &&
            row.commit_sequence > Number(sinceCommit)
        )
        .sort((a, b) => a.commit_sequence - b.commit_sequence)
        .slice(0, Number(limit));
      return rows as unknown as T[];
    }

    throw new Error(`Unhandled query: ${sql}`);
  }

  async execute(
    sql: string,
    params: ReadonlyArray<SqliteValue> = []
  ): Promise<void> {
    const normalized = sql.trim().toUpperCase();
    if (normalized.startsWith('INSERT INTO PROJECTION_META')) {
      const [
        projectionId,
        ordering,
        lastGlobal,
        lastPending,
        lastCommit,
        phase,
        updatedAt,
      ] = params as [string, string, number, number, number, string, number];
      this.projectionMeta.set(projectionId, {
        projection_id: projectionId,
        ordering,
        last_global_seq: Number(lastGlobal),
        last_pending_commit_seq: Number(lastPending),
        last_commit_sequence: Number(lastCommit),
        phase,
        updated_at: Number(updatedAt),
      });
      return;
    }
    if (normalized.startsWith('DELETE FROM PROJECTION_META')) {
      const [projectionId] = params as [string];
      this.projectionMeta.delete(projectionId);
      return;
    }
    throw new Error(`Unhandled execute: ${sql}`);
  }

  async batch(
    _statements: ReadonlyArray<SqliteStatement>
  ): Promise<ReadonlyArray<SqliteBatchResult>> {
    throw new Error('Not implemented in FakeDb');
  }

  subscribeToTables(
    _tables: ReadonlyArray<string>,
    _listener: () => void
  ): () => void {
    return () => undefined;
  }

  subscribeToChanges?(
    _tables: ReadonlyArray<string>,
    _listener: (hints: ReadonlyArray<ChangeHint>) => void
  ): () => void {
    return () => undefined;
  }
}

describe('ProjectionRuntime', () => {
  it('processes commit-ordered events in sequence', async () => {
    const db = new FakeDb({
      events: [
        {
          commit_sequence: 1,
          id: 'e1',
          aggregate_type: 'goal',
          aggregate_id: 'g1',
          event_type: 'GoalCreated',
          payload_encrypted: new Uint8Array([1]),
          keyring_update: null,
          version: 1,
          occurred_at: 1,
          actor_id: 'a',
          causation_id: null,
          correlation_id: null,
          epoch: null,
        },
        {
          commit_sequence: 2,
          id: 'e2',
          aggregate_type: 'goal',
          aggregate_id: 'g1',
          event_type: 'GoalRefined',
          payload_encrypted: new Uint8Array([2]),
          keyring_update: null,
          version: 2,
          occurred_at: 2,
          actor_id: 'a',
          causation_id: null,
          correlation_id: null,
          epoch: null,
        },
      ],
    });

    const applied: string[] = [];
    const processor: ProjectionProcessor = {
      projectionId: 'goal_projection',
      ordering: ProjectionOrderings.commitSequence,
      bootstrap: vi.fn(async () => undefined),
      applyEvent: vi.fn(async (input) => {
        const { event } = input;
        applied.push(event.id);
        return { changed: true };
      }),
      reset: vi.fn(async () => undefined),
    };

    const runtime = new ProjectionRuntime(db, 'goal', processor);
    await runtime.start();

    expect(applied).toEqual(['e1', 'e2']);
    expect(processor.bootstrap).toHaveBeenCalledTimes(1);
  });

  it('processes effectiveTotalOrder with synced events first', async () => {
    const syncMap = new Map<string, number>([
      ['e1', 10],
      ['e3', 11],
    ]);
    const db = new FakeDb({
      events: [
        {
          commit_sequence: 1,
          id: 'e1',
          aggregate_type: 'goal',
          aggregate_id: 'g1',
          event_type: 'GoalCreated',
          payload_encrypted: new Uint8Array([1]),
          keyring_update: null,
          version: 1,
          occurred_at: 1,
          actor_id: 'a',
          causation_id: null,
          correlation_id: null,
          epoch: null,
        },
        {
          commit_sequence: 2,
          id: 'e2',
          aggregate_type: 'goal',
          aggregate_id: 'g1',
          event_type: 'GoalRefined',
          payload_encrypted: new Uint8Array([2]),
          keyring_update: null,
          version: 2,
          occurred_at: 2,
          actor_id: 'a',
          causation_id: null,
          correlation_id: null,
          epoch: null,
        },
        {
          commit_sequence: 3,
          id: 'e3',
          aggregate_type: 'goal',
          aggregate_id: 'g1',
          event_type: 'GoalArchived',
          payload_encrypted: new Uint8Array([3]),
          keyring_update: null,
          version: 3,
          occurred_at: 3,
          actor_id: 'a',
          causation_id: null,
          correlation_id: null,
          epoch: null,
        },
      ],
      syncMap,
    });

    const applied: string[] = [];
    const processor: ProjectionProcessor = {
      projectionId: 'goal_projection',
      ordering: ProjectionOrderings.effectiveTotalOrder,
      bootstrap: vi.fn(async () => undefined),
      applyEvent: vi.fn(async (input) => {
        const { event } = input;
        applied.push(event.id);
        return { changed: true };
      }),
      reset: vi.fn(async () => undefined),
    };

    const runtime = new ProjectionRuntime(db, 'goal', processor);
    await runtime.start();

    expect(applied).toEqual(['e1', 'e3', 'e2']);
  });

  it('rebuilds from scratch on rebase', async () => {
    const db = new FakeDb({
      events: [
        {
          commit_sequence: 1,
          id: 'e1',
          aggregate_type: 'goal',
          aggregate_id: 'g1',
          event_type: 'GoalCreated',
          payload_encrypted: new Uint8Array([1]),
          keyring_update: null,
          version: 1,
          occurred_at: 1,
          actor_id: 'a',
          causation_id: null,
          correlation_id: null,
          epoch: null,
        },
      ],
    });

    const applied: string[] = [];
    const processor: ProjectionProcessor = {
      projectionId: 'goal_projection',
      ordering: ProjectionOrderings.effectiveTotalOrder,
      bootstrap: vi.fn(async () => undefined),
      applyEvent: vi.fn(async (input) => {
        const { event } = input;
        applied.push(event.id);
        return { changed: true };
      }),
      reset: vi.fn(async () => undefined),
    };

    const runtime = new ProjectionRuntime(db, 'goal', processor);
    await runtime.start();
    await runtime.onRebaseRequired();

    expect(processor.reset).toHaveBeenCalledTimes(1);
    expect(applied).toEqual(['e1', 'e1']);
  });
});
