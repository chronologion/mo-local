/**
 * Wrapper for resource identifier.
 */
export class ResourceId {
  private constructor(private readonly value: string) {}

  static from(value: string): ResourceId {
    if (!value || value.trim().length === 0) {
      throw new Error('ResourceId cannot be empty');
    }
    return new ResourceId(value);
  }

  unwrap(): string {
    return this.value;
  }

  equals(other: ResourceId): boolean {
    return this.value === other.value;
  }
}
