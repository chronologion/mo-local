# Threat Model

**Status**: Living
**Linear**: ALC-269
**Created**: 2026-01-05
**Last Updated**: 2026-01-05

## Scope

Threat model for the current MO Local POC (browser + OPFS/SQLite + sync server). This document enumerates assets, trust boundaries, attacker capabilities, and the security properties we intend to preserve as the implementation evolves.

## Non-goals

- Formal proofs or cryptographic verification.
- “Perfect privacy” against metadata leakage (timing/size/access patterns).
- Protecting a fully compromised unlocked runtime (XSS/MiTB can exfiltrate plaintext from memory).

## Invariants

Relevant invariants in `docs/invariants.md`:

- `INV-006` — ZK encryption boundary
- `INV-001` — Synced events are immutable
- `INV-013` — Integrity binding via AES-GCM AAD
- `INV-014` — Keys are encrypted at rest under a KEK
- `INV-015` — Diagnostics are secret-free

## Assets and trust boundaries

### Assets

- **Secrets**: passphrase, derived KEK (aka “master key”), private identity keys, per-aggregate DEKs.
- **Confidential data**: decrypted event payloads and snapshot contents (goals/projects).
- **Integrity of history**: ordering + immutability, idempotency keys, cursor checkpoints.
- **Availability/durability**: ability to recover from backup + sync after local corruption or server migration.

### Trust boundaries (runtime units)

- **Browser UI thread**: renders decrypted data while unlocked; initiates commands/queries.
- **Workers** (DB owner / projections): hold SQLite handles; perform IO; handle sync and projection rebuilds.
- **Browser storage**:
  - OPFS: SQLite DB file with ciphertext payloads and plaintext metadata columns (routing/order).
  - IndexedDB: encrypted-at-rest key material (requires KEK to decrypt).
  - localStorage: non-secret metadata (`storeId`/userId, passphrase salt).
- **Server** (`apps/api` + Postgres + Kratos): stores `record_json` ciphertext blobs and plaintext metadata needed for ordering/routing; must not be able to decrypt payloads.

## Attacker models (capabilities)

We explicitly consider:

- **Server compromise**: attacker exfiltrates Postgres tables or gets read access to persisted sync events.
- **Network attacker**: can observe traffic; may attempt tampering/replay (TLS termination is assumed in real deployments).
- **Stolen device / profile theft**: attacker gets filesystem access to browser storage (OPFS, IndexedDB, localStorage).
- **Multi-tab misbehavior**: concurrent access to OPFS/SQLite without single-writer coordination.

We treat as out-of-scope to fully prevent (but we still harden the baseline):

- **XSS / arbitrary JS execution while unlocked**.
- **Malicious extensions / MiTB** (can exfiltrate what the page can read).
- **Compromised OS/browser**.

## Security properties (what we guarantee)

### Confidentiality

- Payload bytes remain encrypted end-to-end across local storage and sync (`INV-006`).
- Key material is encrypted at rest under a passphrase-derived KEK (`INV-014`).

### Integrity

- Payload integrity is enforced by AES-GCM and bound to selected metadata via AAD (`INV-013`).
- Synced events are immutable facts (`INV-001`).

### Availability / durability

- A user can recover on a new device with: (1) key backup + (2) sync pull (or DB restore) and rebuild derived state as needed.
- “Escape hatches” exist (wipe/reset, rebuild projections, restore DB) and must remain safe-by-construction.

### Explicit metadata exposure

We intentionally accept the following leakage as MVP:

- On server: stable identifiers and event descriptors needed for routing/order (e.g. `storeId`, `eventId`, `aggregateType`, `aggregateId`, `eventType`, `version`, timestamps).
- On disk (OPFS): the same metadata is present in plaintext columns even though payload bytes are encrypted.
- Identifiers may leak time if UUIDv7 is used; reducing this is tracked in `ALC-305`.

## Controls / mitigations

- **Encryption at rest**: encrypted payloads/snapshots/caches stored in SQLite BLOB columns; keys stored encrypted in IndexedDB.
- **Single writer**: SharedWorker ownership or WebLocks fallback to prevent corruption (`INV-007`).
- **Safe diagnostics**: user-facing diagnostics must be redacted-by-construction (`INV-015`, `ALC-340`).

## Open questions

- [ ] What is the minimum plaintext metadata required at the sync boundary, and how do we migrate toward less metadata (`ALC-305`, `ALC-332`)?
- [ ] What is our key rotation story (local + multi-device), and what invariants must hold (`ALC-290`)?
