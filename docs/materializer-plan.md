# Materialized State Plan

We intentionally ship the POC without materialized `goals` and `goal_access` tables (see PRD §6.1–6.4). Queries currently rebuild projections from the `goal_events` log in `apps/web/src/services/GoalQueries.ts`.

**Trade-off:** Faster to deliver POC, acceptable for <100 goals, but read costs grow with event log size and make sync/writes harder to reason about.

**Plan before scaling:**

- Add LiveStore materializers to maintain `goals` and `goal_access` state tables alongside `goal_events`.
- Gate writes with version checks (already implemented in browser `LiveStoreEventStore`), and update queries to read from the materialized tables first.
- Backfill by replaying event log into new tables during migration.
- Add metrics/telemetry around projection lag and backoff/retry on materializer failures.
