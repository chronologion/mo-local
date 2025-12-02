# MO Local

## Overview
MO Local is a local-first Goals POC that combines a DDD/CQRS domain model with LiveStore-backed persistence and per-aggregate encryption. The repo is a Yarn workspaces monorepo:

- **apps/web** – React + Vite client with onboarding, unlock, goal dashboard, and key backup/restoration flows.
- **packages/domain** – Pure TypeScript Balanced Wheel domain (Goal aggregate, value objects, fluent assertions).
- **packages/application** – Command validation, handlers, ports, and in-memory/test doubles.
- **packages/infrastructure** – LiveStore adapters, crypto services (WebCrypto + Node), IndexedDB key store, and browser wiring.
- **apps/api** – Placeholder for the future NestJS backend (not yet implemented).

Everything runs locally today; sync + sharing + backend APIs are tracked as follow-up work.

## Getting Started
1. Install Node.js 20+ and Yarn 1.x.
2. Install dependencies: `yarn install`.
3. Start the web app: `yarn dev` (or `yarn workspace @mo/web dev`). Vite serves the UI at `http://localhost:5173`.
4. The first load walks through onboarding: pick a passphrase, generate identity keys, and land on the Goal dashboard.

### Development Scripts (root `package.json`)
| Command | Description |
| --- | --- |
| `yarn dev` | Run the web client (`apps/web`). |
| `yarn dev:api` | Placeholder for the future NestJS server. |
| `yarn build` | Build all workspaces. |
| `yarn test` | Run Vitest suites across all packages/apps. |
| `yarn lint` | Lint `.ts/.tsx` files via flat ESLint config. |
| `yarn typecheck` | Type-check every workspace. |
| `yarn format:check` | Ensure Prettier formatting. |

Inside `apps/web` you can also use the usual Vite commands (`yarn workspace @mo/web test`, `build`, etc.).

## Key Concepts
- **LiveStore event log**: `packages/infrastructure` defines the SQLite schema (`goal_events`) and browser adapters. `apps/web` mounts it through `makePersistedAdapter` (OPFS storage + shared worker).
- **Goal domain**: `Goal` aggregate emits events (`GoalCreated`, `GoalSummaryChanged`, etc.). Value objects (Slice, Priority, Month, Summary) enforce invariants via `Assert`.
- **Application layer**: `GoalApplicationService` validates incoming commands, dispatches to `GoalCommandHandler`, and persists encrypted events through the repository.
- **Encryption**: Each goal gets its own symmetric key (`K_goal`). Keys are stored in `IndexedDBKeyStore`, wrapped with a passphrase-derived KEK (PBKDF2 600k iterations). WebCrypto handles encryption, signing, and ECIES wrapping utilities for future sharing flows.
- **React wiring**: `AppProvider` bootstraps services, drives onboarding/unlock state, exposes `goalService` + `goalQueries`, and renders `GoalDashboard` + `BackupModal`.

## Working With Data
- **Onboarding**: When `localStorage['mo-local-user']` is absent we generate a new userId (UUIDv7), derive a KEK from the chosen passphrase, create signing/encryption keypairs, and encrypt them into IndexedDB.
- **Unlocking**: Derive the same KEK from the stored metadata, decrypt the identity keys, and unlock the dashboard.
- **Goal CRUD**: Hooks in `apps/web/src/hooks` call `goalService.handle({...})`, which appends encrypted events to LiveStore. `useGoals` reconstructs projections by decrypting per-aggregate event streams.
- **Backups**: `BackupModal` exports identity + aggregate keys, encrypts the JSON envelope with the current KEK, and presents a `.backup` blob that can be downloaded or copied. Restoring happens inside the onboarding screen via file upload + passphrase.

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
- `docs/materializer-plan.md` – plan for adding LiveStore materialized tables once we leave event-log replay behind.
