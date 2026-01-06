# Key Management

**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-06

## Scope

How keys are derived, stored, backed up, and used across the system (KEK/master key, identity keys, `K_aggregate`, and device-local cache keys).

## Non-goals

- Precise KDF parameter policy (hardening tracked in `ALC-299`).
- Multi-user / multi-profile key separation (future feature).
- Sharing key distribution (future).

## Invariants

Relevant invariants in `docs/invariants.md`:

- `INV-006` — ZK encryption boundary
- `INV-014` — Keys are encrypted at rest under a KEK
- `INV-012` — Key backup enables payload recovery
- `INV-017` — Auth is not key escrow

## Details

### Key categories

- **KEK / master key**: passphrase-derived key used to encrypt keys at rest in IndexedDB.
- **Identity keys**: user root identity (signing/encryption keypairs) used for auth/ownership semantics.
- **Per-aggregate DEKs**: per-aggregate symmetric keys used to encrypt event payloads + snapshots. These keys are stored locally and included in key backups today.
- **Derived-state keys (today)**: the current implementation also stores projection/index/process-manager keys in the same key store under “key IDs” (e.g. `goal_search_index`, `process_manager:goal_achievement`). These keys are encrypted at rest under the KEK and are currently included in key backups even though they are rebuildable device-local cache keys.

This means “KeyStore” currently holds **more than aggregate DEKs**. If we later introduce a true device-local key domain (`K_cache`), we should explicitly separate export/import behavior (so derived-state keys stay rebuildable and out of recovery material).

### Privacy note: derived-state keys in local storage

Because derived-state keys are currently stored alongside aggregate keys, a leaked **device** (IndexedDB) can decrypt device caches such as:

- encrypted search index artifacts (may include plaintext tokens/terms depending on what we cache)
- encrypted analytics aggregates
- encrypted process-manager state

The system remains end-to-end encrypted at the sync boundary, but this is a **device-scope privacy** question: what extra data becomes decryptable if a device profile is exfiltrated.

Derived-state keys are currently **included** in key backups because backups export the entire key store. They are device-local and rebuildable by replaying encrypted events, so long-term we should separate them from recovery material if we want to minimize what a stolen backup can decrypt.

### Backups

Backups must make recovery possible without leaking plaintext:

- **Key backup**: contains identity keys plus all currently stored aggregate and derived-state keys.
- **DB backup**: contains the local SQLite DB file (OPFS) with ciphertext facts + derived state.

Restoring a DB backup without keys is expected to yield “locked/incomplete” UI until keys are restored/unlocked.

## Code pointers

- `packages/infrastructure/src/crypto/KeyringManager.ts` — resolving the right key for an event
- `packages/infrastructure/src/crypto/WebCryptoService.ts` — encryption primitives wrapper
- `packages/infrastructure/src/crypto/**` — KEK derivation and key store adapters

## Open questions

- [ ] Decide whether derived-state keys should be exportable or strictly device-local (privacy vs convenience tradeoff).
- [ ] Key rotation and keyring epochs: define invariants and UX for multi-device rotation.
