# ADR ALC-326-01 — Sync scheduling is reactive but bounded

**Status**: Accepted
**Linear**: ALC-326
**Created**: 2025-12-31
**Last Updated**: 2026-01-01

- **Context**: Naive polling and event-driven triggering can create pull storms or delayed pushes.
- **Decision**: `SyncEngine` uses single in-flight pull/push, long-poll pull (`waitMs`), debounced push signals from `events` invalidation, and backoff gating with a low-frequency fallback push interval.
