const SYNC_GATE_CHANNEL = 'mo-sync-gate';

type SyncGateRequestMessage = {
  type: 'sync-gate-request';
};

type SyncGateUpdateMessage = {
  type: 'sync-gate-update';
  enabled: boolean;
};

type SyncGateMessage = SyncGateRequestMessage | SyncGateUpdateMessage;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isSyncGateRequestMessage = (
  value: unknown
): value is SyncGateRequestMessage =>
  isRecord(value) && value.type === 'sync-gate-request';

export const isSyncGateUpdateMessage = (
  value: unknown
): value is SyncGateUpdateMessage =>
  isRecord(value) &&
  value.type === 'sync-gate-update' &&
  typeof value.enabled === 'boolean';

export const getSyncGateChannelName = (): string => SYNC_GATE_CHANNEL;

let syncGateChannel: BroadcastChannel | null = null;
let syncGateEnabled = false;

const ensureSyncGateChannel = (): BroadcastChannel | null => {
  if (syncGateChannel) return syncGateChannel;
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(SYNC_GATE_CHANNEL);
  const handleMessage = (event: MessageEvent) => {
    if (isSyncGateRequestMessage(event.data)) {
      channel.postMessage({
        type: 'sync-gate-update',
        enabled: syncGateEnabled,
      } satisfies SyncGateMessage);
    }
  };
  channel.addEventListener('message', handleMessage);
  syncGateChannel = channel;
  return channel;
};

export const setSyncGateEnabled = (enabled: boolean): void => {
  syncGateEnabled = enabled;
  const channel = ensureSyncGateChannel();
  if (!channel) return;
  channel.postMessage({
    type: 'sync-gate-update',
    enabled,
  } satisfies SyncGateMessage);
};
