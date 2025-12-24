import { Option } from './Option';

export interface Repository<TAggregate, TId> {
  load(id: TId): Promise<Option<TAggregate>>;

  save(aggregate: TAggregate, encryptionKey: Uint8Array): Promise<void>;
}
