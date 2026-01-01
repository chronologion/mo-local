# API runtime (`apps/api`)

**Scope**: The server runtime unit: what it does, what it does not do, and how it layers internally.
**Non-goals**: Full endpoint-by-endpoint documentation; detailed database administration.
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Invariants

This doc does not define invariants. It relies on the invariant registry in `docs/invariants.md`.

Relevant invariants:

- `INV-006` — ZK encryption boundary
- `INV-004` — Sync record bytes are preserved
- `INV-009` — Server assigns global ordering

## Responsibilities (what the API is for)

`apps/api` is a **separate runtime unit** from the web app. It exists primarily to:

- Authenticate and authorize access to a user’s sync stream (identity boundary).
- Persist and serve sync records (ciphertext + necessary metadata).
- Assign server ordering (`globalSequence`) for convergence.

It is explicitly **not** a domain execution environment:

- It does not run domain aggregates, command handlers, or projections.
- It must not require access to user keys or plaintext domain payloads.

## Internal layering (simplified)

The server is still layered, but the focus is narrower than the browser runtime:

- **Presentation**: NestJS controllers + DTO validation.
- **Application**: services that implement the sync use cases (pull/push, conflict responses).
- **Domain**: small server-side sync domain types/VOs (e.g. IDs, sequences).
- **Infrastructure**: Postgres repositories, migrations, Kratos integration, auth policies.

## Data boundary: `record_json`

The API persists sync records as canonical JSON **TEXT**:

- Payload ciphertext bytes are encoded as base64url strings (inside `record_json`).
- The API returns `record_json` bytes as-is to preserve the current boundary contract.

This is a deliberate constraint for the current JS client boundary; it is not a promise of cross-language canonical JSON.

See:

- `docs/architecture/infrastructure-layer.md` (byte preservation contract)
- `docs/security/sync-boundary.md` (security implications)

## Authentication and authorization

- Identity is validated via Ory Kratos.
- Sync access control is enforced as “owner-only” for the current POC.

## Code pointers

- `apps/api/src/main.ts` — composition root / bootstrap
- `apps/api/src/sync/**` — sync endpoints + persistence
- `apps/api/src/access/**` — Kratos integration + session validation
- `apps/api/src/sync/infrastructure/migrations/sync/**` — sync schema and ownership constraints

## Open questions

- [ ] Define a privacy roadmap for minimizing plaintext metadata at the sync boundary (while keeping the protocol debuggable).
