/**
 * Wrapper for resource grant identifier.
 */
export class GrantId {
  private constructor(private readonly value: string) {}

  static from(value: string): GrantId {
    if (!value || value.trim().length === 0) {
      throw new Error('GrantId cannot be empty');
    }
    return new GrantId(value);
  }

  unwrap(): string {
    return this.value;
  }

  equals(other: GrantId): boolean {
    return this.value === other.value;
  }
}
