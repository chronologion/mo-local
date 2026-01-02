import { migrations } from './migrations';

export function upcastPayload(type: string, version: number, payload: unknown): unknown {
  const plan = migrations[type];
  if (!plan) return payload;

  if (version > plan.latestVersion) {
    throw new Error(`${type}: future version v${version}`);
  }

  let currentVersion = version;
  let currentPayload: unknown = payload;
  while (currentVersion < plan.latestVersion) {
    const step = plan.steps[currentVersion];
    if (!step) {
      throw new Error(`${type}: missing migration v${currentVersion} -> v${currentVersion + 1}`);
    }
    currentPayload = step(currentPayload);
    currentVersion += 1;
  }
  return currentPayload;
}
