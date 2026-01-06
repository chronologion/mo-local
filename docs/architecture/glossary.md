# Glossary (terminology we must keep consistent)

**Scope**: Canonical definitions for terms used across the architecture and security docs.
**Non-goals**: Normative design decisions; this is a vocabulary reference, not a spec.
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-06

## Invariants

This doc does not define new invariants. It relies on the invariant registry in `docs/invariants.md`.

## Details

### DDD + CQRS + ES vocabulary

- **bounded context (BC)**: a domain boundary with its own model and ubiquitous language (e.g. Goals, Projects).
- **aggregate / aggregate root**: consistency boundary that enforces invariants and emits domain events.
- **entity**: domain object with identity and lifecycle inside an aggregate.
- **value object (VO)**: immutable domain value with validation and equality semantics.
- **domain event**: immutable fact emitted by an aggregate (typed by `eventType`).
- **command**: intent to change state (data-only). Handled by a command handler.
- **query**: request to read state (data-only). Handled by a query handler.
- **handler**: orchestration logic that loads state via ports, enforces rules, and persists/appends events (for commands) or reads projections/read models (for queries).
- **repository (port/adapter)**: application-facing interface for loading/saving aggregates; implemented in infrastructure.
- **event log**: append-only persistence of encrypted event payloads (`events` table).
- **snapshot**: encrypted “document blob” representing aggregate state at a point in time (`snapshots` table).
- **projection / derived state**: rebuildable read-optimized state (projection cache + index artifacts + projection meta).
- **read model**: application-facing read API backed by projections (never reads encrypted event payload tables directly).
- **process manager / saga**: cross-BC coordinator that reacts to committed events and dispatches commands; must be idempotent and reconcilable under rebase.

### Concurrency + ordering

- **knownVersion**: optimistic concurrency precondition supplied by the UI for commands (“I edited version N”).
- **version**: per-aggregate monotonically increasing event version used for local OCC and ciphertext AAD binding.
- **commitSequence**: local durable commit order (`events.commit_sequence`) assigned on insert.
- **globalSequence**: server-assigned monotonically increasing ordering for a store’s sync stream; persisted locally via `sync_event_map`.
- **pending event**: local event log row that has no `sync_event_map` mapping yet (not assigned a `globalSequence`).
- **head**: server’s latest `globalSequence` for a `(owner_identity_id, store_id)` stream.
- **effectiveTotalOrder**: deterministic derived-state ordering: first `globalSequence` (synced region), then `pendingCommitSequence` (local-only region).
- **causationId / correlationId**: tracing identifiers for causality and request grouping. They are **not clocks** and MUST NOT be used to define replay order.
- **rebase (sync)**: remote events inserted while local pending exists; derived state is reset/rebuilt deterministically, then push is retried.
- **fast-forward**: apply missing remote events to catch up to server head before pushing.

### Runtime + storage

- **OPFS**: Origin Private File System; used for durable local SQLite storage in the browser.
- **VFS**: virtual filesystem used by wa-sqlite; we use `AccessHandlePoolVFS` under an OPFS directory namespace.
- **SharedWorker DB owner**: default single-writer worker serving multiple tabs.
- **Dedicated worker fallback**: per-tab worker used when SharedWorker is unavailable; guarded by Web Locks.
- **table invalidation**: table-level change signal (via `subscribeToTables`) used to schedule projections and sync.

### Crypto + ZK encryption boundary

In this repo, “ZK encryption” means: **the server can store/relay/synchronize encrypted payloads without the ability to decrypt them** (because it never has the user’s keys). Practically: encryption happens on the user’s device before payloads ever leave the endpoint (an E2EE-style model).

This does **not** imply full metadata privacy. The server can still learn sync metadata (request timing, sizes, access patterns, and stream ordering like `globalSequence`).

- **master key / KEK**: passphrase-derived key used to encrypt keys at rest (IndexedDB).
- **DEK / aggregate key**: per-aggregate symmetric key used to encrypt event payloads and snapshots.
- **AAD**: AES-GCM additional authenticated data binding ciphertext integrity to selected plaintext metadata (e.g. `{aggregateType, aggregateId, version}`).
- **payloadVersion**: schema version for an event payload inside the encrypted envelope.
- **byte-preservation**: a boundary contract that serialized payload bytes must remain stable for already-synced events (see `docs/architecture/infrastructure-layer.md`).

## Code Pointers

- `packages/eventstore-core/src/**` — ordering/cursor types

## Open Questions

- [ ] Decide where security glossary terms live (here vs `docs/security.md`) and keep one canonical list.
