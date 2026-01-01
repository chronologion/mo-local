# Application layer (`packages/application`)

**Scope**: CQRS orchestration: commands/queries, handlers, ports, and saga/process-manager contracts.
**Non-goals**: Storage or crypto implementation details; those live in infrastructure/security docs.
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Invariants

This doc does not define new invariants. It relies on the invariant registry in `docs/invariants.md`.

## Details

## CQRS contracts (non-negotiable)

### Commands

- Commands are **intent objects**: data-only, no logic.
- A command handler is the **only place** where a command can cause side effects.
- A command handler may:
  - load aggregates (repositories),
  - validate invariants (domain rules),
  - append events,
  - publish committed events (post-commit),
  - schedule derived-state rebuilds (by invalidation signals).
- A command handler must not directly update read models or projections. Derived state is **event-driven**.

### Queries

- Queries are **side-effect-free**.
- Query handlers may read from:
  - read models/projections (fast path), and/or
  - repositories/event store (slow path, correctness validation).
- Queries must not append events or mutate state.

### Handler boundaries

- The application layer owns **use-case orchestration** and **ports**.
- The domain layer owns business logic and never depends on application/infrastructure.
- The infrastructure layer owns implementations of ports (SQLite, crypto, HTTP, etc.).
- The presentation layer (UI) calls the application layer; it does not “reach around” into infrastructure.

### Responsibilities

- Define use-case contracts (commands/queries) and their handlers.
- Define outbound ports (`EventStorePort`, `KeyStorePort`, `CryptoServicePort`, `EventBusPort`, read model ports, sync provider ports).
- Enforce the local OCC contract via `knownVersion`.

## Ports and adapters (how we keep layering clean)

Pattern:

- **Port**: an interface defined in `packages/application` (or `packages/infrastructure` only when the concept is strictly infrastructure-owned).
- **Adapter**: an implementation living in `packages/infrastructure` (or `apps/api` for server-only adapters).
- **Composition root**: wires ports to adapters (e.g. `apps/web` and `apps/api`), with minimal logic.

Practical checks:

- The application layer should not import from `apps/*`.
- The domain layer should not import from `packages/application` or `packages/infrastructure`.
- “Leaking” concrete adapters (SQLite/HTTP) into handlers is a layering violation.

### Local conflict UX contract (OCC)

Local conflicts are immediate and explicit:

- A `ConcurrencyError` indicates the UI attempted a write against a stale aggregate version (e.g. another tab committed first).
- The expected UI behavior is to refresh the aggregate (or re-run the query) and let the user retry.

## Event publication contract (post-commit)

The application layer must treat event publication as **post-commit**: publish only after the append/transaction is durable.

Ordering note (important):

- The publication bus publishes in **commit order** (`commitSequence`) because it represents local commits.
- Projections/replays process in **replay order** (`effectiveTotalOrder`) because it represents deterministic reconstruction.

See `docs/invariants.md`:

- `INV-003` — Publication follows commitSequence
- `INV-002` — Projections follow effectiveTotalOrder

### Cross-BC coordination (sagas)

Sagas coordinate behavior across bounded contexts without collapsing them into one model.

Contracts:

- Sagas subscribe to **committed** domain events via `EventBusPort` (which is fed by post-commit streaming).
- Sagas keep their own minimal state (not projection state) and persist it independently.
- Sagas dispatch commands to other BCs and must be idempotent:
  - idempotency keys should include the **triggering event ID** to allow safe re-runs.
- Saga state MUST be rebuildable/resettable under sync rebase:
  - `onRebaseRequired()` MUST invalidate saga state together with projections/read models and then re-bootstrap.
  - Recommended idempotency key scheme: `{sagaId}:{stepName}:{targetId}` (optionally also include the triggering `eventId`).
- Sagas may consult read models for bootstrapping or convenience, but must validate against repositories (source of truth) before taking actions.

Current saga:

- `GoalAchievementSaga`: tracks project completion and automatically achieves a goal when all linked projects are completed.
  - It persists saga/process-manager state in `process_manager_state` (encrypted).
  - It uses an idempotency key that includes the triggering event ID for safe replays.
  - On sync rebase, it reconciles by re-bootstrapping from rebuilt read models and may emit compensating commands (e.g. unachieve).

## Code Pointers

- `packages/application/src/**/commands/**` — commands (data only)
- `packages/application/src/**/queries/**` — queries (data only)
- `packages/application/src/**/handlers/**` — handler orchestration
- `packages/application/src/sagas/GoalAchievementSaga.ts` — saga example

## Open Questions

- [ ] Standardize saga idempotency key scheme (`{sagaId}:{stepName}:{targetId}`) across all process managers.
