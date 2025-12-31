/**
 * Wrapper for the store identifier used to partition sync streams.
 */
export class SyncStoreId {
  private constructor(private readonly value: string) {}

  static from(value: string): SyncStoreId {
    if (!value || value.trim().length === 0) {
      throw new Error('SyncStoreId cannot be empty');
    }
    return new SyncStoreId(value);
  }

  unwrap(): string {
    return this.value;
  }
}
