import { Assert } from '../shared/Assert';

export const projectStatusValues = [
  'planned',
  'in_progress',
  'completed',
  'canceled',
] as const;
export type ProjectStatusValue = (typeof projectStatusValues)[number];

export class ProjectStatus {
  private constructor(private readonly _value: ProjectStatusValue) {}

  static of(value: ProjectStatusValue): ProjectStatus {
    Assert.that(value, 'ProjectStatus').isOneOf(projectStatusValues);
    return new ProjectStatus(value);
  }

  static Planned = new ProjectStatus('planned');
  static InProgress = new ProjectStatus('in_progress');
  static Completed = new ProjectStatus('completed');
  static Canceled = new ProjectStatus('canceled');

  get value(): ProjectStatusValue {
    return this._value;
  }

  equals(other: ProjectStatus): boolean {
    return this._value === other._value;
  }

  isTerminal(): boolean {
    return this._value === 'completed' || this._value === 'canceled';
  }
}
