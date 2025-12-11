import { Assert } from '../Assert';
import { ValueObject } from './ValueObject';

/**
 * Value object representing a day-precision local date (YYYY-MM-DD).
 * Timezone agnostic; never stores time-of-day.
 */
export class LocalDate extends ValueObject<string> {
  private static readonly ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  private constructor(private readonly _value: string) {
    Assert.that(_value, 'LocalDate').matches(LocalDate.ISO_DATE_REGEX);
    super();
  }

  static today(): LocalDate {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return new LocalDate(`${year}-${month}-${day}`);
  }

  static from(year: number, month: number, day: number): LocalDate {
    Assert.that(year, 'year').isGreaterThanOrEqual(1);
    Assert.that(month, 'month').isBetween(1, 12);
    Assert.that(day, 'day').isBetween(1, 31);
    const value = `${String(year).padStart(4, '0')}-${String(month).padStart(
      2,
      '0'
    )}-${String(day).padStart(2, '0')}`;
    return new LocalDate(value);
  }

  static fromString(value: string): LocalDate {
    return new LocalDate(value);
  }

  get year(): number {
    return Number(this._value.slice(0, 4));
  }

  get month(): number {
    return Number(this._value.slice(5, 7));
  }

  get day(): number {
    return Number(this._value.slice(8, 10));
  }

  isBefore(other: LocalDate): boolean {
    return this._value < other._value;
  }

  isAfter(other: LocalDate): boolean {
    return this._value > other._value;
  }

  isSameOrBefore(other: LocalDate): boolean {
    return this._value <= other._value;
  }

  isSameOrAfter(other: LocalDate): boolean {
    return this._value >= other._value;
  }

  toString(): string {
    return this._value;
  }

  get value(): string {
    return this._value;
  }
}
