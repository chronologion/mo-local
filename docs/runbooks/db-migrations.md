# Runbook: Database migrations

**Scope**: Applying and rolling back database migrations for the API’s Postgres schemas.
**Non-goals**: Detailed Kysely usage; SQLite schema changes in the browser (tracked separately).
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Commands

- Apply: `yarn db:migrate`
- Rollback: `yarn db:migrate:down`

## Notes

- Keep migrations idempotent and additive where possible.
- If a change affects sync persistence boundaries (e.g. `record_json`), update `docs/invariants.md` and relevant tests.

## Code pointers

- Migrator: `apps/api/src/platform/infrastructure/migrations/migrator.ts`
- Access migrations: `apps/api/src/access/infrastructure/migrations/**`
- Sync migrations: `apps/api/src/sync/infrastructure/migrations/**`
