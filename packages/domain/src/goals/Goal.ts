import { Assert } from '../shared/Assert';
import { AggregateRoot } from '../shared/AggregateRoot';
import { Timestamp } from '../shared/vos/Timestamp';
import { GoalId } from './vos/GoalId';
import { Slice } from './Slice';
import { Priority } from './vos/Priority';
import { Month } from './vos/Month';
import { Summary } from './vos/Summary';
import { AccessEntry } from './vos/AccessEntry';
import { UserId } from '../identity/UserId';
import { GoalCreated } from './events/GoalCreated';
import { GoalSummaryChanged } from './events/GoalSummaryChanged';
import { GoalSliceChanged } from './events/GoalSliceChanged';
import { GoalTargetChanged } from './events/GoalTargetChanged';
import { GoalPriorityChanged } from './events/GoalPriorityChanged';
import { GoalArchived } from './events/GoalArchived';
import { GoalAccessGranted } from './events/GoalAccessGranted';
import { GoalAccessRevoked } from './events/GoalAccessRevoked';
import { DomainEvent } from '../shared/DomainEvent';
import { Permission } from './vos/Permission';

export type GoalSnapshot = {
  id: GoalId;
  summary: Summary;
  slice: Slice;
  priority: Priority;
  targetMonth: Month;
  createdBy: UserId;
  createdAt: Timestamp;
  archivedAt: Timestamp | null;
  version: number;
};

/**
 * Goal aggregate root.
 *
 * Represents a single goal in the Balanced Wheel model. Goals are event-sourced,
 * meaning all state changes are captured as domain events.
 *
 * Invariants enforced:
 * - Summary must be non-empty
 * - Cannot modify an archived goal
 * - Cannot grant duplicate access to the same user
 *
 * @example
 * ```typescript
 * const goal = Goal.create({
 *   id: GoalId.create(),
 *   slice: Slice.Health,
 *   summary: Summary.from('Run a marathon'),
 *   targetMonth: Month.now().addMonths(6),
 *   priority: Priority.Must,
 *   createdBy: UserId.from('user-123'),
 * });
 *
 * goal.changeSummary(Summary.from('Run a sub-4 hour marathon'));
 * goal.grantAccess(UserId.from('user-456'), Permission.from('edit'));
 * ```
 */
export class Goal extends AggregateRoot<GoalId> {
  private _slice: Slice | undefined;
  private _summary: Summary | undefined;
  private _targetMonth: Month | undefined;
  private _priority: Priority | undefined;
  private _createdBy: UserId | undefined;
  private _createdAt: Timestamp | undefined;
  private _archivedAt: Timestamp | null = null;
  private _accessList: AccessEntry[] = [];

  private constructor(id: GoalId) {
    super(id);
  }

  /**
   * Reconstitute a Goal from historical events.
   */
  static reconstitute(id: GoalId, events: readonly DomainEvent[]): Goal {
    const goal = new Goal(id);
    goal.loadFromHistory(events as DomainEvent[]);
    goal.markEventsAsCommitted();
    return goal;
  }

  /**
   * Reconstitute a Goal from a persisted snapshot plus tail events.
   * Snapshot version is treated as authoritative; tail events advance it.
   */
  static reconstituteFromSnapshot(
    snapshot: GoalSnapshot,
    tailEvents: readonly DomainEvent[]
  ): Goal {
    const goal = new Goal(snapshot.id);
    goal.hydrateFromSnapshot(snapshot);
    goal.loadFromHistory(tailEvents as DomainEvent[]);
    goal.markEventsAsCommitted();
    return goal;
  }

  /**
   * Create a new Goal.
   *
   * This is the only way to create a Goal. It emits a GoalCreated event.
   */
  static create(params: {
    id: GoalId;
    slice: Slice;
    summary: Summary;
    targetMonth: Month;
    priority: Priority;
    createdBy: UserId;
  }): Goal {
    const goal = new Goal(params.id);
    goal.apply(
      new GoalCreated({
        goalId: params.id,
        slice: params.slice,
        summary: params.summary,
        targetMonth: params.targetMonth,
        priority: params.priority,
        createdBy: params.createdBy,
        createdAt: Timestamp.now(),
      })
    );
    return goal;
  }

  // === Getters ===

  get slice(): Slice {
    Assert.that(this._slice, 'Slice').isDefined();
    return this._slice!;
  }

  get summary(): Summary {
    Assert.that(this._summary, 'Summary').isDefined();
    return this._summary!;
  }

  get targetMonth(): Month {
    Assert.that(this._targetMonth, 'TargetMonth').isDefined();
    return this._targetMonth!;
  }

  get priority(): Priority {
    Assert.that(this._priority, 'Priority').isDefined();
    return this._priority!;
  }

  get createdBy(): UserId {
    Assert.that(this._createdBy, 'CreatedBy').isDefined();
    return this._createdBy!;
  }

  get createdAt(): Timestamp {
    Assert.that(this._createdAt, 'CreatedAt').isDefined();
    return this._createdAt!;
  }

  get archivedAt(): Timestamp | null {
    return this._archivedAt;
  }

  get isArchived(): boolean {
    return this._archivedAt !== null;
  }

  get accessList(): ReadonlyArray<AccessEntry> {
    return this._accessList;
  }

  // === Commands ===

  /**
   * Change the goal's summary.
   *
   * @throws {Error} if goal is archived or summary is unchanged
   */
  changeSummary(newSummary: Summary): void {
    this.assertNotArchived();
    Assert.that(newSummary.equals(this.summary), 'Summary unchanged').isFalse();

    this.apply(
      new GoalSummaryChanged({
        goalId: this.id,
        summary: newSummary,
        changedAt: Timestamp.now(),
      })
    );
  }

  /**
   * Change the goal's slice (life area).
   *
   * @throws {Error} if goal is archived or slice is unchanged
   */
  changeSlice(newSlice: Slice): void {
    this.assertNotArchived();
    Assert.that(newSlice.equals(this.slice), 'Slice unchanged').isFalse();

    this.apply(
      new GoalSliceChanged({
        goalId: this.id,
        slice: newSlice,
        changedAt: Timestamp.now(),
      })
    );
  }

  /**
   * Change the goal's target month.
   *
   * @throws {Error} if goal is archived or month is unchanged
   */
  changeTargetMonth(newMonth: Month): void {
    this.assertNotArchived();
    Assert.that(
      newMonth.equals(this.targetMonth),
      'Target month unchanged'
    ).isFalse();

    this.apply(
      new GoalTargetChanged({
        goalId: this.id,
        targetMonth: newMonth,
        changedAt: Timestamp.now(),
      })
    );
  }

  /**
   * Change the goal's priority.
   *
   * @throws {Error} if goal is archived or priority is unchanged
   */
  changePriority(newPriority: Priority): void {
    this.assertNotArchived();
    Assert.that(
      newPriority.equals(this.priority),
      'Priority unchanged'
    ).isFalse();

    this.apply(
      new GoalPriorityChanged({
        goalId: this.id,
        priority: newPriority,
        changedAt: Timestamp.now(),
      })
    );
  }

  /**
   * Archive the goal (soft delete).
   *
   * @throws {Error} if goal is already archived
   */
  archive(): void {
    if (this.isArchived) {
      return;
    }

    this.apply(
      new GoalArchived({
        goalId: this.id,
        archivedAt: Timestamp.now(),
      })
    );
  }

  /**
   * Grant access to this goal to another user.
   *
   * @throws {Error} if goal is archived or user already has access
   */
  grantAccess(userId: UserId, permission: Permission): void {
    this.assertNotArchived();

    const existing = this._accessList.find(
      (entry) => entry.userId.equals(userId) && entry.isActive
    );
    Assert.that(existing, 'User already has access').satisfies(
      (e) => e === undefined,
      'User already has access to this goal'
    );

    this.apply(
      new GoalAccessGranted({
        goalId: this.id,
        grantedTo: userId,
        permission,
        grantedAt: Timestamp.now(),
      })
    );
  }

  /**
   * Revoke access from a user.
   *
   * @throws {Error} if goal is archived or user doesn't have active access
   */
  revokeAccess(userId: UserId): void {
    this.assertNotArchived();

    const existing = this._accessList.find(
      (entry) => entry.userId.equals(userId) && entry.isActive
    );
    Assert.that(existing, 'Access entry').isDefined();

    this.apply(
      new GoalAccessRevoked({
        goalId: this.id,
        revokedFrom: userId,
        revokedAt: Timestamp.now(),
      })
    );
  }

  private hydrateFromSnapshot(snapshot: GoalSnapshot): void {
    this._slice = snapshot.slice;
    this._summary = snapshot.summary;
    this._targetMonth = snapshot.targetMonth;
    this._priority = snapshot.priority;
    this._createdBy = snapshot.createdBy;
    this._createdAt = snapshot.createdAt;
    this._archivedAt = snapshot.archivedAt;
    this._accessList = [];
    this.restoreVersion(snapshot.version);
  }

  // === Event Handlers ===

  protected onGoalCreated(event: GoalCreated): void {
    this._slice = event.slice;
    this._summary = event.summary;
    this._targetMonth = event.targetMonth;
    this._priority = event.priority;
    this._createdBy = event.createdBy;
    this._createdAt = event.createdAt;
  }

  protected onGoalSummaryChanged(event: GoalSummaryChanged): void {
    this._summary = event.summary;
  }

  protected onGoalSliceChanged(event: GoalSliceChanged): void {
    this._slice = event.slice;
  }

  protected onGoalTargetChanged(event: GoalTargetChanged): void {
    this._targetMonth = event.targetMonth;
  }

  protected onGoalPriorityChanged(event: GoalPriorityChanged): void {
    this._priority = event.priority;
  }

  protected onGoalArchived(event: GoalArchived): void {
    this._archivedAt = event.archivedAt;
  }

  protected onGoalAccessGranted(event: GoalAccessGranted): void {
    const entry = AccessEntry.create({
      userId: event.grantedTo,
      permission: event.permission,
      grantedAt: event.grantedAt,
    });
    this._accessList.push(entry);
  }

  protected onGoalAccessRevoked(event: GoalAccessRevoked): void {
    const entry = this._accessList.find(
      (e) => e.userId.equals(event.revokedFrom) && e.isActive
    );
    if (entry) {
      entry.revoke(event.revokedAt);
    }
  }

  // === Private Helpers ===

  private assertNotArchived(): void {
    Assert.that(this._archivedAt, 'Goal is archived').isNull();
  }
}
