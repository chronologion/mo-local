import { Assert } from '../shared/Assert';

export class ProjectDescription {
  private constructor(private readonly _value: string) {
    Assert.that(_value.length, 'ProjectDescription length').isLessThanOrEqual(
      2000
    );
  }

  static empty(): ProjectDescription {
    return new ProjectDescription('');
  }

  static of(value: string): ProjectDescription {
    return new ProjectDescription(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: ProjectDescription): boolean {
    return this._value === other._value;
  }
}
