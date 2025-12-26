import {
  createStorePromise,
  type Adapter,
  type Store,
} from '@livestore/livestore';
import { BrowserLiveStoreEventStore } from '../LiveStoreEventStore';
import { events, schema as defaultSchema } from '../../livestore/schema';
import {
  SyncPayload,
  SyncPayloadSchema,
} from '../../livestore/sync/CloudSyncBackend';

export type StoreAndEventStores = {
  store: Store;
  goalEventStore: BrowserLiveStoreEventStore;
  projectEventStore: BrowserLiveStoreEventStore;
};

export type StoreAndEventStoresOptions = {
  syncPayload?: SyncPayload;
};

export const createStoreAndEventStores = async (
  adapter: Adapter,
  storeId: string,
  options?: StoreAndEventStoresOptions
): Promise<StoreAndEventStores> => {
  // eslint-disable-next-line no-restricted-syntax -- LiveStore's Store<TSchema> is invariant; erase schema typing at the wiring boundary.
  const store = (await createStorePromise({
    schema: defaultSchema,
    adapter,
    storeId,
    syncPayloadSchema: SyncPayloadSchema,
    syncPayload: options?.syncPayload,
  })) as unknown as Store;

  const goalEventStore = new BrowserLiveStoreEventStore(
    store,
    events.domainEvent
  );

  const projectEventStore = new BrowserLiveStoreEventStore(
    store,
    events.domainEvent,
    { events: 'project_events', snapshots: 'project_snapshots' }
  );

  return { store, goalEventStore, projectEventStore };
};
