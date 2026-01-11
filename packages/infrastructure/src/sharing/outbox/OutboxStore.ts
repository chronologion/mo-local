import type { SqliteDbPort } from '@mo/eventstore-web';

/**
 * Artifact type in the crypto outbox.
 */
export type OutboxArtifactType = 'scope_state' | 'grant' | 'event';

/**
 * Status of an outbox artifact.
 */
export type OutboxArtifactStatus = 'pending' | 'pushed';

/**
 * Artifact in the crypto outbox.
 */
export type OutboxArtifact = Readonly<{
  artifactId: string;
  artifactType: OutboxArtifactType;
  payload: string; // JSON-encoded artifact data
  dependencies: readonly string[]; // Array of dependency artifact IDs
  status: OutboxArtifactStatus;
  enqueuedAt: number;
}>;

type OutboxRow = Readonly<{
  artifact_id: string;
  artifact_type: string;
  payload: string;
  dependencies: string;
  status: string;
  enqueued_at: number;
}>;

/**
 * OutboxStore manages persistent storage for the crypto outbox.
 *
 * **Purpose:**
 * - Queue artifacts for push with dependency tracking
 * - Support topological sort for causal ordering
 * - Track push status to avoid duplicate pushes
 *
 * **Storage:** SQLite table `crypto_outbox`
 */
export class OutboxStore {
  constructor(private readonly db: SqliteDbPort) {}

  /**
   * Enqueue an artifact for push.
   *
   * @param artifact - Artifact to enqueue
   */
  async enqueue(artifact: OutboxArtifact): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO crypto_outbox (
        artifact_id,
        artifact_type,
        payload,
        dependencies,
        status,
        enqueued_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        artifact.artifactId,
        artifact.artifactType,
        artifact.payload,
        JSON.stringify(artifact.dependencies),
        artifact.status,
        artifact.enqueuedAt,
      ]
    );
  }

  /**
   * Load all pending artifacts.
   *
   * @returns Array of pending artifacts
   */
  async loadPending(): Promise<OutboxArtifact[]> {
    const rows = await this.db.query<OutboxRow>(
      'SELECT * FROM crypto_outbox WHERE status = ? ORDER BY enqueued_at ASC',
      ['pending']
    );

    return rows.map((row: OutboxRow) => ({
      artifactId: row.artifact_id,
      artifactType: row.artifact_type as OutboxArtifactType,
      payload: row.payload,
      dependencies: JSON.parse(row.dependencies) as string[],
      status: row.status as OutboxArtifactStatus,
      enqueuedAt: row.enqueued_at,
    }));
  }

  /**
   * Load all pushed artifact IDs.
   *
   * Used for validating external dependencies in topological sort.
   *
   * @returns Set of pushed artifact IDs
   */
  async loadPushedIds(): Promise<Set<string>> {
    const rows = await this.db.query<{ artifact_id: string }>(
      'SELECT artifact_id FROM crypto_outbox WHERE status = ?',
      ['pushed']
    );

    return new Set(rows.map((row) => row.artifact_id));
  }

  /**
   * Load a specific artifact by ID.
   *
   * @param artifactId - Artifact identifier
   * @returns Artifact or null if not found
   */
  async loadById(artifactId: string): Promise<OutboxArtifact | null> {
    const rows = await this.db.query<OutboxRow>('SELECT * FROM crypto_outbox WHERE artifact_id = ?', [artifactId]);

    const row = rows[0];
    if (!row) return null;

    return {
      artifactId: row.artifact_id,
      artifactType: row.artifact_type as OutboxArtifactType,
      payload: row.payload,
      dependencies: JSON.parse(row.dependencies) as string[],
      status: row.status as OutboxArtifactStatus,
      enqueuedAt: row.enqueued_at,
    };
  }

  /**
   * Mark an artifact as pushed.
   *
   * @param artifactId - Artifact identifier
   */
  async markPushed(artifactId: string): Promise<void> {
    await this.db.execute('UPDATE crypto_outbox SET status = ? WHERE artifact_id = ?', ['pushed', artifactId]);
  }

  /**
   * Delete an artifact from the outbox.
   *
   * @param artifactId - Artifact identifier
   */
  async delete(artifactId: string): Promise<void> {
    await this.db.execute('DELETE FROM crypto_outbox WHERE artifact_id = ?', [artifactId]);
  }

  /**
   * Clear all pushed artifacts older than a given timestamp.
   *
   * @param olderThan - Timestamp threshold
   */
  async clearPushed(olderThan: number): Promise<void> {
    await this.db.execute('DELETE FROM crypto_outbox WHERE status = ? AND enqueued_at < ?', ['pushed', olderThan]);
  }

  /**
   * Check if an artifact exists in the outbox.
   *
   * @param artifactId - Artifact identifier
   * @returns true if exists
   */
  async exists(artifactId: string): Promise<boolean> {
    const rows = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM crypto_outbox WHERE artifact_id = ?',
      [artifactId]
    );
    return (rows[0]?.count ?? 0) > 0;
  }
}
