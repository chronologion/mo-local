# Sync Boundary Security

**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-05

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

- `{aggregateId, eventType, version}` for event payload ciphertext
- snapshot/projected artifacts have their own AAD schemes (projection id, scope key, artifact/cache version, cursor)

Other metadata fields in `record_json` (e.g. `occurredAt`, `actorId`, tracing ids) are **not** cryptographically bound today and should be treated as advisory. The current MVP relies on the server byte-preserving `record_json` (`INV-004`) rather than attempting to defend against a malicious server rewriting metadata.

### What is plaintext (metadata)

To enable ordering and routing, the system exposes some metadata:

- identifiers (`storeId`, `eventId`, `aggregateType`, `aggregateId`)
- event descriptors (`eventType`, `version`, timestamps)
- tracing (`causationId`, `correlationId`)

This is intentional for MVP but must remain explicit in threat modeling.

### Metadata minimization (roadmap)

Some metadata is avoidable and is tracked as follow-up security work:

- UUIDv7 identifiers leak time; migrating to UUIDv4 reduces timestamp leakage (`ALC-305`).
- Explicit `eventType` and BC-specific shapes may be reducible depending on indexing strategy (`ALC-305`, `ALC-332`).

## Code pointers

- `packages/sync-engine/src/types.ts` — DTOs
- `apps/api/src/sync/infrastructure/kysely-sync-event.repository.ts` — `record_json` persistence

## Open questions

- [ ] Define whether any metadata can be encrypted without breaking server ordering/routing.
