# Sync Boundary Security

**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

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

### What is plaintext (metadata)

To enable ordering and routing, the system exposes some metadata:

- identifiers (`storeId`, `eventId`, `aggregateType`, `aggregateId`)
- event descriptors (`eventType`, `version`, timestamps)
- tracing (`causationId`, `correlationId`)

This is intentional for MVP but must remain explicit in threat modeling.

## Code pointers

- `packages/sync-engine/src/types.ts` — DTOs
- `apps/api/src/sync/infrastructure/kysely-sync-event.repository.ts` — `record_json` persistence

## Open questions

- [ ] Define whether any metadata can be encrypted without breaking server ordering/routing.
