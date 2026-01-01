# MO Local

## Overview

MO Local is a local-first POC (Goals + Projects BCs) that combines a DDD/CQRS domain model with an event-sourced local store (SQLite in OPFS) and client-side encryption. The repo is a Yarn workspaces monorepo:

- **apps/web** – React + Vite client with onboarding, unlock, goals/projects dashboards (tabs, FTS search, per-goal/project modals, milestones), and key backup/restoration flows. Hosts the composition root.
- **packages/domain** – Pure TypeScript domain for Goals (Balanced Wheel), Projects, and Identity (aggregates, value objects, fluent assertions).
- **packages/application** – CQRS primitives (commands, handlers, buses), per-BC ports (`GoalRepositoryPort`, `GoalReadModelPort`, `ProjectRepositoryPort`, `ProjectReadModelPort`), and identity commands.
- **packages/eventstore-core** – ordering/cursors and event store core types.
- **packages/eventstore-web** – OPFS SQLite adapter + DB owner worker (SharedWorker default; Worker fallback).
- **packages/sync-engine** – HTTP sync protocol client (push/pull, conflict handling, scheduling).
- **packages/infrastructure** – crypto services (WebCrypto + Node), IndexedDB key store, eventing/serialization runtime, repositories/projections, and wiring.
- **packages/presentation** – React-facing context + hooks for Goals/Projects over command/query buses and projection ports.
- **apps/api** – NestJS backend (Kysely, Kratos session guard, `/health`, `/me`, `/auth/*`, Access BC migrations, and the sync backend with `/sync/push` + `/sync/pull` persisting into `sync.events` / `sync.stores`).

Everything runs locally today; cloud auth + sync are implemented and optional, while sharing/invites are follow-up work.

## Getting Started

1. Install Node.js 20+ and Yarn 1.x.
2. Install dependencies: `yarn install`.
3. Start the web app: `yarn dev` (or `yarn workspace @mo/web dev`). Vite serves the UI at `http://localhost:5173`.
4. (Optional) Start the full Docker dev stack (Postgres + Kratos + API) with `yarn dev:stack` so cloud auth works end-to-end. See “Backend + Dev Stack” below for stop/logs/status helpers.
5. The first load walks through onboarding: pick a passphrase, generate identity keys, and land on the Goal dashboard.

### Development Scripts (root `package.json`)

| Command             | Description                                   |
| ------------------- | --------------------------------------------- |
| `yarn dev`          | Run the web client (`apps/web`).              |
| `yarn dev:api`      | Run the NestJS API (ts-node-dev + Kysely).    |
| `yarn build`        | Build all workspaces.                         |
| `yarn test`         | Run unit tests (Vitest) across packages/apps. |
| `yarn test:all`     | Run unit + integration + e2e.                 |
| `yarn lint`         | Lint `.ts/.tsx` files via flat ESLint config. |
| `yarn typecheck`    | Type-check every workspace.                   |
| `yarn format:check` | Ensure Prettier formatting.                   |

Inside `apps/web` you can also use the usual Vite commands (`yarn workspace @mo/web test`, `build`, etc.).

### Backend + Dev Stack (Docker + Kratos + Kysely)

- Fixed ports: Postgres `5434`, API `4000`, Web `5173`, Kratos public `4455`, Kratos admin `4434`.
- Bring the stack up/down/logs/status:
  - `yarn dev:stack`
  - `yarn dev:stack:stop`
  - `yarn dev:stack:logs`
  - `yarn dev:stack:status`
- These commands are thin wrappers over `scripts/dev-stack.sh`, which centralizes the `docker compose` incantation (project name, env plumbing, and common flags) so you get a single, consistent entrypoint instead of manually remembering long compose commands.
- Env template: copy `.env.example` → `.env` if you want to override `DATABASE_URL`, `KRATOS_PUBLIC_URL`, etc.
- Migrations (Kysely): `yarn db:migrate` / `yarn db:migrate:down` run the Access BC migrations (`apps/api/src/access/infrastructure/migrations/auth`, tracked in the `access_migrations` table; sync/events table is intentionally excluded here). Compose boot runs an idempotent `postgres-init` helper to create `mo_local` + `kratos` even on reused volumes.
- Auth: Kratos is wired as the identity provider; the API guard validates sessions via Kratos and upserts a row in `access.identities` on first request. Logout uses Kratos `DELETE /self-service/logout/api` with `session_token`.
- E2E (Playwright): `yarn e2e` (stack must be running; includes basic health checks for API/Kratos/Web).
- Web auth UI: after local onboarding/unlock, use “Connect to cloud” in the header to sign up or log in via Kratos (email + password). The API sets an HTTP-only `mo_session` cookie (no localStorage tokens); the web client always calls the API with `credentials: 'include'`. Validation errors from Kratos (e.g. invalid email, weak password, bad credentials) are surfaced inline in the modal; generic 400s on login are mapped to a friendly “Email or password is incorrect.” Configure Kratos origin with `VITE_AUTH_URL`.

### Goals & Projects UI

- **Navigation**: the main view exposes Goals and Projects as tabs in the app header. The layout keeps the header clean (no permanent dimmed overlay) and uses a compact tab switcher.
- **Goals**:
  - Dashboard shows cards with slice/priority, target month, and linked project badges (if any). Internal IDs are hidden from the main UI.
  - Create/edit flows use a dialog with a month picker for `targetMonth`, and a search box (FTS) aligned with the “New goal” button on desktop.
  - Key backup is available from the header (“Backup keys”) and opens a dialog that exports an encrypted key envelope; it does not include goal data.
- **Projects**:
  - Header has a consistent `Projects` title, FTS search input, “New project” button, and Refresh action on a single row (on desktop).
  - Project cards show the project name, optional linked goal, a date range badge (`startDate → targetDate`), and a status dropdown. Status changes dispatch commands inline; failures are surfaced via toasts.
  - Create/edit flows live in dialogs using a date picker; validation errors (including domain invariants) are shown inline above the button.
  - Milestones are listed per project, sorted by target date, with name (truncated), target date, and edit/archive icons on a single line. Adding a milestone opens a dialog; inline edits surface errors via toasts when the command fails.

## Key Concepts

- **Local event store (OPFS SQLite)**: the canonical local log lives in OPFS SQLite (`mo-eventstore-<storeId>.db`) and is owned by a DB worker (SharedWorker default; Worker fallback).
- **Goal domain**: `Goal` aggregate emits immutable events (`GoalCreated`, `GoalRefined`, `GoalRecategorized`, `GoalRescheduled`, `GoalPrioritized`, …). Value objects (Slice, Priority, Month, Summary) enforce invariants via `Assert`.
- **Project domain**: `Project` aggregate models day-precision timelines with milestones and optional goal linkage; value objects capture name/status/date/description/goal/milestone semantics.
- **Application layer**: per-BC command handlers (`GoalCommandHandler`, `ProjectCommandHandler`, `UserCommandHandler`) operate on simple command DTOs, materialize value objects, and persist encrypted events through repositories implementing shared `Repository` ports.
- **Encryption**: domain payloads and snapshots are encrypted client-side. Keys are stored encrypted at rest in IndexedDB under a passphrase-derived KEK; aggregate keys are backed up/restored via an encrypted key backup.
- **Serialization + sync contract**: the server stores sync records as `record_json` TEXT and returns them as-is; already-synced record bytes must be preserved under the current JS boundary.
- **React wiring**:
  - `createAppServices` (`apps/web/src/bootstrap/createAppServices.ts`) is the app-level composition root: it wires the local event store, crypto, key store, event bus, and BC bootstraps (`bootstrapGoalBoundedContext`, `bootstrapProjectBoundedContext`).
  - `AppProvider` bootstraps `createAppServices`, drives onboarding/unlock state, and wraps the interface layer.
  - `packages/presentation` exposes `InterfaceProvider` and hooks such as `useGoals`, `useGoalById`, `useGoalSearch`, `useGoalCommands`, `useProjects`, `useProjectCommands` over per-BC command/query buses + projection ports.

## Working With Data

- **Onboarding**: When `localStorage['mo-local-user']` is absent we generate a new userId (UUIDv7), derive a KEK from the chosen passphrase using a random per-user salt (stored in metadata/backups), create signing/encryption keypairs, and encrypt them into IndexedDB.
- **Unlocking**: Derive the same KEK from the stored metadata, decrypt the identity keys, and unlock the dashboard.
- **Goal & Project CRUD**: Interface hooks dispatch typed commands onto per-BC command buses. Command handlers materialize value objects, mutate aggregates, and append encrypted events to the BC event stores. Projection processors update snapshots/analytics/search and refresh in-memory read models consumed by queries (`useGoals`, `useProjects`, `useGoalSearch`).
- **Backups (keys only)**: `BackupModal` exports identity + per-goal keys, encrypts the JSON envelope with the current KEK (salt included), and presents a `.backup` blob for download/copy. It does **not** include goal data or events; until sync or log export exists, goals stay on the original device. Legacy backups without salt need existing metadata and are rewrapped to a random salt during unlock/restore.

### Resetting the environment

If you need to wipe local credentials:

```
indexedDB.deleteDatabase('mo-local-keys');
localStorage.removeItem('mo-local-user');
```

Then reload, onboard with a new passphrase, and optionally import a backup.

OPFS data lives under your browser profile. To force a clean slate you can clear the browser’s “Site Data” for the dev origin, or use the in-app reset tooling (DEV).

## Testing & Quality

- `yarn test` runs unit tests (Vitest) in workspaces (domain/application/infrastructure/presentation/web + API unit subset).
- `yarn test:integration` runs API integration tests (requires the dev stack).
- `yarn e2e` runs Playwright against the running dev stack.
- `yarn lint` + `yarn typecheck` ensure the flat ESLint config and TypeScript stay clean.
- `yarn format:check`/`yarn format` keep Markdown/TS/TSX/JSON formatted via Prettier.
- API auth/guard coverage lives in `apps/api/src/__tests__/access/auth.e2e.test.ts` (Vitest + Supertest, using in-memory Kratos fakes).

## Troubleshooting

- **Event store init errors**: Watch the in-app debug panel (DEV only) for OPFS availability, table counts, or adapter issues.
- **Missing keys**: If OPFS still holds encrypted events but the keystore was cleared, projections will fail to decrypt until you restore keys from backup.
- **Safari quirks**: Ensure you are not in Private Browsing (OPFS can be unavailable) and the page is served from `localhost`/HTTPS (secure context).

## Documentation

- `docs/README.md` – documentation strategy and process.
- `docs/architecture.md` – architecture overview (layers + topic docs).
- `docs/security.md` – security model overview.
- `docs/adr/` / `docs/rfcs/` – decisions and proposals.
