import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';

const firstExistingDirectory = async (candidates: ReadonlyArray<string>): Promise<string> => {
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isDirectory()) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  throw new Error(`Could not locate apps/api source root. Tried: ${candidates.join(', ')}`);
};

const collectFilesRecursively = async (
  rootDir: string,
  predicate: (filePath: string) => boolean
): Promise<ReadonlyArray<string>> => {
  const results: string[] = [];
  const entries = await readdir(rootDir);
  for (const entry of entries) {
    const absolute = path.join(rootDir, entry);
    const info = await stat(absolute);
    if (info.isDirectory()) {
      results.push(...(await collectFilesRecursively(absolute, predicate)));
      continue;
    }
    if (predicate(absolute)) {
      results.push(absolute);
    }
  }
  return results;
};

describe('Security boundary: API is ZK (ciphertext-only)', () => {
  it('does not import client crypto/key-handling packages', async () => {
    const srcRoot = await firstExistingDirectory([
      // When running `yarn workspace @mo/api test`, CWD is typically `apps/api`.
      path.join(process.cwd(), 'src'),
      // When running tests from repo root.
      path.join(process.cwd(), 'apps', 'api', 'src'),
    ]);
    const files = await collectFilesRecursively(srcRoot, (filePath) => filePath.endsWith('.ts'));

    const forbiddenImportHints: ReadonlyArray<string> = [
      // Client/runtime crypto and key backup code must never reach the server runtime.
      '@mo/infrastructure',
      '@mo/presentation',
      'WebCryptoService',
      'NodeCryptoService',
      'IndexedDBKeyStore',
      'KeyBackup',
      'IdentityKeys',
      'AggregateKey',
      'KeyWrapping',
    ];

    const violations: string[] = [];
    for (const filePath of files) {
      const contents = await readFile(filePath, 'utf8');
      const matched = forbiddenImportHints.filter((needle) => contents.includes(needle));
      if (matched.length > 0) {
        violations.push(`${path.relative(process.cwd(), filePath)}: ${matched.join(', ')}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
