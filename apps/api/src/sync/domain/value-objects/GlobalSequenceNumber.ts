/**
 * Wrapper for the server-assigned global sequence number.
 */
export class GlobalSequenceNumber {
  private constructor(private readonly value: number) {}

  static from(value: number): GlobalSequenceNumber {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error('GlobalSequenceNumber must be a non-negative integer');
    }
    return new GlobalSequenceNumber(value);
  }

  unwrap(): number {
    return this.value;
  }
}
