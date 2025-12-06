import { Assert } from '../shared/Assert';
import { uuidv7 } from '../utils/uuid';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ProjectId {
  private constructor(private readonly _value: string) {
    Assert.that(_value, 'ProjectId').matches(UUID_REGEX);
  }

  static create(): ProjectId {
    return new ProjectId(uuidv7());
  }

  static of(value: string): ProjectId {
    return new ProjectId(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: ProjectId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
