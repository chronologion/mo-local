import { Assert } from '../../shared/Assert';
import { ValueObject } from '../../shared/vos/ValueObject';

export class MilestoneName extends ValueObject<string> {
  private constructor(private readonly _value: string) {
    super();
    Assert.that(_value.trim(), 'MilestoneName').isNonEmpty();
    Assert.that(_value.length, 'MilestoneName length').isLessThanOrEqual(200);
  }

  static from(value: string): MilestoneName {
    return new MilestoneName(value);
  }

  get value(): string {
    return this._value;
  }
}
