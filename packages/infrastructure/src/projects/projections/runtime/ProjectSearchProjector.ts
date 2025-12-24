import MiniSearch, { type SearchResult } from 'minisearch';
import type { Store } from '@livestore/livestore';
import type { IKeyStore } from '@mo/application';
import type { WebCryptoService } from '../../../crypto/WebCryptoService';
import { PROJECT_SEARCH_CONFIG } from './ProjectSearchConfig';
import type { ProjectListItem } from '../model/ProjectProjectionState';

const SEARCH_INDEX_KEY = 'project_search_index';

type SearchIndexRow = {
  payload_encrypted: Uint8Array;
  last_sequence: number;
};

export class ProjectSearchProjector {
  private searchIndex: MiniSearch<ProjectListItem>;

  constructor(
    private readonly store: Store,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: IKeyStore
  ) {
    this.searchIndex = this.createSearchIndex();
  }

  searchProjects(
    term: string,
    projections: Map<string, ProjectListItem>,
    filter?: { status?: string; goalId?: string | null }
  ): ProjectListItem[] {
    if (!term.trim()) {
      return this.listProjects(projections, filter);
    }
    const results: SearchResult[] = this.searchIndex.search(term, {
      prefix: true,
    });
    const ids = new Set(results.map((r) => r.id));
    return this.listProjects(projections, filter).filter((p) => ids.has(p.id));
  }

  listProjects(
    projections: Map<string, ProjectListItem>,
    filter?: { status?: string; goalId?: string | null }
  ): ProjectListItem[] {
    const all = [...projections.values()].filter((p) => p.archivedAt === null);
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

  applyProjectionChange(
    previousItem: ProjectListItem | null,
    nextItem: ProjectListItem | null
  ): void {
    if (previousItem && this.searchIndex.has(previousItem.id)) {
      this.searchIndex.remove(previousItem);
    }
    if (nextItem && nextItem.archivedAt === null) {
      this.searchIndex.add(nextItem);
    }
  }

  async bootstrapFromProjections(
    projections: Iterable<ProjectListItem>,
    lastSequence: number
  ): Promise<void> {
    const searchKey = await this.ensureSearchKey();
    const restored = await this.loadSearchIndex(searchKey);
    if (!restored) {
      this.searchIndex = this.createSearchIndex();
      const items = [...projections];
      if (items.length) {
        this.searchIndex.addAll(items);
      }
      await this.saveSearchIndex(searchKey, lastSequence, Date.now());
    }
  }

  async persistIndex(lastSequence: number, updatedAtMs: number): Promise<void> {
    const searchKey = await this.ensureSearchKey();
    await this.saveSearchIndex(searchKey, lastSequence, updatedAtMs);
  }

  reset(): void {
    this.searchIndex = this.createSearchIndex();
  }

  private createSearchIndex(): MiniSearch<ProjectListItem> {
    return new MiniSearch<ProjectListItem>({
      idField: PROJECT_SEARCH_CONFIG.idField,
      fields: [...PROJECT_SEARCH_CONFIG.fields],
      storeFields: [...PROJECT_SEARCH_CONFIG.storeFields],
      searchOptions: { ...PROJECT_SEARCH_CONFIG.searchOptions },
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
}
