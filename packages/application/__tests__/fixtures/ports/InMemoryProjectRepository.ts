import { Project, ProjectId, Timestamp, UserId } from '@mo/domain';
import { ProjectRepositoryPort } from '../../../src/projects/ports/ProjectRepositoryPort';
import { none, Option, some } from '../../../src/shared/ports/Option';

type StoredProject = {
  project: Project;
  encryptionKey: Uint8Array;
};

export class InMemoryProjectRepository implements ProjectRepositoryPort {
  private readonly store = new Map<string, StoredProject>();
  private failSave = false;
  private errorToThrow: Error | null = null;

  async load(id: ProjectId): Promise<Option<Project>> {
    const project = this.store.get(id.value)?.project;
    return project ? some(project) : none();
  }

  async save(project: Project, encryptionKey: Uint8Array): Promise<void> {
    if (this.errorToThrow) {
      const error = this.errorToThrow;
      this.errorToThrow = null;
      throw error;
    }
    if (this.failSave) {
      this.failSave = false;
      throw new Error('save failed');
    }
    this.store.set(project.id.value, { project, encryptionKey });
  }

  async archive(
    id: ProjectId,
    archivedAt: Timestamp,
    actorId: UserId
  ): Promise<void> {
    const stored = this.store.get(id.value);
    if (!stored) return;
    stored.project.archive({ archivedAt, actorId });
    await this.save(stored.project, stored.encryptionKey);
  }

  async delete(id: ProjectId): Promise<void> {
    this.store.delete(id.value);
  }

  getStoredKey(id: ProjectId): Uint8Array | undefined {
    return this.store.get(id.value)?.encryptionKey;
  }

  failNextSave(): void {
    this.failSave = true;
  }

  failWith(error: Error): void {
    this.errorToThrow = error;
  }
}
