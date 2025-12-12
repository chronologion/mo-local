import { Assert } from '../../shared/Assert';
import { ValueObject } from '../../shared/vos/ValueObject';

/**
 * Value object representing a month (YYYY-MM).
 *
 * Provides a fluent API for month comparisons and arithmetic.
 *
 * @example
 * ```typescript
 * const now = Month.now();
 * const target = now.addMonths(6);
 * if (target.isBefore(Month.from('2025-12'))) { ... }
 * ```
 */
export class Month extends ValueObject<string> {
  private constructor(
    private readonly _year: number,
    private readonly _month: number // 1-12
  ) {
    super();
    Assert.that(_year, 'Year').isGreaterThan(2000);
    Assert.that(_month, 'Month').isBetween(1, 12);
  }

  /**
   * Create a Month from a canonical string "YYYY-MM".
   *
   * @throws {Error} if format is invalid
   */
  static from(value: string): Month {
    Assert.that(value, 'Month string').matches(/^\d{4}-\d{2}$/);
    const [year, month] = value.split('-').map(Number);
    return new Month(year, month);
  }

  /**
   * Create a Month from year and month components.
   *
   * @param year - Year (must be > 2000)
   * @param month - Month (1-12)
   * @throws {Error} if year or month is invalid
   */
  static fromComponents(year: number, month: number): Month {
    return new Month(year, month);
  }

  /**
   * Get the current month.
   */
  static now(): Month {
    const date = new Date();
    return new Month(date.getFullYear(), date.getMonth() + 1);
  }

  get year(): number {
    return this._year;
  }

  get month(): number {
    return this._month;
  }

  /**
   * Get the string representation in "YYYY-MM" format.
   */
  get value(): string {
    return `${this._year}-${String(this._month).padStart(2, '0')}`;
  }

  /**
   * Check if this month is before another month.
   *
   * @example
   * ```typescript
   * Month.from('2024-01').isBefore(Month.from('2024-06')) // true
   * ```
   */
  isBefore(other: Month): boolean {
    return (
      this._year < other._year ||
      (this._year === other._year && this._month < other._month)
    );
  }

  /**
   * Check if this month is after another month.
   */
  isAfter(other: Month): boolean {
    return (
      this._year > other._year ||
      (this._year === other._year && this._month > other._month)
    );
  }

  /**
   * Check if this month is the same as another month.
   */
  isSameAs(other: Month): boolean {
    return this.equals(other);
  }

  /**
   * Add months to this month, returning a new Month instance.
   *
   * @example
   * ```typescript
   * Month.from('2024-10').addMonths(3) // Month.from('2025-01')
   * Month.from('2024-10').addMonths(-2) // Month.from('2024-08')
   * ```
   */
  addMonths(count: number): Month {
    Assert.that(count, 'Month count').isInteger();
    const totalMonths = this._year * 12 + this._month - 1 + count;
    const newYear = Math.floor(totalMonths / 12);
    const newMonth = (totalMonths % 12) + 1;
    return new Month(newYear, newMonth);
  }

  override equals(other: Month): boolean {
    return this._year === other._year && this._month === other._month;
  }
}
