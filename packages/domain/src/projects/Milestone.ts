import { Assert } from '../shared/Assert';
import { Entity } from '../shared/Entity';
import { LocalDate } from '../shared/vos/LocalDate';
import { MilestoneId } from './vos/MilestoneId';
import { MilestoneName } from './vos/MilestoneName';

export class Milestone extends Entity<MilestoneId> {
  private _name: MilestoneName;
  private _targetDate: LocalDate;

  private constructor(
    id: MilestoneId,
    name: MilestoneName,
    targetDate: LocalDate
  ) {
    super(id);
    this._name = name;
    this._targetDate = targetDate;
  }

  static create(params: {
    id: MilestoneId;
    name: MilestoneName;
    targetDate: LocalDate;
  }): Milestone {
    Assert.that(params.name, 'Milestone name').isDefined();
    return new Milestone(params.id, params.name, params.targetDate);
  }

  get name(): MilestoneName {
    return this._name;
  }

  get targetDate(): LocalDate {
    return this._targetDate;
  }

  changeName(name: MilestoneName): void {
    Assert.that(name, 'Milestone name').isDefined();
    this._name = name;
  }

  changeTargetDate(date: LocalDate): void {
    this._targetDate = date;
  }
}
