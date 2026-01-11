import { Scope, ScopeId } from '@mo/domain';
import { Option } from '../../shared/types';

/**
 * Repository port for Scope aggregate.
 *
 * Follows the same pattern as GoalRepositoryPort and ProjectRepositoryPort.
 */
export interface ScopeRepositoryPort {
  /**
   * Load a Scope by ID.
   *
   * @param id - Scope identifier
   * @returns Option containing the scope or none if not found
   */
  load(id: ScopeId): Promise<Option<Scope>>;

  /**
   * Save a Scope aggregate.
   *
   * @param scope - Scope aggregate to save
   * @param encryptionKey - Encryption key (required for new scopes, null for updates)
   */
  save(scope: Scope, encryptionKey: Uint8Array | null): Promise<void>;
}
