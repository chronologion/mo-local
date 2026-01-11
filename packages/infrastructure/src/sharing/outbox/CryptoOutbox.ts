import { OutboxStore, type OutboxArtifact } from './OutboxStore';
import { DependencyGraph } from './DependencyGraph';

/**
 * Maximum recursion depth for resolving missing dependencies.
 * Prevents infinite loops if server keeps returning different missing deps.
 */
const MAX_DEPENDENCY_RESOLUTION_DEPTH = 10;

/**
 * Transport interface for pushing sharing artifacts to the server.
 */
export interface SharingTransportPort {
  /**
   * Push a ScopeState artifact.
   *
   * @returns Response with ok=true or error with missing dependencies
   */
  pushScopeState(params: {
    scopeStateRef: string;
    payload: string;
  }): Promise<{ ok: true } | { ok: false; reason: 'missing_deps'; missingDeps: string[] }>;

  /**
   * Push a ResourceGrant artifact.
   *
   * @returns Response with ok=true or error with missing dependencies
   */
  pushResourceGrant(params: {
    grantId: string;
    payload: string;
  }): Promise<{ ok: true } | { ok: false; reason: 'missing_deps'; missingDeps: string[] }>;
}

/**
 * CryptoOutbox orchestrates pushing sharing artifacts with dependency ordering.
 *
 * **Purpose:**
 * - Ensure dependencies pushed before dependents (ScopeState → Grant → Event)
 * - Handle MissingDeps errors by pushing missing artifacts first
 * - Maintain causal ordering for verified artifacts
 *
 * **Algorithm:**
 * 1. Load pending artifacts from outbox
 * 2. Topologically sort by dependencies
 * 3. Push in order
 * 4. If MissingDeps error, resolve and retry
 *
 * @see RFC-20260107-key-scopes-and-sharing.md
 */
export class CryptoOutbox {
  private readonly dependencyGraph = new DependencyGraph();

  constructor(
    private readonly outboxStore: OutboxStore,
    private readonly transport: SharingTransportPort
  ) {}

  /**
   * Enqueue an artifact for push.
   *
   * @param artifact - Artifact to enqueue
   */
  async enqueue(artifact: OutboxArtifact): Promise<void> {
    await this.outboxStore.enqueue(artifact);
  }

  /**
   * Push all pending artifacts in dependency order.
   *
   * This is the main entry point called before pushing domain events.
   *
   * @returns Statistics about the push operation
   */
  async push(): Promise<{ pushed: number; failed: number }> {
    const pending = await this.outboxStore.loadPending();
    if (pending.length === 0) {
      return { pushed: 0, failed: 0 };
    }

    // Load pushed artifact IDs for external dependency validation
    const pushedIds = await this.outboxStore.loadPushedIds();

    // Sort artifacts in topological order with external dependency validation
    let sorted: OutboxArtifact[];
    try {
      sorted = this.dependencyGraph.sort(pending, pushedIds);
    } catch (error) {
      // Circular dependency or missing external dependency detected
      console.error('Crypto outbox: dependency validation failed', error);
      return { pushed: 0, failed: pending.length };
    }

    let pushed = 0;
    let failed = 0;

    // Push artifacts in order
    for (const artifact of sorted) {
      const result = await this.pushArtifact(artifact);
      if (result.ok) {
        await this.outboxStore.markPushed(artifact.artifactId);
        pushed++;
      } else {
        failed++;
        // Stop on first failure to maintain ordering
        break;
      }
    }

    // Clean up old pushed artifacts (older than 24 hours)
    const cleanupThreshold = Date.now() - 24 * 60 * 60 * 1000;
    await this.outboxStore.clearPushed(cleanupThreshold);

    return { pushed, failed };
  }

  /**
   * Push a single artifact, handling MissingDeps errors with depth limiting.
   *
   * @param artifact - Artifact to push
   * @param depth - Current recursion depth (defaults to 0)
   * @returns Success result or failure
   */
  private async pushArtifact(
    artifact: OutboxArtifact,
    depth = 0
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    // Check recursion depth limit
    if (depth > MAX_DEPENDENCY_RESOLUTION_DEPTH) {
      return {
        ok: false,
        error: `Maximum dependency resolution depth (${MAX_DEPENDENCY_RESOLUTION_DEPTH}) exceeded for artifact ${artifact.artifactId}`,
      };
    }

    try {
      const response = await this.pushArtifactToTransport(artifact);

      if (response.ok) {
        return { ok: true };
      }

      // Handle MissingDeps error
      if (response.reason === 'missing_deps') {
        // Attempt to resolve missing dependencies
        const resolved = await this.resolveMissingDeps(response.missingDeps, depth + 1);
        if (!resolved) {
          return { ok: false, error: `Cannot resolve missing dependencies: ${response.missingDeps.join(', ')}` };
        }

        // Retry push after resolving dependencies (only one retry)
        const retryResponse = await this.pushArtifactToTransport(artifact);
        if (retryResponse.ok) {
          return { ok: true };
        }

        return {
          ok: false,
          error: `Push failed after resolving dependencies: ${retryResponse.reason}`,
        };
      }

      return { ok: false, error: 'Unknown push failure' };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  /**
   * Push an artifact to the transport layer.
   *
   * @param artifact - Artifact to push
   * @returns Transport response
   */
  private async pushArtifactToTransport(
    artifact: OutboxArtifact
  ): Promise<{ ok: true } | { ok: false; reason: 'missing_deps'; missingDeps: string[] }> {
    switch (artifact.artifactType) {
      case 'scope_state':
        return this.transport.pushScopeState({
          scopeStateRef: artifact.artifactId,
          payload: artifact.payload,
        });

      case 'grant':
        return this.transport.pushResourceGrant({
          grantId: artifact.artifactId,
          payload: artifact.payload,
        });

      case 'event':
        // Events are pushed via normal sync, not through sharing transport
        return { ok: true };

      default:
        throw new Error(`Unsupported artifact type: ${artifact.artifactType}`);
    }
  }

  /**
   * Resolve missing dependencies by pushing them first.
   *
   * @param missingDeps - Array of missing dependency IDs
   * @param depth - Current recursion depth
   * @returns true if resolved successfully
   */
  private async resolveMissingDeps(missingDeps: string[], depth: number): Promise<boolean> {
    for (const depId of missingDeps) {
      const depArtifact = await this.outboxStore.loadById(depId);
      if (!depArtifact) {
        // Dependency not in outbox, cannot resolve
        return false;
      }

      // Push the dependency with incremented depth
      const result = await this.pushArtifact(depArtifact, depth);
      if (!result.ok) {
        return false;
      }

      await this.outboxStore.markPushed(depId);
    }

    return true;
  }
}
