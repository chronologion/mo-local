import {
  createStorePromise,
  type Adapter,
  type Store,
} from '@livestore/livestore';
import { BrowserLiveStoreEventStore } from '../LiveStoreEventStore';
import {
  schema as defaultSchema,
  events as goalEvents,
} from '../../goals/schema';

export type StoreAndEventStores = {
  store: Store;
  goalEventStore: BrowserLiveStoreEventStore;
  projectEventStore: BrowserLiveStoreEventStore;
};

export const createStoreAndEventStores = async (
  adapter: Adapter,
  storeId: string
): Promise<StoreAndEventStores> => {
  const store = (await createStorePromise({
    schema: defaultSchema,
    adapter,
    storeId,
  })) as unknown as Store; // LiveStore provides Store type via default export path

  const goalEventStore = new BrowserLiveStoreEventStore(
    store,
    goalEvents.goalEvent as (payload: {
      id: string;
      aggregateId: string;
      eventType: string;
      payload: Uint8Array;
      version: number;
      occurredAt: number;
    }) => unknown
  );

  const projectEventStore = new BrowserLiveStoreEventStore(
    store,
    goalEvents.projectEvent as (payload: {
      id: string;
      aggregateId: string;
      eventType: string;
      payload: Uint8Array;
      version: number;
      occurredAt: number;
    }) => unknown,
    { events: 'project_events', snapshots: 'project_snapshots' }
  );

  return { store, goalEventStore, projectEventStore };
};
