import type {
  AggregateType,
  CommitCursor,
  EffectiveCursor,
  EventRecord,
  ProjectionOrdering,
} from '@mo/eventstore-core';
import { advanceEffectiveCursor, ProjectionOrderings, ZERO_EFFECTIVE_CURSOR } from '@mo/eventstore-core';
import type { SqliteDbPort, SqliteTableName } from '@mo/eventstore-web';
import { ProjectionTaskRunner } from '../../../projection/ProjectionTaskRunner';
import type { ProjectionPhase, ProjectionStatus } from '../types';
import { ProjectionPhases } from '../types';
import type { ProjectionMetaRecord } from '../stores/ProjectionMetaStore';
import { ProjectionMetaStore } from '../stores/ProjectionMetaStore';
import type { WorkSchedulerPolicy } from './WorkSchedulerPolicy';
import { DEFAULT_WORK_SCHEDULER_POLICY, yieldToEventLoop } from './WorkSchedulerPolicy';

export type ProjectionProcessor = Readonly<{
  projectionId: string;
  ordering: ProjectionOrdering;
  bootstrap(input: ProjectionBootstrap): Promise<void>;
  applyEvent(input: ProjectionApplyInput): Promise<ProjectionApplyResult>;
  onBatchComplete?(input: ProjectionBatchInfo): Promise<void>;
  reset(): Promise<void>;
}>;

export type ProjectionBootstrap = Readonly<{
  lastEffectiveCursor: EffectiveCursor;
  lastCommitSequence: number;
}>;

export type ProjectionApplyInput = Readonly<{
  event: EventRecord;
  cursorAfter: EffectiveCursor;
  lastCommitSequence: number;
}>;

export type ProjectionApplyResult = Readonly<{
  changed: boolean;
}>;

export type ProjectionBatchInfo = Readonly<{
  processed: number;
  changed: boolean;
  lastEffectiveCursor: EffectiveCursor;
  lastCommitSequence: number;
}>;

type CursorState = {
  lastEffectiveCursor: EffectiveCursor;
  lastCommitSequence: number;
};

export class ProjectionRuntime {
  private readonly runner = new ProjectionTaskRunner('ProjectionRuntime', 200);
  private started = false;
  private readonly metaStore: ProjectionMetaStore;
  private readonly readyPromise: Promise<void>;
  private resolveReady: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  private pendingRebuild = false;
  private cursorState: CursorState = {
    lastEffectiveCursor: ZERO_EFFECTIVE_CURSOR,
    lastCommitSequence: 0,
  };

  constructor(
    private readonly db: SqliteDbPort,
    private readonly aggregateType: AggregateType,
    private readonly processor: ProjectionProcessor,
    private readonly scheduler: WorkSchedulerPolicy = DEFAULT_WORK_SCHEDULER_POLICY
  ) {
    this.metaStore = new ProjectionMetaStore(db);
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.loadOrInitializeMeta();
    await this.processor.bootstrap({
      lastEffectiveCursor: this.cursorState.lastEffectiveCursor,
      lastCommitSequence: this.cursorState.lastCommitSequence,
    });
    this.subscribeToTables();
    await this.runProcessingLoop();
    this.resolveReady?.();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.started = false;
  }

  async whenReady(): Promise<void> {
    await this.readyPromise;
  }

  async flush(): Promise<void> {
    await this.runner.run(async () => {
      await this.runProcessingLoop();
    });
  }

  async onRebaseRequired(): Promise<void> {
    this.pendingRebuild = true;
    await this.runner.run(async () => {
      await this.runProcessingLoop();
    });
  }

  async getStatuses(): Promise<ReadonlyArray<ProjectionStatus>> {
    const records = await this.metaStore.list();
    return records.map((record) => this.toStatus(record));
  }

  private async loadOrInitializeMeta(): Promise<void> {
    const existing = await this.metaStore.get(this.processor.projectionId);
    if (existing) {
      this.cursorState = {
        lastEffectiveCursor: existing.lastEffectiveCursor,
        lastCommitSequence: existing.lastCommitSequence,
      };
      return;
    }
    const now = Date.now();
    const record: ProjectionMetaRecord = {
      projectionId: this.processor.projectionId,
      ordering: this.processor.ordering,
      lastEffectiveCursor: ZERO_EFFECTIVE_CURSOR,
      lastCommitSequence: 0,
      phase: ProjectionPhases.idle,
      updatedAt: now,
    };
    await this.metaStore.upsert(record);
    this.cursorState = {
      lastEffectiveCursor: record.lastEffectiveCursor,
      lastCommitSequence: record.lastCommitSequence,
    };
  }

  private subscribeToTables(): void {
    const tables: ReadonlyArray<SqliteTableName> =
      this.processor.ordering === ProjectionOrderings.effectiveTotalOrder ? ['events', 'sync_event_map'] : ['events'];
    this.unsubscribe = this.db.subscribeToTables(tables, () => {
      void this.scheduleProcessing();
    });
  }

  private async scheduleProcessing(): Promise<void> {
    await this.runner.run(async () => {
      await this.runProcessingLoop();
    });
  }

  private async runProcessingLoop(): Promise<void> {
    if (this.pendingRebuild) {
      await this.performRebuild();
    }

    let changed = false;
    while (true) {
      const events = await this.readNextBatch();
      if (events.length === 0) {
        await this.updatePhase(ProjectionPhases.idle);
        break;
      }
      await this.updatePhase(ProjectionPhases.catchingUp);
      for (const event of events) {
        const nextCursor =
          this.processor.ordering === ProjectionOrderings.effectiveTotalOrder
            ? advanceEffectiveCursor(this.cursorState.lastEffectiveCursor, event)
            : this.cursorState.lastEffectiveCursor;
        const lastCommitSequence = Math.max(this.cursorState.lastCommitSequence, event.commitSequence);
        const applied = await this.processor.applyEvent({
          event,
          cursorAfter: nextCursor,
          lastCommitSequence,
        });
        changed = changed || applied.changed;
        this.cursorState = {
          lastEffectiveCursor: nextCursor,
          lastCommitSequence,
        };
      }

      await this.persistCursorState(ProjectionPhases.catchingUp);
      if (this.processor.onBatchComplete) {
        await this.processor.onBatchComplete({
          processed: events.length,
          changed,
          lastEffectiveCursor: this.cursorState.lastEffectiveCursor,
          lastCommitSequence: this.cursorState.lastCommitSequence,
        });
      }

      if (events.length < this.scheduler.batchSize) {
        await this.persistCursorState(ProjectionPhases.idle);
        break;
      }
      await yieldToEventLoop(this.scheduler.yieldDelayMs);
    }

    if (changed) {
      // No-op: processors can emit change notifications themselves.
    }
  }

  private async performRebuild(): Promise<void> {
    this.pendingRebuild = false;
    await this.updatePhase(ProjectionPhases.rebuilding);
    this.cursorState = {
      lastEffectiveCursor: ZERO_EFFECTIVE_CURSOR,
      lastCommitSequence: 0,
    };
    await this.processor.reset();
    await this.persistCursorState(ProjectionPhases.rebuilding);
  }

  private async updatePhase(phase: ProjectionPhase): Promise<void> {
    const now = Date.now();
    await this.metaStore.upsert({
      projectionId: this.processor.projectionId,
      ordering: this.processor.ordering,
      lastEffectiveCursor: this.cursorState.lastEffectiveCursor,
      lastCommitSequence: this.cursorState.lastCommitSequence,
      phase,
      updatedAt: now,
    });
  }

  private async persistCursorState(phase: ProjectionPhase): Promise<void> {
    await this.metaStore.upsert({
      projectionId: this.processor.projectionId,
      ordering: this.processor.ordering,
      lastEffectiveCursor: this.cursorState.lastEffectiveCursor,
      lastCommitSequence: this.cursorState.lastCommitSequence,
      phase,
      updatedAt: Date.now(),
    });
  }

  private async readNextBatch(): Promise<ReadonlyArray<EventRecord>> {
    if (this.processor.ordering === ProjectionOrderings.commitSequence) {
      return this.readCommitOrdered(this.cursorState.lastCommitSequence);
    }
    return this.readEffectiveOrdered(this.cursorState.lastEffectiveCursor);
  }

  private async readCommitOrdered(afterCommitSequence: number): Promise<ReadonlyArray<EventRecord>> {
    const rows = await this.db.query<
      Readonly<{
        id: string;
        aggregate_id: string;
        event_type: string;
        payload_encrypted: Uint8Array;
        epoch: number | null;
        keyring_update: Uint8Array | null;
        version: number;
        occurred_at: number;
        actor_id: string | null;
        causation_id: string | null;
        correlation_id: string | null;
        commit_sequence: number;
      }>
    >(
      `
        SELECT
          id,
          aggregate_id,
          event_type,
          payload_encrypted,
          epoch,
          keyring_update,
          version,
          occurred_at,
          actor_id,
          causation_id,
          correlation_id,
          commit_sequence
        FROM events
        WHERE aggregate_type = ? AND commit_sequence > ?
        ORDER BY commit_sequence ASC
        LIMIT ?
      `,
      [this.aggregateType, afterCommitSequence, this.scheduler.batchSize]
    );

    return rows.map((row) => ({
      id: row.id,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload_encrypted,
      version: Number(row.version),
      occurredAt: Number(row.occurred_at),
      actorId: row.actor_id,
      causationId: row.causation_id,
      correlationId: row.correlation_id,
      epoch: row.epoch ?? null,
      keyringUpdate: row.keyring_update ?? null,
      commitSequence: Number(row.commit_sequence),
      globalSequence: null,
    }));
  }

  private async readEffectiveOrdered(cursor: EffectiveCursor): Promise<ReadonlyArray<EventRecord>> {
    const rows = await this.db.query<
      Readonly<{
        id: string;
        aggregate_id: string;
        event_type: string;
        payload_encrypted: Uint8Array;
        epoch: number | null;
        keyring_update: Uint8Array | null;
        version: number;
        occurred_at: number;
        actor_id: string | null;
        causation_id: string | null;
        correlation_id: string | null;
        commit_sequence: number;
        global_seq: number | null;
      }>
    >(
      `
        SELECT
          e.id,
          e.aggregate_id,
          e.event_type,
          e.payload_encrypted,
          e.epoch,
          e.keyring_update,
          e.version,
          e.occurred_at,
          e.actor_id,
          e.causation_id,
          e.correlation_id,
          e.commit_sequence,
          m.global_seq
        FROM events e
        LEFT JOIN sync_event_map m ON m.event_id = e.id
        WHERE e.aggregate_type = ?
          AND (
            (m.global_seq IS NOT NULL AND m.global_seq > ? AND e.commit_sequence > ?)
            OR (m.global_seq IS NULL AND e.commit_sequence > ?)
          )
        ORDER BY
          CASE WHEN m.global_seq IS NULL THEN 1 ELSE 0 END,
          m.global_seq ASC,
          e.commit_sequence ASC
        LIMIT ?
      `,
      [
        this.aggregateType,
        cursor.globalSequence,
        cursor.pendingCommitSequence,
        cursor.pendingCommitSequence,
        this.scheduler.batchSize,
      ]
    );

    return rows.map((row) => ({
      id: row.id,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload_encrypted,
      version: Number(row.version),
      occurredAt: Number(row.occurred_at),
      actorId: row.actor_id,
      causationId: row.causation_id,
      correlationId: row.correlation_id,
      epoch: row.epoch ?? null,
      keyringUpdate: row.keyring_update ?? null,
      commitSequence: Number(row.commit_sequence),
      globalSequence: row.global_seq !== null ? Number(row.global_seq) : null,
    }));
  }

  private toStatus(record: ProjectionMetaRecord): ProjectionStatus {
    if (record.ordering === ProjectionOrderings.commitSequence) {
      const cursor: CommitCursor = {
        commitSequence: record.lastCommitSequence,
        eventId: '',
        version: 0,
      };
      return {
        projectionId: record.projectionId,
        ordering: record.ordering,
        lastApplied: cursor,
        phase: record.phase,
      };
    }
    return {
      projectionId: record.projectionId,
      ordering: record.ordering,
      lastApplied: record.lastEffectiveCursor,
      phase: record.phase,
    };
  }
}
