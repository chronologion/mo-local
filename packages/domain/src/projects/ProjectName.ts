import { Assert } from '../shared/Assert';

export class ProjectName {
  private constructor(private readonly _value: string) {
    Assert.that(_value.trim(), 'ProjectName').isNonEmpty();
    Assert.that(_value.length, 'ProjectName length').isLessThanOrEqual(200);
  }

  static of(value: string): ProjectName {
    return new ProjectName(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: ProjectName): boolean {
    return this._value === other._value;
  }
}
