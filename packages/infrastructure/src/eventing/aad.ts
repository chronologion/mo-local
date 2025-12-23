export const buildEventAad = (
  aggregateId: string,
  eventType: string,
  version: number
): Uint8Array => {
  const value = `${aggregateId}:${eventType}:${version}`;
  return new TextEncoder().encode(value);
};
