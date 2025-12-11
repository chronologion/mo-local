/**
 * Base class for all value objects in the domain.
 *
 * Encapsulates an immutable value and provides common equality
 * and stringification semantics. Concrete value objects should
 * expose their underlying value via the `value` getter and keep
 * any transport / persistence concerns out of this layer.
 */
export abstract class ValueObject<TValue> {
  protected constructor() {
    // No-op: concrete value objects are responsible for
    // storing their internal representation.
  }

  /**
   * Underlying value of this value object.
   *
   * Concrete implementations decide what the canonical
   * representation is (string, number, struct, etc.).
   */
  abstract get value(): TValue;

  /**
   * Structural equality based on the exposed `value`.
   *
   * Value objects with the same underlying value are considered equal,
   * regardless of object identity.
   */
  equals(other: ValueObject<TValue>): boolean {
    // Use Object.is to handle edge cases like -0 / +0 and NaN.
    return Object.is(this.value, other.value);
  }

  /**
   * Default string representation delegates to the underlying value.
   */
  toString(): string {
    const v = this.value as unknown;
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
}
