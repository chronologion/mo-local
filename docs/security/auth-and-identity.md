# Auth and Identity Security

**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-05

## Scope

Security assumptions and contracts around authentication/identity (Kratos integration) and how identity relates to `storeId`/ownership in sync.

## Non-goals

- A complete auth deployment guide (future production infra).
- Full account recovery policy.

## Invariants

Relevant invariants in `docs/invariants.md`:

- `INV-017` — Auth is not key escrow
- `INV-006` — ZK encryption boundary

## Details

- Identity is used for access control and stream scoping; payload confidentiality remains client-side.
- `storeId` scopes a sync stream. In the current UX, the `storeId` is effectively the user identity for the local event store (restores/imports must ensure the same `storeId` to converge on the same stream).
- Authentication must never become key escrow: the server authenticates and authorizes sync access but cannot decrypt payloads (`INV-017`).

## Code pointers

- `apps/api/src/**` — controllers + Kratos integration points
- `docker-compose.yml` — Kratos service in local stack

## Open questions

- [ ] Define multi-profile/multi-user behavior in one browser storage partition (currently not supported).
