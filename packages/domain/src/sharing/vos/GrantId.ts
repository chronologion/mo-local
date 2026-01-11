import { Assert } from '../../shared/Assert';
import { AggregateId } from '../../shared/vos/AggregateId';
import { uuidv4 } from '../../utils/uuid';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Value object representing a Resource Grant's unique identifier.
 *
 * A Grant binds a Resource to a Scope, wrapping the resource's encryption key
 * under the scope's shared key. Uses UUIDv4 identifiers.
 *
 * @example
 * ```typescript
 * const id = GrantId.create();
 * const parsed = GrantId.from('123e4567-e89b-42d3-a456-426614174000');
 * ```
 */
export class GrantId extends AggregateId {
  private constructor(private readonly _value: string) {
    super();
    Assert.that(_value, 'GrantId').matches(UUID_REGEX);
  }

  /**
   * Create a new GrantId with a UUIDv4 identifier.
   */
  static create(): GrantId {
    return new GrantId(uuidv4());
  }

  /**
   * Standard factory used by application layer when converting
   * primitives into value objects.
   */
  static from(value: string): GrantId {
    return new GrantId(value);
  }

  get value(): string {
    return this._value;
  }
}
