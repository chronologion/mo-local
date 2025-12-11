import { ValueObject } from './ValueObject';

/**
 * Value object representing a point in time.
 *
 * Canonical representation is epoch milliseconds. Convenience
 * helpers are provided for ISO strings and Date interop, but the
 * domain-facing value is always a number.
 */
export class Timestamp extends ValueObject<number> {
  private constructor(private readonly _value: number) {
    super();
  }

  static now(): Timestamp {
    return new Timestamp(Date.now());
  }

  static fromMillis(value: number): Timestamp {
    if (!Number.isFinite(value)) {
      throw new Error('Timestamp must be a finite number of milliseconds');
    }
    return new Timestamp(value);
  }

  static fromISOString(iso: string): Timestamp {
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) {
      throw new Error('Timestamp is not a valid ISO date');
    }
    return new Timestamp(ms);
  }

  static fromDate(date: Date): Timestamp {
    const ms = date.getTime();
    if (Number.isNaN(ms)) {
      throw new Error('Timestamp is not a valid date');
    }
    return new Timestamp(ms);
  }

  toISOString(): string {
    return new Date(this._value).toISOString();
  }

  toDate(): Date {
    return new Date(this._value);
  }

  isBefore(other: Timestamp): boolean {
    return this._value < other._value;
  }

  isAfter(other: Timestamp): boolean {
    return this._value > other._value;
  }

  equals(other: Timestamp): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this.toISOString();
  }

  get value(): number {
    return this._value;
  }
}
