import { Assert } from './../shared/Assert';
import { ActorId } from '../shared/vos/ActorId';

/**
 * Value object representing a user's unique identifier.
 */
export class UserId extends ActorId {
  private constructor(value: string) {
    super(value);
    Assert.that(value, 'UserId').isNonEmpty();
  }

  static from(value: string): UserId {
    return new UserId(value);
  }
}
