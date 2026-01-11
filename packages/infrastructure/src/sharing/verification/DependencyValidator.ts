import { ScopeStateStore } from '../stores/ScopeStateStore';
import { ResourceGrantStore } from '../stores/ResourceGrantStore';

/**
 * Dependency validation result.
 */
export type DependencyValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'scope_state_missing' | 'grant_missing' | 'grant_revoked';
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
   * Validate that a ScopeState's prevHash dependency exists (for hash chain validation).
   *
   * @param prevHash - Previous hash in chain (null for genesis)
   * @returns Validation result
   */
  async validateScopeStatePrevHash(prevHash: Uint8Array | null): Promise<DependencyValidationResult> {
    // Genesis records have no prevHash
    if (prevHash === null) {
      return { ok: true };
    }

    // Check prevHash exists
    const exists = await this.scopeStateStore.exists(prevHash);
    if (!exists) {
      return {
        ok: false,
        reason: 'scope_state_missing',
        details: `Previous ScopeState with ref ${Buffer.from(prevHash).toString('hex')} not found (hash chain violation)`,
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
