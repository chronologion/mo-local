import { beforeEach, describe, expect, it } from 'vitest';
import { ScopeService } from '../../src/sharing/application/scope.service';
import { ScopeStateRepository, ScopeStateInput } from '../../src/sharing/application/ports/scope-state-repository';
import { KeyEnvelopeRepository, KeyEnvelopeInput } from '../../src/sharing/application/ports/key-envelope-repository';
import { ScopeId } from '../../src/sharing/domain/value-objects/ScopeId';
import { EnvelopeId } from '../../src/sharing/domain/value-objects/EnvelopeId';
import { SequenceNumber } from '../../src/sharing/domain/value-objects/SequenceNumber';
import { ScopeState } from '../../src/sharing/domain/entities/ScopeState';
import { KeyEnvelope } from '../../src/sharing/domain/entities/KeyEnvelope';

class InMemoryScopeStateRepository extends ScopeStateRepository {
  private states: ScopeState[] = [];
  private heads = new Map<string, { seq: SequenceNumber; ref: Buffer | null }>();

  async appendState(params: {
    scopeId: ScopeId;
    expectedHead: SequenceNumber;
    state: ScopeStateInput;
  }): Promise<{ seq: SequenceNumber; ref: Buffer }> {
    const head = this.heads.get(params.scopeId.unwrap()) || { seq: SequenceNumber.zero(), ref: null };
    if (!head.seq.equals(params.expectedHead)) {
      throw new Error('Head mismatch');
    }
    const nextSeq = head.seq.increment();
    const newState: ScopeState = {
      scopeId: params.scopeId,
      scopeStateSeq: nextSeq,
      prevHash: params.state.prevHash,
      scopeStateRef: params.state.scopeStateRef,
      ownerUserId: params.state.ownerUserId,
      scopeEpoch: params.state.scopeEpoch,
      signedRecordCbor: params.state.signedRecordCbor,
      members: params.state.members,
      signers: params.state.signers,
      sigSuite: params.state.sigSuite,
      signature: params.state.signature,
      createdAt: new Date(),
    };
    this.states.push(newState);
    this.heads.set(params.scopeId.unwrap(), { seq: nextSeq, ref: params.state.scopeStateRef });
    return { seq: nextSeq, ref: params.state.scopeStateRef };
  }

  async getHeadSeq(scopeId: ScopeId): Promise<SequenceNumber> {
    const head = this.heads.get(scopeId.unwrap());
    return head ? head.seq : SequenceNumber.zero();
  }

  async getHeadRef(scopeId: ScopeId): Promise<Buffer | null> {
    const head = this.heads.get(scopeId.unwrap());
    return head ? head.ref : null;
  }

  async loadSince(scopeId: ScopeId, since: SequenceNumber, limit: number): Promise<ScopeState[]> {
    return this.states
      .filter((s) => s.scopeId.equals(scopeId) && s.scopeStateSeq.unwrap() > since.unwrap())
      .slice(0, limit);
  }

  async loadByRef(scopeStateRef: Buffer): Promise<ScopeState | null> {
    return this.states.find((s) => s.scopeStateRef.equals(scopeStateRef)) || null;
  }
}

class InMemoryKeyEnvelopeRepository extends KeyEnvelopeRepository {
  private envelopes: KeyEnvelope[] = [];

  async createEnvelope(envelope: KeyEnvelopeInput): Promise<void> {
    const newEnvelope: KeyEnvelope = {
      envelopeId: envelope.envelopeId,
      scopeId: envelope.scopeId,
      recipientUserId: envelope.recipientUserId,
      scopeEpoch: envelope.scopeEpoch,
      recipientUkPubFingerprint: envelope.recipientUkPubFingerprint,
      ciphersuite: envelope.ciphersuite,
      ciphertext: envelope.ciphertext,
      metadata: envelope.metadata,
      createdAt: new Date(),
    };
    this.envelopes.push(newEnvelope);
  }

  async getEnvelopes(scopeId: ScopeId, recipientUserId: string, scopeEpoch?: bigint): Promise<KeyEnvelope[]> {
    return this.envelopes.filter(
      (e) =>
        e.scopeId.equals(scopeId) &&
        e.recipientUserId === recipientUserId &&
        (scopeEpoch === undefined || e.scopeEpoch === scopeEpoch)
    );
  }
}

describe('ScopeService', () => {
  let scopeStateRepo: InMemoryScopeStateRepository;
  let envelopeRepo: InMemoryKeyEnvelopeRepository;
  let service: ScopeService;

  beforeEach(() => {
    scopeStateRepo = new InMemoryScopeStateRepository();
    envelopeRepo = new InMemoryKeyEnvelopeRepository();
    service = new ScopeService(scopeStateRepo, envelopeRepo);
  });

  it('appends membership and returns stream', async () => {
    const scopeId = ScopeId.from('scope-1');
    const ref1 = Buffer.from('ref1', 'hex');

    await service.appendMembership(scopeId, SequenceNumber.zero(), {
      prevHash: null,
      scopeStateRef: ref1,
      ownerUserId: 'user-1',
      scopeEpoch: 1n,
      signedRecordCbor: Buffer.from('cbor1'),
      members: { 'user-1': { role: 'owner' } },
      signers: {},
      sigSuite: 'ed25519',
      signature: Buffer.from('sig1'),
    });

    const stream = await service.getMembershipStream(scopeId, SequenceNumber.zero(), 10);
    expect(stream.states).toHaveLength(1);
    expect(stream.states[0]?.scopeStateSeq.unwrap()).toBe(1n);
    expect(stream.hasMore).toBe(false);
    expect(stream.nextSince).toBeNull();
  });

  it('creates and retrieves key envelopes', async () => {
    const scopeId = ScopeId.from('scope-1');
    const envelopeId = EnvelopeId.from('env-1');

    await service.createEnvelope({
      envelopeId,
      scopeId,
      recipientUserId: 'user-2',
      scopeEpoch: 1n,
      recipientUkPubFingerprint: Buffer.from('fingerprint'),
      ciphersuite: 'hybrid-kem-1',
      ciphertext: Buffer.from('encrypted'),
      metadata: null,
    });

    const envelopes = await service.getEnvelopes(scopeId, 'user-2');
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]?.envelopeId.unwrap()).toBe('env-1');
  });

  it('paginates membership stream', async () => {
    const scopeId = ScopeId.from('scope-1');

    for (let i = 1; i <= 5; i++) {
      await service.appendMembership(scopeId, SequenceNumber.from(i - 1), {
        prevHash: i === 1 ? null : Buffer.from(`ref${i - 1}`),
        scopeStateRef: Buffer.from(`ref${i}`),
        ownerUserId: 'user-1',
        scopeEpoch: BigInt(i),
        signedRecordCbor: Buffer.from(`cbor${i}`),
        members: {},
        signers: {},
        sigSuite: 'ed25519',
        signature: Buffer.from(`sig${i}`),
      });
    }

    const page1 = await service.getMembershipStream(scopeId, SequenceNumber.zero(), 2);
    expect(page1.states).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextSince?.unwrap()).toBe(2n);

    const page2 = await service.getMembershipStream(scopeId, SequenceNumber.from(2), 2);
    expect(page2.states).toHaveLength(2);
    expect(page2.hasMore).toBe(true);
  });
});
