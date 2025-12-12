# MO Local

## Overview

MO Local is a local-first POC (Goals + Projects BCs) that combines a DDD/CQRS domain model with LiveStore-backed persistence and per-aggregate encryption. The repo is a Yarn workspaces monorepo:

- **apps/web** – React + Vite client with onboarding, unlock, goals/projects dashboards, and key backup/restoration flows. Hosts the composition root.
- **packages/domain** – Pure TypeScript domain for Goals (Balanced Wheel), Projects, and Identity (aggregates, value objects, fluent assertions).
- **packages/application** – CQRS primitives (commands, handlers, buses), per-BC ports (`IGoalRepository`, `IGoalReadModel`, `IProjectRepository`, `IProjectReadModel`), and identity commands.
- **packages/infrastructure** – LiveStore schema/adapters, crypto services (WebCrypto + Node), IndexedDB key store, per-BC repositories/projections, and wiring.
- **packages/interface** – React-facing context + hooks for Goals/Projects over command/query buses and projection ports.
- **apps/api** – NestJS backend bootstrap (Kysely, Kratos auth guard, `/health`, `/me`, migrations for `users` and `invites`; sync/events table is handled in a separate issue).

Everything runs locally today; sync + sharing + backend APIs are tracked as follow-up work.

## Getting Started

1. Install Node.js 20+ and Yarn 1.x.
2. Install dependencies: `yarn install`.
3. Start the web app: `yarn dev` (or `yarn workspace @mo/web dev`). Vite serves the UI at `http://localhost:5173`.
4. The first load walks through onboarding: pick a passphrase, generate identity keys, and land on the Goal dashboard.

### Development Scripts (root `package.json`)

| Command             | Description                                   |
| ------------------- | --------------------------------------------- |
| `yarn dev`          | Run the web client (`apps/web`).              |
| `yarn dev:api`      | Placeholder for the future NestJS server.     |
| `yarn build`        | Build all workspaces.                         |
| `yarn test`         | Run Vitest suites across all packages/apps.   |
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
- Env template: copy `.env.example` → `.env` if you want to override `DATABASE_URL`, `KRATOS_PUBLIC_URL`, etc.
- Migrations (Kysely): `yarn db:migrate` / `yarn db:migrate:down` (applies `users` + `invites`; sync/events table is intentionally excluded here).
- Auth: Kratos is wired as the identity provider; the API guard validates sessions via Kratos and upserts the `users` row on first request.
- E2E (Playwright): `yarn e2e` (stack must be running; includes basic health checks for API/Kratos/Web).

## Key Concepts

- **LiveStore store**: `packages/infrastructure/src/goals/schema.ts` defines the SQLite schema shared by Goals and Projects (`goal_events`, `project_events`, `*_snapshots`, projection meta, analytics, search). `apps/web` mounts it via an OPFS-backed adapter and a shared worker.
- **Goal domain**: `Goal` aggregate emits events (`GoalCreated`, `GoalSummaryChanged`, etc.). Value objects (Slice, Priority, Month, Summary) enforce invariants via `Assert`.
- **Project domain**: `Project` aggregate models day-precision timelines with milestones and optional goal linkage; value objects capture name/status/date/description/goal/milestone semantics.
- **Application layer**: per-BC command handlers (`GoalCommandHandler`, `ProjectCommandHandler`, `UserCommandHandler`) operate on simple command DTOs, materialize value objects, and persist encrypted events through repositories implementing shared `Repository` ports.
- **Encryption**: Each goal gets its own symmetric key (`K_goal`). Keys are stored in `IndexedDBKeyStore`, wrapped with a passphrase-derived KEK (PBKDF2 600k iterations). WebCrypto handles encryption, signing, and ECIES wrapping utilities for future sharing flows.
- **React wiring**:
  - `createAppServices` (`apps/web/src/bootstrap/createAppServices.ts`) is the app-level composition root: it wires LiveStore, per-BC event stores, crypto, key store, event bus, and BC bootstraps (`bootstrapGoalBoundedContext`, `bootstrapProjectBoundedContext`).
  - `AppProvider` bootstraps `createAppServices`, drives onboarding/unlock state, and wraps the interface layer.
  - `packages/interface` exposes `InterfaceProvider` and hooks such as `useGoals`, `useGoalById`, `useGoalSearch`, `useGoalCommands`, `useProjects`, `useProjectCommands` over per-BC command/query buses + projection ports.

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

- `yarn test` runs Vitest suites in every workspace (domain/application/infrastructure/web).
- `yarn lint` + `yarn typecheck` ensure the flat ESLint config and TypeScript stay clean.
- `yarn format:check`/`yarn format` keep Markdown/TS/TSX/JSON formatted via Prettier.

## Troubleshooting

- **LiveStore init errors**: Watch the in-app debug panel (DEV only) for OPFS availability, table counts, or adapter issues.
- **Missing keys**: If LiveStore still holds encrypted events but the keystore was cleared, goal projections will log warnings until you restore keys from backup.
- **Safari quirks**: The bundled shared worker is required for OPFS persistence—ensure the page is served over `localhost` and not a file:// URL.

## Documentation

- `goals-poc-prd-v2.md` – up-to-date PRD with architecture, flows, and open risks.
- Projection/runtime notes live in `goals-poc-prd-v2.md` (worker-based projections, snapshots, analytics).
