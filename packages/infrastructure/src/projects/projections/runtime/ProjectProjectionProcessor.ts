import type { Store } from '@livestore/livestore';
import type { IEventStore, IKeyStore } from '@mo/application';
import type { WebCryptoService } from '../../../crypto/WebCryptoService';
import { LiveStoreToDomainAdapter } from '../../../livestore/adapters/LiveStoreToDomainAdapter';
import { ProjectProjectionRuntime } from './ProjectProjectionRuntime';
import type { ProjectListItem } from '../model/ProjectProjectionState';
import { KeyringManager } from '../../../crypto/KeyringManager';

export class ProjectProjectionProcessor {
  private readonly runtime: ProjectProjectionRuntime;

  constructor(
    store: Store,
    eventStore: IEventStore,
    crypto: WebCryptoService,
    keyStore: IKeyStore,
    keyringManager: KeyringManager,
    toDomain: LiveStoreToDomainAdapter
  ) {
    this.runtime = new ProjectProjectionRuntime(
      store,
      eventStore,
      crypto,
      keyStore,
      keyringManager,
      toDomain
    );
  }

  whenReady(): Promise<void> {
    return this.runtime.whenReady();
  }

  subscribe(listener: () => void): () => void {
    return this.runtime.subscribe(listener);
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

  listProjects(filter?: {
    status?: string;
    goalId?: string | null;
  }): ProjectListItem[] {
    return this.runtime.listProjects(filter);
  }

  getProjectById(projectId: string): ProjectListItem | null {
    return this.runtime.getProjectById(projectId);
  }

  searchProjects(
    term: string,
    filter?: { status?: string; goalId?: string | null }
  ): Promise<ProjectListItem[]> {
    return this.runtime.searchProjects(term, filter);
  }

  rebuild(): Promise<void> {
    return this.runtime.rebuild();
  }

  resetAndRebuild(): Promise<void> {
    return this.runtime.resetAndRebuild();
  }
}
