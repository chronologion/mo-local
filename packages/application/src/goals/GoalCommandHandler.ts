import {
  Goal,
  GoalId,
  EventId,
  CorrelationId,
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
  AchieveGoal,
  UnachieveGoal,
  GrantGoalAccess,
  RevokeGoalAccess,
} from './commands';
import { GoalRepositoryPort } from './ports/GoalRepositoryPort';
import {
  CryptoServicePort,
  IdempotencyStorePort,
  KeyStorePort,
} from '../shared/ports';
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
    private readonly goalRepo: GoalRepositoryPort,
    private readonly keyStore: KeyStorePort,
    private readonly crypto: CryptoServicePort,
    private readonly idempotencyStore: IdempotencyStorePort
  ) {
    super();
  }

  async handleCreate(command: CreateGoal): Promise<GoalCommandResult> {
    const {
      goalId,
      slice,
      summary,
      targetMonth,
      priority,
      actorId,
      timestamp,
      idempotencyKey,
    } = this.parseCommand(command, {
      goalId: (c) => GoalId.from(c.goalId),
      slice: (c) => Slice.from(c.slice),
      summary: (c) => Summary.from(c.summary),
      targetMonth: (c) => Month.from(c.targetMonth),
      priority: (c) => Priority.from(c.priority),
      actorId: (c) => UserId.from(c.actorId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    const isDuplicate = await this.isDuplicateCommand({
      idempotencyKey,
      commandType: this.commandName(command),
      aggregateId: goalId.value,
    });
    if (isDuplicate) {
      const existingKey = await this.keyStore.getAggregateKey(goalId.value);
      if (!existingKey) {
        throw new NotFoundError(`Aggregate key for ${goalId.value} not found`);
      }
      return { goalId: goalId.value, encryptionKey: existingKey };
    }

    const existingKey = await this.keyStore.getAggregateKey(goalId.value);
    if (existingKey) {
      const existingGoal = await this.goalRepo.load(goalId);
      if (existingGoal.kind === 'some') {
        return { goalId: goalId.value, encryptionKey: existingKey };
      }
    }

    const kGoal = existingKey ?? (await this.crypto.generateKey());
    const goal = Goal.create({
      id: goalId,
      slice,
      summary,
      targetMonth,
      priority,
      createdBy: actorId,
      createdAt: timestamp,
    });

    if (!existingKey) {
      await this.keyStore.saveAggregateKey(goal.id.value, kGoal);
    }
    await this.goalRepo.save(goal, kGoal);
    goal.markEventsAsCommitted();

    await this.idempotencyStore.record({
      key: idempotencyKey,
      commandType: this.commandName(command),
      aggregateId: goalId.value,
      createdAt: timestamp.value,
    });

    return { goalId: goal.id.value, encryptionKey: kGoal };
  }

  async handleChangeSummary(
    command: ChangeGoalSummary
  ): Promise<GoalCommandResult> {
    const {
      goalId,
      summary,
      actorId,
      timestamp,
      knownVersion,
      idempotencyKey,
    } = this.parseCommand(command, {
      goalId: (c) => GoalId.from(c.goalId),
      summary: (c) => Summary.from(c.summary),
      actorId: (c) => UserId.from(c.actorId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: this.commandName(command),
        aggregateId: goalId.value,
      })
    ) {
      return { goalId: goalId.value };
    }
    const goal = await this.loadGoal(goalId);
    this.assertKnownVersion({
      actual: goal.version,
      expected: knownVersion,
      aggregateType: 'Goal',
      aggregateId: goal.id.value,
    });
    goal.changeSummary({ summary, changedAt: timestamp, actorId: actorId });
    return this.persist(goal, {
      idempotencyKey,
      commandType: this.commandName(command),
      createdAt: timestamp.value,
    });
  }

  async handleChangeSlice(
    command: ChangeGoalSlice
  ): Promise<GoalCommandResult> {
    const { goalId, slice, actorId, timestamp, knownVersion, idempotencyKey } =
      this.parseCommand(command, {
        goalId: (c) => GoalId.from(c.goalId),
        slice: (c) => Slice.from(c.slice),
        actorId: (c) => UserId.from(c.actorId),
        timestamp: (c) => this.parseTimestamp(c.timestamp),
        knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
        idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
      });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: this.commandName(command),
        aggregateId: goalId.value,
      })
    ) {
      return { goalId: goalId.value };
    }
    const goal = await this.loadGoal(goalId);
    this.assertKnownVersion({
      actual: goal.version,
      expected: knownVersion,
      aggregateType: 'Goal',
      aggregateId: goal.id.value,
    });
    goal.changeSlice({ slice, changedAt: timestamp, actorId: actorId });
    return this.persist(goal, {
      idempotencyKey,
      commandType: this.commandName(command),
      createdAt: timestamp.value,
    });
  }

  async handleChangeTargetMonth(
    command: ChangeGoalTargetMonth
  ): Promise<GoalCommandResult> {
    const {
      goalId,
      targetMonth,
      actorId,
      timestamp,
      knownVersion,
      idempotencyKey,
    } = this.parseCommand(command, {
      goalId: (c) => GoalId.from(c.goalId),
      targetMonth: (c) => Month.from(c.targetMonth),
      actorId: (c) => UserId.from(c.actorId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: this.commandName(command),
        aggregateId: goalId.value,
      })
    ) {
      return { goalId: goalId.value };
    }
    const goal = await this.loadGoal(goalId);
    this.assertKnownVersion({
      actual: goal.version,
      expected: knownVersion,
      aggregateType: 'Goal',
      aggregateId: goal.id.value,
    });
    goal.changeTargetMonth({
      targetMonth,
      changedAt: timestamp,
      actorId: actorId,
    });
    return this.persist(goal, {
      idempotencyKey,
      commandType: this.commandName(command),
      createdAt: timestamp.value,
    });
  }

  async handleChangePriority(
    command: ChangeGoalPriority
  ): Promise<GoalCommandResult> {
    const {
      goalId,
      priority,
      actorId,
      timestamp,
      knownVersion,
      idempotencyKey,
    } = this.parseCommand(command, {
      goalId: (c) => GoalId.from(c.goalId),
      priority: (c) => Priority.from(c.priority),
      actorId: (c) => UserId.from(c.actorId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: this.commandName(command),
        aggregateId: goalId.value,
      })
    ) {
      return { goalId: goalId.value };
    }
    const goal = await this.loadGoal(goalId);
    this.assertKnownVersion({
      actual: goal.version,
      expected: knownVersion,
      aggregateType: 'Goal',
      aggregateId: goal.id.value,
    });
    goal.changePriority({ priority, changedAt: timestamp, actorId: actorId });
    return this.persist(goal, {
      idempotencyKey,
      commandType: this.commandName(command),
      createdAt: timestamp.value,
    });
  }

  async handleArchive(command: ArchiveGoal): Promise<GoalCommandResult> {
    const { goalId, actorId, timestamp, knownVersion, idempotencyKey } =
      this.parseCommand(command, {
        goalId: (c) => GoalId.from(c.goalId),
        actorId: (c) => UserId.from(c.actorId),
        timestamp: (c) => this.parseTimestamp(c.timestamp),
        knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
        idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
      });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: this.commandName(command),
        aggregateId: goalId.value,
      })
    ) {
      return { goalId: goalId.value };
    }
    const goal = await this.loadGoal(goalId);
    this.assertKnownVersion({
      actual: goal.version,
      expected: knownVersion,
      aggregateType: 'Goal',
      aggregateId: goal.id.value,
    });
    goal.archive({ archivedAt: timestamp, actorId: actorId });
    return this.persist(goal, {
      idempotencyKey,
      commandType: this.commandName(command),
      createdAt: timestamp.value,
    });
  }

  async handleAchieve(command: AchieveGoal): Promise<GoalCommandResult> {
    const { goalId, actorId, timestamp, knownVersion, idempotencyKey } =
      this.parseCommand(command, {
        goalId: (c) => GoalId.from(c.goalId),
        actorId: (c) => UserId.from(c.actorId),
        timestamp: (c) => this.parseTimestamp(c.timestamp),
        knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
        idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
      });
    const correlationId = command.correlationId
      ? CorrelationId.from(command.correlationId)
      : undefined;
    const causationId = command.causationId
      ? EventId.from(command.causationId)
      : undefined;

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: this.commandName(command),
        aggregateId: goalId.value,
      })
    ) {
      return { goalId: goalId.value };
    }
    const goal = await this.loadGoal(goalId);
    this.assertKnownVersion({
      actual: goal.version,
      expected: knownVersion,
      aggregateType: 'Goal',
      aggregateId: goal.id.value,
    });
    goal.achieve({
      achievedAt: timestamp,
      actorId: actorId,
      correlationId,
      causationId,
    });
    return this.persist(goal, {
      idempotencyKey,
      commandType: this.commandName(command),
      createdAt: timestamp.value,
    });
  }

  async handleUnachieve(command: UnachieveGoal): Promise<GoalCommandResult> {
    const { goalId, actorId, timestamp, knownVersion, idempotencyKey } =
      this.parseCommand(command, {
        goalId: (c) => GoalId.from(c.goalId),
        actorId: (c) => UserId.from(c.actorId),
        timestamp: (c) => this.parseTimestamp(c.timestamp),
        knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
        idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
      });
    const correlationId = command.correlationId
      ? CorrelationId.from(command.correlationId)
      : undefined;
    const causationId = command.causationId
      ? EventId.from(command.causationId)
      : undefined;

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: this.commandName(command),
        aggregateId: goalId.value,
      })
    ) {
      return { goalId: goalId.value };
    }
    const goal = await this.loadGoal(goalId);
    this.assertKnownVersion({
      actual: goal.version,
      expected: knownVersion,
      aggregateType: 'Goal',
      aggregateId: goal.id.value,
    });
    goal.unachieve({
      unachievedAt: timestamp,
      actorId: actorId,
      correlationId,
      causationId,
    });
    return this.persist(goal, {
      idempotencyKey,
      commandType: this.commandName(command),
      createdAt: timestamp.value,
    });
  }

  async handleGrantAccess(
    command: GrantGoalAccess
  ): Promise<GoalCommandResult> {
    const {
      goalId,
      grantToUserId,
      permission,
      actorId,
      timestamp,
      knownVersion,
      idempotencyKey,
    } = this.parseCommand(command, {
      goalId: (c) => GoalId.from(c.goalId),
      grantToUserId: (c) => UserId.from(c.grantToUserId),
      permission: (c) => Permission.from(c.permission),
      actorId: (c) => UserId.from(c.actorId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: this.commandName(command),
        aggregateId: goalId.value,
      })
    ) {
      return { goalId: goalId.value };
    }
    const goal = await this.loadGoal(goalId);
    this.assertKnownVersion({
      actual: goal.version,
      expected: knownVersion,
      aggregateType: 'Goal',
      aggregateId: goal.id.value,
    });
    goal.grantAccess({
      userId: grantToUserId,
      permission,
      grantedAt: timestamp,
      actorId: actorId,
    });
    return this.persist(goal, {
      idempotencyKey,
      commandType: this.commandName(command),
      createdAt: timestamp.value,
    });
  }

  async handleRevokeAccess(
    command: RevokeGoalAccess
  ): Promise<GoalCommandResult> {
    const {
      goalId,
      revokeUserId,
      actorId,
      timestamp,
      knownVersion,
      idempotencyKey,
    } = this.parseCommand(command, {
      goalId: (c) => GoalId.from(c.goalId),
      revokeUserId: (c) => UserId.from(c.revokeUserId),
      actorId: (c) => UserId.from(c.actorId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: this.commandName(command),
        aggregateId: goalId.value,
      })
    ) {
      return { goalId: goalId.value };
    }
    const goal = await this.loadGoal(goalId);
    this.assertKnownVersion({
      actual: goal.version,
      expected: knownVersion,
      aggregateType: 'Goal',
      aggregateId: goal.id.value,
    });
    goal.revokeAccess({
      userId: revokeUserId,
      revokedAt: timestamp,
      actorId: actorId,
    });
    return this.persist(goal, {
      idempotencyKey,
      commandType: this.commandName(command),
      createdAt: timestamp.value,
    });
  }

  private parseTimestamp(timestamp: number): Timestamp {
    if (!Number.isFinite(timestamp)) {
      throw new Error('Timestamp must be a finite number');
    }
    return Timestamp.fromMillis(timestamp);
  }

  private async loadGoal(goalId: GoalId): Promise<Goal> {
    const goal = await this.goalRepo.load(goalId);
    if (goal.kind === 'none') {
      throw new NotFoundError(`Goal ${goalId.value} not found`);
    }
    return goal.value;
  }

  private async isDuplicateCommand(params: {
    idempotencyKey: string;
    commandType: string;
    aggregateId: string;
  }): Promise<boolean> {
    const existing = await this.idempotencyStore.get(params.idempotencyKey);
    if (!existing) return false;
    this.assertIdempotencyRecord({
      existing,
      expectedCommandType: params.commandType,
      expectedAggregateId: params.aggregateId,
    });
    return true;
  }

  private async persist(
    goal: Goal,
    idempotency: {
      idempotencyKey: string;
      commandType: string;
      createdAt: number;
    }
  ): Promise<GoalCommandResult> {
    const kGoal = await this.keyStore.getAggregateKey(goal.id.value);
    if (!kGoal) {
      throw new NotFoundError(`Aggregate key for ${goal.id.value} not found`);
    }

    await this.goalRepo.save(goal, kGoal);
    goal.markEventsAsCommitted();
    await this.idempotencyStore.record({
      key: idempotency.idempotencyKey,
      commandType: idempotency.commandType,
      aggregateId: goal.id.value,
      createdAt: idempotency.createdAt,
    });
    return { goalId: goal.id.value };
  }
}
