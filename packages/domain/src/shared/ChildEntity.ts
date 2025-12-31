import { Entity } from './Entity';

/**
 * Base class for entities that are exposed as part of an aggregate root.
 *
 * Child entities have a read-only record representations that can be used in aggregate getters
 */
export abstract class ChildEntity<TId, TRecord> extends Entity<TId> {
  abstract asRecord(): TRecord;
}
