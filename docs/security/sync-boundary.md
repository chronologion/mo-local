# Sync Boundary Security

**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-06

## Scope

What crosses the client↔server boundary during sync, what is encrypted vs plaintext, and which properties we rely on for correctness (byte preservation, ordering, idempotency).

## Non-goals

- Eliminating metadata leakage (timing/size/access patterns).
- Cross-language canonical encoding (future; today the contract is “JS + JSON.stringify”).

## Invariants

Relevant invariants in `docs/invariants.md`:

- `INV-006` — ZK encryption boundary
- `INV-004` — Sync record bytes are preserved
- `INV-009` — Server-assigned global ordering
- `INV-008` — Idempotent sync facts by `eventId`

## Details

### What is encrypted

- Event payloads and snapshots are encrypted client-side (AES‑GCM).
- Ciphertext bytes cross the boundary as base64url strings inside `record_json`.

### Integrity binding (AAD)

We intentionally bind only selected metadata into the AES‑GCM AAD (`INV-013`):

- `{aggregateType, aggregateId, version}` for event payload ciphertext
- snapshot/projected artifacts have their own AAD schemes (projection id, scope key, artifact/cache version, cursor)

Other metadata fields that live inside the encrypted envelope (e.g. `eventType`, `occurredAt`, `actorId`) are integrity‑protected by AES‑GCM but not separately authenticated as plaintext. The sync boundary relies on the server byte‑preserving `record_json` (`INV-004`) rather than attempting to defend against a malicious server rewriting metadata it cannot see.

### What is plaintext (metadata)

To enable ordering and routing, the system exposes some metadata.

Plaintext metadata required for sync mechanics:

- identifiers (`storeId`, `eventId`, `aggregateType`, `aggregateId`)
- ordering fields (`globalSequence`, `version`, `epoch`)

### Sharing (planned): additional plaintext in revised `record_json` shape

When sharing is implemented, `/sync` records will carry additional plaintext dependency refs and signature material to support:

- dependency checks (“no keyless ciphertext”), and
- authorization-base concurrency (“revoked writers can’t publish”).

Planned additional plaintext fields include:

- `scopeId`, `resourceId`, `resourceKeyId`
- `grantId`, `scopeStateRef`, `authorDeviceId`
- `sigSuite`, `signature` (over a canonical manifest binding these refs to ciphertext bytes)

See `docs/rfcs/rfc-20260107-key-scopes-and-sharing.md` (and `INV-021`, `INV-022`) for the concrete revised `record_json` shape.

### Metadata minimization (roadmap)

Some metadata is avoidable and is tracked as follow-up security work:

- Minimize aggregate taxonomy leakage (if we can route/order without plaintext aggregate types).
- Keep identifiers opaque (UUIDv4; no timestamp leakage from IDs).

## Code pointers

- `packages/sync-engine/src/types.ts` — DTOs
- `apps/api/src/sync/infrastructure/kysely-sync-event.repository.ts` — `record_json` persistence

## Open questions

- [ ] Define whether any metadata can be encrypted without breaking server ordering/routing.
