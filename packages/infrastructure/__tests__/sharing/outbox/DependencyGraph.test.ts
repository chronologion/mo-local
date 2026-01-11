import { describe, it, expect } from 'vitest';
import { DependencyGraph } from '../../../src/sharing/outbox/DependencyGraph';
import type { OutboxArtifact } from '../../../src/sharing/outbox/OutboxStore';

describe('DependencyGraph', () => {
  const graph = new DependencyGraph();

  const createArtifact = (id: string, dependencies: string[]): OutboxArtifact => ({
    artifactId: id,
    artifactType: 'scope_state',
    payload: '{}',
    dependencies,
    status: 'pending',
    enqueuedAt: Date.now(),
  });

  describe('sort - Basic topological ordering', () => {
    it('should return artifacts in dependency order for linear chain', () => {
      // A -> B -> C
      const artifacts = [createArtifact('C', ['B']), createArtifact('A', []), createArtifact('B', ['A'])];

      const sorted = graph.sort(artifacts);

      expect(sorted.map((a) => a.artifactId)).toEqual(['A', 'B', 'C']);
    });

    it('should handle multiple independent artifacts', () => {
      // A, B, C (no dependencies)
      const artifacts = [createArtifact('C', []), createArtifact('A', []), createArtifact('B', [])];

      const sorted = graph.sort(artifacts);

      // All should be present, order doesn't matter since they're independent
      expect(sorted).toHaveLength(3);
      expect(sorted.map((a) => a.artifactId).sort()).toEqual(['A', 'B', 'C']);
    });

    it('should handle complex dependency graph', () => {
      // A -> C
      // B -> C
      // C -> D
      const artifacts = [
        createArtifact('D', ['C']),
        createArtifact('C', ['A', 'B']),
        createArtifact('B', []),
        createArtifact('A', []),
      ];

      const sorted = graph.sort(artifacts);

      const indices = Object.fromEntries(sorted.map((a, i) => [a.artifactId, i]));

      // A and B must come before C
      expect(indices['A']).toBeLessThan(indices['C']);
      expect(indices['B']).toBeLessThan(indices['C']);
      // C must come before D
      expect(indices['C']).toBeLessThan(indices['D']);
    });

    it('should handle diamond dependency pattern', () => {
      // A -> B -> D
      // A -> C -> D
      const artifacts = [
        createArtifact('D', ['B', 'C']),
        createArtifact('C', ['A']),
        createArtifact('B', ['A']),
        createArtifact('A', []),
      ];

      const sorted = graph.sort(artifacts);

      const indices = Object.fromEntries(sorted.map((a, i) => [a.artifactId, i]));

      // A must come first
      expect(indices['A']).toBe(0);
      // B and C must come before D
      expect(indices['B']).toBeLessThan(indices['D']);
      expect(indices['C']).toBeLessThan(indices['D']);
    });

    it('should return empty array for empty input', () => {
      const sorted = graph.sort([]);

      expect(sorted).toEqual([]);
    });

    it('should handle single artifact with no dependencies', () => {
      const artifacts = [createArtifact('A', [])];

      const sorted = graph.sort(artifacts);

      expect(sorted).toHaveLength(1);
      expect(sorted[0].artifactId).toBe('A');
    });
  });

  describe('sort - Circular dependency detection', () => {
    it('should throw error for simple circular dependency (A -> B -> A)', () => {
      const artifacts = [createArtifact('A', ['B']), createArtifact('B', ['A'])];

      expect(() => graph.sort(artifacts)).toThrow('Circular dependency detected');
    });

    it('should throw error for three-way circular dependency (A -> B -> C -> A)', () => {
      const artifacts = [createArtifact('A', ['B']), createArtifact('B', ['C']), createArtifact('C', ['A'])];

      expect(() => graph.sort(artifacts)).toThrow('Circular dependency detected');
    });

    it('should throw error and include remaining artifact IDs', () => {
      const artifacts = [createArtifact('A', ['B']), createArtifact('B', ['A'])];

      expect(() => graph.sort(artifacts)).toThrow(/A.*B/);
    });
  });

  describe('sort - External dependency validation', () => {
    it('should accept external dependency when it is in pushedArtifactIds', () => {
      // B depends on A, but A is not in pending set (already pushed)
      const artifacts = [createArtifact('B', ['A'])];
      const pushedArtifactIds = new Set(['A']);

      const sorted = graph.sort(artifacts, pushedArtifactIds);

      expect(sorted).toHaveLength(1);
      expect(sorted[0].artifactId).toBe('B');
    });

    it('should throw error when external dependency is neither pending nor pushed', () => {
      // B depends on A, but A is nowhere (not pending, not pushed)
      const artifacts = [createArtifact('B', ['A'])];
      const pushedArtifactIds = new Set<string>();

      expect(() => graph.sort(artifacts, pushedArtifactIds)).toThrow(
        'Artifact B depends on A which is neither pending nor pushed'
      );
    });

    it('should throw error mentioning missing dependency must be resolved', () => {
      const artifacts = [createArtifact('B', ['A'])];
      const pushedArtifactIds = new Set<string>();

      expect(() => graph.sort(artifacts, pushedArtifactIds)).toThrow(
        'This indicates a missing dependency that must be resolved before pushing'
      );
    });

    it('should accept multiple external dependencies when all are pushed', () => {
      // C depends on A and B, both pushed
      const artifacts = [createArtifact('C', ['A', 'B'])];
      const pushedArtifactIds = new Set(['A', 'B']);

      const sorted = graph.sort(artifacts, pushedArtifactIds);

      expect(sorted).toHaveLength(1);
      expect(sorted[0].artifactId).toBe('C');
    });

    it('should handle mixed internal and external dependencies', () => {
      // D depends on B (pending) and C (pushed)
      // B depends on A (pushed)
      const artifacts = [createArtifact('D', ['B', 'C']), createArtifact('B', ['A'])];
      const pushedArtifactIds = new Set(['A', 'C']);

      const sorted = graph.sort(artifacts, pushedArtifactIds);

      expect(sorted.map((a) => a.artifactId)).toEqual(['B', 'D']);
    });

    it('should not validate external dependencies when pushedArtifactIds is undefined', () => {
      // B depends on A, A not in pending set, but no validation because pushedArtifactIds not provided
      const artifacts = [createArtifact('B', ['A'])];

      const sorted = graph.sort(artifacts);

      expect(sorted).toHaveLength(1);
      expect(sorted[0].artifactId).toBe('B');
    });
  });

  describe('getMissingDependencies', () => {
    it('should return empty array when all dependencies are available', () => {
      const artifact = createArtifact('C', ['A', 'B']);
      const availableIds = new Set(['A', 'B', 'C']);

      const missing = graph.getMissingDependencies(artifact, availableIds);

      expect(missing).toEqual([]);
    });

    it('should return missing dependencies', () => {
      const artifact = createArtifact('C', ['A', 'B']);
      const availableIds = new Set(['A', 'C']); // B is missing

      const missing = graph.getMissingDependencies(artifact, availableIds);

      expect(missing).toEqual(['B']);
    });

    it('should return all dependencies when none are available', () => {
      const artifact = createArtifact('C', ['A', 'B']);
      const availableIds = new Set(['C']);

      const missing = graph.getMissingDependencies(artifact, availableIds);

      expect(missing).toEqual(['A', 'B']);
    });

    it('should return empty array when artifact has no dependencies', () => {
      const artifact = createArtifact('A', []);
      const availableIds = new Set(['A']);

      const missing = graph.getMissingDependencies(artifact, availableIds);

      expect(missing).toEqual([]);
    });

    it('should return multiple missing dependencies in order', () => {
      const artifact = createArtifact('D', ['A', 'B', 'C']);
      const availableIds = new Set(['B', 'D']); // A and C missing

      const missing = graph.getMissingDependencies(artifact, availableIds);

      expect(missing).toEqual(['A', 'C']);
    });
  });

  describe('buildDependencyChain', () => {
    it('should build chain for linear dependencies', () => {
      // A -> B -> C
      const artifactMap = new Map<string, OutboxArtifact>([
        ['A', createArtifact('A', [])],
        ['B', createArtifact('B', ['A'])],
        ['C', createArtifact('C', ['B'])],
      ]);

      const chain = graph.buildDependencyChain('C', artifactMap);

      expect(chain).toEqual(['A', 'B', 'C']);
    });

    it('should build chain for branching dependencies', () => {
      // A -> C
      // B -> C
      const artifactMap = new Map<string, OutboxArtifact>([
        ['A', createArtifact('A', [])],
        ['B', createArtifact('B', [])],
        ['C', createArtifact('C', ['A', 'B'])],
      ]);

      const chain = graph.buildDependencyChain('C', artifactMap);

      expect(chain).toContain('A');
      expect(chain).toContain('B');
      expect(chain).toContain('C');
      expect(chain[chain.length - 1]).toBe('C'); // C should be last
    });

    it('should handle shared dependencies (diamond pattern)', () => {
      // A -> B -> D
      // A -> C -> D
      const artifactMap = new Map<string, OutboxArtifact>([
        ['A', createArtifact('A', [])],
        ['B', createArtifact('B', ['A'])],
        ['C', createArtifact('C', ['A'])],
        ['D', createArtifact('D', ['B', 'C'])],
      ]);

      const chain = graph.buildDependencyChain('D', artifactMap);

      // A should appear only once (visited set prevents duplicates)
      expect(chain.filter((id) => id === 'A')).toHaveLength(1);
      // All artifacts should be present
      expect(chain).toContain('A');
      expect(chain).toContain('B');
      expect(chain).toContain('C');
      expect(chain).toContain('D');
      // D should be last
      expect(chain[chain.length - 1]).toBe('D');
      // A should come before B and C
      const aIndex = chain.indexOf('A');
      expect(chain.indexOf('B')).toBeGreaterThan(aIndex);
      expect(chain.indexOf('C')).toBeGreaterThan(aIndex);
    });

    it('should handle single artifact with no dependencies', () => {
      const artifactMap = new Map<string, OutboxArtifact>([['A', createArtifact('A', [])]]);

      const chain = graph.buildDependencyChain('A', artifactMap);

      expect(chain).toEqual(['A']);
    });

    it('should gracefully handle missing artifacts in map', () => {
      // B depends on A, but A not in map
      const artifactMap = new Map<string, OutboxArtifact>([['B', createArtifact('B', ['A'])]]);

      const chain = graph.buildDependencyChain('B', artifactMap);

      // Should only include B (A is missing from map)
      expect(chain).toEqual(['B']);
    });

    it('should return empty array for artifact not in map', () => {
      const artifactMap = new Map<string, OutboxArtifact>([['A', createArtifact('A', [])]]);

      const chain = graph.buildDependencyChain('B', artifactMap);

      expect(chain).toEqual([]);
    });

    it('should handle deep dependency chains', () => {
      // A -> B -> C -> D -> E
      const artifactMap = new Map<string, OutboxArtifact>([
        ['A', createArtifact('A', [])],
        ['B', createArtifact('B', ['A'])],
        ['C', createArtifact('C', ['B'])],
        ['D', createArtifact('D', ['C'])],
        ['E', createArtifact('E', ['D'])],
      ]);

      const chain = graph.buildDependencyChain('E', artifactMap);

      expect(chain).toEqual(['A', 'B', 'C', 'D', 'E']);
    });
  });

  describe('Integration - Real-world scenarios', () => {
    it('should handle ScopeState -> Grant -> Event dependency chain', () => {
      const artifacts = [
        createArtifact('event-1', ['grant-1', 'scope-state-1']),
        createArtifact('grant-1', ['scope-state-1']),
        createArtifact('scope-state-1', []),
      ];

      const sorted = graph.sort(artifacts);

      expect(sorted[0].artifactId).toBe('scope-state-1');
      expect(sorted[1].artifactId).toBe('grant-1');
      expect(sorted[2].artifactId).toBe('event-1');
    });

    it('should handle multiple events depending on same grant', () => {
      const artifacts = [
        createArtifact('event-2', ['grant-1']),
        createArtifact('event-1', ['grant-1']),
        createArtifact('grant-1', ['scope-state-1']),
        createArtifact('scope-state-1', []),
      ];

      const sorted = graph.sort(artifacts);

      // scope-state-1 first, then grant-1, then events (in any order)
      expect(sorted[0].artifactId).toBe('scope-state-1');
      expect(sorted[1].artifactId).toBe('grant-1');
      expect(['event-1', 'event-2']).toContain(sorted[2].artifactId);
      expect(['event-1', 'event-2']).toContain(sorted[3].artifactId);
    });

    it('should handle ScopeState hash chain with external dependencies', () => {
      // scope-state-2 depends on scope-state-1 (already pushed)
      // scope-state-3 depends on scope-state-2 (pending)
      const artifacts = [
        createArtifact('scope-state-3', ['scope-state-2']),
        createArtifact('scope-state-2', ['scope-state-1']),
      ];
      const pushedArtifactIds = new Set(['scope-state-1']);

      const sorted = graph.sort(artifacts, pushedArtifactIds);

      expect(sorted[0].artifactId).toBe('scope-state-2');
      expect(sorted[1].artifactId).toBe('scope-state-3');
    });
  });
});
