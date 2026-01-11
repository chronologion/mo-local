/**
 * Wrapper for key envelope identifier.
 */
export class EnvelopeId {
  private constructor(private readonly value: string) {}

  static from(value: string): EnvelopeId {
    if (!value || value.trim().length === 0) {
      throw new Error('EnvelopeId cannot be empty');
    }
    return new EnvelopeId(value);
  }

  unwrap(): string {
    return this.value;
  }

  equals(other: EnvelopeId): boolean {
    return this.value === other.value;
  }
}
