export interface Repository<TAggregate, TId> {
  load(id: TId): Promise<TAggregate | null>;

  save(aggregate: TAggregate, encryptionKey: Uint8Array): Promise<void>;
}
