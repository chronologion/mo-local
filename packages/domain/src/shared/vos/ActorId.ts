import { Assert } from '../Assert';
import { ValueObject } from './ValueObject';

/**
 * Value object representing the actor responsible for an event.
 */
export class ActorId extends ValueObject<string> {
  protected readonly _value: string;

  protected constructor(value: string) {
    super();
    Assert.that(value, 'ActorId').isNonEmpty();
    this._value = value;
  }

  static from(value: string): ActorId {
    return new ActorId(value);
  }

  get value(): string {
    return this._value;
  }
}
