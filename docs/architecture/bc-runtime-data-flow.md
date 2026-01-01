# BC runtime data flow (Mermaid)

**Scope**: One canonical data-flow diagram showing how a bounded context processes events end-to-end.
**Non-goals**: Exhaustive diagrams for every BC; this is an example/template diagram.
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Invariants

This doc does not define new invariants. It relies on the invariant registry in `docs/invariants.md`.

## Details

This is the canonical “event-sourced BC pipeline” diagram (example instantiation: Goals BC).

```mermaid
flowchart TB

  subgraph WebApp["apps/web (React)"]
    UI["UI (screens/components)"]
    BackupUI["Backup/Restore UI"]
  end

  subgraph Presentation["Presentation adapters"]
    CmdAPI["Command hooks"]
    QryAPI["Query hooks"]
  end

  subgraph Application["Application layer"]
    CmdBus["Command Bus"]
    QryBus["Query Bus"]
    CmdHandlers["Command handlers"]
    QryHandlers["Query handlers"]
    EventBus["EventBusPort"]
    Saga["GoalAchievementSaga"]
  end

  subgraph Domain["Domain layer"]
    Aggregates["Aggregates"]
    DomainEvents["Domain events"]
  end

  subgraph Infrastructure["Infrastructure (browser)"]
    Repos["Repositories (Goals/Projects)"]
    EventStore["SqliteEventStore"]
    ToEncrypted["DomainToEncryptedEventAdapter"]
    ToDomain["EncryptedEventToDomainAdapter"]
    Crypto["WebCryptoService"]
    KeyStore["IndexedDBKeyStore"]
    Keyring["KeyringManager"]
    Projections["ProjectionRuntime + processors"]
    Publisher["CommittedEventPublisher"]
    SagaStore["SqliteGoalAchievementSagaStore"]
  end

  subgraph Substrate["Platform substrate"]
    DbClient["SqliteDbPort client"]
    DbOwner["DB owner worker (SharedWorker default)"]
    Sqlite["wa-sqlite + AccessHandlePoolVFS (OPFS)"]
  end

  subgraph LocalDb["OPFS SQLite (mo-eventstore-<storeId>.db)"]
    Events[(events)]
    SyncMap[(sync_event_map)]
    Snapshots[(snapshots)]
    ProjMeta[(projection_meta)]
    ProjCache[(projection_cache)]
    IndexArtifacts[(index_artifacts)]
    PMState[(process_manager_state)]
    Idem[(idempotency_keys)]
    SyncMeta[(sync_meta)]
  end

  subgraph Sync["Sync"]
    SyncEngine["SyncEngine"]
    Transport["HttpSyncTransport"]
  end

  subgraph Server["apps/api sync (NestJS + Postgres)"]
    SyncController["/sync controller"]
    SyncService["SyncService"]
    SyncEvents[(sync.events)]
    SyncStores[(sync.stores)]
  end

  UI --> CmdAPI --> CmdBus --> CmdHandlers --> Aggregates --> DomainEvents
  UI --> QryAPI --> QryBus --> QryHandlers

  CmdHandlers --> Repos
  Repos --> ToEncrypted --> Crypto
  Repos --> Keyring --> Crypto
  Repos --> KeyStore
  Repos --> EventStore --> DbClient

  QryHandlers --> Projections
  Projections --> DbClient
  Publisher --> DbClient
  Publisher --> ToDomain --> Crypto
  Publisher --> Keyring
  Publisher --> EventBus --> Saga
  Saga --> SagaStore --> DbClient
  Saga --> CmdBus

  DbClient <--> DbOwner <--> Sqlite <--> LocalDb

  SyncEngine --> DbClient
  SyncEngine --> Transport --> SyncController --> SyncService
  SyncService --> SyncEvents
  SyncService --> SyncStores
```

Notes:

- Source of truth for `GoalEventType` strings: `packages/domain/src/goals/events/eventTypes.ts`.

## Code Pointers

- `apps/web/src/bootstrap/createAppServices.ts` — concrete wiring of the pipeline

## Open Questions

- [ ] Keep this diagram aligned with the actual wiring in `apps/web` as contexts expand.
