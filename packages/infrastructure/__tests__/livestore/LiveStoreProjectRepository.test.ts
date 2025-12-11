import { beforeEach, describe, expect, it } from 'vitest';
import {
  LiveStoreProjectRepository,
  ProjectEventAdapter,
} from '../fixtures/livestore/LiveStoreProjectRepository';
import { LiveStoreEventStore } from '../fixtures/livestore/LiveStoreEventStore';
import {
  Project,
  ProjectId,
  ProjectName,
  ProjectStatus,
  LocalDate,
  ProjectDescription,
  DomainEvent,
  UserId,
} from '@mo/domain';
import { PersistenceError } from '../../src/errors';

const cachedEvents = new Map<string, DomainEvent>();

const adapter: ProjectEventAdapter = {
  toEncrypted(event: DomainEvent, version: number, encryptionKey: Uint8Array) {
    const id = `${event.eventType}-${version}`;
    cachedEvents.set(id, event);
    return {
      id,
      aggregateId: event.aggregateId.value,
      eventType: event.eventType,
      payload: new Uint8Array(encryptionKey),
      version,
      occurredAt: event.occurredAt.value,
    };
  },
  toDomain(event) {
    const cached = cachedEvents.get(event.id);
    if (!cached) {
      throw new Error(`Missing cached event for ${event.id}`);
    }
    return cached;
  },
};

beforeEach(() => {
  cachedEvents.clear();
});

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
      name: ProjectName.from('Alpha'),
      status: ProjectStatus.from('planned'),
      startDate: LocalDate.fromString('2025-01-01'),
      targetDate: LocalDate.fromString('2025-02-01'),
      description: ProjectDescription.from('desc'),
      goalId: null,
      createdBy: UserId.from('user-1'),
    });

    await repo.save(project, kProject);
    const loaded = await repo.load(project.id);

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
    const failingRepo = new LiveStoreProjectRepository(
      failingStore,
      adapter,
      async () => kProject
    );

    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.from('Beta'),
      status: ProjectStatus.from('planned'),
      startDate: LocalDate.fromString('2025-01-01'),
      targetDate: LocalDate.fromString('2025-02-01'),
      description: ProjectDescription.from('desc'),
      goalId: null,
      createdBy: UserId.from('user-1'),
    });

    await expect(failingRepo.save(project, kProject)).rejects.toBeInstanceOf(
      PersistenceError
    );
  });
});
