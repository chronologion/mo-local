import { describe, expect, it } from 'vitest';
import { NodeCryptoService } from '../../src/crypto/NodeCryptoService';
import { InMemoryKeyringStore } from '../../src/crypto/InMemoryKeyringStore';
import { KeyringManager } from '../../src/crypto/KeyringManager';
import { SyncRecordMaterializer } from '../../src/sync/SyncRecordMaterializer';
import { buildEventAad } from '../../src/eventing/aad';
import { encodeEventEnvelope } from '../../src/eventing/eventEnvelope';
import { InMemoryKeyStore } from '../fixtures/InMemoryKeyStore';
import { toRecordJson, toSyncRecord, type LocalEventRow } from '@mo/sync-engine';

describe('SyncRecordMaterializer', () => {
  it('rejects when envelope eventId does not match sync eventId', async () => {
    const crypto = new NodeCryptoService();
    const keyStore = new InMemoryKeyStore();
    const keyringStore = new InMemoryKeyringStore();
    const keyringManager = new KeyringManager(crypto, keyStore, keyringStore);
    const materializer = new SyncRecordMaterializer(crypto, keyringManager);

    const aggregateId = 'agg-1';
    const aggregateType = 'goal';
    const key = await crypto.generateKey();
    await keyStore.saveAggregateKey(aggregateId, key);

    const envelopeBytes = encodeEventEnvelope({
      envelopeVersion: 1,
      meta: {
        eventId: 'event-1',
        eventType: 'GoalCreated',
        occurredAt: 123,
        actorId: 'actor-1',
        causationId: null,
        correlationId: null,
      },
      payload: {
        payloadVersion: 1,
        data: { title: 'Hello' },
      },
    });
    const aad = buildEventAad(aggregateType, aggregateId, 1);
    const ciphertext = await crypto.encrypt(envelopeBytes, key, aad);

    const row: LocalEventRow = {
      id: 'event-1',
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      payload_encrypted: ciphertext,
      keyring_update: null,
      version: 1,
      epoch: null,
    };
    const recordJson = toRecordJson(toSyncRecord(row));

    await expect(
      materializer.materializeRemoteEvent({
        eventId: 'event-2',
        recordJson,
        globalSequence: 1,
      })
    ).rejects.toThrow(/EventId mismatch/);
  });
});
