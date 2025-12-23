import { Project, ProjectId, Timestamp } from '@mo/domain';
import { IProjectRepository } from '../../../src/projects/ports/IProjectRepository';

type StoredProject = {
  project: Project;
  encryptionKey: Uint8Array;
};

export class InMemoryProjectRepository implements IProjectRepository {
  private readonly store = new Map<string, StoredProject>();
  private failSave = false;
  private errorToThrow: Error | null = null;

  async load(id: ProjectId): Promise<Project | null> {
    return this.store.get(id.value)?.project ?? null;
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

  async archive(id: ProjectId, archivedAt: Timestamp): Promise<void> {
    const stored = this.store.get(id.value);
    if (!stored) return;
    stored.project.archive(archivedAt);
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
