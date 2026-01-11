import type { OutboxArtifact } from './OutboxStore';

/**
 * DependencyGraph performs topological sort of artifacts based on dependencies.
 *
 * **Purpose:**
 * - Order artifacts so dependencies are pushed before dependents
 * - Detect circular dependencies
 * - Support partial ordering when some artifacts are already pushed
 *
 * **Algorithm:** Kahn's algorithm for topological sort
 */
export class DependencyGraph {
  /**
   * Sort artifacts in topological order (dependencies before dependents).
   *
   * @param artifacts - Artifacts to sort
   * @param pushedArtifactIds - Set of artifact IDs that have already been pushed
   * @returns Sorted artifacts
   * @throws {Error} if circular dependency detected or external dependencies are missing
   */
  sort(artifacts: OutboxArtifact[], pushedArtifactIds?: Set<string>): OutboxArtifact[] {
    const artifactMap = new Map(artifacts.map((a) => [a.artifactId, a]));
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, Set<string>>();

    // Initialize data structures
    for (const artifact of artifacts) {
      inDegree.set(artifact.artifactId, 0);
      adjList.set(artifact.artifactId, new Set());
    }

    // Build adjacency list and calculate in-degrees
    for (const artifact of artifacts) {
      for (const depId of artifact.dependencies) {
        // Track dependencies that are in the current artifact set
        if (artifactMap.has(depId)) {
          adjList.get(depId)!.add(artifact.artifactId);
          inDegree.set(artifact.artifactId, (inDegree.get(artifact.artifactId) ?? 0) + 1);
        } else if (pushedArtifactIds && !pushedArtifactIds.has(depId)) {
          // External dependency not in pending set and not already pushed
          throw new Error(
            `Artifact ${artifact.artifactId} depends on ${depId} which is neither pending nor pushed. ` +
              `This indicates a missing dependency that must be resolved before pushing.`
          );
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    const result: OutboxArtifact[] = [];

    // Start with artifacts that have no dependencies
    for (const [id, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const artifact = artifactMap.get(currentId)!;
      result.push(artifact);

      // Reduce in-degree for dependents
      for (const dependentId of adjList.get(currentId) ?? []) {
        const newDegree = (inDegree.get(dependentId) ?? 0) - 1;
        inDegree.set(dependentId, newDegree);

        if (newDegree === 0) {
          queue.push(dependentId);
        }
      }
    }

    // Check for circular dependencies
    if (result.length !== artifacts.length) {
      const remaining = artifacts.filter((a) => !result.includes(a));
      throw new Error(`Circular dependency detected in artifacts: ${remaining.map((a) => a.artifactId).join(', ')}`);
    }

    return result;
  }

  /**
   * Extract missing dependency IDs from an artifact.
   *
   * Given an artifact and the set of available artifact IDs,
   * returns the subset of dependencies that are missing.
   *
   * @param artifact - Artifact to check
   * @param availableIds - Set of available artifact IDs
   * @returns Array of missing dependency IDs
   */
  getMissingDependencies(artifact: OutboxArtifact, availableIds: Set<string>): string[] {
    return artifact.dependencies.filter((depId) => !availableIds.has(depId));
  }

  /**
   * Build a dependency chain from an artifact to its transitive dependencies.
   *
   * @param artifactId - Starting artifact
   * @param artifactMap - Map of all artifacts
   * @returns Array of artifact IDs in dependency order (dependencies first)
   */
  buildDependencyChain(artifactId: string, artifactMap: Map<string, OutboxArtifact>): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);

      const artifact = artifactMap.get(id);
      if (!artifact) return;

      // Visit dependencies first (post-order traversal)
      for (const depId of artifact.dependencies) {
        visit(depId);
      }

      result.push(id);
    };

    visit(artifactId);
    return result;
  }
}
