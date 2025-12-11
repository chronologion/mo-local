import { Assert } from '../../shared/Assert';
import { ValueObject } from '../../shared/vos/ValueObject';

export class ProjectName extends ValueObject<string> {
  private constructor(private readonly _value: string) {
    super();
    Assert.that(_value.trim(), 'ProjectName').isNonEmpty();
    Assert.that(_value.length, 'ProjectName length').isLessThanOrEqual(200);
  }

  static from(value: string): ProjectName {
    return new ProjectName(value);
  }

  get value(): string {
    return this._value;
  }
}
