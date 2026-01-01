# Runbook: Sync recovery

**Scope**: Operational guidance for sync failures and “rebase required” scenarios.
**Non-goals**: Defining the sync protocol; changing conflict semantics.
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Invariants

- `INV-001` — Synced events are immutable
- `INV-009` — Server-assigned global ordering
- `INV-011` — Derived state invalidates on rebase

## What happens on conflicts (today)

- The server is the source of truth for global ordering (`globalSequence`).
- When the server is ahead (HTTP 409 `server_ahead`), the client pulls missing events, applies them, and triggers a derived-state rebase/rebuild.
- Under the MVP policy, conflicting per-aggregate histories converge via rebase + LWW by server order.

## If the UI looks stale after sync

- Trigger a projection rebuild (see `docs/runbooks/projection-rebuild.md`).
- Check the debug panel for errors or for the event count not changing.

## Known gap

Recovery for “server lost history / empty server while client head > 0” is tracked as `ALC-343`.

## Code pointers

- Sync engine: `packages/sync-engine/src/SyncEngine.ts`
- E2E rebase coverage: `apps/e2e/tests/offline-rebase-goal-edit.test.ts`
- Server-ahead coverage: `apps/e2e/tests/sync-conflict.test.ts`
