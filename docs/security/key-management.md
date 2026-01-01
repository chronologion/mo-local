# Key Management

**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Scope

How keys are derived, stored, backed up, and used across the system (KEK/master key, identity keys, `K_aggregate`, and device-local cache keys).

## Non-goals

- Precise KDF parameter policy for production (we will harden as we move beyond POC).
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
- **`K_aggregate`**: per-aggregate symmetric key used to encrypt event payloads + snapshots; shared across devices via key backup/restore.
- **`K_cache`**: device-local keys intended for projection caches, indexes, and process-manager state; not synced.

### Backups

Backups must make recovery possible without leaking plaintext:

- **Key backup**: contains identity + `K_aggregate` material (sufficient to decrypt synced/local payload ciphertext).
- **DB backup**: contains the local SQLite DB file (OPFS) with ciphertext facts + derived state.

Restoring a DB backup without keys is expected to yield “locked/incomplete” UI until keys are restored/unlocked.

## Code pointers

- `packages/infrastructure/src/crypto/KeyringManager.ts` — resolving the right key for an event
- `packages/infrastructure/src/crypto/WebCryptoService.ts` — encryption primitives wrapper
- `packages/infrastructure/src/crypto/**` — KEK derivation and key store adapters

## Open questions

- [ ] Define explicit policy for when caches must use `K_cache` vs `K_aggregate` (target: caches/indexes/process-manager state are device-local).
- [ ] Key rotation and keyring epochs: define invariants and UX for multi-device rotation.
