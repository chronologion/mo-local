import { Assert } from '../../shared/Assert';
import { AggregateId } from '../../shared/vos/AggregateId';
import { uuidv4 } from '../../utils/uuid';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ProjectId extends AggregateId {
  private constructor(private readonly _value: string) {
    super();
    Assert.that(_value, 'ProjectId').matches(UUID_REGEX);
  }

  static create(): ProjectId {
    return new ProjectId(uuidv4());
  }

  static from(value: string): ProjectId {
    return new ProjectId(value);
  }

  get value(): string {
    return this._value;
  }
}
