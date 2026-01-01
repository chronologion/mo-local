# Runbook: Reset / wipe local state

**Scope**: Operational “escape hatch” procedures to recover from corrupted local state or to start fresh.
**Non-goals**: Debugging root causes (use diagnostics + logs); sync protocol design.
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Invariants

- `INV-007` — Single-writer local DB ownership
- `INV-015` — Diagnostics are secret-free

## When to use this

Use reset/wipe when:

- OPFS/SQLite init consistently fails for a given browser profile,
- local projections/read models appear corrupted and rebuild doesn’t help,
- you need a clean device state for testing.

Avoid reset/wipe when:

- you only need to rebuild projections (prefer rebuild).

## What “reset” means

Reset is destructive to device-local state. Depending on the specific action, it may remove:

- OPFS event store DB and related directories,
- device-local keys (IndexedDB),
- local metadata (storeId/user meta).

After reset, you typically:

1. onboard/unlock,
2. restore keys (if you want access to existing encrypted payloads),
3. sync/pull events,
4. rebuild projections if needed.

## Code pointers

- App reset action: `apps/web/src/providers/AppProvider.tsx` (`resetLocalState`)
- OPFS wipe helpers: `apps/web/src/utils/resetEventStoreDb.ts`
