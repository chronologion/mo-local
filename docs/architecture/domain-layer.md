# Domain layer (`packages/domain`)

**Scope**: Domain modeling rules: aggregates, VOs, domain events, and invariants.
**Non-goals**: Persistence, encryption, transport, projections, or UI concerns.
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Invariants

This doc does not define new invariants. It relies on the invariant registry in `docs/invariants.md`.

## Details

### Core patterns

- **Value Objects (VOs)**: domain state is expressed through VOs. The canonical primitive representation is the VO's `value`; reconstitution uses `from(...)`.
- **Domain events**: immutable facts (`DomainEvent`) with stable `eventType` and VO-based members.
- **Aggregate roots**: `AggregateRoot` applies events, increments `version`, and collects uncommitted events until persisted.

### Value Object conventions

**When to create a VO:**

- Domain concept with validation rules (e.g., `GoalId`, `GoalTitle`, `Timestamp`)
- Identity that needs type safety (prevents mixing `goalId` with `projectId`)
- Value with equality semantics (two `GoalTitle`s with same string are equal)

**When to use primitives:**

- Pure pass-through with no validation (rare)
- Internal intermediate values not exposed in events or aggregates

**VO structure:**

```typescript
export class GoalTitle {
  private constructor(public readonly value: string) {}

  static from(value: string): GoalTitle {
    if (!value || value.trim().length === 0) {
      throw new Error('GoalTitle cannot be empty');
    }
    return new GoalTitle(value.trim());
  }

  equals(other: GoalTitle): boolean {
    return this.value === other.value;
  }
}
```

Rules:

- Private constructor — force use of `from()` factory
- `value` property — canonical primitive representation (used by serialization)
- `from()` — validates and constructs; throws on invalid input
- `equals()` — value-based equality (optional but recommended)
- Immutable — no setters, no mutation methods

### Domain event conventions

**Naming:**

- Past tense: `GoalCreated`, `GoalRenamed`, `MilestoneAdded` (not `CreateGoal`)
- Aggregate-prefixed: `Goal*`, `Project*` (aids grep, avoids collisions)
- Describes what happened, not what was requested

**Structure:**

```typescript
export class GoalRenamed extends DomainEvent {
  readonly eventType = goalEventTypes.goalRenamed;

  constructor(
    readonly aggregateId: GoalId,
    readonly title: GoalTitle,
    readonly renamedAt: Timestamp,
    metadata: EventMetadata
  ) {
    super(metadata);
  }
}
```

Rules:

- `eventType` — stable string, defined in `eventTypes.ts` (never change after first persist)
- All fields `readonly` — events are immutable facts
- VO-typed fields — not primitives (e.g., `GoalTitle` not `string`)
- `EventMetadata` — carries `eventId`, `actorId`, `causationId`, `correlationId`

**eventType stability:**

Once an `eventType` string is persisted, it must never change. Renaming requires:

1. New event type with new name
2. Migration/upcaster from old → new
3. Keep old type in registry forever

### Aggregate conventions

**Structure:**

```typescript
export class Goal extends AggregateRoot<GoalId> {
  private title: GoalTitle;
  private status: GoalStatus;

  // Command method — validates invariants, applies event
  rename(params: { title: GoalTitle; renamedAt: Timestamp; actorId: ActorId }): void {
    if (this.status === GoalStatus.Archived) {
      throw new Error('Cannot rename archived goal');
    }
    this.applyEvent(
      new GoalRenamed(this.id, params.title, params.renamedAt, {
        eventId: EventId.generate(),
        actorId: params.actorId,
      })
    );
  }

  // Event application — mutates state, no validation
  protected apply(event: DomainEvent): void {
    if (event instanceof GoalRenamed) {
      this.title = event.title;
    }
    // ... other events
  }
}
```

Rules:

- **Command methods** validate invariants, then call `applyEvent()`
- **`apply()`** only mutates state — no validation, no side effects
- **Reconstitution** replays events through `apply()` — must be deterministic
- **No direct state mutation** outside `apply()`

### Bounded contexts (implemented)

This document does not enumerate every domain event type (that list becomes stale). Source-of-truth:

- Goals: `packages/domain/src/goals/events/eventTypes.ts`
- Projects: `packages/domain/src/projects/events/eventTypes.ts`

## Code Pointers

- `packages/domain/src/**` — domain core
- `packages/domain/src/shared/Assert.ts` — invariant assertion DSL

## Open Questions

- [ ] Define and implement aggregate root design optimizations (`ALC-331`)
- [ ] Decide whether to standardize domain error classes per BC (naming and hierarchy).
