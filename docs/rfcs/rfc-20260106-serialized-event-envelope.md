# RFC-20260106-serialized-event-envelope

**Status**: Draft
**Linear**: ALC-332
**Related**: ALC-302, ALC-305, ALC-269
**Created**: 2026-01-06
**Last Updated**: 2026-01-06

## Scope

Define the canonical, versioned event serialization envelopes across:

- local persistence (OPFS SQLite `events` table),
- sync transport (`SyncPushRequestV1`, `SyncPullResponseV1`), and
- server persistence (`record_json`).

The RFC explicitly defines the plaintext vs ciphertext split, integrity binding rules, and byte canonicalization requirements.

## Non-goals

- Implementing the change (tracked in follow-ups once the RFC is accepted).
- Solving timing/size/access-pattern leakage (out of scope for the POC).
- Introducing new crypto primitives beyond the existing AES-GCM boundary.

## Problem

The current sync record is a near-mirror of the local OPFS row shape. As a result, the server sees plaintext metadata that it does not need for sync mechanics (notably `eventType` and `occurredAt`). This conflicts with our security posture (`ALC-269`) and the explicit requirement to keep event descriptors and client timestamps out of server-visible metadata.

Additionally, the encryption integrity binding (AAD) is currently tied to `{aggregateId, eventType, version}`. This hard-codes a dependence on plaintext `eventType`, making it difficult to remove `eventType` from the sync record without rethinking the envelope and AAD scheme.

### Folding `ALC-305` into this RFC: UUIDv7 timestamp leakage

Even after removing `eventType` and `occurredAt`, the server would still see plaintext identifiers such as:

- `storeId` (sync partition key),
- `eventId` (idempotency key), and
- `aggregateId` (routing/keying).

Today these are UUIDv7 in many places, which encode time. This leaks client activity timing to the server (and to any observer of server logs/DB) even if we keep client timestamps encrypted.

Therefore, we fold `ALC-305` into this RFC: **as part of the same breaking change, all newly generated UUIDs MUST be UUIDv4** (no embedded time). Ordering must never rely on lexicographic ID sort; it must use explicit orderings (`commitSequence`, `globalSequence`, and encrypted `occurredAt` for UX).

We need a canonical envelope spec that:

- decouples local row shape from sync/server shape,
- minimizes plaintext metadata leakage to the server,
- preserves byte stability for synced records (`INV-004`), and
- supports forward evolution (versioned envelopes).

**Important (early-stage posture)**: we intentionally do **not** carry backward compatibility for prior `record_json` shapes. This is an explicit breaking change: developers may need to reset local state and/or server sync tables during rollout.

## Proposed Solution

### 1) Define envelope layers (local, encrypted payload, sync record)

We explicitly separate three layers:

1. **Local event row (OPFS SQLite)**
   - Optimized for local querying, projections, and rebase.
   - Contains plaintext columns that are required locally (e.g., `event_type`, `occurred_at`).
   - This local row is not a sync contract.

2. **Encrypted event payload envelope**
   - The ciphertext stored in `payload_encrypted` is the encryption of a versioned envelope.
   - This envelope now carries event metadata that should not be visible to the server.

3. **Sync record envelope (record_json)**
   - Canonical, versioned sync record for server storage and transport.
   - Contains only the minimal plaintext fields required for sync mechanics.

### 2) Encrypted payload envelope (canonical)

We define a canonical encrypted payload envelope (versioned for forward evolution) that includes metadata we intend to keep off the server:

```
EventEnvelope = {
  envelopeVersion: 1,
  meta: {
    eventId: string,
    eventType: string,
    occurredAt: number,
    actorId: string | null,
    causationId: string | null,
    correlationId: string | null
  },
  payload: {
    payloadVersion: number,
    data: JsonValue
  }
}
```

Notes:

- `eventType` and `occurredAt` move into ciphertext.
- `actorId` and tracing fields (`causationId`, `correlationId`) also move into ciphertext unless required for sync mechanics.
- `payloadVersion` and `data` remain the domain payload envelope (no change in the domain event spec layer).
- `eventId` is included in ciphertext to allow clients to assert integrity against the sync transport envelope (see “eventId plaintext rationale” below).

Trade-off:

- This increases ciphertext size slightly (metadata moved into encrypted bytes). We accept this overhead for the security win; if it becomes a performance issue, we can revisit which fields must live inside ciphertext.

### 3) Sync record envelope (record_json) (canonical)

We define a canonical `record_json` schema that is explicitly decoupled from the local row shape:

```
SyncRecord = {
  recordVersion: 1,
  aggregateType: string,
  aggregateId: string,
  epoch: number | null,
  version: number,
  payloadCiphertext: string,   // base64url
  keyringUpdate: string | null // base64url
}
```

Key points:

- `eventType` and `occurredAt` are not present in plaintext.
- `eventId` is still transmitted separately in sync requests/responses and stored in the server row (for idempotency). It does not need to be duplicated in `record_json`.
- `epoch` remains plaintext to allow deterministic key selection before decryption (see “epoch selection” below).
- `aggregateType`, `aggregateId`, and `version` remain plaintext because they are required to compute AAD for decryption (see below).

#### Why `eventId` remains plaintext (rationale)

We keep `eventId` as a **plaintext sync transport/server column** because the server must support:

- idempotent inserts (“same event pushed twice”),
- mapping `eventId → globalSequence` assignments, and
- conflict detection without decrypting payloads.

Encrypting `eventId` would force the server to treat events as opaque blobs without a stable idempotency key, which breaks the current sync protocol mechanics.

However, clients still include `eventId` inside the encrypted `EventEnvelope.meta.eventId` so the materializer can assert:

- `EventEnvelope.meta.eventId === input.eventId`

This provides a cheap defense-in-depth check against record tampering or transport bugs.

#### Epoch selection (resolving the “circularity”)

We keep `epoch` plaintext in `SyncRecord` because key selection must happen *before* payload decryption:

1. Materializer parses `SyncRecord` → obtains `{aggregateId, epoch, version, payloadCiphertext, keyringUpdate}`.
2. If `keyringUpdate` is present, materializer ingests it first (so the keyring store has the relevant epoch envelope).
3. Materializer resolves the DEK for `{aggregateId, epoch}` from keyring store (or from key store fallback rules).
4. Materializer decrypts payload ciphertext with AAD derived from `{aggregateType, aggregateId, version}`.

If `epoch` were ciphertext-only, we’d either need “try all epochs” (DoS vector / complexity) or rely on implicit keyring state, which is brittle under sharing and key rotation.

### 4) AAD binding (remove eventType)

We introduce an AAD scheme that removes the dependency on plaintext `eventType`:

```
AAD = "{aggregateType}:{aggregateId}:{version}"
```

Rationale:

- `aggregateId` + `version` are already required for local OCC and event ordering.
- Including `aggregateType` provides additional context separation at minimal cost.
- `eventType` is no longer required for AAD; its integrity is guaranteed by AES-GCM over ciphertext (it lives inside the encrypted envelope).

The AAD scheme is implied by `recordVersion` (we intentionally do not support older record versions yet).

### 5) Canonicalization rules (bytes that matter)

For the current JS boundary, we keep the deterministic JSON stringify rule:

- `record_json` is serialized by `JSON.stringify` with stable property order and no whitespace.
- Byte-preservation remains an explicit invariant (`INV-004`).

This RFC does not introduce cross-language canonicalization, but requires that `recordVersion` and field order remain stable. Aligns with future work in `ALC-302` (JCS RFC-8785).

## Implementation notes (non-normative, for follow-up)

### Clean boundary: “decrypt + materialize local row”

The cleanest boundary is to keep `@mo/sync-engine` responsible only for:

- sync ordering/cursors,
- conflict handling,
- and atomic persistence of already-materialized rows into OPFS (`events`, `sync_event_map`).

And delegate crypto/key concerns to an infra-owned port:

```
interface SyncRecordMaterializerPort {
  materializeRemoteEvent(input: {
    eventId: string;
    recordJson: string;
    globalSequence: number;
  }): Promise<{
    eventRow: {
      id: string;
      aggregate_type: string;
      aggregate_id: string;
      event_type: string;
      payload_encrypted: Uint8Array;
      keyring_update: Uint8Array | null;
      version: number;
      occurred_at: number;
      actor_id: string | null;
      causation_id: string | null;
      correlation_id: string | null;
      epoch: number | null;
    };
  }>;
}
```

Materializer responsibilities (infra):

- parse `recordJson`,
- if `keyringUpdate` present: ingest it (so keys become available),
- resolve the correct DEK for the aggregate/epoch (epoch is plaintext in `SyncRecord`),
- decrypt payload ciphertext using AAD (`{aggregateType}:{aggregateId}:{version}`),
- decode `EventEnvelope` and produce local plaintext columns (`event_type`, `occurred_at`, `actor_id`, ...),
- assert `EventEnvelope.meta.eventId === input.eventId` (defense against record tampering/mismatch),
- return a fully-populated local `events` row insert spec.

Sync engine then performs the DB batch insert + map insert atomically.

### Symmetry: encoding `SyncRecord` on push

Push does not require decryption. It needs a deterministic encoder that:

- reads the local OPFS event row (including `payload_encrypted`, `keyring_update`, `epoch`),
- emits the canonical `SyncRecord` JSON (property order stable), and
- ships `{ eventId, recordJson }` to the server.

This can live as a pure codec in `@mo/sync-engine` (replacing the current `recordCodec.ts` shape). If we later want more formal symmetry and test seams, we can define:

- `SyncRecordEncoderPort` (row → `{ eventId, recordJson }`)
- `SyncRecordMaterializerPort` (incoming `{ eventId, recordJson, globalSequence }` → local row)

For now, the materializer port is the key architectural boundary (it owns crypto + key resolution).

### Pending rewrite

Pending version rewrite continues to re-encrypt pending events when per-aggregate versions shift during rebase. Under this RFC, the AAD used for re-encryption is `{aggregateType}:{aggregateId}:{version}`.

## Security impact

- Removes server visibility of `eventType` and client timestamps (`occurredAt`).
- Preserves required sync metadata and byte stability (`INV-004`).
- The new AAD scheme eliminates a plaintext dependency on `eventType` while maintaining integrity binding to aggregate context and version (`INV-013` with an updated scheme).

### Known limitations / residual leakage (explicit)

Even with this RFC, the server still learns:

- `aggregateType`, `aggregateId`, `version`, `epoch` (and therefore event counts + per-aggregate activity),
- `eventId` (idempotency),
- traffic timing + event size (side channels).

These are accepted limitations for the POC. Removing them would require deeper protocol changes (e.g., different routing, batching/padding, different idempotency scheme).

Notes on `aggregateType` leakage:

- `aggregateType` is currently a small, low-cardinality taxonomy (e.g. `goal`, `project`). We keep it plaintext because it is bound into AAD and provides a simple integrity namespace separation.
- Future hardening options (not part of this RFC): remove `aggregateType` from AAD if we guarantee globally unique `aggregateId` across all types, or replace it with an opaque deterministic tag.

Notes on sharing/invites:

- Sharing must not be implemented by trusting plaintext event metadata on the server (e.g. “first event’s actorId implies owner”). The server is not allowed to interpret ciphertext-only records as an authorization source of truth.
- When we add invites, server authorization should be based on explicit ACL state (server-side mapping `aggregateId -> members/roles`) + authenticated identity, while clients share keys via keyring updates.

## Key invariants

1. `INV-004` — Sync record bytes are preserved (server stores `record_json` as TEXT without canonicalization changes).
2. `INV-013` — AES-GCM AAD binds ciphertext to aggregate context and version.
3. New invariant (to register): Sync records do not expose `eventType` or `occurredAt` in plaintext across the sync boundary.

## Decisions

1. **Include `envelopeVersion` now**: the encrypted `EventEnvelope` includes `envelopeVersion: 1` for forward evolution of encrypted metadata (independent from per-event `payloadVersion`).
2. **Keep `actorId` as local plaintext (not synced)**: the local OPFS `events.actor_id` column remains for local UX/debug/queries, but is treated as derived/cache data that must be materialized from the decrypted `EventEnvelope.meta.actorId` (and must never cross the sync boundary as plaintext).
3. **Keep `eventId` plaintext for sync mechanics**: server-side idempotency + assignment mapping requires a stable plaintext id (see rationale above). Clients also include `eventId` inside ciphertext to assert transport integrity.
4. **Keep `epoch` plaintext for key selection**: decrypting payload requires selecting the correct DEK before decryption; `epoch` is not semantically sensitive like `eventType`/`occurredAt` and avoids “try all epochs” complexity/DoS risk.
5. **Decryption/materialization failure behavior**:
   - **Missing key material** (e.g. shared aggregate key not present yet): the client should surface a non-success sync status that is *actionable* (requires key import/invite acceptance) and retry becomes meaningful only after keys are available.
   - **Corrupt ciphertext / AAD mismatch / envelope decode failure**: treat as non-recoverable corruption for this store/aggregate; require user/dev action (reset/restore/diagnostics). Do not silently skip events.
6. **UUIDv4 everywhere (folded ALC-305)**: all newly generated UUIDs (including `storeId`, `eventId`, and aggregate IDs) MUST be UUIDv4 to avoid timestamp leakage. No ordering logic may rely on ID sort order.

## Code pointers (for implementation follow-up)

- `packages/sync-engine/src/recordCodec.ts` — current `record_json` encoding/decoding to be replaced
- `packages/infrastructure/src/eventing/aad.ts` — current AAD scheme (`{aggregateId}:{eventType}:{version}`) to be updated
- `packages/infrastructure/src/crypto/KeyringManager.ts` — keyring update ingestion + DEK resolution (`epoch`)
- `packages/sync-engine/src/SyncEngine.ts` — remote apply path (will delegate to materializer)
- `packages/infrastructure/src/sync/PendingEventVersionRewriter.ts` — pending rewrite logic must use the new AAD scheme
- `apps/api/src/sync/infrastructure/kysely-sync-event.repository.ts` — server storage of `record_json` (byte preservation)
- `packages/domain/src/utils/uuid.ts` + `packages/domain/src/**/vos/*Id.ts` — UUID generator + ID VOs (switch UUIDv7 → UUIDv4)
- `apps/api/src/sync/presentation/dto/*.ts` — storeId validation currently UUIDv7-specific

## Testing notes (for implementation follow-up)

- Update AAD tests: `packages/infrastructure/__tests__/eventing/aad.test.ts`
- Add/adjust sync-engine tests around record codec/materialization and “eventId mismatch” assertion
- Update tests that assume UUIDv7 shape/regexes (IDs should be treated as opaque strings, validated as UUIDv4 where required)
