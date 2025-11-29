/**
 * Base class for entities.
 *
 * Entities have identity - they are distinguished by their ID, not their attributes.
 * Two entities with the same ID are considered the same entity, even if their
 * attributes differ.
 */
export abstract class Entity<TId> {
  protected constructor(private readonly _id: TId) {}

  get id(): TId {
    return this._id;
  }

  equals(other: Entity<TId>): boolean {
    if (!(other instanceof Entity)) {
      return false;
    }
    return this._id === other._id;
  }
}
