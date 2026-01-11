import { Assert } from '../../shared/Assert';
import { AggregateId } from '../../shared/vos/AggregateId';
import { uuidv4 } from '../../utils/uuid';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Value object representing a Resource's unique identifier.
 *
 * Resources are domain aggregates (Goals, Projects, etc.) that can be
 * shared via Scopes. Uses UUIDv4 identifiers.
 *
 * @example
 * ```typescript
 * const id = ResourceId.create();
 * const parsed = ResourceId.from('123e4567-e89b-42d3-a456-426614174000');
 * ```
 */
export class ResourceId extends AggregateId {
  private constructor(private readonly _value: string) {
    super();
    Assert.that(_value, 'ResourceId').matches(UUID_REGEX);
  }

  /**
   * Create a new ResourceId with a UUIDv4 identifier.
   */
  static create(): ResourceId {
    return new ResourceId(uuidv4());
  }

  /**
   * Standard factory used by application layer when converting
   * primitives into value objects.
   */
  static from(value: string): ResourceId {
    return new ResourceId(value);
  }

  get value(): string {
    return this._value;
  }
}
