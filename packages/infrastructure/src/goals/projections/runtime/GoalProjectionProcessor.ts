import type { Store } from '@livestore/livestore';
import type { IEventStore, IKeyStore } from '@mo/application';
import type { WebCryptoService } from '../../../crypto/WebCryptoService';
import { LiveStoreToDomainAdapter } from '../../../livestore/adapters/LiveStoreToDomainAdapter';
import { GoalProjectionRuntime } from './GoalProjectionRuntime';
import type { GoalListItem } from '../model/GoalProjectionState';

export class GoalProjectionProcessor {
  private readonly runtime: GoalProjectionRuntime;

  constructor(
    store: Store,
    eventStore: IEventStore,
    crypto: WebCryptoService,
    keyStore: IKeyStore,
    toDomain: LiveStoreToDomainAdapter
  ) {
    this.runtime = new GoalProjectionRuntime(
      store,
      eventStore,
      crypto,
      keyStore,
      toDomain
    );
  }

  start(): Promise<void> {
    return this.runtime.start();
  }

  stop(): void {
    this.runtime.stop();
  }

  flush(): Promise<void> {
    return this.runtime.flush();
  }

  resetAndRebuild(): Promise<void> {
    return this.runtime.resetAndRebuild();
  }

  subscribe(listener: () => void): () => void {
    return this.runtime.subscribe(listener);
  }

  whenReady(): Promise<void> {
    return this.runtime.whenReady();
  }

  listGoals(): GoalListItem[] {
    return this.runtime.listGoals();
  }

  getGoalById(goalId: string): GoalListItem | null {
    return this.runtime.getGoalById(goalId);
  }

  searchGoals(
    term: string,
    filter?: { slice?: string; month?: string; priority?: string }
  ): GoalListItem[] {
    return this.runtime.searchGoals(term, filter);
  }
}
