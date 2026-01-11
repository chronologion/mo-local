import type { SqliteDbPort } from '@mo/eventstore-web';

/**
 * Verified ResourceGrant record stored in local cache.
 */
export type VerifiedResourceGrant = Readonly<{
  grantId: string;
  scopeId: string;
  resourceId: string;
  resourceKeyId: string;
  wrappedKey: Uint8Array;
  scopeStateRef: Uint8Array;
  status: 'active' | 'revoked';
  verifiedAt: number;
}>;

/**
 * ResourceGrantStore manages the local cache of verified ResourceGrant records.
 *
 * **Purpose:**
 * - Cache verified ResourceGrant records after signature verification
 * - Provide fast lookups by grantId for dependency validation
 * - Track grant status (active/revoked) for access control
 *
 * **Storage:** SQLite table `resource_grants`
 */
export class ResourceGrantStore {
  constructor(private readonly db: SqliteDbPort) {}

  /**
   * Store a verified ResourceGrant in the cache.
   *
   * @param grant - Verified resource grant record
   */
  async store(grant: VerifiedResourceGrant): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO resource_grants (
        grant_id,
        scope_id,
        resource_id,
        resource_key_id,
        wrapped_key,
        scope_state_ref,
        status,
        verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        grant.grantId,
        grant.scopeId,
        grant.resourceId,
        grant.resourceKeyId,
        grant.wrappedKey,
        grant.scopeStateRef,
        grant.status,
        grant.verifiedAt,
      ]
    );
  }

  /**
   * Load a verified ResourceGrant by its ID.
   *
   * @param grantId - Grant identifier
   * @returns Verified grant or null if not found
   */
  async loadById(grantId: string): Promise<VerifiedResourceGrant | null> {
    const row = await this.db.get<{
      grant_id: string;
      scope_id: string;
      resource_id: string;
      resource_key_id: string;
      wrapped_key: Uint8Array;
      scope_state_ref: Uint8Array;
      status: string;
      verified_at: number;
    }>('SELECT * FROM resource_grants WHERE grant_id = ?', [grantId]);

    if (!row) return null;

    return {
      grantId: row.grant_id,
      scopeId: row.scope_id,
      resourceId: row.resource_id,
      resourceKeyId: row.resource_key_id,
      wrappedKey: new Uint8Array(row.wrapped_key),
      scopeStateRef: new Uint8Array(row.scope_state_ref),
      status: row.status as 'active' | 'revoked',
      verifiedAt: row.verified_at,
    };
  }

  /**
   * Load all verified ResourceGrants for a given scope.
   *
   * @param scopeId - Scope identifier
   * @param includeRevoked - Whether to include revoked grants
   * @returns Array of verified grants
   */
  async loadByScopeId(scopeId: string, includeRevoked = false): Promise<VerifiedResourceGrant[]> {
    const sql = includeRevoked
      ? 'SELECT * FROM resource_grants WHERE scope_id = ?'
      : 'SELECT * FROM resource_grants WHERE scope_id = ? AND status = ?';

    const params = includeRevoked ? [scopeId] : [scopeId, 'active'];

    const rows = await this.db.all<{
      grant_id: string;
      scope_id: string;
      resource_id: string;
      resource_key_id: string;
      wrapped_key: Uint8Array;
      scope_state_ref: Uint8Array;
      status: string;
      verified_at: number;
    }>(sql, params);

    return rows.map((row) => ({
      grantId: row.grant_id,
      scopeId: row.scope_id,
      resourceId: row.resource_id,
      resourceKeyId: row.resource_key_id,
      wrappedKey: new Uint8Array(row.wrapped_key),
      scopeStateRef: new Uint8Array(row.scope_state_ref),
      status: row.status as 'active' | 'revoked',
      verifiedAt: row.verified_at,
    }));
  }

  /**
   * Load verified ResourceGrants for a given resource.
   *
   * @param resourceId - Resource identifier
   * @param includeRevoked - Whether to include revoked grants
   * @returns Array of verified grants
   */
  async loadByResourceId(resourceId: string, includeRevoked = false): Promise<VerifiedResourceGrant[]> {
    const sql = includeRevoked
      ? 'SELECT * FROM resource_grants WHERE resource_id = ?'
      : 'SELECT * FROM resource_grants WHERE resource_id = ? AND status = ?';

    const params = includeRevoked ? [resourceId] : [resourceId, 'active'];

    const rows = await this.db.all<{
      grant_id: string;
      scope_id: string;
      resource_id: string;
      resource_key_id: string;
      wrapped_key: Uint8Array;
      scope_state_ref: Uint8Array;
      status: string;
      verified_at: number;
    }>(sql, params);

    return rows.map((row) => ({
      grantId: row.grant_id,
      scopeId: row.scope_id,
      resourceId: row.resource_id,
      resourceKeyId: row.resource_key_id,
      wrappedKey: new Uint8Array(row.wrapped_key),
      scopeStateRef: new Uint8Array(row.scope_state_ref),
      status: row.status as 'active' | 'revoked',
      verifiedAt: row.verified_at,
    }));
  }

  /**
   * Check if a ResourceGrant exists in the cache.
   *
   * @param grantId - Grant identifier
   * @returns true if exists
   */
  async exists(grantId: string): Promise<boolean> {
    const row = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM resource_grants WHERE grant_id = ?',
      [grantId]
    );
    return (row?.count ?? 0) > 0;
  }

  /**
   * Check if a ResourceGrant is active (not revoked).
   *
   * @param grantId - Grant identifier
   * @returns true if active, false if revoked or not found
   */
  async isActive(grantId: string): Promise<boolean> {
    const row = await this.db.get<{ status: string }>('SELECT status FROM resource_grants WHERE grant_id = ?', [
      grantId,
    ]);
    return row?.status === 'active';
  }
}
