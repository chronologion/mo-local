import { Injectable } from '@nestjs/common';
import { AuthenticatedIdentity } from './authenticated-identity';

type CacheEntry = {
  value: AuthenticatedIdentity;
  expiresAt: number;
};

@Injectable()
export class SessionCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = Number(process.env.SESSION_CACHE_TTL_MS ?? '30000');

  read(token: string): AuthenticatedIdentity | null {
    const entry = this.cache.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(token);
      return null;
    }
    return entry.value;
  }

  write(token: string, value: AuthenticatedIdentity): void {
    const expiresAt = Date.now() + this.ttlMs;
    this.cache.set(token, { value, expiresAt });
  }

  invalidate(token: string): void {
    this.cache.delete(token);
  }
}
