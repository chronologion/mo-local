import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createServer, type Server } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

type ServerHandle = {
  server: Server;
  baseUrl: string;
};

const tmpRoot = path.resolve(process.cwd(), '.tmp', 'eventstore-web');
const workerEntry = path.resolve(
  process.cwd(),
  '..',
  '..',
  'packages',
  'eventstore-web',
  'src',
  'worker',
  'owner.worker.ts'
);

const serveStatic = (root: string): Promise<ServerHandle> => {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = req.url ?? '/';
      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><html><body>eventstore-web</body></html>');
        return;
      }
      const filePath = path.join(root, decodeURIComponent(url));
      try {
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath);
        const contentType =
          ext === '.js'
            ? 'application/javascript'
            : ext === '.wasm'
              ? 'application/wasm'
              : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      } catch (error) {
        res.writeHead(404);
        res.end(String(error));
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind test server'));
        return;
      }
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
};

let serverHandle: ServerHandle | null = null;

test.beforeAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
  await fs.mkdir(tmpRoot, { recursive: true });
  await build({
    entryPoints: [workerEntry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outdir: tmpRoot,
    entryNames: 'worker',
    assetNames: '[name]',
    loader: { '.wasm': 'file' },
    banner: {
      js: `
if (typeof navigator !== 'undefined') {
  if (!('locks' in navigator)) {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name, _opts, cb) => {
          try { cb(); } catch {}
          return Promise.resolve();
        }
      }
    });
  }
}
      `.trim(),
    },
    sourcemap: false,
  });
  const wasmSource = path.resolve(
    process.cwd(),
    '..',
    '..',
    'node_modules',
    'wa-sqlite',
    'dist',
    'wa-sqlite.wasm'
  );
  await fs.copyFile(wasmSource, path.join(tmpRoot, 'wa-sqlite.wasm'));
  serverHandle = await serveStatic(tmpRoot);
});

test.afterAll(async () => {
  if (serverHandle) {
    serverHandle.server.close();
  }
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test.describe('eventstore-web worker', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Worker/OPFS integration is Chromium-only'
  );

  test('worker handles hello, execute, query, and table notifications', async ({
    page,
  }) => {
    if (!serverHandle) {
      throw new Error('Server not initialized');
    }
    await page.goto(serverHandle.baseUrl);

    const hasOpfs = await page.evaluate(
      () =>
        typeof navigator !== 'undefined' &&
        'storage' in navigator &&
        typeof navigator.storage.getDirectory === 'function'
    );
    test.skip(!hasOpfs, 'OPFS not available');

    page.on('console', (msg) => {
      console.log(`[browser ${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      console.error(`[browser error] ${err.message}`);
    });

    const result = await page.evaluate(async (workerUrl) => {
      const worker = new Worker(workerUrl, { type: 'module' });
      const port = worker;

      const withTimeout = async <T>(promise: Promise<T>, label: string) => {
        let timeoutId: number | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            reject(new Error(`${label} timed out`));
          }, 10_000);
        });
        try {
          return await Promise.race([promise, timeout]);
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      };

      const waitFor = <T>(
        predicate: (data: unknown) => data is T
      ): Promise<T> =>
        new Promise((resolve) => {
          const handler = (event: MessageEvent) => {
            if (predicate(event.data)) {
              port.removeEventListener('message', handler);
              resolve(event.data);
            }
          };
          port.addEventListener('message', handler);
        });

      port.postMessage({
        v: 1,
        kind: 'hello',
        storeId: `store-${crypto.randomUUID()}`,
        clientInstanceId: `client-${crypto.randomUUID()}`,
        dbName: `test-${crypto.randomUUID()}.db`,
        requireOpfs: false,
      });

      const helloOk = await withTimeout(
        waitFor<{ kind: 'hello.ok' }>(
          (data): data is { kind: 'hello.ok' } =>
            typeof data === 'object' &&
            data !== null &&
            'kind' in data &&
            (data as { kind?: string }).kind === 'hello.ok'
        ),
        'hello'
      );

      const request = async <T>(
        payload: Record<string, unknown>
      ): Promise<T> => {
        const requestId = crypto.randomUUID();
        const response = withTimeout(
          waitFor<{
            kind: 'response';
            requestId: string;
            payload:
              | { kind: 'ok'; data: T }
              | { kind: 'error'; error: unknown };
          }>(
            (
              data
            ): data is {
              kind: 'response';
              requestId: string;
              payload:
                | { kind: 'ok'; data: T }
                | { kind: 'error'; error: unknown };
            } =>
              typeof data === 'object' &&
              data !== null &&
              'kind' in data &&
              (data as { kind?: string }).kind === 'response' &&
              (data as { requestId?: string }).requestId === requestId
          ),
          `request:${payload.kind}`
        );
        port.postMessage({
          v: 1,
          kind: 'request',
          requestId,
          payload,
        });
        const envelope = await response;
        if (envelope.payload.kind === 'error') {
          throw envelope.payload.error;
        }
        return envelope.payload.data;
      };

      await request<void>({
        kind: 'db.execute',
        sql: 'CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY, name TEXT)',
        params: [],
      });

      await request<void>({
        kind: 'db.execute',
        sql: 'INSERT INTO test_table (name) VALUES (?)',
        params: ['Alice'],
      });

      const rows = await request<Array<{ name: string }>>({
        kind: 'db.query',
        sql: 'SELECT name FROM test_table',
        params: [],
      });

      await request<void>({
        kind: 'db.subscribeTables',
        subscriptionId: 'sub-1',
        tables: ['test_table'],
      });

      const notify = withTimeout(
        waitFor<{ kind: 'tables.changed'; tables: string[] }>(
          (data): data is { kind: 'tables.changed'; tables: string[] } =>
            typeof data === 'object' &&
            data !== null &&
            'kind' in data &&
            (data as { kind?: string }).kind === 'tables.changed'
        ),
        'notify'
      );

      await request<void>({
        kind: 'db.execute',
        sql: 'UPDATE test_table SET name = ? WHERE id = 1',
        params: ['Bob'],
      });

      const tablesChanged = await notify;
      worker.terminate();

      return {
        helloKind: helloOk.kind,
        rows,
        tablesChanged: tablesChanged.tables,
      };
    }, `${serverHandle.baseUrl}/worker.js`);

    expect(result.helloKind).toBe('hello.ok');
    expect(result.rows).toEqual([{ name: 'Alice' }]);
    expect(result.tablesChanged).toContain('test_table');
  });
});
