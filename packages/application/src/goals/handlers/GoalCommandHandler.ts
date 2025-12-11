import {
  Goal,
  GoalId,
  Month,
  Priority,
  Slice,
  Summary,
  UserId,
} from '@mo/domain';
import {
  CreateGoalCommand,
  ChangeGoalSummaryCommand,
  ChangeGoalSliceCommand,
  ChangeGoalTargetMonthCommand,
  ChangeGoalPriorityCommand,
  DeleteGoalCommand,
  GrantGoalAccessCommand,
  RevokeGoalAccessCommand,
  AccessPermission,
} from '../commands';
import {
  IGoalRepository,
  IEventBus,
  ICryptoService,
  IKeyStore,
} from '../../ports';
import { NotFoundError } from '../../errors/NotFoundError';
import { safeConvert, validateTimestamp } from '../../shared/validation';
import { ValidationException } from '../../errors/ValidationError';

export type GoalCommandResult =
  | { goalId: string; encryptionKey: Uint8Array }
  | { goalId: string };

/**
 * Orchestrates domain + crypto + persistence for goal-related commands.
 */
export class GoalCommandHandler {
  constructor(
    private readonly goalRepo: IGoalRepository,
    private readonly keyStore: IKeyStore,
    private readonly crypto: ICryptoService,
    private readonly eventBus: IEventBus
  ) {}

  async handleCreate(command: CreateGoalCommand): Promise<GoalCommandResult> {
    const parsed = this.parseCreate(command);
    const kGoal = await this.crypto.generateKey();
    const goal = Goal.create({
      id: parsed.goalId,
      slice: parsed.slice,
      summary: parsed.summary,
      targetMonth: parsed.targetMonth,
      priority: parsed.priority,
      createdBy: parsed.userId,
    });

    const pendingEvents = goal.getUncommittedEvents();
    await this.keyStore.saveAggregateKey(goal.id.value, kGoal);
    await this.goalRepo.save(goal, kGoal);
    await this.eventBus.publish(pendingEvents);
    goal.markEventsAsCommitted();

    return { goalId: goal.id.value, encryptionKey: kGoal };
  }

  private parseCreate(command: CreateGoalCommand) {
    const errors: { field: string; message: string }[] = [];
    const goalId = safeConvert(
      () => GoalId.of(command.goalId),
      'goalId',
      errors
    );
    const slice = safeConvert(() => Slice.of(command.slice), 'slice', errors);
    const summary = safeConvert(
      () => Summary.of(command.summary),
      'summary',
      errors
    );
    const targetMonth = safeConvert(
      () => Month.fromString(command.targetMonth),
      'targetMonth',
      errors
    );
    const priority = safeConvert(
      () => Priority.of(command.priority),
      'priority',
      errors
    );
    const userId = safeConvert(
      () => UserId.of(command.userId),
      'userId',
      errors
    );
    const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

    if (
      !goalId ||
      !slice ||
      !summary ||
      !targetMonth ||
      !priority ||
      !userId ||
      !timestamp
    ) {
      throw new ValidationException(errors);
    }

    return { goalId, slice, summary, targetMonth, priority, userId, timestamp };
  }

  async handleChangeSummary(
    command: ChangeGoalSummaryCommand
  ): Promise<GoalCommandResult> {
    const parsed = this.parseChangeSummary(command);
    const goal = await this.loadGoal(parsed.goalId);
    goal.changeSummary(parsed.summary);
    return this.persist(goal);
  }

  async handleChangeSlice(
    command: ChangeGoalSliceCommand
  ): Promise<GoalCommandResult> {
    const parsed = this.parseChangeSlice(command);
    const goal = await this.loadGoal(parsed.goalId);
    goal.changeSlice(parsed.slice);
    return this.persist(goal);
  }

  async handleChangeTargetMonth(
    command: ChangeGoalTargetMonthCommand
  ): Promise<GoalCommandResult> {
    const parsed = this.parseChangeTargetMonth(command);
    const goal = await this.loadGoal(parsed.goalId);
    goal.changeTargetMonth(parsed.targetMonth);
    return this.persist(goal);
  }

  async handleChangePriority(
    command: ChangeGoalPriorityCommand
  ): Promise<GoalCommandResult> {
    const parsed = this.parseChangePriority(command);
    const goal = await this.loadGoal(parsed.goalId);
    goal.changePriority(parsed.priority);
    return this.persist(goal);
  }

  async handleDelete(command: DeleteGoalCommand): Promise<GoalCommandResult> {
    const parsed = this.parseDelete(command);
    const goal = await this.loadGoal(parsed.goalId);
    goal.delete();
    return this.persist(goal);
  }

  async handleGrantAccess(
    command: GrantGoalAccessCommand
  ): Promise<GoalCommandResult> {
    const parsed = this.parseGrantAccess(command);
    const goal = await this.loadGoal(parsed.goalId);
    goal.grantAccess(parsed.grantToUserId, parsed.permission);
    return this.persist(goal);
  }

  async handleRevokeAccess(
    command: RevokeGoalAccessCommand
  ): Promise<GoalCommandResult> {
    const parsed = this.parseRevokeAccess(command);
    const goal = await this.loadGoal(parsed.goalId);
    goal.revokeAccess(parsed.revokeUserId);
    return this.persist(goal);
  }

  private parseChangeSummary(command: ChangeGoalSummaryCommand) {
    const errors: { field: string; message: string }[] = [];
    const { goalId, userId, timestamp } = this.parseCommonFields(
      command,
      errors
    );
    const summary = safeConvert(
      () => Summary.of(command.summary),
      'summary',
      errors
    );
    if (!goalId || !userId || !timestamp || !summary) {
      throw new ValidationException(errors);
    }
    return { goalId, summary, userId, timestamp };
  }

  private parseChangeSlice(command: ChangeGoalSliceCommand) {
    const errors: { field: string; message: string }[] = [];
    const { goalId, userId, timestamp } = this.parseCommonFields(
      command,
      errors
    );
    const slice = safeConvert(() => Slice.of(command.slice), 'slice', errors);
    if (!goalId || !userId || !timestamp || !slice) {
      throw new ValidationException(errors);
    }
    return { goalId, slice, userId, timestamp };
  }

  private parseChangeTargetMonth(command: ChangeGoalTargetMonthCommand) {
    const errors: { field: string; message: string }[] = [];
    const { goalId, userId, timestamp } = this.parseCommonFields(
      command,
      errors
    );
    const targetMonth = safeConvert(
      () => Month.fromString(command.targetMonth),
      'targetMonth',
      errors
    );
    if (!goalId || !userId || !timestamp || !targetMonth) {
      throw new ValidationException(errors);
    }
    return { goalId, targetMonth, userId, timestamp };
  }

  private parseChangePriority(command: ChangeGoalPriorityCommand) {
    const errors: { field: string; message: string }[] = [];
    const { goalId, userId, timestamp } = this.parseCommonFields(
      command,
      errors
    );
    const priority = safeConvert(
      () => Priority.of(command.priority),
      'priority',
      errors
    );
    if (!goalId || !userId || !timestamp || !priority) {
      throw new ValidationException(errors);
    }
    return { goalId, priority, userId, timestamp };
  }

  private parseDelete(command: DeleteGoalCommand) {
    const errors: { field: string; message: string }[] = [];
    const { goalId, userId, timestamp } = this.parseCommonFields(
      command,
      errors
    );
    if (!goalId || !userId || !timestamp) {
      throw new ValidationException(errors);
    }
    return { goalId, userId, timestamp };
  }

  private parseGrantAccess(command: GrantGoalAccessCommand) {
    const errors: { field: string; message: string }[] = [];
    const { goalId, userId, timestamp } = this.parseCommonFields(
      command,
      errors
    );
    const grantToUserId = safeConvert(
      () => UserId.of(command.grantToUserId),
      'grantToUserId',
      errors
    );
    const permission = this.parsePermission(command.permission, errors);
    if (!goalId || !userId || !timestamp || !grantToUserId || !permission) {
      throw new ValidationException(errors);
    }
    return { goalId, grantToUserId, permission, userId, timestamp };
  }

  private parseRevokeAccess(command: RevokeGoalAccessCommand) {
    const errors: { field: string; message: string }[] = [];
    const { goalId, userId, timestamp } = this.parseCommonFields(
      command,
      errors
    );
    const revokeUserId = safeConvert(
      () => UserId.of(command.revokeUserId),
      'revokeUserId',
      errors
    );
    if (!goalId || !userId || !timestamp || !revokeUserId) {
      throw new ValidationException(errors);
    }
    return { goalId, revokeUserId, userId, timestamp };
  }

  private parsePermission(
    permission: AccessPermission,
    errors: { field: string; message: string }[]
  ): AccessPermission | null {
    if (permission === 'edit' || permission === 'view') {
      return permission;
    }
    errors.push({
      field: 'permission',
      message: 'Permission must be view or edit',
    });
    return null;
  }

  private parseCommonFields(
    command: { goalId: string; userId: string; timestamp: number },
    errors: { field: string; message: string }[]
  ) {
    const goalId = safeConvert(
      () => GoalId.of(command.goalId),
      'goalId',
      errors
    );
    const userId = safeConvert(
      () => UserId.of(command.userId),
      'userId',
      errors
    );
    const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);
    return { goalId, userId, timestamp };
  }

  private async loadGoal(goalId: GoalId): Promise<Goal> {
    const goal = await this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal ${goalId.value} not found`);
    }
    return goal;
  }

  private async persist(goal: Goal): Promise<GoalCommandResult> {
    const pendingEvents = goal.getUncommittedEvents();
    const kGoal = await this.keyStore.getAggregateKey(goal.id.value);
    if (!kGoal) {
      throw new NotFoundError(`Aggregate key for ${goal.id.value} not found`);
    }

    await this.goalRepo.save(goal, kGoal);
    await this.eventBus.publish(pendingEvents);
    goal.markEventsAsCommitted();
    return { goalId: goal.id.value };
  }
}
