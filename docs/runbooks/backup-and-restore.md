# Runbook: Backup and restore

**Scope**: Operational procedures to back up and restore (a) keys and (b) the local event store DB.
**Non-goals**: Designing backup formats or cryptography (see security docs).
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Invariants

- `INV-012` — Key backup enables payload recovery
- `INV-015` — Diagnostics are secret-free

## What you can back up

### 1) Keys backup (recommended)

Backs up identity keys only. Per-aggregate DEKs are recovered later via keyring updates after a sync pull.

What it does **not** include:

- the event log,
- projections/read models,
- snapshots/search indexes (these are rebuildable).

### 2) DB backup (data backup)

Backs up the local OPFS SQLite DB file (`mo-eventstore-<storeId>.db`) containing the event log and derived-state tables.

This is useful for:

- fast recovery without waiting for sync,
- debugging and support,
- migrating between browsers on the same machine.

## Restore guidance (what happens after)

- Restoring **keys** enables decrypting local DB content and/or synced ciphertext.
- Restoring a **DB** restores local data as it existed at the time of the export.
- Some derived state may still need a rebuild (projections/read models) depending on how/when the app starts.

## Safety notes

- Treat key backups as sensitive artifacts (they can unlock your data).
- Do not paste key backups into bug reports or tickets.
- Keep backups versioned by date and keep multiple copies.

## Code pointers

- UI backup/restore: `apps/web/src/components/goals/BackupModal.tsx`
- Backup format: `packages/presentation/src/backupEnvelope.ts`
- DB export: `apps/web/src/providers/AppProvider.tsx` (DebugPanel download)
- OPFS DB name: `packages/eventstore-web/src/worker/sqlite.ts`
