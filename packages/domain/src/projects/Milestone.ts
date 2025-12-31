import { Assert } from '../shared/Assert';
import { ChildEntity } from '../shared/ChildEntity';
import { LocalDate } from '../shared/vos/LocalDate';
import { MilestoneId } from './vos/MilestoneId';
import { MilestoneName } from './vos/MilestoneName';

export type MilestoneRecord = Readonly<{
  id: MilestoneId;
  name: MilestoneName;
  targetDate: LocalDate;
}>;

export class Milestone extends ChildEntity<MilestoneId, MilestoneRecord> {
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

  asRecord(): MilestoneRecord {
    return {
      id: this.id,
      name: this._name,
      targetDate: this._targetDate,
    };
  }
}
