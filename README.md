# MO Local

## Overview

MO Local is a local-first POC (Goals + Projects BCs) that combines a DDD/CQRS domain model with LiveStore-backed persistence and per-aggregate encryption. The repo is a Yarn workspaces monorepo:

- **apps/web** – React + Vite client with onboarding, unlock, goals/projects dashboards (tabs, FTS search, per-goal/project modals, milestones), and key backup/restoration flows. Hosts the composition root.
- **packages/domain** – Pure TypeScript domain for Goals (Balanced Wheel), Projects, and Identity (aggregates, value objects, fluent assertions).
- **packages/application** – CQRS primitives (commands, handlers, buses), per-BC ports (`GoalRepositoryPort`, `GoalReadModelPort`, `ProjectRepositoryPort`, `ProjectReadModelPort`), and identity commands.
- **packages/infrastructure** – LiveStore schema/adapters, crypto services (WebCrypto + Node), IndexedDB key store, per-BC repositories/projections, and wiring.
- **packages/presentation** – React-facing context + hooks for Goals/Projects over command/query buses and projection ports.
- **apps/api** – NestJS backend (Kysely, Kratos session guard, `/health`, `/me`, `/auth/*`, Access BC migrations, and a LiveStore sync backend with `/sync/push` + `/sync/pull` persisting into `sync.events` / `sync.stores`).

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

- **LiveStore store**: `packages/infrastructure/src/goals/schema.ts` defines the SQLite schema shared by Goals and Projects (`goal_events`, `project_events`, `*_snapshots`, projection meta, analytics, search). `apps/web` mounts it via an OPFS-backed adapter and a shared worker.
- **Goal domain**: `Goal` aggregate emits immutable events (`GoalCreated`, `GoalRefined`, `GoalRecategorized`, `GoalRescheduled`, `GoalPrioritized`, …). Value objects (Slice, Priority, Month, Summary) enforce invariants via `Assert`.
- **Project domain**: `Project` aggregate models day-precision timelines with milestones and optional goal linkage; value objects capture name/status/date/description/goal/milestone semantics.
- **Application layer**: per-BC command handlers (`GoalCommandHandler`, `ProjectCommandHandler`, `UserCommandHandler`) operate on simple command DTOs, materialize value objects, and persist encrypted events through repositories implementing shared `Repository` ports.
- **Encryption**: Each goal gets its own symmetric key (`K_goal`). Keys are stored in `IndexedDBKeyStore`, wrapped with a passphrase-derived KEK (PBKDF2 600k iterations). WebCrypto handles encryption, signing, and ECIES wrapping utilities for future sharing flows.
- **Serialization + sync contract**: domain payloads are encrypted, but LiveStore sync events are `event.v1` and must be byte-preserved server-side (`sync.events.args` is stored as TEXT JSON, not `jsonb`).
- **React wiring**:
  - `createAppServices` (`apps/web/src/bootstrap/createAppServices.ts`) is the app-level composition root: it wires LiveStore, per-BC event stores, crypto, key store, event bus, and BC bootstraps (`bootstrapGoalBoundedContext`, `bootstrapProjectBoundedContext`).
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

OPFS/LiveStore data lives under your browser profile (store id `mo-local`). To force a clean slate you can clear the browser's "Site Data" for the dev origin.

## Testing & Quality

- `yarn test` runs unit tests (Vitest) in workspaces (domain/application/infrastructure/presentation/web + API unit subset).
- `yarn test:integration` runs API integration tests (requires the dev stack).
- `yarn e2e` runs Playwright against the running dev stack.
- `yarn lint` + `yarn typecheck` ensure the flat ESLint config and TypeScript stay clean.
- `yarn format:check`/`yarn format` keep Markdown/TS/TSX/JSON formatted via Prettier.
- API auth/guard coverage lives in `apps/api/src/__tests__/access/auth.e2e.test.ts` (Vitest + Supertest, using in-memory Kratos fakes).

## Troubleshooting

- **LiveStore init errors**: Watch the in-app debug panel (DEV only) for OPFS availability, table counts, or adapter issues.
- **Missing keys**: If LiveStore still holds encrypted events but the keystore was cleared, goal projections will log warnings until you restore keys from backup.
- **Safari quirks**: The bundled shared worker is required for OPFS persistence—ensure the page is served over `localhost` and not a file:// URL.

## Documentation

- `docs/architecture.md` – long-lived architecture reference (layers + key decisions/ADRs).
- `goals-poc-prd-v2.md` – product/workflow PRD (temporary; will be retired as the architecture doc becomes the source of truth).
