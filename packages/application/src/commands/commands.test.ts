import { describe, expect, it } from 'vitest';
import { validateCreateGoalCommand } from './CreateGoalCommand';
import { validateChangeGoalSummaryCommand } from './ChangeGoalSummaryCommand';
import { validateGrantGoalAccessCommand } from './GrantGoalAccessCommand';
import { validateRegisterUserCommand } from './RegisterUserCommand';
import { validateImportUserKeysCommand } from './ImportUserKeysCommand';
import { KeyBackup } from '../ports/types';

const now = Date.now();

describe('CreateGoalCommand validation', () => {
  it('validates a correct command', () => {
    const result = validateCreateGoalCommand({
      type: 'CreateGoal',
      goalId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f001',
      slice: 'Health',
      summary: 'Run a marathon',
      targetMonth: '2025-12',
      priority: 'must',
      userId: 'user-1',
      timestamp: now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.goalId.value).toBe(
        '018f7b1a-7c8a-72c4-a0ab-8234c2d6f001'
      );
      expect(result.value.slice.value).toBe('Health');
      expect(result.value.priority.level).toBe('must');
    }
  });

  it('accumulates validation errors', () => {
    const result = validateCreateGoalCommand({
      type: 'CreateGoal',
      goalId: 'not-a-uuid',
      slice: 'BadSlice' as never,
      summary: '',
      targetMonth: 'bad',
      priority: 'must',
      userId: '',
      timestamp: Number.NaN,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain('goalId');
      expect(fields).toContain('slice');
      expect(fields).toContain('summary');
      expect(fields).toContain('targetMonth');
      expect(fields).toContain('userId');
      expect(fields).toContain('timestamp');
    }
  });
});

describe('ChangeGoalSummaryCommand validation', () => {
  it('requires non-empty summary', () => {
    const result = validateChangeGoalSummaryCommand({
      type: 'ChangeGoalSummary',
      goalId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f002',
      summary: '',
      userId: 'user-1',
      timestamp: now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'summary')).toBe(true);
    }
  });
});

describe('GrantGoalAccessCommand validation', () => {
  it('rejects invalid permission', () => {
    const result = validateGrantGoalAccessCommand({
      type: 'GrantGoalAccess',
      goalId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f003',
      grantToUserId: 'user-2',
      permission: 'owner' as never,
      userId: 'user-1',
      timestamp: now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'permission')).toBe(true);
    }
  });
});

describe('RegisterUserCommand validation', () => {
  it('ensures public keys are present', () => {
    const result = validateRegisterUserCommand({
      type: 'RegisterUser',
      userId: 'user-1',
      signingPublicKey: new Uint8Array(),
      encryptionPublicKey: new Uint8Array([1, 2]),
      timestamp: now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'signingPublicKey')).toBe(
        true
      );
    }
  });
});

describe('ImportUserKeysCommand validation', () => {
  it('validates backup contents', () => {
    const backup: KeyBackup = {
      userId: 'user-1',
      identityKeys: {
        signingPrivateKey: new Uint8Array(),
        signingPublicKey: new Uint8Array([1]),
        encryptionPrivateKey: new Uint8Array([1]),
        encryptionPublicKey: new Uint8Array([1]),
      },
      aggregateKeys: {
        goal: new Uint8Array(),
      },
    };

    const result = validateImportUserKeysCommand({
      type: 'ImportUserKeys',
      userId: 'user-1',
      backup,
      timestamp: now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain('backup.signingPrivateKey');
      expect(fields).toContain('backup.aggregateKeys.goal');
    }
  });
});
