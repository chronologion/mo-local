import MiniSearch, { type SearchResult } from 'minisearch';
import type { KeyStorePort } from '@mo/application';
import type { EffectiveCursor } from '@mo/eventstore-core';
import type { WebCryptoService } from '../../crypto/WebCryptoService';
import { GOAL_SEARCH_CONFIG } from './GoalSearchConfig';
import type { GoalListItem } from '../projections/model/GoalProjectionState';
import {
  buildIndexArtifactAad,
  IndexArtifactStore,
  IndexBuildPhases,
  type IndexBuildPhase,
} from '../../platform/derived-state';

const INDEX_ID = 'goal_search';
const INDEX_SCOPE = 'global';
const SEARCH_KEY_ID = 'goal_search_index';
const INDEX_VERSION = 1;

export class GoalSearchProjector {
  private searchIndex: MiniSearch<GoalListItem> | null = null;
  private indexLoaded = false;
  private indexDirty = false;
  private phase: IndexBuildPhase = IndexBuildPhases.missing;

  constructor(
    private readonly indexStore: IndexArtifactStore,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: KeyStorePort
  ) {}

  async ensureBuilt(projections: Iterable<GoalListItem>): Promise<void> {
    if (this.indexLoaded) return;
    this.phase = IndexBuildPhases.building;
    const searchKey = await this.ensureSearchKey();
    const restored = await this.loadSearchIndex(searchKey);
    if (!restored) {
      this.searchIndex = this.createSearchIndex();
      const docs = [...projections].filter((item) => item.archivedAt === null);
      if (docs.length > 0) {
        this.searchIndex.addAll(docs);
      }
      this.indexDirty = true;
    }
    this.indexLoaded = true;
    this.phase = IndexBuildPhases.ready;
  }

  status(): Readonly<{ indexId: string; phase: IndexBuildPhase }> {
    return { indexId: INDEX_ID, phase: this.phase };
  }

  searchGoals(
    term: string,
    projections: Map<string, GoalListItem>,
    filter?: { slice?: string; month?: string; priority?: string }
  ): GoalListItem[] {
    if (!this.searchIndex) {
      return [];
    }
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
    if (!this.searchIndex) return;
    if (previousItem) {
      try {
        this.searchIndex.remove(previousItem);
      } catch (error) {
        console.debug('[GoalSearchProjector] search index missing item', {
          goalId: previousItem.id,
          error,
        });
      }
    }
    if (nextItem && nextItem.archivedAt === null) {
      this.searchIndex.add(nextItem);
    }
    this.indexDirty = true;
  }

  async persistIndex(cursor: EffectiveCursor): Promise<void> {
    if (!this.searchIndex || !this.indexDirty) return;
    const searchKey = await this.ensureSearchKey();
    await this.saveSearchIndex(searchKey, cursor);
    this.indexDirty = false;
  }

  reset(): void {
    this.searchIndex = null;
    this.indexLoaded = false;
    this.indexDirty = false;
    this.phase = IndexBuildPhases.missing;
  }

  async clearPersisted(): Promise<void> {
    await this.indexStore.remove(INDEX_ID, INDEX_SCOPE);
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
    const existing = await this.keyStore.getAggregateKey(SEARCH_KEY_ID);
    if (existing) return existing;
    const generated = await this.crypto.generateKey();
    await this.keyStore.saveAggregateKey(SEARCH_KEY_ID, generated);
    return generated;
  }

  private async loadSearchIndex(key: Uint8Array): Promise<boolean> {
    const row = await this.indexStore.get(INDEX_ID, INDEX_SCOPE);
    if (!row) return false;
    const aad = buildIndexArtifactAad(
      INDEX_ID,
      INDEX_SCOPE,
      row.artifactVersion,
      row.lastEffectiveCursor
    );
    try {
      const plaintext = await this.crypto.decrypt(
        row.artifactEncrypted,
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
    } catch {
      await this.indexStore.remove(INDEX_ID, INDEX_SCOPE);
      return false;
    }
  }

  private async saveSearchIndex(
    key: Uint8Array,
    cursor: EffectiveCursor
  ): Promise<void> {
    if (!this.searchIndex) return;
    const serialized = JSON.stringify(this.searchIndex.toJSON());
    const aad = buildIndexArtifactAad(
      INDEX_ID,
      INDEX_SCOPE,
      INDEX_VERSION,
      cursor
    );
    const cipher = await this.crypto.encrypt(
      new TextEncoder().encode(serialized),
      key,
      aad
    );
    await this.indexStore.put({
      indexId: INDEX_ID,
      scopeKey: INDEX_SCOPE,
      artifactVersion: INDEX_VERSION,
      artifactEncrypted: cipher,
      lastEffectiveCursor: cursor,
      writtenAt: Date.now(),
    });
  }
}
