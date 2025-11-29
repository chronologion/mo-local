import { Assert } from '../shared/Assert';
import { AggregateRoot } from '../shared/AggregateRoot';
import { Timestamp } from '../shared/Timestamp';
import { GoalId } from './GoalId';
import { Slice } from './Slice';
import { Priority } from './Priority';
import { Month } from './Month';
import { Summary } from './Summary';
import { AccessEntry } from './AccessEntry';
import { UserId } from '../identity/UserId';
import { GoalCreated } from '../events/GoalCreated';
import { GoalSummaryChanged } from '../events/GoalSummaryChanged';
import { GoalSliceChanged } from '../events/GoalSliceChanged';
import { GoalTargetChanged } from '../events/GoalTargetChanged';
import { GoalPriorityChanged } from '../events/GoalPriorityChanged';
import { GoalDeleted } from '../events/GoalDeleted';
import { GoalAccessGranted, Permission } from '../events/GoalAccessGranted';
import { GoalAccessRevoked } from '../events/GoalAccessRevoked';

/**
 * Goal aggregate root.
 *
 * Represents a single goal in the Balanced Wheel model. Goals are event-sourced,
 * meaning all state changes are captured as domain events.
 *
 * Invariants enforced:
 * - Summary must be non-empty
 * - Cannot modify a deleted goal
 * - Cannot grant duplicate access to the same user
 *
 * @example
 * ```typescript
 * const goal = Goal.create({
 *   id: GoalId.create(),
 *   slice: Slice.Health,
 *   summary: Summary.of('Run a marathon'),
 *   targetMonth: Month.now().addMonths(6),
 *   priority: Priority.Must,
 *   createdBy: UserId.of('user-123'),
 * });
 *
 * goal.changeSummary(Summary.of('Run a sub-4 hour marathon'));
 * goal.grantAccess(UserId.of('user-456'), 'edit');
 * ```
 */
export class Goal extends AggregateRoot<GoalId> {
  private _slice: Slice | undefined;
  private _summary: Summary | undefined;
  private _targetMonth: Month | undefined;
  private _priority: Priority | undefined;
  private _createdBy: UserId | undefined;
  private _createdAt: Timestamp | undefined;
  private _deletedAt: Timestamp | null = null;
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
        goalId: params.id.value,
        slice: params.slice.value,
        summary: params.summary.value,
        targetMonth: params.targetMonth.value,
        priority: params.priority.level,
        createdBy: params.createdBy.value,
        createdAt: Timestamp.now().value,
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

  get deletedAt(): Timestamp | null {
    return this._deletedAt;
  }

  get isDeleted(): boolean {
    return this._deletedAt !== null;
  }

  get accessList(): ReadonlyArray<AccessEntry> {
    return this._accessList;
  }

  // === Commands ===

  /**
   * Change the goal's summary.
   *
   * @throws {Error} if goal is deleted or summary is unchanged
   */
  changeSummary(newSummary: Summary): void {
    this.assertNotDeleted();
    Assert.that(newSummary.equals(this.summary), 'Summary unchanged').isFalse();

    this.apply(
      new GoalSummaryChanged({
        goalId: this.id.value,
        summary: newSummary.value,
        changedAt: Timestamp.now().value,
      })
    );
  }

  /**
   * Change the goal's slice (life area).
   *
   * @throws {Error} if goal is deleted or slice is unchanged
   */
  changeSlice(newSlice: Slice): void {
    this.assertNotDeleted();
    Assert.that(newSlice.equals(this.slice), 'Slice unchanged').isFalse();

    this.apply(
      new GoalSliceChanged({
        goalId: this.id.value,
        slice: newSlice.value,
        changedAt: Timestamp.now().value,
      })
    );
  }

  /**
   * Change the goal's target month.
   *
   * @throws {Error} if goal is deleted or month is unchanged
   */
  changeTargetMonth(newMonth: Month): void {
    this.assertNotDeleted();
    Assert.that(
      newMonth.equals(this.targetMonth),
      'Target month unchanged'
    ).isFalse();

    this.apply(
      new GoalTargetChanged({
        goalId: this.id.value,
        targetMonth: newMonth.value,
        changedAt: Timestamp.now().value,
      })
    );
  }

  /**
   * Change the goal's priority.
   *
   * @throws {Error} if goal is deleted or priority is unchanged
   */
  changePriority(newPriority: Priority): void {
    this.assertNotDeleted();
    Assert.that(
      newPriority.equals(this.priority),
      'Priority unchanged'
    ).isFalse();

    this.apply(
      new GoalPriorityChanged({
        goalId: this.id.value,
        priority: newPriority.level,
        changedAt: Timestamp.now().value,
      })
    );
  }

  /**
   * Delete the goal (soft delete).
   *
   * @throws {Error} if goal is already deleted
   */
  delete(): void {
    this.assertNotDeleted();

    this.apply(
      new GoalDeleted({
        goalId: this.id.value,
        deletedAt: Timestamp.now().value,
      })
    );
  }

  /**
   * Grant access to this goal to another user.
   *
   * @throws {Error} if goal is deleted or user already has access
   */
  grantAccess(userId: UserId, permission: Permission): void {
    this.assertNotDeleted();

    const existing = this._accessList.find(
      (entry) => entry.userId.equals(userId) && entry.isActive
    );
    Assert.that(existing, 'User already has access').satisfies(
      (e) => e === undefined,
      'User already has access to this goal'
    );

    this.apply(
      new GoalAccessGranted({
        goalId: this.id.value,
        grantedTo: userId.value,
        permission,
        grantedAt: Timestamp.now().value,
      })
    );
  }

  /**
   * Revoke access from a user.
   *
   * @throws {Error} if goal is deleted or user doesn't have active access
   */
  revokeAccess(userId: UserId): void {
    this.assertNotDeleted();

    const existing = this._accessList.find(
      (entry) => entry.userId.equals(userId) && entry.isActive
    );
    Assert.that(existing, 'Access entry').isDefined();

    this.apply(
      new GoalAccessRevoked({
        goalId: this.id.value,
        revokedFrom: userId.value,
        revokedAt: Timestamp.now().value,
      })
    );
  }

  // === Event Handlers ===

  protected onGoalCreated(event: GoalCreated): void {
    this._slice = Slice.of(event.payload.slice);
    this._summary = Summary.of(event.payload.summary);
    this._targetMonth = Month.fromString(event.payload.targetMonth);
    this._priority = Priority.of(event.payload.priority);
    this._createdBy = UserId.of(event.payload.createdBy);
    this._createdAt = Timestamp.of(event.payload.createdAt);
  }

  protected onGoalSummaryChanged(event: GoalSummaryChanged): void {
    this._summary = Summary.of(event.payload.summary);
  }

  protected onGoalSliceChanged(event: GoalSliceChanged): void {
    this._slice = Slice.of(event.payload.slice);
  }

  protected onGoalTargetChanged(event: GoalTargetChanged): void {
    this._targetMonth = Month.fromString(event.payload.targetMonth);
  }

  protected onGoalPriorityChanged(event: GoalPriorityChanged): void {
    this._priority = Priority.of(event.payload.priority);
  }

  protected onGoalDeleted(event: GoalDeleted): void {
    this._deletedAt = Timestamp.of(event.payload.deletedAt);
  }

  protected onGoalAccessGranted(event: GoalAccessGranted): void {
    const entry = AccessEntry.create({
      userId: UserId.of(event.payload.grantedTo),
      permission: event.payload.permission,
      grantedAt: Timestamp.of(event.payload.grantedAt),
    });
    this._accessList.push(entry);
  }

  protected onGoalAccessRevoked(event: GoalAccessRevoked): void {
    const entry = this._accessList.find(
      (e) => e.userId.equals(UserId.of(event.payload.revokedFrom)) && e.isActive
    );
    if (entry) {
      entry.revoke(Timestamp.of(event.payload.revokedAt));
    }
  }

  // === Private Helpers ===

  private assertNotDeleted(): void {
    Assert.that(this._deletedAt, 'Goal is deleted').isNull();
  }
}
