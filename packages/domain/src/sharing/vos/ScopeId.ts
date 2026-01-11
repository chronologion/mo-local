import { Assert } from '../../shared/Assert';
import { AggregateId } from '../../shared/vos/AggregateId';
import { uuidv4 } from '../../utils/uuid';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Value object representing a Scope's unique identifier.
 *
 * A Scope is a cryptographic context for key distribution and membership.
 * Uses UUIDv4 identifiers for globally unique IDs without timestamp leakage.
 *
 * @example
 * ```typescript
 * const id = ScopeId.create();
 * const parsed = ScopeId.from('123e4567-e89b-42d3-a456-426614174000');
 * ```
 */
export class ScopeId extends AggregateId {
  private constructor(private readonly _value: string) {
    super();
    Assert.that(_value, 'ScopeId').matches(UUID_REGEX);
  }

  /**
   * Create a new ScopeId with a UUIDv4 identifier.
   */
  static create(): ScopeId {
    return new ScopeId(uuidv4());
  }

  /**
   * Standard factory used by application layer when converting
   * primitives into value objects.
   */
  static from(value: string): ScopeId {
    return new ScopeId(value);
  }

  get value(): string {
    return this._value;
  }
}
