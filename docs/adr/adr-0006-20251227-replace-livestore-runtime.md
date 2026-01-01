# ADR ALC-307-01 — Replace LiveStore runtime with MO EventStore + Sync Engine (Shipped)

**Status**: Accepted
**Linear**: ALC-307
**Created**: 2025-12-27
**Last Updated**: 2026-01-01

- **Reference**: ALC-307 and its sub-issues (PRs #24–#33), plus OPFS hardening in ALC-329 (PR #34).
- **Context**: LiveStore’s leader/session/rebase semantics have repeatedly conflicted with our durability + projection cursor requirements (e.g., non-durable `store.query(...)` writes and rebase-driven cursor divergence; see ALC-306). LiveStore also couples durability, reactivity, and sync semantics in ways that are structurally at odds with our E2EE constraint (ciphertext bytes must remain opaque and keys cannot be required “inside DB execution”). React Native support is also not currently covered by LiveStore in a way we want to rely on.
- **Decision**: Replace LiveStore with a platform substrate composed of:
  - `@mo/eventstore-core` (pure types + cursor/order helpers),
  - `@mo/eventstore-web` (OPFS SQLite runtime: worker-owned DB + `SqliteDbPort` + table invalidations),
  - `@mo/sync-engine` (explicit pull/push loop + conflict handling + `onRebaseRequired` trigger),
  - a derived-state runtime in infrastructure (`ProjectionRuntime`, snapshot/index/cache stores) that is eventually consistent and rebuildable under an explicit rebase trigger.

- **Rationale**: Make durability, ordering/cursoring, and rebase behavior explicit and testable; remove hidden rollback semantics; enforce separation of concerns so the substrate can remain reusable while product policies stay in the application/infrastructure composition roots.
- **Consequences**:
  - Infrastructure migrated from LiveStore’s `Store.commit/query/subscribe` to worker-friendly async DB calls + table invalidation.
  - Sync endpoints moved to the replacement contract (server-assigned ordering + idempotent events + base64url ciphertext bytes).
  - Projections/sagas are explicitly rebuildable/reconcilable under rebase (`onRebaseRequired`).
  - React Native support remains a planned future adapter; Domain/Application contracts remain platform-agnostic.
