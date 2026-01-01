# ADR ALC-314-01 — Derived state uses `effectiveTotalOrder` + explicit rebuild

**Status**: Accepted
**Linear**: ALC-314
**Created**: 2025-12-29
**Last Updated**: 2026-01-01

- **Context**: Remote events can be inserted “before” local pending commits in server order. Derived state must converge deterministically without hidden rollback semantics.
- **Decision**: Derived state that must converge under sync uses `effectiveTotalOrder` (join `events` to `sync_event_map` and order by `globalSequence` then `commitSequence`). When remote arrives while pending exists, `SyncEngine` triggers `onRebaseRequired()` and projections reset/rebuild.
- **Rationale**: Deterministic convergence and debuggable failure recovery.
- **Decision (MVP)**: `effectiveTotalOrder` remains a **sequence-based deterministic replay order**.
  - We do **not** attempt to topologically sort events using `causationId` / `correlationId`.
  - Rationale: those fields are tracing identifiers, may reference unseen events, and do not define a total order.
