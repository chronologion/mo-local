# Presentation layer (React)

**Scope**: Presentation adapters and boundaries between UI and the application layer (React UI, hooks, providers, delivery concerns).
**Non-goals**: Business rules (domain/application) and storage/sync/crypto details.
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Invariants

This doc does not define new invariants. It relies on the invariant registry in `docs/invariants.md`.

## Details

The presentation layer exists to keep UI code honest: it adapts UI needs to the Application layer without leaking Infrastructure concerns. It owns **delivery mechanics** (React state, rendering, UX flows), not business decisions.

### Responsibilities

- Render UI and manage view state (dialogs, forms, optimistic affordances).
- Adapt user intent into **commands** and **queries**.
- Subscribe to read models/projection ports and render derived state.
- Surface errors in a user-meaningful way (retryable vs fatal).
- Enforce security UX boundaries (locked vs unlocked; no leaking secrets via logs).

### Hard boundaries (what the UI must not do)

- Do not import/use SQLite, OPFS APIs, WebCrypto APIs, or worker internals from UI components.
- Do not embed domain rules in the UI (“if status is X then event Y”).
- Do not write to derived-state tables directly (projections are event-driven).

### How the UI calls the system (CQRS from React)

The UI should only depend on the Application layer via presentation adapters:

- Commands: invoke via command hooks/buses (data-only command objects).
- Queries: read via query hooks + read models/projection ports.

### Composition root vs presentation

The web app composition root (`apps/web`) wires ports to implementations and provides a typed “service surface” to React.

- Composition root: instantiate infrastructure (DB, key store, crypto, sync engine), handlers, and ports.
- Presentation: consume that surface through `packages/presentation` (context + hooks).

The point is to keep UI components stable even when infrastructure is swapped (e.g. LiveStore → OPFS event store).

### Error handling and conflict UX

The UI should treat some errors as expected control-flow:

- `ConcurrencyError` (local OCC): recover by reloading the aggregate/read model and letting the user retry.
- Missing keys / locked state: prompt unlock or restore keys; do not attempt to “work around” decryption failures.
- Sync failures: show status + retry/backoff behavior; do not block local usage on sync.

### Runtime-unit awareness (browser + worker)

The UI thread is not the DB owner. Long-running or IO-heavy work should stay in workers; the UI interacts via ports/adapters and shows progress.

### Testing expectations

- UI component tests should focus on intent → command dispatch and rendering of read-model state.
- End-to-end workflows (unlock, offline edits, rebase, rebuild projections) belong in Playwright e2e.

See: `docs/architecture/testing-strategy.md`.

## Code Pointers

- `packages/presentation/src/**` — presentation adapters/hooks
- `apps/web/src/**` — UI + feature composition
- `apps/web/src/bootstrap/createAppServices.ts` — browser composition root wiring

## Open Questions

- [ ] Decide whether we need a small “UI state store” layer for cross-feature state (beyond React context + hooks).
