import {
  Goal,
  GoalId,
  Month,
  Priority,
  Slice,
  Summary,
  UserId,
  Permission,
  Timestamp,
} from '@mo/domain';
import {
  CreateGoal,
  ChangeGoalSummary,
  ChangeGoalSlice,
  ChangeGoalTargetMonth,
  ChangeGoalPriority,
  ArchiveGoal,
  GrantGoalAccess,
  RevokeGoalAccess,
} from './commands';
import { IGoalRepository } from './ports/IGoalRepository';
import { ICryptoService, IKeyStore } from '../shared/ports';
import { NotFoundError } from '../errors/NotFoundError';
import { BaseCommandHandler } from '../shared/ports/BaseCommandHandler';

export type GoalCommandResult =
  | { goalId: string; encryptionKey: Uint8Array }
  | { goalId: string };

/**
 * Orchestrates domain + crypto + persistence for goal-related commands.
 */
export class GoalCommandHandler extends BaseCommandHandler {
  constructor(
    private readonly goalRepo: IGoalRepository,
    private readonly keyStore: IKeyStore,
    private readonly crypto: ICryptoService
  ) {
    super();
  }

  async handleCreate(command: CreateGoal): Promise<GoalCommandResult> {
    const { goalId, slice, summary, targetMonth, priority, userId, timestamp } =
      this.parseCommand(command, {
        goalId: (c) => GoalId.from(c.goalId),
        slice: (c) => Slice.from(c.slice),
        summary: (c) => Summary.from(c.summary),
        targetMonth: (c) => Month.from(c.targetMonth),
        priority: (c) => Priority.from(c.priority),
        userId: (c) => UserId.from(c.userId),
        timestamp: (c) => this.parseTimestamp(c.timestamp),
      });

    const kGoal = await this.crypto.generateKey();
    const goal = Goal.create({
      id: goalId,
      slice,
      summary,
      targetMonth,
      priority,
      createdBy: userId,
      createdAt: timestamp,
    });

    await this.keyStore.saveAggregateKey(goal.id.value, kGoal);
    await this.goalRepo.save(goal, kGoal);
    goal.markEventsAsCommitted();

    return { goalId: goal.id.value, encryptionKey: kGoal };
  }

  async handleChangeSummary(
    command: ChangeGoalSummary
  ): Promise<GoalCommandResult> {
    const { goalId, summary, timestamp } = this.parseCommand(command, {
      goalId: (c) => GoalId.from(c.goalId),
      summary: (c) => Summary.from(c.summary),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const goal = await this.loadGoal(goalId);
    goal.changeSummary(summary, timestamp);
    return this.persist(goal);
  }

  async handleChangeSlice(
    command: ChangeGoalSlice
  ): Promise<GoalCommandResult> {
    const { goalId, slice, timestamp } = this.parseCommand(command, {
      goalId: (c) => GoalId.from(c.goalId),
      slice: (c) => Slice.from(c.slice),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const goal = await this.loadGoal(goalId);
    goal.changeSlice(slice, timestamp);
    return this.persist(goal);
  }

  async handleChangeTargetMonth(
    command: ChangeGoalTargetMonth
  ): Promise<GoalCommandResult> {
    const { goalId, targetMonth, timestamp } = this.parseCommand(command, {
      goalId: (c) => GoalId.from(c.goalId),
      targetMonth: (c) => Month.from(c.targetMonth),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const goal = await this.loadGoal(goalId);
    goal.changeTargetMonth(targetMonth, timestamp);
    return this.persist(goal);
  }

  async handleChangePriority(
    command: ChangeGoalPriority
  ): Promise<GoalCommandResult> {
    const { goalId, priority, timestamp } = this.parseCommand(command, {
      goalId: (c) => GoalId.from(c.goalId),
      priority: (c) => Priority.from(c.priority),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const goal = await this.loadGoal(goalId);
    goal.changePriority(priority, timestamp);
    return this.persist(goal);
  }

  async handleArchive(command: ArchiveGoal): Promise<GoalCommandResult> {
    const { goalId, timestamp } = this.parseCommand(command, {
      goalId: (c) => GoalId.from(c.goalId),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const goal = await this.loadGoal(goalId);
    goal.archive(timestamp);
    return this.persist(goal);
  }

  async handleGrantAccess(
    command: GrantGoalAccess
  ): Promise<GoalCommandResult> {
    const { goalId, grantToUserId, permission, timestamp } = this.parseCommand(
      command,
      {
        goalId: (c) => GoalId.from(c.goalId),
        grantToUserId: (c) => UserId.from(c.grantToUserId),
        permission: (c) => Permission.from(c.permission),
        userId: (c) => UserId.from(c.userId),
        timestamp: (c) => this.parseTimestamp(c.timestamp),
      }
    );
    const goal = await this.loadGoal(goalId);
    goal.grantAccess(grantToUserId, permission, timestamp);
    return this.persist(goal);
  }

  async handleRevokeAccess(
    command: RevokeGoalAccess
  ): Promise<GoalCommandResult> {
    const { goalId, revokeUserId, timestamp } = this.parseCommand(command, {
      goalId: (c) => GoalId.from(c.goalId),
      revokeUserId: (c) => UserId.from(c.revokeUserId),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const goal = await this.loadGoal(goalId);
    goal.revokeAccess(revokeUserId, timestamp);
    return this.persist(goal);
  }

  private parseTimestamp(timestamp: number): Timestamp {
    if (!Number.isFinite(timestamp)) {
      throw new Error('Timestamp must be a finite number');
    }
    return Timestamp.fromMillis(timestamp);
  }

  private async loadGoal(goalId: GoalId): Promise<Goal> {
    const goal = await this.goalRepo.load(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal ${goalId.value} not found`);
    }
    return goal;
  }

  private async persist(goal: Goal): Promise<GoalCommandResult> {
    const kGoal = await this.keyStore.getAggregateKey(goal.id.value);
    if (!kGoal) {
      throw new NotFoundError(`Aggregate key for ${goal.id.value} not found`);
    }

    await this.goalRepo.save(goal, kGoal);
    goal.markEventsAsCommitted();
    return { goalId: goal.id.value };
  }
}
