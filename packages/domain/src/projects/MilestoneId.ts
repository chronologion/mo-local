import { Assert } from '../shared/Assert';
import { uuidv7 } from '../utils/uuid';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MilestoneId {
  private constructor(private readonly _value: string) {
    Assert.that(_value, 'MilestoneId').matches(UUID_REGEX);
  }

  static create(): MilestoneId {
    return new MilestoneId(uuidv7());
  }

  static of(value: string): MilestoneId {
    return new MilestoneId(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: MilestoneId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
