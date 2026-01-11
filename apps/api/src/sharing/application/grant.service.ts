import { Injectable } from '@nestjs/common';
import { ResourceGrantRepository, ResourceGrantInput } from './ports/resource-grant-repository';
import { GrantId } from '../domain/value-objects/GrantId';
import { ScopeId } from '../domain/value-objects/ScopeId';
import { ResourceId } from '../domain/value-objects/ResourceId';
import { SequenceNumber } from '../domain/value-objects/SequenceNumber';
import { ResourceGrant } from '../domain/entities/ResourceGrant';

/**
 * Application service for resource grant management.
 * Orchestrates repository interactions for ResourceGrant.
 */
@Injectable()
export class GrantService {
  constructor(private readonly grantRepo: ResourceGrantRepository) {}

  /**
   * Append a new ResourceGrant record with optimistic concurrency.
   */
  async appendGrant(
    scopeId: ScopeId,
    expectedHead: SequenceNumber,
    grant: ResourceGrantInput
  ): Promise<{ seq: SequenceNumber; hash: Buffer }> {
    return await this.grantRepo.appendGrant({
      scopeId,
      expectedHead,
      grant,
    });
  }

  /**
   * Get current head sequence for a scope's grant stream.
   */
  async getHeadSeq(scopeId: ScopeId): Promise<SequenceNumber> {
    return await this.grantRepo.getHeadSeq(scopeId);
  }

  /**
   * Get grants delta stream since a given sequence.
   */
  async getGrantStream(
    scopeId: ScopeId,
    since: SequenceNumber,
    limit: number
  ): Promise<{ grants: ResourceGrant[]; hasMore: boolean; nextSince: SequenceNumber | null }> {
    const grants = await this.grantRepo.loadSince(scopeId, since, limit);
    const hasMore = grants.length === limit;
    const nextSince = hasMore ? grants[grants.length - 1].grantSeq : null;

    return { grants, hasMore, nextSince };
  }

  /**
   * Get the active grant for a specific resource in a scope.
   */
  async getActiveGrant(scopeId: ScopeId, resourceId: ResourceId): Promise<ResourceGrant | null> {
    return await this.grantRepo.getActiveGrant(scopeId, resourceId);
  }

  /**
   * Load a grant by its ID.
   */
  async loadByGrantId(grantId: GrantId): Promise<ResourceGrant | null> {
    return await this.grantRepo.loadByGrantId(grantId);
  }
}
