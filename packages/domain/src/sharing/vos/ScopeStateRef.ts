import { Assert } from '../../shared/Assert';
import { ValueObject } from '../../shared/vos/ValueObject';

/**
 * Value object representing a reference to a specific ScopeState record.
 *
 * A ScopeStateRef is a cryptographic hash (SHA-256) of the signed
 * scope membership record. It serves as:
 * - Content-addressable identifier
 * - Dependency reference for verification
 * - Hash chain element (prevHash → scopeStateRef)
 *
 * @example
 * ```typescript
 * const ref = ScopeStateRef.from(hashBuffer);
 * const hex = ref.toHex();
 * const restored = ScopeStateRef.fromHex(hex);
 * ```
 */
export class ScopeStateRef extends ValueObject<Uint8Array> {
  private static readonly HASH_SIZE = 32; // SHA-256

  private constructor(private readonly _value: Uint8Array) {
    super();
    Assert.that(_value.length === ScopeStateRef.HASH_SIZE, 'ScopeStateRef must be 32 bytes (SHA-256)');
  }

  /**
   * Create a ScopeStateRef from a Uint8Array.
   */
  static from(value: Uint8Array): ScopeStateRef {
    return new ScopeStateRef(value);
  }

  /**
   * Create a ScopeStateRef from a Buffer.
   */
  static fromBuffer(value: Buffer): ScopeStateRef {
    return new ScopeStateRef(new Uint8Array(value));
  }

  /**
   * Create a ScopeStateRef from a hex string.
   */
  static fromHex(hex: string): ScopeStateRef {
    Assert.that(hex, 'hex').matches(/^[0-9a-fA-F]{64}$/);
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return new ScopeStateRef(bytes);
  }

  /**
   * Create a ScopeStateRef from a base64url string.
   */
  static fromBase64Url(b64: string): ScopeStateRef {
    // Convert base64url to base64
    const base64 = b64.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(base64, 'base64');
    return ScopeStateRef.fromBuffer(decoded);
  }

  get value(): Uint8Array {
    return this._value;
  }

  /**
   * Convert to Buffer for compatibility with Node.js APIs.
   */
  toBuffer(): Buffer {
    return Buffer.from(this._value);
  }

  /**
   * Convert to hex string for logging/debugging.
   */
  toHex(): string {
    return Array.from(this._value)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convert to base64url for wire transport.
   */
  toBase64Url(): string {
    const base64 = Buffer.from(this._value).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Check equality based on byte contents.
   */
  equals(other: ScopeStateRef): boolean {
    if (this._value.length !== other._value.length) return false;
    for (let i = 0; i < this._value.length; i++) {
      if (this._value[i] !== other._value[i]) return false;
    }
    return true;
  }

  /**
   * String representation as hex.
   */
  toString(): string {
    return this.toHex();
  }
}
