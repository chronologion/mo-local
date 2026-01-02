import type { KeyringEpoch, KeyringRecipientEnvelope, KeyringState } from '@mo/application';

type KeyringEpochSerialized = {
  epochId: number;
  createdAt: number;
  ownerEnvelope: number[];
  recipientEnvelopes: Array<{
    recipientId: string;
    wrappedKey: number[];
  }>;
};

type KeyringSerialized = {
  aggregateId: string;
  currentEpoch: number;
  epochs: KeyringEpochSerialized[];
};

const encodeBytes = (data: Uint8Array): number[] => Array.from(data);

const decodeBytes = (data: number[]): Uint8Array => new Uint8Array(data);

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((entry) => Number.isFinite(entry));

const isRecipientEnvelope = (value: unknown): value is { recipientId: string; wrappedKey: number[] } => {
  if (!value || typeof value !== 'object') return false;
  const record = value as {
    recipientId?: unknown;
    wrappedKey?: unknown;
  };
  return typeof record.recipientId === 'string' && isNumberArray(record.wrappedKey);
};

const isEpochSerialized = (value: unknown): value is KeyringEpochSerialized => {
  if (!value || typeof value !== 'object') return false;
  const record = value as {
    epochId?: unknown;
    createdAt?: unknown;
    ownerEnvelope?: unknown;
    recipientEnvelopes?: unknown;
  };
  return (
    typeof record.epochId === 'number' &&
    Number.isFinite(record.epochId) &&
    typeof record.createdAt === 'number' &&
    Number.isFinite(record.createdAt) &&
    isNumberArray(record.ownerEnvelope) &&
    Array.isArray(record.recipientEnvelopes) &&
    record.recipientEnvelopes.every((entry) => isRecipientEnvelope(entry))
  );
};

const isKeyringSerialized = (value: unknown): value is KeyringSerialized => {
  if (!value || typeof value !== 'object') return false;
  const record = value as {
    aggregateId?: unknown;
    currentEpoch?: unknown;
    epochs?: unknown;
  };
  return (
    typeof record.aggregateId === 'string' &&
    typeof record.currentEpoch === 'number' &&
    Number.isFinite(record.currentEpoch) &&
    Array.isArray(record.epochs) &&
    record.epochs.every((entry) => isEpochSerialized(entry))
  );
};

export class Keyring {
  private constructor(
    private readonly aggregateId: string,
    private readonly currentEpoch: number,
    private readonly epochs: KeyringEpoch[]
  ) {}

  static createInitial(aggregateId: string, createdAt: number, ownerEnvelope: Uint8Array): Keyring {
    return new Keyring(aggregateId, 0, [
      {
        epochId: 0,
        createdAt,
        ownerEnvelope,
        recipientEnvelopes: [],
      },
    ]);
  }

  getAggregateId(): string {
    return this.aggregateId;
  }

  getCurrentEpoch(): number {
    return this.currentEpoch;
  }

  getEpoch(epochId: number): KeyringEpoch | undefined {
    return this.epochs.find((epoch) => epoch.epochId === epochId);
  }

  listEpochs(): KeyringEpoch[] {
    return [...this.epochs];
  }

  toState(): KeyringState {
    return {
      aggregateId: this.aggregateId,
      currentEpoch: this.currentEpoch,
      epochs: this.epochs.map((epoch) => ({
        epochId: epoch.epochId,
        createdAt: epoch.createdAt,
        ownerEnvelope: new Uint8Array(epoch.ownerEnvelope),
        recipientEnvelopes: epoch.recipientEnvelopes.map((envelope) => ({
          recipientId: envelope.recipientId,
          wrappedKey: new Uint8Array(envelope.wrappedKey),
        })),
      })),
    };
  }

  toBytes(): Uint8Array {
    const serialized: KeyringSerialized = {
      aggregateId: this.aggregateId,
      currentEpoch: this.currentEpoch,
      epochs: this.epochs.map((epoch) => ({
        epochId: epoch.epochId,
        createdAt: epoch.createdAt,
        ownerEnvelope: encodeBytes(epoch.ownerEnvelope),
        recipientEnvelopes: epoch.recipientEnvelopes.map(
          (envelope): KeyringEpochSerialized['recipientEnvelopes'][number] => ({
            recipientId: envelope.recipientId,
            wrappedKey: encodeBytes(envelope.wrappedKey),
          })
        ),
      })),
    };
    return new TextEncoder().encode(JSON.stringify(serialized));
  }

  static fromState(state: KeyringState): Keyring {
    return new Keyring(state.aggregateId, state.currentEpoch, [
      ...state.epochs.map((epoch) => ({
        epochId: epoch.epochId,
        createdAt: epoch.createdAt,
        ownerEnvelope: new Uint8Array(epoch.ownerEnvelope),
        recipientEnvelopes: epoch.recipientEnvelopes.map(
          (envelope): KeyringRecipientEnvelope => ({
            recipientId: envelope.recipientId,
            wrappedKey: new Uint8Array(envelope.wrappedKey),
          })
        ),
      })),
    ]);
  }

  static fromBytes(bytes: Uint8Array): Keyring {
    const json = new TextDecoder().decode(bytes);
    const parsed: unknown = JSON.parse(json);
    if (!isKeyringSerialized(parsed)) {
      throw new Error('Invalid keyring payload');
    }
    const epochs: KeyringEpoch[] = parsed.epochs.map((epoch) => ({
      epochId: epoch.epochId,
      createdAt: epoch.createdAt,
      ownerEnvelope: decodeBytes(epoch.ownerEnvelope),
      recipientEnvelopes: epoch.recipientEnvelopes.map(
        (envelope): KeyringRecipientEnvelope => ({
          recipientId: envelope.recipientId,
          wrappedKey: decodeBytes(envelope.wrappedKey),
        })
      ),
    }));
    return new Keyring(parsed.aggregateId, parsed.currentEpoch, epochs);
  }
}
