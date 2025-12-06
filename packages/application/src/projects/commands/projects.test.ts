import { describe, expect, it } from 'vitest';
import { validateCreateProjectCommand } from './CreateProjectCommand';
import { validateChangeProjectStatusCommand } from './ChangeProjectStatusCommand';
import { validateAddProjectMilestoneCommand } from './AddProjectMilestoneCommand';
import { validateArchiveProjectCommand } from './ArchiveProjectCommand';

const now = Date.now();

describe('Projects command validation', () => {
  it('validates create project command', () => {
    const result = validateCreateProjectCommand({
      type: 'CreateProject',
      projectId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f101',
      name: 'Project Alpha',
      status: 'planned',
      startDate: '2025-01-01',
      targetDate: '2025-02-01',
      description: 'Description',
      goalId: null,
      userId: 'user-1',
      timestamp: now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectId.value).toBe(
        '018f7b1a-7c8a-72c4-a0ab-8234c2d6f101'
      );
      expect(result.value.name.value).toBe('Project Alpha');
      expect(result.value.status.value).toBe('planned');
      expect(result.value.goalId).toBeNull();
    }
  });

  it('accumulates validation errors on create project', () => {
    const result = validateCreateProjectCommand({
      type: 'CreateProject',
      projectId: 'bad-id',
      name: '',
      status: 'invalid' as never,
      startDate: 'bad',
      targetDate: 'bad',
      description: 'ok',
      goalId: 'also-bad',
      userId: '',
      timestamp: Number.NaN,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain('projectId');
      expect(fields).toContain('name');
      expect(fields).toContain('status');
      expect(fields).toContain('startDate');
      expect(fields).toContain('targetDate');
      expect(fields).toContain('goalId');
      expect(fields).toContain('userId');
      expect(fields).toContain('timestamp');
    }
  });

  it('validates status change', () => {
    const result = validateChangeProjectStatusCommand({
      type: 'ChangeProjectStatus',
      projectId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f102',
      status: 'in_progress',
      userId: 'user-1',
      timestamp: now,
    });

    expect(result.ok).toBe(true);
  });

  it('rejects missing milestone name', () => {
    const result = validateAddProjectMilestoneCommand({
      type: 'AddProjectMilestone',
      projectId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f103',
      milestoneId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f104',
      name: '',
      targetDate: '2025-01-02',
      userId: 'user-1',
      timestamp: now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'name')).toBe(true);
    }
  });

  it('validates archive project', () => {
    const result = validateArchiveProjectCommand({
      type: 'ArchiveProject',
      projectId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f105',
      userId: 'user-1',
      timestamp: now,
    });

    expect(result.ok).toBe(true);
  });
});
