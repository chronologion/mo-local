export const scopeEventTypes = {
  scopeCreated: 'ScopeCreated',
  scopeMemberAdded: 'ScopeMemberAdded',
  scopeMemberRemoved: 'ScopeMemberRemoved',
  scopeEpochRotated: 'ScopeEpochRotated',
} as const;

export type ScopeEventType = (typeof scopeEventTypes)[keyof typeof scopeEventTypes];

export const resourceGrantEventTypes = {
  resourceGranted: 'ResourceGranted',
  resourceRevoked: 'ResourceRevoked',
} as const;

export type ResourceGrantEventType = (typeof resourceGrantEventTypes)[keyof typeof resourceGrantEventTypes];
