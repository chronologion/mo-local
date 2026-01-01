# Auth and Identity Security

**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

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

## Code pointers

- `apps/api/src/**` — controllers + Kratos integration points
- `docker-compose.yml` — Kratos service in local stack

## Open questions

- [ ] Define multi-profile/multi-user behavior in one browser storage partition (currently not supported).
