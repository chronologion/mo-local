# Testing Strategy

**Scope**: How we test MO Local (DDD/CQRS/ES, local-first + sync) with high confidence and low flakiness.
**Non-goals**: Teaching Vitest/Playwright basics or documenting every test case.
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-06

## Invariants

This doc does not define invariants. It relies on the invariant registry in `docs/invariants.md`.

## Goals

- Catch regressions in the **event log + ordering + derived state** pipeline early.
- Keep the **sync boundary contracts** stable (byte-preservation, immutability boundary, cursor semantics).
- Keep tests **fast** (unit/integration) and **selective** (E2E only for critical flows).

## Test pyramid (what goes where)

### 1) Domain unit tests (`packages/domain`)

Purpose: prove business rules and VO invariants without infrastructure.

- Aggregate behavior (methods → domain events)
- VO canonicalization (`toJSON`/`value`) and reconstitution (`from(...)`)
- Pure functions (calculations, validation)

### 2) Application unit tests (`packages/application`)

Purpose: prove CQRS orchestration contracts (handlers + ports) without real persistence.

- Command handler correctness (including `knownVersion` OCC failures)
- Query handler correctness (pure read orchestration)
- Saga/process-manager logic with deterministic inputs

### 3) Infrastructure integration tests (`packages/infrastructure`, `apps/api`)

Purpose: prove adapter correctness against real implementations where it matters.

Focus areas:

- Eventing serialization pipeline + registry (ALC-301)
- DB schema / migrations + repository implementations
- Sync storage boundary behavior (server stores `record_json` as TEXT; no canonicalization)

### 4) E2E (Playwright, `apps/e2e`)

Purpose: guard **critical user-visible workflows** across the real runtime units:

- Web UI thread ↔ DB owner worker ↔ OPFS SQLite
- Web ↔ API ↔ Postgres (sync)
- Key unlock + rebuild readiness

Rule: only add E2E tests for **critical flows** that cannot be made trustworthy at lower levels.

## Non-negotiable contracts (what must stay green)

- **Event ordering**: publication vs replay ordering remain correct (`commitSequence` vs `effectiveTotalOrder`).
- **Byte preservation**: the sync boundary preserves serialized bytes for already-synced events.
- **Immutability boundary**: synced events are immutable; pending events may be rewritten during rebase (RFC + issue tracked).
- **Idempotency**: replays do not double-apply effects (eventId/idempotency keys).

See `docs/invariants.md`:

- `INV-002` — Projections follow effectiveTotalOrder
- `INV-003` — Publication follows commitSequence
- `INV-004` — Sync record bytes are preserved
- `INV-001` — Synced events are immutable
- `INV-010` — Pending events may be rewritten during rebase
- `INV-008` — Idempotency is keyed by eventId

## Tooling and gates

- Typecheck: `yarn typecheck`
- Test typecheck: `yarn typecheck:test`
- Unit/integration: `yarn test` / `yarn test:integration`
- Formatting: `yarn format:check`
- Lint: `yarn lint`

Coverage (guideline):

- Maintain >80% coverage in unit/integration for key paths (handlers, ordering, serialization).
- Prefer **path coverage** over line-chasing (tests that actually exercise the critical flows).

## Organization conventions

- Tests live in `__tests__` next to `src` for each package/app.
- Test files: `<SourceFile>.test.ts`
- Fixtures: `__tests__/fixtures/**` (in-memory ports, factories)

## Mocking rules of thumb

- Mock at **external boundaries** (HTTP, time, random IDs) unless specifically testing integration behavior.
- Prefer real internal implementations when fast enough (crypto/serialization), because these are high-risk.

## Code pointers

- `packages/infrastructure/__tests__/derived-state/ProjectionRuntime.test.ts` — ordering + cursor tests
- `packages/infrastructure/__tests__/eventing/eventEnvelope.test.ts` — envelope bytes stability (meta + payload)
- `packages/infrastructure/__tests__/eventing/CommittedEventPublisher.test.ts` — publish ordering/cursor tests
- `apps/api/__tests__/sync/kysely-sync-event.repository.test.ts` — `record_json` persistence boundary
- `apps/e2e/tests/**` — critical cross-runtime workflows

## Open Questions

- [ ] Add a focused unit test guarding against deriving replay order from `causationId`/`correlationId` (INV-005).
