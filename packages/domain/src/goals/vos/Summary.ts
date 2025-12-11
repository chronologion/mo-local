import { Assert } from '../../shared/Assert';
import { ValueObject } from '../../shared/vos/ValueObject';

/**
 * Value object representing a goal's summary text.
 *
 * Enforces non-empty constraint.
 */
export class Summary extends ValueObject<string> {
  private constructor(private readonly _value: string) {
    super();
    Assert.that(_value, 'Summary').isNonEmpty();
  }

  static from(value: string): Summary {
    return new Summary(value);
  }

  get value(): string {
    return this._value;
  }
}
