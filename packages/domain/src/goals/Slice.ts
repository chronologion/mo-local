import { Assert } from '../shared/Assert';
import { ValueObject } from '../shared/vos/ValueObject';

/**
 * The 8 life areas in the Balanced Wheel model.
 */
export type SliceValue =
  | 'Health'
  | 'Family'
  | 'Relationships'
  | 'Work'
  | 'Money'
  | 'Learning'
  | 'Mindfulness'
  | 'Leisure';

export const ALL_SLICES: readonly SliceValue[] = [
  'Health',
  'Family',
  'Relationships',
  'Work',
  'Money',
  'Learning',
  'Mindfulness',
  'Leisure',
] as const;

/**
 * Value object representing a life area (slice) in the Balanced Wheel.
 *
 * Immutable, type-safe, and provides a fluent API.
 *
 * @example
 * ```typescript
 * const slice = Slice.Health;
 * const other = Slice.from('Work');
 * if (slice.equals(other)) { ... }
 * ```
 */
export class Slice extends ValueObject<SliceValue> {
  private constructor(private readonly _value: SliceValue) {
    super();
  }

  /**
   * Create a Slice from a string value.
   *
   * @throws {Error} if value is not a valid slice
   */
  static from(value: string): Slice {
    Assert.that(value, 'Slice').isOneOf(ALL_SLICES);
    return new Slice(value as SliceValue);
  }

  // Static constants for type-safe, autocomplete-friendly usage
  static readonly Health = new Slice('Health');
  static readonly Family = new Slice('Family');
  static readonly Relationships = new Slice('Relationships');
  static readonly Work = new Slice('Work');
  static readonly Money = new Slice('Money');
  static readonly Learning = new Slice('Learning');
  static readonly Mindfulness = new Slice('Mindfulness');
  static readonly Leisure = new Slice('Leisure');

  get value(): SliceValue {
    return this._value;
  }
}
