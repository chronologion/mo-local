# End-to-end workflows (contracts over mechanisms)

**Scope**: End-to-end contracts for commits, publication, derived state, and sync (ordering/cursors/rebase).
**Non-goals**: UI/UX details, API endpoint implementation details, or cryptographic algorithms (see security docs).
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Invariants

Relevant invariants in `docs/invariants.md`:

- `INV-002` — Derived state uses `effectiveTotalOrder`
- `INV-003` — Publish-after-commit uses `commitSequence`
- `INV-005` — No causality-based ordering

## Details

### Write path (command → commit)

1. UI dispatches a typed command via a BC command bus (through presentation hooks).
2. Application handler loads the aggregate via repository port, checks `knownVersion`, applies domain behavior, and collects uncommitted events.
3. Infrastructure repository:
   - serializes each domain event using the unified eventing runtime (see `docs/architecture/infrastructure-layer.md`),
   - encrypts the payload envelope with the aggregate key (AES-GCM + AAD),
   - appends to the local SQLite `events` table via `SqliteDbPort` (durable boundary),
   - and relies on projection processors and post-commit streaming for derivations.

**Contract**

- If `knownVersion` mismatches, the handler fails with `ConcurrencyError` (no silent overwrites on-device).
- “Durable” means “persisted into OPFS-backed SQLite”; anything else must be derivable/replayable.

### Read path (projections → read model → UI)

1. Projection processors consume committed encrypted events from the `events` table (and `sync_event_map` when using `effectiveTotalOrder`).
2. They maintain encrypted snapshots + analytics/search indices and expose in-memory projections.
3. Application queries depend only on `*ReadModel` ports; UI subscribes via projection ports.

**Contract**

- UI never reads encrypted tables directly; it consumes read models/projection ports.
- Projections are rebuildable from committed event tables.
- **Dual-order model contract (critical)**:
  - Persisted **projections / read models / snapshots** MUST process events in `effectiveTotalOrder`.
  - They MUST persist their cursor **in that ordering** (cursor = `{ globalSequence, pendingCommitSequence }`).
    - Cursor persistence lives in `projection_meta.last_*` and in the per-derivation tables (`projection_cache`, `index_artifacts`, `snapshots`, `process_manager_state`).

### Publication path (post-commit → event bus)

1. `CommittedEventPublisher` streams **committed** events from the `events` table ordered by `commitSequence`.
2. It decrypts and rehydrates domain events and publishes them on `EventBusPort`.
3. It persists a cursor per stream to guarantee replayability and avoid double-publish on reload.

**Contract**

- No “publish while persisting pending events” side effects in command handlers.
- Publication is eventually consistent with commits but replay-safe.
- **Dual-order model contract (critical)**:
  - `CommittedEventPublisher` is a **local-commit publication bus**.
  - It MUST publish in `commitSequence` order and persist its cursor in `commitSequence` ordering.

### Sync path (MO Sync Engine protocol)

1. `SyncEngine` pushes/pulls a store’s encrypted records via HTTP (`/sync/push`, `/sync/pull`) using an explicit DTO contract (server assigns `globalSequence`).
2. Pull persists remote events durably into the local `events` table and records `eventId → globalSequence` in `sync_event_map` (byte-preserved via `recordJson`).
3. Push uses an `expectedHead` precondition; on HTTP 409 “server ahead”, the client fast-forwards (pull missing) and triggers an explicit rebase rebuild for derived state (then retries push).

**Contract**

- Sync is about global ordering and rebase; it is not a domain-level merge protocol.
- **Cross-device concurrent writes are supported**: multiple devices may commit events for the same aggregate while offline/partitioned.
- **Conflict resolution policy (MVP)**: rebase + **last-writer-wins by server global order** (`globalSequence`) for conflicting per-aggregate histories. This is a deliberate trade-off chosen for the current domain.
  - Future: some aggregate types may require stronger merge semantics than LWW (e.g. CRDT-style convergence for “notes”-like content). Treat LWW+rebase as the default, not a universal rule.

### Dual-order model (why publication and projections differ)

We intentionally have **two different orderings**:

- **`commitSequence`**: local durability/publication order (append order in the local DB).
- **`effectiveTotalOrder`**: deterministic replay order for any derived state that must converge under cross-device sync:
  - first by `globalSequence` (synced region),
  - then by `pendingCommitSequence` (local-only region).

**Why**

- Publication is about reacting to what the local device committed (a local “commit log” view).
- Projections/snapshots/saga state are about convergent reconstruction under sync (a “global stream + local tail” view).

## Code Pointers

- `packages/infrastructure/src/eventing/CommittedEventPublisher.ts` — post-commit publication
- `packages/infrastructure/src/platform/derived-state/runtime/ProjectionRuntime.ts` — derived-state cursoring + rebuild
- `packages/sync-engine/src/SyncEngine.ts` — pull/push + conflict + rebase trigger
- `apps/e2e/tests/offline-rebase-goal-edit.test.ts` — cross-device concurrent edits + rebase behavior

## Implementation notes

- Pending rewrite mechanics (when rebase causes per-aggregate version shifts requiring AAD re-encryption) are specified in `docs/rfcs/rfc-20260101-pending-version-rewrite-rebase.md` and tracked in `ALC-339`.
