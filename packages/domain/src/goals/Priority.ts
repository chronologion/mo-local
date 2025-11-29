import { Assert } from './../shared/Assert';

export type PriorityLevel = 'must' | 'should' | 'maybe';

/**
 * Value object representing goal priority.
 *
 * Provides a fluent, expressive API for priority comparisons.
 *
 * @example
 * ```typescript
 * const priority = Priority.Must;
 * if (priority.isHigherThan(Priority.Should)) {
 *   // Handle high-priority goal
 * }
 * ```
 */
export class Priority {
  private static readonly ORDER: Record<PriorityLevel, number> = {
    must: 3,
    should: 2,
    maybe: 1,
  };

  private constructor(private readonly _level: PriorityLevel) {}

  /**
   * Create a Priority from a string value.
   *
   * @throws {Error} if level is not valid
   */
  static of(level: string): Priority {
    Assert.that(level, 'Priority').isOneOf(['must', 'should', 'maybe']);
    return new Priority(level as PriorityLevel);
  }

  // Static constants for type-safe usage
  static readonly Must = new Priority('must');
  static readonly Should = new Priority('should');
  static readonly Maybe = new Priority('maybe');

  get level(): PriorityLevel {
    return this._level;
  }

  /**
   * Check if this is a "must" priority.
   */
  isMust(): boolean {
    return this._level === 'must';
  }

  /**
   * Check if this is a "should" priority.
   */
  isShould(): boolean {
    return this._level === 'should';
  }

  /**
   * Check if this is a "maybe" priority.
   */
  isMaybe(): boolean {
    return this._level === 'maybe';
  }

  /**
   * Compare priority levels.
   *
   * @example
   * ```typescript
   * Priority.Must.isHigherThan(Priority.Should) // true
   * Priority.Maybe.isHigherThan(Priority.Must)  // false
   * ```
   */
  isHigherThan(other: Priority): boolean {
    return Priority.ORDER[this._level] > Priority.ORDER[other._level];
  }

  equals(other: Priority): boolean {
    return this._level === other._level;
  }

  toString(): string {
    return this._level;
  }
}
