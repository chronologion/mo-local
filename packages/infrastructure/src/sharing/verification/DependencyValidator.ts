import { ScopeStateStore } from '../stores/ScopeStateStore';
import { ResourceGrantStore } from '../stores/ResourceGrantStore';

/**
 * Dependency validation result.
 */
export type DependencyValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'scope_state_missing' | 'grant_missing' | 'grant_revoked' | 'scope_id_mismatch';
      details: string;
    };

/**
 * DependencyValidator checks that required artifacts exist in verified caches.
 *
 * **Purpose:**
 * - Validate that scopeStateRef exists before verifying domain events
 * - Validate that grantId exists and is active
 * - Prevent verification of events with missing dependencies
 *
 * **Architecture:**
 * This is step 1 of the verification pipeline:
 * 1. Validate dependencies exist (this class)
 * 2. Resolve signer keys from verified ScopeState
 * 3. Verify signature over CBOR manifest
 * 4. Validate author role/permission
 */
export class DependencyValidator {
  constructor(
    private readonly scopeStateStore: ScopeStateStore,
    private readonly grantStore: ResourceGrantStore
  ) {}

  /**
   * Validate that a domain event's dependencies exist.
   *
   * Checks:
   * 1. scopeStateRef exists in verified cache
   * 2. grantId exists in verified cache
   * 3. grant is active (not revoked)
   *
   * @param scopeStateRef - Hash reference to ScopeState
   * @param grantId - Grant identifier
   * @returns Validation result
   */
  async validateEventDependencies(scopeStateRef: Uint8Array, grantId: string): Promise<DependencyValidationResult> {
    // Check scope state exists
    const scopeStateExists = await this.scopeStateStore.exists(scopeStateRef);
    if (!scopeStateExists) {
      return {
        ok: false,
        reason: 'scope_state_missing',
        details: `ScopeState with ref ${Buffer.from(scopeStateRef).toString('hex')} not found in verified cache`,
      };
    }

    // Check grant exists
    const grantExists = await this.grantStore.exists(grantId);
    if (!grantExists) {
      return {
        ok: false,
        reason: 'grant_missing',
        details: `ResourceGrant ${grantId} not found in verified cache`,
      };
    }

    // Check grant is active
    const isActive = await this.grantStore.isActive(grantId);
    if (!isActive) {
      return {
        ok: false,
        reason: 'grant_revoked',
        details: `ResourceGrant ${grantId} is revoked`,
      };
    }

    return { ok: true };
  }

  /**
   * Validate that a ScopeState's prevHash dependency exists and sequence numbers are correct.
   *
   * @param params - Validation parameters
   * @param params.prevHash - Previous hash in chain (null for genesis)
   * @param params.scopeStateSeq - Sequence number of new state
   * @param params.scopeId - Scope identifier for head validation
   * @returns Validation result
   */
  async validateScopeStatePrevHash(params: {
    prevHash: Uint8Array | null;
    scopeStateSeq: bigint;
    scopeId: string;
  }): Promise<DependencyValidationResult> {
    // Genesis records have no prevHash
    if (params.prevHash === null) {
      if (params.scopeStateSeq !== 0n) {
        return {
          ok: false,
          reason: 'scope_state_missing',
          details: `Genesis ScopeState must have seq=0, got seq=${params.scopeStateSeq}`,
        };
      }
      return { ok: true };
    }

    // Non-genesis: validate hash chain
    if (params.scopeStateSeq === 0n) {
      return {
        ok: false,
        reason: 'scope_state_missing',
        details: 'Non-genesis ScopeState cannot have seq=0',
      };
    }

    // Check prevHash exists
    const prevState = await this.scopeStateStore.loadByRef(params.prevHash);
    if (!prevState) {
      return {
        ok: false,
        reason: 'scope_state_missing',
        details: `Previous ScopeState with ref ${Buffer.from(params.prevHash).toString('hex')} not found (hash chain violation)`,
      };
    }

    // Validate sequence number is exactly prevSeq + 1
    const expectedSeq = prevState.scopeStateSeq + 1n;
    if (params.scopeStateSeq !== expectedSeq) {
      return {
        ok: false,
        reason: 'scope_state_missing',
        details: `Sequence number must be ${expectedSeq}, got ${params.scopeStateSeq}`,
      };
    }

    // Validate prevState belongs to same scope
    if (prevState.scopeId !== params.scopeId) {
      return {
        ok: false,
        reason: 'scope_id_mismatch',
        details: `Previous ScopeState belongs to different scope: ${prevState.scopeId}`,
      };
    }

    // Validate we're extending the current head (fork detection)
    const head = await this.scopeStateStore.getHead(params.scopeId);
    if (head && params.scopeStateSeq <= head.scopeStateSeq) {
      return {
        ok: false,
        reason: 'scope_state_missing',
        details: `Fork detected: new seq ${params.scopeStateSeq} does not extend head seq ${head.scopeStateSeq}`,
      };
    }

    return { ok: true };
  }

  /**
   * Validate that a ResourceGrant's scopeStateRef dependency exists.
   *
   * @param scopeStateRef - Hash reference to ScopeState
   * @returns Validation result
   */
  async validateGrantDependency(scopeStateRef: Uint8Array): Promise<DependencyValidationResult> {
    const exists = await this.scopeStateStore.exists(scopeStateRef);
    if (!exists) {
      return {
        ok: false,
        reason: 'scope_state_missing',
        details: `ScopeState with ref ${Buffer.from(scopeStateRef).toString('hex')} not found in verified cache`,
      };
    }

    return { ok: true };
  }
}
