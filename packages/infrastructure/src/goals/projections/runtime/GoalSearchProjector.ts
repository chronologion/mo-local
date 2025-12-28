import MiniSearch, { type SearchResult } from 'minisearch';
import type { Store } from '@livestore/livestore';
import type { KeyStorePort } from '@mo/application';
import type { WebCryptoService } from '../../../crypto/WebCryptoService';
import { GOAL_SEARCH_CONFIG } from './GoalSearchConfig';
import type { GoalListItem } from '../model/GoalProjectionState';

const SEARCH_INDEX_KEY = 'goal_search_index';

type SearchIndexRow = {
  payload_encrypted: Uint8Array;
  last_sequence: number;
};

export class GoalSearchProjector {
  private searchIndex: MiniSearch<GoalListItem>;

  constructor(
    private readonly store: Store,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: KeyStorePort
  ) {
    this.searchIndex = this.createSearchIndex();
  }

  searchGoals(
    term: string,
    projections: Map<string, GoalListItem>,
    filter?: { slice?: string; month?: string; priority?: string }
  ): GoalListItem[] {
    const hits = term.trim()
      ? this.searchIndex.search(term)
      : ([...projections.values()].map((item) => ({
          id: item.id,
          score: 1,
        })) as Array<Pick<SearchResult, 'id' | 'score'>>);

    const filtered = hits
      .map((hit) => projections.get(String(hit.id)))
      .filter((item): item is GoalListItem => Boolean(item))
      .filter((item) => this.matchesFilter(item, filter));

    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }

  applyProjectionChange(
    previousItem: GoalListItem | null,
    nextItem: GoalListItem | null
  ): void {
    if (previousItem) {
      try {
        this.searchIndex.remove(previousItem);
      } catch {
        // Missing is fine.
      }
    }
    if (nextItem && nextItem.archivedAt === null) {
      this.searchIndex.add(nextItem);
    }
  }

  async bootstrapFromProjections(
    projections: Iterable<GoalListItem>,
    lastSequence: number
  ): Promise<void> {
    const searchKey = await this.ensureSearchKey();
    const restored = await this.loadSearchIndex(searchKey);
    if (!restored) {
      this.searchIndex = this.createSearchIndex();
      const docs = [...projections].filter((item) => item.archivedAt === null);
      if (docs.length > 0) {
        this.searchIndex.addAll(docs);
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

  private createSearchIndex(): MiniSearch<GoalListItem> {
    return new MiniSearch<GoalListItem>({
      idField: GOAL_SEARCH_CONFIG.idField,
      fields: [...GOAL_SEARCH_CONFIG.fields],
      storeFields: [...GOAL_SEARCH_CONFIG.storeFields],
      searchOptions: { ...GOAL_SEARCH_CONFIG.searchOptions },
    });
  }

  private matchesFilter(
    item: GoalListItem,
    filter?: { slice?: string; month?: string; priority?: string }
  ): boolean {
    if (!filter) return true;
    if (filter.slice && item.slice !== filter.slice) return false;
    if (filter.priority && item.priority !== filter.priority) return false;
    if (filter.month && item.targetMonth !== filter.month) return false;
    return true;
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
        'SELECT payload_encrypted, last_sequence FROM goal_search_index WHERE key = ?',
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
    this.searchIndex = MiniSearch.loadJSON<GoalListItem>(JSON.parse(json), {
      idField: GOAL_SEARCH_CONFIG.idField,
      fields: [...GOAL_SEARCH_CONFIG.fields],
      storeFields: [...GOAL_SEARCH_CONFIG.storeFields],
      searchOptions: GOAL_SEARCH_CONFIG.searchOptions,
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
        INSERT INTO goal_search_index (key, payload_encrypted, last_sequence, updated_at)
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
