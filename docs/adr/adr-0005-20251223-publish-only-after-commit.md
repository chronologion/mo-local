# ADR ALC-301-06 — Publish only after commit

**Status**: Accepted
**Linear**: ALC-301
**Created**: 2025-12-23
**Last Updated**: 2026-01-01

- **Context**: Publishing “pending events” risks phantom side effects if persistence fails or the app crashes mid-flight.
- **Decision**: Publish from a post-commit stream (`events` ordered by `commitSequence` with a persisted cursor).
- **Rationale**: Crash-safety and replayability.
- **Consequences**: Publication is eventually consistent and requires dedupe/checkpointing.
