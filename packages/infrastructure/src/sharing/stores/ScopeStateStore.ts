import type { SqliteDbPort } from '@mo/eventstore-web';

/**
 * Verified ScopeState record stored in local cache.
 */
export type VerifiedScopeState = Readonly<{
  scopeStateRef: Uint8Array;
  scopeId: string;
  scopeStateSeq: bigint;
  membersJson: string;
  signersJson: string;
  signature: Uint8Array;
  verifiedAt: number;
}>;

/**
 * Parsed members array from membersJson.
 */
export type ScopeMember = Readonly<{
  userId: string;
  role: string;
}>;

/**
 * Parsed signers array from signersJson.
 */
export type ScopeSigner = Readonly<{
  deviceId: string;
  userId: string;
  sigSuite: string;
  pubKeys: Readonly<Record<string, Uint8Array>>;
}>;

type ScopeStateRow = Readonly<{
  scope_state_ref: Uint8Array;
  scope_id: string;
  scope_state_seq: string;
  members_json: string;
  signers_json: string;
  signature: Uint8Array;
  verified_at: number;
}>;

/**
 * ScopeStateStore manages the local cache of verified ScopeState records.
 *
 * **Purpose:**
 * - Cache verified ScopeState records after signature verification
 * - Provide fast lookups by scopeStateRef for dependency validation
 * - Store signer roster for resolving public keys during verification
 *
 * **Storage:** SQLite table `scope_states`
 */
export class ScopeStateStore {
  constructor(private readonly db: SqliteDbPort) {}

  /**
   * Store a verified ScopeState in the cache.
   *
   * @param state - Verified scope state record
   */
  async store(state: VerifiedScopeState): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO scope_states (
        scope_state_ref,
        scope_id,
        scope_state_seq,
        members_json,
        signers_json,
        signature,
        verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        state.scopeStateRef,
        state.scopeId,
        state.scopeStateSeq.toString(),
        state.membersJson,
        state.signersJson,
        state.signature,
        state.verifiedAt,
      ]
    );
  }

  /**
   * Load a verified ScopeState by its reference hash.
   *
   * @param scopeStateRef - 32-byte hash reference
   * @returns Verified scope state or null if not found
   */
  async loadByRef(scopeStateRef: Uint8Array): Promise<VerifiedScopeState | null> {
    const rows = await this.db.query<ScopeStateRow>('SELECT * FROM scope_states WHERE scope_state_ref = ?', [
      scopeStateRef,
    ]);

    const row = rows[0];
    if (!row) return null;

    return {
      scopeStateRef: new Uint8Array(row.scope_state_ref),
      scopeId: row.scope_id,
      scopeStateSeq: BigInt(row.scope_state_seq),
      membersJson: row.members_json,
      signersJson: row.signers_json,
      signature: new Uint8Array(row.signature),
      verifiedAt: row.verified_at,
    };
  }

  /**
   * Load all verified ScopeStates for a given scope, ordered by sequence.
   *
   * @param scopeId - Scope identifier
   * @returns Array of verified scope states
   */
  async loadByScopeId(scopeId: string): Promise<VerifiedScopeState[]> {
    const rows = await this.db.query<ScopeStateRow>(
      'SELECT * FROM scope_states WHERE scope_id = ? ORDER BY scope_state_seq ASC',
      [scopeId]
    );

    return rows.map((row: ScopeStateRow) => ({
      scopeStateRef: new Uint8Array(row.scope_state_ref),
      scopeId: row.scope_id,
      scopeStateSeq: BigInt(row.scope_state_seq),
      membersJson: row.members_json,
      signersJson: row.signers_json,
      signature: new Uint8Array(row.signature),
      verifiedAt: row.verified_at,
    }));
  }

  /**
   * Get the head (latest) ScopeState for a given scope.
   *
   * Optimized query that only fetches the latest state by sequence number.
   *
   * @param scopeId - Scope identifier
   * @returns Head scope state or null if no states exist
   */
  async getHead(scopeId: string): Promise<VerifiedScopeState | null> {
    const rows = await this.db.query<ScopeStateRow>(
      'SELECT * FROM scope_states WHERE scope_id = ? ORDER BY scope_state_seq DESC LIMIT 1',
      [scopeId]
    );

    const row = rows[0];
    if (!row) return null;

    return {
      scopeStateRef: new Uint8Array(row.scope_state_ref),
      scopeId: row.scope_id,
      scopeStateSeq: BigInt(row.scope_state_seq),
      membersJson: row.members_json,
      signersJson: row.signers_json,
      signature: new Uint8Array(row.signature),
      verifiedAt: row.verified_at,
    };
  }

  /**
   * Parse members from JSON string.
   */
  parseMembers(membersJson: string): ScopeMember[] {
    return JSON.parse(membersJson) as ScopeMember[];
  }

  /**
   * Parse signers from JSON string.
   *
   * Note: pubKeys are stored as base64 strings in JSON, need to decode.
   */
  parseSigners(signersJson: string): ScopeSigner[] {
    const parsed = JSON.parse(signersJson) as Array<{
      deviceId: string;
      userId: string;
      sigSuite: string;
      pubKeys: Record<string, string>;
    }>;

    return parsed.map((signer) => ({
      deviceId: signer.deviceId,
      userId: signer.userId,
      sigSuite: signer.sigSuite,
      pubKeys: Object.fromEntries(
        Object.entries(signer.pubKeys).map(([key, base64]) => [key, Buffer.from(base64, 'base64')])
      ),
    }));
  }

  /**
   * Check if a ScopeState exists in the cache.
   *
   * @param scopeStateRef - 32-byte hash reference
   * @returns true if exists
   */
  async exists(scopeStateRef: Uint8Array): Promise<boolean> {
    const rows = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM scope_states WHERE scope_state_ref = ?',
      [scopeStateRef]
    );
    return (rows[0]?.count ?? 0) > 0;
  }
}
