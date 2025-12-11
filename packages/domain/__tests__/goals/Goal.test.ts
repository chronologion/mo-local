import { describe, it, expect } from 'vitest';
import { Goal } from '../../src/goals/Goal';
import { GoalId } from '../../src/goals/vos/GoalId';
import { Slice } from '../../src/goals/Slice';
import { Priority } from '../../src/goals/vos/Priority';
import { Month } from '../../src/goals/vos/Month';
import { Summary } from '../../src/goals/vos/Summary';
import { UserId } from '../../src/identity/UserId';
import { Permission } from '../../src/goals/vos/Permission';

describe('Goal Aggregate', () => {
  describe('creation', () => {
    it('should create a goal with DSL-style value objects', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Health,
        summary: Summary.from('Run a marathon'),
        targetMonth: Month.now().addMonths(6),
        priority: Priority.Must,
        createdBy: UserId.from('user-123'),
      });

      expect(goal.slice.equals(Slice.Health)).toBe(true);
      expect(goal.summary.value).toBe('Run a marathon');
      expect(goal.priority.isMust()).toBe(true);
      expect(goal.createdBy.value).toBe('user-123');
      expect(goal.isArchived).toBe(false);
    });

    it('should emit GoalCreated event', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Work,
        summary: Summary.from('Ship v1.0'),
        targetMonth: Month.from('2024-12'),
        priority: Priority.Must,
        createdBy: UserId.from('user-456'),
      });

      const events = goal.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('GoalCreated');
    });
  });

  describe('changeSummary', () => {
    it('should update summary with value object', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Learning,
        summary: Summary.from('Learn TypeScript'),
        targetMonth: Month.now(),
        priority: Priority.Should,
        createdBy: UserId.from('user-789'),
      });

      goal.changeSummary(Summary.from('Master TypeScript and DDD'));

      expect(goal.summary.value).toBe('Master TypeScript and DDD');
      expect(goal.getUncommittedEvents()).toHaveLength(2); // Created + SummaryChanged
    });

    it('should throw when changing to same summary', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Learning,
        summary: Summary.from('Learn React'),
        targetMonth: Month.now(),
        priority: Priority.Maybe,
        createdBy: UserId.from('user-999'),
      });

      expect(() => {
        goal.changeSummary(Summary.from('Learn React'));
      }).toThrow();
    });
  });

  describe('changeSlice', () => {
    it('should update slice using value object', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Work,
        summary: Summary.from('Get promoted'),
        targetMonth: Month.now().addMonths(12),
        priority: Priority.Must,
        createdBy: UserId.from('user-abc'),
      });

      goal.changeSlice(Slice.Learning);

      expect(goal.slice.equals(Slice.Learning)).toBe(true);
    });
  });

  describe('changePriority', () => {
    it('should demonstrate fluent priority API', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Health,
        summary: Summary.from('Daily meditation'),
        targetMonth: Month.now(),
        priority: Priority.Maybe,
        createdBy: UserId.from('user-def'),
      });

      goal.changePriority(Priority.Must);

      expect(goal.priority.isMust()).toBe(true);
      expect(goal.priority.isHigherThan(Priority.Should)).toBe(true);
    });
  });

  describe('changeTargetMonth', () => {
    it('should use Month value object arithmetic', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Family,
        summary: Summary.from('Plan family vacation'),
        targetMonth: Month.from('2024-06'),
        priority: Priority.Should,
        createdBy: UserId.from('user-ghi'),
      });

      const newTarget = Month.from('2024-06').addMonths(3);
      goal.changeTargetMonth(newTarget);

      expect(goal.targetMonth.year).toBe(2024);
      expect(goal.targetMonth.month).toBe(9);
    });
  });

  describe('archive', () => {
    it('should mark goal as archived', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Leisure,
        summary: Summary.from('Read 50 books'),
        targetMonth: Month.from('2024-12'),
        priority: Priority.Maybe,
        createdBy: UserId.from('user-jkl'),
      });

      goal.archive();

      expect(goal.isArchived).toBe(true);
      expect(goal.archivedAt).not.toBeNull();
    });

    it('should prevent operations after archival', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Money,
        summary: Summary.from('Save $10k'),
        targetMonth: Month.now(),
        priority: Priority.Must,
        createdBy: UserId.from('user-mno'),
      });

      goal.archive();

      expect(() => {
        goal.changeSummary(Summary.from('Save $20k'));
      }).toThrow();
    });
  });

  describe('access control', () => {
    it('should grant access with UserId value object', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Work,
        summary: Summary.from('Team OKRs'),
        targetMonth: Month.now(),
        priority: Priority.Must,
        createdBy: UserId.from('owner-123'),
      });

      goal.grantAccess(
        UserId.from('collaborator-456'),
        Permission.from('edit')
      );

      expect(goal.accessList).toHaveLength(1);
      expect(goal.accessList[0].userId.value).toBe('collaborator-456');
      expect(goal.accessList[0].permission.value).toBe('edit');
      expect(goal.accessList[0].isActive).toBe(true);
    });

    it('should revoke access', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Learning,
        summary: Summary.from('Shared learning goals'),
        targetMonth: Month.now(),
        priority: Priority.Should,
        createdBy: UserId.from('owner-789'),
      });

      const collaboratorId = UserId.from('collaborator-999');
      goal.grantAccess(collaboratorId, Permission.from('view'));
      goal.revokeAccess(collaboratorId);

      expect(goal.accessList[0].isActive).toBe(false);
      expect(goal.accessList[0].revokedAt).not.toBeNull();
    });

    it('should prevent duplicate access grants', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Mindfulness,
        summary: Summary.from('Meditation practice'),
        targetMonth: Month.now(),
        priority: Priority.Maybe,
        createdBy: UserId.from('owner-aaa'),
      });

      const userId = UserId.from('collaborator-bbb');
      goal.grantAccess(userId, Permission.from('view'));

      expect(() => {
        goal.grantAccess(userId, Permission.from('edit'));
      }).toThrow();
    });
  });

  describe('event sourcing', () => {
    it('should accumulate uncommitted events', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Health,
        summary: Summary.from('Fitness journey'),
        targetMonth: Month.now().addMonths(3),
        priority: Priority.Should,
        createdBy: UserId.from('user-ccc'),
      });

      goal.changeSummary(Summary.from('Ultimate fitness journey'));
      goal.changePriority(Priority.Must);

      const events = goal.getUncommittedEvents();
      expect(events).toHaveLength(3); // Created + SummaryChanged + PriorityChanged
      expect(events[0].eventType).toBe('GoalCreated');
      expect(events[1].eventType).toBe('GoalSummaryChanged');
      expect(events[2].eventType).toBe('GoalPriorityChanged');
    });

    it('should increment version with each event', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Relationships,
        summary: Summary.from('Weekly date nights'),
        targetMonth: Month.now(),
        priority: Priority.Must,
        createdBy: UserId.from('user-ddd'),
      });

      const initialVersion = goal.version;
      goal.changeSummary(Summary.from('Bi-weekly date nights'));

      expect(goal.version).toBe(initialVersion + 1);
    });
  });
});
