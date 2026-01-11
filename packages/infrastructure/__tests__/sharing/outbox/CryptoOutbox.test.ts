import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CryptoOutbox, type SharingTransportPort } from '../../../src/sharing/outbox/CryptoOutbox';
import { OutboxStore, type OutboxArtifact } from '../../../src/sharing/outbox/OutboxStore';

describe('CryptoOutbox', () => {
  let outbox: CryptoOutbox;
  let outboxStore: OutboxStore;
  let transport: SharingTransportPort;

  const createArtifact = (
    id: string,
    type: 'scope_state' | 'grant' | 'event',
    dependencies: string[] = []
  ): OutboxArtifact => ({
    artifactId: id,
    artifactType: type,
    payload: JSON.stringify({ id }),
    dependencies,
    status: 'pending',
    enqueuedAt: Date.now(),
  });

  beforeEach(() => {
    outboxStore = {
      enqueue: vi.fn(),
      loadPending: vi.fn(),
      loadPushedIds: vi.fn(),
      loadById: vi.fn(),
      markPushed: vi.fn(),
      clearPushed: vi.fn(),
    } as unknown as OutboxStore;

    transport = {
      pushScopeState: vi.fn(),
      pushResourceGrant: vi.fn(),
    } as unknown as SharingTransportPort;

    outbox = new CryptoOutbox(outboxStore, transport);
  });

  describe('enqueue', () => {
    it('should enqueue artifact to store', async () => {
      const artifact = createArtifact('scope-1', 'scope_state');

      await outbox.enqueue(artifact);

      expect(outboxStore.enqueue).toHaveBeenCalledWith(artifact);
    });
  });

  describe('push - Empty outbox', () => {
    it('should return zero counts when outbox is empty', async () => {
      vi.mocked(outboxStore.loadPending).mockResolvedValue([]);

      const result = await outbox.push();

      expect(result).toEqual({ pushed: 0, failed: 0 });
      expect(transport.pushScopeState).not.toHaveBeenCalled();
      expect(transport.pushResourceGrant).not.toHaveBeenCalled();
    });
  });

  describe('push - Successful push', () => {
    it('should push single artifact successfully', async () => {
      const artifact = createArtifact('scope-1', 'scope_state');

      vi.mocked(outboxStore.loadPending).mockResolvedValue([artifact]);
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set());
      vi.mocked(transport.pushScopeState).mockResolvedValue({ ok: true });

      const result = await outbox.push();

      expect(result).toEqual({ pushed: 1, failed: 0 });
      expect(transport.pushScopeState).toHaveBeenCalledWith({
        scopeStateRef: 'scope-1',
        payload: artifact.payload,
      });
      expect(outboxStore.markPushed).toHaveBeenCalledWith('scope-1');
    });

    it('should push multiple artifacts in dependency order', async () => {
      const scopeState = createArtifact('scope-1', 'scope_state');
      const grant = createArtifact('grant-1', 'grant', ['scope-1']);

      vi.mocked(outboxStore.loadPending).mockResolvedValue([grant, scopeState]); // Out of order
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set());
      vi.mocked(transport.pushScopeState).mockResolvedValue({ ok: true });
      vi.mocked(transport.pushResourceGrant).mockResolvedValue({ ok: true });

      const result = await outbox.push();

      expect(result).toEqual({ pushed: 2, failed: 0 });

      // Verify order: scope-state before grant
      const calls = [
        ...(vi.mocked(transport.pushScopeState).mock.calls as Array<[{ scopeStateRef: string; payload: string }]>),
        ...(vi.mocked(transport.pushResourceGrant).mock.calls as Array<[{ grantId: string; payload: string }]>),
      ];
      expect(calls[0]?.[0]?.scopeStateRef).toBe('scope-1');
      expect(calls[1]?.[0]?.grantId).toBe('grant-1');
    });

    it('should clean up old pushed artifacts after successful push', async () => {
      const artifact = createArtifact('scope-1', 'scope_state');
      const now = Date.now();

      vi.mocked(outboxStore.loadPending).mockResolvedValue([artifact]);
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set());
      vi.mocked(transport.pushScopeState).mockResolvedValue({ ok: true });

      await outbox.push();

      expect(outboxStore.clearPushed).toHaveBeenCalledWith(expect.any(Number));
      const clearPushedArg = vi.mocked(outboxStore.clearPushed).mock.calls[0][0];
      // Should be ~24 hours ago
      expect(clearPushedArg).toBeGreaterThan(now - 24 * 60 * 60 * 1000 - 1000);
      expect(clearPushedArg).toBeLessThan(now - 24 * 60 * 60 * 1000 + 1000);
    });
  });

  describe('push - Failed push', () => {
    it('should stop at first failure and return counts', async () => {
      const artifact1 = createArtifact('scope-1', 'scope_state');
      const artifact2 = createArtifact('scope-2', 'scope_state');

      vi.mocked(outboxStore.loadPending).mockResolvedValue([artifact1, artifact2]);
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set());
      vi.mocked(transport.pushScopeState)
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: false,
          reason: 'missing_deps',
          missingDeps: ['scope-0'],
        });
      vi.mocked(outboxStore.loadById).mockResolvedValue(null); // Missing dep not found

      const result = await outbox.push();

      expect(result).toEqual({ pushed: 1, failed: 1 });
      expect(outboxStore.markPushed).toHaveBeenCalledTimes(1);
      expect(outboxStore.markPushed).toHaveBeenCalledWith('scope-1');
    });

    it('should return all failed when dependency validation fails', async () => {
      const artifact = createArtifact('grant-1', 'grant', ['scope-missing']);

      vi.mocked(outboxStore.loadPending).mockResolvedValue([artifact]);
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set()); // scope-missing not pushed

      const result = await outbox.push();

      expect(result).toEqual({ pushed: 0, failed: 1 });
      expect(transport.pushResourceGrant).not.toHaveBeenCalled();
    });
  });

  describe('push - MissingDeps recovery', () => {
    it('should resolve missing dependency and retry successfully', async () => {
      // Scenario: Grant is in pending, but server returns MissingDeps for scope-1
      // (race condition: scope-1 was pending but got processed before grant)
      const scopeState = createArtifact('scope-1', 'scope_state');
      const grant = createArtifact('grant-1', 'grant', []);

      // Both in pending initially for validation
      vi.mocked(outboxStore.loadPending).mockResolvedValue([grant, scopeState]);
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set());

      // Push scopeState succeeds, grant fails with MissingDeps
      vi.mocked(transport.pushScopeState).mockResolvedValue({ ok: true });
      vi.mocked(transport.pushResourceGrant)
        .mockResolvedValueOnce({
          ok: false,
          reason: 'missing_deps',
          missingDeps: ['scope-1'],
        })
        .mockResolvedValueOnce({ ok: true }); // Retry succeeds

      vi.mocked(outboxStore.loadById).mockResolvedValue(scopeState);

      const result = await outbox.push();

      expect(result).toEqual({ pushed: 2, failed: 0 });
      expect(outboxStore.markPushed).toHaveBeenCalledWith('scope-1');
      expect(outboxStore.markPushed).toHaveBeenCalledWith('grant-1');
    });

    it('should fail when missing dependency not in outbox', async () => {
      // Grant has no declared dependencies but server returns MissingDeps
      const grant = createArtifact('grant-1', 'grant', []);

      vi.mocked(outboxStore.loadPending).mockResolvedValue([grant]);
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set());
      vi.mocked(transport.pushResourceGrant).mockResolvedValue({
        ok: false,
        reason: 'missing_deps',
        missingDeps: ['scope-1'],
      });
      vi.mocked(outboxStore.loadById).mockResolvedValue(null); // Not found

      const result = await outbox.push();

      expect(result).toEqual({ pushed: 0, failed: 1 });
      expect(outboxStore.markPushed).not.toHaveBeenCalled();
    });

    it('should fail when missing dependency push fails', async () => {
      const scopeState = createArtifact('scope-1', 'scope_state');
      const grant = createArtifact('grant-1', 'grant', []);

      vi.mocked(outboxStore.loadPending).mockResolvedValue([grant]);
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set());
      vi.mocked(transport.pushResourceGrant).mockResolvedValue({
        ok: false,
        reason: 'missing_deps',
        missingDeps: ['scope-1'],
      });
      vi.mocked(outboxStore.loadById).mockResolvedValue(scopeState);
      vi.mocked(transport.pushScopeState).mockResolvedValue({
        ok: false,
        reason: 'missing_deps',
        missingDeps: ['scope-0'],
      });
      vi.mocked(outboxStore.loadById).mockImplementation(async (id) => {
        if (id === 'scope-1') return scopeState;
        return null; // scope-0 not found
      });

      const result = await outbox.push();

      expect(result).toEqual({ pushed: 0, failed: 1 });
      expect(outboxStore.markPushed).not.toHaveBeenCalled();
    });
  });

  describe('push - Depth limit', () => {
    it('should stop recursion at MAX_DEPENDENCY_RESOLUTION_DEPTH', async () => {
      // Create chain of 12 artifacts, each depending on previous
      const artifacts: OutboxArtifact[] = [];
      for (let i = 11; i >= 0; i--) {
        artifacts.push(createArtifact(`scope-${i}`, 'scope_state', i > 0 ? [`scope-${i - 1}`] : []));
      }

      vi.mocked(outboxStore.loadPending).mockResolvedValue([artifacts[11]]); // Start with last one
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set());

      // Mock transport to always return missing_deps
      vi.mocked(transport.pushScopeState).mockResolvedValue({
        ok: false,
        reason: 'missing_deps',
        missingDeps: ['scope-10'],
      });

      // Mock loadById to return chained artifacts
      vi.mocked(outboxStore.loadById).mockImplementation(async (id) => {
        const match = id.match(/scope-(\d+)/);
        if (!match) return null;
        const idx = parseInt(match[1], 10);
        return artifacts[idx];
      });

      const result = await outbox.push();

      // Should fail due to depth limit (MAX = 10)
      expect(result).toEqual({ pushed: 0, failed: 1 });
    });
  });

  describe('push - Artifact types', () => {
    it('should push scope_state artifacts via pushScopeState', async () => {
      const artifact = createArtifact('scope-1', 'scope_state');

      vi.mocked(outboxStore.loadPending).mockResolvedValue([artifact]);
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set());
      vi.mocked(transport.pushScopeState).mockResolvedValue({ ok: true });

      await outbox.push();

      expect(transport.pushScopeState).toHaveBeenCalledWith({
        scopeStateRef: 'scope-1',
        payload: artifact.payload,
      });
    });

    it('should push grant artifacts via pushResourceGrant', async () => {
      const artifact = createArtifact('grant-1', 'grant');

      vi.mocked(outboxStore.loadPending).mockResolvedValue([artifact]);
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set());
      vi.mocked(transport.pushResourceGrant).mockResolvedValue({ ok: true });

      await outbox.push();

      expect(transport.pushResourceGrant).toHaveBeenCalledWith({
        grantId: 'grant-1',
        payload: artifact.payload,
      });
    });

    it('should skip event artifacts (pushed via normal sync)', async () => {
      const artifact = createArtifact('event-1', 'event');

      vi.mocked(outboxStore.loadPending).mockResolvedValue([artifact]);
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set());

      const result = await outbox.push();

      expect(result).toEqual({ pushed: 1, failed: 0 });
      expect(transport.pushScopeState).not.toHaveBeenCalled();
      expect(transport.pushResourceGrant).not.toHaveBeenCalled();
      expect(outboxStore.markPushed).toHaveBeenCalledWith('event-1');
    });
  });

  describe('Integration - Real-world scenarios', () => {
    it('should handle ScopeState -> Grant -> Event push sequence', async () => {
      const scopeState = createArtifact('scope-1', 'scope_state');
      const grant = createArtifact('grant-1', 'grant', ['scope-1']);
      const event = createArtifact('event-1', 'event', ['grant-1', 'scope-1']);

      vi.mocked(outboxStore.loadPending).mockResolvedValue([event, grant, scopeState]); // Out of order
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set());
      vi.mocked(transport.pushScopeState).mockResolvedValue({ ok: true });
      vi.mocked(transport.pushResourceGrant).mockResolvedValue({ ok: true });

      const result = await outbox.push();

      expect(result).toEqual({ pushed: 3, failed: 0 });

      // Verify order
      const pushOrder: string[] = [];
      vi.mocked(transport.pushScopeState).mock.calls.forEach((call) => {
        pushOrder.push(call[0].scopeStateRef);
      });
      vi.mocked(transport.pushResourceGrant).mock.calls.forEach((call) => {
        pushOrder.push(call[0].grantId);
      });
      vi.mocked(outboxStore.markPushed).mock.calls.forEach((call) => {
        if (call[0] === 'event-1') pushOrder.push('event-1');
      });

      expect(pushOrder).toEqual(['scope-1', 'grant-1', 'event-1']);
    });

    it('should handle multiple grants depending on same ScopeState', async () => {
      const scopeState = createArtifact('scope-1', 'scope_state');
      const grant1 = createArtifact('grant-1', 'grant', ['scope-1']);
      const grant2 = createArtifact('grant-2', 'grant', ['scope-1']);

      vi.mocked(outboxStore.loadPending).mockResolvedValue([grant2, grant1, scopeState]);
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set());
      vi.mocked(transport.pushScopeState).mockResolvedValue({ ok: true });
      vi.mocked(transport.pushResourceGrant).mockResolvedValue({ ok: true });

      const result = await outbox.push();

      expect(result).toEqual({ pushed: 3, failed: 0 });

      // Verify scope-1 pushed first
      expect(transport.pushScopeState).toHaveBeenCalledWith({
        scopeStateRef: 'scope-1',
        payload: scopeState.payload,
      });
      expect(vi.mocked(transport.pushScopeState).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(transport.pushResourceGrant).mock.invocationCallOrder[0]
      );
    });

    it('should handle ScopeState hash chain with some states already pushed', async () => {
      const scopeState2 = createArtifact('scope-2', 'scope_state', ['scope-1']);
      const scopeState3 = createArtifact('scope-3', 'scope_state', ['scope-2']);

      vi.mocked(outboxStore.loadPending).mockResolvedValue([scopeState3, scopeState2]);
      vi.mocked(outboxStore.loadPushedIds).mockResolvedValue(new Set(['scope-1'])); // scope-1 already pushed
      vi.mocked(transport.pushScopeState).mockResolvedValue({ ok: true });

      const result = await outbox.push();

      expect(result).toEqual({ pushed: 2, failed: 0 });

      // Verify order: scope-2 before scope-3
      const calls = vi.mocked(transport.pushScopeState).mock.calls;
      expect(calls[0][0].scopeStateRef).toBe('scope-2');
      expect(calls[1][0].scopeStateRef).toBe('scope-3');
    });
  });
});
