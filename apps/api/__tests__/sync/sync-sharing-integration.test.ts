import { beforeEach, describe, expect, it } from 'vitest';
import { SyncService } from '../../src/sync/application/sync.service';
import { SyncAccessPolicy } from '../../src/sync/application/ports/sync-access-policy';
import { SyncStoreRepository } from '../../src/sync/application/ports/sync-store-repository';
import { ScopeStateRepository } from '../../src/sharing/application/ports/scope-state-repository';
import { ResourceGrantRepository } from '../../src/sharing/application/ports/resource-grant-repository';
import { SyncOwnerId } from '../../src/sync/domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../src/sync/domain/value-objects/SyncStoreId';
import { GlobalSequenceNumber } from '../../src/sync/domain/value-objects/GlobalSequenceNumber';
import { ScopeId } from '../../src/sharing/domain/value-objects/ScopeId';
import { ResourceId } from '../../src/sharing/domain/value-objects/ResourceId';
import { GrantId } from '../../src/sharing/domain/value-objects/GrantId';
import { SequenceNumber } from '../../src/sharing/domain/value-objects/SequenceNumber';
import { ScopeState } from '../../src/sharing/domain/entities/ScopeState';
import { ResourceGrant } from '../../src/sharing/domain/entities/ResourceGrant';
import { InMemorySyncEventRepository } from './support/in-memory-sync-event-repository';

const ownerId = SyncOwnerId.from('owner-1');
const storeId = SyncStoreId.from('store-1');

class AllowAllAccessPolicy extends SyncAccessPolicy {
  async ensureCanPull(): Promise<void> {}
  async ensureCanPush(): Promise<void> {}
}

class InMemorySyncStoreRepository extends SyncStoreRepository {
  private owners = new Map<string, string>();

  async ensureStoreOwner(storeId: SyncStoreId, ownerId: SyncOwnerId): Promise<void> {
    const storeIdValue = storeId.unwrap();
    const ownerValue = ownerId.unwrap();
    const existing = this.owners.get(storeIdValue);
    if (existing && existing !== ownerValue) {
      throw new Error('Store owned by another identity');
    }
    this.owners.set(storeIdValue, ownerValue);
  }
}

class FakeScopeStateRepository extends ScopeStateRepository {
  public states: ScopeState[] = [];
  public heads = new Map<string, { ref: Buffer; seq: SequenceNumber }>();

  async appendState(): Promise<{ seq: SequenceNumber; ref: Buffer }> {
    throw new Error('Not implemented');
  }

  async getHeadSeq(): Promise<SequenceNumber> {
    return SequenceNumber.zero();
  }

  async getHeadRef(scopeId: ScopeId): Promise<Buffer | null> {
    return this.heads.get(scopeId.unwrap())?.ref || null;
  }

  async loadSince(): Promise<ScopeState[]> {
    return [];
  }

  async loadByRef(scopeStateRef: Buffer): Promise<ScopeState | null> {
    return this.states.find((s) => s.scopeStateRef.equals(scopeStateRef)) || null;
  }
}

class FakeResourceGrantRepository extends ResourceGrantRepository {
  public grants: ResourceGrant[] = [];

  async appendGrant(): Promise<{ seq: SequenceNumber; hash: Buffer }> {
    throw new Error('Not implemented');
  }

  async getHeadSeq(): Promise<SequenceNumber> {
    return SequenceNumber.zero();
  }

  async loadSince(): Promise<ResourceGrant[]> {
    return [];
  }

  async getActiveGrant(scopeId: ScopeId, resourceId: ResourceId): Promise<ResourceGrant | null> {
    return (
      this.grants.find((g) => g.scopeId.equals(scopeId) && g.resourceId.equals(resourceId) && g.status === 'active') ||
      null
    );
  }

  async loadByGrantId(grantId: GrantId): Promise<ResourceGrant | null> {
    return this.grants.find((g) => g.grantId.equals(grantId)) || null;
  }
}

describe('SyncService with sharing validation', () => {
  let syncRepo: InMemorySyncEventRepository;
  let storeRepo: InMemorySyncStoreRepository;
  let scopeStateRepo: FakeScopeStateRepository;
  let grantRepo: FakeResourceGrantRepository;
  let service: SyncService;

  beforeEach(() => {
    syncRepo = new InMemorySyncEventRepository();
    storeRepo = new InMemorySyncStoreRepository();
    scopeStateRepo = new FakeScopeStateRepository();
    grantRepo = new FakeResourceGrantRepository();
    service = new SyncService(syncRepo, storeRepo, new AllowAllAccessPolicy(), scopeStateRepo, grantRepo);
  });

  it('accepts event with valid sharing dependencies', async () => {
    const scopeId = ScopeId.from('scope-1');
    const resourceId = ResourceId.from('resource-1');
    const grantId = GrantId.from('grant-1');
    const scopeStateRef = Buffer.from('ref1', 'hex');

    // Setup valid scope state
    scopeStateRepo.states.push({
      scopeId,
      scopeStateSeq: SequenceNumber.from(1),
      prevHash: null,
      scopeStateRef,
      ownerUserId: 'user-1',
      scopeEpoch: 1n,
      signedRecordCbor: Buffer.from('cbor'),
      members: {},
      signers: {},
      sigSuite: 'ed25519',
      signature: Buffer.from('sig'),
      createdAt: new Date(),
    });
    scopeStateRepo.heads.set(scopeId.unwrap(), { ref: scopeStateRef, seq: SequenceNumber.from(1) });

    // Setup valid grant
    grantRepo.grants.push({
      grantId,
      scopeId,
      resourceId,
      grantSeq: SequenceNumber.from(1),
      prevHash: null,
      grantHash: Buffer.from('hash1'),
      scopeStateRef,
      scopeEpoch: 1n,
      resourceKeyId: 'key-1',
      wrappedKey: Buffer.from('wrapped'),
      policy: null,
      status: 'active',
      signedGrantCbor: Buffer.from('cbor'),
      sigSuite: 'ed25519',
      signature: Buffer.from('sig'),
      createdAt: new Date(),
    });

    const result = await service.pushEvents({
      ownerId,
      storeId,
      expectedHead: GlobalSequenceNumber.from(0),
      events: [
        {
          eventId: 'e1',
          recordJson: '{"encrypted":true}',
          scopeId: scopeId.unwrap(),
          resourceId: resourceId.unwrap(),
          resourceKeyId: 'key-1',
          grantId: grantId.unwrap(),
          scopeStateRef,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.head.unwrap()).toBe(1);
    }
  });

  it('rejects event with missing scope state', async () => {
    const result = await service.pushEvents({
      ownerId,
      storeId,
      expectedHead: GlobalSequenceNumber.from(0),
      events: [
        {
          eventId: 'e1',
          recordJson: '{"encrypted":true}',
          scopeId: 'scope-1',
          resourceId: 'resource-1',
          grantId: 'grant-1',
          scopeStateRef: Buffer.from('nonexistent', 'hex'),
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('missing_deps');
    }
  });

  it('rejects event with stale scope state', async () => {
    const scopeId = ScopeId.from('scope-1');
    const oldRef = Buffer.from('aabbcc', 'hex');
    const newRef = Buffer.from('ddeeff', 'hex');

    // Setup old scope state
    scopeStateRepo.states.push({
      scopeId,
      scopeStateSeq: SequenceNumber.from(1),
      prevHash: null,
      scopeStateRef: oldRef,
      ownerUserId: 'user-1',
      scopeEpoch: 1n,
      signedRecordCbor: Buffer.from('cbor'),
      members: {},
      signers: {},
      sigSuite: 'ed25519',
      signature: Buffer.from('sig'),
      createdAt: new Date(),
    });

    // Head has moved to newRef
    scopeStateRepo.heads.set(scopeId.unwrap(), { ref: newRef, seq: SequenceNumber.from(2) });

    // Setup grant
    grantRepo.grants.push({
      grantId: GrantId.from('grant-1'),
      scopeId,
      resourceId: ResourceId.from('resource-1'),
      grantSeq: SequenceNumber.from(1),
      prevHash: null,
      grantHash: Buffer.from('hash1'),
      scopeStateRef: oldRef,
      scopeEpoch: 1n,
      resourceKeyId: 'key-1',
      wrappedKey: Buffer.from('wrapped'),
      policy: null,
      status: 'active',
      signedGrantCbor: Buffer.from('cbor'),
      sigSuite: 'ed25519',
      signature: Buffer.from('sig'),
      createdAt: new Date(),
    });

    const result = await service.pushEvents({
      ownerId,
      storeId,
      expectedHead: GlobalSequenceNumber.from(0),
      events: [
        {
          eventId: 'e1',
          recordJson: '{"encrypted":true}',
          scopeId: scopeId.unwrap(),
          resourceId: 'resource-1',
          grantId: 'grant-1',
          scopeStateRef: oldRef, // Stale!
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('stale_scope_state');
    }
  });

  it('rejects event with stale grant', async () => {
    const scopeId = ScopeId.from('scope-1');
    const resourceId = ResourceId.from('resource-1');
    const scopeStateRef = Buffer.from('ref1', 'hex');

    // Setup valid scope state
    scopeStateRepo.states.push({
      scopeId,
      scopeStateSeq: SequenceNumber.from(1),
      prevHash: null,
      scopeStateRef,
      ownerUserId: 'user-1',
      scopeEpoch: 1n,
      signedRecordCbor: Buffer.from('cbor'),
      members: {},
      signers: {},
      sigSuite: 'ed25519',
      signature: Buffer.from('sig'),
      createdAt: new Date(),
    });
    scopeStateRepo.heads.set(scopeId.unwrap(), { ref: scopeStateRef, seq: SequenceNumber.from(1) });

    // Setup old grant (exists but not active)
    const oldGrantId = GrantId.from('grant-old');
    grantRepo.grants.push({
      grantId: oldGrantId,
      scopeId,
      resourceId,
      grantSeq: SequenceNumber.from(1),
      prevHash: null,
      grantHash: Buffer.from('hash1'),
      scopeStateRef,
      scopeEpoch: 1n,
      resourceKeyId: 'key-1',
      wrappedKey: Buffer.from('wrapped'),
      policy: null,
      status: 'revoked',
      signedGrantCbor: Buffer.from('cbor'),
      sigSuite: 'ed25519',
      signature: Buffer.from('sig'),
      createdAt: new Date(),
    });

    // New active grant
    const newGrantId = GrantId.from('grant-new');
    grantRepo.grants.push({
      grantId: newGrantId,
      scopeId,
      resourceId,
      grantSeq: SequenceNumber.from(2),
      prevHash: Buffer.from('hash1'),
      grantHash: Buffer.from('hash2'),
      scopeStateRef,
      scopeEpoch: 1n,
      resourceKeyId: 'key-2',
      wrappedKey: Buffer.from('wrapped2'),
      policy: null,
      status: 'active',
      signedGrantCbor: Buffer.from('cbor2'),
      sigSuite: 'ed25519',
      signature: Buffer.from('sig2'),
      createdAt: new Date(),
    });

    const result = await service.pushEvents({
      ownerId,
      storeId,
      expectedHead: GlobalSequenceNumber.from(0),
      events: [
        {
          eventId: 'e1',
          recordJson: '{"encrypted":true}',
          scopeId: scopeId.unwrap(),
          resourceId: resourceId.unwrap(),
          grantId: oldGrantId.unwrap(), // Stale grant!
          scopeStateRef,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('stale_grant');
    }
  });
});
