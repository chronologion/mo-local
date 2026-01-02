import { Entity } from '../../shared/Entity';
import { Timestamp } from '../../shared/vos/Timestamp';
import { UserId } from '../../identity/UserId';
import { Permission } from './Permission';

/**
 * Entity representing an access control entry for a Goal.
 *
 * Tracks who has access to a goal and what permission level they have.
 */
export class AccessEntry extends Entity<string> {
  private constructor(
    id: string,
    private readonly _userId: UserId,
    private readonly _permission: Permission,
    private readonly _grantedAt: Timestamp,
    private _revokedAt: Timestamp | null = null
  ) {
    super(id);
  }

  static create(params: { userId: UserId; permission: Permission; grantedAt: Timestamp }): AccessEntry {
    const id = params.userId.value; // In practice, might be composite key
    return new AccessEntry(id, params.userId, params.permission, params.grantedAt, null);
  }

  get userId(): UserId {
    return this._userId;
  }

  get permission(): Permission {
    return this._permission;
  }

  get grantedAt(): Timestamp {
    return this._grantedAt;
  }

  get revokedAt(): Timestamp | null {
    return this._revokedAt;
  }

  get isActive(): boolean {
    return this._revokedAt === null;
  }

  revoke(revokedAt: Timestamp): void {
    this._revokedAt = revokedAt;
  }
}
