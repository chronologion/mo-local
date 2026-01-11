import { ResourceGrant, GrantId } from '@mo/domain';
import { Option } from '../../shared/types';

/**
 * Repository port for ResourceGrant aggregate.
 */
export interface ResourceGrantRepositoryPort {
  /**
   * Load a ResourceGrant by ID.
   *
   * @param id - Grant identifier
   * @returns Option containing the grant or none if not found
   */
  load(id: GrantId): Promise<Option<ResourceGrant>>;

  /**
   * Save a ResourceGrant aggregate.
   *
   * @param grant - ResourceGrant aggregate to save
   * @param encryptionKey - Encryption key (required for new grants, null for updates)
   */
  save(grant: ResourceGrant, encryptionKey: Uint8Array | null): Promise<void>;
}
