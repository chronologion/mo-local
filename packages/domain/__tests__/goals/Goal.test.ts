import { describe, it, expect } from 'vitest';
import { Goal } from '../../src/goals/Goal';
import { GoalId } from '../../src/goals/GoalId';
import { Slice } from '../../src/goals/Slice';
import { Priority } from '../../src/goals/Priority';
import { Month } from '../../src/goals/Month';
import { Summary } from '../../src/goals/Summary';
import { UserId } from '../../src/identity/UserId';

describe('Goal Aggregate', () => {
  describe('creation', () => {
    it('should create a goal with DSL-style value objects', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Health,
        summary: Summary.of('Run a marathon'),
        targetMonth: Month.now().addMonths(6),
        priority: Priority.Must,
        createdBy: UserId.of('user-123'),
      });

      expect(goal.slice.equals(Slice.Health)).toBe(true);
      expect(goal.summary.value).toBe('Run a marathon');
      expect(goal.priority.isMust()).toBe(true);
      expect(goal.createdBy.value).toBe('user-123');
      expect(goal.isDeleted).toBe(false);
    });

    it('should emit GoalCreated event', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Work,
        summary: Summary.of('Ship v1.0'),
        targetMonth: Month.of(2024, 12),
        priority: Priority.Must,
        createdBy: UserId.of('user-456'),
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
        summary: Summary.of('Learn TypeScript'),
        targetMonth: Month.now(),
        priority: Priority.Should,
        createdBy: UserId.of('user-789'),
      });

      goal.changeSummary(Summary.of('Master TypeScript and DDD'));

      expect(goal.summary.value).toBe('Master TypeScript and DDD');
      expect(goal.getUncommittedEvents()).toHaveLength(2); // Created + SummaryChanged
    });

    it('should throw when changing to same summary', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Learning,
        summary: Summary.of('Learn React'),
        targetMonth: Month.now(),
        priority: Priority.Maybe,
        createdBy: UserId.of('user-999'),
      });

      expect(() => {
        goal.changeSummary(Summary.of('Learn React'));
      }).toThrow();
    });
  });

  describe('changeSlice', () => {
    it('should update slice using value object', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Work,
        summary: Summary.of('Get promoted'),
        targetMonth: Month.now().addMonths(12),
        priority: Priority.Must,
        createdBy: UserId.of('user-abc'),
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
        summary: Summary.of('Daily meditation'),
        targetMonth: Month.now(),
        priority: Priority.Maybe,
        createdBy: UserId.of('user-def'),
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
        summary: Summary.of('Plan family vacation'),
        targetMonth: Month.of(2024, 6),
        priority: Priority.Should,
        createdBy: UserId.of('user-ghi'),
      });

      const newTarget = Month.of(2024, 6).addMonths(3);
      goal.changeTargetMonth(newTarget);

      expect(goal.targetMonth.year).toBe(2024);
      expect(goal.targetMonth.month).toBe(9);
    });
  });

  describe('delete', () => {
    it('should mark goal as deleted', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Leisure,
        summary: Summary.of('Read 50 books'),
        targetMonth: Month.of(2024, 12),
        priority: Priority.Maybe,
        createdBy: UserId.of('user-jkl'),
      });

      goal.delete();

      expect(goal.isDeleted).toBe(true);
      expect(goal.deletedAt).not.toBeNull();
    });

    it('should prevent operations after deletion', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Money,
        summary: Summary.of('Save $10k'),
        targetMonth: Month.now(),
        priority: Priority.Must,
        createdBy: UserId.of('user-mno'),
      });

      goal.delete();

      expect(() => {
        goal.changeSummary(Summary.of('Save $20k'));
      }).toThrow();
    });
  });

  describe('access control', () => {
    it('should grant access with UserId value object', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Work,
        summary: Summary.of('Team OKRs'),
        targetMonth: Month.now(),
        priority: Priority.Must,
        createdBy: UserId.of('owner-123'),
      });

      goal.grantAccess(UserId.of('collaborator-456'), 'edit');

      expect(goal.accessList).toHaveLength(1);
      expect(goal.accessList[0].userId.value).toBe('collaborator-456');
      expect(goal.accessList[0].permission).toBe('edit');
      expect(goal.accessList[0].isActive).toBe(true);
    });

    it('should revoke access', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Learning,
        summary: Summary.of('Shared learning goals'),
        targetMonth: Month.now(),
        priority: Priority.Should,
        createdBy: UserId.of('owner-789'),
      });

      const collaboratorId = UserId.of('collaborator-999');
      goal.grantAccess(collaboratorId, 'view');
      goal.revokeAccess(collaboratorId);

      expect(goal.accessList[0].isActive).toBe(false);
      expect(goal.accessList[0].revokedAt).not.toBeNull();
    });

    it('should prevent duplicate access grants', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Mindfulness,
        summary: Summary.of('Meditation practice'),
        targetMonth: Month.now(),
        priority: Priority.Maybe,
        createdBy: UserId.of('owner-aaa'),
      });

      const userId = UserId.of('collaborator-bbb');
      goal.grantAccess(userId, 'view');

      expect(() => {
        goal.grantAccess(userId, 'edit');
      }).toThrow();
    });
  });

  describe('event sourcing', () => {
    it('should accumulate uncommitted events', () => {
      const goal = Goal.create({
        id: GoalId.create(),
        slice: Slice.Health,
        summary: Summary.of('Fitness journey'),
        targetMonth: Month.now().addMonths(3),
        priority: Priority.Should,
        createdBy: UserId.of('user-ccc'),
      });

      goal.changeSummary(Summary.of('Ultimate fitness journey'));
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
        summary: Summary.of('Weekly date nights'),
        targetMonth: Month.now(),
        priority: Priority.Must,
        createdBy: UserId.of('user-ddd'),
      });

      const initialVersion = goal.version;
      goal.changeSummary(Summary.of('Bi-weekly date nights'));

      expect(goal.version).toBe(initialVersion + 1);
    });
  });
});
