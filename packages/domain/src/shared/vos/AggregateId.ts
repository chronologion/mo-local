import { ValueObject } from './ValueObject';

/**
 * Base class for aggregate identifiers.
 *
 * Aggregate IDs are value objects wrapping a string identifier
 * (UUIDv4) and used as the root identity for event streams.
 */
export abstract class AggregateId extends ValueObject<string> {}
