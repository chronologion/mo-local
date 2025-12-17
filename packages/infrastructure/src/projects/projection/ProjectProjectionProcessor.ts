import { EncryptedEvent, IEventStore } from '@mo/application';
import type { Store } from '@livestore/livestore';
import { IndexedDBKeyStore } from '../../crypto/IndexedDBKeyStore';
import { WebCryptoService } from '../../crypto/WebCryptoService';
import { MissingKeyError } from '../../errors';
import { tables } from '../../goals/schema';
import { LiveStoreToDomainAdapter } from '../../livestore/adapters/LiveStoreToDomainAdapter';
import MiniSearch, { type SearchResult } from 'minisearch';
import {
  applyProjectEventToSnapshot,
  projectSnapshotToListItem,
  ProjectListItem,
  ProjectSnapshotState,
  SupportedProjectEvent,
} from '../ProjectProjectionState';
import { ProjectionTaskRunner } from '../../projection/ProjectionTaskRunner';
import { PROJECT_SEARCH_CONFIG } from './ProjectSearchConfig';

const META_LAST_SEQUENCE_KEY = 'project_last_sequence';
const SEARCH_INDEX_KEY = 'project_search_index';
const PRUNE_TAIL_SEQUENCE_WINDOW = 10;

type SnapshotRow = {
  aggregate_id: string;
  payload_encrypted: Uint8Array;
  version: number;
  last_sequence: number;
  updated_at: number;
};

type SearchIndexRow = {
  payload_encrypted: Uint8Array;
  last_sequence: number;
};

export class ProjectProjectionProcessor {
  private readonly processingRunner = new ProjectionTaskRunner(
    'ProjectProjectionProcessor',
    100
  );
  private started = false;
  private lastSequence = 0;
  private unsubscribe: (() => void) | null = null;
  private readonly snapshots = new Map<string, ProjectSnapshotState>();
  private readonly projections = new Map<string, ProjectListItem>();
  private searchIndex: MiniSearch<ProjectListItem>;
  private readonly listeners = new Set<() => void>();
  private readonly readyPromise: Promise<void>;
  private resolveReady: (() => void) | null = null;

  constructor(
    private readonly store: Store,
    private readonly eventStore: IEventStore,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: IndexedDBKeyStore,
    private readonly toDomain: LiveStoreToDomainAdapter
  ) {
    this.searchIndex = new MiniSearch<ProjectListItem>({
      idField: PROJECT_SEARCH_CONFIG.idField,
      fields: [...PROJECT_SEARCH_CONFIG.fields],
      storeFields: [...PROJECT_SEARCH_CONFIG.storeFields],
      searchOptions: { ...PROJECT_SEARCH_CONFIG.searchOptions },
    });
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
    await this.bootstrapFromSnapshots();
    await this.processNewEvents();
    this.unsubscribe = this.store.subscribe(
      tables.project_events.count(),
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
    const all = [...this.projections.values()].filter(
      (p) => p.archivedAt === null
    );
    const filtered = filter
      ? all.filter((p) => {
          if (filter.status && p.status !== filter.status) return false;
          if (filter.goalId !== undefined && p.goalId !== filter.goalId)
            return false;
          return true;
        })
      : all;
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getProjectById(projectId: string): ProjectListItem | null {
    return this.projections.get(projectId) ?? null;
  }

  async searchProjects(
    term: string,
    filter?: { status?: string; goalId?: string | null }
  ): Promise<ProjectListItem[]> {
    await this.whenReady();
    if (!term.trim()) return this.listProjects(filter);
    const results: SearchResult[] = this.searchIndex.search(term, {
      prefix: true,
    });
    const ids = new Set(results.map((r) => r.id));
    return this.listProjects(filter).filter((p) => ids.has(p.id));
  }

  async rebuild(): Promise<void> {
    this.snapshots.clear();
    this.projections.clear();
    this.searchIndex = new MiniSearch<ProjectListItem>({
      idField: PROJECT_SEARCH_CONFIG.idField,
      fields: [...PROJECT_SEARCH_CONFIG.fields],
      storeFields: [...PROJECT_SEARCH_CONFIG.storeFields],
      searchOptions: { ...PROJECT_SEARCH_CONFIG.searchOptions },
    });
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
    await this.bootstrapFromSnapshots();
    await this.processNewEvents();
    if (!this.unsubscribe) {
      this.unsubscribe = this.store.subscribe(
        tables.project_events.count(),
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
      const searchKey = await this.ensureSearchKey();
      await this.saveSearchIndex(searchKey, processedMax, Date.now());
      const pruneThreshold = processedMax - PRUNE_TAIL_SEQUENCE_WINDOW;
      if (pruneThreshold > 0) {
        this.pruneProcessedEvents(pruneThreshold);
      }
    }
    if (projectionChanged) {
      this.emitProjectionChanged();
    }
  }

  private async projectEvent(event: EncryptedEvent): Promise<boolean> {
    if (!event.sequence) return false;
    const kProject = await this.keyStore.getAggregateKey(event.aggregateId);
    if (!kProject) {
      throw new MissingKeyError(
        `Missing aggregate key for ${event.aggregateId}`
      );
    }
    const domainEvent = (await this.toDomain.toDomain(
      event,
      kProject
    )) as SupportedProjectEvent;
    const previousSnapshot =
      this.snapshots.get(event.aggregateId) ??
      (await this.loadSnapshot(event.aggregateId, kProject));
    const nextSnapshot = applyProjectEventToSnapshot(
      previousSnapshot,
      domainEvent,
      event.version
    );
    if (!nextSnapshot) {
      return false;
    }
    await this.persistSnapshot(
      event.aggregateId,
      nextSnapshot,
      kProject,
      event
    );
    this.updateProjectionCache(event.aggregateId, nextSnapshot);
    return true;
  }

  private updateProjectionCache(
    aggregateId: string,
    snapshot: ProjectSnapshotState
  ): void {
    this.snapshots.set(aggregateId, snapshot);
    const doc = projectSnapshotToListItem(snapshot);
    const existing = this.projections.get(aggregateId);
    if (existing) {
      this.searchIndex.remove(existing);
    }
    if (snapshot.archivedAt === null) {
      this.projections.set(aggregateId, doc);
      this.searchIndex.add(doc);
    } else {
      this.projections.delete(aggregateId);
    }
  }

  private async bootstrapFromSnapshots(): Promise<void> {
    const searchKey = await this.ensureSearchKey();
    const rows = this.store.query<SnapshotRow[]>({
      query:
        'SELECT aggregate_id, payload_encrypted, version, last_sequence, updated_at FROM project_snapshots',
      bindValues: [],
    });
    for (const row of rows) {
      const kProject = await this.keyStore.getAggregateKey(row.aggregate_id);
      if (!kProject) continue;
      const snapshot = await this.decryptSnapshot(
        row.aggregate_id,
        row.payload_encrypted,
        row.version,
        kProject
      );
      if (!snapshot || snapshot.archivedAt !== null) continue;
      this.snapshots.set(row.aggregate_id, snapshot);
      this.projections.set(
        row.aggregate_id,
        projectSnapshotToListItem(snapshot)
      );
    }
    const restored = await this.loadSearchIndex(searchKey);
    if (!restored) {
      const items = [...this.projections.values()];
      if (items.length) {
        this.searchIndex.addAll(items);
        await this.saveSearchIndex(searchKey, this.lastSequence, Date.now());
      }
    }
  }

  private async loadSnapshot(
    aggregateId: string,
    key: Uint8Array
  ): Promise<ProjectSnapshotState | null> {
    const rows = this.store.query<SnapshotRow[]>({
      query:
        'SELECT payload_encrypted, version FROM project_snapshots WHERE aggregate_id = ?',
      bindValues: [aggregateId],
    });
    if (!rows.length) return null;
    return this.decryptSnapshot(
      aggregateId,
      rows[0]?.payload_encrypted ?? new Uint8Array(),
      rows[0]?.version ?? 0,
      key
    );
  }

  private async decryptSnapshot(
    aggregateId: string,
    payload: Uint8Array,
    version: number,
    key: Uint8Array
  ): Promise<ProjectSnapshotState | null> {
    const aad = new TextEncoder().encode(`${aggregateId}:snapshot:${version}`);
    const plaintext = await this.crypto.decrypt(payload, key, aad);
    const parsed = JSON.parse(new TextDecoder().decode(plaintext));
    return { ...parsed, version } as ProjectSnapshotState;
  }

  private async persistSnapshot(
    aggregateId: string,
    snapshot: ProjectSnapshotState,
    key: Uint8Array,
    event: EncryptedEvent
  ): Promise<void> {
    const aad = new TextEncoder().encode(
      `${aggregateId}:snapshot:${event.version}`
    );
    const payloadBytes = new TextEncoder().encode(JSON.stringify(snapshot));
    const cipher = await this.crypto.encrypt(payloadBytes, key, aad);
    this.store.query({
      query: `
        INSERT INTO project_snapshots (aggregate_id, payload_encrypted, version, last_sequence, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(aggregate_id) DO UPDATE SET
          payload_encrypted = excluded.payload_encrypted,
          version = excluded.version,
          last_sequence = excluded.last_sequence,
          updated_at = excluded.updated_at
      `,
      bindValues: [
        aggregateId,
        cipher as Uint8Array<ArrayBuffer>,
        event.version,
        event.sequence ?? 0,
        event.occurredAt,
      ],
    });
  }

  private async ensureSearchKey(): Promise<Uint8Array> {
    const existing = await this.keyStore.getAggregateKey(SEARCH_INDEX_KEY);
    if (existing) return existing;
    const generated = await this.crypto.generateKey();
    await this.keyStore.saveAggregateKey(SEARCH_INDEX_KEY, generated);
    return generated;
  }

  private async loadSearchIndex(key: Uint8Array): Promise<boolean> {
    const rows = this.store.query<SearchIndexRow[]>({
      query:
        'SELECT payload_encrypted, last_sequence FROM project_search_index WHERE key = ?',
      bindValues: [SEARCH_INDEX_KEY],
    });
    if (!rows.length) return false;
    const row = rows[0];
    const aad = new TextEncoder().encode(
      `${SEARCH_INDEX_KEY}:fts:${row.last_sequence}`
    );
    const plaintext = await this.crypto.decrypt(
      row.payload_encrypted,
      key,
      aad
    );
    const json = new TextDecoder().decode(plaintext);
    this.searchIndex = MiniSearch.loadJSON<ProjectListItem>(json, {
      idField: PROJECT_SEARCH_CONFIG.idField,
      fields: [...PROJECT_SEARCH_CONFIG.fields],
      storeFields: [...PROJECT_SEARCH_CONFIG.storeFields],
      searchOptions: PROJECT_SEARCH_CONFIG.searchOptions,
    });
    return true;
  }

  private async saveSearchIndex(
    key: Uint8Array,
    lastSequence: number,
    updatedAtMs: number
  ): Promise<void> {
    const serialized = JSON.stringify(this.searchIndex.toJSON());
    const aad = new TextEncoder().encode(
      `${SEARCH_INDEX_KEY}:fts:${lastSequence}`
    );
    const cipher = await this.crypto.encrypt(
      new TextEncoder().encode(serialized),
      key,
      aad
    );
    this.store.query({
      query: `
        INSERT INTO project_search_index (key, payload_encrypted, last_sequence, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          payload_encrypted = excluded.payload_encrypted,
          last_sequence = excluded.last_sequence,
          updated_at = excluded.updated_at
      `,
      bindValues: [
        SEARCH_INDEX_KEY,
        cipher as Uint8Array<ArrayBuffer>,
        lastSequence,
        updatedAtMs,
      ],
    });
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

  private pruneProcessedEvents(threshold: number): void {
    this.store.query({
      query: 'DELETE FROM project_events WHERE sequence <= ?',
      bindValues: [threshold],
    });
  }
}
