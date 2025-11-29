import { Assert } from './../shared/Assert';

/**
 * Value object representing a goal's summary text.
 *
 * Enforces non-empty constraint.
 */
export class Summary {
  private constructor(private readonly _value: string) {
    Assert.that(_value, 'Summary').isNonEmpty();
  }

  static of(value: string): Summary {
    return new Summary(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: Summary): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
