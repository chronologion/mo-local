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
import { ProjectPruneProjector } from './ProjectPruneProjector';

const META_LAST_SEQUENCE_KEY = 'project_last_sequence';
const PRUNE_TAIL_SEQUENCE_WINDOW = 10;

export class ProjectProjectionRuntime {
  private readonly processingRunner = new ProjectionTaskRunner(
    'ProjectProjectionProcessor',
    100
  );
  private started = false;
  private lastSequence = 0;
  private unsubscribe: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly readyPromise: Promise<void>;
  private resolveReady: (() => void) | null = null;

  private readonly snapshotProjector: ProjectSnapshotProjector;
  private readonly searchProjector: ProjectSearchProjector;
  private readonly pruneProjector: ProjectPruneProjector;

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
    this.pruneProjector = new ProjectPruneProjector(store);
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
    await this.snapshotProjector.bootstrapFromSnapshots();
    await this.searchProjector.bootstrapFromProjections(
      this.snapshotProjector.listProjections(),
      this.lastSequence
    );
    await this.processNewEvents();
    this.unsubscribe = this.store.subscribe(
      projectTables.project_events.count(),
      () => void this.processNewEvents()
    );
    this.resolveReady?.();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.started = false;
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
    await this.saveLastSequence(0);
    await this.snapshotProjector.bootstrapFromSnapshots();
    await this.processNewEvents();
    if (!this.unsubscribe) {
      this.unsubscribe = this.store.subscribe(
        projectTables.project_events.count(),
        () => void this.processNewEvents()
      );
    }
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
    const events = await this.eventStore.getAllEvents({
      since: this.lastSequence,
    });
    if (events.length === 0) return;
    let processedMax = this.lastSequence;
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
        }
      } catch (error) {
        if (error instanceof MissingKeyError) {
          console.warn(
            '[ProjectProjectionProcessor] Missing key, skipping event for aggregate',
            event.aggregateId
          );
          if (event.sequence > processedMax) {
            processedMax = event.sequence;
          }
          continue;
        }
        throw error;
      }
    }
    if (processedMax > this.lastSequence) {
      this.lastSequence = processedMax;
      await this.saveLastSequence(processedMax);
      await this.searchProjector.persistIndex(processedMax, Date.now());
      const pruneThreshold = processedMax - PRUNE_TAIL_SEQUENCE_WINDOW;
      if (pruneThreshold > 0) {
        this.pruneProjector.pruneProcessedEvents(pruneThreshold);
      }
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
}
