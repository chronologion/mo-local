# Runbook: Rebuild projections

**Scope**: When and how to rebuild derived state (read models, snapshots, indexes).
**Non-goals**: Changing derived-state algorithms (see architecture topic docs).
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Invariants

- `INV-002` — Derived state uses `effectiveTotalOrder`
- `INV-011` — Derived state invalidates on rebase

## When you should rebuild

Rebuild projections when:

- the UI shows empty lists while the event log is present,
- after a rebase-required event (derived state was invalidated),
- after restoring a DB backup (depending on app boot order and state).

## What rebuild does (high level)

- Clears derived-state tables (projection caches, snapshots, process-manager state).
- Replays events in `effectiveTotalOrder` and persists new cursors.

## Code pointers

- Projection runtime: `packages/infrastructure/src/platform/derived-state/runtime/ProjectionRuntime.ts`
- UI trigger: `apps/web/src/components/DebugPanel.tsx` (“Rebuild Projections”)
