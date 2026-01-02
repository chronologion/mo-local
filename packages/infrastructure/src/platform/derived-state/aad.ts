import type { EffectiveCursor } from '@mo/eventstore-core';

const encodeCursor = (cursor: EffectiveCursor): string => `${cursor.globalSequence}:${cursor.pendingCommitSequence}`;

export const buildProjectionCacheAad = (
  projectionId: string,
  scopeKey: string,
  cacheVersion: number,
  cursor: EffectiveCursor
): Uint8Array => {
  const value = `projection:${projectionId}:${scopeKey}:${cacheVersion}:${encodeCursor(cursor)}`;
  return new TextEncoder().encode(value);
};

export const buildIndexArtifactAad = (
  indexId: string,
  scopeKey: string,
  artifactVersion: number,
  cursor: EffectiveCursor
): Uint8Array => {
  const value = `index:${indexId}:${scopeKey}:${artifactVersion}:${encodeCursor(cursor)}`;
  return new TextEncoder().encode(value);
};

export const buildProcessManagerStateAad = (
  processManagerId: string,
  scopeKey: string,
  stateVersion: number,
  cursor: EffectiveCursor
): Uint8Array => {
  const value = `process:${processManagerId}:${scopeKey}:${stateVersion}:${encodeCursor(cursor)}`;
  return new TextEncoder().encode(value);
};
