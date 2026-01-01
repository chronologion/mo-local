# Runbook: Bump an event payload version

**Scope**: How to add and migrate event payload versions without breaking persisted/synced facts.
**Non-goals**: Explaining the full serialization pipeline (see the dedicated serialization doc); general event design guidance.
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Invariants

This doc does not define new invariants. It relies on the invariant registry in `docs/invariants.md`.

## Details

This runbook is the “how to change things safely” companion to:

- `docs/architecture/serialization-and-event-specs.md`

Adding a new payload version must preserve the “domain latest spec + infra migrations” split.

1. Add a new payload version in infra migrations for the event type (bump `latestVersion` in the migration plan).
2. Provide a migration step function for `vN → vN+1` in the plan’s `steps`.
3. Ensure `latestVersionOf(eventType)` resolves to the new version.
4. Update the domain event’s `PayloadEventSpec` to represent the **new latest shape** (domain remains latest-only).
5. Add/extend registry tests to cover decoding persisted vN payloads and upcasting to the latest.

Rule:

- Persisted events are upcast on read; no backfill is required unless a new storage backend mandates it.

## Code Pointers

- `packages/infrastructure/src/eventing/**` — registry + migrations

## Open Questions

- [ ] Define whether we want codegen for `PayloadEventSpec` registration (to replace manual `specs.generated.ts`).
