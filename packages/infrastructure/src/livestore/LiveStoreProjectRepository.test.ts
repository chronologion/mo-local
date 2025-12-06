import { describe, expect, it } from 'vitest';
import {
  LiveStoreProjectRepository,
  ProjectEventAdapter,
} from './LiveStoreProjectRepository';
import { LiveStoreEventStore } from './LiveStoreEventStore';
import {
  Project,
  ProjectId,
  ProjectName,
  ProjectStatus,
  LocalDate,
  ProjectDescription,
  GoalId,
  DomainEvent,
  UserId,
} from '@mo/domain';
import { PersistenceError } from '../errors';

const adapter: ProjectEventAdapter = {
  toEncrypted(event: DomainEvent, version: number, encryptionKey: Uint8Array) {
    return {
      id: `${event.eventType}-${version}`,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: new TextEncoder().encode(
        JSON.stringify({ ...event, encryptionKey: Array.from(encryptionKey) })
      ),
      version,
      occurredAt: Date.now(),
    };
  },
  toDomain(event, encryptionKey: Uint8Array) {
    const json = JSON.parse(new TextDecoder().decode(event.payload));
    expect(json.encryptionKey).toEqual(Array.from(encryptionKey));
    return {
      ...json,
      occurredAt: new Date(json.occurredAt ?? Date.now()),
    };
  },
};

const kProject = new Uint8Array([1, 2, 3]);

describe('LiveStoreProjectRepository', () => {
  it('saves and reconstitutes projects', async () => {
    const eventStore = new LiveStoreEventStore();
    const repo = new LiveStoreProjectRepository(
      eventStore,
      adapter,
      async () => kProject
    );
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.of('Alpha'),
      status: ProjectStatus.of('planned'),
      startDate: LocalDate.fromString('2025-01-01'),
      targetDate: LocalDate.fromString('2025-02-01'),
      description: ProjectDescription.of('desc'),
      goalId: null,
      createdBy: UserId.of('user-1'),
    });

    await repo.save(project, kProject);
    const loaded = await repo.findById(project.id);

    expect(loaded).not.toBeNull();
    expect(loaded?.name.value).toBe('Alpha');
  });

  it('wraps non-concurrency errors as PersistenceError', async () => {
    const eventStore = new LiveStoreEventStore();
    const failingStore = {
      append: async () => {
        throw new Error('boom');
      },
      getEvents: eventStore.getEvents.bind(eventStore),
      getAllEvents: eventStore.getAllEvents.bind(eventStore),
    } as unknown as LiveStoreEventStore;
    const failingRepo = new LiveStoreProjectRepository(failingStore, adapter, async () => kProject);

    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.of('Beta'),
      status: ProjectStatus.of('planned'),
      startDate: LocalDate.fromString('2025-01-01'),
      targetDate: LocalDate.fromString('2025-02-01'),
      description: ProjectDescription.of('desc'),
      goalId: null,
      createdBy: UserId.of('user-1'),
    });

    await expect(failingRepo.save(project, kProject)).rejects.toBeInstanceOf(
      PersistenceError
    );
  });
});
