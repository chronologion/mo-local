/**
 * Wrapper for scope identifier.
 */
export class ScopeId {
  private constructor(private readonly value: string) {}

  static from(value: string): ScopeId {
    if (!value || value.trim().length === 0) {
      throw new Error('ScopeId cannot be empty');
    }
    return new ScopeId(value);
  }

  unwrap(): string {
    return this.value;
  }

  equals(other: ScopeId): boolean {
    return this.value === other.value;
  }
}
