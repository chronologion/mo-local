import { Assert } from '../../shared/Assert';
import { ValueObject } from '../../shared/vos/ValueObject';
import { uuidv4 } from '../../utils/uuid';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MilestoneId extends ValueObject<string> {
  private constructor(private readonly _value: string) {
    super();
    Assert.that(_value, 'MilestoneId').matches(UUID_REGEX);
  }

  static create(): MilestoneId {
    return new MilestoneId(uuidv4());
  }

  static from(value: string): MilestoneId {
    return new MilestoneId(value);
  }

  get value(): string {
    return this._value;
  }
}
