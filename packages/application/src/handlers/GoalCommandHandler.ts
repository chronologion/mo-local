import { Goal, GoalId } from '@mo/domain';
import {
  ValidatedCreateGoalCommand,
  ValidatedChangeGoalSummaryCommand,
  ValidatedChangeGoalSliceCommand,
  ValidatedChangeGoalTargetMonthCommand,
  ValidatedChangeGoalPriorityCommand,
  ValidatedDeleteGoalCommand,
  ValidatedGrantGoalAccessCommand,
  ValidatedRevokeGoalAccessCommand,
} from '../commands';
import {
  IGoalRepository,
  IEventBus,
  ICryptoService,
  IKeyStore,
} from '../ports';
import { NotFoundError } from '../errors/NotFoundError';

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

  async handleCreate(
    command: ValidatedCreateGoalCommand
  ): Promise<GoalCommandResult> {
    const kGoal = await this.crypto.generateKey();
    const goal = Goal.create({
      id: command.goalId,
      slice: command.slice,
      summary: command.summary,
      targetMonth: command.targetMonth,
      priority: command.priority,
      createdBy: command.userId,
    });

    const pendingEvents = goal.getUncommittedEvents();
    await this.keyStore.saveAggregateKey(goal.id.value, kGoal);
    await this.goalRepo.save(goal, kGoal);
    await this.eventBus.publish(pendingEvents);
    goal.markEventsAsCommitted();

    return { goalId: goal.id.value, encryptionKey: kGoal };
  }

  async handleChangeSummary(
    command: ValidatedChangeGoalSummaryCommand
  ): Promise<GoalCommandResult> {
    const goal = await this.loadGoal(command.goalId);
    goal.changeSummary(command.summary);
    return this.persist(goal);
  }

  async handleChangeSlice(
    command: ValidatedChangeGoalSliceCommand
  ): Promise<GoalCommandResult> {
    const goal = await this.loadGoal(command.goalId);
    goal.changeSlice(command.slice);
    return this.persist(goal);
  }

  async handleChangeTargetMonth(
    command: ValidatedChangeGoalTargetMonthCommand
  ): Promise<GoalCommandResult> {
    const goal = await this.loadGoal(command.goalId);
    goal.changeTargetMonth(command.targetMonth);
    return this.persist(goal);
  }

  async handleChangePriority(
    command: ValidatedChangeGoalPriorityCommand
  ): Promise<GoalCommandResult> {
    const goal = await this.loadGoal(command.goalId);
    goal.changePriority(command.priority);
    return this.persist(goal);
  }

  async handleDelete(
    command: ValidatedDeleteGoalCommand
  ): Promise<GoalCommandResult> {
    const goal = await this.loadGoal(command.goalId);
    goal.delete();
    return this.persist(goal);
  }

  async handleGrantAccess(
    command: ValidatedGrantGoalAccessCommand
  ): Promise<GoalCommandResult> {
    const goal = await this.loadGoal(command.goalId);
    goal.grantAccess(command.grantToUserId, command.permission);
    return this.persist(goal);
  }

  async handleRevokeAccess(
    command: ValidatedRevokeGoalAccessCommand
  ): Promise<GoalCommandResult> {
    const goal = await this.loadGoal(command.goalId);
    goal.revokeAccess(command.revokeUserId);
    return this.persist(goal);
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
