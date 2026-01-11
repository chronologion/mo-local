import { Encoder, Decoder } from 'cbor-x';

/**
 * DomainEventManifestV1 is the canonical representation of a domain event
 * for signature verification. It includes all metadata and content hashes
 * needed to verify the event's integrity and authenticity.
 *
 * This manifest is CBOR-encoded and used as the signed payload for hybrid
 * signatures (Ed25519 + ML-DSA).
 *
 * @see RFC-20260107-key-scopes-and-sharing.md
 */
export type DomainEventManifestV1 = Readonly<{
  version: 'mo-domain-event-manifest-v1';
  eventId: string;
  scopeId: string;
  resourceId: string;
  resourceKeyId: string;
  grantId: string;
  scopeStateRef: Uint8Array;
  authorDeviceId: string;
  payloadAad: Uint8Array;
  payloadCiphertextHash: Uint8Array;
}>;

/**
 * ScopeStateManifestV1 is the canonical representation of a ScopeState record
 * for signature verification. It includes membership, signer roster, and
 * hash chain metadata.
 */
export type ScopeStateManifestV1 = Readonly<{
  version: 'mo-scope-state-manifest-v1';
  scopeId: string;
  scopeStateSeq: bigint;
  prevHash: Uint8Array | null;
  ownerUserId: string;
  scopeEpoch: bigint;
  members: ReadonlyArray<{ userId: string; role: string }>;
  signers: ReadonlyArray<{
    deviceId: string;
    userId: string;
    sigSuite: string;
    pubKeys: Readonly<Record<string, Uint8Array>>;
  }>;
}>;

/**
 * ResourceGrantManifestV1 is the canonical representation of a ResourceGrant
 * record for signature verification.
 */
export type ResourceGrantManifestV1 = Readonly<{
  version: 'mo-resource-grant-manifest-v1';
  grantId: string;
  scopeId: string;
  resourceId: string;
  scopeEpoch: bigint;
  resourceKeyId: string;
  wrappedKey: Uint8Array;
  scopeStateRef: Uint8Array;
}>;

/**
 * ManifestCodec provides canonical CBOR encoding/decoding for signature
 * verification manifests.
 *
 * **Canonical Encoding:**
 * - Uses cbor-x with default settings for deterministic encoding
 * - All Uint8Array fields are encoded as CBOR byte strings
 * - All strings are encoded as CBOR text strings
 * - BigInts are encoded as CBOR integers
 * - Maps and arrays use deterministic key ordering
 *
 * **Usage:**
 * ```typescript
 * const codec = new ManifestCodec();
 * const manifest: DomainEventManifestV1 = { ... };
 * const encoded = codec.encodeDomainEventManifest(manifest);
 * const decoded = codec.decodeDomainEventManifest(encoded);
 * ```
 */
export class ManifestCodec {
  private readonly encoder: Encoder;
  private readonly decoder: Decoder;

  constructor() {
    // Use default cbor-x settings for canonical encoding
    this.encoder = new Encoder({
      structuredClone: false,
      mapsAsObjects: false,
      useRecords: false,
    });
    this.decoder = new Decoder({
      structuredClone: false,
      mapsAsObjects: false,
      useRecords: false,
    });
  }

  /**
   * Encode a DomainEventManifestV1 to canonical CBOR bytes.
   *
   * @param manifest - The manifest to encode
   * @returns Canonical CBOR-encoded bytes
   */
  encodeDomainEventManifest(manifest: DomainEventManifestV1): Uint8Array {
    this.validateDomainEventManifest(manifest);
    return this.encoder.encode(manifest);
  }

  /**
   * Decode a DomainEventManifestV1 from CBOR bytes.
   *
   * @param bytes - CBOR-encoded manifest
   * @returns Decoded manifest
   * @throws {Error} if decoding fails or manifest is invalid
   */
  decodeDomainEventManifest(bytes: Uint8Array): DomainEventManifestV1 {
    const manifest = this.decoder.decode(bytes) as DomainEventManifestV1;
    this.validateDomainEventManifest(manifest);
    return manifest;
  }

  /**
   * Encode a ScopeStateManifestV1 to canonical CBOR bytes.
   *
   * @param manifest - The manifest to encode
   * @returns Canonical CBOR-encoded bytes
   */
  encodeScopeStateManifest(manifest: ScopeStateManifestV1): Uint8Array {
    this.validateScopeStateManifest(manifest);
    return this.encoder.encode(manifest);
  }

  /**
   * Decode a ScopeStateManifestV1 from CBOR bytes.
   *
   * @param bytes - CBOR-encoded manifest
   * @returns Decoded manifest
   * @throws {Error} if decoding fails or manifest is invalid
   */
  decodeScopeStateManifest(bytes: Uint8Array): ScopeStateManifestV1 {
    const manifest = this.decoder.decode(bytes) as ScopeStateManifestV1;
    this.validateScopeStateManifest(manifest);
    return manifest;
  }

  /**
   * Encode a ResourceGrantManifestV1 to canonical CBOR bytes.
   *
   * @param manifest - The manifest to encode
   * @returns Canonical CBOR-encoded bytes
   */
  encodeResourceGrantManifest(manifest: ResourceGrantManifestV1): Uint8Array {
    this.validateResourceGrantManifest(manifest);
    return this.encoder.encode(manifest);
  }

  /**
   * Decode a ResourceGrantManifestV1 from CBOR bytes.
   *
   * @param bytes - CBOR-encoded manifest
   * @returns Decoded manifest
   * @throws {Error} if decoding fails or manifest is invalid
   */
  decodeResourceGrantManifest(bytes: Uint8Array): ResourceGrantManifestV1 {
    const manifest = this.decoder.decode(bytes) as ResourceGrantManifestV1;
    this.validateResourceGrantManifest(manifest);
    return manifest;
  }

  private validateDomainEventManifest(manifest: DomainEventManifestV1): void {
    if (manifest.version !== 'mo-domain-event-manifest-v1') {
      throw new Error(`Invalid manifest version: ${manifest.version}`);
    }
    if (!manifest.eventId || typeof manifest.eventId !== 'string') {
      throw new Error('Invalid eventId');
    }
    if (!manifest.scopeId || typeof manifest.scopeId !== 'string') {
      throw new Error('Invalid scopeId');
    }
    if (!manifest.resourceId || typeof manifest.resourceId !== 'string') {
      throw new Error('Invalid resourceId');
    }
    if (!manifest.resourceKeyId || typeof manifest.resourceKeyId !== 'string') {
      throw new Error('Invalid resourceKeyId');
    }
    if (!manifest.grantId || typeof manifest.grantId !== 'string') {
      throw new Error('Invalid grantId');
    }
    if (!(manifest.scopeStateRef instanceof Uint8Array) || manifest.scopeStateRef.length !== 32) {
      throw new Error('Invalid scopeStateRef: must be 32-byte Uint8Array');
    }
    if (!manifest.authorDeviceId || typeof manifest.authorDeviceId !== 'string') {
      throw new Error('Invalid authorDeviceId');
    }
    if (!(manifest.payloadAad instanceof Uint8Array)) {
      throw new Error('Invalid payloadAad: must be Uint8Array');
    }
    if (!(manifest.payloadCiphertextHash instanceof Uint8Array) || manifest.payloadCiphertextHash.length !== 32) {
      throw new Error('Invalid payloadCiphertextHash: must be 32-byte Uint8Array (SHA-256)');
    }
  }

  private validateScopeStateManifest(manifest: ScopeStateManifestV1): void {
    if (manifest.version !== 'mo-scope-state-manifest-v1') {
      throw new Error(`Invalid manifest version: ${manifest.version}`);
    }
    if (!manifest.scopeId || typeof manifest.scopeId !== 'string') {
      throw new Error('Invalid scopeId');
    }
    if (typeof manifest.scopeStateSeq !== 'bigint' || manifest.scopeStateSeq < 0n) {
      throw new Error('Invalid scopeStateSeq: must be non-negative bigint');
    }
    if (manifest.prevHash !== null && (!(manifest.prevHash instanceof Uint8Array) || manifest.prevHash.length !== 32)) {
      throw new Error('Invalid prevHash: must be null or 32-byte Uint8Array');
    }
    if (!manifest.ownerUserId || typeof manifest.ownerUserId !== 'string') {
      throw new Error('Invalid ownerUserId');
    }
    if (typeof manifest.scopeEpoch !== 'bigint' || manifest.scopeEpoch < 0n) {
      throw new Error('Invalid scopeEpoch: must be non-negative bigint');
    }
    if (!Array.isArray(manifest.members)) {
      throw new Error('Invalid members: must be array');
    }
    if (!Array.isArray(manifest.signers)) {
      throw new Error('Invalid signers: must be array');
    }
  }

  private validateResourceGrantManifest(manifest: ResourceGrantManifestV1): void {
    if (manifest.version !== 'mo-resource-grant-manifest-v1') {
      throw new Error(`Invalid manifest version: ${manifest.version}`);
    }
    if (!manifest.grantId || typeof manifest.grantId !== 'string') {
      throw new Error('Invalid grantId');
    }
    if (!manifest.scopeId || typeof manifest.scopeId !== 'string') {
      throw new Error('Invalid scopeId');
    }
    if (!manifest.resourceId || typeof manifest.resourceId !== 'string') {
      throw new Error('Invalid resourceId');
    }
    if (typeof manifest.scopeEpoch !== 'bigint' || manifest.scopeEpoch < 0n) {
      throw new Error('Invalid scopeEpoch: must be non-negative bigint');
    }
    if (!manifest.resourceKeyId || typeof manifest.resourceKeyId !== 'string') {
      throw new Error('Invalid resourceKeyId');
    }
    if (!(manifest.wrappedKey instanceof Uint8Array) || manifest.wrappedKey.length === 0) {
      throw new Error('Invalid wrappedKey: must be non-empty Uint8Array');
    }
    if (!(manifest.scopeStateRef instanceof Uint8Array) || manifest.scopeStateRef.length !== 32) {
      throw new Error('Invalid scopeStateRef: must be 32-byte Uint8Array');
    }
  }
}
