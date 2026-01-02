import { Assert } from '../../shared/Assert';
import { ValueObject } from '../../shared/vos/ValueObject';

export class ProjectDescription extends ValueObject<string> {
  private constructor(private readonly _value: string) {
    super();
    Assert.that(_value.length, 'ProjectDescription length').isLessThanOrEqual(2000);
  }

  static empty(): ProjectDescription {
    return new ProjectDescription('');
  }

  static from(value: string): ProjectDescription {
    return new ProjectDescription(value);
  }

  get value(): string {
    return this._value;
  }
}
