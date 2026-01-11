/**
 * Wrapper for user identifier.
 */
export class UserId {
  private constructor(private readonly value: string) {}

  static from(value: string): UserId {
    if (!value || value.trim().length === 0) {
      throw new Error('UserId cannot be empty');
    }
    return new UserId(value);
  }

  unwrap(): string {
    return this.value;
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }
}
