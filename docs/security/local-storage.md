# Local Storage Security (Browser)

**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Scope

Security and durability properties of browser storage used by MO Local: OPFS (SQLite) and IndexedDB (key storage).

## Non-goals

- Full platform security guidance for all browsers/versions.
- Server-side storage (see `sync-boundary.md`).

## Invariants

Relevant invariants in `docs/invariants.md`:

- `INV-007` — Single-writer local DB ownership
- `INV-014` — Keys are encrypted at rest under a KEK
- `INV-016` — Secure context required

## Details

### OPFS + SQLite

- Facts are stored as ciphertext bytes in SQLite in OPFS.
- SQLite is owned by a worker; multi-tab is coordinated by a SharedWorker owner (fallback: dedicated worker + Web Locks).

### IndexedDB (key storage)

- Keys are persisted in IndexedDB encrypted at rest using the passphrase-derived KEK.

### Eviction and persistence

- Browsers may evict storage under pressure unless persistence is granted (`navigator.storage.persist()`).
- “Not persisted” is a risk signal; UX should surface it where possible and provide backup guidance.

## Code pointers

- `packages/eventstore-web/src/worker/sqlite.ts` — OPFS init stages and errors
- `packages/eventstore-web/src/worker/owner.worker.ts` — ownership model + locks

## Open questions

- [ ] Define a UX policy for storage persistence prompts and “persisted=false” diagnostics.
