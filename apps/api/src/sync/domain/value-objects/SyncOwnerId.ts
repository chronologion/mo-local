/**
 * Strongly typed wrapper for the authenticated identity id that owns a sync stream.
 */
export class SyncOwnerId {
  private constructor(private readonly value: string) {}

  static from(value: string): SyncOwnerId {
    if (!value || value.trim().length === 0) {
      throw new Error('SyncOwnerId cannot be empty');
    }
    return new SyncOwnerId(value);
  }

  unwrap(): string {
    return this.value;
  }
}
