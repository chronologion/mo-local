export type IdempotencyRecord = {
  key: string;
  commandType: string;
  aggregateId: string;
  createdAt: number;
};

export interface IIdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  record(record: IdempotencyRecord): Promise<void>;
}
