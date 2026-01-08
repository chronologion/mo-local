import { Assert } from '../Assert';
import { uuidv4 } from '../../utils/uuid';
import { ValueObject } from './ValueObject';

/**
 * Value object representing a unique event identifier.
 */
export class EventId extends ValueObject<string> {
  private constructor(private readonly _value: string) {
    super();
    Assert.that(_value, 'EventId').isNonEmpty();
  }

  static from(value: string): EventId {
    return new EventId(value);
  }

  static create(): EventId {
    return new EventId(uuidv4());
  }

  get value(): string {
    return this._value;
  }
}
