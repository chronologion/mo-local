export type DomainEventPayload = {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  epoch?: number;
  keyringUpdate?: unknown;
  version: number;
  occurredAt: number;
  actorId: string | null;
  causationId: string | null;
  correlationId: string | null;
};
