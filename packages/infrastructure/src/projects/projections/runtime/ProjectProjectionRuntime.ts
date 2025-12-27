import type { Store } from '@livestore/livestore';
import type { IEventStore, IKeyStore } from '@mo/application';
import { projectTables } from '../../schema';
import { LiveStoreToDomainAdapter } from '../../../livestore/adapters/LiveStoreToDomainAdapter';
import { ProjectionTaskRunner } from '../../../projection/ProjectionTaskRunner';
import { MissingKeyError } from '../../../errors';
import type { EncryptedEvent } from '@mo/application';
import type { WebCryptoService } from '../../../crypto/WebCryptoService';
import { KeyringManager } from '../../../crypto/KeyringManager';
import {
  isProjectEvent,
  type ProjectListItem,
} from '../model/ProjectProjectionState';
import { ProjectSnapshotProjector } from './ProjectSnapshotProjector';
import { ProjectSearchProjector } from './ProjectSearchProjector';

const META_LAST_SEQUENCE_KEY = 'project_last_sequence';
const META_LAST_SEQUENCE_EVENT_ID_KEY = 'project_last_sequence_event_id';
const META_LAST_SEQUENCE_EVENT_VERSION_KEY =
  'project_last_sequence_event_version';

type SequenceCursor = Readonly<{ id: string; version: number }>;

export class ProjectProjectionRuntime {
  private readonly processingRunner = new ProjectionTaskRunner(
    'ProjectProjectionProcessor',
    100
  );
  private started = false;
  private lastSequence = 0;
  private lastSequenceCursor: SequenceCursor | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly readyPromise: Promise<void>;
  private resolveReady: (() => void) | null = null;

  private readonly snapshotProjector: ProjectSnapshotProjector;
  private readonly searchProjector: ProjectSearchProjector;

  constructor(
    private readonly store: Store,
    private readonly eventStore: IEventStore,
    crypto: WebCryptoService,
    keyStore: IKeyStore,
    private readonly keyringManager: KeyringManager,
    private readonly toDomain: LiveStoreToDomainAdapter
  ) {
    this.snapshotProjector = new ProjectSnapshotProjector(
      store,
      crypto,
      keyStore
    );
    this.searchProjector = new ProjectSearchProjector(store, crypto, keyStore);
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  async whenReady(): Promise<void> {
    return this.readyPromise;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.lastSequence = await this.loadLastSequence();
    this.lastSequenceCursor = await this.loadLastSequenceCursor();
    await this.maybeRebuildForCursorMismatch('start');
    await this.snapshotProjector.bootstrapFromSnapshots();
    await this.searchProjector.bootstrapFromProjections(
      this.snapshotProjector.listProjections(),
      this.lastSequence
    );
    await this.processNewEvents();
    this.unsubscribe = this.store.subscribe(
      this.getEventsTailQuery(),
      () => void this.processNewEvents()
    );
    this.resolveReady?.();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.started = false;
  }

  async flush(): Promise<void> {
    await this.processNewEvents();
  }

  listProjects(filter?: {
    status?: string;
    goalId?: string | null;
  }): ProjectListItem[] {
    return this.searchProjector.listProjects(
      this.snapshotProjector.getProjectionsMap(),
      filter
    );
  }

  getProjectById(projectId: string): ProjectListItem | null {
    return this.snapshotProjector.getProjection(projectId);
  }

  async searchProjects(
    term: string,
    filter?: { status?: string; goalId?: string | null }
  ): Promise<ProjectListItem[]> {
    await this.whenReady();
    return this.searchProjector.searchProjects(
      term,
      this.snapshotProjector.getProjectionsMap(),
      filter
    );
  }

  async rebuild(): Promise<void> {
    this.snapshotProjector.clearCaches();
    this.searchProjector.reset();
    this.lastSequence = 0;
    this.lastSequenceCursor = null;
    this.store.query({
      query: 'DELETE FROM project_snapshots',
      bindValues: [],
    });
    this.store.query({
      query: 'DELETE FROM project_search_index',
      bindValues: [],
    });
    await this.saveLastSequenceCursor(0, null);
    await this.snapshotProjector.bootstrapFromSnapshots();
    await this.processNewEvents();
    if (!this.unsubscribe) {
      this.unsubscribe = this.store.subscribe(
        this.getEventsTailQuery(),
        () => void this.processNewEvents()
      );
    }
    this.started = true;
    this.emitProjectionChanged();
  }

  async resetAndRebuild(): Promise<void> {
    this.stop();
    await this.rebuild();
  }

  private emitProjectionChanged(): void {
    this.listeners.forEach((listener) => listener());
  }

  private async processNewEvents(): Promise<void> {
    await this.processingRunner.run(() => this.runProcessNewEvents());
  }

  private async runProcessNewEvents(): Promise<void> {
    const rebuilt = await this.maybeRebuildForCursorMismatch('process');
    if (rebuilt) return;
    const events = await this.eventStore.getAllEvents({
      since: this.lastSequence,
    });
    if (events.length === 0) return;
    let processedMax = this.lastSequence;
    let processedMaxCursor: SequenceCursor | null = this.lastSequenceCursor;
    let projectionChanged = false;
    for (const event of events) {
      if (!event.sequence) {
        continue;
      }
      try {
        const changed = await this.projectEvent(event);
        projectionChanged = projectionChanged || changed;
        if (event.sequence > processedMax) {
          processedMax = event.sequence;
          processedMaxCursor = { id: event.id, version: event.version };
        }
      } catch (error) {
        if (error instanceof MissingKeyError) {
          console.warn(
            '[ProjectProjectionProcessor] Missing key, skipping event for aggregate',
            event.aggregateId
          );
          if (event.sequence > processedMax) {
            processedMax = event.sequence;
            processedMaxCursor = { id: event.id, version: event.version };
          }
          continue;
        }
        throw error;
      }
    }
    if (processedMax > this.lastSequence) {
      this.lastSequence = processedMax;
      this.lastSequenceCursor = processedMaxCursor;
      await this.saveLastSequenceCursor(processedMax, processedMaxCursor);
      await this.searchProjector.persistIndex(processedMax, Date.now());
    }
    if (projectionChanged) {
      this.emitProjectionChanged();
    }
  }

  private async projectEvent(event: EncryptedEvent): Promise<boolean> {
    if (!event.sequence) return false;
    const kProject = await this.keyringManager.resolveKeyForEvent(event);
    const domainEvent = await this.toDomain.toDomain(event, kProject);
    if (!isProjectEvent(domainEvent)) {
      return false;
    }
    const applyResult = await this.snapshotProjector.applyEvent(
      event,
      domainEvent,
      kProject
    );
    if (!applyResult.changed) {
      return false;
    }
    this.searchProjector.applyProjectionChange(
      applyResult.previousItem,
      applyResult.nextItem
    );
    return true;
  }

  private async loadLastSequence(): Promise<number> {
    const rows = this.store.query<{ value: string }[]>({
      query: 'SELECT value FROM project_projection_meta WHERE key = ? LIMIT 1',
      bindValues: [META_LAST_SEQUENCE_KEY],
    });
    if (!rows.length) return 0;
    const parsed = Number(rows[0]?.value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async loadLastSequenceCursor(): Promise<SequenceCursor | null> {
    const idRows = this.store.query<{ value: string }[]>({
      query: 'SELECT value FROM project_projection_meta WHERE key = ? LIMIT 1',
      bindValues: [META_LAST_SEQUENCE_EVENT_ID_KEY],
    });
    const versionRows = this.store.query<{ value: string }[]>({
      query: 'SELECT value FROM project_projection_meta WHERE key = ? LIMIT 1',
      bindValues: [META_LAST_SEQUENCE_EVENT_VERSION_KEY],
    });
    const id = idRows[0]?.value;
    const versionStr = versionRows[0]?.value;
    const version = versionStr !== undefined ? Number(versionStr) : NaN;
    if (!id || !Number.isFinite(version)) {
      return null;
    }
    return { id, version };
  }

  private async saveLastSequence(sequence: number): Promise<void> {
    this.store.query({
      query: `
        INSERT INTO project_projection_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      bindValues: [META_LAST_SEQUENCE_KEY, String(sequence)],
    });
  }

  private async saveLastSequenceCursor(
    sequence: number,
    cursor: SequenceCursor | null
  ): Promise<void> {
    await this.saveLastSequence(sequence);
    this.store.query({
      query: `
        INSERT INTO project_projection_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      bindValues: [META_LAST_SEQUENCE_EVENT_ID_KEY, cursor?.id ?? ''],
    });
    this.store.query({
      query: `
        INSERT INTO project_projection_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      bindValues: [
        META_LAST_SEQUENCE_EVENT_VERSION_KEY,
        cursor ? String(cursor.version) : '',
      ],
    });
  }

  private getEventsTailQuery() {
    return projectTables.project_events
      .select('sequence', 'id', 'version')
      .orderBy('sequence', 'desc')
      .first();
  }

  private getEventCursorAtSequence(sequence: number): SequenceCursor | null {
    const rows = this.store.query<{ id: string; version: number }[]>({
      query:
        'SELECT id, version FROM project_events WHERE sequence = ? LIMIT 1',
      bindValues: [sequence],
    });
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, version: Number(row.version) };
  }

  private async maybeRebuildForCursorMismatch(
    source: 'start' | 'process'
  ): Promise<boolean> {
    if (this.lastSequence === 0) return false;
    const actual = this.getEventCursorAtSequence(this.lastSequence);
    if (!actual) {
      await this.rebuildFromScratch({ reason: 'missing_cursor_row', source });
      return true;
    }
    if (!this.lastSequenceCursor) {
      this.lastSequenceCursor = actual;
      await this.saveLastSequenceCursor(this.lastSequence, actual);
      return false;
    }
    if (
      this.lastSequenceCursor.id !== actual.id ||
      this.lastSequenceCursor.version !== actual.version
    ) {
      await this.rebuildFromScratch({
        reason: 'cursor_mismatch',
        source,
        expected: this.lastSequenceCursor,
        actual,
      });
      return true;
    }
    return false;
  }

  private async rebuildFromScratch(input: {
    reason: 'missing_cursor_row' | 'cursor_mismatch';
    source: 'start' | 'process';
    expected?: SequenceCursor;
    actual?: SequenceCursor;
  }): Promise<void> {
    console.warn(
      '[ProjectProjectionProcessor] Rebuilding projections after rebase',
      {
        ...input,
        lastSequence: this.lastSequence,
      }
    );

    this.snapshotProjector.clearCaches();
    this.searchProjector.reset();
    this.lastSequence = 0;
    this.lastSequenceCursor = null;
    this.store.query({
      query: 'DELETE FROM project_snapshots',
      bindValues: [],
    });
    this.store.query({
      query: 'DELETE FROM project_projection_meta',
      bindValues: [],
    });
    this.store.query({
      query: 'DELETE FROM project_search_index',
      bindValues: [],
    });
    await this.saveLastSequenceCursor(0, null);

    await this.snapshotProjector.bootstrapFromSnapshots();
    await this.searchProjector.bootstrapFromProjections(
      this.snapshotProjector.listProjections(),
      this.lastSequence
    );
    await this.runProcessNewEvents();
    this.emitProjectionChanged();
  }
}
