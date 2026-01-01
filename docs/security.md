# Security Overview

**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Scope

This is the top-level security model for MO Local: what we protect, what we leak, what assumptions we make, and the security invariants that must remain true as the system evolves.

## Non-goals

- Formal verification or cryptographic proofs.
- Full metadata privacy across the sync boundary (timing/size/access pattern privacy).
- Protecting a compromised client runtime (e.g. arbitrary JS execution via XSS) beyond baseline browser hardening (CSP, safe rendering, etc.).

## Invariants

Relevant invariants in `docs/invariants.md`:

- `INV-006` — ZK encryption boundary
- `INV-001` — Synced events are immutable
- `INV-013` — Integrity binding via AES-GCM AAD
- `INV-004` — Sync record bytes are preserved

## Assets

- **User secrets**: passphrase, derived KEK (“master key”), identity keys, aggregate keys, cache keys.
- **Confidential domain data**: event payloads and snapshots (goals/projects).
- **Integrity of history**: event ordering + immutability guarantees, idempotency fences.
- **Availability/durability**: local event log in OPFS (SQLite), ability to recover from backups + sync.

## Trust boundaries (runtime units)

- **Browser UI thread**: renders UI, initiates commands/queries, holds decrypted data in memory while unlocked.
- **DB owner worker**: holds the SQLite connection and performs DB IO; receives ciphertext bytes and plaintext metadata needed for indexing/order/cursors.
- **Browser storage**:
  - OPFS: durable SQLite event store (`mo-eventstore-<storeId>.db`).
  - IndexedDB: key storage (encrypted at rest under KEK).
- **Server** (`apps/api`, Postgres, Kratos): authenticates identity and stores/serves sync records (`record_json`) but must not be able to decrypt payloads.

## Threat model (high-level)

Threats we explicitly care about:

- **Server compromise**: attacker gains DB dumps / access to `record_json` rows.
- **Network attacker**: attacker observes traffic or attempts tampering/replay.
- **Device loss**: attacker gets filesystem/storage access to browser profile.
- **Malicious/mistaken multi-tab behavior**: concurrent access to OPFS/SQLite.

Threats that break the model (assumptions):

- **XSS / arbitrary JS execution** while unlocked can exfiltrate decrypted data and keys from memory.
- **Compromised OS/browser** can bypass web sandbox guarantees.

## Security properties (what we guarantee)

### Confidentiality

- Domain payloads are encrypted client-side and remain ciphertext at rest locally (OPFS SQLite) and in transit to/from the server.
- Key material is stored encrypted at rest in IndexedDB under a passphrase-derived KEK.

### Integrity

- AES‑GCM integrity with AAD ties ciphertext to selected metadata and prevents cross-context replay.
- Synced events are immutable; server ordering (`globalSequence`) creates a stable convergence stream.

### What is observable (intentional leakage)

The server necessarily learns plaintext metadata needed for sync mechanics:

- `storeId` / owner identity context, `globalSequence` ordering, timestamps, and basic event descriptors (e.g. `aggregateType`, `aggregateId`, `eventType`, `version`).
- Traffic patterns: ciphertext length, timing, frequency.

## Key management overview (at a glance)

- **KEK / master key**: derived from user passphrase + salt; used to encrypt keys at rest (IndexedDB).
- **`K_aggregate`**: per-aggregate symmetric key used to encrypt event payloads and snapshots; shared across devices via key backup/restore.
- **`K_cache`**: device-local keys intended for projection/index caches; never synced; loss must be recoverable via rebuild.

See `docs/security/key-management.md`.

## Storage overview (at a glance)

- OPFS SQLite is the local durability boundary for the event log.
- Single-writer is enforced via SharedWorker (default) or Web Locks (fallback).

See `docs/security/local-storage.md`.

## Sync boundary overview (at a glance)

- Sync records are opaque to the server: ciphertext bytes in base64url inside `record_json` TEXT.
- Server assigns `globalSequence` and returns `record_json` bytes as-is to preserve determinism at the current JS boundary.

See `docs/security/sync-boundary.md`.

## Operational guidance

- Always provide diagnostics without secrets (storeId, init stage, OPFS capability checks, schema version).
- Provide explicit “escape hatch” tooling: reset/wipe + restore from key backup and/or DB backup.

See `docs/security/incident-response-and-recovery.md`.

## Code pointers

- `packages/eventstore-web/src/worker/sqlite.ts` — OPFS/SQLite init + diagnostics stages
- `packages/infrastructure/src/crypto/**` — WebCrypto service + keyring manager
- `packages/sync-engine/src/types.ts` — sync DTOs
- `apps/api/src/sync/infrastructure/migrations/sync/0001_sync_schema.ts` — `record_json` TEXT persistence

## Open questions

- [ ] Define and document the minimum plaintext metadata we can tolerate at the sync boundary (privacy roadmap).
- [ ] Formalize browser hardening requirements (CSP, Trusted Types, sanitization rules) and make them build-time enforced.
