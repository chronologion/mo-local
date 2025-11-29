import { EncryptedEvent, PushResult, SyncResult } from './types';

/**
 * Sync abstraction responsible for pushing/pulling encrypted events.
 */
export interface ISyncProvider {
  push(events: EncryptedEvent[]): Promise<PushResult>;
  pull(since?: number): Promise<EncryptedEvent[]>;
  sync(): Promise<SyncResult>;
}
