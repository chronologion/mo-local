/**
 * Wrapper for monotonic sequence numbers used in ScopeState, ResourceGrant, and KeyVault streams.
 * Uses bigint to support values beyond JavaScript's safe integer limit (2^53-1).
 */
export class SequenceNumber {
  private constructor(private readonly value: bigint) {}

  static from(value: bigint | number | string): SequenceNumber {
    const bigintValue = typeof value === 'bigint' ? value : BigInt(value);
    if (bigintValue < 0n) {
      throw new Error('SequenceNumber must be non-negative');
    }
    return new SequenceNumber(bigintValue);
  }

  static zero(): SequenceNumber {
    return new SequenceNumber(0n);
  }

  unwrap(): bigint {
    return this.value;
  }

  toString(): string {
    return this.value.toString();
  }

  equals(other: SequenceNumber): boolean {
    return this.value === other.value;
  }

  increment(): SequenceNumber {
    return new SequenceNumber(this.value + 1n);
  }
}
