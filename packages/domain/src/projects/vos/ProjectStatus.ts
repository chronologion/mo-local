import { Assert } from '../../shared/Assert';
import { ValueObject } from '../../shared/vos/ValueObject';

export const projectStatusValues = ['planned', 'in_progress', 'completed', 'canceled'] as const;
export type ProjectStatusValue = (typeof projectStatusValues)[number];

export class ProjectStatus extends ValueObject<ProjectStatusValue> {
  private constructor(private readonly _value: ProjectStatusValue) {
    super();
  }

  static from(value: string): ProjectStatus {
    Assert.that(value, 'ProjectStatus').isOneOf(projectStatusValues);
    return new ProjectStatus(value as ProjectStatusValue);
  }

  static Planned = new ProjectStatus('planned');
  static InProgress = new ProjectStatus('in_progress');
  static Completed = new ProjectStatus('completed');
  static Canceled = new ProjectStatus('canceled');

  get value(): ProjectStatusValue {
    return this._value;
  }

  isTerminal(): boolean {
    return this._value === 'completed' || this._value === 'canceled';
  }
}
