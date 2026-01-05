# Incident Response and Recovery (Security)

**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-05

## Scope

Security-relevant recovery playbooks: lost keys, corrupted derived state, OPFS failures, and safe reset/restore paths.

## Non-goals

- Formal incident response process (org-level).
- Production forensics (future).

## Invariants

Relevant invariants in `docs/invariants.md`:

- `INV-015` — Diagnostics are secret-free
- `INV-012` — Key backup enables payload recovery
- `INV-007` — Single-writer local DB ownership

## Details

### Diagnostics bundle (no secrets)

Diagnostics shared in bugs/support must never include key material or decrypted payloads. Prefer:

- storeId, DB name, schema version
- init stage + OPFS capability flags
- `navigator.storage.persisted()` result and storage estimates (quota/usage)
- avoid pasting raw console output unless it is known to contain only safe metadata (see `INV-019`); prefer a deliberate diagnostics export (`ALC-340`)

### Recovery paths

- **Restore keys**: unlock via passphrase or import key backup.
- **Restore DB**: replace local SQLite DB file from backup (ciphertext-only).
- **Rebuild derived state**: drop projection caches/index artifacts and replay from events.
- **Reset**: wipe OPFS + IndexedDB and re-onboard (last resort).

## Code pointers

- `packages/eventstore-web/src/worker/sqlite.ts` — init errors and diagnostic context
- `apps/web/src/**` — UI entrypoints for reset/restore

## Open questions

- [ ] Define a single “export diagnostics” flow that redacts secrets by construction.
