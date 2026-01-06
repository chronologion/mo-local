# Serialization, event specs, and versioning (ALC-301)

**Scope**: How domain events/snapshots are serialized, versioned, and kept stable across local persistence and sync.
**Non-goals**: Cross-language canonical encoding guarantees (future work); detailed crypto key management (see security docs).
**Status**: Living
**Linear**: ALC-334 (ALC-301)
**Created**: 2026-01-01
**Last Updated**: 2026-01-06

## Invariants

This doc does not define invariants. It relies on the invariant registry in `docs/invariants.md`.

Relevant invariants:

- `INV-004` — Sync record bytes are preserved
- `INV-001` — Synced events are immutable
- `INV-013` — Integrity binding via AES-GCM AAD

## Why this exists

Serialization is a critical foundation concern because it affects:

- local durability (OPFS SQLite bytes),
- sync determinism (byte preservation),
- crypto integrity (AAD binding), and
- long-term schema evolution (payload versioning/upcasting).

## Design overview

### Domain is “latest-only”

The domain defines the **latest semantic shape** for each event type and does not embed versioning logic.

The domain provides a mapping spec that tells the runtime how to convert:

- Value Objects (VOs) ↔ JSON primitives,
- “latest payload” ↔ persisted payload envelope (owned by infrastructure runtime).

### `PayloadEventSpec` (the central artifact)

Each domain event exports a `PayloadEventSpec` describing:

- event type identifier,
- payload fields and VO mapping,
- how to encode the latest payload to primitives,
- how to decode primitives back into the latest VO-based domain payload.

This is the bridge between:

- the domain’s “no primitives obsession” (VOs everywhere), and
- the persistence boundary (JSON primitives on disk/wire).

### Runtime registry (infrastructure-owned)

The infrastructure eventing runtime maintains a registry of all event specs and is responsible for:

- encoding domain events into a persisted envelope,
- decoding persisted envelopes back into domain events,
- performing upcasts when payload versions change,
- ensuring stable bytes for already-synced events under the current boundary.

## Persisted payload envelope (conceptual)

Persisted events use a versioned envelope that includes:

- `envelopeVersion`
- `meta` (`eventId`, `eventType`, `occurredAt`, `actorId`, tracing ids)
- `payloadVersion` (schema evolution marker)
- `payload` (JSON-serializable primitives)

This envelope is then:

- JSON-stringified for bytes (TextEncoder),
- encrypted and integrity-protected (AES‑GCM with AAD),
- stored locally and synced as ciphertext.

## Versioning and upcasting model

### When to bump `payloadVersion`

Bump `payloadVersion` when persisted payload primitives change incompatibly:

- field renamed/removed/added without defaults,
- meaning changes that cannot be interpreted safely as “latest”.

### Where upcasting lives

Upcasting is an **infrastructure concern**:

- Domain stays latest-only.
- Infrastructure provides upcast steps `vN → vN+1` until the latest version.

This keeps:

- domain events simple and stable,
- versioning logic localized and testable,
- storage/sync compatibility explicit.

### What cannot change for synced events

Already-synced events are immutable facts (`INV-001`). Under the current JS boundary, we also preserve the serialized record bytes (`INV-004`) by storing/returning `record_json` as TEXT on the server.

This means:

- We can add readers (upcasters) for old versions.
- We must not rewrite historical synced records “in place”.

## Testing requirements (high leverage)

Minimum contracts we maintain:

- Roundtrip stability for the payload envelope encode/decode pipeline.
- Registry completeness (all event types registered).
- Upcast correctness (fixtures for old versions).

See `docs/architecture/testing-strategy.md`.

Operational playbook:

- `docs/runbooks/payload-version-bump.md`

## Code pointers

- `packages/domain/src/shared/eventSpec.ts` — `PayloadEventSpec` definition + helpers
- `packages/domain/src/**/events/*.ts` — per-event exported specs (e.g. `GoalCreatedSpec`)
- `packages/infrastructure/src/eventing/specs.generated.ts` — runtime registry input
- `packages/infrastructure/src/eventing/registry.ts` — registry wiring
- `packages/infrastructure/src/eventing/runtime.ts` — encode/decode entrypoints
- `packages/infrastructure/src/eventing/eventEnvelope.ts` — envelope bytes
- `packages/sync-engine/src/recordCodec.ts` — sync record encoding assumptions

## Open questions

- [ ] Decide whether to generate `specs.generated.ts` as part of the build (removing manual maintenance).
- [ ] Define the path to a cross-language canonical encoding (when we introduce non-JS clients).
- [ ] Keep envelope and sync-record versions stable and documented.
