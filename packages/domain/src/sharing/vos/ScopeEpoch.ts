import { Assert } from '../../shared/Assert';
import { ValueObject } from '../../shared/vos/ValueObject';

/**
 * Value object representing a Scope's epoch counter.
 *
 * Epochs are monotonically increasing counters that increment on key rotation.
 * Each epoch change invalidates previous grants, forcing key re-distribution.
 *
 * @example
 * ```typescript
 * const epoch = ScopeEpoch.zero();
 * const next = epoch.increment();
 * if (next.isGreaterThan(epoch)) {
 *   // Key rotation occurred
 * }
 * ```
 */
export class ScopeEpoch extends ValueObject<bigint> {
  private constructor(private readonly _value: bigint) {
    super();
    Assert.that(_value >= 0n, 'ScopeEpoch must be non-negative');
  }

  /**
   * Create a ScopeEpoch from a bigint value.
   */
  static from(value: bigint): ScopeEpoch {
    return new ScopeEpoch(value);
  }

  /**
   * Create a ScopeEpoch from a string representation.
   */
  static fromString(value: string): ScopeEpoch {
    const parsed = BigInt(value);
    return new ScopeEpoch(parsed);
  }

  /**
   * Create the initial epoch (0).
   */
  static zero(): ScopeEpoch {
    return new ScopeEpoch(0n);
  }

  /**
   * Increment the epoch by 1.
   */
  increment(): ScopeEpoch {
    return new ScopeEpoch(this._value + 1n);
  }

  /**
   * Check if this epoch is greater than another.
   */
  isGreaterThan(other: ScopeEpoch): boolean {
    return this._value > other._value;
  }

  /**
   * Check if this epoch equals another.
   */
  equals(other: ScopeEpoch): boolean {
    return this._value === other._value;
  }

  get value(): bigint {
    return this._value;
  }

  /**
   * Convert to string representation for transport/persistence.
   */
  toString(): string {
    return this._value.toString();
  }
}
