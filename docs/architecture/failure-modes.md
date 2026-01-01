# Failure modes and recovery

**Scope**: Operational failure modes and recovery playbooks for local-first storage/sync/keys.
**Non-goals**: Support policy, SLAs, or production incident response (future).
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Invariants

This doc does not define new invariants. It relies on the invariant registry in `docs/invariants.md`.

## Details

### Key loss

- If the user loses the passphrase and has no usable key backup, encrypted payloads are unrecoverable by design.
- If aggregate keys are missing (e.g. syncing onto a fresh device without importing keys), projections will skip events for aggregates whose keys are not present; the UI will appear incomplete until keys are restored.

Recovery:

- Restore a key backup that includes identity + aggregate keys, then unlock; projections can replay from committed encrypted events.

### Sync divergence

Current behavior:

- The server does not implement event pruning/retention limits in a way that could make old sequences unavailable.

If pruning/retention is introduced:

- The protocol must define what happens when a client’s `since` is behind retention (e.g. “force full resync” or “reset store”), and the UI must surface an explicit recovery path.

### Projection corruption or stale indexes

Projections are derived state and are rebuildable from committed event tables.

Recovery:

- Use the derived-state runtime’s rebuild trigger (`onRebaseRequired()` / projection-level rebuild) to clear derived tables and replay from `events` (+ `sync_event_map` when using `effectiveTotalOrder`).
- Note: rebuild requires the relevant aggregate keys; missing keys will cause those aggregates to remain absent.
- If an index artifact is suspected to be corrupted, delete the relevant `index_artifacts` row(s) and rebuild; artifact encryption makes “partial reads” indistinguishable from corruption.

### Saga stuck state

Sagas persist their own state (e.g. `achievementRequested = true`). A crash at the wrong time can leave a saga thinking it has pending work.

Recovery:

- On bootstrap, sagas should reconcile against repositories/read models and re-run idempotently.
- Manual recovery is always possible by clearing saga state tables and allowing bootstrap to reconstruct state.

## Code Pointers

- `packages/eventstore-web/src/worker/sqlite.ts` — init stages + OPFS diagnostics
- `packages/eventstore-web/src/worker/owner.worker.ts` — failure surfacing

## Open Questions

- [ ] Define a single “export diagnostics” flow that is safe-by-construction (no secrets).
