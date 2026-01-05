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
- `INV-019` — Logs avoid plaintext domain content

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
- **Server** (`apps/api` + Postgres + Ory Kratos): stores `record_json` ciphertext blobs and plaintext metadata needed for ordering/routing; must not be able to decrypt payloads.

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

### Locked vs unlocked state (important distinction)

- **Locked**: KEK is not in memory. An attacker with a stolen browser profile must perform an _offline_ attack (e.g. brute-force the passphrase) to decrypt key material and payloads.
- **Unlocked**: decrypted data and keys exist in memory. A runtime compromise can exfiltrate plaintext (this is a fundamental limitation of browser apps).

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

Some metadata is currently exposed in plaintext (locally and/or at the sync boundary). Not all of it is desired; where possible, we minimize it without breaking correctness or UX.

Current posture:

- **On disk (OPFS)**: plaintext metadata columns exist (e.g. `aggregate_id`, `event_type`, `version`, `occurred_at`) even though payload bytes are encrypted. A stolen browser profile leaks this metadata.
- **On server (sync `record_json`)**:
  - stable identifiers and ordering fields required for sync mechanics (e.g. `storeId`, `eventId`, `globalSequence`)
  - the current implementation also includes additional metadata such as `eventType` and `occurredAt` because the sync record is a mostly direct envelope of the local row shape; this is **undesired** and tracked for removal in `ALC-332`.

Roadmap:

- **Do not expose `eventType` to the server** (tracked in `ALC-332`). We still need `event_type` locally for projections/AAD binding, but we should not ship it across the sync boundary.
- UUIDv7 identifiers leak time; migrating to UUIDv4 reduces timestamp leakage (`ALC-305`).
- **Do not expose client timestamps like `occurredAt` to the server** (tracked in `ALC-332`). We need timestamps for product UX, but they should live inside encrypted payloads/envelopes. If the server needs a timestamp for ops/debug, it can rely on server-side `created_at`/`received_at`.

## Controls / mitigations

- **Encryption at rest**: encrypted payloads/snapshots/caches stored in SQLite BLOB columns; keys stored encrypted in IndexedDB.
- **Single writer**: SharedWorker ownership or WebLocks fallback to prevent corruption (`INV-007`).
- **Safe diagnostics**: user-facing diagnostics must be redacted-by-construction (`INV-015`, `ALC-340`).
- **Logging hygiene**: logs must avoid plaintext domain content (`INV-019`).

## Key threat scenarios (and current posture)

### Offline passphrase attack (stolen IndexedDB / key backup)

- The KEK is derived from the user passphrase using PBKDF2-SHA256 with 600k iterations (current implementation).
- A weak passphrase remains vulnerable to offline guessing if an attacker exfiltrates IndexedDB and/or an encrypted key backup file.
- Mitigations:
  - user guidance on passphrase strength
  - consider future KDF hardening / migration (e.g. Argon2id) as part of the browser hardening roadmap (`ALC-299`).

### Malicious code delivery (compromised operator / CDN / supply chain)

- A compromised deployment pipeline or CDN can serve modified JS that exfiltrates plaintext while the app is unlocked.
- This is distinct from “user-content XSS”: it is an integrity/supply-chain attack.
- Mitigations (future):
  - Subresource Integrity (SRI) where applicable
  - reproducible builds and artifact verification
  - code signing / release attestation
  - strict CSP + Trusted Types (see `docs/security/browser-security.md`, `ALC-299`).

### Stolen key backup

- Key backups are encrypted under the passphrase-derived KEK (see `docs/security/key-management.md`).
- If the backup is exfiltrated and the passphrase is weak/guessed, historical payloads become decryptable.
- Mitigations (future):
  - strong passphrase guidance
  - consider an explicit “backup encryption key” or second factor for exports (`ALC-290`, `ALC-293`).

### Salt integrity / tampering

- The passphrase salt is stored in localStorage and is not authenticated.
- Tampering primarily causes an availability failure (KEK mismatch → cannot decrypt keys) rather than a confidentiality break.
- In a runtime-compromise scenario, an attacker could also intercept passphrase entry; this is in the “compromised unlocked runtime” class.

### Replay / reordering attacks

- Duplicate insertion is prevented by idempotency on `eventId` (`INV-008`).
- Canonical ordering is enforced by server-assigned `globalSequence` (`INV-009`).
- Advisory metadata in `record_json` (timestamps, tracing ids) is not integrity-bound today; tampering is not cryptographically prevented (see `docs/security/sync-boundary.md`).

## Open questions

- [ ] What is the minimum plaintext metadata required at the sync boundary, and how do we migrate toward less metadata (`ALC-305`, `ALC-332`)?
- [ ] What is our key rotation story (local + multi-device), and what invariants must hold (e.g. epoch monotonicity, re-encryption boundaries, recovery guarantees) (`ALC-290`)?
