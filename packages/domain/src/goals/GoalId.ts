import { Assert } from './../shared/Assert';
import { uuidv7 } from '../utils/uuid';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Value object representing a Goal's unique identifier.
 *
 * Uses UUIDv7-style identifiers for time-ordered, globally unique IDs.
 *
 * @example
 * ```typescript
 * const id = GoalId.create();
 * const parsed = GoalId.of('123e4567-e89b-72d3-a456-426614174000');
 * ```
 */
export class GoalId {
  private constructor(private readonly _value: string) {
    Assert.that(_value, 'GoalId').matches(UUID_REGEX);
  }

  /**
   * Create a new GoalId with a UUIDv7 identifier.
   */
  static create(): GoalId {
    return new GoalId(uuidv7());
  }

  /**
   * Create a GoalId from an existing UUID string.
   *
   * @throws {Error} if value is not a valid UUID
   */
  static of(value: string): GoalId {
    return new GoalId(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: GoalId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
