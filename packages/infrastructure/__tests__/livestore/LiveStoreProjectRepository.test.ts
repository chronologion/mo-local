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
  Timestamp,
} from '@mo/domain';
import { isSome } from '@mo/application';
import { PersistenceError } from '../../src/errors';

const cachedEvents = new Map<string, DomainEvent>();
const createdAt = Timestamp.fromMillis(1_700_000_000_000);

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
      actorId: event.actorId.value,
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
      createdAt,
    });

    await repo.save(project, kProject);
    const loaded = await repo.load(project.id);

    expect(isSome(loaded)).toBe(true);
    expect(isSome(loaded) ? loaded.value.name.value : null).toBe('Alpha');
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
      createdAt,
    });

    await expect(failingRepo.save(project, kProject)).rejects.toBeInstanceOf(
      PersistenceError
    );
  });
});
