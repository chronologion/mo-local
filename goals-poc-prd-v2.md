# Goals POC – Product Requirements Document

**Version**: 2.0  
**Status**: Draft  
**Last Updated**: 2025-11-28



## 1. Objective

Build a Goals POC that demonstrates:

- **Clean Architecture** with clear separation between Interface, Application, Domain, and Infrastructure layers.
- **Local-first event-sourced data model** using LiveStore for the Goals bounded context (Balanced Wheel domain).
- **Per-aggregate client-side encryption** where each Goal has its own encryption key (`K_goal`), enabling fine-grained sharing.
- **Server-blind architecture**: the sync server stores only encrypted payloads and cannot read user data.
- **Optional sync** to a NestJS + Postgres backend acting as an encrypted event store via a custom LiveStore sync provider.
- **Multi-device support** for a single user via key backup/restore.
- **Multi-user sharing** at the aggregate (Goal) level with cryptographic access control.



## 2. Scope

### 2.1 In Scope

| Area | Details |
|------|---------|
| Frontend | React + TypeScript + Vite + shadcn/ui |
| Architecture | Clean Architecture (4 layers) |
| Bounded Context | Goals BC only |
| Domain | Balanced Wheel with 8 slices: Health, Family, Relationships, Work, Money, Learning, Mindfulness, Leisure |
| Views | Wheel view, Timeline view |
| Local Storage | LiveStore (SQLite via OPFS/wa-sqlite) |
| Encryption | Per-aggregate keys (`K_goal`), wrapped by user identity keys |
| Sync | Custom LiveStore sync provider → NestJS + Postgres encrypted event store |
| Multi-device | Same user on multiple devices via key backup/import |
| Sharing | Per-Goal sharing with invited users (view or edit permissions) |
| Auth | Public-key registration + challenge/response authentication |

### 2.2 Out of Scope

| Area | Rationale |
|------|-----------|
| Email verification / OAuth | POC uses key-based identity only |
| Mobile / React Native | Web-only for POC |
| MLS-style group crypto | Pragmatic per-aggregate key scheme instead |
| Complex conflict resolution | LiveStore's default last-write-wins with rebasing |
| Goal hierarchies / sub-goals / tasks | Simple flat goal model for POC |
| Full key rotation on revocation | Documented limitation; revoked users retain historical access |



## 3. Clean Architecture

### 3.1 Layer Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INTERFACE LAYER                             │
│  React components, hooks, command dispatch                          │
│  - Goals BC components (WheelView, TimelineView, GoalCard, etc.)    │
│  - Shared UI library (shadcn/ui components)                         │
│  - Hooks / wiring from UI → commands                                │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        APPLICATION LAYER                            │
│  Commands, Command Handlers, Application Services                   │
│  - Pure TypeScript, no framework dependencies                       │
│  - Orchestrates domain operations                                   │
│  - Defines ports (interfaces) for infrastructure                    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          DOMAIN LAYER                               │
│  Aggregates, Entities, Value Objects, Domain Events                 │
│  - Pure TypeScript, ZERO dependencies (except assertive-ts)         │
│  - DSL-style API with expressive, fluent value objects              │
│  - Business logic and invariants enforced via assertions            │
│  - Domain events as first-class citizens                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       INFRASTRUCTURE LAYER                          │
│  LiveStore adapter, Crypto service, Sync provider                   │
│  - Implements ports defined in Application layer                    │
│  - LiveStore schema, tables, materializers                          │
│  - Domain event → LiveStore event transformation                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Directory Structure

```
src/
├── interface/                      # Interface Layer
│   ├── components/
│   │   ├── goals/                  # Goals BC components
│   │   │   ├── WheelView.tsx
│   │   │   ├── TimelineView.tsx
│   │   │   ├── GoalCard.tsx
│   │   │   ├── GoalModal.tsx
│   │   │   └── ShareModal.tsx
│   │   └── shared/                 # Shared UI (shadcn wrappers)
│   │       ├── Button.tsx
│   │       ├── Modal.tsx
│   │       └── ...
│   ├── hooks/
│   │   ├── useGoals.ts
│   │   ├── useGoalCommands.ts      # Maps UI actions to commands
│   │   └── useLiveStoreQuery.ts
│   └── providers/
│       └── LiveStoreProvider.tsx
│
├── application/                    # Application Layer
│   ├── commands/
│   │   ├── CreateGoalCommand.ts
│   │   ├── UpdateGoalSummaryCommand.ts
│   │   ├── DeleteGoalCommand.ts
│   │   ├── ShareGoalCommand.ts
│   │   └── RevokeAccessCommand.ts
│   ├── handlers/
│   │   ├── CreateGoalHandler.ts
│   │   ├── UpdateGoalSummaryHandler.ts
│   │   ├── DeleteGoalHandler.ts
│   │   ├── ShareGoalHandler.ts
│   │   └── RevokeAccessHandler.ts
│   ├── services/
│   │   ├── GoalApplicationService.ts
│   │   └── IdentityApplicationService.ts
│   ├── ports/                      # Interfaces for infrastructure
│   │   ├── IEventStore.ts
│   │   ├── ICryptoService.ts
│   │   ├── IKeyStore.ts
│   │   └── ISyncService.ts
│   └── queries/
│       ├── GetGoalsBySliceQuery.ts
│       └── GetGoalsByMonthQuery.ts
│
├── domain/                         # Domain Layer
│   ├── goals/
│   │   ├── Goal.ts                 # Aggregate root
│   │   ├── GoalId.ts               # Value object
│   │   ├── Slice.ts                # Value object
│   │   ├── Priority.ts             # Value object
│   │   ├── Month.ts                # Value object
│   │   └── AccessEntry.ts          # Entity
│   ├── events/
│   │   ├── GoalCreated.ts
│   │   ├── GoalSummaryChanged.ts
│   │   ├── GoalSliceChanged.ts
│   │   ├── GoalTargetChanged.ts
│   │   ├── GoalPriorityChanged.ts
│   │   ├── GoalDeleted.ts
│   │   ├── GoalAccessGranted.ts
│   │   └── GoalAccessRevoked.ts
│   ├── identity/
│   │   ├── UserId.ts
│   │   └── DeviceId.ts
│   └── shared/
│       ├── DomainEvent.ts          # Base event interface
│       ├── AggregateRoot.ts        # Base aggregate
│       └── Entity.ts               # Base entity
│
└── infrastructure/                 # Infrastructure Layer
    ├── livestore/
    │   ├── schema.ts               # LiveStore schema definition
    │   ├── tables.ts               # SQLite table definitions
    │   ├── events.ts               # LiveStore event definitions
    │   ├── materializers.ts        # Event → state materializers
    │   ├── queries.ts              # Reactive queries
    │   └── adapter/
    │       └── DomainEventAdapter.ts  # Domain event → LiveStore event
    ├── crypto/
    │   ├── CryptoService.ts        # Implements ICryptoService
    │   ├── KeyStore.ts             # Implements IKeyStore
    │   └── EncryptedEventWrapper.ts
    ├── sync/
    │   ├── CustomSyncProvider.ts   # Implements LiveStore SyncBackend
    │   ├── SyncApiClient.ts        # HTTP client for sync endpoints
    │   └── EncryptedSyncAdapter.ts # Encryption layer for sync
    └── persistence/
        └── LiveStoreEventStore.ts  # Implements IEventStore
```

### 3.3 Dependency Rule

Dependencies flow inward only:

```
Interface → Application → Domain ← Infrastructure
                ↑                        │
                └────────────────────────┘
                  (implements ports)
```

- **Domain**: No dependencies. Pure TypeScript.
- **Application**: Depends only on Domain. Defines ports (interfaces).
- **Infrastructure**: Depends on Domain and implements Application ports.
- **Interface**: Depends on Application (via controllers/services) and Infrastructure (for DI).



## 4. Domain Model (Goals BC)

### 4.0 Domain Design Principles

The Domain layer is designed to feel like a **Domain-Specific Language (DSL)** that expresses business concepts naturally.

**Core Principles**:

1. **No Primitive Obsession**: Every domain concept is a Value Object, not a primitive
   ```typescript
   // ❌ Bad: Primitives everywhere
   function createGoal(slice: string, priority: string, month: string) { ... }

   // ✅ Good: Rich domain types
   function createGoal(slice: Slice, priority: Priority, targetMonth: TargetMonth) { ... }
   ```

2. **Assertions over Control Flow**: Use `assertive-ts` for invariants, not verbose if-else
   ```typescript
   // ❌ Bad: Verbose conditionals
   if (month < 1 || month > 12) {
     throw new Error('Invalid month');
   }

   // ✅ Good: Declarative assertions
   assert(month).toBeGreaterThanOrEqualTo(1).toBeLessThanOrEqualTo(12);
   ```

3. **Fluent, Natural Language API**: Methods read like business language
   ```typescript
   // ✅ Expressive, intention-revealing
   if (priority.isHigherThan(Priority.Should)) { ... }
   if (targetMonth.isBefore(Month.now())) { ... }
   const newMonth = targetMonth.addMonths(3);
   ```

4. **Immutability by Default**: Value Objects never mutate, always return new instances
   ```typescript
   const nextMonth = currentMonth.addMonths(1);  // Returns new instance
   ```

5. **Type Safety with Static Constants**: Predefined instances prevent typos
   ```typescript
   Slice.Health      // ✅ IDE autocomplete, type-safe
   Slice.of('Work')  // ✅ Runtime validation
   'health'          // ❌ Compile error
   ```

6. **Zero Infrastructure Dependencies**: Domain layer depends only on `assertive-ts` for validation
   - No frameworks
   - No database concerns
   - No serialization logic
   - Pure business logic

### 4.1 Aggregates

**Goal** (Aggregate Root)

```typescript
// domain/goals/Goal.ts
import { AggregateRoot } from '../shared/AggregateRoot';
import { GoalId } from './GoalId';
import { Slice } from './Slice';
import { Priority } from './Priority';
import { Month } from './Month';
import { AccessEntry } from './AccessEntry';
import { GoalCreated } from '../events/GoalCreated';
import { GoalSummaryChanged } from '../events/GoalSummaryChanged';
// ... other events

export class Goal extends AggregateRoot<GoalId> {
  private _slice: Slice;
  private _summary: string;
  private _targetMonth: Month;
  private _priority: Priority;
  private _createdBy: string;
  private _createdAt: Date;
  private _deletedAt: Date | null = null;
  private _accessList: AccessEntry[] = [];

  private constructor(id: GoalId) {
    super(id);
  }

  static create(params: {
    id: GoalId;
    slice: Slice;
    summary: string;
    targetMonth: Month;
    priority: Priority;
    createdBy: string;
  }): Goal {
    assert(params.summary).toBeNonEmptyString();

    const goal = new Goal(params.id);
    goal.apply(new GoalCreated({
      goalId: params.id.value,
      slice: params.slice.value,
      summary: params.summary,
      targetMonth: params.targetMonth.value,
      priority: params.priority.level,
      createdBy: params.createdBy,
      createdAt: new Date(),
    }));
    return goal;
  }

  changeSummary(newSummary: string): void {
    assert(!this._deletedAt).toBeTruthy();
    assert(newSummary).toBeNonEmptyString();
    assert(newSummary).not.toBeEqualTo(this._summary);

    this.apply(new GoalSummaryChanged({
      goalId: this.id.value,
      summary: newSummary,
      changedAt: new Date(),
    }));
  }

  changeSlice(newSlice: Slice): void {
    assert(!this._deletedAt).toBeTruthy();
    assert(newSlice).not.toBeEqualTo(this._slice);

    this.apply(new GoalSliceChanged({
      goalId: this.id.value,
      slice: newSlice.value,
      changedAt: new Date(),
    }));
  }

  // ... other methods

  // Event handlers (called by apply)
  protected onGoalCreated(event: GoalCreated): void {
    this._slice = Slice.of(event.slice);
    this._summary = event.summary;
    this._targetMonth = Month.fromString(event.targetMonth);
    this._priority = Priority.of(event.priority);
    this._createdBy = event.createdBy;
    this._createdAt = event.createdAt;
  }

  protected onGoalSummaryChanged(event: GoalSummaryChanged): void {
    this._summary = event.summary;
  }

  protected onGoalSliceChanged(event: GoalSliceChanged): void {
    this._slice = Slice.of(event.slice);
  }

  protected onGoalTargetChanged(event: GoalTargetChanged): void {
    this._targetMonth = Month.fromString(event.targetMonth);
  }

  protected onGoalPriorityChanged(event: GoalPriorityChanged): void {
    this._priority = Priority.of(event.priority);
  }

  // ... other event handlers
}
```

### 4.2 Value Objects (DSL-Style with Assertions)

**Design Principles**:
- Every type is a Value Object (no primitives leak through domain boundary)
- Fluent, expressive API that reads like natural language
- Invariants enforced via `assertive-ts` (no verbose if-else chains)
- Immutable by design
- Rich behavior, not anemic data structures

```typescript
// domain/goals/Slice.ts
import { assert } from 'assertive-ts';

export type SliceValue =
  | 'Health'
  | 'Family'
  | 'Relationships'
  | 'Work'
  | 'Money'
  | 'Learning'
  | 'Mindfulness'
  | 'Leisure';

export const ALL_SLICES: readonly SliceValue[] = [
  'Health', 'Family', 'Relationships', 'Work',
  'Money', 'Learning', 'Mindfulness', 'Leisure'
] as const;

export class Slice {
  private constructor(private readonly _value: SliceValue) {}

  static of(value: string): Slice {
    assert(value).toBeIncludedIn(ALL_SLICES);
    return new Slice(value as SliceValue);
  }

  static Health = Slice.of('Health');
  static Family = Slice.of('Family');
  static Relationships = Slice.of('Relationships');
  static Work = Slice.of('Work');
  static Money = Slice.of('Money');
  static Learning = Slice.of('Learning');
  static Mindfulness = Slice.of('Mindfulness');
  static Leisure = Slice.of('Leisure');

  get value(): SliceValue {
    return this._value;
  }

  equals(other: Slice): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}

// domain/goals/Priority.ts
import { assert } from 'assertive-ts';

export type PriorityLevel = 'must' | 'should' | 'maybe';

export class Priority {
  private constructor(private readonly _level: PriorityLevel) {}

  static of(level: string): Priority {
    assert(level).toBeIncludedIn(['must', 'should', 'maybe']);
    return new Priority(level as PriorityLevel);
  }

  static Must = Priority.of('must');
  static Should = Priority.of('should');
  static Maybe = Priority.of('maybe');

  get level(): PriorityLevel {
    return this._level;
  }

  isMust(): boolean {
    return this._level === 'must';
  }

  isShould(): boolean {
    return this._level === 'should';
  }

  isMaybe(): boolean {
    return this._level === 'maybe';
  }

  isHigherThan(other: Priority): boolean {
    const order: Record<PriorityLevel, number> = { must: 3, should: 2, maybe: 1 };
    return order[this._level] > order[other._level];
  }

  equals(other: Priority): boolean {
    return this._level === other._level;
  }

  toString(): string {
    return this._level;
  }
}

// domain/goals/Month.ts
import { assert } from 'assertive-ts';

export class Month {
  private constructor(
    private readonly _year: number,
    private readonly _month: number // 1-12
  ) {
    assert(_year).toBeGreaterThan(2000);
    assert(_month).toBeGreaterThanOrEqualTo(1).toBeLessThanOrEqualTo(12);
  }

  static of(year: number, month: number): Month {
    return new Month(year, month);
  }

  static fromString(value: string): Month {
    assert(value).toMatch(/^\d{4}-\d{2}$/);
    const [year, month] = value.split('-').map(Number);
    return new Month(year, month);
  }

  static now(): Month {
    const date = new Date();
    return new Month(date.getFullYear(), date.getMonth() + 1);
  }

  get year(): number {
    return this._year;
  }

  get month(): number {
    return this._month;
  }

  get value(): string {
    return `${this._year}-${String(this._month).padStart(2, '0')}`;
  }

  isBefore(other: Month): boolean {
    return this._year < other._year ||
           (this._year === other._year && this._month < other._month);
  }

  isAfter(other: Month): boolean {
    return this._year > other._year ||
           (this._year === other._year && this._month > other._month);
  }

  isSameAs(other: Month): boolean {
    return this.equals(other);
  }

  addMonths(count: number): Month {
    assert(count).toBeInteger();
    const totalMonths = (this._year * 12 + this._month - 1) + count;
    const newYear = Math.floor(totalMonths / 12);
    const newMonth = (totalMonths % 12) + 1;
    return new Month(newYear, newMonth);
  }

  equals(other: Month): boolean {
    return this._year === other._year && this._month === other._month;
  }

  toString(): string {
    return this.value;
  }
}

// domain/goals/GoalId.ts
import { assert } from 'assertive-ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class GoalId {
  private constructor(private readonly _value: string) {
    assert(_value).toMatch(UUID_REGEX);
  }

  static create(): GoalId {
    return new GoalId(crypto.randomUUID());
  }

  static of(value: string): GoalId {
    return new GoalId(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: GoalId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
```

**Usage Examples (DSL-style)**:

```typescript
// Creating goals with fluent, expressive API
const goal = Goal.create({
  id: GoalId.create(),
  slice: Slice.Health,
  summary: 'Run a marathon',
  targetMonth: Month.now().addMonths(6),
  priority: Priority.Must,
  createdBy: userId,
});

// Natural language-like queries
if (goal.priority.isHigherThan(Priority.Should)) {
  // High priority goal
}

if (goal.targetMonth.isBefore(Month.now())) {
  // Goal is overdue
}

const nextQuarter = Month.now().addMonths(3);
if (goal.targetMonth.isSameAs(nextQuarter)) {
  // Due next quarter
}

// Type safety with no primitive obsession
goal.changeSlice(Slice.Work);           // ✅ Type-safe
goal.changeSlice('Work');                // ❌ Compile error
goal.changeSlice(Slice.of('Unknown'));   // ❌ Runtime assertion error
```

### 4.3 Domain Events

```typescript
// domain/shared/DomainEvent.ts
export interface DomainEvent {
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
}

// domain/events/GoalCreated.ts
import { DomainEvent } from '../shared/DomainEvent';
import { SliceValue } from '../goals/Slice';
import { PriorityLevel } from '../goals/Priority';

export class GoalCreated implements DomainEvent {
  readonly eventType = 'GoalCreated';
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(public readonly payload: {
    goalId: string;
    slice: SliceValue;           // Primitive for serialization
    summary: string;
    targetMonth: string;          // ISO string YYYY-MM
    priority: PriorityLevel;      // Primitive for serialization
    createdBy: string;
    createdAt: Date;
  }) {
    this.occurredAt = payload.createdAt;
    this.aggregateId = payload.goalId;
  }
}

// domain/events/GoalSummaryChanged.ts
export class GoalSummaryChanged implements DomainEvent {
  readonly eventType = 'GoalSummaryChanged';
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(public readonly payload: {
    goalId: string;
    summary: string;
    changedAt: Date;
  }) {
    this.occurredAt = payload.changedAt;
    this.aggregateId = payload.goalId;
  }
}

// Similar pattern for:
// - GoalSliceChanged
// - GoalTargetChanged
// - GoalPriorityChanged
// - GoalDeleted
// - GoalAccessGranted
// - GoalAccessRevoked
```



## 5. Application Layer

The Application layer is the write-side orchestration:

`interface (components/hooks) → command DTOs → handlers → application services → domain`

Commands are **DTOs that closely mirror domain event payloads**, but use primitives (strings, numbers) instead of domain objects. Handlers are responsible for converting DTOs into rich domain types and calling aggregates.

### 5.1 Commands

```typescript
// application/commands/CreateGoalCommand.ts
import { SliceValue } from '../../domain/goals/Slice';
import { PriorityLevel } from '../../domain/goals/Priority';

export interface CreateGoalCommand {
  readonly type: 'CreateGoal';
  readonly goalId: string;
  readonly slice: SliceValue;        // e.g. 'Health'
  readonly summary: string;
  readonly targetMonth: string;      // 'YYYY-MM'
  readonly priority: PriorityLevel;  // 'must' | 'should' | 'maybe'
}

// application/commands/UpdateGoalSummaryCommand.ts
export interface UpdateGoalSummaryCommand {
  readonly type: 'UpdateGoalSummary';
  readonly goalId: string;
  readonly summary: string;
}

// application/commands/DeleteGoalCommand.ts
export interface DeleteGoalCommand {
  readonly type: 'DeleteGoal';
  readonly goalId: string;
}

// application/commands/ShareGoalCommand.ts
export interface ShareGoalCommand {
  readonly type: 'ShareGoal';
  readonly goalId: string;
  readonly grantToUserId: string;
  readonly permission: 'view' | 'edit';
}
```

### 5.2 Command Handlers and Application Services

```typescript
// application/handlers/CreateGoalHandler.ts
import { CreateGoalCommand } from '../commands/CreateGoalCommand';
import { GoalApplicationService } from '../services/GoalApplicationService';

/**
 * Thin command handler: validates DTO and delegates to the application service.
 * All orchestration (keys, aggregates, persistence) lives in GoalApplicationService.
 */
export class CreateGoalHandler {
  constructor(
    private readonly goalAppService: GoalApplicationService,
    private readonly currentUserId: string,
  ) {}

  async handle(command: CreateGoalCommand): Promise<void> {
    await this.goalAppService.createGoal(command, this.currentUserId);
  }
}

// application/services/KeyManagementService.ts
import { ICryptoService } from '../ports/ICryptoService';
import { IKeyStore } from '../ports/IKeyStore';

export interface IKeyManagementService {
  createAggregateKey(aggregateId: string, ownerUserId: string): Promise<{
    kAggregate: CryptoKey;
    ownerWrappedKey: Uint8Array;
  }>;
}

export class KeyManagementService implements IKeyManagementService {
  constructor(
    private readonly crypto: ICryptoService,
    private readonly keyStore: IKeyStore,
  ) {}

  async createAggregateKey(aggregateId: string, ownerUserId: string) {
    const kAggregate = await this.crypto.generateSymmetricKey();
    const ownerPubEnc = await this.keyStore.getUserEncryptionPublicKey(ownerUserId);
    const ownerWrappedKey = await this.crypto.wrapKey(kAggregate, ownerPubEnc);

    await this.keyStore.storeGoalKey(aggregateId, kAggregate, 'owner');

    return { kAggregate, ownerWrappedKey };
  }
}

// application/services/GoalApplicationService.ts
import { Goal } from '../../domain/goals/Goal';
import { GoalId } from '../../domain/goals/GoalId';
import { Slice } from '../../domain/goals/Slice';
import { Priority } from '../../domain/goals/Priority';
import { Month } from '../../domain/goals/Month';
import { CreateGoalCommand } from '../commands/CreateGoalCommand';
import { IEventStore } from '../ports/IEventStore';
import { IKeyManagementService } from './KeyManagementService';

export class GoalApplicationService {
  constructor(
    private readonly keyManagement: IKeyManagementService,
    private readonly eventStore: IEventStore,
  ) {}

  async createGoal(command: CreateGoalCommand, currentUserId: string): Promise<void> {
    // 1. Generate per-aggregate key + owner access metadata
    const { kAggregate, ownerWrappedKey } =
      await this.keyManagement.createAggregateKey(command.goalId, currentUserId);

    // 2. Create domain aggregate
    const goal = Goal.create({
      id: GoalId.of(command.goalId),
      slice: Slice.of(command.slice),
      summary: command.summary,
      targetMonth: Month.fromString(command.targetMonth),
      priority: Priority.of(command.priority),
      createdBy: currentUserId,
    });

    // 3. Persist events via event store (infra handles double encryption + sync)
    const events = goal.getUncommittedEvents();
    await this.eventStore.append(command.goalId, events, kAggregate, {
      ownerUserId: currentUserId,
      ownerWrappedKey,
    });
  }
}
```

### 5.3 Ports (Interfaces)

```typescript
// application/ports/IEventStore.ts
import { DomainEvent } from '../../domain/shared/DomainEvent';

export interface IEventStore {
  /**
   * Append domain events for a single aggregate.
   * 
   * kGoal is the per-goal symmetric key; the implementation is responsible
   * for deriving envelope and field-encryption keys and pushing encrypted
   * events into LiveStore (and, via sync, to the backend).
   *
   * accessMetadata is used to ensure that the owner has a wrapped K_goal
   * persisted server-side on first write.
   */
  append(
    aggregateId: string,
    events: DomainEvent[],
    kGoal: CryptoKey,
    accessMetadata: { ownerUserId: string; ownerWrappedKey: Uint8Array },
  ): Promise<void>;
}

// application/ports/ICryptoService.ts
export interface ICryptoService {
  // Symmetric crypto
  generateSymmetricKey(): Promise<CryptoKey>;
  encrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array>;
  decrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array>;

  // Password-derived keys for identity backup
  deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey>;

  // Identity keypairs (implemented with WebCrypto ECDSA/ECDH P-256 for the POC)
  generateSigningKeyPair(): Promise<CryptoKeyPair>;    // ECDSA: auth / challenge-response
  generateEncryptionKeyPair(): Promise<CryptoKeyPair>; // ECDH: key agreement / wrapping
  sign(data: Uint8Array, privateKey: CryptoKey): Promise<Uint8Array>;
  verify(data: Uint8Array, signature: Uint8Array, publicKey: CryptoKey): Promise<boolean>;

  /**
   * Key wrapping (used for wrapping K_goal with identity encryption keys).
   *
   * Implemented as an ECIES-style scheme:
   *  - wrapKey uses recipientPublicKey (ECDH) + an ephemeral keypair internally
   *    to derive a shared AES-GCM key and encrypt the raw bytes of keyToWrap.
   *  - unwrapKey parses the ephemeral public key from the wrapped blob and
   *    uses recipientPrivateKey to derive the same AES-GCM key and recover K_goal.
   */
  wrapKey(keyToWrap: CryptoKey, recipientPublicKey: CryptoKey): Promise<Uint8Array>;
  unwrapKey(wrappedKey: Uint8Array, recipientPrivateKey: CryptoKey): Promise<CryptoKey>;

  // Deterministic derivation of sub-keys for double encryption
    deriveSubKey(rootKey: CryptoKey, info: 'remote' | 'local'): Promise<CryptoKey>;
}

// application/ports/IKeyStore.ts
export interface IKeyStore {
  /**
   * Identity key storage (private keys encrypted with K_pwd).
   *
   * The implementation is expected to:
   *  - Store both signing and encryption private keys in an encrypted bundle.
   *  - Store signing and encryption public keys in cleartext for lookups.
   */
  storeIdentityKeys(params: {
    encryptedSigningPrivateKey: Uint8Array;
    signingPublicKey: Uint8Array;
    encryptedEncryptionPrivateKey: Uint8Array;
    encryptionPublicKey: Uint8Array;
    salt: Uint8Array;
  }): Promise<void>;

  getIdentityKeyPairs(password: string): Promise<{
    signing: CryptoKeyPair;
    encryption: CryptoKeyPair;
  }>;

  // Per-goal key cache for the *current* user.
  // Implementation may persist K_goal re-wrapped with the identity keys or K_pwd.
  storeGoalKey(goalId: string, kGoal: CryptoKey, permission: 'owner' | 'edit' | 'view'): Promise<void>;
  getGoalKey(goalId: string): Promise<{ key: CryptoKey; permission: string }>;

  /**
   * Lookup of other users' public *encryption* keys (for sharing/invites).
   *
   * Implementations are expected to:
   *  - Maintain a local cache (IndexedDB / LiveStore table) of known userId → public_encryption_key.
   *  - On cache miss, call the backend `GET /users/:id/public-keys` endpoint to fetch
   *    `public_encryption_key` (and optionally public_signing_key), then cache it.
   *
   * The Application layer only sees this as a pure lookup; networking and caching
   * are Infrastructure concerns hidden behind this port.
   */
  getUserEncryptionPublicKey(userId: string): Promise<CryptoKey>;
}
```



## 6. Infrastructure Layer: LiveStore Integration

### 6.1 LiveStore Schema

LiveStore uses Effect Schema for type-safe event definitions and SQLite tables for materialized state.

```typescript
// infrastructure/livestore/schema.ts
import { Events, Schema, State, makeSchema } from '@livestore/livestore';
import { tables } from './tables';
import { events } from './events';
import { materializers } from './materializers';

const state = State.SQLite.makeState({ tables, materializers });

export const schema = makeSchema({ events, state });
```

### 6.2 LiveStore Tables (State)

```typescript
// infrastructure/livestore/tables.ts
import { State, Schema } from '@livestore/livestore';

export const tables = {
  goals: State.SQLite.table({
    name: 'goals',
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      // All user-visible fields are stored as ciphertext encrypted with K_goal_local.
      // Only IDs and timestamps remain plaintext for sync/projection purposes.
      slice: State.SQLite.text(),        // ciphertext
      summary: State.SQLite.text(),      // ciphertext
      targetMonth: State.SQLite.text(),  // ciphertext
      priority: State.SQLite.text(),     // ciphertext
      createdBy: State.SQLite.text(),
      createdAt: State.SQLite.datetime(),
      deletedAt: State.SQLite.datetime({ nullable: true }),
    },
  }),

  // Local, UI-only view of aggregate access relationships. This is not a
  // security boundary; enforcement happens via cryptographic keys and
  // the backend's aggregate_access table. This table exists to power
  // "who has access to this goal?" UI.
  goalAccess: State.SQLite.table({
    name: 'goal_access_view',
    columns: {
      id: State.SQLite.text({ primaryKey: true }), // goalId + userId composite
      goalId: State.SQLite.text(),
      userId: State.SQLite.text(),
      permission: State.SQLite.text(), // 'owner' | 'edit' | 'view'
      grantedAt: State.SQLite.datetime(),
      revokedAt: State.SQLite.datetime({ nullable: true }),
    },
  }),

  goalKeys: State.SQLite.table({
    name: 'goal_keys',
    columns: {
      goalId: State.SQLite.text({ primaryKey: true }),
      // Per-current-user cache of K_goal, stored re-wrapped with the identity key
      wrappedKey: State.SQLite.blob(),
      permission: State.SQLite.text(), // 'owner' | 'edit' | 'view'
    },
  }),

  syncState: State.SQLite.table({
    name: 'sync_state',
    columns: {
      key: State.SQLite.text({ primaryKey: true }),
      value: State.SQLite.text(),
    },
  }),

  // Client-only UI state
  uiState: State.SQLite.clientDocument({
    name: 'uiState',
    schema: Schema.Struct({
      selectedSlice: Schema.String.pipe(Schema.optional),
      viewMode: Schema.Literal('wheel', 'timeline'),
    }),
    default: {
      id: 'default',
      value: { viewMode: 'wheel' as const },
    },
  }),
};
```

### 6.3 LiveStore Events

LiveStore events are separate from domain events. The infrastructure layer transforms domain events into LiveStore events.  
Events committed to LiveStore already contain **field-level encrypted data** for sensitive fields; envelope encryption for server transport happens in the sync backend (Section 7).

```typescript
// infrastructure/livestore/events.ts
import { Events, Schema } from '@livestore/livestore';

export const events = {
  // Goal lifecycle events (arguments may contain ciphertext in some fields)
  goalCreated: Events.synced({
    name: 'v1.GoalCreated',
    schema: Schema.Struct({
      goalId: Schema.String,
      slice: Schema.String,        // may be plaintext
      summary: Schema.String,      // may be ciphertext (K_goal_local)
      targetMonth: Schema.String,  // may be ciphertext
      priority: Schema.String,     // may be ciphertext
      createdBy: Schema.String,
      createdAt: Schema.String,
    }),
  }),

  goalSummaryChanged: Events.synced({
    name: 'v1.GoalSummaryChanged',
    schema: Schema.Struct({
      goalId: Schema.String,
      summary: Schema.String,      // may be ciphertext
      changedAt: Schema.String,
    }),
  }),

  goalSliceChanged: Events.synced({
    name: 'v1.GoalSliceChanged',
    schema: Schema.Struct({
      goalId: Schema.String,
      slice: Schema.String,
      changedAt: Schema.String,
    }),
  }),

  goalTargetChanged: Events.synced({
    name: 'v1.GoalTargetChanged',
    schema: Schema.Struct({
      goalId: Schema.String,
      targetMonth: Schema.String,  // may be ciphertext
      changedAt: Schema.String,
    }),
  }),

  goalPriorityChanged: Events.synced({
    name: 'v1.GoalPriorityChanged',
    schema: Schema.Struct({
      goalId: Schema.String,
      priority: Schema.String,     // may be ciphertext
      changedAt: Schema.String,
    }),
  }),

  goalDeleted: Events.synced({
    name: 'v1.GoalDeleted',
    schema: Schema.Struct({
      goalId: Schema.String,
      deletedAt: Schema.String,
    }),
  }),

  // UI-only access events: used to populate goal_access_view locally.
  goalAccessGranted: Events.synced({
    name: 'v1.GoalAccessGranted',
    schema: Schema.Struct({
      goalId: Schema.String,
      grantedTo: Schema.String,
      permission: Schema.String,
      grantedAt: Schema.String,
    }),
  }),

  goalAccessRevoked: Events.synced({
    name: 'v1.GoalAccessRevoked',
    schema: Schema.Struct({
      goalId: Schema.String,
      revokedFrom: Schema.String,
      revokedAt: Schema.String,
    }),
  }),

  // Key management (client-only; per-current-user cache of K_goal)
  goalKeyStored: Events.local({
    name: 'v1.GoalKeyStored',
    schema: Schema.Struct({
      goalId: Schema.String,
      wrappedKey: Schema.Uint8ArrayFromBase64,
      permission: Schema.String,
    }),
  }),
};
```

### 6.4 Materializers

Materializers are pure, synchronous functions that update SQLite tables.  
They never perform crypto themselves; they receive already field-encrypted arguments (for sensitive fields) and store them as-is.  
Decryption with `K_goal_local` happens in Infrastructure adapters that read from `tables.goals` before returning data to the UI.

```typescript
// infrastructure/livestore/materializers.ts
import { State } from '@livestore/livestore';
import { tables } from './tables';
import { events } from './events';

export const materializers = State.SQLite.materializers(events, {
  'v1.GoalCreated': ({ goalId, slice, summary, targetMonth, priority, createdBy, createdAt }, ctx) => {
    return tables.goals.insert({
      id: goalId,
      slice,
      summary,
      targetMonth,
      priority,
      createdBy,
      createdAt: new Date(createdAt),
      deletedAt: null,
    });
  },

  'v1.GoalSummaryChanged': ({ goalId, summary }, ctx) => {
    return tables.goals.update({ summary }).where({ id: goalId });
  },

  'v1.GoalSliceChanged': ({ goalId, slice }, ctx) => {
    return tables.goals.update({ slice }).where({ id: goalId });
  },

  'v1.GoalTargetChanged': ({ goalId, targetMonth }, ctx) => {
    return tables.goals.update({ targetMonth }).where({ id: goalId });
  },

  'v1.GoalPriorityChanged': ({ goalId, priority }, ctx) => {
    return tables.goals.update({ priority }).where({ id: goalId });
  },

  'v1.GoalDeleted': ({ goalId, deletedAt }, ctx) => {
    return tables.goals.update({ deletedAt: new Date(deletedAt) }).where({ id: goalId });
  },

  'v1.GoalAccessGranted': ({ goalId, grantedTo, permission, grantedAt }, ctx) => {
    return tables.goalAccess.insert({
      id: `${goalId}:${grantedTo}`,
      goalId,
      userId: grantedTo,
      permission,
      grantedAt: new Date(grantedAt),
      revokedAt: null,
    });
  },

  'v1.GoalAccessRevoked': ({ goalId, revokedFrom, revokedAt }, ctx) => {
    return tables.goalAccess
      .update({ revokedAt: new Date(revokedAt) })
      .where({ goalId, userId: revokedFrom });
  },

  'v1.GoalKeyStored': ({ goalId, wrappedKey, permission }) => {
    return tables.goalKeys.insert({ goalId, wrappedKey, permission });
  },
});
```

### 6.5 Domain Event Adapter

Transforms domain events to LiveStore events and applies **field-level encryption** using `K_goal_local`.  
Envelope encryption for server transport is handled later in the sync backend (Section 7).

```typescript
// infrastructure/livestore/adapter/DomainEventAdapter.ts
import { DomainEvent } from '../../../domain/shared/DomainEvent';
import { events } from '../events';
import { ICryptoService } from '../../../application/ports/ICryptoService';

export class DomainEventAdapter {
  constructor(private readonly cryptoService: ICryptoService) {}

  async toLiveStoreEvent(
    domainEvent: DomainEvent,
    kGoalLocal: CryptoKey,
  ): Promise<{ eventName: keyof typeof events; args: Record<string, unknown> }> {
    const type = domainEvent.eventType;
    const p: any = domainEvent.payload;

    // Helper to optionally encrypt fields with K_goal_local
    const enc = async (value: string): Promise<string> => {
      const bytes = new TextEncoder().encode(value);
      const cipher = await this.cryptoService.encrypt(bytes, kGoalLocal);
      return Buffer.from(cipher).toString('base64');
    };

    switch (type) {
      case 'GoalCreated':
        return {
          eventName: 'goalCreated',
          args: {
            goalId: p.goalId,
            slice: await enc(p.slice),
            summary: await enc(p.summary),
            targetMonth: await enc(p.targetMonth),
            priority: await enc(p.priority),
            createdBy: p.createdBy,
            createdAt: p.createdAt.toISOString(),
          },
        };

      case 'GoalSummaryChanged':
        return {
          eventName: 'goalSummaryChanged',
          args: {
            goalId: p.goalId,
            summary: await enc(p.summary),
            changedAt: p.changedAt.toISOString(),
          },
        };

      case 'GoalSliceChanged':
        return {
          eventName: 'goalSliceChanged',
          args: {
            goalId: p.goalId,
            slice: await enc(p.slice),
            changedAt: p.changedAt.toISOString(),
          },
        };

      case 'GoalTargetChanged':
        return {
          eventName: 'goalTargetChanged',
          args: {
            goalId: p.goalId,
            targetMonth: await enc(p.targetMonth),
            changedAt: p.changedAt.toISOString(),
          },
        };

      case 'GoalPriorityChanged':
        return {
          eventName: 'goalPriorityChanged',
          args: {
            goalId: p.goalId,
            priority: await enc(p.priority),
            changedAt: p.changedAt.toISOString(),
          },
        };

      case 'GoalDeleted':
        return {
          eventName: 'goalDeleted',
          args: {
            goalId: p.goalId,
            deletedAt: p.deletedAt.toISOString(),
          },
        };

      case 'GoalAccessGranted':
        return {
          eventName: 'goalAccessGranted',
          args: {
            goalId: p.goalId,
            grantedTo: p.grantedTo,
            permission: p.permission,
            grantedAt: p.grantedAt.toISOString(),
          },
        };

      case 'GoalAccessRevoked':
        return {
          eventName: 'goalAccessRevoked',
          args: {
            goalId: p.goalId,
            revokedFrom: p.revokedFrom,
            revokedAt: p.revokedAt.toISOString(),
          },
        };

      default:
        throw new Error(`Unknown domain event type: ${type}`);
    }
  }
}
```

### 6.6 LiveStore Event Store Implementation

```typescript
// infrastructure/persistence/LiveStoreEventStore.ts
import { IEventStore } from '../../application/ports/IEventStore';
import { DomainEvent } from '../../domain/shared/DomainEvent';
import { DomainEventAdapter } from '../livestore/adapter/DomainEventAdapter';
import { events } from '../livestore/events';
import { Store } from '@livestore/livestore';

export class LiveStoreEventStore implements IEventStore {
  constructor(
    private readonly store: Store,
    private readonly adapter: DomainEventAdapter,
  ) {}

  async append(
    aggregateId: string,
    domainEvents: DomainEvent[],
    kGoal: CryptoKey,
    accessMetadata: { ownerUserId: string; ownerWrappedKey: Uint8Array },
  ): Promise<void> {
    // Derive K_goal_local for field-level encryption
    const kGoalLocal = await this.adapter['cryptoService'].deriveSubKey(kGoal, 'local');

    for (const domainEvent of domainEvents) {
      const { eventName, args } = await this.adapter.toLiveStoreEvent(domainEvent, kGoalLocal);
      const liveStoreEvent = events[eventName];

      // 1. Commit to the local LiveStore eventlog + projections.
      //    This is an offline, fast operation; no network calls here.
      this.store.commit(liveStoreEvent(args));
    }

    // 2. Ensure the backend eventually knows the owner has access to this aggregate (wrapped K_goal).
    //    This is handled asynchronously by the sync layer:
    //    - The EncryptedSyncAdapter sees new local events and schedules a push.
    //    - If push fails (offline / network / 5xx), events remain in the local log
    //      and will be retried with exponential backoff.
    //    - NO rollback of local events occurs; the client behaves as offline-first
    //      until sync catches up.
  }
}
```

### 6.7 Custom Sync Provider

Implements LiveStore's SyncBackend interface to sync with our NestJS backend.

```typescript
// infrastructure/sync/CustomSyncProvider.ts
import { Effect, Stream } from 'effect';
import { SyncApiClient } from './SyncApiClient';

export interface LiveStoreEvent {
  seqNum: number;
  parentSeqNum: number;
  name: string;
  args: unknown;
}

export interface SyncBackend {
  pull: (cursor: number) => Stream.Stream<{ batch: LiveStoreEvent[] }, Error>;
  push: (batch: LiveStoreEvent[]) => Effect.Effect<void, Error>;
}

export const makeCustomSyncBackend = (config: {
  apiUrl: string;
  getAuthToken: () => Promise<string>;
}): SyncBackend => {
  const client = new SyncApiClient(config.apiUrl, config.getAuthToken);

  return {
    pull: (cursor: number) => {
      return Stream.fromEffect(
        Effect.tryPromise({
          try: async () => {
            const events = await client.pullEvents(cursor);
            return { batch: events };
          },
          catch: (error) => new Error(`Pull failed: ${error}`),
        })
      );
    },

    push: (batch: LiveStoreEvent[]) => {
      return Effect.tryPromise({
        try: async () => {
          await client.pushEvents(batch);
        },
        catch: (error) => new Error(`Push failed: ${error}`),
      });
    },
  };
};
```

### 6.8 Queries

```typescript
// infrastructure/livestore/queries.ts
import { queryDb } from '@livestore/livestore';
import { tables } from './tables';

// Low-level queries: return encrypted projections from SQLite.
// These are NOT consumed directly by UI; read adapters in Infrastructure
// (GoalReadModel, etc.) will decrypt selected fields using K_goal_local
// before data reaches React components.

// Get all active goals (encrypted fields)
export const allGoals$ = queryDb(
  tables.goals.query.where({ deletedAt: null })
);

// Get goals by slice (encrypted fields, reactive to slice changes).
// NOTE: slice is encrypted; filtering by slice is performed in read adapters
// after decryption, not in SQL.
export const goalsBySlice$ = (slice: string) =>
  queryDb(
    tables.goals.query.where({ deletedAt: null }),
    { deps: [slice] },
  );

// Get goals for timeline view (by month range, encrypted fields).
// NOTE: targetMonth is encrypted; range filtering is performed in read adapters
// after decryption, not in SQL.
export const goalsByMonthRange$ = (startMonth: string, endMonth: string) =>
  queryDb(
    tables.goals.query.where({ deletedAt: null }),
    { deps: [startMonth, endMonth] },
  );

// Get goal access list (UI-only, not enforced locally)
export const goalAccess$ = (goalId: string) => queryDb(
  tables.goalAccess.query
    .where({ goalId, revokedAt: null })
);


### 6.9 Sync Encryption Adapter (Envelope Encryption)

The Infrastructure layer contains a `EncryptedSyncAdapter.ts` that wraps the low-level `SyncBackend` (`CustomSyncProvider`) and `SyncApiClient`. This adapter is responsible for **envelope encryption with `K_goal_remote`**; domain and materializers never see this layer.

**Push path (frontend → backend)**:
- LiveStore calls the sync backend with events of the form `{ name, args }`.
- For each event, the adapter:
  - Looks up `K_goal` (or `K_aggregate`) for `aggregateId` via `IKeyStore.getGoalKey`.
  - Derives `K_goal_remote = deriveSubKey(K_goal, 'remote')`.
  - Serializes `args` (e.g. JSON) to bytes.
  - Encrypts bytes with `K_goal_remote` (AES-GCM) → `encryptedArgs`.
  - Sends `encryptedArgs` to the backend via `SyncApiClient.pushEvents`, which stores it in `events.encrypted_args`.

**Pull path (backend → frontend)**:
- `SyncApiClient.pullEvents` returns events with `{ id, seq, parentSeq, name, aggregateId, encryptedArgs }`.
- For each event, the adapter:
  - Looks up `K_goal` for `aggregateId` and derives `K_goal_remote`.
  - Decrypts `encryptedArgs` with `K_goal_remote` to recover the original `args` object (which may still contain field-level ciphertext encrypted under `K_goal_local`).
  - Passes `{ name, args }` to the underlying `SyncBackend` / LiveStore so materializers see the expected shape.

`EncryptedEventWrapper.ts` (if present) is a small helper for serializing/deserializing the `{ name, args }` + `encryptedArgs` envelope. All key management and encryption logic lives in the sync adapter; the Domain and Application layers remain unaware of envelope encryption details.
```



## 7. Cryptographic Model

### 7.1 Key Hierarchy

We use a layered key hierarchy with **per-identity asymmetric keys** and a single **per-goal symmetric key**.  
For the POC, identity keys are implemented with WebCrypto-supported curves (ECDSA/ECDH P-256) to ensure compatibility with browsers and React Native.  
In future, this can be swapped for Ed25519/X25519 without changing higher-level architecture.

```
User Identity Layer:
┌─────────────────────────────────────────────────────┐
│  identity_signing_keypair                           │
│    ├── public_signing_key → userId (pseudonymous)   │
│    └── private_signing_key → encrypted with K_pwd   │
│                                                     │
│  identity_encryption_keypair                        │
│    ├── public_encryption_key  (stored server-side)  │
│    └── private_encryption_key → encrypted with K_pwd│
└─────────────────────────────────────────────────────┘
          │
          │ wraps/unwraps K_goal for this user (via identity_encryption_keypair)
          ▼
Per-Goal Encryption Layer:
┌─────────────────────────────────────────────────────┐
│  K_goal (256-bit symmetric, per goal)               │
│    ├── K_goal_remote = HKDF(K_goal, 'remote')       │
│    └── K_goal_local  = HKDF(K_goal, 'local')        │
│        (derived via ICryptoService.deriveSubKey)    │
└─────────────────────────────────────────────────────┘
          │                       │
          │ encrypts              │ encrypts
          ▼                       ▼
Envelope (server transport)  Field-level data (local)
┌─────────────────────────────────────────────────────┐
│  AEAD(args, K_goal_remote)                          │
│  Stored on server as encrypted_args (events table)  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  AEAD(fieldValue, K_goal_local)                     │
│  Stored in LiveStore / SQLite as ciphertext         │
└─────────────────────────────────────────────────────┘
```

- Server only ever sees **envelope ciphertext** encrypted with `K_goal_remote`.
- Local projections (LiveStore tables) store **field-level ciphertext** for sensitive fields using `K_goal_local`.
- Decryption:
  - Envelope decryption with `K_goal_remote` happens in the sync backend before committing events to LiveStore.
  - Field-level decryption with `K_goal_local` happens in Infrastructure adapters when reading from projections for display.

### 7.2 Crypto Service Implementation (POC)

```typescript
// infrastructure/crypto/CryptoService.ts
import { ICryptoService } from '../../application/ports/ICryptoService';

export class CryptoService implements ICryptoService {
  async generateSymmetricKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true, // extractable for wrapping / derivation
      ['encrypt', 'decrypt']
    );
  }

  async generateSigningKeyPair(): Promise<CryptoKeyPair> {
    // POC: ECDSA P-256 for signatures (auth)
    return crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['sign', 'verify']
    ) as Promise<CryptoKeyPair>;
  }

  async generateEncryptionKeyPair(): Promise<CryptoKeyPair> {
    // POC: ECDH P-256 for key agreement / wrapping
    return crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveKey', 'deriveBits']
    ) as Promise<CryptoKeyPair>;
  }

  async deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // Note: For production, use Argon2id via argon2-browser, hash-wasm, or native bindings
    // PBKDF2 used here for Web Crypto API compatibility
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 600000,
        hash: 'SHA-256',
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
  }

  async wrapKey(keyToWrap: CryptoKey, recipientPublicKey: CryptoKey): Promise<Uint8Array> {
    // ECIES-style wrap using ECDH + AES-GCM
    // 1. Generate ephemeral ECDH keypair
    const ephemeral = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );

    // 2. Derive a shared AES key
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: recipientPublicKey },
      ephemeral.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    // 3. Export K_goal to raw bytes
    const rawKGoal = await crypto.subtle.exportKey('raw', keyToWrap);

    // 4. Encrypt K_goal with AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      rawKGoal,
    );

    // 5. Serialize ephemeral public key + IV + ciphertext
    const ephemeralPublicSpki = await crypto.subtle.exportKey('spki', ephemeral.publicKey);
    const ep = new Uint8Array(ephemeralPublicSpki);
    const ct = new Uint8Array(ciphertext);
    const result = new Uint8Array(2 + ep.length + iv.length + ct.length);
    // 2-byte length prefix for ephemeral public key
    result[0] = (ep.length >> 8) & 0xff;
    result[1] = ep.length & 0xff;
    result.set(ep, 2);
    result.set(iv, 2 + ep.length);
    result.set(ct, 2 + ep.length + iv.length);
    return result;
  }

  async unwrapKey(wrappedKey: Uint8Array, recipientPrivateKey: CryptoKey): Promise<CryptoKey> {
    // Parse ephemeral public key length
    const epLen = (wrappedKey[0] << 8) | wrappedKey[1];
    const epBytes = wrappedKey.slice(2, 2 + epLen);
    const iv = wrappedKey.slice(2 + epLen, 2 + epLen + 12);
    const ct = wrappedKey.slice(2 + epLen + 12);

    const ephemeralPublicKey = await crypto.subtle.importKey(
      'spki',
      epBytes,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    );

    const aesKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: ephemeralPublicKey },
      recipientPrivateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );

    const rawKGoal = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ct,
    );

    return crypto.subtle.importKey(
      'raw',
      rawKGoal,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  }

  async encrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    // Prepend IV to ciphertext
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);
    return result;
  }

  async decrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    return new Uint8Array(decrypted);
  }

  async sign(data: Uint8Array, privateKey: CryptoKey): Promise<Uint8Array> {
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      data,
    );
    return new Uint8Array(signature);
  }

  async verify(data: Uint8Array, signature: Uint8Array, publicKey: CryptoKey): Promise<boolean> {
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signature,
      signature,
    );
  }

  async deriveSubKey(rootKey: CryptoKey, info: 'remote' | 'local'): Promise<CryptoKey> {
    // POC HKDF-style derivation using WebCrypto is non-trivial; for now,
    // this can be implemented by exporting the root key and hashing with
    // a context string, then importing as a new AES-GCM key.
    // The exact derivation function can be refined in implementation.
    throw new Error('deriveSubKey not implemented in PRD sample');
  }
}
```


### 7.3 Identity and Device Registration

Multi-device support is in scope: a user should be able to create an identity on Device A, then register Device B and access the same encrypted goals without the server learning any additional secrets.

#### 7.3.1 Identity Creation (Device A)

1. **Generate identity keypairs**
   - Client generates both signing and encryption keypairs:
     - `identity_signing_keypair` (ECDSA P-256)
     - `identity_encryption_keypair` (ECDH P-256)
2. **User chooses a password**
   - Client derives `K_pwd` via `deriveKeyFromPassword(password, salt)`.
3. **Encrypt private keys**
   - Client encrypts both private keys with `K_pwd` and stores:
     - `encryptedSigningPrivateKey`
     - `encryptedEncryptionPrivateKey`
     - `signingPublicKey`, `encryptionPublicKey`
     - `salt`
   - Persisted locally via `IKeyStore.storeIdentityKeys(...)`.
4. **Register with backend**
   - Client calls `POST /auth/register` (or equivalent) with:
     - `public_signing_key`
     - `public_encryption_key`
   - Backend creates a pseudonymous `user_id` for this identity and returns it.
5. **Determine storeId**
   - `storeId = user_id` for LiveStore sync; all devices for this user share the same store.

#### 7.3.2 Device Registration (Device B)

1. **Import identity backup**
   - User either:
     - Imports an encrypted identity backup file containing `encryptedSigningPrivateKey`, `encryptedEncryptionPrivateKey`, `salt`, and public keys, or
     - Enters a seed phrase that derives a key to decrypt the same data.
2. **Unlock identity with password**
   - Client prompts for the password.
   - Derives `K_pwd` via `deriveKeyFromPassword(password, salt)`.
   - Decrypts both private keys and reconstructs:
     - `identity_signing_keypair`
     - `identity_encryption_keypair`
3. **Re-register/authenticate with backend**
   - Client calls `/auth/authenticate` or `/auth/challenge` using the signing keypair (e.g., challenge–response with `sign`/`verify`).
   - Backend recognizes the same `public_signing_key` and returns the same `user_id`.
4. **Initialize LiveStore store**
   - Device B sets `storeId = user_id` for LiveStore.
   - Sync starts: `/sync/pull` returns events + `wrappedKeys` for all aggregates this user has access to.
5. **Recover per-aggregate keys on Device B**
   - For each `(aggregate_id, wrapped_key)` in `wrappedKeys`:
     - Client uses `identity_encryption_keypair.privateKey` and `ICryptoService.unwrapKey` to recover `K_aggregate`.
     - Stores `K_aggregate` locally via `IKeyStore.storeGoalKey`.
   - From this point on, Device B can decrypt both envelopes (`K_goal_remote`) and fields (`K_goal_local`) and behaves identically to Device A.



## 8. Interface Layer

### 8.1 React Hooks and Command Wiring

```typescript
// interface/hooks/useGoals.ts
import { useQuery } from '@livestore/react';
import { allGoals$, goalsBySlice$ } from '../../infrastructure/livestore/queries';
import { useDecryptedGoals } from '../readAdapters/useDecryptedGoals';

// High-level hooks: wrap low-level LiveStore queries with a read adapter
// that decrypts field-level ciphertext using K_goal_local before returning
// data to components.

export function useAllGoals() {
  const rows = useQuery(allGoals$);
  return useDecryptedGoals(rows);
}

export function useGoalsBySlice(slice: string) {
  const rows = useQuery(goalsBySlice$(slice));
  return useDecryptedGoals(rows);
}

// interface/hooks/useGoalCommands.ts
import { useContext, useMemo } from 'react';
import { AppContext } from '../providers/AppProvider';
import { SliceValue } from '../../domain/goals/Slice';
import { PriorityLevel } from '../../domain/goals/Priority';

export interface GoalCommandAPI {
  createGoal(input: {
    slice: SliceValue;
    summary: string;
    targetMonth: string;      // 'YYYY-MM'
    priority: PriorityLevel;
  }): Promise<string>;
  updateSummary(goalId: string, summary: string): Promise<void>;
  deleteGoal(goalId: string): Promise<void>;
  shareGoal(goalId: string, userId: string, permission: 'view' | 'edit'): Promise<void>;
}

export function useGoalCommands(): GoalCommandAPI {
  const { goalAppService, updateGoalSummaryHandler, deleteGoalHandler, shareGoalHandler, currentUserId } =
    useContext(AppContext);

  return useMemo(
    () => ({
      async createGoal(input) {
        const goalId = crypto.randomUUID();
        await goalAppService.createGoal(
          {
            type: 'CreateGoal',
            goalId,
            ...input,
          },
          currentUserId,
        );
        return goalId;
      },

      async updateSummary(goalId: string, summary: string) {
        await updateGoalSummaryHandler.handle({ type: 'UpdateGoalSummary', goalId, summary });
      },

      async deleteGoal(goalId: string) {
        await deleteGoalHandler.handle({ type: 'DeleteGoal', goalId });
      },

      async shareGoal(goalId: string, userId: string, permission: 'view' | 'edit') {
        await shareGoalHandler.handle({
          type: 'ShareGoal',
          goalId,
          grantToUserId: userId,
          permission,
        });
      },
    }),
    [goalAppService, updateGoalSummaryHandler, deleteGoalHandler, shareGoalHandler, currentUserId],
  );
}
```

### 8.2 Component Example

```typescript
// interface/components/goals/GoalCard.tsx
import { useGoalCommands } from '../../hooks/useGoalCommands';
import { Button } from '../shared/Button';

interface GoalCardProps {
  goal: {
    id: string;
    summary: string;
    slice: string;
    targetMonth: string;
    priority: string;
  };
  onEdit: () => void;
}

export function GoalCard({ goal, onEdit }: GoalCardProps) {
  const commands = useGoalCommands();
  
  const handleDelete = async () => {
    if (confirm('Delete this goal?')) {
      await commands.deleteGoal(goal.id);
    }
  };

  return (
    <div className="goal-card">
      <h3>{goal.summary}</h3>
      <span className="slice">{goal.slice}</span>
      <span className="target">{goal.targetMonth}</span>
      <span className={`priority priority-${goal.priority}`}>{goal.priority}</span>
      <div className="actions">
        <Button onClick={onEdit}>Edit</Button>
        <Button variant="destructive" onClick={handleDelete}>Delete</Button>
      </div>
    </div>
  );
}
```

### 8.3 App Provider and Dependency Wiring

The `AppProvider` is responsible for constructing long-lived service instances (DI container) and exposing them via `AppContext`. React hooks consume these instances; they are not re-created per render.

```typescript
// interface/providers/AppProvider.tsx
import { createContext, useMemo } from 'react';
import { Store } from '@livestore/livestore';
import { CryptoService } from '../../infrastructure/crypto/CryptoService';
import { KeyStore } from '../../infrastructure/crypto/KeyStore';
import { LiveStoreEventStore } from '../../infrastructure/persistence/LiveStoreEventStore';
import { KeyManagementService } from '../../application/services/KeyManagementService';
import { GoalApplicationService } from '../../application/services/GoalApplicationService';
import { CreateGoalHandler } from '../../application/handlers/CreateGoalHandler';
import { UpdateGoalSummaryHandler } from '../../application/handlers/UpdateGoalSummaryHandler';
import { DeleteGoalHandler } from '../../application/handlers/DeleteGoalHandler';
import { ShareGoalHandler } from '../../application/handlers/ShareGoalHandler';

export interface AppContextValue {
  store: Store;
  eventStore: LiveStoreEventStore;
  cryptoService: CryptoService;
  keyStore: KeyStore;
  keyManagementService: KeyManagementService;
  goalAppService: GoalApplicationService;
  updateGoalSummaryHandler: UpdateGoalSummaryHandler;
  deleteGoalHandler: DeleteGoalHandler;
  shareGoalHandler: ShareGoalHandler;
  currentUserId: string;
}

export const AppContext = createContext<AppContextValue>(/* ... */);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<AppContextValue>(() => {
    const store = /* create LiveStore Store */;
    const cryptoService = new CryptoService();
    const keyStore = new KeyStore();
    const eventStore = new LiveStoreEventStore(store, /* DomainEventAdapter */);
    const keyManagementService = new KeyManagementService(cryptoService, keyStore);
    const goalAppService = new GoalApplicationService(keyManagementService, eventStore);

    const updateGoalSummaryHandler = new UpdateGoalSummaryHandler(eventStore, keyStore);
    const deleteGoalHandler = new DeleteGoalHandler(eventStore, keyStore);
    const shareGoalHandler = new ShareGoalHandler(eventStore, cryptoService, keyStore);

    const currentUserId = /* derive from auth/session */;

    return {
      store,
      eventStore,
      cryptoService,
      keyStore,
      keyManagementService,
      goalAppService,
      updateGoalSummaryHandler,
      deleteGoalHandler,
      shareGoalHandler,
      currentUserId,
    };
  }, []);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
```

`useGoalCommands` and other hooks now receive fully-constructed services/handlers from `AppContext`, so heavy objects are singletons for the lifetime of the app (or session), not recreated per render.


### 8.4 Decryption Read Adapter (`useDecryptedGoals`)

`useDecryptedGoals` is the primary read adapter that bridges encrypted LiveStore projections and UI-friendly DTOs. Because decryption requires asynchronous operations (`IKeyStore.getGoalKey`, `ICryptoService.decrypt`), the adapter is designed as an async hook with caching, not as a synchronous function.

**Design:**
- Signature:
  - `useDecryptedGoals(rows)` accepts the raw rows from `useQuery(allGoals$ | goalsBySlice$ | goalsByMonthRange$)`.
  - Returns an array of decrypted `GoalDTO` objects or `undefined` while decrypting (the UI can show a loading state or skeleton).
- Implementation (conceptual):
  - Inside the hook:
    - Use `useContext(AppContext)` to access:
      - `cryptoService`
      - `keyStore`
      - `goalDecryptionCache` (see below)
    - Use `useEffect` + `useState` to:
      - For each row:
        - Look up a cached decrypted value in `goalDecryptionCache` using `{ id, sliceCipher, summaryCipher, targetMonthCipher, priorityCipher }` as a key.
        - If not cached:
          - Fetch `K_goal` via `IKeyStore.getGoalKey(row.id)` (which returns `K_goal` and permission).
          - Derive `K_goal_local = deriveSubKey(K_goal, 'local')`.
          - Decrypt `slice`, `summary`, `targetMonth`, `priority` with `K_goal_local`.
          - Store the decrypted DTO in `goalDecryptionCache`.
      - Update local hook state with the decrypted list once all rows are processed.
    - On subsequent renders:
      - When `rows` are unchanged and ciphertexts match the cache, the hook returns cached decrypted DTOs synchronously (no re-decrypt per render).

**Async vs sync and React constraints:**
- React hooks cannot `await` directly, so `useDecryptedGoals`:
  - Initiates decryption work inside a `useEffect` when `rows` change.
  - Maintains internal loading/error state and returns `undefined` (or previous value) while work is in progress.
  - The POC uses explicit loading states in components rather than Suspense; wrapping this in a Suspense resource is a possible future enhancement but not required initially.

**GoalDecryptionCache service:**
- Implemented as a lightweight in-memory cache, exposed via `AppContext` (e.g., `goalDecryptionCache: Map<cacheKey, GoalDTO>`).
- Responsibilities:
  - Avoid redundant decryption for stable ciphertexts within a session.
  - Provide a simple `get/set` API keyed by `{ goalId, sliceCipher, summaryCipher, targetMonthCipher, priorityCipher }`.
- This cache is ephemeral (in-memory only); it does not change the trust model or persistence story, it only improves performance.



## 9. Backend Architecture (NestJS + Postgres)

### 9.1 Overview

The backend serves as an encrypted event store for LiveStore sync. It implements the protocol expected by our custom sync provider.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     NestJS Backend                                  │
├─────────────────────────────────────────────────────────────────────┤
│  Auth Module              Sync Module             Invite Module     │
│  ├─ register              ├─ push                 ├─ create         │
│  ├─ challenge             ├─ pull                 ├─ accept         │
│  └─ authenticate          └─ (websocket)          └─ revoke         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL                                   │
│  users │ events │ aggregate_access │ invites                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Database Schema

```sql
-- Users (public key registry)
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  public_signing_key BYTEA NOT NULL,
  public_encryption_key BYTEA NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Events (encrypted event store)
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  seq BIGSERIAL NOT NULL UNIQUE,           -- Server-assigned sequence
  parent_seq BIGINT,                       -- Parent event sequence
  event_name TEXT NOT NULL,                -- e.g., 'v1.GoalCreated'
  aggregate_id TEXT NOT NULL,              -- Aggregate ID (goal, identity, etc.)
  encrypted_args BYTEA NOT NULL,           -- Encrypted event arguments
  user_id TEXT NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_aggregate_seq ON events(aggregate_id, seq);
CREATE INDEX idx_events_seq ON events(seq);

-- Aggregate access control (per-aggregate wrapped keys)
CREATE TABLE aggregate_access (
  aggregate_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  permission TEXT NOT NULL CHECK (permission IN ('owner', 'edit', 'view')),
  wrapped_key BYTEA NOT NULL,               -- K_goal (or K_aggregate) wrapped for this user
  granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP,
  PRIMARY KEY (aggregate_id, user_id)
);

CREATE INDEX idx_aggregate_access_user ON aggregate_access(user_id) WHERE revoked_at IS NULL;

-- Invites (capability links, no PII)
CREATE TABLE invites (
  invite_id TEXT PRIMARY KEY,
  aggregate_id TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(user_id),
  k_invite_public BYTEA NOT NULL,          -- public half of invite keypair
  wrapped_k_goal BYTEA NOT NULL,           -- K_goal encrypted with k_invite_public
  permission TEXT NOT NULL CHECK (permission IN ('edit', 'view')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  accepted_by TEXT REFERENCES users(user_id),
  accepted_at TIMESTAMP
);

CREATE INDEX idx_invites_expires ON invites(expires_at) WHERE accepted_at IS NULL;

```

### 9.3 Sync Protocol

**Push Events:**

```typescript
// POST /sync/push
interface PushRequest {
  events: Array<{
    id: string;
    parentSeq: number;
    name: string;
    aggregateId: string;
    encryptedArgs: string; // base64
  }>;
}

interface PushResponse {
  accepted: string[];      // Event IDs accepted
  rejected: Array<{ id: string; reason: string }>;
  serverSeq: number;       // Latest server sequence
}
```

**Pull Events:**

```typescript
// GET /sync/pull?cursor={seq}
interface PullResponse {
  events: Array<{
    id: string;
    seq: number;
    parentSeq: number;
    name: string;
    aggregateId: string;
    encryptedArgs: string; // base64
  }>;
  wrappedKeys: Array<{
    aggregateId: string;
    wrappedKey: string;    // K_goal wrapped for requesting user
    permission: string;
  }>;
  cursor: number;
  hasMore: boolean;
}
```

#### 9.3.1 Sequence Reconciliation

- The backend `events.seq` / `events.parent_seq` define the **canonical linear event chain** per `storeId` (user).
- Clients:
  - Persist `lastServerSeq` in `sync_state` and always **pull before push**.
  - On push, send `parentSeq = lastServerSeq` in `PushRequest`; the server appends events and assigns new `seq` / `parent_seq` values.
  - On pull, map `seq` → `seqNum` and `parent_seq` → `parentSeqNum` when feeding events into LiveStore.
- Any local `seqNum` values LiveStore uses for unsynced events are **per-device only** and are replaced by server-assigned `seq` / `parent_seq` once events are acknowledged and pulled back. Other devices never see those local numbers; they only see the canonical server sequence.

#### 9.3.2 Sync Timing and Failure Semantics

- `IEventStore.append` (via `LiveStoreEventStore`) is **local-only**:
  - It commits events into the LiveStore eventlog and updates projections inside a single local transaction.
  - It does not perform network I/O and succeeds even when offline.
- The sync backend (`CustomSyncProvider` + `EncryptedSyncAdapter` + `SyncApiClient`) runs asynchronously:
  - Detects new local events (via LiveStore’s sync engine) and schedules push attempts.
  - On push failure (network error, 5xx), it:
    - Leaves events marked as unsynced in the local log.
    - Records the error / last failure time in `sync_state` for UI status.
    - Retries with exponential backoff.
- **No rollback**:
  - Local events are never rolled back due to sync failure.
  - The app is explicitly offline-first: domain changes take effect locally immediately and are propagated to the backend when connectivity allows.

#### 9.3.3 IDs, UUID Version, and Idempotency

- **Aggregate IDs**
  - Aggregates (e.g., goals) use UUIDv7 identifiers generated client-side (time-ordered UUIDs).
  - UUIDv7 provides monotonic, time-correlated IDs which:
    - Improve index locality.
    - Make debugging and correlation with logs easier.
    - Are future-proof if we ever want to use aggregate IDs as part of sharding or partitioning strategies.

- **Event IDs**
  - Each event carries a globally unique `id` (UUIDv7) generated on the client when the event is first created.
  - The backend enforces idempotency by:
    - Treating `id` as the primary key for the `events` table.
    - On `POST /sync/push`, if an incoming event's `id` already exists for the given `storeId`, the server:
      - Skips inserting a duplicate row.
      - Reports the event as `accepted` in the response (idempotent behavior).

- **Rationale**
  - We still treat Postgres `seq` as the canonical ordering for events, but UUIDv7:
    - Gives us better write locality for any indexes that include the ID.
    - Encodes coarse time information directly into IDs, which is useful for diagnostics.
  - For the POC, we can:
    - Use a small, well-vetted UUID library that supports v7 generation in both browser and Node environments, or
    - Fall back to UUIDv4 temporarily during early implementation if UUIDv7 support is not yet wired, without changing the surrounding architecture.

### 9.5 Invite Flow (Capability Links, No PII)

High-level invite sequence (for not-yet-associated users):

1. **Owner creates invite (client-generated keypair)**
   - Owner's client generates an ephemeral invite keypair `(k_invite_public, k_invite_private)` locally (ECDH/X25519), and **never sends `k_invite_private` to the server**.
   - Client calls `POST /invites` with `{ aggregateId, permission, k_invite_public }`.
   - Server creates an `invite_id`, stores `k_invite_public` and metadata (no PII), and returns `inviteId` to the client.
   - Owner’s client encrypts `K_goal` with `k_invite_public` → `wrapped_k_goal`, and sends it back via `PUT /invites/:id/attach-key`.
   - Server stores `wrapped_k_goal` alongside `k_invite_public` and metadata. The server never learns `k_invite_private`, so it cannot decrypt `wrapped_k_goal`.

2. **Invitee opens link**
   - Link encodes `inviteId` (in path/query) and `k_invite_private` (in fragment or other client-only channel). For example:
     - `https://app.example.com/invite?i=<inviteId>#k=<base64url(k_invite_private)>`
   - If the invitee has no identity yet, they create one and register a public identity key with the backend.

3. **Invitee accepts invite**
   - Client calls `GET /invites/:id` to fetch `aggregateId`, `permission`, `wrapped_k_goal`, and checks expiry.
   - Client decrypts `K_goal = Dec_with_private_key(wrapped_k_goal, k_invite_private)`.
   - Client wraps `K_goal` for its own identity → `wrappedKeyForSelf`.
   - Client calls `POST /invites/:id/accept` with `wrappedKeyForSelf` (and, optionally, a proof of possession of `k_invite_private`).
   - Server validates the invite and writes an `aggregate_access` row with `wrapped_key = wrappedKeyForSelf` and appropriate `permission`, then marks the invite as accepted.

4. **Sync and access**
   - On subsequent `GET /sync/pull`, the backend includes this aggregate’s `wrapped_key` in the `wrappedKeys` section for the invitee.
   - Client unwraps `wrappedKeyForSelf` with its identity key to recover `K_goal`, derives `K_goal_remote` / `K_goal_local`, and can now decrypt envelope and field-level ciphertext for this goal during sync.


### 9.6 Key Availability and Event Ordering

Because keys and events travel over sync independently, a client can temporarily see events for an aggregate before it has the corresponding wrapped key.

**Server guarantees**
- The backend only returns events for aggregates where the caller has an active entry in `aggregate_access` at the time of the pull.
- `wrappedKeys` always includes entries for all aggregates the caller can access; however, due to batching and ordering, an event for a newly shared aggregate and the corresponding `wrapped_key` may appear in the same or adjacent pull responses.

**Client behavior when key is missing**
- On pull, for each event in `events`:
  - If `K_aggregate` is already available locally:
    - The sync encryption adapter decrypts `encryptedArgs` with `K_goal_remote` and commits `{ name, args }` into LiveStore.
  - If `K_aggregate` is *not* available yet:
    - The adapter does **not** attempt to decrypt or commit the event immediately.
    - Instead, it queues the event in a local “pending events” buffer keyed by `aggregateId`.
- When a `wrapped_key` for `aggregateId` is received in `wrappedKeys`:
  - The client unwraps it (using the identity encryption private key) to obtain `K_aggregate`.
  - Derives `K_goal_remote` / `K_goal_local`.
  - Replays all pending events for that `aggregateId` in `seq` order through the adapter and LiveStore, then clears the pending buffer for that aggregate.

**Revocation / no-key cases**
- If an aggregate has been revoked for the user, the backend will stop including:
  - Events for that `aggregateId`, and
  - `wrapped_key` entries for that aggregate.
- Any previously queued pending events for that `aggregateId` on the client can be:
  - Discarded when it becomes clear that no key will ever be provided (e.g., after a revocation notification), or
  - Left untouched but never materialized (no impact on projections).
- This ensures:
  - The client never materializes state it cannot decrypt.
  - Event ordering remains correct once `K_aggregate` arrives; events are replayed in the canonical `seq` order.

This pattern keeps:
- The server blind to all aggregate contents (`K_goal` / `K_aggregate` never leaves the client in plaintext).
- The server blind to PII (only `user_id`, public keys, `aggregate_id`, `invite_id`, and encrypted blobs).

**WebSocket Real-Time Sync:**

```typescript
// WebSocket: ws://server/sync
// Client → Server
interface WSClientMessage {
  type: 'subscribe' | 'ping';
  storeId?: string;  // For subscribe
}

// Server → Client
interface WSServerMessage {
  type: 'notification' | 'pong';
  newEventsAvailable?: boolean;  // Trigger pull
  latestSeq?: number;
}

// Flow:
// 1. Client connects and subscribes with storeId
// 2. Server notifies when new events available
// 3. Client performs standard pull via HTTP
// 4. Fallback to polling if WS disconnects
//
// Implementation note:
// - We rely on LiveStore's multi-transport sync client (e.g. makeMultiTransportSync)
//   to manage WebSocket vs HTTP. The client is always able to sync via HTTP pull;
//   when a WebSocket is available it is used for push-style notifications, and
//   if the WS disconnects the client continues to use HTTP polling without
//   additional custom logic in our codebase.
```

### 9.4 Authorization Rules

| Endpoint | Required Permission / Checks |
|----------|-----------------------------|
| `POST /sync/push` | Caller must have `edit` or `owner` on goal |
| `GET /sync/pull` | Caller must have any active permission on goal |
| `GET /users/:id/public-keys` | Caller must be authenticated; returns public signing/encryption keys only |
| `POST /invites` | Caller must have `owner` on goal |
| `POST /invites/:id/accept` | Invite must exist, be unexpired, and not already accepted (capability-style; no PII) |
| `POST /invites/:id/revoke` | Caller must have `owner` on goal |



## 10. Threat Model

### 10.1 Design Principles

- **Privacy by design and by default**
- **Zero-knowledge server**: Backend cannot read user data under any circumstances
- **Compromise resilience**: Database breach exposes only encrypted blobs

### 10.2 What Server Can See

| Visible | Hidden |
|---------|--------|
| Event names/types | Event payload content (summary, slice, targetMonth, priority, etc.) |
| Aggregate IDs | All aggregate-specific fields and metadata inside encrypted_args |
| User IDs | User names or identifiers from other systems |
| Timestamps | Business dates (e.g. targetMonth) |
| Access relationships | Actual permission meaning and keys |

### 10.3 Key Revocation Limitations

When access is revoked:
1. Server stops returning events for that goal to revoked user
2. **However:** Revoked user still possesses `K_goal` from before revocation
3. Historical data remains accessible to revoked user locally

**Mitigation (Future):** Key rotation on revocation (not in POC scope).



## 11. Implementation Plan

### Phase 1: Foundation

| Task | Layer |
|------|-------|
| Project setup (Vite + React + TS + shadcn) | Interface |
| Clean Architecture folder structure | All |
| Domain model (Goal aggregate, events, VOs) | Domain |
| Application commands and handlers skeleton | Application |
| LiveStore schema, tables, events | Infrastructure |

### Dev Environment & Docker Compose

The repo will include a `docker-compose.yml` to spin up a full POC stack with a single command:

- **Services**
  - `db`:
    - PostgreSQL with the `users`, `events`, `aggregate_access`, and `invites` tables.
    - Uses a named volume for data (`pgdata`) and exposes port `5432` to the host.
    - Seed/migration scripts apply the schema from Section 9.2.
  - `api`:
    - NestJS backend implementing:
      - Auth (`/auth/register`, `/auth/challenge`, `/auth/authenticate`).
      - Sync (`/sync/push`, `/sync/pull`).
      - Invite endpoints (`/invites`, `/invites/:id`, `/invites/:id/accept`, `/invites/:id/revoke`).
      - Public-key lookup (`/users/:id/public-keys`).
    - Runs in **watch mode** (Nest CLI or nodemon) with the source directory mounted as a volume for hot reloading.
    - Depends on `db` and exposes port `3000` to the host.
  - `web`:
    - Vite dev server for the React app.
    - Mounts the frontend source directory into the container and uses Vite's built-in HMR for hot reloading.
    - Connects to `api` via `VITE_API_URL=http://api:3000`.
    - Exposes port `5173` (or similar) to the host.
  - `livestore-devtools` (optional):
    - LiveStore DevTools UI wired to the same SQLite/OPFS store to inspect events and projections during development.

- **Usage**
  - `docker compose up --build` brings up `db`, `api`, and `web`.
  - Multi-device testing:
    - Use two browsers or profiles hitting the same `web` container (and thus the same backend).
    - Each browser instance represents a device; both share the backend but maintain independent local OPFS/IndexedDB state.
  - Automated tests:
    - Test runners (for integration/E2E) can depend on the `db` + `api` services started via Docker Compose, ensuring a reproducible backend environment.

### Phase 2: Local-First

| Task | Layer |
|------|-------|
| Crypto service (Web Crypto API) | Infrastructure |
| Key store (IndexedDB) | Infrastructure |
| Domain event → LiveStore adapter | Infrastructure |
| Materializers + read adapters for decryption | Infrastructure |
| Goal CRUD flows | All |
| Wheel and Timeline views | Interface |
| Local backup (key export) | All |

### Phase 3: Sync

| Task | Layer |
|------|-------|
| NestJS backend setup | Backend |
| Auth endpoints | Backend |
| Sync endpoints (push/pull) | Backend |
| Custom LiveStore sync provider | Infrastructure |
| Sync status UI | Interface |

### Phase 4: Sharing

| Task | Layer |
|------|-------|
| Invite endpoints | Backend |
| Share command/handler | Application |
| Invite link generation | Infrastructure |
| Accept invite flow | All |
| Revoke access | All |

### Phase 5: Polish

| Task | Area |
|------|------|
| Error handling | All |
| Loading states | Interface |
| Documentation | All |

### Testing & Validation Strategy

Testing spans all layers; the POC aims for pragmatic but meaningful coverage:

- **Domain unit tests**
  - Pure TypeScript tests (e.g., Vitest/Jest) for:
    - Value objects (`Slice`, `Priority`, `Month`, `GoalId`) invariants and behavior.
    - `Goal` aggregate behavior: creation, updates, deletion, access events; event emission order and idempotency.
  - Run in a plain Node/ts-node environment; no mocking of infrastructure required.

- **Application layer tests**
  - Unit tests for `GoalApplicationService` and `KeyManagementService` using in-memory fakes for `ICryptoService`, `IKeyStore`, and `IEventStore`.
  - Verify orchestration:
    - `createGoal` calls key management, constructs aggregates correctly, and appends the right events with the right `kAggregate`/`ownerWrappedKey` metadata.

- **Crypto integration tests**
  - Browser/Node (Web Crypto) integration tests for `CryptoService`:
    - `generateSigningKeyPair` / `generateEncryptionKeyPair` + `sign`/`verify`.
    - `generateSymmetricKey`, `encrypt`/`decrypt` round-trips.
    - `wrapKey`/`unwrapKey` round-trips for:
      - Owner wrapping `K_goal` for self.
      - Sharing `K_goal` between users.
      - Invite flows using `k_invite_public` / `k_invite_private`.
    - Tampering tests: modified ciphertext or envelope must fail to decrypt.
  - These tests run against real `crypto.subtle` (Node 20+ or browser test runner) rather than mocks.

- **Sync end-to-end tests**
  - Spin up a test NestJS backend (events + aggregate_access + invites) and a LiveStore client configured with the `EncryptedSyncAdapter`.
  - Scenarios:
    - Create goal offline → later sync → verify events in Postgres and projections on a fresh client.
    - Share goal with existing user (aggregate_access row) → second client with that userId pulls and sees the goal.
    - Invite flow: create invite, accept with a second identity, verify access and event visibility.
  - Can be automated via a Node test harness or Playwright/Cypress hitting a running backend + dev client.

- **Multi-device scenarios**
  - Local tests simulate two devices as two LiveStore stores with the same `storeId = user_id`:
    - Device A: create/modify goals, possibly offline; then sync.
    - Device B: start from empty local DB, sync using shared `storeId`, verify it reconstructs the same projections and per-aggregate keys.
  - Tests assert:
    - Convergence of projections across devices after push/pull.
    - Consistent behavior when one device is offline for a while (events queued locally, then rebased on global seq).

The intention is to keep unit tests focused on pure, synchronous logic (Domain + Application services), and use a small but representative set of integration/E2E tests to validate crypto correctness and sync behavior across devices.



## 12. Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Argon2id vs PBKDF2 | Use PBKDF2 (600k iterations) | Web Crypto API native support; acceptable for POC. Document as production TODO. |
| Materializer async/crypto | Pre-decrypt in sync layer before materializer | LiveStore materializers must be synchronous. Decrypt events during pull, store decrypted in local event buffer, materializers process plaintext. |
| Multiple storeIds | Single store per identity (storeId = userId) | POC assumes a single-tenant per identity; all of a user's aggregates share one store. Multi-tenant membership (one user in multiple tenants) is not supported in the POC and will require a refined storeId scheme (e.g., storeId = tenantId:userId). |
| WebSocket vs polling | WebSocket for real-time sync | Use WebSocket for push notifications of new events; fall back to polling if connection drops. |



## 13. Deep Dive: Materializers, Crypto, and Event Sourcing

### Problem

LiveStore materializers are **synchronous, pure functions** that must:
- Be deterministic
- Have no side effects
- Return SQLite operations immediately

At the same time we want:
- **Envelope encryption** of event arguments on the wire and at rest on the server (`K_goal_remote`)
- **Field-level encryption** of sensitive data in local projections (`K_goal_local`)
- **Event-sourced backend** as the canonical store, while treating projections as snapshots on each device

### Solution

1. **Event sourcing boundary**
   - The canonical event log lives in the backend `events` table (with `encrypted_args`).
   - A new device pulls the encrypted history for the user, decrypts envelopes with `K_goal_remote`, and commits those events into LiveStore.
   - LiveStore materializers build local projections. From that point on, the device can treat these projections as **snapshots** and does not need to replay from scratch again unless the local DB is wiped.

2. **Double encryption path**
   - **Write path (frontend → backend)**:
     1. Application passes `K_goal` into `IEventStore.append`.
     2. Infra derives `K_goal_local` and uses it to field-encrypt selected event payload fields before committing to LiveStore (Section 6.5).
     3. LiveStore’s sync backend derives `K_goal_remote` and uses it to envelope-encrypt the full event args when pushing to the backend (`events.encrypted_args`).
   - **Read path (backend → frontend)**:
     1. Backend returns `encrypted_args` for each event to the sync backend.
     2. Sync backend decrypts `encrypted_args` with `K_goal_remote`, recovering the same field-encrypted args it originally produced.
     3. These args are committed to LiveStore; materializers simply write them into SQLite.
     4. UI-facing adapters use `K_goal_local` to decrypt selected columns on read, just before returning data to React.

3. **Materializers remain pure**
   - Materializers never perform crypto or IO.
   - They see fields that may be ciphertext (for sensitive data) but treat them as opaque strings, writing them to tables.
   - All crypto happens either:
     - In the event-store / sync adapters (write + envelope decrypt on pull), or
     - In read-side adapters that sit on top of LiveStore queries.

4. **Key availability**
   - `K_goal` is obtained on each device by:
     - Unwrapping a per-user `wrapped_key` from `goal_access` (sent in `wrappedKeys` in sync responses).
   - From `K_goal`, the client deterministically derives `K_goal_remote` and `K_goal_local` using `ICryptoService.deriveSubKey`.
   - If a device does not yet have `K_goal` for a goal, it cannot decrypt envelopes or fields for that goal and simply treats events as opaque.


## 14. Research Topics (Post-POC)

### Event Compaction

**Problem**: Event logs grow unbounded. Each goal's full history is stored forever.

**Research Questions**:
1. Does LiveStore provide built-in compaction/snapshotting?
2. Can we implement periodic snapshots at aggregate boundaries?
3. What's the impact of deleting old events on sync protocol?

**Proposed Approach** (to validate):
```typescript
// Periodic compaction per goal
interface GoalSnapshot {
  goalId: string;
  snapshotSeq: number;  // Last event sequence included
  state: {
    slice: string;
    summary: string;
    targetMonth: string;
    priority: string;
    // ... full current state
  };
}

// Strategy:
// 1. After N events, create snapshot
// 2. Mark events before snapshotSeq as "compacted"
// 3. On hydration: load snapshot + replay events after snapshotSeq
// 4. Server retains snapshots + recent events only
```

**Open Questions**:
- How does compaction interact with multi-device sync?
- What if device A compacts but device B has older events offline?
- Can we delete events server-side without breaking causality?

**Next Steps**:
- Review LiveStore docs for snapshot support
- Test sync behavior with event deletion
- Design compaction policy (time-based vs count-based)

### Encrypted Querying at Scale

**Problem**: With per-aggregate keys and AEAD field-level encryption, local SQLite projections cannot perform meaningful SQL-level filtering on encrypted fields (e.g., slice, targetMonth, priority). For large-volume domains (such as tasks), decrypt-then-filter in read adapters may become a bottleneck.

**Research Questions**:
1. Can we introduce local-only, privacy-preserving indexes (e.g., HMAC-based slice_index) to enable SQL equality filtering without exposing plaintext?
2. What are the performance and UX trade-offs of deterministic encryption (per-user or per-device keys) for specific fields?
3. How does any indexing scheme interact with per-goal keying, sharing, and key rotation?

**Proposed directions**:
- Explore a second, local-only index column for hot filter dimensions (slice, priority, targetMonth bucket).
- Evaluate the cost/benefit of deterministic encryption vs HMAC-based indexes, strictly on the client side.
- Keep server schema unchanged: events table continues to use `encrypted_args` only; any searchable encryption features are local concerns.


## 15. Appendix: LiveStore Key Concepts

### Events

Events are defined using `Events.synced()` for synchronized events or `Events.local()` for client-only events. Events carry a `name` (versioned, e.g., `v1.TodoCreated`) and a schema defined using Effect Schema.

### Materializers

Materializers are pure functions that transform events into SQLite state. They must be deterministic and side-effect free. They receive the event payload and a context object for querying current state.

### Sync Model

LiveStore uses a Git-inspired push/pull model:
- Events form an ordered log with sequence numbers
- Pull before push to maintain total ordering
- Local events are rebased on top of pulled events
- Last-write-wins for conflicts (customizable)

### Store Identity

Each store has a `storeId` that identifies it for syncing. Multiple clients with the same `storeId` sync together.

**Our Model (POC)**: `storeId = userId` (one store per identity)
- All of an identity's aggregates (goals, etc.) share one store
- Per-goal/aggregate encryption provides isolation between aggregates
- Simpler sync protocol (one connection per identity)
- Multiple devices sync via shared `storeId`

**Multi-tenant note**:
- The POC assumes a single-tenant-per-identity model: effectively `tenantId === userId` from the sync system's perspective.
- In a future multi-tenant design where a user can belong to multiple tenants, we will likely move to a storeId that encodes both tenant and identity (e.g., `storeId = tenantId:userId`) or one LiveStore store per `(tenant, user)` pair.



## 16. Glossary

| Term | Definition |
|------|------------|
| `K_goal` | 256-bit symmetric key unique to each Goal aggregate |
| `K_goal_remote` | Key derived from `K_goal` for envelope encryption of event args on the wire/server |
| `K_goal_local` | Key derived from `K_goal` for field-level encryption in local projections |
| `K_pwd` | Password-derived key using Argon2id/PBKDF2 |
| `k_invite_public` / `k_invite_private` | Ephemeral keypair for invite capability links (server stores only the public key) |
| Materializer | LiveStore function that transforms events into SQLite state |
| `storeId` | Unique identifier for a LiveStore instance used for sync |
| AEAD | Authenticated Encryption with Associated Data (AES-256-GCM) |
| DSL | Domain-Specific Language - our domain layer API design approach |
| `assertive-ts` | Fluent assertion library used for domain invariant validation |
| Value Object | Immutable domain type identified by its value, not identity |
