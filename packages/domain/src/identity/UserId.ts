import { Assert } from './../shared/Assert';
import { ValueObject } from '../shared/vos/ValueObject';

/**
 * Value object representing a user's unique identifier.
 */
export class UserId extends ValueObject<string> {
  private constructor(private readonly _value: string) {
    super();
    Assert.that(_value, 'UserId').isNonEmpty();
  }

  static from(value: string): UserId {
    return new UserId(value);
  }

  get value(): string {
    return this._value;
  }
}
