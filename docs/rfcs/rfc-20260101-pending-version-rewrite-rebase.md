# RFC: Pending-version rewrite during sync rebase

**Status**: Draft
**Linear**: ALC-339
**Related**: ALC-334, ALC-307
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Scope

Define the missing **pending-version rewrite** behavior needed to support cross-device concurrent edits under our chosen conflict policy (**rebase + LWW by server global order**) while keeping per-aggregate `version` as persisted/synced metadata.

Rebase itself (derived-state invalidation/rebuild) already exists. This RFC specifies how to rewrite _pending_ events (not yet synced) after pulling missing remote events, so we can:

- preserve the invariant that locally committed events are facts (stable `eventId` + stable plaintext),
- preserve immutability for synced events, and
- prevent local persistence from silently dropping remote facts due to `(aggregate_type, aggregate_id, version)` collisions.

## Non-goals

- Semantic merge of conflicting domain edits.
- Changing the sync protocol format.
- Rewriting events that have been synced (have a `globalSequence` mapping).

## Problem

We support cross-device concurrent edits. The server reconciles ordering via `globalSequence` and the client rebuilds derived state using `effectiveTotalOrder` (rebase).

However, the local storage schema enforces:

- `UNIQUE (aggregate_type, aggregate_id, version)` (`events_aggregate_version`).

When two devices concurrently append to the same aggregate while both were at the same server head, they can each create pending events with the same per-aggregate `version`.

On conflict (`server_ahead`), the “losing” device pulls remote events. Those remote events can collide on `(aggregate_type, aggregate_id, version)` with local pending rows. Current code inserts remote events using `INSERT OR IGNORE`, which can silently drop facts.

This is rare in casual testing because it requires **same-aggregate, same-version** collisions across devices. When it happens, the current behavior risks:

- silently ignoring a remote event during pull,
- leaving local derived state inconsistent with the server’s canonical order, and
- later “version mismatch”/OCC errors that are hard to root-cause.

## Definitions

- **Fact identity**: `eventId` uniquely identifies an event/fact.
- **Synced event**: any `events` row with a `sync_event_map` mapping (`globalSequence`). Immutable.
- **Pending event**: any `events` row without a `sync_event_map` mapping. Durable locally, but mutable before sync.
- **Per-aggregate version**: the `version` field in the sync record and local `events` table.

## Key constraints and invariants

1. **Synced immutability**: once an event has a `globalSequence` mapping, its ciphertext bytes and metadata are never rewritten.
2. **Local-fact commitment**: once committed locally, an event’s `eventId` and plaintext payload are stable facts.
3. **AAD integrity binding**: AES-GCM AAD binds `{ aggregateId, eventType, version }`.
   - If `version` changes for a pending event, its ciphertext must be re-encrypted.
4. **Ordering model**:
   - Derived state converges using `effectiveTotalOrder` (global then local tail).
   - Publication uses `commitSequence`.

## Proposed solution

### When rewriting happens

Pending rewrite happens only when all of the following are true:

- We have pending events locally.
- We pull at least one remote event (typically after a push conflict).
- The pulled remote events include at least one event for an aggregate that also has pending events.

### What rewriting does

For each affected aggregate `(aggregate_type, aggregate_id)`:

1. Load the maximum **synced** `version` for that aggregate (or 0 if none).
2. Load the pending events for that aggregate ordered by `commit_sequence ASC`.
3. Assign new versions deterministically:
   - `newVersion = maxSyncedVersion + 1, +2, ...` in the same order as the pending list.
4. For each pending event where `newVersion != oldVersion`:
   - decrypt the payload using the aggregate key and AAD with `{ aggregateId, eventType, oldVersion }`;
   - re-encrypt the same plaintext using AAD with `{ aggregateId, eventType, newVersion }`;
   - update the `events` row: `version = newVersion`, `payload_encrypted = newCiphertext`.

### Why this is safe

- Synced events remain immutable.
- Pending events keep the same `eventId` (fact identity) and plaintext; only their per-aggregate numbering and ciphertext change.
- After rewrite, the local DB can accept the pulled remote events and can push the rewritten pending events without violating the per-aggregate uniqueness constraint.

## Alternatives considered

1. **Drop or weaken the `(aggregate_type, aggregate_id, version)` uniqueness constraint**.
   - Rejected for now: `version` is part of OCC and part of AAD binding; allowing duplicates would force broader changes to read/write invariants.
2. **Canonical per-aggregate version derived from global order (ignore stored version)**.
   - Rejected for now: would require changing what is stored/synced (and how AAD is computed), and would break byte preservation guarantees.
3. **Treat `version` as immutable for pending events too**.
   - Rejected: cannot support concurrent appends without collisions.

## Implementation sketch

- Change remote apply to never silently ignore version collisions:
  - Detect `(aggregate_type, aggregate_id, version)` conflicts and surface a clear error/diagnostic (until pending rewrite is implemented), or
  - Perform pending rewrite first, then insert remote events without `OR IGNORE`.
- Add a `rewritePendingVersionsIfNeeded(...)` step in `SyncEngine.handleConflict(...)` after applying missing remote events and before retrying push.
- Implement DB queries:
  - get max synced version per affected aggregate;
  - list pending rows per affected aggregate in commit order;
  - batch update rewritten rows.
- Ensure the rewrite step is idempotent and can be retried safely.

## Testing

Add tests that simulate two devices:

- both start from the same head;
- both append pending events for the same aggregate (same versions);
- device A pushes successfully;
- device B gets `server_ahead`, pulls missing, rewrites pending, then pushes;
- assert:
  - no remote insert is silently ignored;
  - device B’s pending versions are shifted deterministically;
  - ciphertext changes when version changes;
  - derived state rebuild is triggered as appropriate.

## Code pointers

- `packages/sync-engine/src/SyncEngine.ts`
- `packages/eventstore-web/src/worker/schema.ts`
- `packages/infrastructure/src/eventing/aad.ts`

## Open questions

- [ ] Where should the rewrite live long-term (sync-engine vs infrastructure adapter), given it requires decrypt/re-encrypt?
- [ ] Should we move AAD/encryption responsibilities into a dedicated port so sync-engine remains crypto-agnostic?
