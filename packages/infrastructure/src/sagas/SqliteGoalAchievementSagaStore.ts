import type {
  CryptoServicePort,
  GoalAchievementState,
  GoalAchievementCursor,
  GoalAchievementStorePort,
  KeyStorePort,
  ProjectAchievementState,
} from '@mo/application';
import { ZERO_EFFECTIVE_CURSOR } from '@mo/eventstore-core';
import { buildProcessManagerStateAad, ProcessManagerStateStore } from '../platform/derived-state';

const PROCESS_MANAGER_ID = 'goal_achievement';
const PROCESS_MANAGER_KEY_ID = 'process_manager:goal_achievement';
const STATE_VERSION = 1;

const goalScope = (goalId: string): string => `goal:${goalId}`;
const projectScope = (projectId: string): string => `project:${projectId}`;

const serializeState = (state: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(state));

const parseJson = <T>(value: Uint8Array): T => {
  const decoded = new TextDecoder().decode(value);
  return JSON.parse(decoded) as T;
};

export class SqliteGoalAchievementSagaStore implements GoalAchievementStorePort {
  constructor(
    private readonly store: ProcessManagerStateStore,
    private readonly crypto: CryptoServicePort,
    private readonly keyStore: KeyStorePort
  ) {}

  async getGoalState(goalId: string): Promise<GoalAchievementState | null> {
    return this.loadState<GoalAchievementState>(goalScope(goalId));
  }

  async saveGoalState(state: GoalAchievementState, cursor?: GoalAchievementCursor): Promise<void> {
    await this.saveState(goalScope(state.goalId), state, cursor);
  }

  async getProjectState(projectId: string): Promise<ProjectAchievementState | null> {
    return this.loadState<ProjectAchievementState>(projectScope(projectId));
  }

  async saveProjectState(state: ProjectAchievementState, cursor?: GoalAchievementCursor): Promise<void> {
    await this.saveState(projectScope(state.projectId), state, cursor);
  }

  async removeProjectState(projectId: string): Promise<void> {
    await this.store.remove(PROCESS_MANAGER_ID, projectScope(projectId));
  }

  async resetAll(): Promise<void> {
    await this.store.removeAll(PROCESS_MANAGER_ID);
  }

  private async loadState<T>(scopeKey: string): Promise<T | null> {
    const row = await this.store.get(PROCESS_MANAGER_ID, scopeKey);
    if (!row) return null;
    const key = await this.ensureProcessManagerKey();
    const aad = buildProcessManagerStateAad(PROCESS_MANAGER_ID, scopeKey, row.stateVersion, row.lastEffectiveCursor);
    try {
      const plaintext = await this.crypto.decrypt(row.stateEncrypted, key, aad);
      return parseJson<T>(plaintext);
    } catch {
      await this.store.remove(PROCESS_MANAGER_ID, scopeKey);
      return null;
    }
  }

  private async saveState<T>(scopeKey: string, state: T, cursor?: GoalAchievementCursor): Promise<void> {
    const key = await this.ensureProcessManagerKey();
    const effectiveCursor = cursor ?? ZERO_EFFECTIVE_CURSOR;
    const aad = buildProcessManagerStateAad(PROCESS_MANAGER_ID, scopeKey, STATE_VERSION, effectiveCursor);
    const cipher = await this.crypto.encrypt(serializeState(state), key, aad);
    await this.store.put({
      processManagerId: PROCESS_MANAGER_ID,
      scopeKey,
      stateVersion: STATE_VERSION,
      stateEncrypted: cipher,
      lastEffectiveCursor: effectiveCursor,
      updatedAt: Date.now(),
    });
  }

  private async ensureProcessManagerKey(): Promise<Uint8Array> {
    const existing = await this.keyStore.getAggregateKey(PROCESS_MANAGER_KEY_ID);
    if (existing) return existing;
    const generated = await this.crypto.generateKey();
    await this.keyStore.saveAggregateKey(PROCESS_MANAGER_KEY_ID, generated);
    return generated;
  }
}
