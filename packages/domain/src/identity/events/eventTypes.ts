export const identityEventTypes = {
  userRegistered: 'UserRegistered',
} as const;

export type IdentityEventType = (typeof identityEventTypes)[keyof typeof identityEventTypes];
