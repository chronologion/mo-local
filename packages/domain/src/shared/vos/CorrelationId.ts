import { Assert } from '../Assert';
import { ValueObject } from './ValueObject';

/**
 * Value object representing a correlation identifier for tracing workflows.
 */
export class CorrelationId extends ValueObject<string> {
  private constructor(private readonly _value: string) {
    super();
    Assert.that(_value, 'CorrelationId').isNonEmpty();
  }

  static from(value: string): CorrelationId {
    return new CorrelationId(value);
  }

  get value(): string {
    return this._value;
  }
}
