import { Scope, ScopeId, UserId, Timestamp } from '@mo/domain';
import { CreateScope, AddScopeMember } from './commands';
import { ScopeRepositoryPort } from './ports/ScopeRepositoryPort';
import { CryptoServicePort, IdempotencyStorePort, KeyStorePort } from '../shared/ports';
import { NotFoundError } from '../errors/NotFoundError';
import { BaseCommandHandler } from '../shared/ports/BaseCommandHandler';

export type ScopeCommandResult = { scopeId: string; encryptionKey: Uint8Array } | { scopeId: string };

/**
 * Orchestrates domain + crypto + persistence for scope-related commands.
 *
 * NOTE: This is a minimal implementation demonstrating the pattern.
 * Additional commands (RemoveMember, RotateEpoch) follow the same structure.
 */
export class ScopeCommandHandler extends BaseCommandHandler {
  constructor(
    private readonly scopeRepo: ScopeRepositoryPort,
    private readonly keyStore: KeyStorePort,
    private readonly crypto: CryptoServicePort,
    private readonly idempotencyStore: IdempotencyStorePort
  ) {
    super();
  }

  async handleCreate(command: CreateScope): Promise<ScopeCommandResult> {
    const { scopeId, ownerUserId, actorId, timestamp, idempotencyKey } = this.parseCommand(command, {
      scopeId: (c) => ScopeId.from(c.scopeId),
      ownerUserId: (c) => UserId.from(c.ownerUserId),
      actorId: (c) => UserId.from(c.actorId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    const isDuplicate = await this.isDuplicateCommand({
      idempotencyKey,
      commandType: this.commandName(command),
      aggregateId: scopeId.value,
    });
    if (isDuplicate) {
      const existingKey = await this.keyStore.getAggregateKey(scopeId.value);
      if (!existingKey) {
        throw new NotFoundError(`Aggregate key for ${scopeId.value} not found`);
      }
      return { scopeId: scopeId.value, encryptionKey: existingKey };
    }

    // Generate scope encryption key (K_scope)
    const kScope = await this.crypto.generateKey();

    // Create scope aggregate
    const scope = Scope.create({
      id: scopeId,
      ownerUserId,
      createdBy: actorId,
      createdAt: timestamp,
    });

    // Persist aggregate and key
    await this.scopeRepo.save(scope, kScope);
    scope.markEventsAsCommitted();

    // Store key
    await this.keyStore.storeAggregateKey(scopeId.value, kScope);

    // Record idempotency
    await this.idempotencyStore.record({
      idempotencyKey,
      commandType: this.commandName(command),
      aggregateId: scopeId.value,
    });

    return { scopeId: scopeId.value, encryptionKey: kScope };
  }

  async handleAddMember(command: AddScopeMember): Promise<ScopeCommandResult> {
    const { scopeId, memberId, role, actorId, timestamp, idempotencyKey } = this.parseCommand(command, {
      scopeId: (c) => ScopeId.from(c.scopeId),
      memberId: (c) => UserId.from(c.memberId),
      role: (c) => c.role,
      actorId: (c) => UserId.from(c.actorId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    const isDuplicate = await this.isDuplicateCommand({
      idempotencyKey,
      commandType: this.commandName(command),
      aggregateId: scopeId.value,
    });
    if (isDuplicate) {
      return { scopeId: scopeId.value };
    }

    // Load scope
    const scopeOpt = await this.scopeRepo.load(scopeId);
    if (scopeOpt.kind === 'none') {
      throw new NotFoundError(`Scope ${scopeId.value} not found`);
    }

    const scope = scopeOpt.value;

    // Add member
    scope.addMember({
      memberId,
      role,
      addedAt: timestamp,
      actorId,
    });

    // Persist
    await this.scopeRepo.save(scope, null); // Key already exists
    scope.markEventsAsCommitted();

    // Record idempotency
    await this.idempotencyStore.record({
      idempotencyKey,
      commandType: this.commandName(command),
      aggregateId: scopeId.value,
    });

    return { scopeId: scopeId.value };
  }

  private parseTimestamp(timestamp: number): Timestamp {
    return Timestamp.fromMillis(timestamp);
  }
}
