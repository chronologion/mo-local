import { DomainEvent } from '@mo/domain';

export type SymmetricKey = Uint8Array;

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface IdentityKeys {
  signingPrivateKey: Uint8Array;
  signingPublicKey: Uint8Array;
  encryptionPrivateKey: Uint8Array;
  encryptionPublicKey: Uint8Array;
}

export interface KeyBackup {
  userId?: string;
  identityKeys: IdentityKeys | null;
  aggregateKeys: Record<string, Uint8Array>;
}

export type KeyringRecipientEnvelope = {
  recipientId: string;
  wrappedKey: Uint8Array;
};

export type KeyringEpoch = {
  epochId: number;
  createdAt: number;
  ownerEnvelope: Uint8Array;
  recipientEnvelopes: KeyringRecipientEnvelope[];
};

export interface KeyringState {
  aggregateId: string;
  currentEpoch: number;
  epochs: KeyringEpoch[];
}

export interface EncryptedEvent {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Uint8Array;
  version: number;
  occurredAt: number;
  actorId?: string | null;
  causationId?: string | null;
  correlationId?: string | null;
  sequence?: number;
  epoch?: number;
  keyringUpdate?: Uint8Array;
}

export interface EventFilter {
  aggregateId?: string;
  eventType?: string;
  since?: number;
  limit?: number;
}

export interface PushResult {
  success: boolean;
  lastSequence?: number;
  failedEventIds?: string[];
}

export interface SyncResult {
  pushed?: PushResult;
  pulled: EncryptedEvent[];
}

export type EventHandler = (event: DomainEvent) => void | Promise<void>;
