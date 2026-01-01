# Runbook: Dev stack operations

**Scope**: Operating the local dev stack (Docker compose) used by the API, Postgres, and Kratos.
**Non-goals**: Production deployment design.
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Commands

- Start: `yarn dev:stack`
- Stop: `yarn dev:stack:stop`
- Reset: `yarn dev:stack:reset`
- Logs: `yarn dev:stack:logs`
- Status: `yarn dev:stack:status`

## Notes

- The browser event store DB is not inside Docker; it lives in OPFS in your browser profile.

## Code pointers

- Stack script: `scripts/dev-stack.sh`
- Compose file: `docker-compose.yml`
