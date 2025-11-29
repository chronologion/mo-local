import { Assert } from './../shared/Assert';

/**
 * Value object representing a user's unique identifier.
 */
export class UserId {
  private constructor(private readonly _value: string) {
    Assert.that(_value, 'UserId').isNonEmpty();
  }

  static of(value: string): UserId {
    return new UserId(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: UserId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
