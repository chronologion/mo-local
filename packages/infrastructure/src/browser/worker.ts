import { makeWorker } from '@livestore/adapter-web/worker';
import { schema } from '../livestore/schema';
import {
  SyncPayloadSchema,
  makeCloudSyncBackend,
} from '../livestore/sync/CloudSyncBackend';

makeWorker({
  schema,
  sync: { backend: makeCloudSyncBackend },
  syncPayloadSchema: SyncPayloadSchema,
});
