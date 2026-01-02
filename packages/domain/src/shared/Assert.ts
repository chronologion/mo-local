/**
 * Fluent assertion DSL for domain invariants.
 *
 * Provides a readable, expressive API for validating domain rules.
 *
 * @example
 * ```typescript
 * Assert.that(value).isNonEmpty();
 * Assert.that(month).isBetween(1, 12);
 * Assert.that(slice).isOneOf(['Health', 'Work']);
 * Assert.that(archivedAt).isNull();
 * ```
 */
export class Assert<T> {
  private constructor(
    private readonly value: T,
    private readonly name?: string
  ) {}

  static that<T>(value: T, name?: string): Assert<T> {
    return new Assert(value, name);
  }

  // === String Assertions ===

  isNonEmpty(): this {
    if (typeof this.value !== 'string' || this.value.length === 0) {
      throw new Error(this.formatError('must be a non-empty string', this.value));
    }
    return this;
  }

  matches(pattern: RegExp): this {
    if (typeof this.value !== 'string' || !pattern.test(this.value)) {
      throw new Error(this.formatError(`must match pattern ${pattern}`, this.value));
    }
    return this;
  }

  // === Number Assertions ===

  isGreaterThan(min: number): this {
    if (typeof this.value !== 'number' || this.value <= min) {
      throw new Error(this.formatError(`must be greater than ${min}`, this.value));
    }
    return this;
  }

  isGreaterThanOrEqual(min: number): this {
    if (typeof this.value !== 'number' || this.value < min) {
      throw new Error(this.formatError(`must be greater than or equal to ${min}`, this.value));
    }
    return this;
  }

  isLessThanOrEqual(max: number): this {
    if (typeof this.value !== 'number' || this.value > max) {
      throw new Error(this.formatError(`must be less than or equal to ${max}`, this.value));
    }
    return this;
  }

  isBetween(min: number, max: number): this {
    if (typeof this.value !== 'number' || this.value < min || this.value > max) {
      throw new Error(this.formatError(`must be between ${min} and ${max}`, this.value));
    }
    return this;
  }

  isInteger(): this {
    if (typeof this.value !== 'number' || !Number.isInteger(this.value)) {
      throw new Error(this.formatError('must be an integer', this.value));
    }
    return this;
  }

  // === Array/Set Assertions ===

  isOneOf(allowed: readonly T[]): this {
    if (!allowed.includes(this.value)) {
      throw new Error(this.formatError(`must be one of [${allowed.join(', ')}]`, this.value));
    }
    return this;
  }

  // === Equality Assertions ===

  equals(other: T): this {
    if (this.value !== other) {
      throw new Error(this.formatError(`must equal ${String(other)}`, this.value));
    }
    return this;
  }

  doesNotEqual(other: T): this {
    if (this.value === other) {
      throw new Error(this.formatError(`must not equal ${String(other)}`, this.value));
    }
    return this;
  }

  // === Nullability Assertions ===

  isDefined(): this {
    if (this.value === undefined || this.value === null) {
      throw new Error(this.formatError('must be defined', this.value));
    }
    return this;
  }

  isNull(): this {
    if (this.value !== null) {
      throw new Error(this.formatError('must be null', this.value));
    }
    return this;
  }

  // === Boolean Assertions ===

  isTrue(): this {
    if (this.value !== true) {
      throw new Error(this.formatError('must be true', this.value));
    }
    return this;
  }

  isFalse(): this {
    if (this.value !== false) {
      throw new Error(this.formatError('must be false', this.value));
    }
    return this;
  }

  // === Custom Predicate ===

  satisfies(predicate: (value: T) => boolean, errorMessage?: string): this {
    if (!predicate(this.value)) {
      throw new Error(this.formatError(errorMessage || 'must satisfy predicate', this.value));
    }
    return this;
  }

  // === Private Helpers ===

  private formatError(message: string, value: unknown): string {
    const prefix = this.name ? `${this.name} ` : 'Value ';
    const valueStr = value === undefined ? 'undefined' : value === null ? 'null' : JSON.stringify(value);
    return `${prefix}${message}, got: ${valueStr}`;
  }
}
