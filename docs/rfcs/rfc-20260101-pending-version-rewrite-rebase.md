# RFC: Pending-version rewrite during sync rebase

**Status**: Implemented
**Linear**: ALC-339
**Related**: ALC-334, ALC-307
**PR**: #41
**Created**: 2026-01-01
**Last Updated**: 2026-01-02

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

On conflict (`server_ahead`), the “losing” device pulls remote events. Those remote events can collide on `(aggregate_type, aggregate_id, version)` with local pending rows. Prior to ALC-339, remote apply used `INSERT OR IGNORE`, which could silently drop facts.

ALC-339 removes this silent-drop behavior and implements pending rewrite + retry on collision.

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

Pending rewrite happens only when a **remote event cannot be persisted** because it collides with a **pending** local event on:

- `UNIQUE (aggregate_type, aggregate_id, version)`.

This collision is typically encountered while applying missing remote events after a `server_ahead` push conflict (i.e. during rebase), but the trigger is **persistence collision**, not the conflict response itself.

### What rewriting does

For the affected aggregate `(aggregate_type, aggregate_id)` and collision `version = V`:

1. Select all pending events for that aggregate where `version >= V`, ordered by `version DESC`.
2. Shift versions **up by 1** (to avoid intra-set collisions):
   - for each pending row: `version = version + 1`.
3. For each shifted pending event:
   - decrypt the payload using the aggregate key and AAD with `{ aggregateId, eventType, oldVersion }`;
   - re-encrypt the same plaintext using AAD with `{ aggregateId, eventType, newVersion }`;
   - update the `events` row: `version = newVersion`, `payload_encrypted = newCiphertext`.
4. Delete any `snapshots` row for the aggregate (snapshots are derived state; version shifts invalidate them).

This rewrite is **retry-driven**: if a later remote insert collides again (e.g. because multiple remote events for the same aggregate arrive), we repeat the shift from the new collision point until all missing remote events can be persisted.

**Retry contract (critical)**:

- After any pending rewrite, the subsequent push retry MUST re-read pending events from SQLite (not reuse a pre-rewrite in-memory pending snapshot), otherwise it may push stale per-aggregate `version` values and re-trigger collisions on other devices.

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
  - Persist remote events without `OR IGNORE` (never drop facts silently).
  - On `(aggregate_type, aggregate_id, version)` collision:
    - if the colliding local row is **pending**, invoke a `PendingVersionRewriterPort` and retry the insert;
    - if the colliding local row is **synced**, treat as a bug (synced immutability violation).
- Implement pending rewrite behind a port:
  - sync-engine owns the **policy**: detect collisions, decide when to rewrite, bound retries.
  - infrastructure owns the **mechanism**: decrypt + re-encrypt with new AAD; update rows atomically.

## Testing

Add unit tests that simulate the collision directly (since it’s a persistence-layer constraint):

- enforce `UNIQUE (aggregate_type, aggregate_id, version)` in the test DB;
- create a local pending event at `(aggregate_type, aggregate_id, version=V)`;
- apply a remote event at the same `(aggregate_type, aggregate_id, version=V)` but different `eventId`;
- assert:
  - the engine triggers a pending rewrite and persists the remote event (no silent drop),
  - the pending row’s `version` shifts and its ciphertext is updated to match new AAD.

## Code pointers

- `packages/sync-engine/src/SyncEngine.ts`
- `packages/eventstore-web/src/worker/schema.ts`
- `packages/infrastructure/src/eventing/aad.ts`

## Open questions

- [ ] Should pending rewrite be applied proactively (pre-apply) when we detect `server_ahead`, or only reactively on collision?
- [ ] Should we add an explicit “rewrite happened” telemetry/diagnostic event (for debugging rare collisions)?
