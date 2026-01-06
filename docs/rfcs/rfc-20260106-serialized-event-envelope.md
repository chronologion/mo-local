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
    eventType: string,
    occurredAt: number,
    actorId: string | null,
    causationId: string | null,
    correlationId: string | null,
    epoch: number | null
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

### 3) Sync record envelope (record_json) (canonical)

We define a canonical `record_json` schema that is explicitly decoupled from the local row shape:

```
SyncRecord = {
  recordVersion: 1,
  aggregateType: string,
  aggregateId: string,
  version: number,
  payloadCiphertext: string,   // base64url
  keyringUpdate: string | null // base64url
}
```

Key points:

- `eventType` and `occurredAt` are not present in plaintext.
- `eventId` is still transmitted separately in sync requests/responses and stored in the server row (for idempotency). It does not need to be duplicated in `record_json`.
- `aggregateType`, `aggregateId`, and `version` remain plaintext because they are required to compute AAD for decryption (see below).

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
- resolve the correct DEK for the aggregate/epoch,
- decrypt payload ciphertext using AAD (`{aggregateType}:{aggregateId}:{version}`),
- decode `EventEnvelope` and produce local plaintext columns (`event_type`, `occurred_at`, `actor_id`, ...),
- return a fully-populated local `events` row insert spec.

Sync engine then performs the DB batch insert + map insert atomically.

### Pending rewrite

Pending version rewrite continues to re-encrypt pending events when per-aggregate versions shift during rebase. Under this RFC, the AAD used for re-encryption is `{aggregateType}:{aggregateId}:{version}`.

## Security impact

- Removes server visibility of `eventType` and client timestamps (`occurredAt`).
- Preserves required sync metadata and byte stability (`INV-004`).
- The new AAD scheme eliminates a plaintext dependency on `eventType` while maintaining integrity binding to aggregate context and version (`INV-013` with an updated scheme).

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
