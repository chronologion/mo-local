import { Injectable } from '@nestjs/common';
import { ScopeStateRepository, ScopeStateInput } from './ports/scope-state-repository';
import { KeyEnvelopeRepository, KeyEnvelopeInput } from './ports/key-envelope-repository';
import { ScopeId } from '../domain/value-objects/ScopeId';
import { SequenceNumber } from '../domain/value-objects/SequenceNumber';
import { UserId } from '../domain/value-objects/UserId';
import { ScopeState } from '../domain/entities/ScopeState';
import { KeyEnvelope } from '../domain/entities/KeyEnvelope';

/**
 * Application service for scope management operations.
 * Orchestrates repository interactions for ScopeState and KeyEnvelope.
 */
@Injectable()
export class ScopeService {
  constructor(
    private readonly scopeStateRepo: ScopeStateRepository,
    private readonly envelopeRepo: KeyEnvelopeRepository
  ) {}

  /**
   * Append a new ScopeState record with optimistic concurrency.
   */
  async appendMembership(
    scopeId: ScopeId,
    expectedHead: SequenceNumber,
    state: ScopeStateInput
  ): Promise<{ seq: SequenceNumber; ref: Buffer }> {
    return await this.scopeStateRepo.appendState({
      scopeId,
      expectedHead,
      state,
    });
  }

  /**
   * Get current head sequence for a scope.
   */
  async getHeadSeq(scopeId: ScopeId): Promise<SequenceNumber> {
    return await this.scopeStateRepo.getHeadSeq(scopeId);
  }

  /**
   * Get current head ref for a scope.
   */
  async getHeadRef(scopeId: ScopeId): Promise<Buffer | null> {
    return await this.scopeStateRepo.getHeadRef(scopeId);
  }

  /**
   * Get membership delta stream since a given sequence.
   */
  async getMembershipStream(
    scopeId: ScopeId,
    since: SequenceNumber,
    limit: number
  ): Promise<{ states: ScopeState[]; hasMore: boolean; nextSince: SequenceNumber | null }> {
    const states = await this.scopeStateRepo.loadSince(scopeId, since, limit);
    const hasMore = states.length === limit;
    const nextSince = hasMore ? states[states.length - 1].scopeStateSeq : null;

    return { states, hasMore, nextSince };
  }

  /**
   * Create a key envelope for a recipient.
   */
  async createEnvelope(envelope: KeyEnvelopeInput): Promise<void> {
    await this.envelopeRepo.createEnvelope(envelope);
  }

  /**
   * Get key envelopes for a recipient in a scope.
   */
  async getEnvelopes(scopeId: ScopeId, recipientUserId: UserId, scopeEpoch?: bigint): Promise<KeyEnvelope[]> {
    return await this.envelopeRepo.getEnvelopes(scopeId, recipientUserId, scopeEpoch);
  }

  /**
   * Load a ScopeState by its reference hash.
   */
  async loadByRef(scopeStateRef: Buffer): Promise<ScopeState | null> {
    return await this.scopeStateRepo.loadByRef(scopeStateRef);
  }
}
