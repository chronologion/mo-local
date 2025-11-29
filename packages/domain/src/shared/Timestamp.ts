/**
 * Value object representing a point in time.
 *
 * Wraps Date to make temporal values explicit in the domain model.
 */
export class Timestamp {
  private constructor(private readonly _value: Date) {}

  static now(): Timestamp {
    return new Timestamp(new Date());
  }

  static of(date: Date): Timestamp {
    return new Timestamp(date);
  }

  static fromISOString(iso: string): Timestamp {
    return new Timestamp(new Date(iso));
  }

  get value(): Date {
    return this._value;
  }

  toISOString(): string {
    return this._value.toISOString();
  }

  isBefore(other: Timestamp): boolean {
    return this._value.getTime() < other._value.getTime();
  }

  isAfter(other: Timestamp): boolean {
    return this._value.getTime() > other._value.getTime();
  }

  equals(other: Timestamp): boolean {
    return this._value.getTime() === other._value.getTime();
  }

  toString(): string {
    return this._value.toISOString();
  }
}
