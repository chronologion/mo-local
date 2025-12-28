export type IdempotencyRecord = {
  key: string;
  commandType: string;
  aggregateId: string;
  createdAt: number;
};

export interface IdempotencyStorePort {
  get(key: string): Promise<IdempotencyRecord | null>;
  record(record: IdempotencyRecord): Promise<void>;
}
