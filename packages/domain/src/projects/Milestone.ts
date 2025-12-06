import { Assert } from '../shared/Assert';
import { Entity } from '../shared/Entity';
import { LocalDate } from '../shared/LocalDate';
import { MilestoneId } from './MilestoneId';

export class Milestone extends Entity<MilestoneId> {
  private _name: string;
  private _targetDate: LocalDate;

  private constructor(id: MilestoneId, name: string, targetDate: LocalDate) {
    super(id);
    this._name = name;
    this._targetDate = targetDate;
  }

  static create(params: {
    id: MilestoneId;
    name: string;
    targetDate: LocalDate;
  }): Milestone {
    Assert.that(params.name.trim(), 'Milestone name').isNonEmpty();
    return new Milestone(params.id, params.name, params.targetDate);
  }

  get name(): string {
    return this._name;
  }

  get targetDate(): LocalDate {
    return this._targetDate;
  }

  changeName(name: string): void {
    Assert.that(name.trim(), 'Milestone name').isNonEmpty();
    this._name = name;
  }

  changeTargetDate(date: LocalDate): void {
    this._targetDate = date;
  }
}
